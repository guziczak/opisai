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
