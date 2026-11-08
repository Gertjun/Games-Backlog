// =============================================================
//  APP-SPECIFIEKE CODE — VERVANG DIT BESTAND PER APP
// =============================================================
// Dit is een eenvoudige demo (lijstje met items) die laat zien hoe de
// koppeling met de schil werkt. De schil (js/core/) regelt opslag,
// versleuteling, sync, vergrendelen en instellingen. Jij levert:
//
//   schemaVersion        → versie van je datamodel (ophogen bij elke modelwijziging)
//   initialData()        → begintoestand van een nieuwe kluis
//   migrate(data)        → oude gegevens omzetten naar het huidige schema
//   merge(local, remote) → twee versies samenvoegen (bij gelijktijdige wijzigingen)
//   render(root, ctx)    → het scherm opbouwen in `root`
//
// ctx.data              huidige gegevens (alleen lezen!)
// ctx.update(fn)        wijzigen: await ctx.update(d => { d.items.push(...) })
// ctx.toast(msg, kind)  melding tonen ('info' | 'ok' | 'error')
// ctx.confirm(msg)      ja/nee-vraag

import { h } from './core/dom.js';
import { newRecord, alive, updateById, removeById, mergeCollections, purgeTombstones } from './core/records.js';

const SCHEMA = 1;

// Verwijderde records ("tombstones") na zoveel dagen opruimen. Een apparaat dat
// langer offline is geweest, kan een verwijderd record anders terugzetten.
const TOMBSTONE_DAYS = 180;

export const app = {
  // De schil weigert te bewerken/synchroniseren als gegevens een hoger schema
  // hebben dan dit (dan draait er ergens al een nieuwere app-versie).
  schemaVersion: SCHEMA,

  initialData() {
    return { schema: SCHEMA, items: [] };
  },

  migrate(data) {
    // Voorbeeld voor later:
    // if (data.schema < 2) { data.items.forEach(i => { i.categorie ??= 'overig'; }); data.schema = 2; }
    data.items ??= [];
    data.schema ??= SCHEMA;

    // Opruimen (draait bij elke ontgrendeling).
    data.items = purgeTombstones(data.items, TOMBSTONE_DAYS);
    return data;
  },

  merge(local, remote) {
    return {
      ...remote,
      ...local,
      schema: Math.max(local.schema || 0, remote.schema || 0),
      items: mergeCollections(local.items, remote.items),
    };
  },

  render(root, ctx) {
    const items = alive(ctx.data.items).sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);

    const input = h('input', {
      name: 'title', type: 'text', placeholder: 'Nieuw item…', autocomplete: 'off', required: true, 'aria-label': 'Nieuw item',
    });

    const form = h('form', {
      class: 'card add-form',
      onSubmit: async (e) => {
        e.preventDefault();
        const title = input.value.trim();
        if (!title) return;
        await ctx.update((d) => { d.items.push(newRecord({ title, done: false })); });
        root.querySelector('input[name=title]')?.focus();
      },
    }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Toevoegen'));

    const list = items.length
      ? h('ul', { class: 'card list' }, items.map((item) => h('li', { class: `list-item${item.done ? ' is-done' : ''}` },
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: item.done,
            onChange: (e) => ctx.update((d) => { updateById(d.items, item.id, { done: e.target.checked }); }),
          }),
          h('span', {}, item.title)),
        h('button', {
          class: 'icon-btn icon-btn-small',
          type: 'button',
          'aria-label': `Verwijder ${item.title}`,
          onClick: () => {
            if (ctx.confirm(`"${item.title}" verwijderen?`)) ctx.update((d) => { removeById(d.items, item.id); });
          },
        }, '✕'))))
      : h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Nog niets hier'),
        h('p', { class: 'muted' }, 'Voeg je eerste item toe. Alles wordt versleuteld opgeslagen.'));

    root.replaceChildren(form, list);
  },
};
