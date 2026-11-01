const CE = require('./core.js');
const assert = require('assert');
const fs = require('fs');
let pass = 0; const ok = (c, m) => { assert(c, m); pass++; };
const near = (a, b, m) => ok(Math.abs(a - b) < 1e-9, m + ' got ' + a + ' want ' + b);
const person = (team, netid, ests, name) => ({ team, netid, name: name || '', ests });
const unit = (team, ests, truth) => ({ team, ests, s: CE.scoreEst(ests, truth) });
const rec = (o, ests) => { const r = Object.assign({ DistributionChannel: 'anonymous', Status: '0', RecordedDate: '2026-10-21 11:00:00' }, o); ests.forEach((e, i) => e.forEach((v, k) => r['est_' + (i + 1) + '_' + (k + 1)] = String(v))); return r; };

// scoring: endpoints count, abs error uses the 50th
let s = CE.scoreEst([[10, 20, 30], [10, 20, 30], [10, 20, 30], [10, 20, 30]], [10, 30, 31, 5]);
ok(s.items[0].hit === 1 && s.items[1].hit === 1, 'endpoints are hits');
ok(s.items[2].hit === 0 && s.items[3].hit === 0, 'outside is a miss');
near(s.items[3].err, 15, 'abs error vs 50th'); ok(s.hits === 2 && s.answered === 4, 'hit count');
s = CE.scoreEst([[NaN, 5, 9], [1, 2, 3]], [5, 2]); ok(s.answered === 1 && s.items[0].hit === null, 'missing');
s = CE.scoreEst([[9, 5, 1]], [5]); ok(s.disordered === 1 && s.items[0].hit === 0, 'disordered');

// hits out of nItems: blanks are misses, units with no answers are left out
{
  const s5 = CE.scoreEst([[1, 2, 3], [NaN, NaN, NaN], [1, 2, 3], [9, 9, 9]], [2, 5, 2, 2]);
  ok(s5.hits === 2 && s5.answered === 3, 'hits and answered'); near(s5.rate, 2 / 4, 'rate is hits out of all items');
  const rs = [person('2', 'a', [[1, 2, 3], [NaN, NaN, NaN]]), person('2', 'b', [[1, 2, 3], [1, 2, 3]]), person('2', 'c', [[NaN, NaN, NaN], [NaN, NaN, NaN]])];
  const A = CE.analyze(rs, [2, 2]);
  ok(A.agg.ind.n === 2, 'a respondent with no answers is left out of Individuals');
  ok(A.agg.ind.hist[1] === 1 && A.agg.ind.hist[2] === 1 && A.agg.ind.hist[0] === 0, 'histogram counts raw hits');
  near(A.agg.ind.meanHits, 1.5, 'mean hits'); near(A.agg.ind.perItem[1].rate, 0.5, 'blank counts as a miss per question');
  const A2 = CE.analyze([person('2', 'a', [[1, NaN, 3]]), person('2', 'b', [[1, 4, 9]])], [5]);
  ok(A2.groups.ind[0].s.items[0].err === null && A2.groups.ind[1].s.items[0].err === 1, 'blank 50th gives no abs error, not 0');
}

// three groups
{
  const resps = [person('1', 'a', [[0, 5, 10]]), person('1', 'b', [[4, 6, 20]]), person('2', 'c', [[1, 2, 3]]), person('', 'd', [[10, 11, 13]])];
  const A = CE.analyze(resps, [12]);
  ok(A.agg.ind.n === 4, 'Individuals includes people with no team number');
  ok(A.agg.stat.n === 2 && !A.groups.stat.some(t => !t.team), 'no statisticized team from blank team numbers');
  ok(A.noTeam === 1, 'no-team count');
  ok(!A.hasSubs && A.agg.subTeams === null && A.standings === null && A.groups.subTeams === null, 'no Phase 2 file gives no team group or standings');
  ok(A.noSub.length === 0 && A.subsNoMembers.length === 0 && A.blankSubs.length === 0, 'no Phase 2 file raises no Phase 2 checks');
  ok(CE.summarize(A.groups.ind, 1).hist.length === 2, 'summarize on a group');
  const t1 = A.groups.stat.find(t => t.team === '1');
  near(t1.ests[0][0], 0, 'lowest low'); near(t1.ests[0][2], 20, 'highest high'); near(t1.ests[0][1], 5.5, 'mean of mids');
  ok(t1.s.items[0].hit === 1, 'statisticized hit while one member alone missed');
  near(t1.s.items[0].err, 6.5, 'statisticized error uses mean of 50ths');
}
// statisticized: only members with a complete, ordered estimate for that question
{
  const m = [[[10, 20, 30]], [[-100, NaN, 999]], [[-50, 40, 0]], [[20, 30, 40]], [[NaN, 25, 500]], [[-7, 25, NaN]]];
  const e = CE.statTeam(m.map(ests => ({ ests })), 1)[0];
  ok(e[0] === 10 && e[2] === 40, 'unusable members excluded from lowest low and highest high'); near(e[1], 25, 'unusable members excluded from mid');
  const none = CE.analyze([person('1', 'z', [[100, NaN, NaN]])], [25]).groups.stat[0];
  ok(none.ests[0].every(isNaN) && none.s.items[0].hit === null && none.s.answered === 0, 'no usable member gives no interval, not infinity');
  const ex = CE.statTeam([{ ests: [[1, 2, 3], [NaN, NaN, NaN]] }, { ests: [[NaN, NaN, NaN], [4, 5, 6]] }], 2);
  ok(ex[0][2] === 3 && ex[1][0] === 4, 'usable members decided per question');
}

