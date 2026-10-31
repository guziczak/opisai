'use strict';

// The demo's documentation model (assets/opisai-document.js) against golden data produced by the
// real OpisAI 0.12.0rc32 pipeline (tests/fixtures/rc32-document-golden.json, made offline with
// application.generation.generate, application.panel.build_full_panel, panel_repetition,
// panel_spelling and domain.preservation on the same sample answers).
const assert = require('node:assert/strict');
const test = require('node:test');
const D = require('../assets/opisai-document.js');
const golden = require('./fixtures/rc32-document-golden.json');
const LABEL = {badanie: 'Badanie kliniczne', wywiad: 'Wywiad', diagnoza: 'Diagnoza'};
const source = (key, text) => ({id: (key === 'diagnoza' ? 'diagnosis:' : 'standard:') + key, field: key, label: LABEL[key], role: key === 'diagnoza' ? 'diagnosis' : 'standard', text, included: !!text.trim()});
const rowsOut = rows => rows.map(r => ({parameter_id: r.parameter_id, label: r.label, value: r.value, origin: r.origin, status: r.status, quotes: r.quotes, respelled: r.respelled,
  needs_review: r.needs_review, attribution: r.attribution, issues: r.assignment_issues.map(i => [i.message, i.quote, i.context, i.source_verified])}));

for (const c of golden.panel) {
  test(`local panel reader matches rc32: ${c.name}`, () => {
    const sources = c.keys.map(k => source(k, c.texts[k])), note = sources.map(s => s.text).join('\n\n');
    const built = D.buildFullPanel(note, D.TEMPLATE, {sources});
    assert.equal(built.text, c.text);
    assert.deepEqual(rowsOut(built.rows), c.rows);
    assert.deepEqual(D.sourcePanelValues(c.texts.badanie, D.TEMPLATE), c.values);
  });
}

test('spelling-only corrections follow rc32 word by word', () => {
  for (const [a, b, expected] of golden.spelling) assert.equal(D.spellingOnly(a, b), expected, `${a} => ${b}`);
});

test('only proven repetitions of source rows leave the panel narrative', () => {
  for (const c of golden.repetition) {
    const sources = [source('badanie', c.note)], built = D.buildFullPanel(c.note, D.TEMPLATE, {sources});
    const clean = D.removeRepeatedPanelFacts(c.text, D.TEMPLATE, built.rows);
    assert.equal(clean.text, c.kept, c.text);
    assert.deepEqual(clean.diagnostics.map(d => d.message), c.messages);
    assert.deepEqual(clean.diagnostics.map(d => d.evidence), c.evidence);
  }
});

function request(c) {
  const f = D.SAMPLE.fields, keys = c.scope === 'visit' || c.scope === 'diagnoza' ? ['badanie', 'wywiad', 'diagnoza'] : [c.scope];
  const outputs = c.scope === 'visit' ? ['badanie', 'wywiad'] : c.scope === 'diagnoza' ? [] : [c.scope];
  if (c.diagnosis) outputs.push('diagnoza');
  const sources = keys.map(k => ({...source(k, f[k]), included: k !== 'diagnoza' || c.diagnosis}));
  return {mode: c.rich ? 'rich' : 'faithful', panel: c.panel, diagnosis: c.diagnosis, sources, outputs, panelTarget: c.panel ? 'badanie' : '', snapshot: Object.fromEntries(keys.map(k => [k, f[k]]))};
}
for (const c of golden.generate) {
  const name = `${c.scope} · ${D.variantLabel(c)}`;
  test(`generated document matches rc32: ${name}`, () => {
    const g = D.generate(request(c));
    assert.deepEqual(g.sections.map(s => [s.key, s.label, s.text]), c.sections);
    assert.deepEqual(g.findings.map(f => [f.code, f.message, f.evidence || '']), c.findings);
    if (c.panel) { assert.deepEqual(rowsOut(g.panel.rows), c.rows); assert.equal(g.panel.heading + ':\n' + D.buildFullPanel(g.plan.panelSource, D.TEMPLATE, {sources: g.request.sources}).text, c.initial); }
    const doc = D.reviewDocument(g), selected = g.sections.map(s => s.key);
    for (const s of g.sections) assert.equal(doc.renderField(s.key), s.text, 'review document renders the proposal exactly');
    assert.equal(doc.inferenceCount, c.inference);
    assert.deepEqual([...doc.blocks.values()].map(b => [b.id, b.kind, b.text, b.origin]), c.blocks);
    const fields = Object.fromEntries(g.sections.map(s => [s.key, s.text]));
    const report = D.checkPreservation(g.contract, g.request.snapshot, fields, selected);
    assert.deepEqual(report.issues.map(i => [i.source_label, i.quote, i.message]), c.preservation);
  });
}
