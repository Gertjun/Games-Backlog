// =============================================================
//  Game-informatie van Wikipedia en Wikidata
// =============================================================
// Gratis, zonder API-sleutel. Alleen de titel (en het jaar) van de game
// gaat naar Wikipedia; er wordt niets uit de kluis meegestuurd.
// Resultaten worden alleen in het geheugen bewaard (deze sessie), niet
// opgeslagen buiten de kluis.
//
//   findCandidates(game)   → mogelijke Wikipedia-pagina's, beste eerst
//   findPage(title)        → één vaste pagina op titel
//   lookupInput(text)      → zelf ingevoerde link of titel → pagina's
//   loadDetails(candidate) → boxart, samenvatting, genre, Metacritic, …

const WIKI = (lang) => `https://${lang}.wikipedia.org/w/api.php`;
export const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const IMAGE_HOST = 'https://upload.wikimedia.org/';
const TIMEOUT_MS = 15_000;

// Wikidata-eigenschappen die we tonen
const P = {
  genre: 'P136', developer: 'P178', publisher: 'P123', modes: 'P404',
  series: 'P179', director: 'P57', composer: 'P86',
  released: 'P577', review: 'P444', reviewBy: 'P447', platform: 'P400',
};

const candidateCache = new Map(); // zoekterm → Promise<candidates>
const detailCache = new Map(); // pageid → Promise<details>

/* ---------- Hulpfuncties ---------- */

export async function api(base, params, signal) {
  const url = new URL(base);
  url.search = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.info || 'API-fout');
  return json;
}

/** Combineert het signaal van de aanroeper met een time-out. */
export function withTimeout(signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('Time-out', 'TimeoutError')), TIMEOUT_MS);
  signal?.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true });
  ctrl.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

/** Eén keer laden per sleutel; bij een fout mag het later opnieuw. */
function cached(map, key, load) {
  if (!map.has(key)) {
    const p = load();
    map.set(key, p);
    p.catch(() => map.delete(key));
  }
  return map.get(key);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\([^)]*\)/g, '').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();

const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 1));

const NOT_A_GAME = /series|franchise|character|list of|company|developer|publisher|console|handheld|engine|film|novel|manga|anime|soundtrack|album|song|episode|board game|card game|tabletop|television/i;
const isGame = (desc) => /\bgames?\b/i.test(desc || '') && !NOT_A_GAME.test(desc || '');

function score(page, game) {
  const a = norm(page.title);
  const b = norm(game.title);
  let s = isGame(page.description) ? 5 : 0;
  if (a === b) s += 4;
  else if (a.includes(b) || b.includes(a)) s += 2;
  const wa = words(page.title);
  const wb = words(game.title);
  const overlap = [...wb].filter((w) => wa.has(w)).length;
  s += wb.size ? (overlap / wb.size) * 2 : 0;
  if (/\(video game\)/i.test(page.title)) s += 1;
  const years = game.years || [];
  if (years.some((y) => String(page.description || '').includes(String(y)) || page.title.includes(String(y)))) s += 2;
  return s - (page.index || 0) * 0.3;
}