// normalizers, csv, header skipping, previews, dedupe
ok(CE.normTeam(' Team 007 ') === '7' && CE.normId(' AB 123 ') === 'ab123', 'normalizers');
const csv = CE.demoCSV(27708), q = CE.readQualtrics(csv);
ok(q.nItems === 10, 'items detected'); ok(q.records.every(r => r.StartDate && !r.StartDate.startsWith('{')), 'meta rows skipped');
let b = CE.buildRespondents(q.records, 10, {}); ok(b.flags.preview === 1 && !b.flags.previewIncluded, 'preview excluded when live rows exist');
ok(b.flags.dupes.length === 1, 'duplicate netid found');
b = CE.buildRespondents(q.records.filter(r => r.DistributionChannel === 'preview'), 10, {}); ok(b.flags.autoIncluded && b.resps.length === 1, 'auto-include when only previews');

// row kinds and parsing
{
  const kind = o => CE.rowKind(o);
  ok(kind({ Status: '1' }) === 'preview' && kind({ Status: '2' }) === 'test' && kind({ Status: '0' }) === 'live', 'numeric Status');
  ok(kind({ Status: 'Survey Preview' }) === 'preview' && kind({ Status: 'Survey Test' }) === 'test' && kind({ Status: 'IP Address' }) === 'live', 'text Status');
  ok(kind({ DistributionChannel: 'preview' }) === 'preview' && kind({ DistributionChannel: 'test' }) === 'test' && kind({ DistributionChannel: 'anonymous' }) === 'live', 'DistributionChannel');
  const f = CE.buildRespondents([rec({ team_num: '1', netID: 'a', Status: '2' }, [[1, 2, 3]]), rec({ team_num: '1', netID: 'b', Status: '1' }, [[1, 2, 3]]), rec({ team_num: '1', netID: 'c' }, [[1, 2, 3]])], 1, {});
  ok(f.flags.test === 1 && f.flags.preview === 1 && f.flags.live === 1 && f.resps.length === 1 && f.resps[0].netid === 'c', 'test rows counted and dropped');
  const inc = CE.buildRespondents([rec({ team_num: '1', netID: 'a', Status: '2' }, [[1, 2, 3]]), rec({ team_num: '1', netID: 'c' }, [[1, 2, 3]])], 1, { includePreview: true });
  ok(inc.resps.length === 2 && inc.flags.previewIncluded, 'include box keeps test rows');
  ok(CE.num('1,234') === 1234 && CE.num(' 2,500,000,000 ') === 2500000000 && CE.num('1.5e3') === 1500 && isNaN(CE.num('12k')) && isNaN(CE.num('')), 'num strips commas, rejects text');
  const c = CE.buildRespondents(CE.readQualtrics('StartDate,team_num,netID,est_1_1,est_1_2,est_1_3\n2026,1,a,"1,000","2,000","3,000"\n').records, 1, {});
  ok(c.resps[0].ests[0][1] === 2000 && c.flags.badCells === 0, 'quoted comma numbers survive the CSV path');
  const cnt = v => CE.buildRespondents([rec({ team_num: '1', netID: 'a', Finished: v }, [[1, 2, 3]])], 1, {}).flags.incomplete;
  ok(cnt('0') === 1 && cnt('False') === 1 && cnt('false') === 1 && cnt('1') === 0 && cnt('True') === 0 && cnt('') === 0, 'Finished flag');
  ok(['3', '03', 'T3', 't 3', '#3', '3.', '3.0', '03.00', 'Team-3', 'team 3', 'Team #3', 'TEAM3', ' Team 003 '].every(x => CE.normTeam(x) === '3'), 'team number spellings');
  ok(CE.normTeam('0') === '0' && CE.normTeam('10') === '10' && CE.normTeam('3.5') === '3.5' && CE.normTeam('blue') === 'blue' && CE.normTeam('') === '' && CE.normTeam(null) === '', 'other team values left alone');
  ok(CE.parseTime('2026-10-21 10:10:01') === Date.UTC(2026, 9, 21, 10, 10, 1) && CE.parseTime('10/21/2026 10:10') === Date.UTC(2026, 9, 21, 10, 10) && CE.parseTime('10/21/26 2:05 PM') === Date.UTC(2026, 9, 21, 14, 5) && CE.parseTime('10/21/26 12:05 AM') === Date.UTC(2026, 9, 21, 0, 5), 'date formats');
  ok(isNaN(CE.parseTime('yesterday')) && isNaN(CE.parseTime('')), 'unparseable dates');
}
// dedupe: dates and blank rows
{
  const a1 = [[1, 2, 3]], a2 = [[7, 8, 9]], bl = [['', '', '']];
  const one = (rows, id) => CE.buildRespondents(rows, 1, {}).resps.find(x => x.netid === id);
  ok(one([rec({ netID: 'x', RecordedDate: '2026-10-21 11:09:00' }, a2), rec({ netID: 'x', RecordedDate: '2026-10-21 11:03:00' }, a1)], 'x').ests[0][0] === 7, 'Phase 1: later date wins even when earlier in the file');
  ok(one([rec({ netID: 'x', RecordedDate: '2026-10-21 11:03:00' }, a1), rec({ netID: 'x', RecordedDate: '2026-10-21 11:09:00' }, a2)], 'x').ests[0][0] === 7, 'Phase 1: later date wins when later in the file');
  ok(one([rec({ netID: 'x', RecordedDate: '10/9/2026 11:00' }, a1), rec({ netID: 'x', RecordedDate: '10/21/2026 9:00' }, a2)], 'x').ests[0][0] === 7, 'Excel dates compare as times, not strings');
  ok(one([rec({ netID: 'x', RecordedDate: '10/21/2026 11:09' }, a2), rec({ netID: 'x', RecordedDate: '10/9/2026 11:00' }, a1)], 'x').ests[0][0] === 7, 'Excel dates, file order reversed');
  ok(one([rec({ netID: 'x', RecordedDate: '10/21/2026 11:09' }, a1), rec({ netID: 'x', RecordedDate: '10/21/2026 11:09' }, a2)], 'x').ests[0][0] === 7, 'equal dates fall back to row order');
  ok(one([rec({ netID: 'x', RecordedDate: 'junk' }, a1), rec({ netID: 'x', RecordedDate: 'junk' }, a2)], 'x').ests[0][0] === 7, 'unreadable dates fall back to row order');
  ok(one([rec({ netID: 'x', RecordedDate: '2026-10-21 11:03:00' }, a1), rec({ netID: 'x', RecordedDate: '2026-10-21 11:09:00' }, bl)], 'x').ests[0][0] === 1, 'Phase 1: newer blank row never replaces a full one');
  ok(one([rec({ netID: 'x', RecordedDate: '2026-10-21 11:09:00' }, bl), rec({ netID: 'x', RecordedDate: '2026-10-21 11:03:00' }, a1)], 'x').ests[0][0] === 1, 'Phase 1: older full row beats a newer blank, any order');
  ok(isNaN(one([rec({ netID: 'x' }, bl)], 'x').ests[0][0]), 'a lone blank row is kept, so its person stays on the team');
  const team = rows => CE.buildTeamSubs(rows, 1, {}).subs;
  ok(team([rec({ team_num: '4', RecordedDate: '2026-10-21 11:03:00' }, a1), rec({ team_num: '4', RecordedDate: '2026-10-21 11:09:00' }, bl)])[0].ests[0][0] === 1, 'Phase 2: newer blank row never replaces a full one');
  ok(team([rec({ team_num: '4', RecordedDate: '10/9/2026 11:00' }, a1), rec({ team_num: '4', RecordedDate: '10/21/2026 9:00' }, a2)])[0].ests[0][0] === 7, 'Phase 2: Excel dates');
  const bs = team([rec({ team_num: '4' }, bl)]);
  const A = CE.analyze([person('4', 'x', a1)], [2], bs);
  ok(bs.length === 1 && A.standings.ranked.length === 0 && A.blankSubs.length === 1, 'an all-blank team stays out of standings and is flagged');
}
// key preservation
{
  const typed = [{ label: 'a', answer: '7' }, { label: 'b', answer: '8' }], win = [{ label: 'a', answer: 1 }, { label: 'b', answer: 2 }];
  ok(CE.keyForUpload(typed, win, 2, false) === null, 'typed key survives a re-upload');
  ok(CE.keyForUpload(typed, null, 2, false) === null, 'typed key survives with no answer_key.js');
  ok(CE.keyForUpload([], win, 2, false) === win, 'empty key is filled');
  ok(CE.keyForUpload(typed, win.concat(win), 4, false).length === 4, 'length change replaces the key');
  const blank = CE.keyForUpload(typed, null, 3, false);
  ok(blank.length === 3 && blank.every(k => k.answer === ''), 'length change with no key file gives blanks');
  ok(CE.keyForUpload(typed, null, 2, true).every(k => k.answer === ''), 'demo answers never carry over to a real file');
  ok(CE.keyForUpload(typed, win, 2, true) === win, 'demo key gives way to the real key');
}

