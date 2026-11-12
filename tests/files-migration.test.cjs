'use strict';

// Load the real assets/files-apps.js with a stored file list, as the browser does on a
// return visit, and check what happens to the sample files. A visitor who saved any file
// in the previously published version has that version's sample texts in localStorage.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../assets/files-apps.js'), 'utf8');
const boundary = '  const get = key => entries.find(x=>x.id===key);';
assert.equal(source.split(boundary).length, 2, 'The test boundary must follow the reading of the stored list');
const instrumented = source.replace(boundary, `  __files.seed=seed;__files.entries=()=>entries;\n${boundary}`);
const KEY = 'opisai.demo.files.v1';

// The samples as the previously published version seeded them (commit 8584a22, assets/files-apps.js).
// The hashes were taken from that commit, so these copies cannot drift from what browsers hold.
const PUBLISHED = {
  'shortcut-clinic': ['name', 'System gabinetowy', 'd8c76d6f2f422ef68a8c03ae490a36d58c4b01b4e56a58ce657666a66431607b'],
  'visit-note': ['text', 'NOTATKA Z WIZYTY — PRZYKŁAD\n\nPacjent: szczur, samiec, 1 rok i 9 miesięcy, 420 g.\n\nWywiad:\nOd około 2 tygodni kichanie i świszczący oddech. Mniejszy apetyt i aktywność.\n\nBadanie:\nPostawa zgarbiona, sierść nastroszona, oddech przyspieszony.\n\nTo fikcyjny przykład do poznania interfejsu.\n', '5333160dc8bb03f0ed8b12337ae532435a35f335bc36aa1f9bb2f64290a8c103'],
  'quick-guide': ['text', 'OPISAI — SZYBKI START\n\n1. Otwórz System gabinetowy i zapoznaj się z przykładową wizytą.\n2. Kliknij bąbelek OpisAI, aby przygotować opis.\n3. Sprawdź treść i potwierdź, że nie zawiera danych właściciela.\n4. Wybierz styl i zakres opisu.\n5. Przejrzyj wynik przed użyciem.\n\nPrawy przycisk na bąbelku otwiera menu OpisAI.\nOkna można przesuwać, minimalizować, maksymalizować i przypinać do krawędzi pulpitu.\n\nTa strona jest interaktywną demonstracją aplikacji desktopowej.\n', '5a8c863cfbae5a85d0d936ae8d82402cf9e62b177b8a55b0a3050405449488a3'],
  'download-example': ['text', 'PRZYKŁADOWY OPIS WIZYTY\n\nWywiad\nSzczur, samiec, w wieku 1 roku i 9 miesięcy, o masie 420 g. Od około dwóch tygodni występują kichanie i świszczący oddech. Według notatki pacjent jest mniej aktywny i pobiera mniej pokarmu.\n\nBadanie kliniczne\nOdnotowano zgarbioną postawę, nastroszoną sierść i przyspieszony oddech.\n\nDokument demonstracyjny — wynik wymaga weryfikacji przez lekarza.\n', '16e1c12ea184ff470beefbb1e33ea3de66d635904184ec3a9d96d263ab341936']
};
const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// Run the module; `stored` is the value under the files key (an object is serialised), `blocked` makes every write fail.
function load(stored, { blocked = false } = {}) {
  const files = {}, writes = [];
  const localStorage = {
    getItem: key => key === KEY && stored !== undefined ? (typeof stored === 'string' ? stored : JSON.stringify(stored)) : null,
    setItem(key, value) { if (blocked) throw new Error('QuotaExceededError'); writes.push([key, JSON.parse(value)]); }
  };
  vm.runInNewContext(instrumented, { __files: files, localStorage, document: { readyState: 'loading', addEventListener() {} } }, { filename: 'assets/files-apps.js' });
  return { seed: files.seed(), entries: files.entries(), writes };
}
const plain = value => JSON.parse(JSON.stringify(value));
const byId = (list, id) => list.find(entry => entry.id === id);
// What a visitor sees of an entry. A stored list comes back with an empty text on folders and shortcuts and keeps its own dates.
const view = entry => ({ id: entry.id, parent: entry.parent, name: entry.name, type: entry.type, text: entry.text || '', bin: !!entry.deletedAt });
const views = list => Array.from(list, view); // an array of this realm: the module's own arrays come from the vm context
// The stored list of the published version: today's structure with that version's wording.
function publishedList(change = {}) {
  const entries = plain(load().seed);
  for (const [id, [key, value]] of Object.entries(PUBLISHED)) byId(entries, id)[key] = value;
  for (const [id, patch] of Object.entries(change)) Object.assign(byId(entries, id), patch);
  return { version: 1, entries };
}

