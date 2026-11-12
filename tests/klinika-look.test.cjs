'use strict';

// The look of the Klinika mock-up, as far as it can be read without a browser: the icon set and the patient
// illustrations of assets/clinic-icons.js, the numbers that assets/clinic.css and assets/ASSET_SOURCES.md state about
// the rendering, the places of the blocks, and the rules behind the states that were once wrong.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const icons = (() => { const window = {}; vm.runInNewContext(read('assets/clinic-icons.js'), { window }); return window.KxpIcons; })();
const clinicJs = read('assets/clinic.js'), clinicCssText = read('assets/clinic.css'), clinicCss = clinicCssText.replace(/\/\*[\s\S]*?\*\//g, ''), sources = read('assets/ASSET_SOURCES.md');
// The declarations of the rule that starts a line with this selector (the stylesheet keeps one rule per line).
const declarations = selector => { const line = clinicCss.split('\n').find(l => l.startsWith(selector + '{')); assert.ok(line, `rule ${selector} exists`);
  return Object.fromEntries(line.slice(selector.length + 1, line.indexOf('}')).split(';').filter(Boolean).map(d => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()])); };
// A minimal well-formedness check: every tag is closed in order, attributes are quoted, nothing but tags is left.
const TAG = /<(\/?)([A-Za-z][\w-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
const wellFormed = svg => { const stack = []; for (const m of svg.matchAll(TAG)) { if (m[1]) { if (stack.pop() !== m[2]) return false; } else if (!m[4]) stack.push(m[2]); } return !stack.length && svg.replace(TAG, '').trim() === ''; };
const luminance = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// A colour of a declaration: the first #rrggbb in it, or the value of the custom property it names.
const colour = value => { const v = /var\(--([\w-]+)\)/.exec(value); return v ? new RegExp(`--${v[1]}:(#[0-9a-f]{6})`).exec(clinicCss)[1] : /#[0-9a-f]{6}/.exec(value)[0]; };

/* ------------------------------------------------------------------ the drawings */
const NAMES = ['star', 'print', 'bolt', 'check', 'folder', 'pause', 'home', 'clipboard', 'money', 'images', 'next', 'person', 'dog', 'calendar', 'clock', 'scales', 'therm', 'notes', 'pen', 'camera', 'info', 'syringe', 'search', 'tubes', 'docs', 'close', 'shield', 'plus', 'book', 'store', 'list', 'save', 'mic', 'ai', 'pain', 'more', 'window', 'chat', 'diag', 'link', 'caseStart', 'caseVisit', 'caseTreat', 'caseBill', 'caseNext', 'monitors', 'bookCheck'];

test('the icon set keeps its 47 names in their order', () => {
  assert.deepEqual([...icons.names], NAMES);
});

test('every icon is one well-formed, decorative SVG on the 32-unit grid, without ids, references, bitmaps or text', () => {
  for (const name of icons.names) {
    const svg = icons.svg(name, 24);
    assert.match(svg, /^<svg class="kxp-icon " width="24" height="24" viewBox="0 0 32 32" aria-hidden="true" focusable="false">/, name);
    assert.ok(wellFormed(svg), `${name} is well formed`);
    assert.doesNotMatch(svg, /\sid=|url\(#|<image|href=|data:|<text|font-|Gradient|<filter|<use/, `${name}: shapes only`);
  }
  assert.match(icons.svg('star', 16, 'kxp-at-date'), /^<svg class="kxp-icon kxp-at-date" width="16" height="16" /, 'size and extra class are taken');
});

// A name is looked up as an own key of the tables. A truthiness test took whatever the prototype holds: svg('constructor')
// returned an <svg> around a function's source and portrait('__proto__') threw.
test('icon and illustration names are own keys only: names from the prototype give nothing', () => {
  for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
    assert.equal(icons.svg(name), '', `svg('${name}')`);
    assert.equal(icons.portrait(name), '', `portrait('${name}')`);
  }
  for (const missing of ['no-such-icon', 'Star', '', undefined, null]) assert.equal(icons.svg(missing), '');
  assert.ok(icons.svg('star').startsWith('<svg ') && icons.portrait('rat').startsWith('<svg '), 'the real names still draw');
});

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

test('every fictional patient names an existing illustration; the slot keeps its title, caption and camera fallback', () => {
  const kinds = [...clinicJs.matchAll(/portrait: '(\w+)'/g)].map(m => m[1]);
  assert.deepEqual(kinds, ['rat', 'cat', 'dog']);
  for (const kind of kinds) assert.ok(icons.portraits.includes(kind), kind);
  assert.match(clinicJs, /class="kxp-photo\$\{art \? ' has-portrait' : ''\}" data-kxp="photo" title="Zdjęcie zwierzęcia">\$\{art \|\| kx\('camera', 56\)\}<span>zdjęcie niedostępne<\/span>/);
});

/* ------------------------------------------------------------------ what the files say about the rendering */
test('the stylesheet keeps its word: type of at least 11 px, 4.5:1 for text on the bars, 3:1 for the edges of fields and dialog buttons, a 2 px focus ring', () => {
  for (const m of clinicCss.matchAll(/font(?:-size)?:\s*([\d.]+)px/g)) assert.ok(+m[1] >= 11, `font size ${m[1]}px`);
  assert.match(clinicCssText, /11 px for the program's captions, 12 px for data and 13 px for the memo fields/);
  assert.equal(declarations('.kxp-memo').font.split('/')[0], '13px');
  assert.ok(contrast('#ffffff', colour('var(--kx-bar)')) >= 4.5, 'white text on card headers and status chips');
  assert.ok(contrast('#ffffff', colour(declarations('.kxp-menubar').background)) >= 4.5, 'white text on the menu bar');
  assert.ok(contrast('#ffffff', colour(declarations('.clinic-button.primary').background)) >= 4.5, 'white text on a filled button');
  // The exception that both files name: a disabled button is dimmed as a whole. No other rule fades a text.
  assert.match(clinicCssText, /text\s+contrast of at least 4\.5:1 \(disabled buttons excepted\), edges of fields and dialog buttons of at least 3:1/);
  assert.deepEqual([...clinicCss.matchAll(/^([^{@\n]+)\{[^}]*opacity:(?!1[;}])[^}]*\}$/gm)].map(m => m[1]), ['.kxp-side-item .kxp-icon', '.clinic-button:disabled'], 'only an icon and the disabled button are faded');
  // Edges of fields against their fill (white, or the read-only grey) and of dialog buttons against what they stand on.
  const readOnly = colour(declarations('.kxp-input[readonly]').background), footer = colour(declarations('.clinic-dialog-footer').background);
  assert.equal(colour(declarations('.clinic-form-field input[readonly]').background), readOnly);
  for (const [selector, grounds] of [['.kxp-input', ['#ffffff', readOnly]], ['.kxp-memo', ['#ffffff']], ['.kxp-list-filter input', ['#ffffff']], ['.clinic-form-field input,.clinic-form-field select,.clinic-form-field textarea', ['#ffffff', readOnly]], ['.clinic-button', ['#ffffff', footer]]])
    for (const ground of grounds) assert.ok(contrast(colour(declarations(selector).border), ground) >= 3, `edge of ${selector} on ${ground}: ${contrast(colour(declarations(selector).border), ground).toFixed(2)}:1`);
  assert.ok(contrast(colour('var(--kx-focus)'), '#ffffff') >= 3, 'focus ring on white');
  assert.match(clinicCss, /button:focus-visible\{outline:2px solid var\(--kx-focus\);outline-offset:-2px\}/);
  assert.match(clinicCss, /@media \(prefers-reduced-motion:reduce\)\{[^@]*transition:none!important/);
});

test('ASSET_SOURCES says of the drawings what the module holds', () => {
  assert.match(sources, /holds 47 icons and three patient illustrations/);
  assert.equal(icons.names.length, 47); assert.equal(icons.portraits.length, 3);
  // "a 32-unit grid, flat fills in one range of muted colours, and rounded strokes, mostly 2 units wide"
  assert.match(sources, /a 32-unit grid, flat fills in one range of muted colours, and rounded strokes, mostly 2 units wide/);
  const all = icons.names.map(name => icons.svg(name)).join(''), widths = new Map();
  for (const m of all.matchAll(/stroke-width="([\d.]+)"/g)) widths.set(m[1], (widths.get(m[1]) || 0) + 1);
  assert.equal([...widths].sort((a, b) => b[1] - a[1])[0][0], '2', 'the commonest stroke width');
  const near = [...widths].filter(([w]) => +w >= 1.5 && +w <= 2.6).reduce((n, [, count]) => n + count, 0), total = [...widths.values()].reduce((a, b) => a + b, 0);
  assert.ok(near / total > 0.8, `${near} of ${total} strokes are 1.5 to 2.6 units wide`);
  assert.ok((all.match(/stroke-linecap="round"/g) || []).length > 60, 'rounded strokes');
  assert.match(sources, /text contrast of at least 4\.5:1 \(disabled buttons excepted\)/);
});

// The sources say that the blocks are within two pixels of the mock's and that the ID became an 18 px chip.
test('the blocks of the form keep their places and sizes', () => {
  const box = (selector, expected) => { const rule = declarations(selector); for (const [k, v] of Object.entries(expected)) assert.equal(rule[k], v, `${selector} ${k}`); };
  box('.kxp-visit-card', { left: '6px', top: '6px', width: '276px', height: '145px' });
  box('.kxp-owner', { left: '288px', top: '6px', width: '286px', height: '145px' });
  box('.kxp-animal', { left: '580px', top: '6px', width: '326px', height: '145px' });
  box('.kxp-photo', { left: '913px', top: '6px', width: '145px', height: '145px' });
  box('.kxp-panel>header', { height: '23px' }); box('.kxp-chip', { 'line-height': '18px' });
  box('.kxp-side', { left: '6px', top: '158px', width: '104px' }); box('.kxp-side-item', { height: '56px' });
  box('.kxp-pager', { left: '115px', top: '158px', right: '10px', height: '56px' }); box('.kxp-step', { height: '56px' });
  box('.kxp-history-head', { left: '151px', top: '220px', right: '10px', height: '22px' });
  box('.kxp-history', { left: '151px', top: '244px', right: '10px', bottom: '10px' });
  box('.kxp-status', { height: '26px' }); box('.kxp-cost', { width: '245px' }); box('.kxp-doctor', { width: '250px' });
  box('.kxp-section-head', { height: '57px' }); box('.kxp-section-title', { width: '275px', height: '57px' }); box('.kxp-editor-status', { height: '24px' });
});

/* ------------------------------------------------------------------ states that were once wrong */
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
  // The box clips without becoming a scroll container. A scroll container (overflow:hidden) is placed on whole device
  // pixels, and at display scales such as 150 % or 175 % that moved the default name by one pixel against the label of
  // the chip beside it. hidden stays in front for browsers without overflow:clip. A clipping box that does not scroll
  // keeps its content width as a flex item, so it needs min-width:0 to shrink to the chip.
  assert.match(name[1], /(?:^|;)min-width:0;overflow:hidden;overflow:clip(?:;|$)/);
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

// What the refresh and earlier changes left behind: a class that the section tools carried after both of its rules were
// gone, a margin that a more specific rule always replaced, and rules that repeated another one or matched nothing.
test('no leftovers: no class without a rule on the section tools, no shadowed, repeated or unused rule', () => {
  assert.doesNotMatch(clinicJs, /is-unavailable/);
  assert.deepEqual([...new Set([...clinicJs.matchAll(/class="kxp-section-tool\$\{[^`]*?\}"/g)].flatMap(m => [...m[0].matchAll(/' ([\w-]+)'/g)].map(c => c[1])))], ['pair-start'], 'the only optional class of a section tool');
  assert.deepEqual(clinicCss.split('\n').filter(line => line.includes('pair-start')), ['.kxp-section-tools .kxp-section-tool.pair-start{margin-left:24px}']);
  assert.equal(declarations('.kxp-side').top, '158px');
  assert.doesNotMatch(clinicCss, /\[data-mode=saved\] \.kxp-side\{/, 'the case bar has one top for every mode');
  assert.deepEqual(clinicCss.split('\n').filter(line => line.includes('.clinic-empty-cell')).map(line => line.slice(0, line.indexOf('{'))), ['.clinic-data-table .clinic-empty-cell']);
  assert.doesNotMatch(clinicCss, /\.clinic-form-field\.full/);
  assert.doesNotMatch(clinicJs, /clinic-form-field [\w-]/, 'the dialog fields have no modifier class');
});
