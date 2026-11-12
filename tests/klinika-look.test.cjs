'use strict';

// The look of the Klinika mock-up, as far as it can be read without a browser: the drawings of
// assets/clinic-icons.js and what the rest of the mock-up relies on in them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const icons = (() => { const window = {}; vm.runInNewContext(read('assets/clinic-icons.js'), { window }); return window.KxpIcons; })();
const clinicJs = read('assets/clinic.js'), clinicCss = read('assets/clinic.css').replace(/\/\*[\s\S]*?\*\//g, '');
// The declarations of the rule that starts a line with this selector (the stylesheet keeps one rule per line).
const declarations = selector => { const line = clinicCss.split('\n').find(l => l.startsWith(selector + '{')); assert.ok(line, `rule ${selector} exists`);
  return Object.fromEntries(line.slice(selector.length + 1, line.indexOf('}')).split(';').filter(Boolean).map(d => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()])); };
// A minimal well-formedness check: every tag is closed in order, attributes are quoted, nothing but tags is left.
const TAG = /<(\/?)([A-Za-z][\w-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
const wellFormed = svg => { const stack = []; for (const m of svg.matchAll(TAG)) { if (m[1]) { if (stack.pop() !== m[2]) return false; } else if (!m[4]) stack.push(m[2]); } return !stack.length && svg.replace(TAG, '').trim() === ''; };

// The desktop shows a window in Task View, in the taskbar preview and on a virtual-desktop tile as a clone without
// ids. A drawing that clipped its shapes through url(#id) lost the clipping there whenever the original window was
// not displayed (minimised, or on another desktop): the cat's ginger patches then covered half of the head as a block.
test('patient illustrations: three kinds, decorative, shapes only, without ids or references', () => {
  assert.deepEqual([...icons.portraits], ['rat', 'cat', 'dog']);
  for (const kind of icons.portraits) {
    const svg = icons.portrait(kind);
    assert.match(svg, /^<svg class="kxp-portrait" viewBox="0 0 144 124" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">/, kind);
    assert.ok(wellFormed(svg), `${kind} is well formed`);
    assert.doesNotMatch(svg, /<image|href=|data:|<text|font-|Gradient|<filter|<use/, `${kind}: shapes only`);
    assert.doesNotMatch(svg, /\sid=|url\(#|<clipPath|<mask/, `${kind}: nothing that a clone without ids would lose`);
    assert.equal(icons.portrait(kind), svg, `${kind}: the same drawing on every call`);
  }
  for (const unknown of ['hamster', 'Cat', '', undefined, null]) assert.equal(icons.portrait(unknown), '');
});

// The owner and animal cards of the list's details pane begin with a heading line ("WŁAŚCICIEL", "ZWIERZĘ"). The
// summary below them begins with the visit's own text, which took the heading style up to the point where it wrapped.
test('visit list details: only the two cards that begin with a heading style their first line', () => {
  assert.match(clinicCss, /^\.kxp-list-details pre:not\(\.kxp-list-summary\)::first-line\{font-weight:600;color:#1d3f66\}$/m);
  assert.doesNotMatch(clinicCss, /\.kxp-list-details pre::first-line/, 'no first-line rule for every block of the pane');
  assert.match(clinicJs, /<pre data-list-owner><\/pre><pre data-list-animal><\/pre><pre class="kxp-list-summary" data-list-summary><\/pre>/);
  assert.match(clinicJs, /'\[data-list-owner\]'\)\.textContent = p \? `WŁAŚCICIEL\\n/);
  assert.match(clinicJs, /'\[data-list-animal\]'\)\.textContent = p \? `ZWIERZĘ\\n/);
  assert.match(clinicJs, /'\[data-list-summary\]'\)\.textContent = sel \? KEYS\.filter\(k => sel\.fields\[k\]\)\.map\(k => `\$\{LABELS\[k\]\}: /, 'the summary has no heading line');
});

// The bundled Selawik has a regular and a semibold face, and the windows use 600 for every emphasis. A <b> left at the
// browser's 700 looks the same with Selawik, but becomes Bold next to Semibold where the real Segoe UI is installed:
// the dates and field labels of the visit history were heavier than the heading above them.
test('emphasis in the Klinika windows is semibold: no bold element is left at the browser default of 700', () => {
  for (const m of clinicCss.matchAll(/font-weight:\s*([^;}]+)/g)) assert.ok(['400', '600'].includes(m[1]), `font-weight ${m[1]}`);
  assert.doesNotMatch(clinicCss, /font:[^;}]*\b(?:bold|[5-9]00)\b/, 'no weight hidden in a font shorthand');
  const semibold = selector => assert.match(clinicCss, new RegExp(`(?:^|,)${selector.replace(/\./g, '\\.')}(?:,[^{]*)?\\{[^}]*font-weight:600`, 'm'), `${selector} is semibold`);
  // every element of the markup that a browser renders bold by default: six <b>, the dialog headings, the table head
  assert.deepEqual([...clinicJs.matchAll(/<b(?: class="([\w-]+)")?>/g)].map(m => m[1] || 'b').sort(), ['b', 'b', 'b', 'b', 'b', 'kxp-nr-value']);
  assert.doesNotMatch(clinicJs, /<strong|<h[13-6]/);
  for (const selector of ['.kxp-nr-value', '.kxp-history-head b', '.kxp-cost b', '.kxp-h-date b', '.kxp-h-label b', '.clinic-dialog-body h2', '.clinic-data-table th']) semibold(selector);
  for (const [holder, count] of [['kxp-h-date', 1], ['kxp-h-label', 2], ['kxp-history-head', 1], ['kxp-cost', 1]])
    assert.equal((clinicJs.match(new RegExp(`class="${holder}">[^<]*(?:\\$\\{[^}]*\\}[^<]*)*<b>`, 'g')) || []).length, count, `<b> inside .${holder}`);
});

// The doctor's name is typed by the visitor ("Dane wizyty…", F4). A name longer than its 250 px chip ran on past the
// chip, white on the pale bar and across the status message.
test('status bar: the doctor\'s name is a box of its own that ends in an ellipsis inside the chip', () => {
  assert.match(clinicJs, /<span class="kxp-doctor">\$\{kx\('person', 18\)\}<span>\$\{esc\(m\.doctor \|\| DOCTOR\)\}<\/span><\/span>/);
  const name = /^\.kxp-doctor span\{([^}]*)\}$/m.exec(clinicCss);
  assert.ok(name, 'a rule for the name inside the chip');
  assert.match(name[1], /(?:^|;)overflow:hidden(?:;|$)/);
  assert.match(name[1], /(?:^|;)text-overflow:ellipsis(?:;|$)/);
  // the pixel that keeps the overhang of the last letter is taken back by the margin, so the chip's minimum width stays
  assert.match(name[1], /(?:^|;)padding-right:1px;margin-right:-1px(?:;|$)/);
  assert.match(clinicCss, /^\.kxp-status\{[^}]*white-space:nowrap/m, 'the bar is one line');
});

// Forced colours (Windows contrast themes) drop box-shadows and repaint borders and backgrounds in system colours.
// The fields and the rows of the visit list show keyboard focus only with a border colour and an inset shadow, after
// outline:0, so nothing was left of it there; two icons turned white by a filter vanished on a light palette; and the
// selected row lost its fill.
test('forced colours: an outline for fields and list rows, their own colours for the whitened icons, a fill for the selected row', () => {
  const forced = [...clinicCss.matchAll(/^@media \(forced-colors:active\)\{(.*)\}$/gm)].map(m => m[1]).join('');
  const ring = /(?:^|\})([^{}]+)\{outline:2px solid Highlight;outline-offset:-2px\}/.exec(forced);
  assert.ok(ring, 'one rule gives the outline');
  const ringed = ring[1].split(/,(?![^(]*\))/);
  for (const selector of ['.kxp-input:focus-visible', '.kxp-history:focus-visible', '.kxp-section .kxp-memo:focus-visible', '.kxp-list-filter input:focus-visible', '.kxp-list-table tr[data-list-row]:focus-visible', '.clinic-form-field :is(input,select,textarea):focus'])
    assert.ok(ringed.includes(selector), `${selector} gets an outline`);
  // each of them has a rule that removes the outline for the normal rendering; a seventh would need a place here too
  const removed = [...clinicCss.matchAll(/^([^{@\n]+)\{[^}]*outline:0[^}]*\}$/gm)].map(m => m[1]);
  assert.deepEqual(removed, ['.kxp-input', '.kxp-history', '.kxp-memo', '.kxp-list-filter input', '.kxp-list-table tr[data-list-row]:focus-visible', '.clinic-form-field input,.clinic-form-field select,.clinic-form-field textarea']);
  const whitened = [...clinicCss.matchAll(/^([^{@\n]+)\{filter:brightness\(0\) invert\(1\)\}$/gm)].map(m => m[1]);
  assert.deepEqual(whitened, ['.kxp-doctor .kxp-icon', '.clinic-button.primary .kxp-icon']);
  assert.ok(forced.includes(`${whitened.join(',')}{filter:none}`), 'the filter is off for both');
  assert.ok(forced.includes('.kxp-list-table tr.is-selected td{forced-color-adjust:none;background:SelectedItem;color:SelectedItemText}'));
  assert.ok(forced.includes('.kxp-list-table tr.is-selected:focus-visible{outline-color:SelectedItemText}'), 'the ring of the selected row is not drawn in the colour of its fill');
});

// The description fields were the only controls whose keyboard focus could not be told from their resting state: the
// border changed by 1.22:1 and a 30 % inner line by 1.61:1. They take the 2 px edge of the other fields. The second
// pixel is an inset shadow, because OpisAI's spelling lines and dictation panel measure the field's box, border,
// padding and font, and none of those may move.
test('description fields: keyboard focus is a 2 px edge that leaves the box of the field alone', () => {
  const focus = declarations('.kxp-section .kxp-memo:focus-visible');
  assert.deepEqual(focus, { 'border-color': 'var(--kx-focus)', 'box-shadow': 'inset 0 0 0 1px var(--kx-focus)' });
  assert.equal(declarations('.kxp-input:focus-visible')['box-shadow'], focus['box-shadow'], 'the same edge as the fields of the visit card');
  const memo = declarations('.kxp-memo');
  assert.equal(memo.border, '1px solid #7e92a5');
  assert.equal(memo.padding, '5px 7px');
  assert.equal(memo.margin, '0 10px');
  assert.equal(memo.font, '13px/1.5 "Segoe UI",Selawik,Tahoma,sans-serif');
  // the frame of a field that OpisAI points at comes later in the file and so wins over the focus edge
  assert.ok(clinicCss.indexOf('\n.kxp-section.is-target .kxp-memo{') > clinicCss.indexOf('\n.kxp-section .kxp-memo:focus-visible{'));
});
