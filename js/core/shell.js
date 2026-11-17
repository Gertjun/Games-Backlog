// De "schil" van de app: setup, vergrendelscherm, instellingen, sync,
// automatisch vergrendelen, privacy, meerdere tabbladen en updates.
// App-specifieke inhoud zit in js/app.js.

import { APP } from '../config.js';
import { app } from '../app.js';
import * as vault from './vault.js';
import * as sessionLock from './session-lock.js';
import { SYSTEM_KEY, mergeSyncStates } from './deletions.js';
import * as bio from './biometric.js';
import { syncNow, UpdateRequiredError } from './sync.js';
import { createClient } from './github.js';
import { createNav } from './nav.js';
import * as pair from './pair.js';
import { $, $$, h, formValues, saveFile, formatWhen, today, isMobileStandalone } from './dom.js';

const SCREENS = ['loading', 'setup', 'lock', 'app'];
const SYNC_MESSAGES = {
  'up-to-date': 'Alles is al up-to-date.',
  uploaded: 'Wijzigingen opgeslagen op GitHub.',
  downloaded: 'Nieuwste gegevens opgehaald.',
  merged: 'Wijzigingen van beide apparaten samengevoegd.',
  restored: 'Back-up naar GitHub geschreven.',
};
const BIO_OFFER_KEY = `${APP.storagePrefix}:bio-offer-dismissed`;
const SCHEMA_VERSION = app.schemaVersion ?? Infinity;

let settings = null;     // apparaatinstellingen: { github, autoSync, autoLockMinutes }
let blocked = false;     // gegevens zijn nieuwer dan deze app-versie
let session = 0;         // telt ontgrendelingen (voor veilig vergrendelen)
let syncTimer = null;
let idleTimer = null;
let hiddenAt = 0;
let lastSyncAttempt = 0;
let swRegistration = null;
let persistRequested = false;
let nav = null;            // navigatie tussen de schermen (core/nav.js)
let bioBusy = false;       // er loopt al een Face ID / passkey-poging
let sessionLockHandle = null;
let locking = false;
let syncPromise = null;
let syncController = null;
let storageConflict = false;
let storageConflictExternalValues = new Map();
const busyOperations = new Set();

// Wijzigingen lopen één voor één, zodat elke wijziging voortbouwt op de vorige
// (ook bij heel snel klikken).
let updateChain = Promise.resolve();

async function acquireAppSession() {
  if (locking) throw new Error('De app wordt vergrendeld. Probeer het zo opnieuw.');
  if (sessionLockHandle) return;
  const handle = await sessionLock.acquireSessionLock();
  if (!handle) throw new sessionLock.SessionLockBusyError();
  sessionLockHandle = handle;
}

async function releaseAppSession() {
  const handle = sessionLockHandle;
  sessionLockHandle = null;
  if (handle) {
    try { await handle.release(); }
    catch (error) { console.error('Sessie-lock vrijgeven mislukt:', error?.name || 'Error'); }
  }
}

function trackOperation(operation) {
  if (locking) return Promise.reject(new Error('De app wordt vergrendeld.'));
  const task = Promise.resolve().then(operation);
  busyOperations.add(task);
  return task.finally(() => busyOperations.delete(task));
}

function saveDeviceSettings(value) {
  return trackOperation(() => vault.setDeviceSettings(value));
}

function showStorageNotice(error) {
  const retry = h('button', { type: 'button', class: 'btn btn-primary btn-small' }, 'Opnieuw proberen');
  retry.addEventListener('click', async () => {
    retry.disabled = true;
    try {
      await vault.retryFlush();
      hideNotice();
      render();
      updateSyncIndicator();
      toast('Lokale opslag is hersteld.', 'ok');
    } catch (retryError) {
      showStorageNotice(retryError);
    } finally {
      retry.disabled = false;
    }
  });
  showNotice(
    h('p', {}, h('strong', {}, 'Opslag niet bevestigd.'), ' Laat deze app open en probeer de opslag te herstellen voordat je de app sluit.'),
    h('div', { class: 'button-row' }, retry),
  );
}

async function handleExternalStorageChange(storageKey, externalValue) {
  if (storageConflict) {
    storageConflictExternalValues.set(storageKey, externalValue);
    return;
  }
  storageConflict = true;
  storageConflictExternalValues = new Map([[storageKey, externalValue]]);
  locking = true;
  syncController?.abort();
  syncController?.abort();
  clearTimeout(idleTimer);
  clearTimeout(syncTimer);
  closeSettings();
  hideNotice();
  $('#app-root').replaceChildren();
  showLock();
  $('#btn-storage-retry')?.remove();

  // Laat reeds gestarte writes afronden, maar schrijf de externe envelop niet terug.
  while (busyOperations.size) await Promise.allSettled([...busyOperations]);
  await updateChain.catch(() => {});
  if (syncPromise) await syncPromise;

  showError(
    '#lock-error',
    'De kluis is buiten de actieve sessielock om gewijzigd (bijvoorbeeld door een ouder tabblad). Deze tab blijft afgeschermd. Download de lokale versleutelde herstelkopieën en, als die beschikbaar is, de externe opslagkopie voordat je verdergaat; sluit of ververs deze tab niet.'
  );
  let button = $('#btn-storage-conflict-export');
  if (!button) {
    button = h('button', { id: 'btn-storage-conflict-export', type: 'button', class: 'btn btn-primary' }, 'Download herstelkopieën');
    $('#lock-error').after(button);
  }
  button.hidden = false;
  button.onclick = async () => {
    if (!window.confirm('Heb je andere openstaande tabbladen van deze app gesloten? Download de lokale herstelkopieën en, als die beschikbaar is, de externe herstelkopie voordat je verdergaat.')) return;
    button.disabled = true;
    try {
      const localEnvelope = await vault.createRecoveryEnvelope();
      await saveFile(
        `${APP.storagePrefix}-recovery-local-${today()}.json`,
        JSON.stringify(localEnvelope, null, 2)
      );
      const localDeviceSettings = await vault.createDeviceSettingsRecovery(
        settings ?? await vault.getDeviceSettings() ?? {}
      );
      await saveFile(
        `${APP.storagePrefix}-recovery-device-settings-local-${today()}.json`,
        JSON.stringify(localDeviceSettings)
      );
      for (const [key, value] of storageConflictExternalValues) {
        if (!value) continue;
        const suffix = key === vault.KEYS.device ? 'device-settings' : 'external-vault';
        await saveFile(
          `${APP.storagePrefix}-recovery-${suffix}-${today()}.json`,
          value
        );
      }
      vault.lock();
      settings = null;
      await releaseAppSession();
      storageConflict = false;
      storageConflictExternalValues = new Map();
      locking = false;
      button.remove();
      showError('#lock-error', 'Herstelkopieën zijn aangemaakt. Open de app opnieuw en herstel bewust de juiste kopie.');
    } catch (error) {
      showError('#lock-error', `Herstelkopieën konden niet volledig worden aangemaakt. Laat deze tab open en probeer opnieuw. ${error?.message || ''}`);
    } finally {
      button.disabled = false;
    }
  };
}

