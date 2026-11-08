// =============================================================
//  App-configuratie — PAS DIT AAN PER APP
// =============================================================
export const APP = {
  name: 'Mijn App',

  // Semver. Bij ELKE release ook VERSION in sw.js gelijk ophogen,
  // anders krijgen geïnstalleerde apps de update niet.
  version: '1.2.0',

  // UNIEK PER APP. Alle GitHub Pages-sites onder <gebruiker>.github.io
  // delen dezelfde origin en dus dezelfde localStorage. Zonder unieke
  // prefix overschrijven apps elkaars gegevens. Nooit meer wijzigen
  // nadat de app in gebruik is (anders is de lokale kluis "weg").
  storagePrefix: 'mijn-app',

  // Standaardlocatie van het versleutelde kluisbestand in je PRIVATE data-repo.
  // Tip: één data-repo voor al je apps, met per app een eigen map.
  defaultDataPath: 'mijn-app/vault.json',
  defaultBranch: 'main',

  // Automatisch vergrendelen na zoveel minuten inactiviteit of op de achtergrond. 0 = uit.
  autoLockMinutes: 5,

  // Wachttijd na de laatste wijziging voordat automatisch gesynchroniseerd wordt.
  // Zo worden meerdere wijzigingen één commit. Bij vergrendelen of het verlaten
  // van de app wordt altijd direct gesynchroniseerd.
  syncDelaySeconds: 20,

  // Minimale lengte voor nieuwe wachtwoorden. Het kluisbestand staat op GitHub,
  // dus een lang wachtwoord (of wachtzin) is je belangrijkste bescherming.
  minPasswordLength: 12,

  // PBKDF2-iteraties voor het wachtwoord (OWASP 2023+: 600.000 voor SHA-256).
  kdfIterations: 600_000,
};