// demo and real never mix; the real key survives a demo
{
  ok(CE.slotClash(true, [1], false) && CE.slotClash(false, [1], true), 'demo and real clash in either direction');
  ok(!CE.slotClash(true, [1], true) && !CE.slotClash(false, [1], false), 'same source does not clash');
  ok(!CE.slotClash(true, null, false) && !CE.slotClash(false, null, false), 'an empty slot does not clash');
  const typed = [{ label: 'a', answer: '7' }, { label: 'b', answer: '8' }], demoK = [{ label: 'x', answer: 1 }, { label: 'y', answer: 2 }], win = [{ label: 'a', answer: 1 }, { label: 'b', answer: 2 }];
  const saved = CE.keyToSave(typed, false, null);
  ok(saved !== typed && saved[0].answer === '7', 'real key is copied before the demo overwrites it');
  ok(CE.keyToSave(demoK, true, saved) === saved, 'a second demo click keeps the real key, not demo answers');
  ok(CE.keyToSave([], false, null) === null, 'nothing to save from an empty key');
  ok(CE.keyForUpload(demoK, win, 2, true, saved) === saved, 'saved real key returns on the next real upload');
  ok(CE.keyForUpload(demoK, null, 2, true, saved) === saved, 'saved key returns with no answer_key.js');
  ok(CE.keyForUpload(demoK, null, 3, true, saved).length === 3, 'saved key of the wrong length is not restored');
}
// preview-only file paired with a live file
{
  const live = { live: 40, preview: 1, test: 0 }, prev = { live: 0, preview: 3, test: 0 }, test = { live: 0, preview: 0, test: 2 }, empty = { live: 0, preview: 0, test: 0 };
  ok(CE.previewMismatch(live, prev) === 'team' && CE.previewMismatch(live, test) === 'team', 'preview-only team file with live individuals');
  ok(CE.previewMismatch(prev, live) === 'individual' && CE.previewMismatch(test, live) === 'individual', 'preview-only individual file with a live team file');
  ok(CE.previewMismatch(live, live) === '' && CE.previewMismatch(prev, prev) === '', 'matching files raise nothing, so rehearsal stays quiet');
  ok(CE.previewMismatch(live, null) === '' && CE.previewMismatch(prev, null) === '' && CE.previewMismatch(live, empty) === '', 'no team file or an empty one raises nothing');
  const P = rows => CE.buildRespondents(rows, 1, {}).flags, p1 = P([rec({ team_num: '1', netID: 'a' }, [[1, 2, 3]])]), p2 = CE.buildTeamSubs([rec({ team_num: '1', Status: '1' }, [[1, 2, 3]])], 1, {});
  ok(p2.subs.length === 1 && CE.previewMismatch(p1, p2.flags) === 'team', 'a preview-only team file still loads, and is flagged');
  const ticked = CE.buildTeamSubs([rec({ team_num: '1', Status: '1' }, [[1, 2, 3]])], 1, { includePreview: true });
  ok(CE.previewMismatch(p1, ticked.flags) === 'team', 'flagged with the include box ticked too');
}
// blank rows in the CSV
{
  ok(CE.parseCSV('a,b\n,\n1,2\n , \n\n').length === 2, 'comma-only and whitespace-only rows dropped');
  ok(CE.parseCSV('a,b\n,2\n').length === 2, 'a row with one value stays');
  const q2 = CE.readQualtrics('StartDate,team_num,netID,est_1_1,est_1_2,est_1_3\n,,,,,\n2026,1,a,1,2,3\n,,,,,\n');
  ok(q2.records.length === 1, 'Excel trailing comma rows do not become records');
}