function showStorageRetry(error) {
  if (storageConflict) return;
  showLock();
  showError('#lock-error', `Lokale opslag is niet bevestigd. De app blijft afgeschermd; probeer opnieuw. ${error?.message || ''}`);
  let button = $('#btn-storage-retry');
  if (!button) {
    button = h('button', { id: 'btn-storage-retry', type: 'button', class: 'btn btn-primary' }, 'Opslag opnieuw proberen');
    $('#lock-error').after(button);
  }
  button.hidden = false;
  button.onclick = async () => {
    button.disabled = true;
    try {
      await vault.retryFlush();
      vault.lock();
      settings = null;
      await releaseAppSession();
      locking = false;
      button.remove();
      showError('#lock-error', 'Lokale opslag bevestigd. Je kunt de kluis opnieuw openen.');
    } catch (retryError) {
      showError('#lock-error', `Opslag is nog niet bevestigd. Laat dit tabblad open en probeer opnieuw. ${retryError?.message || ''}`);
    } finally {
      button.disabled = false;
    }
  };
}

async function recoverFailedSession(error, selector) {
  if (storageConflict) return;
  if (!vault.isUnlocked()) {
    await releaseAppSession();
    locking = false;
    showError(selector, error?.message || 'Ontgrendelen is mislukt.');
    return;
  }
  try {
    await vault.flush();
    vault.lock();
    await releaseAppSession();
    locking = false;
    showError(selector, error?.message || 'Ontgrendelen is mislukt.');
  } catch (storageError) {
    if (!storageConflict) showStorageRetry(storageError);
  }
}

async function applyUpdate(mutator) {
  if (locking) throw new Error('De app wordt vergrendeld.');
  if (blocked) throw new Error('Werk de app eerst bij voordat je iets wijzigt.');
  if (!vault.isUnlocked()) throw new Error('De kluis is vergrendeld.');
  try {
    const draft = structuredClone(vault.getData());
    const result = (await mutator(draft)) ?? draft;
    await vault.setData(result);
    render();
    updateSyncIndicator();
    scheduleSync();
    return result;
  } catch (err) {
    console.error('Opslaan mislukt:', err?.name || 'Error');
    toast(`Opslaan mislukt: ${err.message}`, 'error');
    if (vault.getStorageStatus().pending) showStorageNotice(err);
    throw err;
  }
}

// Het object dat app.render() krijgt.
const ctx = {
  get data() { return vault.getData(); },
  /** Wijzig gegevens: resolve't pas na lokale persist; fouten worden doorgegeven. */
  update(mutator) {
    const run = updateChain.catch(() => {}).then(() => applyUpdate(mutator));
    updateChain = run;
    return run;
  },
  /** Wacht op bevestiging van de actuele lokale revisie. */
  flush: () => vault.flush(),
  /** Niet-gevoelige status van de lokale schrijfwachtrij. */
  getStorageStatus: () => vault.getStorageStatus(),
  /** Eenmalige expliciete retry van de volledige actuele snapshot. */
  retryStorage: async () => {
    try { const result = await vault.retryFlush(); hideNotice(); return result; }
    catch (err) { showStorageNotice(err); throw err; }
  },
  /** Device-settings zijn versleuteld en worden niet gesynchroniseerd. */
  getDeviceSettings: () => vault.getDeviceSettings(),
  setDeviceSettings: saveDeviceSettings,
  toast,
  confirm: (msg) => window.confirm(msg),
  /** Het scherm dat nu getoond wordt: een id uit app.screens. */
  get screen() { return nav?.screen ?? null; },
  /** Naar een ander scherm van de app. */
  go: (id) => nav?.select(id),
  /** Getal op een knop in de navigatie (0 = verbergen). */
  setBadge: (id, n) => nav?.setBadge(id, n),
  /** Opent Instellingen, eventueel bij een onderdeel ('sync', 'security', 'backup', …). */
  openSettings: (page) => openSettings(page),
  /**
   * Alleen bij een instellingenpaneel (#settings-panel) in de pagina: toont de
   * secties met data-group="<group>" ('all' = alles), of verbergt het paneel (null).
   */
  showShellSettings: (group) => showSettingsPanel(group),
  /** Is synchroniseren met de data-repo ingesteld (en niet gepauzeerd)? */
  get syncConfigured() { return isSyncConfigured() && !blocked; },
  /**
   * Leest een ander (onversleuteld) bestand uit de data-repo, bijvoorbeeld iets
   * wat een GitHub Action daar zet. Synchroniseert eerst de kluis, zodat wat een
   * ander apparaat al verwerkt heeft hier ook is.
   * @returns {Promise<{sha: string, text: string} | null>} null als sync niet is ingesteld of het bestand er niet is.
   */
  async readSyncFile(path) {
    if (!isSyncConfigured() || blocked || !navigator.onLine) return null;
    await runSync({ quiet: true });
    return createClient({ ...settings.github, path }).getText();
  },
};

export async function start() {
  document.title = APP.name;
  $$('[data-app-name]').forEach((el) => { el.textContent = APP.name; });
  $$('[data-min-length]').forEach((el) => { el.textContent = APP.minPasswordLength; });
  $$('#app-version').forEach((el) => { el.textContent = APP.version; });
  $$('[data-app-version]').forEach((el) => { el.textContent = `v${APP.version}`; });
  // Helpt wachtwoordmanagers het wachtwoord aan deze app te koppelen.
  $$('input[name=username]').forEach((el) => el.setAttribute('value', APP.name));

  enhancePasswordFields();
  registerServiceWorker();
  wireSetup();
  wireLock();
  wireAppBar();
  wireSettings();
  wireLifecycle();
  wireOtherTabs();
  nav = createNav({
    screens: app.screens,
    host: $('#screen-app'),
    onChange: () => render(),
    onSettings: () => openSettings(),
    onLeaveSettings: () => closeSettings(),
  });

  if (vault.hasVault()) {
    showLock();
    autoBiometricUnlock();
  } else showScreen('setup');
}

// ---------- Hulpjes ----------

function showScreen(name) {
  for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== name;
}

function showError(sel, message) {
  const el = $(sel);
  el.textContent = message || '';
  el.hidden = !message;
}

async function withBusy(button, fn) {
  if (locking) throw new Error('De app wordt vergrendeld.');
  button.disabled = true;
  button.dataset.busy = '';
  const operation = Promise.resolve().then(fn);
  busyOperations.add(operation);
  try {
    return await operation;
  } finally {
    busyOperations.delete(operation);
    button.disabled = false;
    delete button.dataset.busy;
  }
}

