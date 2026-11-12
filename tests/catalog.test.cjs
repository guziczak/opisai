'use strict';

// Catalog visits of the Klinika mock-up (assets/clinic.js): each visit's three fields come from one invented test
// case of kxp_mock.c, for the fictional cat and dog. The demo's local panel reader (assets/opisai-document.js) is
// checked on them against the real OpisAI 0.12.0rc32 panel (tests/fixtures/rc32-catalog-panel.json, made offline
// with application.panel.build_full_panel and source_panel_values).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const D = require('../assets/opisai-document.js');
const catalog = require('./fixtures/rc32-catalog-panel.json');
const clinic = fs.readFileSync(path.join(__dirname, '../assets/clinic.js'), 'utf8');
const LABEL = {badanie: 'Badanie kliniczne', wywiad: 'Wywiad', diagnoza: 'Diagnoza'}, PATIENT = {Mela: 2, Bruno: 3};
const source = (key, text) => ({id: 'standard:' + key, field: key, label: LABEL[key], role: 'standard', text, included: !!text.trim()});
const rowsOut = rows => rows.map(r => ({parameter_id: r.parameter_id, label: r.label, value: r.value, origin: r.origin, status: r.status, quotes: r.quotes, respelled: r.respelled,
  needs_review: r.needs_review, attribution: r.attribution, issues: r.assignment_issues.map(i => [i.message, i.quote, i.context, i.source_verified])}));

for (const c of catalog) {
  test(`catalog visit from invented case ${c.case} („${c.name}”): one case per visit, the panel as in rc32`, () => {
    const line = clinic.split('\n').find(l => l.includes(`wywiad: '${c.texts.wywiad}'`)); assert.ok(line, 'the visit is in SEED_VISITS');
    for (const k of ['badanie', 'diagnoza']) assert.ok(line.includes(`${k}: '${c.texts[k]}'`), `${k} from the same case`);
    assert.match(line, new RegExp(`patient: ${PATIENT[c.patient]},`)); assert.match(line, /doctor: DOCTOR,/); assert.match(line, /number: '\d{3}\/2026'/);
    const sources = c.keys.map(k => source(k, c.texts[k])), built = D.buildFullPanel(sources.map(s => s.text).join('\n\n'), D.TEMPLATE, {sources});
    assert.equal(built.text, c.text);
    assert.deepEqual(rowsOut(built.rows), c.rows);
    assert.deepEqual(D.sourcePanelValues(c.texts.badanie, D.TEMPLATE), c.values);
  });
}

test('several or timed measurements stay visible and marked for review, as in rc32', () => {
  const hr = catalog.find(c => c.case === 6).rows.find(r => r.parameter_id === 'heart_rate');
  assert.equal(hr.value, 'HR przy wejściu 164/min; po uspokojeniu 112/min'); assert.equal(hr.needs_review, true);
  const t = catalog.find(c => c.case === 35).rows.find(r => r.parameter_id === 'temperature');
  assert.match(t.value, /dziś T 38,7; wczoraj T 39,6/); assert.equal(t.needs_review, true);
});

test('the mock-up names no real-looking doctor', () => {
  assert.match(clinic, /const DOCTOR = 'Lekarz testowy';/);
  assert.doesNotMatch(clinic.replace(/m\.doctor === 'Anna Nowak'/, ''), /Anna Nowak/, 'only the migration of saved states mentions the earlier name');
});
