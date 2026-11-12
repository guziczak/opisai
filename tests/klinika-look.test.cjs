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
