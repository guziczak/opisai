'use strict';

// Layout contract of the Klinika mock-up and of the desktop's scroll areas, read from the stylesheets.
// kxp_mock.c lays the main form out on a virtual area of at least 1190x606 above its status bar; that height
// includes the menu (26) and the toolbar (70), which the demo keeps outside the scrolled form.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = name => fs.readFileSync(path.join(__dirname, '../assets', name), 'utf8');
const rule = (source, selector) => {
  const at = source.split('\n').find(line => line.startsWith(selector + '{'));
  assert.ok(at, `rule ${selector} exists`);
  return Object.fromEntries(at.slice(selector.length + 1, at.indexOf('}')).split(';').filter(Boolean).map(d => d.split(':').map(s => s.trim())));
};

test('the Klinika form scrolls only below the mock\'s minimum of 1190x510 (606 minus menu and toolbar)', () => {
  const clinic = css('clinic.css'), canvas = rule(clinic, '.kxp-canvas');
  assert.equal(canvas['min-width'], '1190px');
  assert.equal(parseInt(canvas['min-height'], 10), 606 - 26 - parseInt(rule(clinic, '.kxp-toolbar').height, 10));
  assert.equal(rule(clinic, '.kxp-menubar').height, '26px');
  // the six case-bar buttons (56 px each, 1 px apart, from 158) still fit into that minimum
  assert.ok(158 + 6 * 57 <= parseInt(canvas['min-height'], 10));
});

test('no scroll area of the desktop rubber-bands or chains its scrolling to the page', () => {
  const windows = css('windows.css');
  assert.match(windows, /^\*\{[^}]*overscroll-behavior:none[^}]*\}/m, 'the reset rule turns overscroll effects off for every element');
  for (const name of fs.readdirSync(path.join(__dirname, '../assets')).filter(f => f.endsWith('.css')))
    assert.doesNotMatch(css(name), /overscroll-behavior(-[xy])?:\s*(auto|contain)/, `${name} does not turn overscroll effects back on`);
});