const safeImage = (src) => (typeof src === 'string' && src.startsWith(IMAGE_HOST) ? src : '');
const wikiUrl = (lang, title) => `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/* ---------- Zoeken ---------- */

/**
 * Zoekt de game op Engelstalige Wikipedia (daar staan verreweg de meeste
 * games, ook retro). Geeft maximaal 10 kandidaten terug, beste eerst.
 */
export function findCandidates(game, signal) {
  const year = game.years?.length ? ` ${Math.min(...game.years)}` : '';
  const query = game.plainQuery ? game.title : `${game.title}${year} video game`;
  return cached(candidateCache, query, async () => {
    const t = withTimeout(signal);
    try {
      const json = await api(WIKI('en'), {
        action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '10', gsrnamespace: '0',
        ...PAGE_PROPS,
      }, t.signal);
      const pages = (json.query?.pages || []).filter((p) => !p.missing);
      return pages
        .map((p) => ({ ...toCandidate(p), score: score(p, game) }))
        .sort((x, y) => y.score - x.score)
        .slice(0, 10);
    } finally {
      t.done();
    }
  });
}

/**
 * Eén vaste Wikipedia-pagina op titel (doorverwijzingen worden gevolgd).
 * Voor games waarvan de juiste pagina vooraf bekend is (zie corrections.js).
 * Geeft null als de pagina niet bestaat.
 */
export function findPage(title, signal) {
  return cached(candidateCache, `page:${title}`, async () => {
    const t = withTimeout(signal);
    try {
      const json = await api(WIKI('en'), { action: 'query', titles: title, ...PAGE_PROPS }, t.signal);
      const page = (json.query?.pages || []).find((p) => !p.missing && !p.invalid);
      return page ? { ...toCandidate(page), score: 10, game: true } : null;
    } finally {
      t.done();
    }
  });
}

/**
 * Haalt de paginatitel uit een Wikipedia-link, bijvoorbeeld
 * https://en.wikipedia.org/wiki/Assassin%27s_Creed_Shadows (ook mobiele
 * links en ?title=…). Geeft { lang, title } of null als het geen link is.
 */
export function parseWikiLink(text) {
  let url;
  try { url = new URL(String(text || '').trim()); } catch { return null; }
  const m = /^([a-z-]+)(?:\.m)?\.wikipedia\.org$/i.exec(url.hostname);
  if (!m) return null;
  let title = '';
  if (url.pathname.startsWith('/wiki/')) title = url.pathname.slice(6);
  else title = url.searchParams.get('title') || '';
  try { title = decodeURIComponent(title); } catch { /* laat zoals het is */ }
  title = title.replace(/_/g, ' ').trim();
  return title ? { lang: m[1].toLowerCase(), title } : null;
}

/**
 * Zelf ingevoerde link of titel ("Niet de juiste game?").
 * - Engelse Wikipedia-link of exacte titel → die ene pagina.
 * - Link naar een andere taal → de Engelse pagina via de taallinks.
 * - Anders: zoeken op precies wat je typte (zonder "video game" erachter).
 * Geeft een lijst kandidaten (kan leeg zijn).
 */
export async function lookupInput(text, signal) {
  const input = String(text || '').trim();
  if (!input) return [];
  const link = parseWikiLink(input);
  if (link && link.lang !== 'en') {
    const t = withTimeout(signal);
    let enTitle = '';
    try {
      const json = await api(WIKI(link.lang), {
        action: 'query', titles: link.title, prop: 'langlinks', lllang: 'en', redirects: '1',
      }, t.signal);
      enTitle = json.query?.pages?.[0]?.langlinks?.[0]?.title || '';
    } finally {
      t.done();
    }
    if (!enTitle) return [];
    const page = await findPage(enTitle, signal);
    return page ? [page] : [];
  }
  const exact = await findPage(link ? link.title : input, signal);
  if (exact || link) return exact ? [exact] : [];
  return findCandidates({ title: input, years: [], plainQuery: true }, signal);
}

const PAGE_PROPS = {
  prop: 'pageimages|pageprops|description|langlinks', piprop: 'thumbnail', pithumbsize: '500',
  pilicense: 'any', ppprop: 'wikibase_item', lllang: 'nl', lllimit: 'max', redirects: '1',
};

const toCandidate = (p) => ({
  pageid: p.pageid,
  title: p.title,
  description: p.description || '',
  qid: p.pageprops?.wikibase_item || '',
  nlTitle: p.langlinks?.find((l) => l.lang === 'nl')?.title || '',
  thumb: safeImage(p.thumbnail?.source),
  index: p.index,
  game: isGame(p.description),
});

/* ---------- Details ---------- */

const ids = (claims, prop) => (claims?.[prop] || [])
  .filter((c) => c.rank !== 'deprecated')
  .map((c) => c.mainsnak?.datavalue?.value?.id)
  .filter(Boolean);

const MONTH_FMT = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_FMT = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Eerste (vroegste) releasedatum uit Wikidata, op de juiste precisie. */
function firstRelease(claims) {
  const dates = (claims?.[P.released] || [])
    .filter((c) => c.rank !== 'deprecated')
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v) => v?.time)
    .map((v) => {
      const m = /^\+?(\d{4})-(\d{2})-(\d{2})/.exec(v.time);
      if (!m) return null;
      const [y, mo, d] = [+m[1], +m[2], +m[3]];
      const precision = v.precision >= 11 && d ? 11 : v.precision >= 10 && mo ? 10 : 9;
      return { y, mo: mo || 1, d: d || 1, precision, sort: y * 10_000 + (mo || 0) * 100 + (d || 0) };
    })
    .filter(Boolean)
    .sort((a, b) => a.sort - b.sort);
  const r = dates[0];
  if (!r) return null;
  const date = new Date(Date.UTC(r.y, r.mo - 1, r.d));
  const text = r.precision === 11 ? DAY_FMT.format(date) : r.precision === 10 ? MONTH_FMT.format(date) : String(r.y);
  return { text, year: r.y };
}

/** Recensiescores uit Wikidata, met wie de score gaf en voor welk platform. */
function reviewClaims(claims) {
  return (claims?.[P.review] || [])
    .filter((c) => c.rank !== 'deprecated')
    .map((c) => ({
      value: String(c.mainsnak?.datavalue?.value || ''),
      by: c.qualifiers?.[P.reviewBy]?.[0]?.datavalue?.value?.id || '',
      platform: c.qualifiers?.[P.platform]?.[0]?.datavalue?.value?.id || '',
    }))
    .filter((r) => r.value && r.by);
}

/** "97/100" → 97, "92.5%" → 93 (alleen recensentenscores, geen gebruikersscores /10) */
function toPercent(value) {
  let m = /(\d{1,3}(?:[.,]\d+)?)\s*\/\s*100\b/.exec(value);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')));
  m = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(value);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')));
  return null;
}

/** Terugval: Metacritic/GameRankings uit de recensietabel van het Wikipedia-artikel. */
async function scoresFromWikitext(title, signal) {
  const json = await api(WIKI('en'), {
    action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: title, redirects: '1',
  }, signal);
  const text = json.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content || '';
  const clean = text.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const pick = (key) => {
    const m = new RegExp(`\\|\\s*${key}\\s*=([^\\n]*)`, 'i').exec(clean);
    if (!m) return null;
    const all = [...m[1].matchAll(/(\d{1,3}(?:\.\d+)?)\s*(?:\/\s*100\b|%)/g)].map((x) => Math.round(+x[1])).filter((n) => n <= 100);
    return all.length ? Math.max(...all) : null;
  };
  return { metacritic: pick('MC'), gamerankings: pick('GR') };
}

async function labels(qids, signal) {
  const out = new Map();
  const list = [...new Set(qids)];
  for (let i = 0; i < list.length; i += 50) {
    const json = await api(WIKIDATA, {
      action: 'wbgetentities', ids: list.slice(i, i + 50).join('|'), props: 'labels', languages: 'nl|en',
    }, signal);
    for (const [id, e] of Object.entries(json.entities || {})) {
      const label = e.labels?.nl?.value || e.labels?.en?.value;
      if (label) out.set(id, label);
    }
  }
  return out;
}

async function summary(lang, title, signal) {
  const json = await api(WIKI(lang), {
    action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', titles: title, redirects: '1',
  }, signal);
  return (json.query?.pages?.[0]?.extract || '').trim();
}

const capitalize = (s) => (s ? s.charAt(0).toLocaleUpperCase('nl') + s.slice(1) : s);

const coreCache = new Map(); // pageid → Promise<core>
const summaryCache = new Map(); // taal:titel → Promise<string>

/**
 * De "kern" van een game: boxart, scores, genre, ontwikkelaar, release.
 * Dit is klein genoeg om in de kluis te bewaren (zie toStored in app.js).
 * Onderdelen die mislukken worden overgeslagen.
 */
export function loadCore(candidate, signal) {
  return cached(coreCache, candidate.pageid, async () => {
    const t = withTimeout(signal);
    try {
      const entity = candidate.qid
        ? await api(WIKIDATA, {
          action: 'wbgetentities', ids: candidate.qid, props: 'claims|sitelinks', sitefilter: 'nlwiki',
        }, t.signal).then((j) => j?.entities?.[candidate.qid] || null)
        : null;
      const claims = entity?.claims || {};
      const nlTitle = candidate.nlTitle || entity?.sitelinks?.nlwiki?.title || '';

      const factProps = ['genre', 'developer', 'publisher', 'modes', 'series', 'director', 'composer'];
      const reviews = reviewClaims(claims);
      const wanted = [
        ...factProps.flatMap((k) => ids(claims, P[k])),
        ...reviews.flatMap((r) => [r.by, r.platform]).filter(Boolean),
      ];
      // Geen Metacritic op Wikidata? Dan tegelijk ook de recensietabel van Wikipedia.
      const needWikitext = !reviews.some((r) => r.by === 'Q150248');
      const [names, wt] = await Promise.all([
        wanted.length ? labels(wanted, t.signal) : new Map(),
        needWikitext ? scoresFromWikitext(candidate.title, t.signal).catch(() => null) : null,
      ]);

      const facts = {};
      for (const k of factProps) {
        facts[k] = [...new Set(ids(claims, P[k]).map((id) => names.get(id)).filter(Boolean))]
          .slice(0, 4)
          .map((x) => (k === 'genre' || k === 'modes' ? capitalize(x) : x));
      }

      // Scores: Metacritic, of anders GameRankings (vaak de enige voor retro-games)
      const byOutlet = (re, qid) => reviews
        .filter((r) => r.by === qid || re.test(names.get(r.by) || ''))
        .map((r) => ({ score: toPercent(r.value), platform: names.get(r.platform) || '' }))
        .filter((r) => r.score != null && r.score <= 100)
        .sort((a, b) => b.score - a.score);
      let metacritic = byOutlet(/metacritic/i, 'Q150248');
      let gamerankings = byOutlet(/gamerankings/i, '');
      if (!metacritic.length && wt?.metacritic != null) metacritic = [{ score: wt.metacritic, platform: '' }];
      if (!gamerankings.length && wt?.gamerankings != null) gamerankings = [{ score: wt.gamerankings, platform: '' }];
      // Eén score per platform
      const dedupe = (list) => list.filter((r, i) => list.findIndex((x) => x.platform === r.platform) === i).slice(0, 5);

      return {
        pageid: candidate.pageid,
        title: candidate.title,
        qid: candidate.qid || '',
        nlTitle,
        description: candidate.description || '',
        image: candidate.thumb || '',
        release: firstRelease(claims),
        facts,
        metacritic: dedupe(metacritic),
        gamerankings: dedupe(gamerankings),
      };
    } finally {
      t.done();
    }
  });
}

/** Samenvatting: Nederlands als er een Nederlands artikel is, anders Engels. */
export function loadSummary(core, signal) {
  const key = `${core.nlTitle}|${core.title}`;
  return cached(summaryCache, key, async () => {
    const t = withTimeout(signal);
    try {
      const [nl, en] = await Promise.all([
        core.nlTitle ? summary('nl', core.nlTitle, t.signal).catch(() => '') : '',
        summary('en', core.title, t.signal).catch(() => ''),
      ]);
      if (!nl && !en) throw new Error('Geen samenvatting');
      return nl
        ? { text: nl, lang: 'nl', url: wikiUrl('nl', core.nlTitle) }
        : { text: en, lang: 'en', url: wikiUrl('en', core.title) };
    } finally {
      t.done();
    }
  });
}

/** Wikipedia-link voor een (bewaarde) kern. */
export const coreWikiUrl = (core) => (core.nlTitle ? wikiUrl('nl', core.nlTitle) : wikiUrl('en', core.title));

/**
 * Alvast beginnen met laden zodra je een game aanraakt, zodat het
 * detailscherm (vrijwel) klaar is als het opent.
 */
export function prefetch(game, stored) {
  const start = stored?.pageid ? Promise.resolve([candidateFrom(stored)]) : findCandidates(game);
  start
    .then((list) => {
      const best = list[0];
      if (!best) return;
      if (best.thumb) new Image().src = best.thumb;
      loadCore(best).then((core) => loadSummary(core)).catch(() => {});
    })
    .catch(() => {});
}

/** Maakt van bewaarde info weer een kandidaat (zonder opnieuw te zoeken). */
export const candidateFrom = (info) => ({
  pageid: info.pageid, title: info.title, qid: info.qid || '', nlTitle: info.nlTitle || '',
  description: info.description || '', thumb: safeImage(info.image),
});
