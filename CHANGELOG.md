# Changelog

## 1.2.0

**Toegevoegd**
- Automatische setup: na *Use this template* stelt de workflow *Nieuwe app instellen* naam, opslag-id, datapad, versie, manifest en titels in en probeert GitHub Pages aan te zetten. Handmatig te starten met een eigen naam, kleur en icoonletter; de iconen worden dan in alle formaten gemaakt (`tools/setup.mjs`).
- De accentkleur bepaalt automatisch de tekstkleur op knoppen (wit of donker), zodat ook lichte kleuren leesbaar blijven.

## 1.1.0

**Opgelost**
- Twee tabbladen tegelijk open kon wijzigingen van het andere tabblad overschrijven. Tabbladen laden nu elkaars wijzigingen in.
- Snel achter elkaar wijzigen kon wijzigingen kwijtraken. Wijzigingen en opslag lopen nu strikt één voor één.
- Een oudere app-versie kon gegevens van een nieuwere versie beschadigen. De app blokkeert nu het bewerken en synchroniseren en vraagt om bij te werken (`app.schemaVersion`).

**Toegevoegd**
- Privacyscherm: de inhoud wordt verborgen in de app-wisselaar en op de achtergrond.
- Synchroniseren wacht 20 seconden na de laatste wijziging (`syncDelaySeconds`), en gebeurt altijd direct bij vergrendelen of het verlaten van de app. Dat geeft minder commits.
- De app vraagt de browser om de opslag permanent te bewaren (`navigator.storage.persist()`).
- Back-up op de telefoon gaat via het deelmenu (`saveFile()`).
- Nieuwe wachtwoorden moeten minimaal 12 tekens hebben (`minPasswordLength`), met een sterktemeter.
- Knop om het wachtwoord te tonen of te verbergen.
- Na het instellen of koppelen biedt de app aan om Face ID / passkey in te schakelen.
- `parseEuro()` voor het invoeren van bedragen in Nederlandse notatie.
- Verwijderde records worden na 180 dagen opgeruimd (in de demo-`migrate`).
- Waarschuwing als de versies in `config.js` en `sw.js` verschillen.
- `CHANGELOG.md`.

**Gewijzigd**
- De kopbalk op brede schermen is even breed als de inhoud.

## 1.0.0

- Eerste versie: versleutelde kluis, GitHub-sync, Face ID / passkey, offline en updates, instellingen, back-up.
