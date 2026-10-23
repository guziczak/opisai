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
  const colored = {
    windows: id => `<defs>${gradient(id, '#28a9ff', '#0078d7', false)}</defs><path fill="url(#${id})" d="M4 4h18v18H4Zm22 0h18v18H26ZM4 26h18v18H4Zm22 0h18v18H26Z"/>`,
    edge: id => `<defs>${gradient(id+'a','#0ba2e9','#0045ac')}${gradient(id+'b','#28d2c6','#09a56b',false)}${gradient(id+'c','#00b9e6','#0868d7',false)}</defs><path fill="url(#${id}a)" d="M45.5 30.2c-1.1 8.8-8.9 15-19.8 15C12.7 45.2 3 36.8 3 24.2c0-7.2 4.1-13.1 9.9-16.8-5.3 5.7-5.7 13.7-.9 19.2 3.3 3.8 8.5 5.4 14.2 5.4 7.8 0 13.1-2.1 16.3-5.4 1.9-1.8 3.4.4 3 3.6Z"/><path fill="url(#${id}b)" d="M3 24.2C3 11.6 11.9 2.8 24.4 2.8c12.6 0 21 8.1 21 18.7 0 6.7-4.8 11.1-12.5 11.1-4.8 0-9-1.8-9-5.1 0-2.1 1.6-3.4 4-3.4 3.8 0 6.8-1.8 6.8-5.1 0-4.6-5.1-7.9-11.5-7.9C13.2 11.1 5.7 16.3 3 24.2Z"/><path fill="url(#${id}c)" d="M3 24.2C5.6 16.3 13.2 11.1 23.2 11.1c6.4 0 11.5 3.3 11.5 7.9 0 3.3-3 5.1-6.8 5.1-2.4 0-4 1.3-4 3.4 0 1.2.5 2.2 1.5 3-6.3.2-12-2.5-13.3-7.7-1.4-5.5 3.6-9.9 9.5-10.4C12.7 12.9 5.5 17.4 3 24.2Z"/>`,
    explorer: id => `<defs>${gradient(id+'a','#ffe69c','#f2b32c')}${gradient(id+'b','#ffe26d','#ffbd28')}${gradient(id+'c','#39a1ed','#0879d4')}</defs><path fill="url(#${id}a)" d="M4 10a3 3 0 0 1 3-3h12l4 5h18a3 3 0 0 1 3 3v23a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z"/><path fill="#d49517" d="M4 16h40v21H4Z"/><path fill="#fff4ce" d="M8 14h31a2 2 0 0 1 2 2v18H8Z"/><path fill="url(#${id}c)" d="M6 18h36a2 2 0 0 1 2 2v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V20a2 2 0 0 1 2-2Z"/><path fill="url(#${id}b)" d="M6 17h12l3 3h21a2 2 0 0 1 2 2v15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V19a2 2 0 0 1 2-2Z"/><path d="M6 18h12l3 3h21" fill="none" stroke="#fff3b5" stroke-width="1"/>`,
    settings: id => `<defs>${gradient(id+'a','#aeb9c3','#626e79')}${gradient(id+'b','#52bcf8','#0877d7')}</defs><path fill="url(#${id}a)" d="m20 3-1.2 5-3 1.3-4.6-2.5-5.5 5.5 2.5 4.5-1.3 3L2 21v7l4.9 1.2 1.3 3-2.5 4.5 5.5 5.5 4.6-2.5 3 1.3L20 46h8l1.2-5 3-1.3 4.6 2.5 5.5-5.5-2.5-4.5 1.3-3L46 28v-7l-4.9-1.2-1.3-3 2.5-4.5-5.5-5.5-4.6 2.5-3-1.3L28 3Z"/><circle cx="24" cy="24.5" r="11.1" fill="#c9d0d7"/><circle cx="24" cy="24.5" r="8.3" fill="url(#${id}b)"/><circle cx="24" cy="24.5" r="4.1" fill="#c0e7fd"/>`,
    recycleBin: id => `<defs>${gradient(id+'a','#ffffff','#d5e4eb')}${gradient(id+'b','#74c6f2','#2990d4')}</defs><ellipse cx="24" cy="41" rx="13" ry="3" fill="#172c3f" opacity=".12"/><path d="m10 10 2.5 29c.3 3.5 22.7 3.5 23 0L38 10Z" fill="url(#${id}a)" stroke="#a6b6c2" stroke-width=".8"/><path d="m13.5 13 2 25c0 2 17 2 17 0l2-25" fill="#f7fbfd" opacity=".42"/><ellipse cx="24" cy="10" rx="14" ry="4.7" fill="#e6eef2" stroke="#a7b5bf" stroke-width=".8"/><ellipse cx="24" cy="9.8" rx="10.4" ry="2.7" fill="#c7d6de"/><path fill="url(#${id}b)" d="m24 17 4.4 7.2 2.2-1.3-1.7 5.6-5.7-1.4 2.1-1.3-2.8-4.5Zm-5.2 6.6 3.1 1.7-2.6 4.4h5.1v3.4h-7.1c-1.8 0-2.6-1.1-1.7-2.7Zm14.6 7.3-3.6 6.2c-.9 1.5-2.4 1.7-3.3.1l-3-5.1 2.7-1.6 1.8 3.2 2.5-4.5Z"/>`,
    computer: id => `<defs>${gradient(id+'a','#b9c7d4','#8897a5')}${gradient(id+'b','#80d0ff','#006fe3',false)}</defs><path fill="url(#${id}a)" d="M20 33h8l1 7h6v3H13v-3h6Z"/><rect x="3" y="6" width="42" height="29" rx="2.8" fill="#43556c"/><rect x="5" y="8" width="38" height="24" rx=".6" fill="url(#${id}b)"/><path d="M5 32 32 8h11v24Z" fill="#0053b8" opacity=".35"/><path d="M5 32 23 8h9L5 32Z" fill="#d2f5ff" opacity=".25"/><path d="M4 33.5h40" stroke="#d0d9e2"/>`,
    notepad: id => `<defs>${gradient(id,'#f9fdff','#d5edfb')}</defs><path d="M12 5h27a3 3 0 0 1 3 3v33a3 3 0 0 1-3 3H12Z" fill="#4899d1"/><rect x="7" y="3" width="31" height="39" rx="2" fill="url(#${id})" stroke="#77b5dc" stroke-width="1"/><path d="M7 3h7v39H7Z" fill="#b2d8f0"/><path d="M18 12h15M18 18h15M18 24h15M18 30h15M18 36h11" fill="none" stroke="#79b3d5" stroke-width="1.3"/><path d="M5 8h6M5 15h6M5 22h6M5 29h6M5 36h6" fill="none" stroke="#4b7f9e" stroke-width="2.3" stroke-linecap="round"/>`,
    store: id => `<defs>${gradient(id,'#3aa5f0','#0868bc')}</defs><path d="M8 13h32l3 30H5Z" fill="url(#${id})"/><path d="M17 15V9a7 7 0 0 1 14 0v6" fill="none" stroke="#5d7181" stroke-width="2.3"/><path d="M17 14V9a7 7 0 0 1 14 0v5" fill="none" stroke="#edf8ff" stroke-width="1.3"/><path fill="#f25022" d="M16 23h7v7h-7Z"/><path fill="#7fba00" d="M25 23h7v7h-7Z"/><path fill="#00a4ef" d="M16 32h7v7h-7Z"/><path fill="#ffb900" d="M25 32h7v7h-7Z"/>`,
    photos: id => `<defs>${gradient(id+'a','#85d9fa','#3c9ddd')}${gradient(id+'b','#3398f2','#0b4eae')}</defs><rect x="3" y="7" width="42" height="35" rx="3" fill="#c8e9fb"/><rect x="5" y="5" width="38" height="34" rx="3" fill="url(#${id}a)"/><circle cx="33" cy="14" r="4" fill="#f8e796"/><path fill="#49b4bc" d="M5 31 17 19l8 9 7-8 11 11v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z"/><path fill="url(#${id}b)" d="m5 35 13-11 11 10 7-7 7 7v2a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z"/>`,
    terminal: id => `<defs>${gradient(id,'#384350','#171e28')}</defs><rect x="2" y="8" width="44" height="33" rx="4" fill="#708092"/><rect x="3" y="7" width="42" height="32" rx="3" fill="url(#${id})"/><path d="m12 17 7 6-7 6M24 29h10" fill="none" stroke="#f4f7fa" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    clinic: id => `<defs>${gradient(id+'a','#ffffff','#dcebf3')}${gradient(id+'b','#4ab18b','#18825e')}</defs><rect x="7" y="14" width="34" height="29" rx="2" fill="url(#${id}a)" stroke="#b9cbd5"/><rect x="15" y="4" width="18" height="39" rx="2" fill="#edf6fa" stroke="#b9cbd5"/><rect x="17" y="6" width="14" height="15" rx="2" fill="url(#${id}b)"/><path d="M22 9h4v3h3v4h-3v3h-4v-3h-3v-4h3Z" fill="white"/><path d="M20 43V31h8v12" fill="#18825e"/><path d="M10 21h3v4h-3Zm25 0h3v4h-3ZM10 29h3v4h-3Zm25 0h3v4h-3Z" fill="#69b4d8"/>`,
    opisai: id => `<defs>${gradient(id,'#3986f7','#1d57d4')}</defs><rect x="3" y="3" width="42" height="42" rx="12" fill="url(#${id})"/><path d="M19 17v-3a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v3" fill="none" stroke="#fff" stroke-width="3"/><rect x="11" y="17" width="26" height="20" rx="4" fill="white"/><path d="M22 21h4v4h4v4h-4v4h-4v-4h-4v-4h4Z" fill="#2563eb"/>`,
    file: id => `<defs>${gradient(id,'#fff','#e7f1f8')}</defs><path d="M10 3h18l10 10v30H10Z" fill="url(#${id})" stroke="#9cb3c5"/><path d="M28 3v10h10" fill="#c7e4f7" stroke="#9cb3c5"/><path d="M16 22h16M16 27h16M16 32h12" fill="none" stroke="#75a4c5" stroke-width="1.6"/>`,
    downloads: id => `<defs>${gradient(id,'#45b5f7','#0877d7')}</defs><path d="M20 5h8v20h10L24 39 10 25h10Z" fill="url(#${id})"/><path d="M7 36v7h34v-7" fill="none" stroke="#8c9ba5" stroke-width="3" stroke-linejoin="round"/>`,
    calculator: id => `<defs>${gradient(id,'#e9eef4','#9eafbe')}</defs><rect x="9" y="3" width="30" height="42" rx="4" fill="url(#${id})"/><rect x="13" y="7" width="22" height="10" rx="1.4" fill="#344857"/><path fill="#eff4f8" d="M13 21h5v5h-5Zm8.5 0h5v5h-5ZM13 29h5v5h-5Zm8.5 0h5v5h-5ZM13 37h5v5h-5Zm8.5 0h5v5h-5Z"/><path fill="#198ee3" d="M30 21h5v5h-5Zm0 8h5v13h-5Z"/>`,
    paint: id => `<defs>${gradient(id,'#fff4dc','#d3bca3')}</defs><path d="M24 4C11 4 3 13 3 25s11 19 20 19c6 0 8-4 4-8-2-2-1-5 2-5h6c6 0 10-4 10-10C45 10 35 4 24 4Z" fill="url(#${id})"/><circle cx="13" cy="16" r="4" fill="#e94a53"/><circle cx="24" cy="11" r="4" fill="#f7b723"/><circle cx="35" cy="16" r="4" fill="#28a7db"/><circle cx="11" cy="29" r="4" fill="#6cbd52"/><circle cx="20" cy="35" r="3.5" fill="#bd9c7b"/>`,
    word: id => `<defs>${gradient(id,'#2d93e9','#15469a')}</defs><rect x="13" y="4" width="32" height="40" rx="3" fill="url(#${id})"/><path d="M18 15h22M18 23h22M18 31h22" stroke="#8ac5f5" stroke-width="2"/><rect x="3" y="13" width="25" height="25" rx="2" fill="#185abd"/><path d="m8 19 3 13 4-9 4 9 3-13" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
  };
  const aliases = {
    start: 'windows', microsoft: 'windows', folder: 'explorer', document: 'file',
    recycle: 'recycleBin', trash: 'delete', bin: 'recycleBin', pc: 'computer',
    thisPC: 'computer', browser: 'edge', gear: 'settingsLine', settingsMono: 'settingsLine',
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