test('the copies of the published samples are exact, and the current samples differ from each of them', () => {
  const seed = load().seed;
  for (const [id, [key, value, hash]] of Object.entries(PUBLISHED)) {
    assert.equal(sha256(value), hash, id);
    assert.notEqual(byId(seed, id)[key], value, `${id} has a new wording to migrate to`);
  }
});

test('a first visit and an up-to-date list are left alone', () => {
  const first = load();
  assert.deepEqual(views(first.entries), views(first.seed)); assert.equal(first.writes.length, 0);
  const again = load({ version: 1, entries: plain(first.seed) });
  assert.deepEqual(views(again.entries), views(first.seed)); assert.equal(again.writes.length, 0, 'Nothing to renew, nothing written');
});

test('samples in the wording of the published version are renewed, with the visitor\'s own files kept', () => {
  const stored = publishedList(), own = { id: 'f-own-1', parent: 'documents', name: 'Moja notatka.txt', type: 'text', modified: 5, text: 'Kontrola za 7 dni.' };
  stored.entries.push(own);
  const { entries, seed, writes } = load(stored);
  assert.deepEqual(views(entries), [...views(seed), view(own)], 'Every sample has the wording of this version');
  assert.deepEqual(plain(byId(entries, 'f-own-1')), own);
  assert.equal(writes.length, 1); assert.equal(writes[0][0], KEY); assert.equal(writes[0][1].version, 1);
  assert.deepEqual(views(writes[0][1].entries), views(entries), 'The renewed list is stored, so the next visit finds nothing to do');
  assert.equal(load(writes[0][1]).writes.length, 0);
});

test('a sample the visitor edited is never overwritten', () => {
  const edits = {
    'download-example': { text: PUBLISHED['download-example'][1] + 'Dopisek lekarza.' },   // text added at the end
    'visit-note': { text: PUBLISHED['visit-note'][1].replace('420 g', '421 g') },            // one character changed
    'quick-guide': { text: '' },                                                             // emptied
    'shortcut-clinic': { name: 'Mój gabinet' }                                               // renamed
  };
  const { entries, writes } = load(publishedList(edits));
  for (const [id, patch] of Object.entries(edits)) for (const [key, value] of Object.entries(patch)) assert.equal(byId(entries, id)[key], value, id);
  assert.equal(writes.length, 0, 'Nothing was renewed, so nothing is written');

  // One edited file does not hold the others back, and it stays as it is next to the renewed ones.
  const mixed = load(publishedList({ 'download-example': edits['download-example'] }));
  assert.equal(byId(mixed.entries, 'download-example').text, edits['download-example'].text);
  for (const id of ['visit-note', 'quick-guide', 'shortcut-clinic']) assert.deepEqual(view(byId(mixed.entries, id)), view(byId(mixed.seed, id)), id);
  assert.equal(byId(mixed.writes[0][1].entries, 'download-example').text, edits['download-example'].text);

  // A renewed sample in the bin or under another name is still the visitor's arrangement: only the old wording changes.
  const moved = load(publishedList({ 'visit-note': { name: 'Stara notatka.txt', deletedAt: 7, parent: 'downloads' } }));
  const note = byId(moved.entries, 'visit-note');
  assert.equal(note.text, byId(moved.seed, 'visit-note').text); assert.equal(note.name, 'Stara notatka.txt'); assert.equal(note.deletedAt, 7); assert.equal(note.parent, 'downloads');
});

test('the later revision of the sample description ("ok. 420 g") is renewed as well', () => {
  const revision = PUBLISHED['download-example'][1].replace('o masie 420 g', 'o masie ok. 420 g');
  assert.equal(sha256(revision), '1153aac07a8577494f01aa7e5b512d8babd3864523ab4bce7ac65d40ef343adc');
  const { entries, seed } = load(publishedList({ 'download-example': { text: revision } }));
  assert.equal(byId(entries, 'download-example').text, byId(seed, 'download-example').text);
});

test('a list that cannot be read or written does not stop the page', () => {
  const seed = views(load().seed);
  assert.deepEqual(views(load('{"version":1,"entries":[').entries), seed, 'Broken JSON: the samples of this version');
  assert.deepEqual(views(load({ version: 2, entries: [] }).entries), seed, 'An unknown format: the samples of this version');
  const blocked = load(publishedList(), { blocked: true });
  assert.equal(byId(blocked.entries, 'download-example').text, byId(blocked.seed, 'download-example').text, 'Renewed for this visit even when storage refuses the write');
});
