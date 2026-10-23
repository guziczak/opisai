/* OpisAI desktop demo: inline SVG assets, no icon-font or network dependency. */
(() => {
  'use strict';
  let serial = 0;
  const p = d => `<path d="${d}"/>`;
  const mono = {
    blank: '',
    search: '<circle cx="8.5" cy="8.5" r="5.75"/>' + p('m12.8 12.8 4.45 4.45'),
    taskview: '<rect x="2.5" y="4" width="10" height="12" rx="1.5"/>' + p('M15 4h1.5A1.5 1.5 0 0 1 18 5.5v9a1.5 1.5 0 0 1-1.5 1.5H15'),
    widgets: '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/>' + p('M9 3.5v13M9 9.5h8.5'),
    chevronUp: p('m4.5 12.75 5.5-5.5 5.5 5.5'),
    chevronDown: p('m4.5 7.25 5.5 5.5 5.5-5.5'),
    chevronLeft: p('m12.75 4.5-5.5 5.5 5.5 5.5'),
    chevronRight: p('m7.25 4.5 5.5 5.5-5.5 5.5'),
    wifi: p('M2 6.75a12.5 12.5 0 0 1 16 0M4.8 9.9a8.3 8.3 0 0 1 10.4 0M7.5 13a4 4 0 0 1 5 0') + '<circle cx="10" cy="16.1" r=".9" fill="currentColor" stroke="none"/>',
    wifiOff: p('M2 6.75a12.5 12.5 0 0 1 16 0M5.4 9.5a8.2 8.2 0 0 1 9.8.4M8 12.7a4 4 0 0 1 4.5.3M2.5 2.5l15 15'),
    volume: p('M3 7h3l4-3.5v13L6 13H3ZM13 6.5a5 5 0 0 1 0 7M15.6 3.8a8.6 8.6 0 0 1 0 12.4'),
    volumeOff: p('M3 7h3l4-3.5v13L6 13H3ZM13.5 7.5l4 5m0-5-4 5'),
    battery: '<rect x="1.75" y="5.5" width="14.5" height="9" rx="1.6"/>' + p('M18.2 8v4') + '<rect x="3.5" y="7.25" width="10.7" height="5.5" rx=".6" fill="currentColor" stroke="none"/>',
    bluetooth: p('m6 5 8 8-4 4V3l4 4-8 8'),
    airplane: p('M10 2.25c.7 0 1 .6 1 1.4V8l6.5 4v1.5L11 11.75v4l2 1.5v1l-3-1-3 1v-1l2-1.5v-4L2.5 13.5V12L9 8V3.65c0-.8.3-1.4 1-1.4Z'),
    accessibility: '<circle cx="10" cy="3.6" r="1.6"/>' + p('m3.5 7 6.5 1 6.5-1M10 8v4m-3.7 5.5L10 12l3.7 5.5'),
    moon: p('M17.2 11.8A7.6 7.6 0 0 1 8.2 2.8 7.65 7.65 0 1 0 17.2 11.8Z'),
    sun: '<circle cx="10" cy="10" r="3.8"/>' + p('M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4'),
    power: p('M10 2v7M6 4.4a7 7 0 1 0 8 0'),
    lock: '<rect x="4" y="8.5" width="12" height="9" rx="1.5"/>' + p('M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5M10 12v2'),
    unlock: '<rect x="4" y="8.5" width="12" height="9" rx="1.5"/>' + p('M6.5 8.5V6a3.5 3.5 0 0 1 6.4-2M10 12v2'),
    user: '<circle cx="10" cy="6" r="3"/>' + p('M3.5 17v-1.5a4.5 4.5 0 0 1 4.5-4.5h4a4.5 4.5 0 0 1 4.5 4.5V17Z'),
    check: p('m3.5 10 4.25 4.25L16.5 5.5'),
    mic: '<rect x="7" y="2.25" width="6" height="10" rx="3"/>' + p('M4.75 9.5v.5a5.25 5.25 0 0 0 10.5 0v-.5M10 15.25V18M7.5 18h5'),
    stop: '<rect x="4.5" y="4.5" width="11" height="11" rx="1" fill="currentColor" stroke="none"/>',
    play: '<path d="m6 3.5 10 6.5L6 16.5Z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="5" y="3.5" width="3.25" height="13" rx=".7" fill="currentColor" stroke="none"/><rect x="11.75" y="3.5" width="3.25" height="13" rx=".7" fill="currentColor" stroke="none"/>',
    history: p('M2.5 3.5v4h4M2.75 7.5A7.4 7.4 0 1 1 3 13.4M10 5.5v5l3 1.75'),
    copy: '<rect x="6.5" y="6" width="10.5" height="11.5" rx="1.5"/>' + p('M4 14H3a1 1 0 0 1-1-1V3.5A1.5 1.5 0 0 1 3.5 2H13a1 1 0 0 1 1 1v.5'),
    undo: p('M3 3.5v5h5M3 8.5l3.8-3a6.3 6.3 0 0 1 8.7 9M5 16.1a6 6 0 0 0 6.8 1'),
    redo: p('M17 3.5v5h-5m5 0-3.8-3a6.3 6.3 0 0 0-8.7 9M15 16.1a6 6 0 0 1-6.8 1'),
    info: '<circle cx="10" cy="10" r="7.5"/>' + p('M10 9v5') + '<circle cx="10" cy="6.2" r=".7" fill="currentColor" stroke="none"/>',
    arrowLeft: p('M17 10H3m6-6-6 6 6 6'),
    arrowRight: p('M3 10h14m-6-6 6 6-6 6'),
    arrowUp: p('M10 17V3M4 9l6-6 6 6'),
    arrowDown: p('M10 3v14m-6-6 6 6 6-6'),
    eye: p('M1.5 10s3-5.5 8.5-5.5 8.5 5.5 8.5 5.5-3 5.5-8.5 5.5S1.5 10 1.5 10Z') + '<circle cx="10" cy="10" r="2.4"/>',
    eyeOff: p('M2 2l16 16M7.7 4.8A9 9 0 0 1 10 4.5c5.5 0 8.5 5.5 8.5 5.5a15 15 0 0 1-3 3.6M12.3 15.2a9 9 0 0 1-2.3.3C4.5 15.5 1.5 10 1.5 10a15 15 0 0 1 3-3.6M8.3 8.3a2.4 2.4 0 0 0 3.4 3.4'),
    send: p('m2 3 16 7-16 7 3-7Zm3 7h13'),
    shield: p('M10 2 3.5 4.5v5c0 4 2.5 6.6 6.5 8.5 4-1.9 6.5-4.5 6.5-8.5v-5ZM7 10l2 2 4-4'),
    calendar: '<rect x="2.5" y="4" width="15" height="13.5" rx="1.5"/>' + p('M6 2v4M14 2v4M2.5 8h15M6 11h1M10 11h1M14 11h.5M6 14.5h1M10 14.5h1'),
    notification: p('M4 14.5c1-1 1-2 1-5a5 5 0 0 1 10 0c0 3 0 4 1 5ZM8 17a2.2 2.2 0 0 0 4 0M10 2v1.5'),
    notificationOff: p('M3 3l14 14M8 17a2.2 2.2 0 0 0 4 0M10 2v1.5M5 7.8c0 .5 0 1.1 0 1.7 0 3 0 4-1 5h9M8 4a5 5 0 0 1 7 5.5c0 .8 0 1.5.1 2.2'),
    more: '<circle cx="4" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/>',
    refresh: p('M16.5 2.5v5h-5M3.5 17.5v-5h5M16.2 7.5A6.8 6.8 0 0 0 3 6.8M3.8 12.5A6.8 6.8 0 0 0 17 13.2'),
    cut: '<circle cx="5.2" cy="14.7" r="2.6"/><circle cx="14.8" cy="14.7" r="2.6"/>' + p('m4 2.5 9.2 10.2M16 2.5 6.8 12.7'),
    paste: '<rect x="6" y="2" width="8" height="4" rx="1"/>' + p('M6 4H4a1.5 1.5 0 0 0-1.5 1.5V16A1.5 1.5 0 0 0 4 17.5h12a1.5 1.5 0 0 0 1.5-1.5V5.5A1.5 1.5 0 0 0 16 4h-2'),
    rename: p('M7.5 5H3.8A1.3 1.3 0 0 0 2.5 6.3v7.4A1.3 1.3 0 0 0 3.8 15h3.7M12.5 5h3.7a1.3 1.3 0 0 1 1.3 1.3v7.4a1.3 1.3 0 0 1-1.3 1.3h-3.7M7.5 2H9a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7.5M12.5 2H11a1 1 0 0 0-1 1m0 14a1 1 0 0 0 1 1h1.5'),
    delete: p('M2.5 5h15M7 5V3.2A1.2 1.2 0 0 1 8.2 2h3.6A1.2 1.2 0 0 1 13 3.2V5M4.5 5l.7 11.2A1.3 1.3 0 0 0 6.5 17.5h7a1.3 1.3 0 0 0 1.3-1.3L15.5 5M8 8.5v5.5M12 8.5v5.5'),
    print: p('M5 7V2.5h10V7M5 14H3.5A1.5 1.5 0 0 1 2 12.5v-4A1.5 1.5 0 0 1 3.5 7h13A1.5 1.5 0 0 1 18 8.5v4a1.5 1.5 0 0 1-1.5 1.5H15M5 11.5h10v6H5ZM14.5 9.3h1'),
    save: p('M3 2.5h12l2.5 2.7V17.5h-15V3a.5.5 0 0 1 .5-.5ZM6 2.5v5h7v-5M6 17.5v-7h8v7M11 4v2'),
    plus: p('M10 3v14M3 10h14'),
    minus: p('M3 10h14'),
    fullScreen: p('M7 3H3v4M13 3h4v4M3 13v4h4M17 13v4h-4'),
    exitFullScreen: p('M3 7h4V3M17 7h-4V3M3 13h4v4M17 13h-4v4'),
    mail: '<rect x="2" y="4" width="16" height="12" rx="1.5"/>' + p('m2.5 5 7.5 5.5L17.5 5'),
    link: p('m8 6 2.8-2.8a3.55 3.55 0 0 1 5 5L13 11M7 9l-2.8 2.8a3.55 3.55 0 0 0 5 5L12 14M7 13l6-6'),
    pin: p('m12 2 6 6-2.6.8-3.2 4.8-.7 2.7-7.8-7.8 2.7-.7 4.8-3.2ZM7.7 12.3 2.5 17.5'),
    unpin: p('M2.5 2.5l15 15M7.7 12.3l-5.2 5.2M11 4.7 12 2l6 6-2.6.8-2 3M8 7.3l-1.6.5-2.7.7 7.8 7.8.5-1.7'),
    sort: p('M5 3v14m-3-3 3 3 3-3M10 4h7M10 8h5M10 12h3M10 16h1'),
    view: '<rect x="2.5" y="3" width="6" height="6" rx="1"/><rect x="11.5" y="3" width="6" height="6" rx="1"/><rect x="2.5" y="12" width="6" height="5" rx="1"/><rect x="11.5" y="12" width="6" height="5" rx="1"/>',
    list: p('M7 4h10M7 10h10M7 16h10') + '<circle cx="3.5" cy="4" r=".7" fill="currentColor"/><circle cx="3.5" cy="10" r=".7" fill="currentColor"/><circle cx="3.5" cy="16" r=".7" fill="currentColor"/>',
    help: '<circle cx="10" cy="10" r="7.5"/>' + p('M7.5 7.1a2.5 2.5 0 1 1 4.1 2c-1 .6-1.6 1-1.6 2.5') + '<circle cx="10" cy="14.3" r=".7" fill="currentColor" stroke="none"/>',
    zoom: '<circle cx="8.5" cy="8.5" r="5.75"/>' + p('m12.8 12.8 4.45 4.45M5.5 8.5h6M8.5 5.5v6'),
    zoomOut: '<circle cx="8.5" cy="8.5" r="5.75"/>' + p('m12.8 12.8 4.45 4.45M5.5 8.5h6'),
    settingsLine: p('m8 2-.6 2-2 .8-1.8-.8L2 7l1.5 1.5v2.9L2 13l1.6 3 2-.8 1.8.9L8 18h4l.6-1.9 1.8-.9 2 .8 1.6-3-1.5-1.6V8.5L18 7l-1.6-3-1.8.8-2-.8-.6-2Z') + '<circle cx="10" cy="10" r="3"/>',
    sparkles: p('m11 2 2.25 5.75L19 10l-5.75 2.25L11 18l-2.25-5.75L3 10l5.75-2.25ZM3.5 2v4M1.5 4h4'),
    wand: p('m3 16 10-10 3 3L6 19ZM10 9l3 3M5 2v4M3 4h4M16 1v3M14.5 2.5h3M17 13v4M15 15h4'),
    monitor: '<rect x="2" y="3.5" width="16" height="11" rx="1.4"/>' + p('M10 14.5V18M6.5 18h7'),
    window: '<rect x="2" y="3" width="16" height="14" rx="1.5"/>' + p('M2 7h16'),
    cursor: p('m4 2 11 9-5 .8 3.2 5.5-2.5 1.5L8 13l-3.5 3Z'),
    text: p('M3 4h14M10 4v13M7 17h6M3 4v3M17 4v3'),
    edit: p('m13 2 5 5-10.8 10.8-5.7.7.7-5.7ZM10.5 4.5l5 5'),
    upload: p('M10 14V2m-4 4 4-4 4 4M3 12v5.5h14V12'),
    download: p('M10 2v12m-4-4 4 4 4-4M3 12v5.5h14V12'),
    cloud: p('M5 15.5h10a3.5 3.5 0 0 0 .8-6.9A5.6 5.6 0 0 0 5.1 7.4 4.1 4.1 0 0 0 5 15.5Z'),
    checkCircle: '<circle cx="10" cy="10" r="7.5"/>' + p('m6 10 2.75 2.75L14 7.5'),
    warning: p('M9 2.8a1.2 1.2 0 0 1 2 0l7 13a1 1 0 0 1-.9 1.5H2.9a1 1 0 0 1-.9-1.5ZM10 7v4.5') + '<circle cx="10" cy="14.2" r=".65" fill="currentColor" stroke="none"/>',
    globe: '<circle cx="10" cy="10" r="7.5"/><ellipse cx="10" cy="10" rx="3.3" ry="7.5"/>' + p('M2.5 10h15M4.1 5.5h11.8M4.1 14.5h11.8'),
    home: p('m2 9 8-7 8 7M4.5 7.1V18h4v-6h3v6h4V7.1'),
    heart: p('M10 17S2 12 2 7.5a4.25 4.25 0 0 1 8-2 4.25 4.25 0 0 1 8 2C18 12 10 17 10 17Z'),
    keyboard: '<rect x="1.5" y="4.5" width="17" height="11" rx="1.5"/>' + p('M4.5 7.5h1M8 7.5h1M11.5 7.5h1M15 7.5h.5M4.5 10h1M8 10h1M11.5 10h1M15 10h.5M6.5 12.5h7'),
    checkList: p('m2 5 1.5 1.5L6 3.8M9 5h8m-15 7 1.5 1.5L6 10.8M9 12h8'),
    attach: p('m7 7 5.6-5.6a3.5 3.5 0 0 1 5 5L8.5 15.5a4.5 4.5 0 0 1-6.4-6.4L11 1m-5 10 7-7a1.3 1.3 0 0 1 1.8 1.8l-7 7'),
  };
  const captions = {
    minimize: '<path d="M0 5.5h10"/>',
    maximize: '<rect x=".5" y=".5" width="9" height="9"/>',
    restore: '<path d="M2.5 2.5v-2h7v7h-2M.5 2.5h7v7h-7Z"/>',
    close: '<path d="m.75.75 8.5 8.5m0-8.5-8.5 8.5"/>',
  };
  function gradient(id, a, b, vertical = true) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="${vertical ? '0' : '1'}" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  }
  // Original flat pictograms for the demo shell; application marks stay below.
  const colored = {
    launcher: () => '<rect x="7" y="7" width="34" height="8" rx="4" fill="#345e8c"/><rect x="7" y="20" width="25" height="8" rx="4" fill="#427f9c"/><rect x="7" y="33" width="18" height="8" rx="4" fill="#629b9a"/>',
    browser: () => '<rect x="3" y="3" width="42" height="42" rx="11" fill="#dceee9"/><g stroke="#286d68" stroke-width="2.5"><circle cx="24" cy="24" r="15"/><ellipse cx="24" cy="24" rx="6.5" ry="15"/><path d="M9 24h30"/></g>',
    explorer: () => '<path d="M6 16v-5a3 3 0 0 1 3-3h10l5 6h15a3 3 0 0 1 3 3v21a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z" fill="#efcf9f" stroke="#976d3d" stroke-width="2" stroke-linejoin="round"/><path d="M6 19h36v19a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3Z" fill="#dbad70"/><path d="M7 19h34" stroke="#976d3d" stroke-width="2"/><path d="M12 32h10" stroke="#fff4df" stroke-width="3" stroke-linecap="round"/>',
    settings: () => '<rect x="3" y="3" width="42" height="42" rx="10" fill="#e4eaf1"/><g stroke="#4e647e" stroke-width="2.5" stroke-linecap="round"><path d="M10 13h28M10 24h28M10 35h28"/><circle cx="18" cy="13" r="4" fill="#fff"/><circle cx="30" cy="24" r="4" fill="#fff"/><circle cx="21" cy="35" r="4" fill="#fff"/></g>',
    recycleBin: () => '<path d="m12 15 2 24a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3l2-24Z" fill="#dce9e5" stroke="#5b7c72" stroke-width="2.5" stroke-linejoin="round"/><path d="M19 11V8h10v3M9 13h30M20 22v12M28 22v12" stroke="#5b7c72" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    computer: () => '<rect x="4" y="6" width="40" height="29" rx="4" fill="#e5eaf0" stroke="#4e647e" stroke-width="2.5"/><rect x="9" y="11" width="30" height="18" rx="1.5" fill="#83b6b4"/><path d="M24 35v7M16 42h16" stroke="#4e647e" stroke-width="2.5" stroke-linecap="round"/>',
    notepad: () => '<rect x="8" y="4" width="32" height="40" rx="4" fill="#aa6b58"/><path d="M15 8h20a1 1 0 0 1 1 1v30a1 1 0 0 1-1 1H15Z" fill="#fff4e6"/><path d="M13 8v32" stroke="#d89d7e" stroke-width="2"/><path d="M20 17h10M20 24h10M20 31h7" stroke="#957968" stroke-width="2.5" stroke-linecap="round"/>',
    store: () => '<rect x="8" y="5" width="32" height="38" rx="5" fill="#ece6f3" stroke="#7e6b96" stroke-width="2"/><path d="M15 6v36" stroke="#7e6b96" stroke-width="2"/><g fill="#7e6b96"><circle cx="22" cy="15" r="2"/><circle cx="22" cy="24" r="2"/><circle cx="22" cy="33" r="2"/></g><path d="M28 15h6M28 24h6M28 33h6" stroke="#7e6b96" stroke-width="2.5" stroke-linecap="round"/>',
    photos: () => '<rect x="5" y="7" width="38" height="34" rx="4" fill="#eff4ef" stroke="#5b7c72" stroke-width="2"/><circle cx="32" cy="17" r="4" fill="#d7ae70"/><path d="m10 33 10-12 8 9 5-5 5 8v3H10Z" fill="#83aaa0"/><path d="M10 36h28" stroke="#5b7c72" stroke-width="2" stroke-linecap="round"/>',
    terminal: () => '<rect x="4" y="7" width="40" height="34" rx="5" fill="#344554"/><path d="M5 15h38" stroke="#647885" stroke-width="2"/><path d="m12 22 6 5-6 5M24 32h10" stroke="#edf7f2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
    clinic: id => `<defs>${gradient(id+'a','#ffffff','#dcebf3')}${gradient(id+'b','#4ab18b','#18825e')}</defs><rect x="7" y="14" width="34" height="29" rx="2" fill="url(#${id}a)" stroke="#b9cbd5"/><rect x="15" y="4" width="18" height="39" rx="2" fill="#edf6fa" stroke="#b9cbd5"/><rect x="17" y="6" width="14" height="15" rx="2" fill="url(#${id}b)"/><path d="M22 9h4v3h3v4h-3v3h-4v-3h-3v-4h3Z" fill="white"/><path d="M20 43V31h8v12" fill="#18825e"/><path d="M10 21h3v4h-3Zm25 0h3v4h-3ZM10 29h3v4h-3Zm25 0h3v4h-3Z" fill="#69b4d8"/>`,
    opisai: id => `<defs>${gradient(id,'#3986f7','#1d57d4')}</defs><rect x="3" y="3" width="42" height="42" rx="12" fill="url(#${id})"/><path d="M19 17v-3a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3" fill="none" stroke="#fff" stroke-width="3"/><rect x="11" y="17" width="26" height="20" rx="4" fill="white"/><path d="M22 21h4v4h4v4h-4v4h-4v-4h-4v-4h4Z" fill="#2563eb"/>`,
    file: () => '<path d="M11 5h17l9 9v29H11Z" fill="#f2f5f1" stroke="#718783" stroke-width="2" stroke-linejoin="round"/><path d="M28 5v9h9" fill="#c6dcd6" stroke="#718783" stroke-width="2" stroke-linejoin="round"/><path d="M17 23h14M17 30h14M17 36h9" stroke="#829c95" stroke-width="2.5" stroke-linecap="round"/>',
    downloads: () => '<rect x="4" y="4" width="40" height="40" rx="11" fill="#e4eaf1"/><path d="M24 11v20m-8-8 8 8 8-8M12 34v4h24v-4" stroke="#4e647e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    calculator: () => '<rect x="9" y="3" width="30" height="42" rx="5" fill="#ece6f3" stroke="#7e6b96" stroke-width="2"/><rect x="14" y="8" width="20" height="10" rx="2" fill="#7e6b96"/><g fill="#7e6b96"><circle cx="16" cy="25" r="2.5"/><circle cx="24" cy="25" r="2.5"/><circle cx="32" cy="25" r="2.5"/><circle cx="16" cy="35" r="2.5"/><circle cx="24" cy="35" r="2.5"/></g><path d="M30 33h4M30 37h4" stroke="#7e6b96" stroke-width="2" stroke-linecap="round"/>',
    paint: () => '<circle cx="24" cy="24" r="21" fill="#f4eadb"/><path d="m21 25 14-18a3 3 0 0 1 5 4L25 29Z" fill="#548f91"/><path d="m20 25 5 4-4 5-5-4Z" fill="#4e647e"/><path d="M17 30c-7 0-4 9-10 10 9 3 17-2 14-7Z" fill="#b4804b"/><path d="M12 38c3 0 5-2 6-5" stroke="#efd2a7" stroke-width="2" stroke-linecap="round"/>',
  };
  const aliases = {
    folder: 'explorer', document: 'file',
    recycle: 'recycleBin', trash: 'delete', bin: 'recycleBin', pc: 'computer',
    thisPC: 'computer', gear: 'settingsLine', settingsMono: 'settingsLine',
    bell: 'notification', chevron: 'chevronRight', back: 'arrowLeft', forward: 'arrowRight',
    microphone: 'mic', fullscreen: 'fullScreen', exitFullscreen: 'exitFullScreen',
    ellipsis: 'more', checkmark: 'check', clipboard: 'paste', pencil: 'edit',
    app: 'opisai', medical: 'opisai', spark: 'sparkles', muted: 'volumeOff',
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function svg(name, size = 20, extraClass = '') {
    const requested = String(name || 'file');
    const key = Object.hasOwn(aliases, requested) ? aliases[requested] : requested;
    const n = Number(size), pixels = Number.isFinite(n) ? Math.max(1, Math.min(1024, n)) : 20;
    const attrs = `xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" class="icon icon-${escape(requested)}${extraClass ? ' ' + escape(extraClass) : ''}" aria-hidden="true" focusable="false" style="flex-shrink:0;vertical-align:middle"`;
    if (Object.hasOwn(colored, key)) return `<svg ${attrs} viewBox="0 0 48 48" fill="none">${colored[key]('op-icon-'+(++serial))}</svg>`;
    if (Object.hasOwn(captions, key)) return `<svg ${attrs} viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">${captions[key]}</svg>`;
    const body = Object.hasOwn(mono, key) ? mono[key] : mono.help;
    return `<svg ${attrs} viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  }
  window.Icons = Object.freeze({
    svg,
    has: name => {
      const key = Object.hasOwn(aliases, name) ? aliases[name] : name;
      return Object.hasOwn(colored, key) || Object.hasOwn(mono, key) || Object.hasOwn(captions, key);
    },
    names: Object.freeze([...Object.keys(colored), ...Object.keys(mono), ...Object.keys(captions), ...Object.keys(aliases)]),
  });
})();