// names
{
  ok(CE.nameColumn(['team_num', 'Full_Name']) === 'Full_Name' && CE.nameColumn(['STUDENT_NAME']) === 'STUDENT_NAME' && CE.nameColumn(['fullname']) === 'fullname' && CE.nameColumn([' Name ']) === ' Name ', 'name column detected case-insensitively');
  ok(CE.nameColumn(['RecipientLastName', 'RecipientFirstName', 'username']) === null, 'other columns are not names');
  const r = CE.buildRespondents([rec({ team_num: '1', netID: 'ab1', Name: '  Ada   Lovelace ' }, [[1, 2, 3]]), rec({ team_num: '1', netID: 'ab2', Name: 'AB2' }, [[1, 2, 3]])], 1, {});
  ok(r.flags.hasName && r.resps.some(x => x.name === 'Ada Lovelace'), 'name read and tidied');
  ok(r.resps.find(x => x.netid === 'ab2').name === '', 'a NetID typed as a name is treated as blank');
  const none = CE.buildRespondents([rec({ team_num: '1', netID: 'ab1' }, [[1, 2, 3]])], 1, {});
  ok(!none.flags.hasName && none.resps[0].name === '', 'no name column');
  const parts = (o) => CE.buildRespondents([rec(Object.assign({ team_num: '1', netID: 'ab1' }, o), [[1, 2, 3]])], 1, {});
  ok(parts({ First_Name: ' Ada ', LASTNAME: 'Lovelace' }).resps[0].name === 'Ada Lovelace' && parts({ First_Name: 'Ada', LASTNAME: 'Lovelace' }).flags.hasName, 'first and last columns combined');
  ok(parts({ firstname: 'Ada', last_name: '' }).resps[0].name === 'Ada', 'first name alone');
  ok(parts({ last_name: 'Lovelace' }).flags.hasName, 'last name alone counts as a name column');
  ok(parts({ name: 'Ada L', first_name: 'X', last_name: 'Y' }).resps[0].name === 'Ada L', 'a full-name column wins');
  ok(parts({ first_name: 'ab1', last_name: '' }).resps[0].name === '', 'a NetID as first name is still blank');
  ok(!parts({ RecipientFirstName: 'X', RecipientLastName: 'Y', 'What is your name?': 'Z' }).flags.hasName, 'Qualtrics recipient and question-text columns are not guessed');
  const P = CE.buildTeamSubs([rec({ team_num: '1' }, [[1, 2, 3]])], 1, {});
  const A = CE.analyze([person('1', 'ab1', [[1, 2, 3]], 'Ada'), person('1', 'cd2', [[1, 2, 3]]), person('1', 'ef3', [[1, 2, 3]])], [2], P.subs);
  const c = A.standings.cards[0];
  ok(c.names.filter(n => n === CE.NO_NAME).length === 2 && c.missing === 2 && c.names.includes('Ada'), 'missing winner names show the placeholder and a count');
  ok(!JSON.stringify(A.standings).match(/ab1|cd2|ef3/), 'no NetIDs in standings');
  ok(A.namesMissing === 2, 'names missing count');
  const B = CE.analyze(none.resps, [2], P.subs);
  ok(B.standings.cards[0].names[0] === CE.NO_NAME && B.namesMissing === 1 && B.namesCollected === false, 'no name column at all');
  ok(A.namesCollected === true, 'some names collected');
}

