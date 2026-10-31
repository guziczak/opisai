/* OpisAI 0.12.0rc32: the documentation model behind the compose, progress and review views.
 * Ported from the application, without a DOM:
 *  - default sections and subsections (domain/document_defaults.py) and the small-animal
 *    panel template (legacy_ui._default_vital_params_small_animal);
 *  - the variant matrix and its copy (domain/variants.py, ui/variant_copy.py);
 *  - the local panel reader and its evidence (application/panel.py, domain/observations.py,
 *    vital_lexicon.py, panel_evidence.py), the AI quote check and spelling rule
 *    (application/panel_quotes.py, domain/panel_spelling.py);
 *  - removal of proven panel repetitions (application/panel_repetition.py);
 *  - the short-fragment and treatment-cue notes of domain/preservation.py (the medicine
 *    list itself is not part of the demonstration);
 *  - rendering of subsections and of the editable review document (domain/structure.py,
 *    domain/review_document.py).
 * The demonstration has no AI: answers for the sample visit are fixed; other text is
 * placed by a small local router. Everything the application computes locally is computed
 * here the same way. Prompt rule texts are shortened (see promptOutline). */
(() => {
  'use strict';
  const W = '[\\p{L}\\p{N}_]', NB = `(?<!${W})`, NA = `(?!${W})`; // Python's Unicode \w and its boundaries
  const rx = (source, flags = '') => new RegExp(source, 'u' + flags);
  const isAlnum = c => /[\p{L}\p{N}]/u.test(c);
  const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const unique = items => [...new Set(items)];
  const byLengthDesc = items => unique(items).map((s, i) => [s, i]).sort((a, b) => b[0].length - a[0].length || a[1] - b[1]).map(x => x[0]);
  function stripChars(text, chars) {
    let start = 0, end = text.length;
    while (start < end && chars.includes(text[start])) start++;
    while (end > start && chars.includes(text[end - 1])) end--;
    return text.slice(start, end);
  }
  const strip = text => String(text).replace(/^\s+|\s+$/gu, '');
  function rfind(text, ch, start, stop) { if (stop <= start) return -1; const i = text.lastIndexOf(ch, stop - 1); return i >= start ? i : -1; }
  function* finditer(re, text, from = 0) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'); g.lastIndex = from;
    for (let m; (m = g.exec(text));) { yield m; if (m[0] === '') g.lastIndex++; }
  }
  const search = (re, text, from = 0) => { for (const m of finditer(re, text, from)) return m; return null; };
  const fullmatch = (re, text) => rx(`^(?:${re.source})$`, re.flags.replace(/[gu]/g, '')).exec(text);
  const normalizeEol = text => String(text ?? '').replace(/\r\n?/g, '\n');
  const fold = text => String(text).replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  function foldSameLength(text) { // vital_lexicon.fold_same_length: one output unit per input unit
    let out = '';
    for (const c of String(text)) {
      if (c === 'ł' || c === 'Ł') { out += 'l'; continue; }
      if (c.length > 1) { out += c; continue; }
      let base = c.normalize('NFD')[0] || c; if (/\p{M}/u.test(base)) base = c;
      const lower = base.toLowerCase(); out += lower.length === 1 ? lower : base;
    }
    return out;
  }

  /* ---------------------------------------------------------- configuration */
  const SECTIONS = [ // document_defaults.default_sections(): exam, history, diagnosis
    {id: 'clinical_exam', key: 'badanie', label: 'Opis badania i ocena', field: 'Badanie kliniczne', tab: 'Badanie', role: 'standard',
      instruction: 'Przepisz część badaniową (badanie pacjenta, pomiary, wyniki badań obrazowych/laboratoryjnych) na profesjonalny opis badania klinicznego i ocenę wizyty: interpretację wyników, leczenie, zalecenia, rokowanie i plan dalszy. Osobnego rozpoznania nie wpisuj tutaj, jeżeli generowane jest pole Rozpoznanie robocze.',
      subsections: [
        {id: 'clinical_findings', name: 'Badanie kliniczne', description: 'Opis badania układów i okolic ciała oraz pozostałych ustaleń z badania; bez zabiegów i leków. Panel parametrów i opis tworzą jedną podsekcję.', kind: 'dane', panel: true},
        {id: 'additional_tests', name: 'Badania dodatkowe', description: 'wyniki badań obrazowych/laboratoryjnych z notatki + krótka interpretacja kliniczna', kind: 'dane'},
        {id: 'visit_treatment', name: 'Leczenie zastosowane podczas wizyty', description: 'leki podane i zabiegi wykonane w gabinecie (nazwy, droga, płynoterapia); dawki jeśli są w notatce', kind: 'dane'},
        {id: 'home_care', name: 'Zalecenia i leczenie do domu', description: 'konkretne leki do domu tylko jeśli są w notatce; poza tym dieta, ograniczenia, obserwacja objawów alarmowych i termin kontroli jako zalecenia do rozważenia', kind: 'wniosek'},
        {id: 'prognosis', name: 'Rokowanie i plan dalszy', description: 'rokowanie (dobre/ostrożne/niepewne), co monitorować, jakie badania wykonać dalej', kind: 'wniosek'}]},
    {id: 'history', key: 'wywiad', label: 'Opis wywiadu', field: 'Wywiad', tab: 'Wywiad', role: 'standard',
      instruction: 'Przepisz część wywiadową (objawy, historia, przebieg) na zwięzły, profesjonalny opis wywiadu lekarsko-weterynaryjnego (anamneza).',
      subsections: [
        {id: 'signalment', name: 'Sygnalment', description: 'gatunek, rasa, wiek, płeć, masa ciała', kind: 'dane'},
        {id: 'chief_complaint', name: 'Powód wizyty', description: 'dolegliwość zgłaszana przez właściciela albo cel wizyty (kontrola, szczepienie, zabieg)', kind: 'dane'},
        {id: 'course', name: 'Przebieg i czas trwania', description: 'dynamika objawów, od kiedy, co się zmieniało', kind: 'dane'}],
      disabled: ['Dotychczasowe leczenie i choroby współistniejące']},
    {id: 'diagnosis', key: 'diagnoza', label: 'Rozpoznanie robocze', field: 'Diagnoza', tab: 'Rozpoznanie', role: 'diagnosis',
      instruction: 'Wypełnij pole „Diagnoza:” krótkim, ostrożnym rozpoznaniem roboczym opartym na danych z notatki. W trybie bogatym możesz podać najważniejsze różnicowanie, ale bez zaleceń, planu dalszego, badań do wykonania, leczenia ani zdań typu „wskazana dalsza diagnostyka”. Nie przedstawiaj hipotezy jako rozpoznania ostatecznego.',
      subsections: [
        {id: 'working_diagnosis', name: 'Rozpoznanie wstępne', description: 'krótka robocza propozycja do weryfikacji przez lekarza', kind: 'wniosek'},
        {id: 'differential', name: 'Różnicowanie', description: 'najważniejsze jednostki różnicowe tylko gdy uzasadniają je dane z notatki', kind: 'wniosek'}],
      disabled: ['Uzasadnienie']}
  ];
  const sectionByKey = key => SECTIONS.find(s => s.key === key);
  /* legacy_ui._default_vital_params_small_animal (Psy / koty), missing policy "omit". */
  const TEMPLATE = [
    ['general_condition', 'Stan ogólny', 'stabilny, przytomny, kontaktowy', ''], ['temperature', 'Temperatura', 'w normie', '°C'],
    ['capillary_refill', 'CRT', '<2 s', ''], ['mucosa', 'Błony śluzowe', 'różowe, wilgotne', ''], ['heart_rate', 'Tętno', 'w normie', '/min'],
    ['respiratory_auscultation', 'Drogi oddechowe (osłuchowo)', 'górne i dolne bez zmian', ''], ['cardiac_auscultation', 'Serce (osłuchowo)', 'bez nieprawidłowości', ''],
    ['lymph_nodes', 'Węzły chłonne', 'niepowiększone, niebolesne, przesuwalne względem podłoża', ''], ['abdomen', 'Brzuch', 'niebolesny, lekko spięty', ''],
    ['peristalsis', 'Odgłosy perystaltyczne', 'w normie', '']
  ].map(([id, label, reference, unit]) => ({id, label, reference, unit, missing: 'omit'}));

  /* domain/variants.py and ui/variant_copy.py */
  const MODES = {true: ['Bogato', 'AI rozwija opis i może dodać ostrożne wnioski.'], false: ['Wiernie', 'AI ma tylko poprawić język i układ, bez nowych faktów i zaleceń.']};
  const PANEL_COPY = 'Panel: wartości z pól, a brakujące parametry według Ustawień (np. norma).';
  const DIAGNOSIS_COPY = {true: 'Rozpoznanie: może zawierać propozycję AI — sprawdź je w podglądzie.', false: 'Rozpoznanie: nawet w tym trybie może zawierać propozycję AI — sprawdź je w podglądzie.'};
  const variant = (v = {}) => ({rich: v.rich === true, panel: v.panel === true, diagnosis: v.diagnosis === true});
  function forCapabilities(v, {panel = false, diagnosis = false, required = false} = {}) {
    v = variant(v); const d = !!(required || (v.diagnosis && diagnosis));
    return {rich: v.rich, panel: !!(panel && (v.panel || (d && !required))), diagnosis: d};
  }
  const sameVariant = (a, b) => a.rich === b.rich && a.panel === b.panel && a.diagnosis === b.diagnosis;
  const variantLabel = v => (v.rich ? 'Bogato' : 'Wiernie') + (v.diagnosis && v.panel ? ' · parametry i rozpoznanie' : v.diagnosis ? ' · rozpoznanie' : v.panel ? ' · parametry' : ' · sam opis');
  function describeVariant(v) { const [name, summary] = MODES[!!v.rich]; return [name + ' — ' + summary, ...(v.panel ? [PANEL_COPY] : []), ...(v.diagnosis ? [DIAGNOSIS_COPY[!!v.rich]] : [])]; }
  const modeSummary = rich => MODES[!!rich][1];

  /* ---------------------------------------------------------- observations / abbreviations */
  const ABBREVIATION = rx(`${NB}(?:\\p{L}\\.){2,}|${NB}\\p{L}\\.\\p{L}${NA}`, 'g');
  const abbreviationSpans = text => [...finditer(ABBREVIATION, text)].map(m => [m.index, m.index + m[0].length]);
  function maskAbbreviations(text, spans) {
    const chars = text.split('');
    for (const [start, end] of spans) { const last = text[end - 1] === '.' ? end - 1 : -1; for (let i = start; i < end; i++) if (chars[i] === '.' && i !== last) chars[i] = '\0'; }
    return chars.join('');
  }
  const VALUE_BOUNDARY = rx(`[;\\n!?]|(?<!\\d)\\.(?!\\d)|(?<=\\d)\\.(?!\\d)|,(?=\\s*(?:dzi[śs]|dzisiaj|wczoraj|obecnie|wcze[śs]niej|po|przed)${NA})`, 'gi');
  const ci = word => word.replace(/[a-z]/g, c => `[${c}${c.toUpperCase()}]`).replace(/\./g, '\\.');
  const MID_SENTENCE = ['ok', 'np', 'godz', 'tj', 'tzw', 'wg', 'ew', 'ca', 'dr', 'lek', 'wet', 'nr', 'pkt', 'zob', 'por', 'ur', 'm.in'];
  const PREFIX_ABBREVIATION = rx(`${NB}(?:${MID_SENTENCE.map(ci).join('|')})\\.(?=[ \\t]*[0-9a-ząćęłńóśźż<>≤≥~±])`, 'g');
  const INNER_ABBREVIATION_DOT = rx(`${NB}[mM]\\.(?=[iI][nN]\\.)`, 'g');
  const TEMP_DOT = rx(`${NB}temp\\.`, 'gi');
  const KNOWN = [['stan ogolny', 'general_condition'], ['temperatura', 'temperature'], ['crt', 'capillary_refill'], ['blony sluzowe', 'mucosa'], ['tetno', 'heart_rate'],
    ['serce (osluchowo)', 'cardiac_auscultation'], ['osluchanie serca', 'cardiac_auscultation'], ['drogi oddechowe (osluchowo)', 'respiratory_auscultation'],
    ['osluchanie pluc', 'pulmonary_auscultation'], ['wezly chlonne', 'lymph_nodes'], ['brzuch', 'abdomen'], ['odglosy perystaltyczne', 'peristalsis'],
    ['perystaltyka jelit (4 kwadranty)', 'intestinal_quadrants'], ['czestosc oddechow', 'respiratory_rate'], ['aparat ruchu', 'locomotion'],
    ['tetno palcowe / kopyta', 'digital_pulse_hooves'], ['stopien odwodnienia (fald skorny)', 'skin_turgor']];
  const ALIASES = {temperature: ['temperatura', 'temp\\.?', 'T'], heart_rate: ['HR', 't[ęe]tno', 'cz[ęe]sto[śs][ćc] pracy serca'],
    cardiac_auscultation: ['(?:os[łl]uchowo\\s+)?serce', 'os[łl]uchanie serca'], pulmonary_auscultation: ['p[łl]uca', 'os[łl]uchanie p[łl]uc'],
    respiratory_auscultation: ['p[łl]uca', 'drogi oddechowe'], capillary_refill: ['CRT'], general_condition: ['stan og[óo]lny'],
    mucosa: ['b[łl]ony [śs]luzowe'], abdomen: ['brzuch'], peristalsis: ['odg[łl]osy perystaltyczne', 'perystaltyka'], respiratory_rate: ['cz[ęe]sto[śs][ćc] oddech[óo]w', 'RR']};
  const EXTRA_ALIASES = {temperature: ['temperatur[ayęe]'], mucosa: ['[śs]luz[óo]wki'], lymph_nodes: ['w[ęe]z[łl]y(?:\\s+ch[łl]onne)?']};
  const withUnit = (value, unit) => unit && /^[+-]?\d+(?:[.,]\d+)?$/.test(value) ? value + unit : value;
  function renderPanelRow(label, value) { value = strip(normalizeEol(value)); if (!value) return ''; label = strip(label); return label ? label + ': ' + value : value; }

  /* ---------------------------------------------------------- vital_lexicon */
  const LEXICON = {
    general_condition: ['stan\\w*\\s+ogoln', 'apat', 'osowia', 'oslabi', 'letarg', 'otepia', 'przytomn', 'nieprzytomn', 'wstrzas', 'lezac', 'nie\\s+wstaje', 'pobudz', 'spiaczk', 'kondycj', 'kontakt', 'niekontakt'],
    temperature: ['temperatur', 'temp\\b', 'goracz', 'cieplot', 'hipoterm', 'hiperterm', 't(?:\\s*[:=]\\s*|\\s+)\\d'],
    capillary_refill: ['crt\\b', 'kapilar'], mucosa: ['sluzow', 'blon\\w*\\s+sluz', 'dziase?l', 'spojow', 'zoltacz', 'sinic'],
    heart_rate: ['tetn', 'hr\\b', 'puls', 'tachykard', 'bradykard'], cardiac_auscultation: ['serc', 'szmer(?!\\w*\\s+pecherzyk)', 'arytmi', 'galop'],
    respiratory_auscultation: ['pluc', 'oskrzel', 'oddech', 'oddych', 'duszn', 'trzeszcz', 'rzezeni', 'swist', 'szmer\\w*\\s+pecherzyk', 'krtan', 'tchawic'],
    pulmonary_auscultation: ['pluc', 'oskrzel', 'duszn', 'trzeszcz', 'rzezeni', 'swist', 'szmer\\w*\\s+pecherzyk'],
    respiratory_rate: ['oddech', 'oddych', 'rr\\b', 'tachypn', 'dysz'], lymph_nodes: ['wez', 'chlonn', 'limfaden'], abdomen: ['brzu', 'trzewi'],
    peristalsis: ['perystalt', 'borborygm', 'odglos\\w*\\s+jelit', 'motoryk\\w*\\s+jelit'], intestinal_quadrants: ['perystalt', 'kwadrant', 'borborygm', 'odglos\\w*\\s+jelit'],
    locomotion: ['kulaw', 'aparat\\w*\\s+ruch', 'oszczedz'], digital_pulse_hooves: ['kopyt', 'pusze?k', 'tetn\\w*\\s+palc'], skin_turgor: ['odwodni', 'turgor', 'fald\\w*\\s+skor']
  };
  const GENERIC_LABEL_WORDS = new Set(['stan', 'ogolny', 'drogi', 'osluchowo', 'odglosy', 'liczba', 'czestosc', 'ocena', 'badanie', 'wynik', 'inne', 'uwagi', 'opis', 'objawy', 'palpacyjnie', 'wzrokowo']);
  const pyTerm = term => term.replace(/\\w/g, W).replace(/\\b/g, `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`);
  function labelStems(label) { return (foldSameLength(label).match(/[a-z]+/g) || []).filter(w => w.length >= 4 && !GENERIC_LABEL_WORDS.has(w)).map(w => escapeRe(w.slice(0, Math.max(4, w.length - 3)))); }
  function mentionPatterns(parameters) {
    const result = [];
    for (const p of parameters) { const terms = LEXICON[p.id] || labelStems(p.label); if (terms.length) result.push([p.id, rx(`(?<![a-z0-9])(?:${terms.map(pyTerm).join('|')})${W}*`, 'g')]); }
    return result;
  }
  function findMentions(text, patterns) {
    const folded = foldSameLength(text), found = [];
    for (const [pid, re] of patterns) for (const m of finditer(re, folded)) found.push({pid, start: m.index, end: m.index + m[0].length});
    return found.sort((a, b) => a.start - b.start || a.end - b.end || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0));
  }
  const LEX_UNMEASURED = rx(`${NB}(?:nie\\s*(?:zmierz${W}*|mierz${W}*|badan${W}*|zbadan${W}*|ocen${W}*|ustalon${W}*|sprawdz${W}*)|brak\\s+(?:pomiar${W}*|ocen${W}*|danych|bada${W}*))${NA}`, 'i');
  const squash = text => String(text).toLowerCase().split(/\s+/u).filter(Boolean).join(' ');
  function unmeasuredPhrase(text) { const m = LEX_UNMEASURED.exec(text); return m ? squash(m[0]) : ''; }
  function unmeasuredStatement(text) {
    const m = LEX_UNMEASURED.exec(text); if (!m) return '';
    const rest = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    if (/[,;]/.test(rest) || (rest.match(rx(`${W}+`, 'g')) || []).length > 3) return '';
    return squash(m[0]);
  }

  /* ---------------------------------------------------------- application/panel.py: local reader */
  const CONTEXT = rx(`${NB}(?:wczoraj|wcze[śs]niej|poprzednio|dawniej|obecnie|dzi[śs]|dzisiaj|historycz${W}*|wywiad${W}*|w[łl]a[śs]ciciel${W}*|podejrze${W}*|niepewn${W}*|mo[żz]liw${W}*|po|przed)${NA}`, 'i');
  const UNMEASURED = rx(`${NB}(?:nie\\s*(?:zmierz${W}*|mierz${W}*|badan${W}*|zbadan${W}*|ocen${W}*|ustalon${W}*)|brak\\s+(?:pomiar${W}*|ocen${W}*|danych))${NA}`, 'i');
  const APATHY = rx(`${NB}(?:apat${W}*|osowia${W}*)${NA}`, 'i');
  const CONTINUATION = rx(`^\\s*(?:dzi[śs]|dzisiaj|wczoraj|obecnie|aktualnie|wcze[śs]niej|potem|nast[ęe]pnie|ponownie|po|przed)${NA}`, 'i');
  const AIRWAYS = new Set(['respiratory_auscultation', 'pulmonary_auscultation']);
  const CARDIAC_DETAIL = /skurcz|rozkurcz|serc|zastawk|holo|pansystol|\d\s*\/\s*6/;
  const VALUE_TRIM = ' \t:=–—-,;';
  function anchorPatterns(parameters) {
    return parameters.map(p => [p, rx(`${NB}(?:${byLengthDesc([escapeRe(p.label), ...(ALIASES[p.id] || []), ...(EXTRA_ALIASES[p.id] || [])]).join('|')})${NA}`, 'gi')]);
  }
  function clauses(note) {
    const spans = abbreviationSpans(note), masked = maskAbbreviations(note, spans).split('');
    for (const m of finditer(TEMP_DOT, note)) masked[m.index + m[0].length - 1] = '\0';
    for (const re of [PREFIX_ABBREVIATION, INNER_ABBREVIATION_DOT]) for (const m of finditer(re, note)) for (let i = m.index; i < m.index + m[0].length; i++) if (note[i] === '.') masked[i] = '\0';
    const text = masked.join(''), out = []; let start = 0;
    for (const m of finditer(VALUE_BOUNDARY, text)) {
      const preserve = '!?'.includes(m[0]) || spans.some(([a, b]) => a <= m.index && m.index < b);
      const end = preserve ? m.index + m[0].length : m.index;
      if (strip(note.slice(start, end))) out.push(strip(note.slice(start, end)));
      start = m.index + m[0].length;
    }
    if (strip(note.slice(start))) out.push(strip(note.slice(start)));
    return out;
  }
  function labelledAnchors(clause, patterns) {
    const found = [];
    for (const [p, re] of patterns) for (const m of finditer(re, clause)) found.push([m.index, m.index + m[0].length, p.id]);
    found.sort((a, b) => a[0] - b[0] || (b[1] - b[0]) - (a[1] - a[0]) || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
    const anchors = [];
    for (const item of found) if (!anchors.length || item[0] >= anchors.at(-1)[1]) anchors.push(item);
    return anchors;
  }
  function apathyExpression(clause, anchors, parameters) {
    if (!parameters.some(p => p.id === 'general_condition') || !APATHY.test(clause)) return null;
    if (anchors.some(a => a[2] === 'general_condition')) return null;
    const expression = stripChars(clause.slice(0, anchors.length ? anchors[0][0] : clause.length), ' ,;');
    return APATHY.test(expression) ? expression : null;
  }
  function segmentEnd(clause, start, stop) { const comma = Math.max(rfind(clause, ',', start, stop), rfind(clause, ';', start, stop)); return comma >= 0 ? comma : stop; }
  function breathSound(clause, mention, airwayEnds) {
    if (mention.pid !== 'cardiac_auscultation') return false;
    const folded = foldSameLength(clause);
    if (!folded.startsWith('szmer', mention.start)) return false;
    const before = airwayEnds.filter(end => end <= mention.start);
    if (!before.length || /[,;]/.test(clause.slice(Math.max(...before), mention.start))) return false;
    return !CARDIAC_DETAIL.test(folded.slice(mention.start).split(/[,;]/)[0]);
  }
  function unlabelledMentions(clause, lexicon, anchors) {
    const mentions = new Map(), seen = new Set(), found = findMentions(clause, lexicon);
    const airwayEnds = [...anchors.filter(a => AIRWAYS.has(a[2])).map(a => a[1]), ...found.filter(m => AIRWAYS.has(m.pid)).map(m => m.end)];
    for (const m of found) {
      if (seen.has(m.pid) || anchors.some(([s, e]) => s < m.end && m.start < e) || breathSound(clause, m, airwayEnds)) continue;
      seen.add(m.pid); if (!mentions.has(m.start)) mentions.set(m.start, []); mentions.get(m.start).push(m.pid);
    }
    return mentions;
  }
  function sourcePanelValues(note, parameters) {
    const patterns = anchorPatterns(parameters), cls = clauses(note);
    const anchorsBy = cls.map(c => labelledAnchors(c, patterns)), apathyBy = cls.map((c, i) => apathyExpression(c, anchorsBy[i], parameters));
    const observed = new Set(anchorsBy.flat().map(a => a[2])); if (apathyBy.some(Boolean)) observed.add('general_condition');
    const lexicon = mentionPatterns(parameters.filter(p => !observed.has(p.id)));
    const result = {}, add = (pid, item) => (result[pid] ||= []).push(item);
    let previous = [];
    cls.forEach((clause, ci) => {
      const anchors = anchorsBy[ci], apathy = apathyBy[ci], mentions = unlabelledMentions(clause, lexicon, anchors);
      if (!anchors.length && !mentions.size && previous.length && CONTINUATION.test(clause) && /\d/.test(clause)) {
        for (const pid of previous) add(pid, {value: clause, quote: clause, qualified: true});
        return;
      }
      const elements = [...anchors.map(([start, end, pid]) => ({start, end, pids: [pid], kind: 'anchor'})), ...[...mentions].map(([start, pids]) => ({start, end: start, pids, kind: 'mention'}))]
        .sort((a, b) => a.start - b.start || (a.kind !== 'anchor') - (b.kind !== 'anchor'));
      const unmeasured = UNMEASURED.test(clause);
      let anchorIndex = 0, segmentStart = 0, mentionBefore = false;
      elements.forEach((el, position) => {
        const following = elements[position + 1], nextStart = following ? following.start : clause.length;
        const stop = following && following.kind === 'mention' ? segmentEnd(clause, el.end, nextStart) : nextStart;
        if (el.kind === 'mention') {
          const text = stripChars(clause.slice(segmentStart, stop), VALUE_TRIM), phrase = unmeasuredStatement(text);
          for (const pid of el.pids) add(pid, {value: phrase || text, quote: text, qualified: !phrase, status: phrase ? 'not_examined' : 'mentioned'});
          segmentStart = stop < nextStart ? stop + 1 : stop; mentionBefore = true; return;
        }
        const pid = el.pids[0], index = anchorIndex++, base = mentionBefore ? segmentStart : 0;
        const raw = stripChars(clause.slice(el.end, stop), VALUE_TRIM), prefix = stripChars(clause.slice(base, el.start), ' \t,;');
        let neutral = !prefix || /^[-*•]+$/.test(prefix);
        if (['cardiac_auscultation', 'respiratory_auscultation', 'pulmonary_auscultation'].includes(pid)) neutral = neutral || /^os[łl]uchowo\s*:?$/iu.test(prefix);
        let qualified = CONTEXT.test(prefix) || CONTEXT.test(raw) || raw.includes('?') || (index === 0 && !neutral);
        const coordination = /^(?:i|oraz|,|\s)+$/iu.test(raw);
        let value, quote;
        if (coordination || (unmeasured && !raw)) { value = quote = clause; qualified = true; }
        else if (raw) {
          const quoteStart = index === 0 && qualified ? base : el.start;
          quote = stripChars(clause.slice(quoteStart, stop), ' ,;'); value = qualified ? quote : raw;
          if (pid === 'respiratory_auscultation' && /p[łl]uca/iu.test(clause.slice(el.start, el.end))) value = qualified ? value : 'Płuca: ' + value;
        } else { value = quote = strip(clause.slice(el.start)); qualified = true; }
        const observation = {value, quote, qualified};
        if (!qualified && raw && unmeasuredPhrase(raw) === squash(raw)) observation.status = 'not_examined';
        add(pid, observation);
        segmentStart = stop < nextStart ? stop + 1 : stop;
      });
      if (apathy !== null) add('general_condition', {value: apathy, quote: apathy, qualified: CONTEXT.test(apathy) || apathy.includes('?')});
      previous = elements.length ? elements.at(-1).pids : [];
    });
    return result;
  }

  /* ---------------------------------------------------------- domain/panel_evidence.py */
  const EV_TRIM = ' \t\r\n"\'„”“«»‚’.,;:';
  const EV_BOUNDARY = /[;\n!?]|(?<!\d)\.(?!\d)/g;
  const EV_CONTEXT = rx(`${NB}(?:nie|bez|brak|wczoraj|wcze[śs]niej|poprzednio|dawniej|obecnie|dzi[śs]|dzisiaj|historycz${W}*|wywiad${W}*|w[łl]a[śs]ciciel${W}*|podejrze${W}*|niepewn${W}*|mo[żz]liw${W}*)${NA}`, 'i');
  const LAB_T4 = rx(`${NB}(?:t4|ft4|tt4)${NA}`, 'i');
  const panelSources = (note, sources = []) => sources.length ? sources.filter(s => s.included !== false && s.role !== 'diagnosis' && strip(s.text)).map(s => [s.id, s.text]) : [['approved_note', note]];
  function foldedWithPositions(text) {
    let out = ''; const positions = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (/\s/u.test(c)) { if (out && out.at(-1) !== ' ') { out += ' '; positions.push(i); } continue; }
      const lower = c.toLowerCase(); if (lower.length === 1) { out += lower; positions.push(i); } else { out += c; positions.push(i); }
    }
    return [out, positions];
  }
  function locatePanelQuote(quote, note, sources = []) {
    const needle = strip(foldedWithPositions(stripChars(String(quote), EV_TRIM))[0]);
    if (needle.length < 2 || ![...needle].some(isAlnum)) return [];
    const spans = [];
    for (const [sourceId, text] of panelSources(note, sources)) {
      const [folded, positions] = foldedWithPositions(text);
      for (let start = folded.indexOf(needle); start >= 0; start = folded.indexOf(needle, start + 1)) {
        const end = start + needle.length;
        if ((start === 0 || !isAlnum(folded[start - 1])) && (end === folded.length || !isAlnum(folded[end]))) {
          const begin = positions[start], finish = positions[end - 1] + 1;
          const before = [...finditer(EV_BOUNDARY, text.slice(0, begin))], after = search(EV_BOUNDARY, text, finish);
          const contextStart = before.length ? before.at(-1).index + before.at(-1)[0].length : 0, contextEnd = after ? after.index : text.length;
          spans.push({source_id: sourceId, start: begin, end: finish, quote: text.slice(begin, finish), context_start: contextStart, context_end: contextEnd, context: text.slice(contextStart, contextEnd)});
        }
      }
    }
    return spans;
  }
  const cache = new Map();
  const memo = (key, make) => { if (!cache.has(key)) { if (cache.size > 64) cache.clear(); cache.set(key, make()); } return cache.get(key); };
  const paramsKey = parameters => parameters.map(p => p.id + '\u0001' + p.label).join('\u0002');
  function identityPatterns(parameters) {
    return memo('id:' + paramsKey(parameters), () => {
      const labels = new Map(parameters.map(p => [p.id, p.label]));
      for (const [label, identity] of KNOWN) if (!labels.has(identity)) labels.set(identity, label);
      return [...labels].map(([identity, label]) => [identity, rx(`${NB}(?:${byLengthDesc([escapeRe(label), ...(ALIASES[identity] || [])]).join('|')})${NA}`, 'i')]);
    });
  }
  function allMentionPatterns(parameters) {
    return memo('mention:' + paramsKey(parameters), () => {
      const expanded = new Map(parameters.map(p => [p.id, p]));
      for (const [label, identity] of KNOWN) if (!expanded.has(identity)) expanded.set(identity, {id: identity, label});
      return mentionPatterns([...expanded.values()]);
    });
  }
  const ASSIGNMENT_MESSAGES = {quote_missing: 'Nie znaleziono proponowanego cytatu w zatwierdzonych źródłach. Sprawdź wartość wiersza.',
    different_parameter: 'Cytat wskazuje inny parametr. Zachowano go do poprawnego przypisania w podglądzie.',
    temperature_token_collision: 'Skrót T4, FT4 lub TT4 nie potwierdza wzmianki o temperaturze. Sprawdź przypisanie cytatu.',
    context_clipped: 'Cytat pomija kontekst źródła, np. negację lub czas. Zachowano pełniejszy fragment do sprawdzenia.',
    multiple_contexts: 'Te słowa występują w kilku kontekstach. Sprawdź, którego ustalenia dotyczy wiersz.'};
  function assessPanelAssignment(pid, quote, note, parameters, {origin = 'ai', sources = []} = {}) {
    const spans = locatePanelQuote(quote, note, sources), idp = identityPatterns(parameters);
    let related = idp.filter(([, re]) => re.test(quote)).map(([id]) => id).sort();
    const mentioned = unique(findMentions(quote, allMentionPatterns(parameters)).map(m => m.pid)).sort();
    const contextRelated = unique(spans.flatMap(span => idp.filter(([, re]) => re.test(span.context)).map(([id]) => id))).sort();
    let status = 'ambiguous', reason = 'identity_unconfirmed';
    if (!spans.length) reason = 'quote_missing';
    else if (!related.includes(pid) && pid === 'temperature' && LAB_T4.test(quote)) { status = 'mismatch'; reason = 'temperature_token_collision'; }
    else if (related.length && !related.includes(pid) && !mentioned.includes(pid)) { status = 'mismatch'; reason = 'different_parameter'; }
    else if (!related.length && !mentioned.length && contextRelated.length === 1 && !contextRelated.includes(pid)) { related = contextRelated; status = 'mismatch'; reason = 'different_parameter'; }
    else if (new Set(spans.map(s => strip(s.context).toLowerCase())).size > 1) reason = 'multiple_contexts';
    else if (spans.some(s => EV_CONTEXT.test(s.context.slice(0, s.start - s.context_start).split(',').at(-1)) || EV_CONTEXT.test(s.context.slice(s.end - s.context_start).split(',')[0]))) reason = 'context_clipped';
    else if (related.includes(pid)) { status = 'match'; reason = 'explicit_parameter'; }
    else if (mentioned.length === 1 && mentioned[0] === pid) { status = 'match'; reason = 'parameter_mention'; }
    else if (mentioned.length) reason = 'shared_parameter_mention';
    const first = spans[0];
    const message = ASSIGNMENT_MESSAGES[reason] || (status === 'ambiguous' ? 'Nie potwierdzono jednoznacznie przypisania cytatu do tego parametru. Zachowano propozycję do sprawdzenia.' : 'Cytat zawiera jawną nazwę przypisanego parametru; jego treść pozostaje do oceny lekarza.');
    const id = JSON.stringify([pid, spans.map(s => [s.source_id, s.start, s.end]), spans.length ? '' : quote, status, reason]);
    return {id, parameter_id: pid, proposed_quote: quote, spans, origin, status, reason, related, source_verified: spans.length > 0,
      evidence: {id, code: 'panel_assignment_' + status, parameter_id: pid, assignment_status: status, reason, origin, source_verified: spans.length > 0,
        source_id: first ? first.source_id : '', quote: first ? first.quote : quote, proposed_quote: quote, context: first ? first.context : '',
        related_parameters: related, message, severity: status !== 'match' ? 'review' : 'info', requires_resolution: status !== 'match'}};
  }

  /* ---------------------------------------------------------- domain/panel_spelling.py, application/panel_quotes.py */
  const ARROW = ' => ', SP_WORD = /[\p{L}\p{N}]+/gu, SIGNS = /[<>≤≥±+%°/=]/g, NEGATIONS = new Set(['nie', 'bez', 'brak', 'ani', 'nigdy']);
  const spFold = word => word.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{Mn}/gu, '');
  function distance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let earlier = null, previous = null, current = [...Array(b.length + 1).keys()];
    for (let i = 1; i <= a.length; i++) {
      earlier = previous; previous = current; current = [i, ...Array(b.length).fill(0)];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] !== b[j - 1] ? 1 : 0;
        current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], earlier[j - 2] + 1);
      }
      if (Math.min(...current) > limit) return limit + 1;
    }
    return current.at(-1);
  }
  function spellingOnly(original, corrected) {
    const words = original.match(SP_WORD) || [], fixed = corrected.match(SP_WORD) || [];
    if (!words.length || words.length !== fixed.length || corrected.length > 2 * original.length + 8 || (original.match(SIGNS) || []).join('') !== (corrected.match(SIGNS) || []).join('')) return false;
    for (let i = 0; i < words.length; i++) {
      const word = words[i], correction = fixed[i];
      if (word.toLowerCase() === correction.toLowerCase()) continue;
      if (/\d/.test(word + correction)) return false;
      const a = spFold(word), b = spFold(correction);
      if (a === b) continue;
      if (NEGATIONS.has(a) || NEGATIONS.has(b) || a.startsWith('nie') !== b.startsWith('nie')) return false;
      const limit = a.length < 2 ? 0 : a.length < 4 ? 1 : 2;
      if (distance(a, b, limit) > limit) return false;
    }
    return true;
  }
  const MARKS = ' \t"\'„”“«»‚’';
  function splitSpelling(quote) {
    const at = quote.indexOf(ARROW); if (at < 0) return [quote, null];
    const original = stripChars(quote.slice(0, at), MARKS), corrected = stripChars(quote.slice(at + ARROW.length), MARKS);
    return !original || !corrected ? [quote, null] : [original, corrected];
  }
  function respell(text, spelling) {
    const words = [...text.matchAll(SP_WORD)]; if (!words.length || !spelling || !Object.keys(spelling).length) return text;
    const tokens = words.map(m => m[0].toLowerCase());
    for (const [original, corrected] of Object.entries(spelling)) {
      const source = (original.match(SP_WORD) || []).map(w => w.toLowerCase()), fixed = [...corrected.matchAll(SP_WORD)];
      if (source.length !== fixed.length) continue;
      for (let i = 0; i + tokens.length <= source.length; i++) {
        if (tokens.every((t, k) => source[i + k] === t)) {
          const body = corrected.slice(fixed[i].index, fixed[i + tokens.length - 1].index + fixed[i + tokens.length - 1][0].length);
          return text.slice(0, words[0].index) + body + text.slice(words.at(-1).index + words.at(-1)[0].length);
        }
      }
    }
    return text;
  }
  function withoutLabel(value, label) {
    const labelWords = (label.replace(/\([^)]*\)/g, ' ').match(SP_WORD) || []).map(spFold), words = [...value.matchAll(SP_WORD)];
    if (!labelWords.length || words.length <= labelWords.length) return value;
    if (words.slice(0, labelWords.length).some((m, i) => spFold(m[0]) !== labelWords[i])) return value;
    const last = words[labelWords.length - 1], rest = value.slice(last.index + last[0].length).replace(/^[ \t:\-–—,]+/, '');
    return rest || value;
  }
  function verifyPanelQuotes(quotes, source, parameterIds, {sources = []} = {}) {
    const known = new Set(parameterIds), accepted = {}, unverified = [], rejected = {}, spelling = {};
    for (const [pid, items] of Object.entries(quotes || {})) {
      if (!known.has(pid)) continue;
      const found = [], missing = [];
      for (let quote of items) {
        let spans = locatePanelQuote(quote, source, sources), corrected = null;
        if (!spans.length) { [quote, corrected] = splitSpelling(quote); spans = corrected ? locatePanelQuote(quote, source, sources) : []; }
        const text = spans.length ? spans[0].quote : null;
        if (text !== null && corrected !== null && spellingOnly(text, corrected) && !(text in spelling)) spelling[text] = corrected;
        if (text !== null && !found.includes(text)) found.push(text);
        else if (text === null && !missing.includes(quote)) missing.push(quote);
      }
      if (found.length) accepted[pid] = found; else if (items.length) unverified.push(pid);
      if (missing.length) rejected[pid] = missing;
    }
    return {accepted, unverified, rejected, spelling};
  }

  /* ---------------------------------------------------------- build_full_panel */
  const rowStatus = (matches, qualified) => !qualified && matches.every(m => m.status === 'not_examined') ? 'not_examined' : qualified ? 'mentioned' : 'measured';
  function readAttributed(assignments, parameter, parameters) {
    const result = [];
    for (const a of assignments) {
      if (!a.source_verified || a.status === 'mismatch') continue;
      if (a.reason === 'context_clipped' || a.reason === 'multiple_contexts') { for (const context of unique(a.spans.map(s => strip(s.context)))) result.push({value: context, quote: context, qualified: true, status: 'mentioned'}); continue; }
      const fragment = a.spans[0].quote, read = sourcePanelValues(fragment, parameters)[parameter.id];
      result.push(...(read || [{value: fragment, quote: fragment, qualified: true, status: 'mentioned'}]));
    }
    return result;
  }
  const shown = (value, label, spelling) => withoutLabel(respell(value, spelling).replace(/[ \t]{2,}/g, ' '), label);
  function buildFullPanel(note, parameters, {attributed = {}, unverified = [], rejected = {}, sources = [], spelling = {}} = {}) {
    const observations = {};
    for (const [, text] of panelSources(note, sources)) for (const [pid, values] of Object.entries(sourcePanelValues(text, parameters))) (observations[pid] ||= []).push(...values);
    const rows = [], lines = [];
    for (const parameter of parameters) {
      let matches = observations[parameter.id] || [];
      const local = matches.map(item => assessPanelAssignment(parameter.id, item.quote, note, parameters, {origin: 'local', sources}));
      matches = matches.filter((item, i) => local[i].source_verified && local[i].status !== 'mismatch');
      let model = [...(attributed[parameter.id] || []), ...(rejected[parameter.id] || [])].map(q => assessPanelAssignment(parameter.id, q, note, parameters, {origin: 'ai', sources}));
      if (unverified.includes(parameter.id) && !model.length) model = [assessPanelAssignment(parameter.id, '', note, parameters, {origin: 'ai', sources})];
      const assignments = [...local, ...model], issues = [...new Map(assignments.filter(a => a.status !== 'match').map(a => [a.id, a.evidence])).values()];
      let attribution = 'local';
      const localQualified = matches.length > 1 || matches.some(m => m.qualified);
      if (model.length && (!matches.length || rowStatus(matches, localQualified) === 'mentioned')) { const proposed = readAttributed(model, parameter, parameters); if (proposed.length) { matches = proposed; attribution = 'ai'; } }
      const quotes = unique(matches.map(m => m.quote)), qualified = matches.length > 1 || matches.some(m => m.qualified);
      let value, origin, status, respelled = false;
      if (matches.length) {
        const pieces = qualified ? quotes : [matches[0].value];
        value = qualified ? quotes.map(q => shown(q, parameter.label, spelling)).join('; ') : withUnit(shown(matches[0].value, parameter.label, spelling), parameter.unit);
        respelled = pieces.some(p => respell(p, spelling) !== p); origin = 'source'; status = rowStatus(matches, qualified);
      } else if (unverified.includes(parameter.id)) { value = ''; origin = status = 'unverified'; attribution = 'ai'; }
      else if (issues.length) { value = ''; origin = 'unresolved'; status = 'assignment_pending'; attribution = model.length ? 'ai' : 'local'; }
      else if (strip(parameter.reference || '')) { value = strip(parameter.reference); origin = 'template'; status = 'default'; }
      else { value = parameter.missing === 'not_provided' ? 'nie podano' : ''; origin = status = 'missing'; }
      rows.push({parameter_id: parameter.id, label: parameter.label, value, origin, status, quotes, respelled, needs_review: qualified || origin === 'unverified' || issues.length > 0, attribution,
        assignment_status: assignments.some(a => a.status === 'mismatch') ? 'mismatch' : issues.length ? 'ambiguous' : assignments.length ? 'match' : 'not_applicable', assignment_issues: issues});
      const line = renderPanelRow(parameter.label, value); if (line) lines.push(line);
    }
    return {text: lines.join('\n'), rows};
  }

  /* ---------------------------------------------------------- application/panel_repetition.py */
  const SPACE = /\s+/gu, SENTENCE_END = /[.!?](?=\s|$)/g;
  const TEMP_ABBREVIATION = rx(`${NB}temp\\.(?=\\s*(?:ciała\\s*)?\\d)`, 'gi');
  const SCOPE_HEADING = /^[^\S\n]*\S[^\n]*:[^\S\n]*$/m;
  const REP_CONTEXT = rx(`${NB}(?:wczoraj|dzis|dzisiaj|teraz|obecnie|wczesniej|poprzedni${W}*|dawniej|historycz${W}*|ostatnio|nastepni${W}*|jutro|rano|wieczorem|po|przed|podczas|od\\s+(?:wczoraj|rana|tygodnia|miesiaca)|w\\s+trakcie|z\\s+(?:tendencj${W}*|wyjatkiem)|wedlug|wywiad${W}*|wlasciciel${W}*|opiekun${W}*|zglasza${W}*|relacjon${W}*|podejrze${W}*|mozliw${W}*|moz[eal]${W}*|mozn${W}*|mogl${W}*|prawdopodob${W}*|niepewn${W}*|watpliw${W}*|wyklucz${W}*|jesli|gdyby|warunkow${W}*|rzekom${W}*|rtg|radiolog${W}*|usg|tomograf${W}*|rezonans${W}*|ekg|echokardiograf${W}*)${NA}`, 'i');
  const DEPENDENT_SENTENCE = rx(`(?:^|[.!?]\\s+|\\n)\\s*(?:to|ta|ten|te|tym|taki${W}*|taka${W}*|wartosc|wynik|wzrosl${W}*|obnizyl${W}*|spadl${W}*|podwyzszon${W}*|obnizon${W}*|utrzymuj${W}*|pozostal${W}*|nadal|jednak|dlatego|zatem|byla|bylo|byl|jest\\s+(?:ona|on|ono))${NA}`, 'i');
  const NUMERIC_VALUE = rx('(?<number>\\d+(?:[.,]\\d+)?)\\s*(?<unit>°\\s*[CF]|[CFK])?', 'i');
  const TEMPERATURE_SENTENCE = rx('(?:temperatura(?:\\s+ciała)?|temp\\.?|t)\\s*:?[ \\t]*(?:wynosi\\s+)?(?<value>\\d+(?:[.,]\\d+)?\\s*(?:°\\s*[CF]|[CFK])?)', 'i');
  const CARDIAC_SENTENCE = rx('(?:osłuchowo\\s*[:,]?\\s+serce|serce\\s*\\(\\s*osłuchowo\\s*\\)|serce\\s+osłuchowo|w\\s+osłuchiwaniu\\s+serca|w\\s+badaniu\\s+osłuchowym\\s+serca)\\s*:?[ \\t]*(?:stwierdzono\\s+)?(?<value>\\S.*)', 'i');
  const PULMONARY_SENTENCE = rx('(?:osłuchowo\\s*[:,]?\\s+płuca|płuca\\s*\\(\\s*osłuchowo\\s*\\)|płuca\\s+osłuchowo|w\\s+osłuchiwaniu\\s+płuc|w\\s+badaniu\\s+osłuchowym\\s+płuc)\\s*:?[ \\t]*(?:stwierdzono\\s+)?(?<value>\\S.*)', 'i');
  const ABDOMINAL_SENTENCE = rx('brzuch\\s+(?:jest\\s+)?(?<value>\\S.*)', 'i');
  const LUNG_SCOPE = rx('płuca\\s*:\\s*(?<value>\\S.*)', 'i');
  const BILATERAL_WHEEZES = rx('(?:świsty\\s+obustronnie|obustronne\\s+świsty)', 'i');
  const surface = value => strip(String(value).normalize('NFC').replace(SPACE, ' ')).toLowerCase();
  const valueSurface = value => { let v = strip(value); if (v.endsWith('.')) v = v.slice(0, -1); return surface(v.replace(/\s+$/u, '')); };
  const unsafeContext = value => value.includes('?') || value.includes('…') || value.includes('..') || REP_CONTEXT.test(fold(value)) || DEPENDENT_SENTENCE.test(fold(value)) || SCOPE_HEADING.test(value);
  const TEMP_UNITS = {'': null, '°c': 'c', c: 'c', '°f': 'f', f: 'f', k: 'k'};
  const temperatureUnit = value => { const u = surface(value).replace(/ /g, ''); return Object.prototype.hasOwnProperty.call(TEMP_UNITS, u) ? TEMP_UNITS[u] : 'unsupported'; };
  function temperatureValue(value) { const m = fullmatch(NUMERIC_VALUE, valueSurface(value)); return m ? [m.groups.number.replace(',', '.'), temperatureUnit(m.groups.unit || '')] : null; }
  function lungValue(value) { value = valueSurface(value); return fullmatch(BILATERAL_WHEEZES, value) ? 'bilateral_wheezes|' : 'literal|' + value; }
  function put(index, key, fact) { const k = JSON.stringify(key), f = JSON.stringify(fact); if (index.has(k) && index.get(k) !== f) index.set(k, null); else index.set(k, f); }
  function repetitionFacts(parameters, rows) {
    const counts = {}; parameters.forEach(p => counts[p.id] = (counts[p.id] || 0) + 1);
    const byId = new Map(parameters.filter(p => counts[p.id] === 1).map(p => [p.id, p]));
    const rowCounts = {}; rows.forEach(r => rowCounts[r.parameter_id] = (rowCounts[r.parameter_id] || 0) + 1);
    const [direct, temperature, unitless, cardiac, pulmonary, abdominal] = [0, 0, 0, 0, 0, 0].map(() => new Map());
    for (const row of rows) {
      const p = byId.get(row.parameter_id);
      if (!p || rowCounts[p.id] !== 1 || row.origin !== 'source' || row.needs_review !== false) continue;
      const value = row.value; if (typeof value !== 'string' || !strip(value) || unsafeContext(value)) continue;
      const quotes = row.quotes || []; if (!quotes.length || quotes.some(q => !strip(q) || unsafeContext(q)) || new Set(quotes).size !== 1) continue;
      const fact = {parameter_id: p.id, label: p.label, value};
      if (p.id === 'temperature') {
        const measurement = temperatureValue(value);
        if (measurement) {
          const [number, explicit] = measurement, configured = temperatureUnit(p.unit);
          if (configured === 'unsupported' || (configured !== null && explicit !== null && configured !== explicit)) continue;
          const effective = explicit || configured; put(temperature, [number, effective], fact);
          if (effective === null || (configured === effective && effective === 'c')) put(unitless, number, fact);
        } else if (/\d/.test(value)) continue;
      }
      put(direct, [surface(p.label), valueSurface(value)], fact);
      if (p.id === 'cardiac_auscultation') put(cardiac, valueSurface(value), fact);
      else if (p.id === 'abdomen') put(abdominal, valueSurface(value), fact);
      else if (p.id === 'respiratory_auscultation' || p.id === 'pulmonary_auscultation') {
        let v = strip(value); if (v.endsWith('.')) v = v.slice(0, -1);
        const scope = fullmatch(LUNG_SCOPE, strip(v));
        if (scope) put(pulmonary, lungValue(scope.groups.value), fact); else if (p.id === 'pulmonary_auscultation') put(pulmonary, lungValue(value), fact);
      }
    }
    return [direct, temperature, unitless, cardiac, pulmonary, abdominal];
  }
  function equivalentFact(candidate, [direct, temperature, unitless, cardiac, pulmonary, abdominal]) {
    if (candidate.includes(';') || /[?!]$/.test(candidate.replace(/\s+$/u, ''))) return null;
    const text = valueSurface(candidate); if (!text) return null;
    const get = (index, key) => { const v = index.get(JSON.stringify(key)); return v ? JSON.parse(v) : null; };
    const colon = text.indexOf(':');
    if (colon >= 0) { const found = get(direct, [surface(text.slice(0, colon)), valueSurface(text.slice(colon + 1))]); if (found) return found; }
    let m = fullmatch(TEMPERATURE_SENTENCE, text);
    if (m) { const measurement = temperatureValue(m.groups.value); if (measurement) { const [number, unit] = measurement; return unit === null ? get(unitless, number) : get(temperature, [number, unit]); } }
    if ((m = fullmatch(CARDIAC_SENTENCE, text))) return get(cardiac, valueSurface(m.groups.value));
    if ((m = fullmatch(PULMONARY_SENTENCE, text))) return get(pulmonary, lungValue(m.groups.value));
    if ((m = fullmatch(ABDOMINAL_SENTENCE, text))) return get(abdominal, valueSurface(m.groups.value));
    return null;
  }
  function sentenceSpans(text) {
    const protectedDots = new Set();
    for (const [start, end] of abbreviationSpans(text)) {
      const finalDot = text[end - 1] === '.' ? end - 1 : -1;
      for (let i = start; i < end; i++) if (text[i] === '.' && i !== finalDot) protectedDots.add(i);
      if (finalDot >= 0) { let next = end; while (next < text.length && /\s/u.test(text[next])) next++; if (next < text.length && !(text[next] !== text[next].toLowerCase() && text[next] === text[next].toUpperCase())) protectedDots.add(finalDot); }
    }
    for (const m of finditer(TEMP_ABBREVIATION, text)) protectedDots.add(m.index + m[0].length - 1);
    const spans = []; let start = 0;
    for (const m of finditer(SENTENCE_END, text)) if (!protectedDots.has(m.index)) { spans.push([start, m.index + m[0].length]); start = m.index + m[0].length; }
    if (start < text.length) spans.push([start, text.length]);
    return spans;
  }
  /* Keep narrative except complete, unambiguous repetitions of source rows. pieces: the original
   * sentences in order, marked removed, for the review's struck-through preview. */
  function removeRepeatedPanelFacts(text, parameters, rows) {
    const unchanged = {text, diagnostics: [], pieces: null};
    if (!strip(text) || !parameters.length || !rows.length || unsafeContext(text)) return unchanged;
    const indexes = repetitionFacts(parameters, rows); if (!indexes.some(index => index.size)) return unchanged;
    const kept = [], removed = new Map(), pieces = [];
    for (const [start, end] of sentenceSpans(text)) {
      const sentence = text.slice(start, end), fact = equivalentFact(sentence, indexes);
      pieces.push({removed: !!fact, text: sentence});
      if (!fact) { kept.push(sentence); continue; }
      if (!removed.has(fact.parameter_id)) removed.set(fact.parameter_id, [fact, []]);
      removed.get(fact.parameter_id)[1].push(sentence);
    }
    if (!removed.size) return unchanged;
    const diagnostics = [...removed.values()].map(([fact, fragments]) => ({code: 'panel_fact_repetition_removed', severity: 'info',
      message: 'Usunięto powtórzenie faktu już obecnego w panelu: ' + fact.label.slice(0, 120) + (fragments.length > 1 ? ` (${fragments.length} zdań).` : '.'),
      evidence: strip(fragments[0]).length <= 320 ? strip(fragments[0]) : strip(fragments[0]).slice(0, 319).replace(/\s+$/u, '') + '…'}));
    return {text: strip(kept.join('')), diagnostics, pieces};
  }

  /* ---------------------------------------------------------- domain/preservation.py (fragments, treatment cues) */
  const P_SPLIT = /[\r\n;]+|(?<!\d)[,](?!\d)|[.!?](?=\s|$)/g, P_LETTERS = /\p{L}+/gu;
  const P_GENERIC = new Set(['wizyta', 'wywiad', 'badanie', 'kliniczne', 'rozpoznanie', 'leki', 'lek', 'leczenie', 'terapia', 'kontrola', 'od', 'dni', 'dzień', 'dzien', 'brak', 'bez', 'zmian', 'norma', 'w', 'normie', 'nie', 'tak', 'stan', 'dobry', 'ogólny', 'ogolny', 'ok', 'ból', 'bol', 'temperatura']);
  const CLINICAL_FRAGMENT = rx(`${NB}(?:pies|kot|pacjent|kaszl${W}*|kaszel|wymiot${W}*|biegun${W}*|bol${W}*|ból${W}*|bolesn${W}*|apat${W}*|gor[aą]cz${W}*|kulaw${W}*|[sś]wi[aą]d${W}*|sk[oó]r${W}*|zmian${W}*|ran[ayę]|guz${W}*|krw${W}*|obr[zż]${W}*|odbarcz${W}*|odbarcze${W}*|odbarczeni${W}*|badan${W}*|morf${W}*|temperatur${W}*|crt|oddech${W}*|t[eę]tn${W}*|apetyt${W}*|os[łl]uch${W}*|[sś]luz${W}*|brzuch${W}*|w[eę]z[łl]${W}*|stabiln${W}*|przytomn${W}*|kontakt${W}*|objaw${W}*|pocz[aą]t${W}*|serc${W}*|p[łl]uc${W}*)${NA}`, 'i');
  const ROUTINE_FRAGMENT = rx(`kontrol${W}*\\s+(?:wed[łl]ug|wg)\\s+planu`, 'i');
  const MEASUREMENT_FRAGMENT = rx(`${NB}(?:T|HR|RR|BP|BCS|SpO2)\\s*[:=]?\\s*\\d+(?:[.,]\\d+)?${NA}`, 'i');
  const DOSE = rx(`(?<![\\p{L}\\p{N}_.,])\\d+(?:[.,]\\d+)?\\s*(?:mg|ml|µg|μg|mcg|ug|g|tabl(?:etk(?:a|i|ę|e|ą))?\\.?)(?:\\s*/\\s*kg)?${NA}`, 'i');
  const ACTIONS = 'podano|poda(?:ł|l|ła|la|li|ły|ly)|zaaplikowano|zalecono|zalec(?:a|am|ono)|przepisano|podawać|podawac|stosować|stosowac|wydano|przyjmuje|otrzymuje|stosuje|podawany|podawana|podawano|stosowano|odstawiono|odstawi(?:ć|c)|przerwano|planowano|zaplanowano|planowany|planowana|planowane|planowanej|rozważyć|rozwazyc|rozważono|rozwazono|rozważano|rozwazano|rozważa|rozwaza|do rozważenia|do rozwazenia';
  const CUE = rx(`${NB}(?:leki?|leczenie|terapia|sedacja|premedykacja|${ACTIONS})${NA}\\s*:?\\s*`, 'i');
  const TREATMENT_DESCRIPTION = new Set(['objawowe', 'zachowawcze', 'miejscowe', 'przeciwbólowe', 'przeciwbolowe', 'przeciwzapalne', 'płyny', 'plyny']);
  const pFold = text => (String(text).normalize('NFC').toLowerCase().match(rx(`${W}+`, 'g')) || []).join(' ');
  const fragmentFold = text => pFold(text).replace(rx(`${NB}biochemi(?:a|i|ę|ą|o)${NA}`, 'g'), 'biochemia');
  const PRESERVATION_LIMITS = 'Kontrola obejmuje rozpoznane wzmianki o leczeniu i krótkie fragmenty źródła; nie potwierdza pełnej zgodności znaczenia ani rozpoznania wszystkich leków.';
  function fragments(text) { const out = []; let start = 0; for (const m of finditer(P_SPLIT, text)) { if (m.index > start) out.push([start, m.index]); start = m.index + m[0].length; } if (start < text.length) out.push([start, text.length]); return out; }
  function extractMentions(source) {
    const text = source.text, mentions = [];
    for (let [start, end] of fragments(text)) {
      const fragment = text.slice(start, end), stripped = strip(fragment), cue = CUE.exec(stripped);
      let tail = cue ? stripChars(stripped.slice(cue.index + cue[0].length), ' :–-.,') : '';
      tail = tail.replace(/^(?:podanie|stosowanie|wydanie)\s+/iu, '');
      while (start < end && /\s/u.test(text[start])) start++; while (end > start && /\s/u.test(text[end - 1])) end--;
      const quote = text.slice(start, end);
      if (tail && /\p{L}/u.test(tail)) {
        const dose = DOSE.exec(tail); let anchor = dose ? strip(tail.slice(0, dose.index)) : tail;
        anchor = strip(anchor.replace(/\s+(?:w dawce|dawka)\s*$/iu, ''));
        if (anchor && /\p{L}/u.test(anchor)) mentions.push({id: source.id + ':' + start, source_label: source.label, field: source.field, quote, anchor, kind: 'treatment',
          confidence: /^\p{L}[\p{L}\p{N}_-]{2,47}$/u.test(anchor) && !TREATMENT_DESCRIPTION.has(anchor.toLowerCase()) ? 'explicit' : 'uncertain'});
      } else {
        const words = stripped.match(P_LETTERS) || [], heading = stripChars(stripped, '*_`# \t');
        if (words.length > 0 && words.length <= 3 && stripped.length <= 60 && !heading.endsWith(':') && words.some(w => !P_GENERIC.has(w.toLowerCase()))
          && !CLINICAL_FRAGMENT.test(stripped) && !fullmatch(ROUTINE_FRAGMENT, stripped) && !MEASUREMENT_FRAGMENT.test(stripped) && !fullmatch(DOSE, stripped))
          mentions.push({id: source.id + ':' + start, source_label: source.label, field: source.field, quote, anchor: stripped, kind: 'fragment'});
      }
    }
    return mentions;
  }
  const preservationContract = sources => ({mentions: sources.filter(s => s.included !== false && strip(s.text)).flatMap(extractMentions), fields: unique(sources.filter(s => s.included !== false && s.field).map(s => s.field))});
  const containsWords = (text, anchor) => (' ' + pFold(text) + ' ').includes(' ' + pFold(anchor) + ' ');
  const treatmentFound = (text, anchor) => { const words = anchor.match(rx(`${W}+`, 'g')) || []; return !!words.length && rx(`${NB}${words.map(escapeRe).join('[\\W_]+')}${NA}`, 'i').test(text); };
  /* check_preservation: the selected edited fields plus original text of untouched source fields. */
  function checkPreservation(contract, original, edited, selected) {
    if (!contract) return {issues: [], limitations: PRESERVATION_LIMITS};
    const effective = {}; for (const key of selected) effective[key] = normalizeEol(edited[key] ?? '');
    for (const key of contract.fields) if (!(key in effective) && key in original) effective[key] = normalizeEol(original[key]);
    const texts = Object.values(effective), foldedTexts = texts.map(t => ' ' + fragmentFold(t) + ' '), issues = [];
    for (const m of contract.mentions) {
      if (m.field && !selected.includes(m.field)) {
        if (!(m.field in edited)) continue;
        const old = original[m.field] || '';
        if (m.kind === 'fragment' ? containsWords(old, m.anchor) : treatmentFound(old, m.anchor)) continue;
      }
      if (m.kind === 'treatment') { if (!texts.some(t => treatmentFound(t, m.anchor))) issues.push({id: m.id, source_label: m.source_label, quote: m.quote, code: 'source_fragment_missing', message: 'Nie znaleziono jednoznacznego odpowiednika fragmentu o leczeniu; możliwa jest parafraza lub poprawienie literówki.'}); continue; }
      if (!foldedTexts.some(t => t.includes(' ' + fragmentFold(m.anchor) + ' '))) issues.push({id: m.id, source_label: m.source_label, quote: m.quote, code: 'source_fragment_missing', message: 'Krótki niejasny fragment źródła nie ma dosłownego odpowiednika w wyniku.'});
    }
    return {issues, limitations: PRESERVATION_LIMITS};
  }

  /* ---------------------------------------------------------- rendering (domain/structure.py) */
  function renderLeaf(name, panelText, text, inference) { const body = [strip(panelText || ''), strip(text || ''), strip(inference || '')].filter(Boolean).join('\n\n'); return body ? name + ':\n' + body : ''; }

  /* ---------------------------------------------------------- the sample visit and the simulated model
   * Fixed answers for the fictional rat "Fistaszek" (Klinika XP sample). They follow the rc32
   * rules: Wiernie keeps the doctor's wording, Bogato rewrites and adds cautious inferences in
   * slots where the sources support them, no process notes, nothing repeated from the panel.
   * Panel quotes are verbatim source fragments; a typo is corrected as «cytat => poprawiony». */
  const SAMPLE = /*SAMPLE-BEGIN*/{
    "fields": {
      "wywiad": "Szczur, samiec, fancy rat, 1 rok 9 mies., ok. 420 g. Od ~2 tygodni nasilające się kichanie i świszczący oddech, czerwonobrązowa wydzielina (porfiryna) wokół nozdrzy i oczu. Apatyczny, mniej je, chudnie. Ściółka z trocin sosnowych.",
      "badanie": "Stan ogólny obniżony, postawa zgarbiona, sierść nastroszna. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony z wysiłkiem brzusznym. Osłuchwo nad polami płucnymi rzęzenia i świsty. BCS 2/5. T 37,8°C, HR ok. 360/min.",
      "diagnoza": "Podejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych."
    },
    "answers": {
      "faithful": {
        "clinical_findings": {"text": "Stan ogólny obniżony, postawa zgarbiona, sierść nastroszona. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony z wysiłkiem brzusznym. Osłuchowo nad polami płucnymi rzężenia i świsty. BCS 2/5. Temperatura 37,8°C, HR ok. 360/min."},
        "clinical_findings+panel": {"text": "Postawa zgarbiona, sierść nastroszona. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony z wysiłkiem brzusznym. BCS 2/5."},
        "signalment": {"text": "Szczur, samiec, fancy rat, 1 rok 9 mies., masa ciała ok. 420 g."},
        "chief_complaint": {"text": "Nasilające się kichanie i świszczący oddech."},
        "course": {"text": "Od ok. 2 tygodni nasilające się objawy. Czerwonobrązowa wydzielina (porfiryna) wokół nozdrzy i oczu. Apatyczny, mniej je, chudnie. Ściółka z trocin sosnowych."},
        "working_diagnosis": {"text": "Podejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych."},
        "differential": {"inference": "Do rozważenia: inne bakteryjne zakażenie dróg oddechowych.", "needs": ["badanie", "wywiad"]}
      },
      "rich": {
        "clinical_findings": {"text": "Stan ogólny obniżony; zwierzę w zgarbionej postawie, sierść nastroszona. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony, z wysiłkiem brzusznym. Osłuchowo nad polami płucnymi rzężenia i świsty. Kondycja ciała BCS 2/5. Temperatura 37,8°C, tętno ok. 360/min."},
        "clinical_findings+panel": {"text": "Zwierzę w zgarbionej postawie, sierść nastroszona. Wokół nozdrzy i w kątach oczu zaschnięta porfiryna. Oddech przyspieszony, z wysiłkiem brzusznym. Kondycja ciała BCS 2/5."},
        "home_care": {"inference": "Do rozważenia: wymiana ściółki z trocin sosnowych na mniej pylącą oraz obserwacja apetytu i masy ciała.", "needs": ["wywiad"], "otherwise": "Do rozważenia: obserwacja oddechu i kondycji ciała."},
        "prognosis": {"inference": "Rokowanie ostrożne; do monitorowania: oddech, apetyt i masa ciała.", "needs": ["wywiad"], "otherwise": "Rokowanie ostrożne; do monitorowania: oddech i kondycja ciała."},
        "signalment": {"text": "Szczur, samiec, odmiana fancy rat, 1 rok i 9 miesięcy, masa ciała ok. 420 g."},
        "chief_complaint": {"text": "Nasilające się kichanie i świszczący oddech."},
        "course": {"text": "Objawy trwają od ok. 2 tygodni i narastają. Wokół nozdrzy i oczu czerwonobrązowa wydzielina (porfiryna). Apatia, zmniejszony apetyt i spadek masy ciała. Zwierzę utrzymywane na ściółce z trocin sosnowych."},
        "working_diagnosis": {"text": "Podejrzenie mykoplazmozy układu oddechowego (MRM); zakażenie dróg oddechowych."},
        "differential": {"inference": "Do rozważenia: inne bakteryjne zakażenie dróg oddechowych; podrażnienie dróg oddechowych pyłem ze ściółki.", "needs": ["badanie", "wywiad"]}
      }
    },
    "quotes": {
      "general_condition": ["Stan ogólny obniżony"], "temperature": ["T 37,8°C"], "heart_rate": ["HR ok. 360/min"],
      "respiratory_auscultation": ["Osłuchwo nad polami płucnymi rzęzenia i świsty"]
    }
  }/*SAMPLE-END*/;
  /* Fictional typos the simulated model corrects (the Klinika sample uses the first three). */
  const TYPOS = {nastroszna: 'nastroszona', 'Osłuchwo': 'Osłuchowo', osłuchwo: 'osłuchowo', rzęzenia: 'rzężenia', przyspiesozny: 'przyspieszony', apatycznny: 'apatyczny',
    porfirryna: 'porfiryna', wilgotneee: 'wilgotne', szcur: 'szczur', szczor: 'szczur', błonyy: 'błony', wymiotty: 'wymioty', klinczne: 'kliniczne'};
  const polish = text => String(text ?? '').replace(rx(`${NB}(${Object.keys(TYPOS).map(escapeRe).join('|')})${NA}`, 'g'), word => TYPOS[word] ?? word);
  const normal = text => strip(polish(text).replace(/\s+/gu, ' '));
  const isSample = (key, text) => !!SAMPLE.fields[key] && normal(text) === normal(SAMPLE.fields[key]);
  function splitSentences(text) {
    const out = []; let start = 0;
    for (const m of finditer(/[.!?](?=\s+[\p{Lu}]|\s*$)/gu, text)) { const s = strip(text.slice(start, m.index + 1)); if (s) out.push(s); start = m.index + 1; }
    if (strip(text.slice(start))) out.push(strip(text.slice(start)));
    return out;
  }
  const SIGNALMENT = rx(`${NB}(?:samiec|samica|kastrat${W}*|sterylizowan${W}*|lata?|rok${W}*|mies|miesi${W}*|tyg${W}*|kg|kot${W}*|pies|psa|suka|szczur${W}*|królik${W}*|śwink${W}*|chomik${W}*|fretk${W}*|ras[ay]|mieszaniec)${NA}|\\d+\\s*g${NA}`, 'i');
  function routeSection(key, text, rows) {
    const sentences = splitSentences(polish(text)), slots = {};
    const put = (id, s) => { (slots[id] ||= {text: [], inference: ''}).text.push(s); };
    if (key === 'diagnoza') { if (strip(text)) put('working_diagnosis', strip(polish(text))); }
    else if (key === 'wywiad') sentences.forEach((s, i) => put(i === 0 && SIGNALMENT.test(s) ? 'signalment' : !slots.chief_complaint ? 'chief_complaint' : 'course', s));
    else {
      const repeated = new Set((rows || []).filter(r => r.origin === 'source' && r.needs_review === false).flatMap(r => r.quotes).map(q => strip(polish(q)).toLowerCase()));
      for (const s of sentences) {
        if (/rokowan/iu.test(s)) put('prognosis', s);
        else if (/zalec|do domu|kontrol\w*\s+(?:za|po|w)\b|wizyt\w*\s+kontroln/iu.test(s)) put('home_care', s);
        else if (/podano|poda[łl]|zastosowano|iniekc|wstrzykn|\b[sicp]\.[cmvo]\.|kropl[óo]wk|płynoterapi|zabieg/iu.test(s)) put('visit_treatment', s);
        else if (/\b(?:RTG|USG|EKG|ECHO)\b|morfologi|biochemi|badani\w*\s+krwi|cytologi/iu.test(s)) put('additional_tests', s);
        else if (!repeated.has(strip(s).replace(/\.$/, '').toLowerCase())) put('clinical_findings', s);
      }
    }
    for (const value of Object.values(slots)) value.text = value.text.join(' ');
    return slots;
  }
  /* What the demonstration's "model" returns: {slot: {text, inference}} per section and panel quotes. */
  function simulateAnswers(plan) {
    const mode = plan.request.mode === 'rich' ? 'rich' : 'faithful', fields = {};
    for (const s of plan.request.sources) if (s.included !== false) fields[s.field] = s.text;
    const sampleOk = key => key in fields && isSample(key, fields[key]);
    const result = {}, initialRows = plan.initialPanel ? plan.initialPanel.rows : [];
    for (const section of plan.sections) {
      const answers = {};
      if (sampleOk(section.key)) {
        for (const part of section.subsections) {
          const key = part.panel && plan.request.panel ? part.id + '+panel' : part.id, a = SAMPLE.answers[mode][key] || {};
          const met = (a.needs || []).every(sampleOk);
          answers[part.id] = met ? {text: a.text || '', inference: a.inference || ''} : {text: '', inference: a.otherwise || ''};
        }
      } else Object.assign(answers, routeSection(section.key, fields[section.key] || '', plan.request.panel ? initialRows : []));
      result[section.id] = Object.fromEntries(section.subsections.map(part => [part.id, {text: answers[part.id]?.text || '', inference: section.allowInference ? answers[part.id]?.inference || '' : ''}]));
    }
    const quotes = {};
    if (plan.request.panel) {
      const source = plan.panelSource, sample = sampleOk('badanie');
      const proposed = sample ? SAMPLE.quotes : Object.fromEntries(initialRows.filter(r => r.origin === 'source' && r.attribution === 'local').map(r => [r.parameter_id, r.quotes]));
      for (const p of TEMPLATE) {
        quotes[p.id] = [];
        for (const raw of proposed[p.id] || []) {
          const quote = locatePanelQuote(raw, source, plan.request.sources).length ? raw : locatePanelQuote(polish(raw), source, plan.request.sources).length ? polish(raw) : null;
          if (quote !== null) quotes[p.id].push(polish(quote) !== quote ? quote + ARROW + polish(quote) : quote);
        }
      }
    }
    return {slots: result, quotes};
  }

  /* ---------------------------------------------------------- the generation plan, the prompt outline and generate() */
  function plan(request) {
    const outputs = SECTIONS.filter(s => request.outputs.includes(s.key));
    const sections = outputs.map((s, i) => ({...s, wire: 's' + (i + 1), allowInference: request.mode === 'rich' || (s.role === 'diagnosis' && request.diagnosis),
      subsections: s.subsections.map((part, j) => ({...part, wire: `s${i + 1}_${j + 1}`}))}));
    const included = request.sources.filter(s => s.included !== false && strip(s.text));
    const panelSource = included.filter(s => s.role !== 'diagnosis').map(s => s.text).join('\n\n');
    let initialPanel = null;
    if (request.panel) {
      const built = buildFullPanel(panelSource, TEMPLATE, {sources: request.sources});
      const section = sections.find(s => s.key === request.panelTarget), part = section?.subsections.find(x => x.panel);
      initialPanel = {...built, sectionId: section?.id, subsectionId: part?.id, wireSection: section?.wire, wireSubsection: part?.wire, heading: part?.name};
    }
    return {request, sections, included, panelSource, initialPanel};
  }
  const sentSource = sources => sources.filter(s => s.included !== false && strip(s.text)).map(s => s.label + ': ' + s.text).join('\n\n');
  /* Consent covers what is sent and where; the writing style alone keeps it (ui/state.py ApprovalState). Like
   * asdict(request) it covers every source of the compose window, with its text and scope, even one outside the scope. */
  const consentScope = (sources, v, extra = {}) => JSON.stringify({sources: sources.map(s => [s.label, s.role, s.text, s.included !== false]), panel: !!v.panel, diagnosis: !!v.diagnosis, ...extra});
  const json = value => JSON.stringify(value);
  const OUTLINE_NOTE = 'Demonstracja: treść reguł skrócono do jednego zdania. Kolejność reguł, sloty, przeznaczenie sekcji, zestawienie panelu, format odpowiedzi i źródła odpowiadają poleceniu aplikacji dla tej wizyty.';
  /* "Zasady i źródła": the real order and structure of application/generation.py _render_prompt,
   * with each rule's text shortened to one neutral line (the full rules are not published). */
  function promptOutline(p) {
    const r = p.request, rules = [
      'Przygotuj dokumentację JEDNEJ wizyty weterynaryjnej do sprawdzenia przez lekarza.',
      'FAKTY: wyłącznie ustalenia z zatwierdzonych źródeł. […]',
      'LEKI: wzmianki o lekach pozostają z ich kontekstem. […]',
      'ROZMIESZCZENIE: każda informacja raz, we właściwym slocie. […]',
      'JĘZYK: gotowa treść po polsku; nagłówki i kolejność wypisuje aplikacja. […]',
      r.mode === 'rich' ? 'TRYB BOGATY: inference może zawierać ostrożne propozycje uzasadnione źródłami. […]' : 'TRYB WIERNY: tylko poprawa zapisu i układu. […]',
      'WNIOSKI: inference tylko w slotach z allow_inference=true. […]'];
    if (!r.diagnosis) rules.push('Nie zamówiono rozpoznania: bez nowej diagnozy. […]');
    if (p.included.some(s => s.role === 'diagnosis')) rules.push('Źródło role=diagnosis: diagnoza lekarza z zachowaniem jej pewności. […]');
    if (r.mode === 'rich') rules.push('STYL UŻYTKOWNIKA: styl Bogato z Ustawień; nie zmienia faktów, uprawnień ani kontraktu. […]');
    if (r.panel) rules.push('PANEL: wiersze składa aplikacja w slocie is_panel; model ich nie generuje. […]', 'W panel_quotes: dosłowne cytaty ze źródeł dla parametrów panelu. […]', 'W text slotu panelu: bez powtórzeń wierszy source_rows. […]');
    const tasks = [], purposes = [];
    for (const s of p.sections) {
      purposes.push({slots: s.subsections.map(x => x.wire), instruction: s.instruction});
      for (const x of s.subsections) tasks.push({id: x.wire, name: x.name, role: s.role, allow_inference: s.allowInference, purpose: x.description, ...(x.panel && r.panel ? {is_panel: true} : {})});
    }
    rules.push('SLOTY: ' + json(tasks), 'PRZEZNACZENIE SEKCJI: ' + json(purposes));
    if (r.panel && p.initialPanel) {
      const units = Object.fromEntries(TEMPLATE.map(t => [t.id, t.unit]));
      rules.push('PANEL: ' + json({section_id: p.initialPanel.wireSection, subsection_id: p.initialPanel.wireSubsection, avoid_repetition: true,
        source_rows: p.initialPanel.rows.filter(x => x.origin === 'source').map(x => ({parameter_id: x.parameter_id, label: x.label, value: x.value, unit: units[x.parameter_id] || '', quotes: x.quotes, needs_review: x.needs_review})),
        configured_parameters: p.initialPanel.rows.map(x => ({parameter_id: x.parameter_id, label: x.label, origin: x.origin}))}));
    }
    rules.push('KOMPLETNOŚĆ: treść slotów porównana ze źródłami. […]', 'ODPOWIEDŹ: jeden obiekt JSON schema_version=3. […]', 'FORMAT: ' + json(responseTemplate(p)),
      'ŹRÓDŁA: ' + json(p.included.map(s => ({label: s.label, role: s.role, text: s.text}))));
    return rules.join('\n');
  }
  function responseTemplate(p, fill) {
    const slots = {};
    for (const s of p.sections) for (const x of s.subsections) slots[x.wire] = fill ? fill(s, x) : {text: '', inference: ''};
    const out = {schema_version: 3, slots};
    if (p.request.panel) out.panel_quotes = Object.fromEntries(TEMPLATE.map(t => [t.id, []]));
    return out;
  }
  function generate(request) {
    const p = plan(request), answers = simulateAnswers(p), findings = [];
    let panel = p.initialPanel;
    if (panel) {
      const attribution = verifyPanelQuotes(answers.quotes, p.panelSource, TEMPLATE.map(t => t.id), {sources: request.sources});
      if (Object.keys(attribution.accepted).length || attribution.unverified.length || Object.keys(attribution.rejected).length)
        panel = {...panel, ...buildFullPanel(p.panelSource, TEMPLATE, {attributed: attribution.accepted, unverified: attribution.unverified, rejected: attribution.rejected, spelling: attribution.spelling, sources: request.sources}), spelling: attribution.spelling};
      const count = panel.rows.reduce((n, row) => n + row.assignment_issues.length, 0);
      if (count) findings.push({code: 'panel_assignment_review', severity: 'review', section: panel.sectionId, message: `Przypisania źródeł do parametrów wymagają sprawdzenia: ${count}.`});
      const attributed = panel.rows.filter(row => row.attribution === 'ai' && row.origin === 'source').map(row => row.label), unverified = panel.rows.filter(row => row.origin === 'unverified').map(row => row.label);
      if (attributed.length) findings.push({code: 'panel_quotes_attributed', severity: 'info', section: panel.sectionId, message: 'Fragmenty notatki przypisane do wierszy panelu przez AI i sprawdzone dosłownie: ' + attributed.join(', ') + '.'});
      if (unverified.length) findings.push({code: 'panel_quotes_unverified', severity: 'review', section: panel.sectionId, message: 'AI wskazało wzmiankę o: ' + unverified.join(', ') + ', ale tych słów nie ma dosłownie w notatce. Te wiersze zostały puste, bez normy - uzupełnij je.'});
    }
    const sourceNumbers = new Set((sentSource(request.sources).replace(/,/g, '.').match(/\d+(?:[.,]\d+)?/g) || []));
    let anyInference = false;
    for (const s of p.sections) {
      const bodies = answers.slots[s.id], model = Object.values(bodies).flatMap(b => [strip(b.text), strip(b.inference)]).join('\n\n');
      if (!strip(model)) findings.push({code: 'empty_section', severity: 'review', section: s.id, message: 'Pusta sekcja: wybierz zachowanie pola lub świadomie zatwierdź usunięcie.'});
      const fresh = unique((model.replace(/,/g, '.').match(/\d+(?:[.,]\d+)?/g) || []).filter(n => !sourceNumbers.has(n))).sort();
      if (fresh.length) findings.push({code: 'new_numbers', severity: 'review', section: s.id, message: 'Liczby nieobecne w notatce: ' + fresh.join(', ')});
      if (Object.values(bodies).some(b => strip(b.inference))) anyInference = true;
    }
    if (anyInference) findings.push({code: 'inference_review', severity: 'review', message: 'Wynik zawiera propozycje lub interpretacje do sprawdzenia.'});
    const sections = [], removed = {};
    for (const s of p.sections) {
      const leaves = [];
      for (const part of s.subsections) {
        const body = answers.slots[s.id][part.id];
        let text = strip(body.text), inference = strip(body.inference);
        if (text && text === inference) { inference = ''; findings.push({code: 'identical_body_repetition_removed', severity: 'info', section: s.id, message: 'Usunięto identyczne powtórzenie między opisem a wnioskowaniem.', evidence: text.slice(0, 320)}); }
        const owns = !!panel && panel.sectionId === s.id && panel.subsectionId === part.id;
        if (owns) {
          const clean = removeRepeatedPanelFacts(text, TEMPLATE, panel.rows);
          findings.push(...clean.diagnostics.map(d => ({...d, section: s.id})));
          if (clean.pieces) removed[s.key] = {leaf: part.id, pieces: clean.pieces};
          text = strip(clean.text);
        }
        leaves.push({id: part.id, name: part.name, kind: part.kind, panel: owns, text, inference, rows: owns ? panel.rows : []});
      }
      const text = leaves.map(leaf => renderLeaf(leaf.name, leaf.panel ? panel.text : '', leaf.text, leaf.inference)).filter(Boolean).join('\n\n');
      sections.push({id: s.id, key: s.key, label: s.label, field: s.field, tab: s.tab, role: s.role, wire: s.wire, allowInference: s.allowInference, text, leaves});
    }
    const kept = findings.filter(f => f.code !== 'empty_section' || !strip(sections.find(s => s.id === f.section)?.text || ''));
    const response = responseTemplate(p, (s, x) => answers.slots[s.id][x.id]);
    if (request.panel) response.panel_quotes = answers.quotes;
    return {request, plan: p, sections, findings: kept, panel, removed, response, contract: preservationContract(request.sources.filter(s => s.included !== false && strip(s.text))), prompt: promptOutline(p)};
  }

  /* ---------------------------------------------------------- domain/review_document.py */
  function originallyBlank(block) { const original = block.metadata && 'original_text' in block.metadata ? block.metadata.original_text : block.text; return !strip(original); }
  function originCaption(block) {
    if (block.kind !== 'panel_row') {
      if (originallyBlank(block)) return strip(block.text) ? 'Dodane ręcznie' : 'Wpisujesz ręcznie';
      if (block.origin === 'manual' && block.metadata?.original_origin === 'model') return 'Propozycja AI · edytowana ręcznie';
    }
    return {source: 'Ze źródła', template: 'Z wzorca', model: 'Propozycja AI', manual: 'Zmienione', missing: 'Pusta wartość', unverified: 'Niepotwierdzone źródło', unresolved: 'Uwaga'}[block.origin] || 'Do sprawdzenia';
  }
  const blockNeedsReview = block => block.kind === 'panel_row' && !!(block.metadata.needs_review || (block.metadata.assignment_issues || []).length);
  function panelIssueDescription(row) {
    const parts = [];
    for (const issue of row.assignment_issues || []) {
      parts.push(issue.message || 'Sprawdź przypisanie do parametru.');
      const quote = issue.source_verified ? issue.quote : issue.proposed_quote;
      if (quote) parts.push((issue.source_verified ? 'Fragment źródła: „' : 'Propozycja niepotwierdzona w źródłach: „') + quote + '”');
      if (issue.source_verified && issue.context && issue.context !== quote) parts.push('Kontekst: ' + issue.context);
    }
    return parts.join('\n');
  }
  function reviewDocument(generated) {
    const leaves = [], blocks = new Map();
    for (const s of generated.sections) for (const leaf of s.leaves) {
      const ids = [], base = `${s.id}/${leaf.id}`;
      for (const row of leaf.rows) { const id = `${base}/panel/${row.parameter_id}`; ids.push(id); blocks.set(id, {id, section: s.id, leaf: leaf.id, target: s.key, kind: 'panel_row', text: String(row.value || ''), origin: row.origin || 'template', revision: 0, metadata: JSON.parse(JSON.stringify(row))}); }
      for (const kind of ['text', 'inference']) { const id = `${base}/${kind}`; ids.push(id); blocks.set(id, {id, section: s.id, leaf: leaf.id, target: s.key, kind, text: leaf[kind] || '', origin: 'model', revision: 0, metadata: {}}); }
      leaves.push({section: s.id, id: leaf.id, name: leaf.name, target: s.key, headed: true, blocks: ids});
    }
    const doc = {leaves, blocks, revision: 0,
      fieldLeaves: target => leaves.filter(l => l.target === target),
      leafText(leaf) {
        const panel = [], text = [], inference = [];
        for (const id of leaf.blocks) {
          const b = blocks.get(id);
          if (b.kind === 'panel_row') { const name = strip(String(b.metadata.label || '')), value = strip(b.text), line = name ? renderPanelRow(name, value) : value; if (line) panel.push(line); }
          else if (leaf.headed ? strip(b.text) : b.text) (b.kind === 'inference' ? inference : text).push(b.revision || !leaf.headed ? b.text : strip(b.text));
        }
        const body = [panel.join('\n'), ...text, ...inference].filter(Boolean).join('\n\n');
        return body && leaf.headed ? leaf.name + ':\n' + body : body;
      },
      renderField: target => doc.fieldLeaves(target).map(l => doc.leafText(l)).filter(Boolean).join('\n\n'),
      edit(id, text) {
        const b = blocks.get(id); text = normalizeEol(text);
        if (b.kind === 'panel_row') { text = strip(text); if (text === strip(b.text)) return false; }
        if (text === b.text) return false;
        const metadata = {...b.metadata}; if (!('original_text' in metadata)) { metadata.original_text = b.text; metadata.original_origin = b.origin; }
        blocks.set(id, {...b, text, origin: text === metadata.original_text ? metadata.original_origin : 'manual', revision: b.revision + 1, metadata});
        doc.revision++; return true;
      },
      get inferenceCount() { return [...blocks.values()].filter(b => b.kind === 'inference' && strip(b.text)).length; },
      panelIssues: targets => [...blocks.values()].filter(b => blockNeedsReview(b) && (!targets || targets.includes(b.target))),
      snapshot: () => ({schema_version: 1, revision: doc.revision, leaves: leaves.map(l => ({...l})), blocks: [...blocks.values()].map(b => JSON.parse(JSON.stringify(b)))})};
    return doc;
  }

  const api = {SECTIONS, TEMPLATE, SAMPLE, sectionByKey, variant, forCapabilities, sameVariant, variantLabel, describeVariant, modeSummary,
    clauses, sourcePanelValues, buildFullPanel, assessPanelAssignment, locatePanelQuote, verifyPanelQuotes, spellingOnly, splitSpelling, respell, withoutLabel, withUnit,
    removeRepeatedPanelFacts, preservationContract, checkPreservation, polish, isSample, splitSentences, routeSection, plan, generate, promptOutline, sentSource, consentScope,
    reviewDocument, originCaption, originallyBlank, panelIssueDescription, blockNeedsReview, renderPanelRow, OUTLINE_NOTE, PRESERVATION_LIMITS};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.OpisAIDocument = api;
})();
