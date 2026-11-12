/* Klinika XP mock-up icons and patient illustrations: original SVG drawn for this demonstration.
   The 47 names and motifs are those of the mock's icon set (calendar, scales, thermometer, case bags…);
   every icon is redrawn on a 32-unit grid with flat fills in one range of muted colours and rounded strokes,
   mostly 2 units wide.
   The three portraits stand in for the patient photo. No third-party artwork, not BRI artwork. */
(() => {
  'use strict';
  const C = {
    ink: '#33424f', slate: '#5f7181', steel: '#7c93a8', mist: '#a8b9c8', pale: '#e9eff4', paper: '#ffffff',
    blue: '#2f86c5', blueD: '#1f6aa6', blueP: '#dcecf8',
    green: '#3da57e', greenD: '#27876a', greenL: '#c3e7d7',
    gold: '#f6c548', goldD: '#dd9f22',
    orange: '#e7743b', orangeD: '#c4531f', red: '#d4553f', violet: '#8e76ad', skin: '#eba67d', grey: '#7b8894', greyD: '#5b6772'
  };
  const round = ' stroke-linecap="round" stroke-linejoin="round"';
  const line = (d, colour, width = 2) => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}"${round}/>`;
  const shape = (d, fill, stroke, width = 2) => `<path d="${d}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${width}"${round}` : ''}/>`;
  const box = (x, y, w, h, r, fill, stroke, width = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${width}"` : ''}/>`;
  const dot = (cx, cy, r, fill, stroke, width = 2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${width}"` : ''}/>`;
  const oval = (cx, cy, rx, ry, fill) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
  const turn = (deg, cx, cy, body) => `<g transform="rotate(${deg} ${cx} ${cy})">${body}</g>`;

  /* Shared pieces. */
  const medCase = line('M12 7V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V7', C.greenD, 2.2) + box(4, 7, 24, 21, 3.5, C.green) + line('M16 12.5v10M11 17.5h10', '#fff', 3.6);
  const sheets = marks => box(9.5, 6.5, 17, 22, 2, C.pale, C.mist) + box(5, 3, 17, 22, 2, C.paper, C.steel) + marks;
  const openBook = (edge, rule) => shape('M16 9.5C13.5 7 9 6.5 4 7v18.5c5-.5 9.5 0 12 2z', C.paper, edge) + shape('M16 9.5C18.5 7 23 6.5 28 7v18.5c-5-.5-9.5 0-12 2z', C.paper, edge)
    + line('M7.5 12h5M7.5 16h5M7.5 20h5M19.5 12h5M19.5 16h5M19.5 20h5', rule, 1.8);
  const tube = (x, level, liquid) => shape(`M${x} 4.5v18.5a3 3 0 0 0 6 0V4.5z`, '#f6f9fb')
    + shape(`M${x + 0.9} ${level}h4.2v${23 - level}a2.1 2.1 0 0 1-4.2 0z`, liquid)
    + line(`M${x} 4.5v18.5a3 3 0 0 0 6 0V4.5`, C.slate, 1.8) + line(`M${x - 0.4} 4.5h6.8`, C.slate, 2);
  const bag = (main, dark, emblem) => line('M11.5 9V7a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v2', dark, 2.2) + box(3.5, 8.5, 25, 20.5, 3.5, main)
    + shape('M3.5 12a3.5 3.5 0 0 1 3.5-3.5h18a3.5 3.5 0 0 1 3.5 3.5v2.5h-25z', dark) + box(14, 12.2, 4, 3.6, 1, '#ffffff') + emblem;
  const screen = (x, y, w, h, glass, edge) => box(x, y, w, h, 1.6, glass, edge, 1.8);

  const SHAPES = {
    star: shape('M16 4.5l3.12 8.21 8.77.43-6.85 5.5 2.31 8.47L16 22.3l-7.35 4.81 2.31-8.47-6.85-5.5 8.77-.43z', C.gold, C.goldD, 1.8),
    print: box(9, 3, 14, 9, 1.5, C.paper, C.steel) + box(3, 10, 26, 13, 3, C.slate) + box(6, 13, 4, 2, 1, '#9fe3b6') + box(8, 18, 16, 11, 1.5, C.paper, C.steel) + line('M12 22.5h8M12 25.5h5', C.mist, 1.8),
    bolt: shape('M19 3 7 18h7l-2 11 13-15.5h-7.5z', '#f6b545', '#de8f1f', 1.8),
    check: line('M5.5 17l6.5 6.5L26.5 8.5', C.green, 5),
    folder: shape('M3 9.5a2 2 0 0 1 2-2h7.2l2.8 3H27a2 2 0 0 1 2 2V26a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', C.goldD) + shape('M3 15a2 2 0 0 1 2-2h22a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', C.gold)
      + line('M21.5 12.5V3.5M17.5 7l4-4 4 4', '#fff', 5.4) + line('M21.5 12.5V3.5M17.5 7l4-4 4 4', C.blue, 2.6),
    pause: dot(16, 16, 13, '#4a94c9') + box(10.6, 10, 3.8, 12, 1.3, '#fff') + box(17.6, 10, 3.8, 12, 1.3, '#fff'),
    home: medCase,
    clipboard: box(6, 5, 20, 24, 2.5, C.paper, C.steel) + box(11, 2.5, 10, 6, 2, C.slate) + line('M11 17.5l3.5 3.5 6.5-7.5', '#e07b3c', 2.6),
    money: box(2.5, 8, 27, 16, 2.5, C.greenL, C.greenD) + dot(16, 16, 4.2, C.green) + dot(7.5, 16, 1.3, C.greenD) + dot(24.5, 16, 1.3, C.greenD),
    images: box(3, 4, 20, 17, 2, C.pale, C.mist) + box(8, 10, 21, 18, 2, C.paper, C.slate) + shape('M10.5 26l5.5-7 4 4.5 2.8-3 4.2 5.5z', '#6fb596') + dot(23.5, 15, 2, C.gold),
    next: shape('M5 13h13V8l10 8-10 8v-5H5z', '#3f8dc5', '#3f8dc5', 2),
    person: dot(16, 9.5, 5.8, C.blue) + shape('M4.5 29v-1.5C4.5 21.5 9.5 18 16 18s11.5 3.5 11.5 9.5V29z', C.blue) + shape('M12.6 18.4h6.8L16 24z', '#dcedf8'),
    dog: shape('M9.5 6.5C5 6 2.5 10.5 3.5 16.5c.6 3.4 2.6 5.2 4.6 4.2 1.6-.8 1.6-3.4 2-6z', C.greyD) + shape('M22.5 6.5c4.5-.5 7 4 6 10-.6 3.4-2.6 5.2-4.6 4.2-1.6-.8-1.6-3.4-2-6z', C.greyD)
      + shape('M16 4.5c5.2 0 8.5 3.4 8.5 8.4 0 3.2-1.2 5.2-2.4 7.4-1.3 4.4-3.2 7.2-6.1 7.2s-4.8-2.8-6.1-7.2C8.7 18.1 7.5 16.1 7.5 12.9c0-5 3.3-8.4 8.5-8.4z', C.grey)
      + shape('M16 15.5c2.6 0 4.6 2.6 4.6 6 0 3-1.9 5-4.6 5s-4.6-2-4.6-5c0-3.4 2-6 4.6-6z', C.pale) + shape('M13.4 19.2c0-1.2 5.2-1.2 5.2 0 0 1.7-1.2 3-2.6 3s-2.6-1.3-2.6-3z', C.ink) + dot(11.8, 13.2, 1.5, C.ink) + dot(20.2, 13.2, 1.5, C.ink),
    calendar: box(3, 5, 26, 24, 3, C.paper) + shape('M3 8a3 3 0 0 1 3-3h20a3 3 0 0 1 3 3v4.5H3z', '#4c8fc6') + box(3, 5, 26, 24, 3, 'none', C.steel) + line('M10 2.5v5M22 2.5v5', C.ink, 2.6)
      + [8.3, 14.3, 20.3].map(x => box(x, 15.5, 3.4, 3.4, 0.6, C.mist) + box(x, 21.5, 3.4, 3.4, 0.6, C.mist)).join(''),
    clock: dot(16, 16, 12.5, C.paper, '#6c8aa5', 2.5) + line('M16 9v7.5l5 3', '#3f5468', 2.5),
    scales: line('M16 7v20', '#b88a2c', 2.2) + line('M10 28h12', '#b88a2c', 2.6) + line('M5.5 9.5h21', '#cfa03c', 2.2) + line('M8 10l-4.5 9M8 10l4.5 9M24 10l-4.5 9M24 10l4.5 9', '#cfa03c', 1.4)
      + shape('M2.5 19h11a5.5 4.5 0 0 1-11 0z', C.gold) + shape('M18.5 19h11a5.5 4.5 0 0 1-11 0z', C.gold) + dot(16, 6.5, 2.6, '#cfa03c'),
    therm: shape('M13 6a3 3 0 0 1 6 0v12.6a5.5 5.5 0 1 1-6 0z', C.paper, C.slate) + line('M16 21V10', C.red, 2.4) + dot(16, 23.2, 3.1, C.red) + line('M22.5 7.5h3M22.5 11.5h3M22.5 15.5h3', '#8a9baa', 1.6),
    notes: sheets(line('M9 8.5h9', C.blue, 2.2) + line('M9 13h9M9 17h9M9 21h5', C.mist, 1.8)),
    pen: shape('M21.5 4.5l6 6L11 27l-6-6z', C.green) + line('M9.5 21.5L22 9', '#a5dcc6', 1.6) + shape('M5 21l6 6-8 2z', '#f1d39a') + shape('M3 29l.9-3 2.1 2.1z', C.ink)
      + shape('M21.5 4.5l1.8-1.8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-1.8 1.8z', C.greenD),
    camera: shape('M11.5 9l1.6-3h5.8l1.6 3z', C.slate) + box(3, 8.5, 26, 18.5, 3, '#f3f6f8', C.slate) + dot(16, 17.5, 5.6, '#6f8ea8') + dot(16, 17.5, 2.8, '#dbe8f2') + dot(24.5, 12.5, 1.2, C.slate),
    info: dot(16, 16, 13, '#7790a6') + dot(16, 10.2, 2, '#fff') + line('M16 15v8', '#fff', 3.4),
    syringe: turn(-45, 16, 16, line('M1 16h7', C.slate, 1.6) + box(7.5, 14, 3, 4, 0.8, C.slate) + box(10.5, 11, 13, 10, 1.5, '#e4f5ee', C.greenD) + box(11.5, 12, 7, 8, 0, C.green)
      + box(23.5, 8.5, 2.2, 15, 1.1, C.greenD) + box(25.5, 15, 4, 2, 0, C.slate) + box(29, 11, 2.2, 10, 1.1, '#4a78b0')),
    search: '<circle cx="19.5" cy="12.5" r="8" fill="#cfe6f6" fill-opacity=".55" stroke="' + C.blue + '" stroke-width="3"/>' + line('M13.6 18.4L5 27', '#4b6478', 4),
    tubes: tube(3, 13, C.green) + tube(13, 15.5, '#3b8fc0') + tube(23, 18, '#e3b23c'),
    docs: box(4, 3, 15, 19, 2, C.paper, '#8696a3') + line('M8 8h7M8 12h4', C.mist, 1.8) + shape('M13 10.5h9.5l5.5 5.5V27a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V12.5a2 2 0 0 1 2-2z', C.paper, C.slate)
      + shape('M22.5 10.5V16H28z', C.pale, C.slate) + line('M15 20.5h9M15 24.5h9', C.mist, 1.8),
    close: line('M8.5 8.5l15 15M23.5 8.5l-15 15', '#6b7b89', 4.4),
    shield: shape('M16 3l11 4v8.5c0 6.8-4.8 11-11 13.5C9.8 26.5 5 22.3 5 15.5V7z', C.green) + line('M11 15.5l3.5 3.5 6.5-7', '#fff', 2.6),
    plus: medCase,
    book: openBook('#4f86b8', '#a7c3dc'),
    store: box(5, 12, 22, 17, 1.5, C.blueP, C.steel) + shape('M3 12.5l3-7.5h20l3 7.5a3.2 3.2 0 0 1-6.5 0 3.2 3.2 0 0 1-6.5 0 3.2 3.2 0 0 1-6.5 0 3.2 3.2 0 0 1-6.5 0z', '#4c8fc6') + box(13, 19, 6, 10, 1, C.paper, C.steel, 1.6) + box(7.5, 18.5, 3.5, 4, 0.6, C.paper) + box(21, 18.5, 3.5, 4, 0.6, C.paper),
    list: box(5, 3, 22, 26, 2.5, C.paper, C.steel) + dot(10, 10, 1.5, C.blue) + dot(10, 16, 1.5, C.blue) + dot(10, 22, 1.5, C.blue) + line('M14 10h9M14 16h9M14 22h6', C.mist, 1.8),
    save: shape('M5 3h18l6 6v18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', '#4a8bbd') + box(9, 3, 12, 8, 1, '#dce9f3') + box(16.5, 4.5, 3, 5, 0.6, C.blueD) + box(8, 17, 16, 12, 1.5, C.paper),
    mic: box(11.5, 3, 9, 15.5, 4.5, C.blue) + line('M7.5 14.5a8.5 8.5 0 0 0 17 0', '#566b7c', 2.2) + line('M16 23v4.5M11 28h10', '#566b7c', 2.2),
    ai: dot(16, 16, 13.5, '#3b8cc2') + line('M10.5 11.5h11L16 21.5z', '#fff', 1.8) + dot(10.5, 11.5, 2.4, '#fff') + dot(21.5, 11.5, 2.4, '#fff') + dot(16, 21.5, 2.4, '#fff'),
    pain: dot(16, 16, 13, C.skin) + oval(11.5, 13, 1.6, 2.1, '#5a4038') + oval(20.5, 13, 1.6, 2.1, '#5a4038') + line('M11 21.5h10', '#5a4038', 2.2),
    more: dot(16, 6, 2.4, C.slate) + dot(16, 16, 2.4, C.slate) + dot(16, 26, 2.4, C.slate),
    window: box(3, 4, 26, 24, 2.5, C.paper) + shape('M3 6.5A2.5 2.5 0 0 1 5.5 4h21A2.5 2.5 0 0 1 29 6.5V10H3z', C.violet) + box(3, 4, 26, 24, 2.5, 'none', '#6d6f88')
      + [[7, 13.5], [17.5, 13.5], [7, 20.5], [17.5, 20.5]].map(([x, y]) => box(x, y, 7.5, 4.5, 1, '#f0edf5', '#8d8fa6', 1.5)).join(''),
    chat: shape('M4.5 3.5h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-4.5 4v-4h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', C.paper, C.steel) + dot(23.5, 18.5, 3.8, '#3b8cc2', '#fff', 1.5) + shape('M16 30.5a7.5 7 0 0 1 15 0z', '#3b8cc2', '#fff', 1.5),
    diag: box(4, 3, 18, 24, 2, C.paper, '#7088a8') + line('M8 8.5h10M8 12.5h10M8 16.5h6', '#8fa8c4', 1.8) + dot(23, 23.5, 6.5, C.green, '#fff', 1.5) + line('M19.8 23.6l2.4 2.4 4.2-4.8', '#fff', 2),
    link: turn(-45, 16, 16, box(3, 11.5, 15, 9, 4.5, 'none', '#5f87a2', 2.8) + box(14, 11.5, 15, 9, 4.5, 'none', '#7aa3ba', 2.8)),
    caseStart: bag(C.orange, C.orangeD, shape('M13.5 17.5l7.5 4.2-7.5 4.2z', '#fff4e3', '#fff4e3', 1.2)),
    caseVisit: bag(C.grey, C.greyD, box(9, 17.5, 6, 4, 1, '#e6ebef') + box(17, 17.5, 6, 4, 1, '#b7c1ca') + box(9, 23, 6, 3.5, 1, '#b7c1ca') + box(17, 23, 6, 3.5, 1, '#e6ebef')),
    caseTreat: bag(C.grey, C.greyD, turn(-35, 16, 22, box(9.5, 19.5, 13, 5, 2.5, '#fff') + shape('M16 19.5h4a2.5 2.5 0 0 1 0 5h-4z', '#c3ccd4'))),
    caseBill: bag(C.grey, C.greyD, line('M19.2 18.6c-.9-1.2-5.8-1.6-5.8 1 0 2.8 5.9 1.6 5.9 4.5 0 2.6-5 2.4-6.3 1', '#fff', 1.8) + line('M16.2 16.6v10.6', '#fff', 1.3)),
    caseNext: bag(C.grey, C.greyD, line('M10.5 22h10M17 18l4 4-4 4', '#fff', 2.2)),
    monitors: screen(2, 4, 14, 10.5, '#9aa9b6', C.greyD) + screen(16, 7, 14, 10.5, '#9aa9b6', C.greyD) + screen(8, 14, 16, 11.5, '#d3dee7', '#4b5863') + line('M16 25.5v3M12 29h8', '#4b5863', 2),
    bookCheck: openBook('#6b7884', '#b3bcc5') + line('M17.5 23l4 4 8-9.5', '#fff', 6.5) + line('M17.5 23l4 4 8-9.5', C.green, 3.6)
  };
  const svg = (name, size = 24, extra = '') => Object.hasOwn(SHAPES, name)
    ? `<svg class="kxp-icon ${extra}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${SHAPES[name]}</svg>`
    : '';

  /* Patient illustrations for the photo slot: one calm, flat portrait per species of the demo's three fictional
     patients, on a shared pale backdrop. Drawn 144 units wide; the slot shows the top 124 units above its caption,
     the rest is bleed. Shapes only: no outlines, no gradients, and no likeness of a real animal. No ids and no
     url(#…) either: the desktop shows a window's thumbnail as a clone without ids, and a reference from the clone
     into a window that is not displayed (minimised, or on another desktop) is not applied. */
  const backdrop = '<rect width="144" height="144" fill="#e3ecf4"/><circle cx="72" cy="66" r="54" fill="#eef4f9"/>';
  const hair = (d, colour) => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="1.1" stroke-linecap="round"/>`;
  const PORTRAITS = {
    /* Hooded fancy rat, black and white: tail, off-white body, the hood over the shoulders, paws under it, ears, head, face. */
    rat: () => backdrop + '<g transform="translate(0 -8)">'
      + '<path d="M104 126c10 3 20-2 23-12 2-7 2-14 0-20" fill="none" stroke="#d6a8a2" stroke-width="4.2" stroke-linecap="round"/>'
      + '<path d="M32 160c-4-32 8-54 26-62h28c18 8 30 30 26 62z" fill="#ece7df"/>'
      + '<ellipse cx="72" cy="106" rx="23" ry="13.5" fill="#303136"/>'
      + '<ellipse cx="65.5" cy="118.5" rx="4.8" ry="3.4" fill="#e6b3ac"/><ellipse cx="78.5" cy="118.5" rx="4.8" ry="3.4" fill="#e6b3ac"/>'
      + '<ellipse cx="45" cy="46" rx="10.5" ry="12.5" fill="#d8aaa4" transform="rotate(-24 45 46)"/><ellipse cx="46" cy="47.2" rx="6.3" ry="8" fill="#c39089" transform="rotate(-24 46 47.2)"/>'
      + '<ellipse cx="99" cy="46" rx="10.5" ry="12.5" fill="#d8aaa4" transform="rotate(24 99 46)"/><ellipse cx="98" cy="47.2" rx="6.3" ry="8" fill="#c39089" transform="rotate(24 98 47.2)"/>'
      + '<path d="M72 35c18 0 30 11 30 25 0 11-8 21-15 29-4 6-9 10-15 10s-11-4-15-10c-7-8-15-18-15-29 0-14 12-25 30-25z" fill="#303136"/>'
      + '<ellipse cx="72" cy="86.5" rx="11.5" ry="10.5" fill="#393b40"/>'
      + '<path d="M68.4 82.6c0-1.8 7.2-1.8 7.2 0 0 2.6-1.6 4.6-3.6 4.6s-3.6-2-3.6-4.6z" fill="#e39aa1"/>'
      + '<path d="M72 87.2v3.4M68.5 91.6c1.2 1 2.6.6 3.5-1 .9 1.6 2.3 2 3.5 1" fill="none" stroke="#1d1e21" stroke-width="1" stroke-linecap="round"/>'
      + '<circle cx="56" cy="62" r="4.1" fill="#0c0d0f"/><circle cx="88" cy="62" r="4.1" fill="#0c0d0f"/><circle cx="54.8" cy="60.7" r="1.1" fill="#fff"/><circle cx="86.8" cy="60.7" r="1.1" fill="#fff"/>'
      + hair('M61 85.5 35 80M60.5 88 33 89M61.5 90.5 37 98M83 85.5l26-5.5M83.5 88 111 89M82.5 90.5l24.5 7.5', '#a7b0b9') + '</g>',
    /* Tortoiseshell cat: body and head in dark brown with ginger patches, one ear of each colour, face. The two patches
       that reach the edge of the head are cut along its outline (computed crossings, hence two decimals). */
    cat: () => backdrop + '<g transform="translate(0 -4)">'
      + '<path d="M22 150c2-30 20-54 50-54s48 24 50 54z" fill="#3a322f"/>'
      + '<path d="M22 150c2-18 12-32 26-40 6 12 4 28-2 40z" fill="#d58a3f"/><path d="M90 108c12 4 22 16 26 30-10-2-22-12-26-30z" fill="#dfa35d"/>'
      + '<path d="M39 60 34 26c-.4-3 2.4-4.4 4.6-2.6L64 42z" fill="#3a322f"/><path d="M42 52 39.5 32 55 43.5z" fill="#6b4f48"/>'
      + '<path d="M105 60l5-34c.4-3-2.4-4.4-4.6-2.6L80 42z" fill="#d58a3f"/><path d="M102 52l2.5-20L89 43.5z" fill="#eec29b"/>'
      + '<path d="M72 38c18 0 34 8 37 24 2 12-5 24-17 31-6 4-14 6-20 6s-14-2-20-6c-12-7-19-19-17-31 3-16 19-24 37-24z" fill="#3a322f"/>'
      + '<path d="M67.06 38.21c.79 7.61-4.76 12.98-3.06 19.79 2 8-4 14-10 20-3.37 3.37-7.37 5.48-12.35 6.32-5.37-6.48-7.97-14.4-6.65-22.32 2.72-14.52 16.15-22.45 32.06-23.79z" fill="#d58a3f"/><path d="M41 52c4-3 9 0 8 5-3 4-9 1-8-5z" fill="#3a322f"/>'
      + '<path d="M105.04 52.28c-5.88 1.5-13.36-.6-19.04-6.28-1.85-2.47-2.94-4.94-3.03-6.94 9.36 1.88 17.37 6.29 22.07 13.22z" fill="#d58a3f"/>'
      + '<path d="M60.5 80.5c3.5-3.5 9.5-3.5 11.5 0v8.5c-2 2.5-6 3.5-9.5 2-3.5-2-4.5-7-2-10.5z" fill="#dd9a50"/><path d="M83.5 80.5c-3.5-3.5-9.5-3.5-11.5 0v8.5c2 2.5 6 3.5 9.5 2 3.5-2 4.5-7 2-10.5z" fill="#443a36"/>'
      + '<path d="M49.5 66.5c2.5-6.5 11.5-7.5 15.5-1.5-2.5 6.5-11.5 7-15.5 1.5z" fill="#c2b653" stroke="#2f2521" stroke-width=".6"/><path d="M94.5 66.5c-2.5-6.5-11.5-7.5-15.5-1.5 2.5 6.5 11.5 7 15.5 1.5z" fill="#c2b653" stroke="#2f2521" stroke-width=".6"/>'
      + '<ellipse cx="57.3" cy="65.8" rx="2.6" ry="4.5" fill="#1b1816"/><ellipse cx="86.7" cy="65.8" rx="2.6" ry="4.5" fill="#1b1816"/><circle cx="55.9" cy="64" r="1" fill="#fff"/><circle cx="85.3" cy="64" r="1" fill="#fff"/>'
      + '<path d="M68.8 77.6h6.4L72 81.6z" fill="#b8736b" stroke="#b8736b" stroke-width="1.2" stroke-linejoin="round"/>'
      + '<path d="M72 82.4v3.6M72 86c-1.2 1.8-3 2.2-4.6 1.4M72 86c1.2 1.8 3 2.2 4.6 1.4" fill="none" stroke="#4a352e" stroke-width="1.1" stroke-linecap="round"/>'
      + hair('M61 84 38 80.5M61 86.5 37 89M62 89 42 96.5M83 84l23-3.5M83 86.5l24 2.5M82 89l20 7.5', '#f4f0e9') + '</g>',
    /* Ginger mixed-breed dog: body with a cream chest, blue collar and tag, drop ears, head, cream muzzle, face. */
    dog: () => backdrop + '<g transform="translate(0 -6)">'
      + '<path d="M22 156c2-30 20-52 50-52s48 22 50 52z" fill="#c27238"/><path d="M60 156c-2-24 3-42 12-42s14 18 12 42z" fill="#edcfa8"/>'
      + '<path d="M49 106c9 8 37 8 46 0l2 6.5c-10 8.5-40 8.5-50 0z" fill="#3f7fb3"/><circle cx="72" cy="121.5" r="3.4" fill="#efc050"/>'
      + '<path d="M53 33c-9-5-21-1-24 11-3 11 2 23 9 27 5-6 6-15 10-23 2-5 4-10 5-15z" fill="#a55c28"/><path d="M91 33c9-5 21-1 24 11 3 11-2 23-9 27-5-6-6-15-10-23-2-5-4-10-5-15z" fill="#a55c28"/>'
      + '<path d="M72 30c18 0 30 12 30 28 0 10-4 18-9 26-3 12-11 22-21 22s-18-10-21-22c-5-8-9-16-9-26 0-16 12-28 30-28z" fill="#cc7b3c"/>'
      + '<path d="M72 69c8.5 0 15 7.5 15 18s-6.5 17-15 17-15-6.5-15-17 6.5-18 15-18z" fill="#edcfa8"/>'
      + '<path d="M65 75.5c0-3 14-3 14 0 0 4-3.5 7.5-7 7.5s-7-3.5-7-7.5z" fill="#2a2422"/><ellipse cx="69.5" cy="75.3" rx="2.2" ry="1.1" fill="#554b47"/>'
      + '<path d="M72 83v5.5M64.5 91.5c2.6 2 5.6 1.2 7.5-3M79.5 91.5c-2.6 2-5.6 1.2-7.5-3" fill="none" stroke="#9a7557" stroke-width="1.3" stroke-linecap="round"/>'
      + '<ellipse cx="59" cy="59" rx="3.6" ry="4" fill="#2a1f19"/><ellipse cx="85" cy="59" rx="3.6" ry="4" fill="#2a1f19"/><circle cx="57.9" cy="57.7" r="1" fill="#fff"/><circle cx="83.9" cy="57.7" r="1" fill="#fff"/></g>'
  };
  const portrait = kind => Object.hasOwn(PORTRAITS, kind)
    ? `<svg class="kxp-portrait" viewBox="0 0 144 124" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false">${PORTRAITS[kind]()}</svg>`
    : '';
  window.KxpIcons = { svg, names: Object.keys(SHAPES), portrait, portraits: Object.keys(PORTRAITS) };
})();
