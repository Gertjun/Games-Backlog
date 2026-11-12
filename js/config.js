// =============================================================
//  App-configuratie — PAS DIT AAN PER APP
// =============================================================
export const APP = {
  name: 'Games Backlog',

  // Semver. Bij ELKE release ook VERSION in sw.js gelijk ophogen,
  // anders krijgen geïnstalleerde apps de update niet.
  version: '1.34.2',

  // UNIEK PER APP. Alle GitHub Pages-sites onder <gebruiker>.github.io
  // delen dezelfde origin en dus dezelfde localStorage. Zonder unieke
  // prefix overschrijven apps elkaars gegevens. Nooit meer wijzigen
  // nadat de app in gebruik is (anders is de lokale kluis "weg").
  storagePrefix: 'games-backlog',

  // Standaardlocatie van het versleutelde kluisbestand in je PRIVATE data-repo.
  // Tip: één data-repo voor al je apps, met per app een eigen map.
  defaultDataPath: 'games-backlog/vault.json',
  defaultBranch: 'main',

  // Standaardtijd voor automatisch vergrendelen (minuten inactiviteit of op de
  // achtergrond). 0 = uit. Per apparaat aan te passen in Instellingen > Beveiliging.
  autoLockMinutes: 5,

  // Face ID / passkey vanzelf starten als het vergrendelscherm verschijnt bij
  // het openen van de app of bij terugkeer naar de app (niet na zelf
  // vergrendelen). Werkt in Safari vanaf iOS 17.4; anders blijft de knop staan.
  autoBiometricUnlock: true,

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
