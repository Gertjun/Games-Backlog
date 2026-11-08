// =============================================================
//  Game-informatie van Wikipedia en Wikidata
// =============================================================
// Gratis, zonder API-sleutel. Alleen de titel (en het jaar) van de game
// gaat naar Wikipedia; er wordt niets uit de kluis meegestuurd.
// Resultaten worden alleen in het geheugen bewaard (deze sessie), niet
// opgeslagen buiten de kluis.
//
//   findCandidates(game)   → mogelijke Wikipedia-pagina's, beste eerst
//   loadDetails(candidate) → boxart, samenvatting, genre, Metacritic, …

const WIKI = (lang) => `https://${lang}.wikipedia.org/w/api.php`;
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
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

async function api(base, params, signal) {
  const url = new URL(base);
  url.search = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.info || 'API-fout');
  return json;
}

/** Combineert het signaal van de aanroeper met een time-out. */
function withTimeout(signal) {
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
 * games, ook retro). Geeft maximaal 5 kandidaten terug, beste eerst.
 */
export function findCandidates(game, signal) {
  const year = game.years?.length ? ` ${Math.min(...game.years)}` : '';
  const query = `${game.title}${year} video game`;
  return cached(candidateCache, query, async () => {
    const t = withTimeout(signal);
    try {
      const json = await api(WIKI('en'), {
        action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '10', gsrnamespace: '0',
        prop: 'pageimages|pageprops|description', piprop: 'thumbnail', pithumbsize: '640',
        pilicense: 'any', ppprop: 'wikibase_item', redirects: '1',
      }, t.signal);
      const pages = (json.query?.pages || []).filter((p) => !p.missing);
      return pages
        .map((p) => ({
          pageid: p.pageid,
          title: p.title,
          description: p.description || '',
          qid: p.pageprops?.wikibase_item || '',
          thumb: safeImage(p.thumbnail?.source),
          index: p.index,
          score: score(p, game),
          game: isGame(p.description),
        }))
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);
    } finally {
      t.done();
    }
  });
}

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

/**
 * Laadt alles voor één kandidaat. Onderdelen die mislukken worden
 * overgeslagen, zodat er zoveel mogelijk getoond kan worden.
 */
export function loadDetails(candidate, signal) {
  return cached(detailCache, candidate.pageid, async () => {
    const t = withTimeout(signal);
    try {
      let entity = null;
      if (candidate.qid) {
        const json = await api(WIKIDATA, {
          action: 'wbgetentities', ids: candidate.qid, props: 'claims|sitelinks', sitefilter: 'nlwiki|enwiki',
        }, t.signal).catch(() => null);
        entity = json?.entities?.[candidate.qid] || null;
      }
      const claims = entity?.claims || {};
      const nlTitle = entity?.sitelinks?.nlwiki?.title;

      const factProps = ['genre', 'developer', 'publisher', 'modes', 'series', 'director', 'composer'];
      const reviews = reviewClaims(claims);
      const wanted = [
        ...factProps.flatMap((k) => ids(claims, P[k])),
        ...reviews.flatMap((r) => [r.by, r.platform]).filter(Boolean),
      ];

      const [names, nlText, enText] = await Promise.all([
        wanted.length ? labels(wanted, t.signal).catch(() => new Map()) : new Map(),
        nlTitle ? summary('nl', nlTitle, t.signal).catch(() => '') : '',
        summary('en', candidate.title, t.signal).catch(() => ''),
      ]);

      const facts = {};
      for (const k of factProps) {
        facts[k] = [...new Set(ids(claims, P[k]).map((id) => names.get(id)).filter(Boolean))]
          .map((s) => (k === 'genre' || k === 'modes' ? capitalize(s) : s));
      }

      // Scores: Metacritic, of anders GameRankings (vaak de enige voor retro-games)
      const byOutlet = (re) => reviews
        .filter((r) => re.test(names.get(r.by) || '') || (re.source.includes('metacritic') && r.by === 'Q150248'))
        .map((r) => ({ score: toPercent(r.value), platform: names.get(r.platform) || '' }))
        .filter((r) => r.score != null && r.score <= 100)
        .sort((a, b) => b.score - a.score);
      let metacritic = byOutlet(/metacritic/i);
      let gamerankings = byOutlet(/gamerankings/i);
      if (!metacritic.length) {
        const wt = await scoresFromWikitext(candidate.title, t.signal).catch(() => null);
        if (wt?.metacritic != null) metacritic = [{ score: wt.metacritic, platform: '' }];
        if (!gamerankings.length && wt?.gamerankings != null) gamerankings = [{ score: wt.gamerankings, platform: '' }];
      }
      // Eén score per platform
      const dedupe = (list) => list.filter((r, i) => list.findIndex((x) => x.platform === r.platform) === i);

      const useNl = Boolean(nlText);
      return {
        title: candidate.title,
        description: candidate.description,
        image: candidate.thumb,
        summary: nlText || enText,
        summaryLang: useNl ? 'nl' : 'en',
        wikiUrl: useNl ? wikiUrl('nl', nlTitle) : wikiUrl('en', candidate.title),
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