function toast(message, kind = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 6000 : 3000);
}

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function render() {
  if (!vault.isUnlocked() || $('#screen-app').hidden) return;
  const root = $('#app-root');
  try {
    app.render(root, ctx);
  } catch (err) {
    console.error(err);
    root.replaceChildren(h('p', { class: 'form-error' }, `Er ging iets mis bij het tonen: ${err.message}`));
  }
  renderAppSettings();
}

/**
 * Eigen instellingen van de app: een <section id="settings-…" class="settings-section"
 * data-app-page> in het instellingenvenster, met een regel in #settings-menu.
 * De schil toont de pagina; de app vult hem in app.renderSettings(page, el, ctx).
 */
function renderAppSettings() {
  const section = settingsPage && $(`#settings-${settingsPage}`);
  if (!section?.hasAttribute('data-app-page') || !app.renderSettings || !vault.isUnlocked()) return;
  try {
    app.renderSettings(settingsPage, section, ctx);
  } catch (err) {
    console.error(err);
    section.replaceChildren(h('p', { class: 'form-error' }, `Er ging iets mis bij het tonen: ${err.message}`));
  }
}

/** Melding boven de app-inhoud (voor de schil; niet voor de app zelf). */
function showNotice(...children) {
  const el = $('#app-notice');
  el.replaceChildren(...children);
  el.hidden = false;
}
const hideNotice = () => { $('#app-notice').hidden = true; };

function readGithub(v) {
  return {
    owner: (v.owner || '').trim(),
    repo: (v.repo || '').trim(),
    branch: (v.branch || '').trim() || APP.defaultBranch,
    path: (v.path || '').trim().replace(/^\/+/, '') || APP.defaultDataPath,
    token: (v.token || '').trim(),
  };
}

function bioMessage(err) {
  if (err?.name === 'NotAllowedError') return 'Passkey-aanvraag geannuleerd of niet toegestaan. Je kunt de kluis met je wachtwoord openen.';
  if (err?.name === 'NotSupportedError') return 'Deze browser of authenticator ondersteunt passkey-ontgrendeling met PRF niet. Gebruik je wachtwoord.';
  if (err?.name === 'NotFoundError') return 'Geen passende passkey gevonden. Je kunt de kluis met je wachtwoord openen.';
  if (err?.name === 'SecurityError') return 'Passkey is niet beschikbaar vanuit deze app-context. Open de app via de HTTPS-app-link of gebruik je wachtwoord.';
  if (err?.name === 'InvalidStateError') return 'Er bestaat al een passkey voor deze app op dit apparaat.';
  return err?.message || 'Ontgrendelen met passkey is mislukt. Je kunt ook je wachtwoord gebruiken.';
}

// ---------- Wachtwoordvelden ----------

/** 0 = te kort, 1 = matig, 2 = goed, 3 = sterk */
function passwordScore(pw) {
  if (pw.length < APP.minPasswordLength) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /\s/].filter((r) => r.test(pw)).length;
  const words = pw.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3).length;
  if (pw.length >= 20 || words >= 4 || (pw.length >= 14 && kinds >= 3)) return 3;
  if (pw.length >= 16 || kinds >= 3) return 2;
  return 1;
}
const SCORE_LABELS = [
  () => `Te kort: minimaal ${APP.minPasswordLength} tekens`,
  () => 'Matig: maak het langer of voeg een woord toe',
  () => 'Goed',
  () => 'Sterk',
];

function checkNewPassword(pw, confirm) {
  if (pw.length < APP.minPasswordLength) return `Kies een wachtwoord van minimaal ${APP.minPasswordLength} tekens.`;
  if (pw !== confirm) return 'De wachtwoorden komen niet overeen.';
  return '';
}

function enhancePasswordFields() {
  for (const input of $$('input[type=password]')) {
    const toggle = h('button', { type: 'button', class: 'pw-toggle', 'aria-label': 'Wachtwoord tonen', 'aria-pressed': 'false' }, 'Toon');
    const wrap = h('span', { class: 'pw-field' });
    input.replaceWith(wrap);
    wrap.append(input, toggle);
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Verberg' : 'Toon';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Wachtwoord verbergen' : 'Wachtwoord tonen');
    });
    input.form?.addEventListener('reset', () => {
      input.type = 'password';
      toggle.textContent = 'Toon';
      toggle.setAttribute('aria-pressed', 'false');
    });

    if (input.hasAttribute('data-strength')) {
      const bar = h('span', { class: 'pw-meter-bar' });
      const label = h('span', { class: 'pw-meter-label' });
      const meter = h('span', { class: 'pw-meter', hidden: true }, bar, label);
      wrap.after(meter);
      const update = () => {
        const score = passwordScore(input.value);
        meter.hidden = !input.value;
        meter.dataset.score = score;
        label.textContent = SCORE_LABELS[score]();
      };
      input.addEventListener('input', update);
      input.form?.addEventListener('reset', () => { meter.hidden = true; });
    }
  }
}

// ---------- Setup ----------

function wireSetup() {
  const newForm = $('#form-setup-new');
  const linkForm = $('#form-setup-link');
  // Via het attribuut, zodat form.reset() de standaardwaarden terugzet.
  linkForm.elements.branch.setAttribute('value', APP.defaultBranch);
  linkForm.elements.path.setAttribute('value', APP.defaultDataPath);

  for (const form of [newForm, linkForm]) form.addEventListener('input', () => showError('#setup-error', ''));

  $$('[data-setup-tab]').forEach((tab) => tab.addEventListener('click', () => {
    const mode = tab.dataset.setupTab;
    $$('[data-setup-tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
    newForm.hidden = mode !== 'new';
    linkForm.hidden = mode !== 'link';
    showError('#setup-error', '');
  }));

  // Koppelcode van een ander apparaat: vult eigenaar, repo, branch, pad en token in.
  $('#btn-pair-in')?.addEventListener('click', async (e) => {
    showError('#setup-error', '');
    await withBusy(e.currentTarget, async () => {
      const gh = await pair.readPairCode(linkForm.elements.pairCode.value, linkForm.elements.pairPin.value);
      for (const k of ['owner', 'repo', 'branch', 'path', 'token']) linkForm.elements[k].value = gh[k] ?? '';
      linkForm.elements.pairCode.value = '';
      linkForm.elements.pairPin.value = '';
      linkForm.elements.password.focus();
      toast('Koppeling ingevuld. Vul nu het wachtwoord van je kluis in.', 'ok');
    }).catch((err) => showError('#setup-error', err.message));
  });

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { password, confirm } = formValues(newForm);
    const problem = checkNewPassword(password, confirm);
    showError('#setup-error', problem);
    if (problem) return;
    await withBusy(newForm.querySelector('[type=submit]'), async () => {
      await acquireAppSession();
      try {
        await vault.create(password, app.initialData());
        await saveDeviceSettings({ github: null, autoSync: true });
        newForm.reset();
        await afterUnlock();
      } catch (err) {
        await recoverFailedSession(err, '#setup-error');
        throw err;
      }
    }).catch((err) => {
      if ($('#screen-setup').hidden) return;
      showError('#setup-error', err.message);
    });
  });

  linkForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formValues(linkForm);
    const github = readGithub(v);
    showError('#setup-error', '');
    await withBusy(linkForm.querySelector('[type=submit]'), async () => {
      await acquireAppSession();
      try {
        const remote = await createClient(github).getFile();
        if (!remote) throw new Error('Geen kluisbestand gevonden op dit pad in de repo.');
        await vault.importEnvelope(remote.envelope, v.password);
        vault.setSyncMeta({ sha: remote.sha, dirty: false, lastSyncAt: Date.now() });
        await vault.setDeviceSettings({ github, autoSync: true });
        linkForm.reset();
        await afterUnlock({ skipSync: true });
        toast('Kluis opgehaald van GitHub.', 'ok');
      } catch (err) {
        await recoverFailedSession(err, '#setup-error');
        throw err;
      }
    }).catch((err) => {
      if ($('#screen-setup').hidden) return;
      showError('#setup-error', err.message);
    });
  });
}