// Phase 2: dedupe and detection
{
  const recs = [
    rec({ team_num: '1', RecordedDate: '2026-10-21 11:00:00' }, [[0, 5, 10]]),
    rec({ team_num: 'Team 1', RecordedDate: '2026-10-21 11:05:00' }, [[11, 12, 20]]),
    rec({ team_num: '2', RecordedDate: '2026-10-21 11:01:00' }, [[1, 2, 3]]),
    rec({ team_num: '', RecordedDate: '2026-10-21 11:02:00' }, [[1, 2, 3]])
  ];
  const P = CE.buildTeamSubs(recs, 1, {});
  ok(P.subs.length === 2 && P.flags.dupes.length === 1 && P.flags.noTeam === 1, 'phase 2 dedupes by team, flags blank team');
  ok(P.subs.find(x => x.team === '1').ests[0][0] === 11, 'latest submission kept');
  const A = CE.analyze([person('1', 'a', [[0, 5, 10]]), person('1', 'b', [[4, 6, 20]]), person('2', 'c', [[1, 2, 3]])], [12], P.subs);
  const s1 = A.groups.subTeams.find(t => t.team === '1');
  ok(s1.s.items[0].hit === 1 && s1.n === 2, 'submitted team uses its own interval, 2 Phase 1 members');
  near(s1.s.items[0].err, 0, 'submitted team error uses its 50th'); ok(A.agg.subTeams.n === 2, 'submitted team group');

  const two = CE.buildTeamSubs([
    rec({ team_num: '4', netID: 'aa1', RecordedDate: '2026-10-21 11:09:00' }, [[7, 8, 9]]),
    rec({ team_num: '4', netID: 'bb2', RecordedDate: '2026-10-21 11:03:00' }, [[1, 2, 3]])
  ], 1, {});
  ok(two.subs.length === 1 && two.subs[0].netid === 'aa1' && two.flags.dupes.length === 1, 'two members submitting leaves the latest per team, in any row order');
  const moved = CE.buildTeamSubs([rec({ team_num: '4', netID: 'aa1', RecordedDate: '2026-10-21 11:03:00' }, [[1, 2, 3]]), rec({ team_num: '5', netID: 'aa1', RecordedDate: '2026-10-21 11:04:00' }, [[1, 2, 3]])], 1, {});
  ok(moved.subs.length === 2, 'one person submitting for two team numbers does not drop a team');
  ok(two.flags.noNetId === 0 && CE.buildTeamSubs([rec({ team_num: '4' }, [[1, 2, 3]])], 1, {}).subs.length === 1, 'netID is optional in Phase 2');

  const none = CE.analyze([person('9', 'x', [[1, 2, 3]])], [2], CE.buildTeamSubs([rec({ team_num: '77' }, [[1, 2, 3]]), rec({ team_num: '8' }, [['', '', '']])], 1, {}).subs);
  ok(none.subsNoMembers.includes('77') && none.noSub.includes('9'), 'team mismatch checks');
  ok(none.standings.ranked.length === 1 && none.standings.cards[0].names.length === 0 && none.blankSubs[0].team === '8', 'blank team left out of standings, flagged; winner with no members survives');
  const empty = CE.analyze([person('1', 'x', [[1, 2, 3]])], [2], []);
  ok(empty.hasSubs && empty.standings.ranked.length === 0 && empty.standings.winners.length === 0, 'empty Phase 2 file does not crash');
}

