// =============================================================
//  Scores en boxart op de achtergrond ophalen
// =============================================================
// Zoekt voor elke game zonder (actuele) informatie de Wikipedia-pagina en
// bewaart de kern (score, boxart-link, genre, …) in de collectie gameInfo.
// Dat is een aparte collectie met hetzelfde id als de game, zodat het
// ophalen nooit je eigen wijzigingen aan een game kan overschrijven.
//
// gameInfo: { id (= game-id), createdAt, updatedAt, query (titel waarmee
//   gezocht is), pinned (zelf gekozen pagina), found, fetchedAt,
//   pageid, title, qid, nlTitle, description, image, release, facts,
//   metacritic: [{ score, platform }], gamerankings: [{ score, platform }] }

import { findCandidates, findPage, loadCore } from './gameinfo.js';
import { alive, findById } from './core/records.js';

const CONCURRENCY = 3;
const FLUSH_EVERY = 10; // zoveel games per opslag (elke opslag = opnieuw versleutelen)
const FLUSH_MS = 5000;
const RETRY_NOT_FOUND_MS = 30 * 86_400_000;
const MAX_FAILURES = 5; // daarna stoppen (bijvoorbeeld offline); later opnieuw

export const progress = { active: false, done: 0, total: 0 };
let listener = null;
let running = false;
let generation = 0;

/** Wordt aangeroepen bij elke stap, voor de voortgangsregel in de lijst. */
export function onProgress(fn) { listener = fn; }

/** Velden om te bewaren uit wat loadCore() teruggeeft. */
export function toStored(core, query, pinned) {
  return {
    query, pinned: Boolean(pinned), found: true, fetchedAt: Date.now(),
    pageid: core.pageid, title: core.title, qid: core.qid, nlTitle: core.nlTitle,
    description: core.description, image: core.image, release: core.release,
    facts: core.facts, metacritic: core.metacritic, gamerankings: core.gamerankings,
  };
}

export const notFound = (query) => ({ query, pinned: false, found: false, fetchedAt: Date.now() });

/** Is de bewaarde informatie (behalve het tijdstip) anders dan de nieuwe? */
export function infoChanged(old, fresh) {
  if (!old) return true;
  const strip = ({ id, createdAt, updatedAt, fetchedAt, ...rest }) => JSON.stringify(rest);
  return strip(old) !== strip(fresh);
}

/** Voegt informatie toe of vervangt die (muteert, binnen ctx.update). */
export function putInfo(d, id, fields) {
  d.gameInfo ??= [];
  const now = Date.now();
  const i = d.gameInfo.findIndex((r) => r.id === id);
  const rec = { id, createdAt: i >= 0 ? (d.gameInfo[i].createdAt || now) : now, updatedAt: now, ...fields };
  if (i >= 0) d.gameInfo[i] = rec;
  else d.gameInfo.push(rec);
}

export function needsInfo(game, info) {
  if (!info) return true;
  if (info.pinned) return false; // zelf gekozen: niet meer automatisch wijzigen
  if (info.query !== game.title) return true; // titel is aangepast
  if (!info.found) return Date.now() - (info.fetchedAt || 0) > RETRY_NOT_FOUND_MS;
  return false;
}

/** Beste kandidaat, maar alleen als het echt om een game lijkt te gaan. */
export const bestCandidate = (list) => list.find((c) => c.game && c.score >= 5.5) || null;

/** Start het ophalen als er iets te doen is (doet niets als het al loopt). */
export function startEnrich(ctx, schema) {
  if (running || !navigator.onLine) return;
  const data = ctx.data;
  if (!data || (data.schema || 0) > schema) return; // app moet eerst bijgewerkt worden
  const infos = new Map(alive(data.gameInfo).map((r) => [r.id, r]));
  const queue = alive(data.games).filter((g) => needsInfo(g, infos.get(g.id)));
  if (!queue.length) return;

  running = true;
  const mine = ++generation;
  Object.assign(progress, { active: true, done: 0, total: queue.length });
  listener?.();

  const pending = [];
  let lastFlush = Date.now();
  let failures = 0;

  const flush = async () => {
    if (!pending.length) return;
    const batch = pending.splice(0);
    lastFlush = Date.now();
    await ctx.update((d) => {
      for (const [id, fields] of batch) {
        const current = findById(d.gameInfo, id);
        if (current?.pinned) continue; // intussen zelf een pagina gekozen
        if (findById(d.games, id)) putInfo(d, id, fields);
      }
    });
  };

  const worker = async () => {
    while (queue.length && mine === generation) {
      const g = queue.shift();
      try {
        const want = infos.get(g.id)?.want;
        const best = want ? await findPage(want) : bestCandidate(await findCandidates(g));
        pending.push([g.id, best ? toStored(await loadCore(best), g.title, Boolean(want)) : notFound(g.title)]);
        failures = 0;
      } catch {
        failures += 1;
        if (failures >= MAX_FAILURES || !navigator.onLine) generation += 1; // stoppen, later opnieuw
      }
      progress.done += 1;
      listener?.();
      if (pending.length >= FLUSH_EVERY || Date.now() - lastFlush > FLUSH_MS) await flush();
    }
  };

  Promise.all(Array.from({ length: CONCURRENCY }, worker))
    .then(flush)
    .catch(() => {})
    .finally(() => {
      running = false;
      progress.active = false;
      listener?.();
    });
}

/** Stoppen, bijvoorbeeld bij vergrendelen. */
export function stopEnrich() {
  generation += 1;
}