// ---------- Vergrendelen / ontgrendelen ----------

function showLock() {
  const enrolled = bio.isEnrolled();
  $('#btn-bio-unlock').hidden = !enrolled;
  $('#lock-divider').hidden = !enrolled;
  showError('#lock-error', '');
  showScreen('lock');
}

function wireLock() {
  const form = $('#form-unlock');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { password } = formValues(form);
    showError('#lock-error', '');
    await withBusy(form.querySelector('[type=submit]'), async () => {
      await acquireAppSession();
      try {
        await vault.unlockWithPassword(password);
        form.reset();
        await afterUnlock();
      } catch (err) {
        await recoverFailedSession(err, '#lock-error');
        throw err;
      }
    }).catch((err) => {
      if (!$('#btn-storage-retry')) showError('#lock-error', err.message);
    });
  });

  $('#btn-bio-unlock').addEventListener('click', () => biometricUnlock());
}

/**
 * Ontgrendelen met Face ID / passkey. Bij `auto` (vanzelf gestart) wordt
 * annuleren of "niet toegestaan" stil genegeerd: dan blijven de knop en het
 * wachtwoordveld gewoon staan.
 */
async function biometricUnlock({ auto = false } = {}) {
  if (bioBusy) return;
  bioBusy = true;
  showError('#lock-error', '');
  try {
    await withBusy($('#btn-bio-unlock'), async () => {
      await acquireAppSession();
      try {
        const key = await bio.unlock();
        await vault.unlockWithKey(key);
        await afterUnlock();
      } catch (err) {
        await recoverFailedSession(err, '#lock-error');
        throw err;
      }
    });
  } catch (err) {
    const quiet = auto && (err?.name === 'NotAllowedError' || err?.name === 'AbortError');
    if (!quiet) showError('#lock-error', bioMessage(err));
  } finally {
    bioBusy = false;
  }
}

/**
 * Start Face ID vanzelf bij het openen van de app of bij terugkeer naar de app
 * (APP.autoBiometricUnlock). Niet na zelf vergrendelen of na inactiviteit.
 * Werkt in Safari vanaf iOS 17.4; oudere versies weigeren stil en dan blijft
 * de knop staan.
 */
async function autoBiometricUnlock() {
  if (!APP.autoBiometricUnlock || !bio.isEnrolled() || bioBusy) return;
  await sleep(300); // iOS geeft de pagina na openen/terugkeren pas net focus
  if (document.hidden || $('#screen-lock').hidden || !bio.isEnrolled()) return;
  await biometricUnlock({ auto: true });
}

async function afterUnlock({ skipSync = false } = {}) {
  locking = false;
  session++;
  const initial = vault.getData();
  blocked = (initial?.schema ?? 0) > SCHEMA_VERSION;
  if (!blocked) {
    await vault.captureDeletionHistory();
    const current = vault.getData();
    const migrated = app.migrate(structuredClone(current));
    if (current[SYSTEM_KEY]) migrated[SYSTEM_KEY] = mergeSyncStates(current[SYSTEM_KEY], migrated[SYSTEM_KEY]);
    if (JSON.stringify(migrated) !== JSON.stringify(current)) await vault.setData(migrated);
  }

  settings = (await vault.getDeviceSettings()) ?? { github: null, autoSync: true };
  showScreen('app');
  hideNotice();
  render();
  updateSyncIndicator();
  resetIdle();
  requestPersistentStorage();

  if (blocked) showUpdateRequired();
  else offerBiometrics();
  if (!skipSync && !blocked && isSyncConfigured()) runSync({ quiet: true });
}

/** Vraagt de browser de opslag niet op te ruimen (vooral iOS). */
function requestPersistentStorage() {
  if (persistRequested || !navigator.storage?.persist) return;
  persistRequested = true;
  navigator.storage.persisted()
    .then((already) => already || navigator.storage.persist())
    .catch(() => {});
}

/** Schakelt Face ID / passkey in, met een nieuwe of een bestaande passkey. */
async function enrollBiometrics(button, { existing = false } = {}) {
  await withBusy(button, async () => {
    if (existing) await bio.enrollExisting(vault.getDataKey());
    else await bio.enroll(vault.getDataKey());
    hideNotice();
    toast('Ontgrendelen met Face ID / passkey is ingeschakeld.', 'ok');
  }).catch((err) => toast(bioMessage(err), 'error'));
  updateBioUI();
}

async function offerBiometrics() {
  if (bio.isEnrolled() || localStorage.getItem(BIO_OFFER_KEY) || !(await bio.isSupported())) return;
  const enable = h('button', { class: 'btn btn-primary btn-small', type: 'button' }, 'Nieuwe passkey');
  const existing = h('button', { class: 'btn btn-small', type: 'button' }, 'Bestaande gebruiken');
  const later = h('button', { class: 'btn btn-ghost btn-small', type: 'button' }, 'Niet nu');
  enable.addEventListener('click', () => enrollBiometrics(enable));
  existing.addEventListener('click', () => enrollBiometrics(existing, { existing: true }));
  later.addEventListener('click', () => {
    localStorage.setItem(BIO_OFFER_KEY, '1');
    hideNotice();
  });
  showNotice(
    h('p', {}, h('strong', {}, 'Sneller ontgrendelen?'), ' Gebruik Face ID, Touch ID of een passkey in plaats van je wachtwoord. Had je de app al eerder geïnstalleerd? Kies dan je bestaande passkey.'),
    h('div', { class: 'button-row' }, enable, existing, later),
  );
}

