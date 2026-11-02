(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CE = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ---------- CSV ----------
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = ''; rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  }

  function toCSV(rows) {
    const q = v => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return rows.map(r => r.map(q).join(',')).join('\n');
  }

  // Qualtrics exports: row 1 = column names, rows 2-3 = labels and ImportIds.
  function readQualtrics(text) {
    const rows = parseCSV(text);
    if (!rows.length) return { header: [], records: [], nItems: 0 };
    const header = rows[0].map(h => h.trim());
    let start = 1;
    while (start < rows.length && (rows[start][0] === 'Start Date' || rows[start][0] === header[0] || /^\{"ImportId"/.test(rows[start][0]))) start++;
    const records = rows.slice(start).map(r => { const o = {}; header.forEach((h, i) => o[h] = r[i] == null ? '' : r[i]); return o; });
    let nItems = 0;
    header.forEach(h => { const m = /^est_(\d+)_[123]$/.exec(h); if (m) nItems = Math.max(nItems, +m[1]); });
    return { header, records, nItems };
  }

  // ---------- normalizing ----------
  function normTeam(s) {
    s = String(s == null ? '' : s).trim().toLowerCase();
    const m = /^(?:team|t)?\s*[-#_:]?\s*0*(\d+)(?:\.0*)?$/.exec(s);
    return m ? m[1] : s;
  }
  const normId = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
  function num(v) {
    if (v == null) return NaN;
    v = String(v).trim().replace(/,/g, '');
    if (v === '') return NaN;
    return /^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(v) ? Number(v) : NaN;
  }

  // ---------- respondents ----------
  function rowKind(rec) {
    const ch = (rec.DistributionChannel || '').toLowerCase(), st = (rec.Status || '').toLowerCase();
    if (ch === 'preview' || st === '1' || st.indexOf('preview') >= 0) return 'preview';
    if (ch === 'test' || st === '2' || st.indexOf('test') >= 0) return 'test';
    return 'live';
  }

  // Rows per team on live rows only, so a pile of previews cannot change the verdict.
  function perTeam(records) {
    const live = records.filter(r => rowKind(r) === 'live'), use = live.length ? live : records;
    return { rows: use.length, teams: new Set(use.map(r => normTeam(r.team_num)).filter(Boolean)).size };
  }
  function checkPhase1(q) {
    if (!q.nItems || !q.header.includes('team_num') || !(q.header.includes('netID') || q.header.includes('ind_name'))) return 'wrong';
    const p = perTeam(q.records);
    return p.teams >= 3 && p.rows <= 1.5 * p.teams ? 'perTeam' : '';
  }
  function checkPhase2(q) {
    if (!q.nItems || !q.header.includes('team_num')) return 'wrong';
    const p = perTeam(q.records);
    return p.rows > 2 * p.teams + 1 ? 'manyRows' : '';
  }
  // Only missing columns refuse a file outright; a suspicious shape asks first.
  const fileAction = code => !code ? 'load' : code === 'wrong' ? 'reject' : 'confirm';

  // Returns the key to install on upload, or null to keep the one on screen (typed edits survive).
  function keyForUpload(current, windowKey, nItems, wasDemo, saved) {
    const fresh = windowKey || Array.from({ length: nItems || 10 }, (_, i) => ({ label: 'Item ' + (i + 1), answer: '' }));
    if (wasDemo) return saved && saved.length === fresh.length ? saved : fresh;
    return current.length && current.length === fresh.length ? null : fresh;
  }
  // The real key to hold while demo answers are on screen; a second demo click must not save demo answers.
  function keyToSave(current, wasDemo, saved) {
    if (wasDemo) return saved;
    return current.length ? current.map(k => Object.assign({}, k)) : null;
  }
  // True when loading into one slot would leave demo and real data side by side.
  const slotClash = (loadingDemo, otherLoaded, otherDemo) => !!otherLoaded && !!otherDemo !== !!loadingDemo;

  const onlyPreview = f => f.live === 0 && f.preview + f.test > 0;
  // Which file is preview-only while the other has live responses: 'team', 'individual', or ''.
  function previewMismatch(f1, f2) {
    if (!f1 || !f2) return '';
    if (onlyPreview(f2) && f1.live > 0) return 'team';
    return onlyPreview(f1) && f2.live > 0 ? 'individual' : '';
  }

  const NAME_COLS = ['ind_name', 'name', 'full_name', 'fullname', 'student_name'];
  const NO_NAME = '(name not given)';
  function nameColumn(cols) {
    const low = cols.map(c => String(c).trim().toLowerCase());
    for (const n of NAME_COLS) { const i = low.indexOf(n); if (i >= 0) return cols[i]; }
    return null;
  }
  function namePartColumns(cols) {
    const find = list => cols.find(c => list.includes(String(c).trim().toLowerCase())) || null;
    return { first: find(['first_name', 'firstname']), last: find(['last_name', 'lastname']) };
  }
  function rowName(r, cols) {
    const get = c => c ? String(r[c] == null ? '' : r[c]).trim() : '';
    return (get(cols.full) || (get(cols.first) + ' ' + get(cols.last))).trim().replace(/\s+/g, ' ');
  }

  // Milliseconds, or NaN. Handles Qualtrics dates and the M/D/YY forms Excel writes on resave.
  function parseTime(s) {
    s = String(s == null ? '' : s).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?)?/i.exec(s);
    if (!m) return NaN;
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3], ap = (m[7] || '').toLowerCase();
    const h = +(m[4] || 0) % (ap ? 12 : 24) + (ap === 'pm' ? 12 : 0);
    return Date.UTC(y, +m[1] - 1, +m[2], h, +(m[5] || 0), +(m[6] || 0));
  }
  const allBlank = r => r.ests.every(e => e.every(v => !isFinite(v)));
  // Should r replace prev? A blank row never replaces an answered one; then date; then row order.
  function replaces(r, prev) {
    if (allBlank(r) !== allBlank(prev)) return allBlank(prev);
    const a = parseTime(r.date), b = parseTime(prev.date);
    return isFinite(a) && isFinite(b) && a !== b ? a > b : r.order > prev.order;
  }

  function buildRespondents(records, nItems, opts) {
    opts = opts || {};
    const cols = records.length ? Object.keys(records[0]) : [];
    const nameCols = Object.assign({ full: nameColumn(cols) }, namePartColumns(cols));
    const flags = { rows: records.length, preview: 0, test: 0, live: 0, previewIncluded: false, autoIncluded: false,
      incomplete: 0, noTeam: 0, noNetId: 0, dupes: [], badCells: 0, hasName: !!(nameCols.full || nameCols.first || nameCols.last) };
    records.forEach(r => { flags[rowKind(r)]++; });
    let include = !!opts.includePreview;
    if (!include && flags.live === 0 && (flags.preview + flags.test) > 0) { include = true; flags.autoIncluded = true; }
    flags.previewIncluded = include;
    const kept = records.filter(r => include || rowKind(r) === 'live');
    const resps = kept.map((r, idx) => {
      const ests = [];
      for (let i = 1; i <= nItems; i++) {
        const cells = [1, 2, 3].map(k => r['est_' + i + '_' + k]);
        const vals = cells.map(num);
        cells.forEach((c, j) => { if (c != null && String(c).trim() !== '' && isNaN(vals[j])) flags.badCells++; });
        ests.push(vals);
      }
      const fin = String(r.Finished || '').toLowerCase();
      if (fin === '0' || fin === 'false') flags.incomplete++;
      const team = normTeam(r.team_num), netid = normId(r.netID);
      let name = rowName(r, nameCols);
      // a NetID typed into the name box must not reach the screen
      if (name && netid && normId(name) === netid) name = '';
      if (!team) flags.noTeam++;
      if (!netid) flags.noNetId++;
      return { team, netid, name, groupNames: String(r.group_names == null ? '' : r.group_names).trim().replace(/\s+/g, ' '), ests, date: r.RecordedDate || r.StartDate || '', order: idx };
    });
    if (opts.dedupe === false) return { resps, flags };
    const byId = new Map(), out = [];
    resps.forEach(r => {
      if (!r.netid) { out.push(r); return; }
      const prev = byId.get(r.netid);
      if (!prev) { byId.set(r.netid, r); return; }
      flags.dupes.push(r.netid);
      if (replaces(r, prev)) byId.set(r.netid, r);
    });
    byId.forEach(v => out.push(v));
    return { resps: out, flags };
  }

  // ---------- scoring (hits include endpoints) ----------
  function scoreEst(ests, truth) {
    const items = ests.map((e, i) => {
      const lo = e[0], mid = e[1], hi = e[2], t = truth[i];
      const full = isFinite(lo) && isFinite(hi) && isFinite(t);
      const hit = full ? (lo <= t && t <= hi ? 1 : 0) : null;
      const err = isFinite(mid) && isFinite(t) ? Math.abs(mid - t) : null;
      const disordered = (isFinite(lo) && isFinite(hi) && lo > hi) || (isFinite(lo) && isFinite(mid) && lo > mid) || (isFinite(mid) && isFinite(hi) && mid > hi);
      return { lo, mid, hi, hit, err, disordered };
    });
    const answered = items.filter(x => x.hit !== null).length;
    const hits = items.reduce((a, x) => a + (x.hit || 0), 0);
    return { items, answered, hits, rate: ests.length ? hits / ests.length : NaN, disordered: items.filter(x => x.disordered).length };
  }

  const mean = a => { a = a.filter(x => x != null && isFinite(x)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; };
  // Statisticized team: lowest 5th and highest 95th among usable members; mid is the mean of their 50ths.
  function statTeam(members, nItems) {
    const ests = [];
    const ok = e => isFinite(e[0]) && isFinite(e[1]) && isFinite(e[2]) && e[0] <= e[1] && e[1] <= e[2];
    for (let i = 0; i < nItems; i++) {
      const good = members.map(m => m.ests[i]).filter(ok);
      ests.push(good.length ? [Math.min(...good.map(e => e[0])), mean(good.map(e => e[1])), Math.max(...good.map(e => e[2]))] : [NaN, NaN, NaN]);
    }
    return ests;
  }

  function buildTeamSubs(records, nItems, opts) {
    // no NetID dedupe here: a person resubmitting under a corrected team number must not lose the first team
    const b = buildRespondents(records, nItems, Object.assign({}, opts, { dedupe: false }));
    const flags = Object.assign({}, b.flags, { dupes: [], noTeam: 0 });
    const byTeam = new Map(), subs = [];
    b.resps.forEach(r => {
      if (!r.team) { flags.noTeam++; return; }
      const prev = byTeam.get(r.team);
      if (!prev) { byTeam.set(r.team, r); return; }
      flags.dupes.push(r.team);
      if (replaces(r, prev)) byTeam.set(r.team, r);
    });
    byTeam.forEach(v => subs.push(v));
    return { subs, flags };
  }

  const byNum = (a, b) => (+a.team) - (+b.team) || String(a.team).localeCompare(b.team);
  const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

  // ---------- team standings ----------
  // Target is 90% of the questions (9 of 10). Closest wins; at equal distance the score below wins: 9, 8, 10, 7, 6, ...
  const target = n => n * 9 / 10;
  const rankKey = (hits, n = 10) => { const t = target(n); return Math.round(Math.abs(hits - t) * 1000) * 2 + (hits > t ? 1 : 0); };

  function tiebreak(teams, truth) {
    const scored = teams.map(t => ({ team: t.team, s: scoreEst(t.ests, truth) }));
    const points = {}; scored.forEach(t => points[t.team] = 0);
    const items = truth.map((_, i) => {
      const widths = {}, eligible = [];
      scored.forEach(t => { const it = t.s.items[i]; if (it.hit === 1) { widths[t.team] = it.hi - it.lo; eligible.push(t.team); } });
      if (!eligible.length) return { q: i + 1, eligible, widths, winners: [], share: 0 };
      const min = Math.min(...eligible.map(t => widths[t]));
      const winners = eligible.filter(t => close(widths[t], min)), share = 1 / winners.length;
      winners.forEach(t => points[t] += share);
      return { q: i + 1, eligible, widths, winners, share };
    });
    const top = Math.max(...scored.map(t => points[t.team]));
    return { items, points, winners: scored.map(t => t.team).filter(t => close(points[t], top)) };
  }

  function standings(units, truth) {
    const list = units.filter(u => u.s.answered > 0).sort((a, b) => rankKey(a.s.hits, truth.length) - rankKey(b.s.hits, truth.length) || byNum(a, b));
    if (!list.length) return { ranked: [], winners: [], tied: [], tb: null };
    const tied = list.filter(u => u.s.hits === list[0].s.hits), rest = list.slice(tied.length);
    const tb = tied.length > 1 ? tiebreak(tied, truth) : null;
    if (tb) tied.sort((a, b) => (close(tb.points[a.team], tb.points[b.team]) ? 0 : tb.points[b.team] - tb.points[a.team]) || byNum(a, b));
    const ranked = [];
    tied.concat(rest).forEach((u, i) => {
      const p = ranked[i - 1], pts = tb && i < tied.length ? tb.points[u.team] : null;
      const same = p && p.hits === u.s.hits && (pts === null || close(pts, p.points));
      ranked.push({ team: u.team, hits: u.s.hits, points: pts, rank: same ? p.rank : i + 1 });
    });
    return { ranked, winners: tb ? tb.winners : [tied[0].team], tied: tied.map(u => u.team), tb };
  }

  // Individual prize: same rules as teams, on individual survey answers. Units are keyed by row, since first names repeat.
  function indStandings(scored, truth) {
    const units = scored.map((r, i) => ({ team: String(i + 1), name: r.name || NO_NAME, home: r.team, ests: r.ests, s: r.s }));
    const st = standings(units, truth);
    const byId = new Map(units.map(u => [u.team, u]));
    const sameEntry = u => units.filter(o => o.home === u.home && normId(o.name) === normId(u.name)).length;
    st.people = {};
    units.forEach(u => { st.people[u.team] = { name: u.name, team: u.home }; });
    st.cards = st.winners.map(id => {
      const u = byId.get(id);
      return { id, name: u.name, team: u.home, hits: u.s.hits, repeats: u.name === NO_NAME ? 1 : sameEntry(u) };
    });
    return st;
  }

  function median(a) {
    a = a.filter(x => isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return NaN;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  // Per question: people with a 5th or 95th over 100x or under 1/100 of the median class 50th.
  function extremeEntries(people, nItems) {
    const out = [];
    for (let i = 0; i < nItems; i++) {
      const med = median(people.map(p => p.ests[i][1]));
      if (!(med > 0)) continue;
      const far = v => isFinite(v) && (v > 100 * med || v < med / 100);
      const n = people.filter(p => far(p.ests[i][0]) || far(p.ests[i][2])).length;
      if (n) out.push({ q: i + 1, n });
    }
    return out;
  }

  function analyze(resps, truth, subs) {
    const nItems = truth.length;
    const scored = resps.map(r => Object.assign({}, r, { s: scoreEst(r.ests, truth) }));
    const byTeam = new Map();
    scored.forEach(r => { if (r.team) { if (!byTeam.has(r.team)) byTeam.set(r.team, []); byTeam.get(r.team).push(r); } });
    const stat = [];
    byTeam.forEach((members, team) => {
      const ests = statTeam(members, nItems);
      stat.push({ team, n: members.length, ests, s: scoreEst(ests, truth) });
    });
    stat.sort(byNum);
    let subTeams = null, st = null;
    if (subs) {
      subTeams = subs.map(r => ({ team: r.team, n: (byTeam.get(r.team) || []).length, ests: r.ests, s: scoreEst(r.ests, truth) })).sort(byNum);
      st = standings(subTeams, truth);
      st.cards = st.winners.map(team => {
        const members = byTeam.get(team) || [];
        return { team, hits: st.ranked.find(x => x.team === team).hits, groupNames: (subs.find(s => s.team === team) || {}).groupNames || '', names: members.map(m => m.name || NO_NAME), missing: members.filter(m => !m.name).length };
      });
    }
    const groups = { ind: scored, subTeams, stat };
    const agg = { ind: summarize(scored, nItems), stat: summarize(stat, nItems), subTeams: subTeams ? summarize(subTeams, nItems) : null };
    const subbed = new Set((subTeams || []).map(t => t.team));
    return { scored, groups, agg, nItems, hasSubs: !!subTeams, standings: st, indStandings: indStandings(scored, truth),
      noTeam: scored.filter(r => !r.team).length,
      disordered: scored.filter(r => r.s.disordered > 0).length,
      namesMissing: scored.filter(r => !r.name).length,
      namesCollected: scored.some(r => r.name),
      soloTeams: stat.filter(t => t.n === 1).map(t => t.team),
      bigTeams: stat.filter(t => t.n > 6).map(t => t.team),
      noSub: subTeams ? stat.filter(t => !subbed.has(t.team)).map(t => t.team) : [],
      subsNoMembers: (subTeams || []).filter(t => !t.n).map(t => t.team),
      blankSubs: (subTeams || []).filter(t => t.s.answered < nItems).map(t => ({ team: t.team, blank: nItems - t.s.answered })),
      extreme: extremeEntries(scored, nItems) };
  }

  function summarize(units, nItems) {
    const U = units.filter(u => u.s.answered > 0);
    const hist = new Array(nItems + 1).fill(0);
    U.forEach(u => hist[u.s.hits]++);
    const perItem = [];
    for (let i = 0; i < nItems; i++) {
      perItem.push({ n: U.length, rate: U.length ? U.reduce((a, u) => a + (u.s.items[i].hit || 0), 0) / U.length : NaN });
    }
    return { n: U.length, rate: mean(U.map(u => u.s.rate)), meanHits: mean(U.map(u => u.s.hits)), hist, perItem };
  }

  function fmt(x) {
    if (!isFinite(x)) return '';
    if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString('en-US');
    return String(Number(x.toPrecision(4)));
  }

  // ---------- demo data (synthetic; uses generic trivia, not the class items) ----------
  const DEMO_KEY = [
    { label: 'Height of Mount Everest, in meters', answer: 8849, sd: 1500 },
    { label: 'Year the Eiffel Tower was completed', answer: 1889, sd: 25 },
    { label: 'Average distance from the Earth to the Moon, in kilometers', answer: 384400, sd: 150000 },
    { label: 'Number of member states of the United Nations', answer: 193, sd: 25 },
    { label: 'Year the Magna Carta was sealed', answer: 1215, sd: 100 },
    { label: 'Height of the Burj Khalifa, in meters', answer: 828, sd: 250 },
    { label: 'Diameter of the Moon, in kilometers', answer: 3475, sd: 1200 },
    { label: 'Year of the first modern Olympic Games', answer: 1896, sd: 20 },
    { label: 'Number of bones in the adult human body', answer: 206, sd: 60 },
    { label: 'Year William Shakespeare died', answer: 1616, sd: 25 }
  ];

  function withSd(key) {
    return key.map(k => Object.assign({}, k, { sd: k.sd != null ? k.sd : (Number.isInteger(k.answer) && k.answer > 1800 && k.answer < 2100 ? 10 : 0.35 * Math.abs(k.answer) || 1) }));
  }
  const rnd = (it, v) => Math.abs(it.answer) < 100 ? Math.round(v * 100) / 100 : Math.round(v);
  const floor0 = (it, v) => it.answer >= 0 ? Math.max(0, v) : v;

  function rng(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const FIRST = ['Ada', 'Ben', 'Cleo', 'Dev', 'Esme', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jude', 'Kira', 'Leo', 'Mina', 'Nico', 'Opal', 'Pax', 'Quinn', 'Rue', 'Sol', 'Tess', 'Uma', 'Vik', 'Wren', 'Xan', 'Yara', 'Zeke'];
  const META = ['StartDate', 'EndDate', 'Status', 'Progress', 'Finished', 'RecordedDate', 'ResponseId', 'DistributionChannel', 'UserLanguage'];
  function demoHeader(cols, n) {
    const header = META.concat(cols);
    for (let i = 1; i <= n; i++) for (let k = 1; k <= 3; k++) header.push('est_' + i + '_' + k);
    return [header, header.map(h => h.replace(/([a-z])([A-Z])/g, '$1 $2')), header.map(h => '{"ImportId":"' + h + '"}')];
  }

  function demoCSV(seed, key) {
    const K = withSd(key || DEMO_KEY);
    const R = rng(seed || 27708);
    const z = () => Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R());
    const letters = 'abcdefghjkmnprstuvwxyz';
    const ids = new Set();
    const newId = () => { let s; do { s = letters[Math.floor(R() * letters.length)] + letters[Math.floor(R() * letters.length)] + (100 + Math.floor(R() * 900)); } while (ids.has(s)); ids.add(s); return s; };
    let nName = 0;
    const newName = () => { const i = nName++; return FIRST[i % FIRST.length] + (i < FIRST.length ? ' Placeholder' : ' Sample'); };
    const rows = demoHeader(['team_num', 'netID', 'name'], K.length);
    let n = 0;
    const addRow = (team, id, name, vals, kind) => {
      n++;
      const t = '2026-10-21 10:' + String(10 + Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
      rows.push([t, t, kind === 'preview' ? '1' : '0', '100', '1', t, 'R_' + n, kind === 'preview' ? 'preview' : 'anonymous', 'EN', team, id, name].concat(vals));
    };
    const personVals = () => {
      const v = [];
      K.forEach(it => {
        const center = it.answer + it.sd * 0.8 * z();
        const half = 1.645 * it.sd * 0.3 * (0.8 + 0.4 * R());
        v.push(rnd(it, floor0(it, center - half)), rnd(it, floor0(it, center)), rnd(it, floor0(it, center + half)));
      });
      return v;
    };
    const sizes = [4, 5, 4, 5, 4, 5, 4, 5, 4];
    const firstName = {};
    sizes.forEach((size, t) => {
      for (let m = 0; m < size; m++) { const id = newId(), name = newName(); firstName[id] = name; addRow(String(t + 1), id, name, personVals(), 'live'); }
    });
    // deliberately messy rows so the data-checks panel has something to show
    const dupId = [...ids][3];
    addRow('1', dupId, firstName[dupId], personVals(), 'live');
    addRow('99', newId(), newName(), personVals(), 'live');
    addRow('', newId(), newName(), personVals(), 'live');
    addRow('4', '', newName(), personVals(), 'live');
    const bad = personVals(); const t0 = bad[0]; bad[0] = bad[2]; bad[2] = t0;
    addRow('6', newId(), newName(), bad, 'live');
    addRow('7', newId(), '', personVals(), 'live');
    const typo = personVals(); typo[2] = typo[2] * 100000;
    addRow('5', newId(), newName(), typo, 'live');
    addRow('1', 'zz999', 'Preview Placeholder', personVals(), 'preview');
    return toCSV(rows);
  }

  // Hits are set per team, so the tie at the top holds for any answer key.
  function demoPhase2CSV(seed, key) {
    const K = withSd(key || DEMO_KEY);
    const R = rng((seed || 27708) + 1);
    const rows = demoHeader(['team_num', 'netID', 'group_names'], K.length);
    let n = 0;
    const add = (team, hits, spread, blanks, firstMiss) => {
      n++;
      const t = '2026-10-21 11:' + String(10 + Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
      const order = K.map((_, i) => [i === firstMiss ? -1 : R(), i]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
      const miss = new Set(order.slice(0, Math.min(K.length, 10 - hits))), blank = new Set(order.slice(0, blanks || 0));
      const v = [];
      K.forEach((it, i) => {
        if (blank.has(i)) { v.push('', '', ''); return; }
        const half = 1.645 * it.sd * spread * (0.8 + 0.4 * R());
        const center = miss.has(i) ? it.answer + (R() < 0.5 ? -1 : 1) * (half + 0.3 * it.sd) : it.answer + (R() - 0.5) * 1.2 * half;
        v.push(rnd(it, floor0(it, center - half)), rnd(it, floor0(it, center)), rnd(it, floor0(it, center + half)));
      });
      rows.push([t, t, '0', '100', '1', t, 'P_' + n, 'anonymous', 'EN', team, 'tm' + team + '0', 'Alex, Blair, Casey, Drew'].concat(v));
    };
    add('3', 5, 0.15);
    [[1, 7, 0.45], [2, 9, 0.35, 0, 0], [3, 8, 0.4], [4, 6, 0.3], [5, 9, 0.22, 0, 1], [6, 8, 0.5], [7, 10, 0.6], [8, 7, 0.4, 1], [9, 6, 0.35]].forEach(x => add(String(x[0]), x[1], x[2], x[3], x[4]));
    add('77', 6, 0.35);
    return toCSV(rows);
  }

  return { parseCSV, toCSV, readQualtrics, normTeam, normId, num, rowKind, perTeam, checkPhase1, checkPhase2, fileAction, keyForUpload, keyToSave, slotClash, previewMismatch, nameColumn, namePartColumns, parseTime, NO_NAME, buildRespondents,
    scoreEst, statTeam, analyze, summarize, buildTeamSubs, target, rankKey, tiebreak, standings, indStandings, median, extremeEntries, fmt, mean, DEMO_KEY, withSd, demoCSV, demoPhase2CSV };
});
