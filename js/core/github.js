// Minimale GitHub Contents API-client voor één bestand in een (private) repo.
// Token: fine-grained personal access token, alleen deze repo,
// permissie "Contents: Read and write".

import { bytesToB64, b64ToBytes } from './crypto.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'GitHubError'; this.status = status; }
}

export class ConflictError extends GitHubError {
  constructor() { super('Het bestand is tegelijk op een ander apparaat gewijzigd.', 409); this.name = 'ConflictError'; }
}

const utf8ToB64 = (str) => bytesToB64(new TextEncoder().encode(str));
const b64ToUtf8 = (b64) => new TextDecoder().decode(b64ToBytes(b64.replace(/\s/g, '')));

function describe(status, detail) {
  if (status === 401) return 'Het GitHub-token is ongeldig of verlopen.';
  if (status === 403) {
    return /rate limit/i.test(detail)
      ? 'GitHub-limiet bereikt. Probeer het over een paar minuten opnieuw.'
      : 'Het token heeft geen toegang. Geef het "Contents: Read and write" op deze repo.';
  }
  return `GitHub-fout ${status}${detail ? `: ${detail}` : ''}`;
}

export function createClient({ owner, repo, branch, path, token }) {
  if (!owner || !repo || !path || !token) throw new GitHubError('De GitHub-instellingen zijn onvolledig.');

  const base = `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const contentsUrl = `${base}/contents/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;

  async function call(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError('Geen verbinding met GitHub.');
    }
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (method === 'PUT' && (res.status === 409 || res.status === 422)) throw new ConflictError();
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* geen JSON */ }
    throw new GitHubError(describe(res.status, detail), res.status);
  }

  return {
    async checkRepo() {
      const info = await call('GET', base);
      if (!info) throw new GitHubError('Repo niet gevonden. Controleer de naam en of het token toegang heeft tot deze repo.', 404);
      return { private: info.private, defaultBranch: info.default_branch };
    },

    /** @returns {Promise<{sha: string, envelope: object} | null>} */
    async getFile() {
      const json = await call('GET', `${contentsUrl}?ref=${encodeURIComponent(branch)}`);
      if (!json) return null;
      if (Array.isArray(json)) throw new GitHubError('Het pad verwijst naar een map, niet naar een bestand.');
      let content = json.content;
      if (json.encoding !== 'base64' || !content) {
        // Bestanden > 1 MB: inhoud via de blobs-API ophalen.
        const blob = await call('GET', `${base}/git/blobs/${json.sha}`);
        content = blob?.content ?? '';
      }
      try {
        return { sha: json.sha, envelope: JSON.parse(b64ToUtf8(content)) };
      } catch {
        throw new GitHubError('Het bestand op GitHub is geen geldig kluisbestand.');
      }
    },

    /** @returns {Promise<string>} nieuwe sha */
    async putFile(envelope, sha, message) {
      const body = { message, content: utf8ToB64(JSON.stringify(envelope, null, 2)), branch };
      if (sha) body.sha = sha;
      const json = await call('PUT', contentsUrl, body);
      if (!json) throw new GitHubError('Repo of branch niet gevonden.', 404);
      return json.content.sha;
    },
  };
}