function showUpdateRequired() {
  blocked = true;
  clearTimeout(syncTimer);
  const check = h('button', { class: 'btn btn-primary btn-small', type: 'button' }, 'Zoek update');
  check.addEventListener('click', () => checkForUpdate(check));
  showNotice(
    h('p', {}, h('strong', {}, 'Update nodig.'), ' Je gegevens zijn gemaakt met een nieuwere versie van de app. Bekijken kan, wijzigen pas na het bijwerken.'),
    h('div', { class: 'button-row' }, check),
  );
  updateSyncIndicator();
  swRegistration?.update().catch(() => {});
}

/**
 * Vergrendelt direct het scherm. Openstaande wijzigingen worden eerst nog
 * (maximaal 8 seconden) gesynchroniseerd; daarna wordt de sleutel gewist.
 */
async function lockNow() {
  if (!vault.isUnlocked() || locking) return;
  const mySession = session;
  locking = true;
  syncController?.abort();
  clearTimeout(idleTimer);
  clearTimeout(syncTimer);
  closeSettings();
  $('#dlg-pair')?.close();
  hideNotice();
  $('#app-root').replaceChildren();
  showLock();

  try {
    // Eerst alle al gestarte app-updates en synchronisatie laten afronden.
    // Tijdens locking worden geen nieuwe updates of sync-runs gestart.
    while (busyOperations.size) await Promise.allSettled([...busyOperations]);
    await updateChain.catch(() => {});
    if (syncPromise) await syncPromise;
    if (storageConflict) return;
    await vault.flush();
    if (storageConflict) return;
    if (session === mySession) {
      vault.lock();
      settings = null;
      await releaseAppSession();
      locking = false;
    }
  } catch (err) {
    if (!storageConflict) showStorageRetry(err);
  }
}

/** Minuten tot automatisch vergrendelen: keuze op dit apparaat, anders APP.autoLockMinutes. 0 = uit. */
function autoLockMinutes() {
  const m = settings?.autoLockMinutes;
  return Number.isFinite(m) && m >= 0 ? m : APP.autoLockMinutes;
}

function resetIdle() {
  clearTimeout(idleTimer);
  const minutes = autoLockMinutes();
  if (!vault.isUnlocked() || !minutes) return;
  idleTimer = setTimeout(lockNow, minutes * 60_000);
}

// ---------- Synchronisatie ----------

const isSyncConfigured = () => !!settings?.github?.token;

function setSyncState(state, label) {
  const btn = $('#btn-sync');
  btn.dataset.state = state;
  btn.title = label;
  btn.setAttribute('aria-label', `Synchroniseren: ${label}`);
  $('#sync-status').textContent = label;
  setText('#sum-sync', state === 'off' ? 'Niet ingesteld' : label);
}

function updateSyncIndicator() {
  if (!vault.isUnlocked()) return;
  if (!isSyncConfigured()) return setSyncState('off', 'Synchronisatie niet ingesteld');
  if (blocked) return setSyncState('error', 'Gepauzeerd: werk de app bij');
  const meta = vault.getSyncMeta();
  if (meta.dirty) {
    return setSyncState('pending', navigator.onLine
      ? 'Wijzigingen nog niet gesynchroniseerd'
      : 'Offline: wordt later gesynchroniseerd');
  }
  setSyncState('ok', meta.lastSyncAt ? `Gesynchroniseerd ${formatWhen(meta.lastSyncAt)}` : 'Gesynchroniseerd');
}

function runSync(options = {}) {
  if (locking || !vault.isUnlocked()) return Promise.resolve();
  if (syncPromise) return syncPromise;
  syncController = new AbortController();
  const operation = performSync({ ...options, signal: syncController.signal });
  syncPromise = operation;
  return operation.finally(() => {
    if (syncPromise === operation) {
      syncPromise = null;
      syncController = null;
    }
  });
}

async function performSync({ quiet = false, signal } = {}) {
  if (!vault.isUnlocked()) return;
  if (!isSyncConfigured()) {
    if (!quiet) openSettings('sync');
    return;
  }
  if (blocked) {
    if (!quiet) toast('Synchronisatie staat stil tot je de app hebt bijgewerkt.', 'error');
    return;
  }
  if (!navigator.onLine) {
    updateSyncIndicator();
    if (!quiet) toast('Je bent offline. Synchronisatie volgt zodra je weer online bent.');
    return;
  }
  clearTimeout(syncTimer);
  lastSyncAttempt = Date.now();
  setSyncState('syncing', 'Bezig met synchroniseren…');
  try {
    const result = await syncNow({
      settings: settings.github, merge: app.merge, migrate: app.migrate, schemaVersion: SCHEMA_VERSION, signal,
    });
    if (!vault.isUnlocked() || locking) return;
    if (result === 'downloaded' || result === 'merged') render();
    updateSyncIndicator();
    renderSyncDevices();
    if (!quiet) toast(SYNC_MESSAGES[result], 'ok');
  } catch (err) {
    if (!vault.isUnlocked() || locking) return;
    if (err instanceof UpdateRequiredError) {
      showUpdateRequired();
      return;
    }
    console.error(err);
    setSyncState('error', `Sync mislukt: ${err.message}`);
    if (!quiet) toast(err.message, 'error');
  }
}

function scheduleSync() {
  if (!isSyncConfigured() || !settings.autoSync || blocked) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync({ quiet: true }), APP.syncDelaySeconds * 1000);
}

// ---------- App-balk ----------

function wireAppBar() {
  $('#btn-sync').addEventListener('click', () => runSync({ quiet: false }));
  $('#btn-lock').addEventListener('click', lockNow);
  // Elke knop met data-open-settings opent de instellingen (tandwiel in de
  // balk, of een knop in de navigatie van de app).
  $$('#btn-settings, [data-open-settings]').forEach((b) => b.addEventListener('click', () => openSettings()));
}

// ---------- Instellingen ----------

// De instellingen kunnen op drie manieren in index.html staan:
//  1. <dialog id="dlg-settings"> als venster (standaard);
//  2. <dialog id="dlg-settings" data-mode="page"> als scherm in de app, zonder
//     achtergrond. Openen meldt zich met het event "settings:open", zodat de
//     navigatie van de app kan wisselen;
//  3. <section id="settings-panel"> in de pagina, met secties met data-group.
//     De app toont het paneel via ctx.showShellSettings(group); exporteert de app
//     openSettings(section), dan bepaalt die waar en wanneer.
// Staat er een #settings-menu in het venster, dan toont het eerst een overzicht
// en opent een tik op een regel dat onderdeel als eigen pagina met een
// Terug-knop (zoals Instellingen op iOS).
let settingsPage = null;