// file checks
{
  const head = ['StartDate', 'DistributionChannel', 'team_num', 'netID', 'est_1_1', 'est_1_2', 'est_1_3'];
  const mk = (rows, h) => ({ header: h || head, nItems: 1, records: rows.map(([team, ch]) => ({ team_num: team, DistributionChannel: ch || 'anonymous' })) });
  const nine = Array.from({ length: 9 }, (_, i) => [String(i + 1)]);
  ok(CE.checkPhase1(mk(nine)) === 'perTeam', 'one row per team with netID rejected from Phase 1');
  ok(CE.checkPhase1(mk(nine.concat([['1'], ['2']]))) === 'perTeam', 'a couple of repeat submissions still rejected');
  const forty = []; for (let i = 0; i < 40; i++) forty.push([String(i % 9 + 1)]);
  ok(CE.checkPhase1(mk(forty)) === '', 'one row per student accepted');
  ok(CE.checkPhase1(mk([['1', 'preview']])) === '', 'a one-response test export is still accepted');
  ok(CE.checkPhase1(mk(forty, ['team_num', 'est_1_1'])) === 'wrong' && CE.checkPhase1({ header: head, nItems: 0, records: [] }) === 'wrong', 'wrong file rejected from Phase 1');
  ok(CE.checkPhase2(mk(nine)) === '' && CE.checkPhase2(mk(nine, ['team_num', 'est_1_1'])) === '', 'Phase 2 accepted with or without netID');
  const r36 = []; for (let i = 0; i < 36; i++) r36.push([String(i % 9 + 1)]);
  const r20 = r36.slice(0, 20);
  [r36, r20, forty].forEach(r => { ok(CE.checkPhase2(mk(r)) === 'manyRows' && CE.fileAction(CE.checkPhase2(mk(r))) === 'confirm', 'many rows per team asks, does not refuse'); });
  ok(CE.fileAction(CE.checkPhase2(mk(forty, ['netID', 'est_1_1']))) === 'reject', 'Phase 2 without team_num is refused');
  ok(CE.fileAction(CE.checkPhase2({ header: ['team_num'], nItems: 0, records: [] })) === 'reject', 'Phase 2 without est columns is refused');
  ok(CE.fileAction('') === 'load', 'clean file loads');
  const three = [['1'], ['2'], ['3']], eight = [['1'], ['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['6']];
  ok(CE.fileAction(CE.checkPhase1(mk(three))) === 'confirm' && CE.fileAction(CE.checkPhase1(mk(eight))) === 'confirm', 'Phase 1 per-team shape can be overridden');
  ok(CE.fileAction(CE.checkPhase1(mk(forty, ['team_num', 'est_1_1']))) === 'reject', 'Phase 1 without netID is refused');
  ok(CE.checkPhase2(mk(nine.concat(Array.from({ length: 30 }, () => ['1', 'preview'])))) === '', 'previews do not get a Phase 2 file rejected');
  ok(CE.checkPhase2(mk(nine.concat(nine))) === '', 'two members per team accepted in Phase 2');
}

// ranking order
{
  const order = [9, 8, 10, 7, 6, 5, 4, 3, 2, 1, 0];
  order.slice(1).forEach((h, i) => ok(CE.rankKey(order[i]) < CE.rankKey(h), order[i] + ' beats ' + h));
  const mk = (team, hits) => unit(team, Array.from({ length: 10 }, (_, i) => i < hits ? [0, 1, 2] : [5, 6, 7]), new Array(10).fill(1));
  const st = CE.standings([mk('1', 10), mk('2', 7), mk('3', 8), mk('4', 6), mk('5', 7)], new Array(10).fill(1));
  ok(st.ranked.map(r => r.team).join() === '3,1,2,5,4', '8 beats 10, 10 beats 7');
  ok(st.ranked.map(r => r.rank).join() === '1,2,3,3,5', 'ties below the top share a rank');
  ok(st.winners[0] === '3' && st.tb === null, 'no tiebreak without a tie at the top');
  const noTop = CE.standings([mk('1', 7), mk('2', 7), mk('3', 8), mk('4', 8)].slice(0, 2).concat(mk('5', 9)), new Array(10).fill(1));
  ok(noTop.tb === null && noTop.winners[0] === '5', 'tie below the top does not run the tiebreak');
}

// tiebreak
{
  const pts = (r, t) => r.points[t];
  let r = CE.tiebreak([{ team: 'A', ests: [[0, 5, 10], [0, 5, 10]] }, { team: 'B', ests: [[4, 5, 6], [3, 5, 7]] }], [5, 5]);
  ok(pts(r, 'B') === 2 && pts(r, 'A') === 0 && r.winners.join() === 'B', 'narrower wins');
  r = CE.tiebreak([{ team: 'A', ests: [[0, 5, 10]] }, { team: 'B', ests: [[6, 7, 8]] }], [5]);
  ok(pts(r, 'A') === 1 && pts(r, 'B') === 0, 'only hit items are eligible, a narrower miss gets nothing');
  ok(r.items[0].eligible.join() === 'A' && r.items[0].widths.B === undefined, 'miss is not in the eligible list');
  r = CE.tiebreak([{ team: 'A', ests: [[5, 7, 8]] }, { team: 'B', ests: [[0, 5, 10]] }], [5]);
  ok(pts(r, 'A') === 1, 'hit on the low endpoint counts');
  r = CE.tiebreak([{ team: 'A', ests: [[2, 3, 5]] }, { team: 'B', ests: [[0, 5, 10]] }], [5]);
  ok(pts(r, 'A') === 1, 'hit on the high endpoint counts');
  r = CE.tiebreak([{ team: 'A', ests: [[3, 5, 7]] }, { team: 'B', ests: [[2, 4, 6]] }, { team: 'C', ests: [[0, 5, 10]] }], [5]);
  ok(pts(r, 'A') === 0.5 && pts(r, 'B') === 0.5 && pts(r, 'C') === 0, 'width tie shares the point');
  r = CE.tiebreak([{ team: 'A', ests: [[3, 5, 7], [0, 5, 9]] , }, { team: 'B', ests: [[0, 5, 9], [3, 5, 7]] }, { team: 'C', ests: [[1, 5, 8], [1, 5, 8]] }], [5, 5]);
  near(pts(r, 'A') + pts(r, 'B') + pts(r, 'C'), 2, 'points sum to the allocated questions');
  ok(r.winners.join() === 'A,B', 'three-way tie leaves two joint winners');
  r = CE.tiebreak([{ team: 'A', ests: [[3, 5, 7], [3, 5, 7]] }, { team: 'B', ests: [[2, 3, 4], [1, 2, 3]] }, { team: 'C', ests: [[1, 5, 9], [1, 5, 9]] }], [5, 5]);
  ok(r.winners.join() === 'A', 'three-way tie resolved');
  r = CE.tiebreak([{ team: 'A', ests: [[0, 1, 2]] }, { team: 'B', ests: [[7, 8, 9]] }], [5]);
  ok(r.items[0].winners.length === 0 && pts(r, 'A') === 0 && pts(r, 'B') === 0, 'no eligible team leaves the point unallocated');
  ok(r.winners.join() === 'A,B', 'no points at all stays tied');
  r = CE.tiebreak([{ team: 'A', ests: [[4, 5, 6], [0, 5, 10]] }, { team: 'B', ests: [[0, 5, 10], [4, 5, 6]] }], [5, 5]);
  ok(pts(r, 'A') === 1 && pts(r, 'B') === 1 && r.winners.join() === 'A,B', 'still tied gives joint winners');
  r = CE.tiebreak([{ team: 'A', ests: [[0.1, 0.2, 0.3]] }, { team: 'B', ests: [[0.1, 0.15, 0.3 ]] }, { team: 'C', ests: [[0, 0.1, 0.2]] }], [0.15]);
  ok(0.3 - 0.1 !== 0.2 && pts(r, 'C') === 1 / 3 && pts(r, 'A') === 1 / 3, 'floating widths 0.3-0.1 and 0.2 tie');
  r = CE.tiebreak([{ team: 'A', ests: [[1991.1, 1991.15, 1991.2]] }, { team: 'B', ests: [[1991.05, 1991.1, 1991.15]] }], [1991.12]);
  ok(pts(r, 'A') === 0.5 && pts(r, 'B') === 0.5, 'floating widths tie at large magnitudes');
  r = CE.tiebreak([{ team: 'A', ests: [[3, 5, 7]] }, { team: 'B', ests: [[3, 5, 7.01]] }], [5]);
  ok(pts(r, 'A') === 1, 'a real width difference is not swallowed by the tolerance');
  // A adds 1/3 first and B adds it last, so the raw sums differ in the last bit
  const pick = w => ['A', 'B', 'C'].map(t => ({ team: t, e: w.includes(t) ? [4, 5, 6] : [0, 5, 10] }));
  const plan = ['B', 'B', 'ABC', 'A', 'A'].map(pick), mk = t => ({ team: t, ests: plan.map(q => q.find(x => x.team === t).e) });
  r = CE.tiebreak([mk('A'), mk('B'), mk('C')], [5, 5, 5, 5, 5]);
  ok(r.points.A !== r.points.B && r.winners.join() === 'A,B', 'point totals equal up to float noise are a tie');
  const fp = CE.standings(['A', 'B', 'C'].map(t => unit(t, mk(t).ests, [5, 5, 5, 5, 5])), [5, 5, 5, 5, 5]);
  ok(fp.winners.join() === 'A,B' && fp.ranked.map(x => x.rank).join() === '1,1,3', 'float-noise totals share a rank in standings');
  const truth = [5, 5, 5, 5];
  const st = CE.standings([unit('2', [[4, 5, 6], [4, 5, 6], [0, 5, 10], [9, 9, 9]], truth), unit('1', [[0, 5, 10], [0, 5, 10], [4, 5, 6], [9, 9, 9]], truth), unit('3', [[0, 5, 10], [0, 5, 10], [0, 5, 10], [9, 9, 9]], truth)], truth);
  ok(st.ranked.map(x => x.team).join() === '2,1,3' && st.ranked.map(x => x.rank).join() === '1,2,3' && st.winners.join() === '2', 'tied teams ordered by points, widths compared only among them');
  const joint = CE.standings([unit('1', [[4, 5, 6]], [5]), unit('2', [[4, 5, 6]], [5])], [5]);
  ok(joint.winners.length === 2 && joint.ranked.every(x => x.rank === 1), 'joint winners share rank 1');
}

// extreme entries
{
  ok(CE.median([3, 1, NaN, 2]) === 2 && CE.median([1, 2, 3, 4]) === 2.5, 'median');
  const ppl = [[9, 10, 11], [9, 10, 11], [9, 10, 11], [9, 10, 1001], [0.09, 10, 11], [10, 10, 1000], [0.1, 10, 11]].map((e, i) => person('1', 'p' + i, [e, [1, 2, 3]]));
  const ex = CE.extremeEntries(ppl, 2);
  ok(ex.length === 1 && ex[0].q === 1 && ex[0].n === 2, 'over 100x and under 1/100 counted, exact bounds not');
  ok(CE.extremeEntries([person('1', 'a', [[0, 0, 0]])], 1).length === 0, 'zero median does not divide or crash');
  const A = CE.analyze(ppl, [10, 2]);
  ok(A.extreme.length === 1 && A.groups.stat[0].n === 7, 'extreme entries are flagged, not excluded');
}
// team size checks
{
  const m = (t, n) => Array.from({ length: n }, (_, i) => person(t, t + 'x' + i, [[1, 2, 3]]));
  const A = CE.analyze(m('1', 1).concat(m('2', 6), m('3', 7)), [2]);
  ok(A.soloTeams.join() === '1' && A.bigTeams.join() === '3', 'team of one, and more than 6 but not exactly 6');
}

// real survey layout: first name instead of NetID in Ind, group_names in Team
{
  const csv = (h, rows) => [h.join(','), h.join(','), h.join(',')].concat(rows).join('\n');
  const ih = ['StartDate', 'Status', 'Finished', 'team_num', 'ind_name', 'est_1_1', 'est_1_2', 'est_1_3'];
  const th = ['StartDate', 'Status', 'Finished', 'team_num', 'group_names', 'est_1_1', 'est_1_2', 'est_1_3'];
  const iq = CE.readQualtrics(csv(ih, ['2026,0,1,1,Alice,1,2,3', '2026,0,1,1,Ben,1.5,2.5,3.5', '2026,0,1,2,Alice,4,5,6', '2026,1,1,2,Prev,4,5,6']));
  const tq = CE.readQualtrics(csv(th, ['2026,0,1,1,"Alice, Ben",1,2,3', '2026,0,1,2,Alice,4,5,6']));
  ok(CE.checkPhase1(iq) === '', 'Ind file with ind_name and no netID loads');
  ok(CE.checkPhase1(tq) === 'wrong', 'Team file refused in the Ind slot');
  ok(CE.checkPhase2(tq) === '', 'Team file with group_names loads');
  const b = CE.buildRespondents(iq.records, 1, {});
  ok(b.resps.length === 3 && b.resps.map(r => r.name).sort().join() === 'Alice,Alice,Ben' && b.resps[1].ests[0][0] === 1.5, 'same first name on two teams stays two people, previews dropped, decimals kept');
  const A = CE.analyze(b.resps, [2], CE.buildTeamSubs(tq.records, 1, {}).subs);
  ok(A.standings.ranked.length === 2 && A.standings.cards.length === 1 && A.standings.cards[0].groupNames === 'Alice, Ben', 'winner card names come from group_names');
}

// demo: three-group story and a real tie, with and without a real-looking key
{
  const realish = [48, 3.1, 240, 6, 85, 3400, 280, 12.5, 1985, 1500].map((answer, i) => ({ label: 'Q' + (i + 1), answer }));
  [CE.DEMO_KEY, realish].forEach(key => {
    const K = CE.withSd(key), truth = K.map(k => k.answer);
    const q1 = CE.readQualtrics(CE.demoCSV(27708, K)), q2 = CE.readQualtrics(CE.demoPhase2CSV(27708, K));
    ok(CE.checkPhase1(q1) === '' && CE.checkPhase2(q2) === '', 'demo passes the upload checks');
    ok(CE.checkPhase1(q2) === 'perTeam', 'demo Phase 2 is refused in the Phase 1 slot');
    const A = CE.analyze(CE.buildRespondents(q1.records, 10, {}).resps, truth, CE.buildTeamSubs(q2.records, 10, {}).subs);
    const st = A.standings, rows = st.ranked;
    ok(A.agg.stat.n === 10 && rows.length === 10, '9 teams plus typo teams');
    ok(st.tb && st.tied.length === 2 && st.winners.length === 1, 'demo has a real tie that the tiebreak resolves');
    ok(st.winners[0] === '5' && rows[0].hits === 9 && st.tb.points['5'] === 9 && st.tb.points['2'] === 1, 'demo winner, with the runner-up taking the question the winner missed');
    ok(rows.map(r => r.hits).slice(0, 5).join() === '9,9,8,8,10', 'demo shows 8 above 10');
    ok(A.agg.subTeams.rate > A.agg.ind.rate + 0.1, 'demo teams beat individuals');
    ok(A.noTeam === 1 && A.disordered === 1 && A.namesMissing >= 1 && A.extreme.length >= 1 && A.subsNoMembers.join() === '77' && A.noSub.join() === '99' && A.blankSubs.length === 1, 'demo messy rows reach the checks');
    ok(st.cards[0].names.length === 5 && st.cards[0].names.every(n => /Placeholder|Sample/.test(n)), 'demo winner names are fake');
    ok(CE.buildTeamSubs(q2.records, 10, {}).flags.dupes.length === 1, 'demo repeat team submission');
  });
}

// mock files load through the real upload path (local only, gitignored)
['mock_phase1.local.csv', 'mock_phase2.local.csv'].every(f => fs.existsSync(__dirname + '/' + f)) && (() => {
  const q1 = CE.readQualtrics(fs.readFileSync(__dirname + '/mock_phase1.local.csv', 'utf8')), q2 = CE.readQualtrics(fs.readFileSync(__dirname + '/mock_phase2.local.csv', 'utf8'));
  ok(CE.checkPhase1(q1) === '' && CE.checkPhase2(q2) === '' && q1.nItems === 10 && q2.nItems === 10, 'mock files pass the upload checks');
  ok(q1.header.includes('IPAddress') && q2.header.includes('LocationLatitude'), 'mock files keep the Qualtrics layout');
  const b1 = CE.buildRespondents(q1.records, 10, {}), b2 = CE.buildTeamSubs(q2.records, 10, {});
  ok(b1.flags.hasName && b1.flags.preview === 1 && b2.subs.length === 10 && b1.resps.length === 46, 'mock files parse: names, preview, teams');
})();

// optional: a real Qualtrics export, set CE_SAMPLE_CSV=/path/to/export.csv to check parsing
if (process.env.CE_SAMPLE_CSV) { const rq = CE.readQualtrics(fs.readFileSync(process.env.CE_SAMPLE_CSV, 'utf8')); const rb = CE.buildRespondents(rq.records, rq.nItems, {});
  ok(rq.nItems === 10 && rb.resps.length >= 1, 'real export parses'); ok(CE.checkPhase1(rq) === '', 'real export passes the Phase 1 check'); }

console.log('passed', pass, 'checks');