const settingsDialog = () => $('#dlg-settings');
const settingsAsPage = () => settingsDialog()?.dataset.mode === 'page';
const hasSettingsMenu = () => !!$('#settings-menu');

/** Zet tekst in een element als dat in deze app bestaat. */
function setText(selector, text) {
  const el = $(selector);
  if (el) el.textContent = text;
}

function settingsVisible() {
  const panel = $('#settings-panel');
  return settingsDialog()?.open || (panel && !panel.hidden);
}

function openSettings(page) {
  const dlg = settingsDialog();
  if (!dlg) {
    if (app.openSettings) app.openSettings(page);
    else showSettingsPanel('all');
    if (page) $(`#settings-${page}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  fillSettings();
  if (settingsAsPage()) {
    if (!dlg.open) dlg.show();
    nav?.showSettings();
    document.dispatchEvent(new CustomEvent('settings:open', { detail: { section: page } }));
  } else if (!dlg.open) dlg.showModal();
  if (hasSettingsMenu()) showSettingsPage(page ?? null);
  else if (page) $(`#settings-${page}`)?.scrollIntoView({ block: 'start' });
}

function closeSettings() {
  const dlg = settingsDialog();
  if (dlg?.open) dlg.close();
  const panel = $('#settings-panel');
  if (panel) panel.hidden = true;
}

/** Instellingenpaneel in de pagina: toont de secties van `group` ('all' = alles) of verbergt het (null). */
function showSettingsPanel(group) {
  const panel = $('#settings-panel');
  if (!panel) return;
  const wasHidden = panel.hidden;
  panel.hidden = !group;
  if (!group) return;
  $$('#settings-panel [data-group]').forEach((sec) => {
    sec.hidden = group !== 'all' && sec.dataset.group !== group;
  });
  if (wasHidden) fillSettings();
}

function showSettingsPage(page) {
  if (!hasSettingsMenu()) return;
  const section = page && $(`#settings-${page}`);
  settingsPage = section ? page : null;
  $('#settings-menu').hidden = !!settingsPage;
  $$('#dlg-settings .settings-section').forEach((el) => { el.hidden = el !== section; });
  const back = $('#btn-settings-back');
  if (back) back.hidden = !settingsPage;
  setText('#settings-title', settingsPage ? section.dataset.title : 'Instellingen');
  const body = $('#dlg-settings .sheet-body');
  if (body) body.scrollTop = 0;
  // Zonder verbinding meteen het formulier tonen; anders blijft het dicht.
  const conn = $('#sync-connection');
  if (settingsPage === 'sync' && conn) conn.open = !isSyncConfigured();
  if (!settingsPage) {
    $$('#dlg-settings details').forEach((d) => { d.open = false; });
  }
  renderAppSettings();
  // Focus naar de titel, zodat schermlezers de nieuwe pagina aankondigen.
  $('#settings-title')?.focus({ preventScroll: true });
}


function renderSyncDevices() {
  const host = $('#sync-devices');
  const section = $('#sync-devices-section');
  if (!host || !section || !vault.isUnlocked() || !isSyncConfigured()) {
    if (section) section.hidden = true;
    return;
  }
  section.hidden = false;
  const devices = vault.getSyncDevices();
  const rows = devices.map((device) => {
    const label = device.current ? 'Dit apparaat' : `Apparaat ${device.id.slice(0, 8)}`;
    const status = device.deactivatedAt
      ? `Afgemeld op ${formatWhen(device.deactivatedAt)}`
      : device.lastSeenAt ? `Laatst gezien ${formatWhen(device.lastSeenAt)}` : 'Nog niet gesynchroniseerd';
    const acknowledgements = device.deletionCount
      ? `Verwijderingen bevestigd: ${device.acknowledgedCount} van ${device.deletionCount}`
      : 'Geen openstaande verwijderbevestigingen';
    const details = h('div', {},
      h('strong', {}, label),
      h('p', { class: 'hint' }, status),
      h('p', { class: 'hint' }, acknowledgements));
    if (device.current) return h('div', { class: 'setting-line' }, details, h('span', { class: 'hint' }, device.deactivatedAt ? 'Afgemeld' : 'Dit apparaat'));
    if (device.deactivatedAt) return h('div', { class: 'setting-line' }, details, h('span', { class: 'hint' }, 'Afgemeld'));
    const button = h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onClick: async () => {
        const warning = `Apparaat ${device.id.slice(0, 8)} afmelden? Het kan daarna niet meer synchroniseren. Niet-gesynchroniseerde wijzigingen op dat apparaat gaan niet mee. Je kunt het later opnieuw koppelen als een nieuw apparaat door dit apparaat eerst te wissen en opnieuw te koppelen.`;
        if (!window.confirm(warning)) return;
        button.disabled = true;
        try {
          await trackOperation(() => vault.deactivateSyncDevice(device.id));
          renderSyncDevices();
          await runSync({ quiet: true });
          if (vault.getSyncMeta().dirty) toast('Afmelding lokaal opgeslagen. Synchronisatie volgt zodra je online bent.', 'error');
          else toast('Apparaat afgemeld en gesynchroniseerd.', 'ok');
        } catch (err) {
          button.disabled = false;
          toast(err.message, 'error');
        }
      },
    }, 'Afmelden');
    return h('div', { class: 'setting-line' }, details, button);
  });
  host.replaceChildren(...rows);
}

function fillSettings() {
  const f = $('#form-github');
  const gh = settings?.github;
  f.elements.owner.value = gh?.owner ?? '';
  f.elements.repo.value = gh?.repo ?? '';
  f.elements.branch.value = gh?.branch ?? APP.defaultBranch;
  f.elements.path.value = gh?.path ?? APP.defaultDataPath;
  f.elements.token.value = '';
  f.elements.token.placeholder = gh?.token ? '•••••••• (opgeslagen, leeg laten om te behouden)' : 'github_pat_…';
  f.elements.autoSync.checked = settings?.autoSync !== false;
  fillAutoLock();
  $('#btn-github-remove').hidden = !gh;
  const syncNowBtn = $('#btn-sync-now');
  if (syncNowBtn) syncNowBtn.hidden = !gh;
  const pairBtn = $('#btn-pair-out');
  if (pairBtn) pairBtn.hidden = !gh;
  setText('#sum-about', `Versie ${APP.version}`);
  ['#github-error', '#password-error', '#restore-error'].forEach((s) => showError(s, ''));
  updateSyncIndicator();
  renderSyncDevices();
  updateBioUI();
}

/** Keuzelijst "Automatisch vergrendelen"; voegt een afwijkende waarde (uit config of ander apparaat) zo nodig toe. */
function fillAutoLock() {
  const select = $('#auto-lock');
  if (!select) return;
  const value = String(autoLockMinutes());
  if (![...select.options].some((o) => o.value === value)) {
    select.append(h('option', { value }, `Na ${value} minuten`));
  }
  select.value = value;
}

async function updateBioUI() {
  const btn = $('#btn-bio-toggle');
  const status = $('#bio-status');
  const existing = $('#btn-bio-existing');
  if (bio.isEnrolled()) {
    status.textContent = 'Ingeschakeld op dit apparaat.';
    setText('#sum-security', 'Face ID / passkey aan');
    btn.textContent = 'Uitschakelen';
    btn.disabled = false;
    if (existing) existing.hidden = true;
    return;
  }
  const supported = await bio.isSupported();
  setText('#sum-security', supported ? 'Face ID / passkey uit' : 'Alleen wachtwoord');
  status.textContent = supported
    ? 'Uit. Ontgrendel met Face ID, Touch ID, Windows Hello of een passkey.'
    : 'Passkey-ontgrendeling met PRF is niet beschikbaar in deze browser of op dit apparaat. Je kunt de kluis met je wachtwoord openen.';
  // Zonder knop "Bestaande gebruiken" in deze app: één knop die een nieuwe passkey maakt.
  btn.textContent = existing ? 'Nieuwe passkey' : 'Inschakelen';
  btn.disabled = !supported;
  if (existing) existing.hidden = !supported;
}

/**
 * Ander apparaat koppelen: toont een koppelcode en een losse pincode. De code
 * bevat de GitHub-koppeling (met token), versleuteld met de pincode. Het
 * wachtwoord van de kluis zit er niet in.
 */
async function openPairOut() {
  if (!isSyncConfigured()) throw new Error('Stel eerst de synchronisatie in.');
  const pin = pair.newPin();
  const code = await pair.makePairCode(settings.github, pin);
  const field = h('textarea', { class: 'pair-code', readonly: true, rows: 4, 'aria-label': 'Koppelcode' }, code);
  const copy = h('button', { class: 'btn btn-primary', type: 'button' }, 'Koppelcode kopiëren');
  const close = h('button', { class: 'btn', type: 'button' }, 'Klaar');
  const dlg = h('dialog', { id: 'dlg-pair', class: 'sheet pair-sheet', 'aria-labelledby': 'pair-title' },
    h('div', { class: 'sheet-header' }, h('h2', { id: 'pair-title' }, 'Ander apparaat koppelen')),
    h('div', { class: 'sheet-body stack' },
      h('ol', { class: 'pair-steps' },
        h('li', {}, 'Zet de koppelcode op je andere apparaat, bijvoorbeeld via AirDrop, Notities of een bericht aan jezelf.'),
        h('li', {}, `Open daar ${APP.name}, kies `, h('strong', {}, 'Bestaande koppelen'), ' en plak de koppelcode.'),
        h('li', {}, 'Typ de pincode hieronder over en vul het wachtwoord van je kluis in.')),
      field,
      h('p', { class: 'pair-pin' }, h('span', { class: 'muted' }, 'Pincode'), h('strong', {}, pin)),
      h('p', { class: 'hint' }, 'Stuur de pincode niet samen met de koppelcode mee. De code werkt alleen met deze pincode; sluit je dit venster, dan is de pincode weg.'),
      h('div', { class: 'button-row' }, copy, close)));
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast('Koppelcode gekopieerd.', 'ok');
    } catch {
      field.select();
      toast('Kopiëren lukte niet. Selecteer de code en kopieer hem zelf.');
    }
  });
  close.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

async function checkForUpdate(button) {
  if (!swRegistration) return toast('Updates zijn niet beschikbaar in deze browser.');
  await withBusy(button, async () => {
    await swRegistration.update();
    toast(swRegistration.installing || swRegistration.waiting
      ? 'Nieuwe versie gevonden, even geduld…'
      : 'Je gebruikt de nieuwste versie.');
  }).catch(() => toast('Controleren op updates is mislukt.', 'error'));
}

function wireSettings() {
  const dlg = settingsDialog();
  if (dlg) {
    $('#btn-close-settings')?.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg && !settingsAsPage()) dlg.close(); });
    dlg.addEventListener('close', () => { showSettingsPage(null); nav?.hideSettings(); });
    // Escape op een onderdeel gaat eerst terug naar het overzicht.
    dlg.addEventListener('cancel', (e) => {
      if (!settingsPage) return;
      e.preventDefault();
      showSettingsPage(null);
    });
  }
  $('#btn-settings-back')?.addEventListener('click', () => showSettingsPage(null));
  $$('#settings-menu [data-page]').forEach((row) => {
    row.addEventListener('click', () => showSettingsPage(row.dataset.page));
  });

  // GitHub-sync
  const ghForm = $('#form-github');
  ghForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formValues(ghForm);
    const github = readGithub({ ...v, token: v.token || settings.github?.token || '' });
    showError('#github-error', '');
    await withBusy(ghForm.querySelector('[type=submit]'), async () => {
      const info = await createClient(github).checkRepo();
      const prev = settings.github;
      const moved = !prev || prev.owner !== github.owner || prev.repo !== github.repo
        || prev.branch !== github.branch || prev.path !== github.path;
      settings = { ...settings, github, autoSync: ghForm.elements.autoSync.checked };
      await vault.setDeviceSettings(settings);
      if (moved) vault.updateSyncMeta({ sha: null, dirty: true });
      fillSettings();
      if (!info.private) toast('Let op: deze repo is PUBLIEK. Je data is versleuteld, maar gebruik liever een private repo.', 'error');
      await runSync({ quiet: info.private === false });
    }).catch((err) => showError('#github-error', err.message));
  });

  $('#btn-github-remove').addEventListener('click', async () => {
    if (!window.confirm('Synchronisatie op dit apparaat uitzetten? Het bestand op GitHub blijft bestaan.')) return;
    settings = { ...settings, github: null };
    await vault.setDeviceSettings(settings);
    fillSettings();
  });

  $('#btn-sync-now').addEventListener('click', () => runSync({ quiet: false }));
  $('#btn-pair-out')?.addEventListener('click', (e) => withBusy(e.currentTarget, openPairOut)
    .catch((err) => toast(err.message, 'error')));

  // Automatisch vergrendelen (per apparaat)
  $('#auto-lock')?.addEventListener('change', async (e) => {
    const minutes = Number(e.target.value);
    if (!Number.isFinite(minutes) || minutes < 0) return;
    settings = { ...settings, autoLockMinutes: minutes };
    await vault.setDeviceSettings(settings);
    resetIdle();
    toast(minutes ? `Vergrendelt na ${minutes} ${minutes === 1 ? 'minuut' : 'minuten'} zonder gebruik.` : 'Automatisch vergrendelen staat uit.', 'ok');
  });

  // Biometrie / passkey
  $('#btn-bio-toggle').addEventListener('click', async (e) => {
    if (bio.isEnrolled()) {
      bio.disable();
      toast('Ontgrendelen met passkey uitgeschakeld. Je kunt de passkey zelf verwijderen in je wachtwoordbeheer.');
      return updateBioUI();
    }
    await enrollBiometrics(e.currentTarget);
  });
  $('#btn-bio-existing')?.addEventListener('click', (e) => enrollBiometrics(e.currentTarget, { existing: true }));

  // Wachtwoord wijzigen
  const pwForm = $('#form-password');
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { current, next, confirm } = formValues(pwForm);
    const problem = checkNewPassword(next, confirm);
    showError('#password-error', problem);
    if (problem) return;
    await withBusy(pwForm.querySelector('[type=submit]'), async () => {
      await vault.changePassword(current, next);
      pwForm.reset();
      toast('Wachtwoord gewijzigd. Het geldt na synchronisatie ook op je andere apparaten.', 'ok');
      updateSyncIndicator();
      runSync({ quiet: true });
    }).catch((err) => showError('#password-error', err.message));
  });

  // Back-up
  $('#btn-export').addEventListener('click', async () => {
    await vault.flush();
    await saveFile(`${APP.storagePrefix}-backup-${today()}.json`, JSON.stringify(vault.getEnvelope(), null, 2));
  });

  $('#btn-export-plain').addEventListener('click', async () => {
    if (!window.confirm('Deze export is NIET versleuteld. Iedereen met het bestand kan je gegevens lezen. Doorgaan?')) return;
    await saveFile(`${APP.storagePrefix}-export-${today()}.json`, JSON.stringify(vault.getData(), null, 2));
  });

  const restoreForm = $('#form-restore');
  restoreForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = restoreForm.elements.file.files[0];
    const { password } = formValues(restoreForm);
    if (!file) return showError('#restore-error', 'Kies eerst een back-upbestand.');
    if (!window.confirm('Back-up terugzetten? Dit vervangt de gegevens op dit apparaat én op GitHub.')) return;
    showError('#restore-error', '');
    await withBusy(restoreForm.querySelector('[type=submit]'), async () => {
      let env;
      try { env = JSON.parse(await file.text()); } catch { throw new Error('Dit bestand is geen geldig JSON.'); }
      const { sameKey } = await vault.restoreBackup(env, password);
      if (!sameKey) bio.disable(); // passkey hoort bij de oude sleutel
      await vault.setDeviceSettings(settings); // opnieuw versleutelen met (mogelijk) nieuwe sleutel
      blocked = (vault.getData()?.schema ?? 0) > SCHEMA_VERSION;
      if (blocked) {
        showUpdateRequired();
      } else {
        const restoredData = vault.getData();
        const migrated = app.migrate(structuredClone(restoredData));
        migrated[SYSTEM_KEY] = mergeSyncStates(restoredData[SYSTEM_KEY], migrated[SYSTEM_KEY]);
        await vault.setData(migrated);
      }
      restoreForm.reset();
      render();
      updateSyncIndicator();
      updateBioUI();
      toast('Back-up teruggezet. Je wachtwoord is nu dat van de back-up.', 'ok');
      runSync({ quiet: true });
    }).catch((err) => showError('#restore-error', err.message));
  });

  // Updates
  $('#btn-check-update').addEventListener('click', (e) => checkForUpdate(e.currentTarget));

  // Gevarenzone
  $('#btn-reset').addEventListener('click', async () => {
    if (!window.confirm('Alle gegevens van deze app op DIT apparaat wissen? Gegevens op GitHub blijven bewaard.')) return;
    try {
      await trackOperation(() => vault.reset());
      location.reload();
    } catch (err) {
      toast(`Wissen mislukt: ${err.message}`, 'error');
    }
  });
}

// ---------- Levenscyclus & privacy ----------

const cover = (on) => { $('#privacy-cover').hidden = !on; };

function wireLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (vault.isUnlocked()) {
        cover(true);
        if (vault.getSyncMeta().dirty) runSync({ quiet: true });
      }
      return;
    }
    swRegistration?.update().catch(() => {});
    if (vault.isUnlocked() && autoLockMinutes() && hiddenAt
      && Date.now() - hiddenAt > autoLockMinutes() * 60_000) {
      lockNow();
    } else if (vault.isUnlocked() && Date.now() - lastSyncAttempt > 30_000) {
      runSync({ quiet: true });
    }
    cover(false);
    if (!$('#screen-lock').hidden) autoBiometricUnlock();
  });

  // De app-wisselaar op iPhone/Android: inhoud verbergen zodra de app de focus verliest.
  if (isMobileStandalone()) {
    window.addEventListener('blur', () => { if (vault.isUnlocked()) cover(true); });
    window.addEventListener('focus', () => { if (!document.hidden) cover(false); });
  }

  window.addEventListener('online', () => runSync({ quiet: true }));
  window.addEventListener('offline', updateSyncIndicator);
  for (const ev of ['pointerdown', 'keydown']) {
    document.addEventListener(ev, resetIdle, { passive: true });
  }
}

// ---------- Meerdere tabbladen ----------

function wireOtherTabs() {
  window.addEventListener('storage', async (e) => {
    if (e.key === null) {
      if (vault.isUnlocked()) {
        await handleExternalStorageChange(vault.KEYS.vault, null);
      } else if (!vault.hasVault()) {
        location.reload();
      }
      return;
    }
    if (!e.key?.startsWith(`${APP.storagePrefix}:`)) return;

    if (e.key === vault.KEYS.vault || e.key === vault.KEYS.device) {
      if (vault.isUnlocked()) {
        await handleExternalStorageChange(e.key, e.newValue);
        return;
      }
      if (e.key === vault.KEYS.vault && !vault.hasVault()) location.reload();
      return;
    }

    if (!vault.isUnlocked()) return;
    updateSyncIndicator();
  });
}

// ---------- Service worker & updates ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let updateRequested = false;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    location.reload();
  });

  // Controle of VERSION in sw.js gelijk is aan APP.version.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type !== 'VERSION' || e.data.version === APP.version) return;
    const msg = `Versieverschil: config.js zegt ${APP.version}, sw.js zegt ${e.data.version}. Maak ze gelijk.`;
    console.warn(msg);
    showError('#version-warning', msg);
  });
  navigator.serviceWorker.ready.then(() => {
    navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });
  });

  const offerUpdate = (worker) => {
    $('#update-banner').hidden = false;
    $('#update-btn').onclick = () => {
      updateRequested = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    };
  };

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    swRegistration = reg;
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  }).catch((err) => console.warn('Service worker registreren mislukt:', err));
}
