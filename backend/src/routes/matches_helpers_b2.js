const {
  getMatches, updateMatch, getTeams, getPlayers, getSoldPlayers
} = require('../data/store');
const { emptyInnings, formatOvers, ensureBatter, ensureBowler, battersList, bowlersList, resolveTeamLogos, trimEvents } = require('./matches_helpers_a');
const { v4: uuidv4 } = require('uuid');

function undoEvent(match) {
  const key = match.innings === 1 ? 'innings1' : 'innings2';
  const inn = {
    ...match[key],
    extras: { ...(match[key].extras || {}) },
    events: [...(match[key].events || [])],
    batters: { ...(match[key].batters || {}) },
    bowlers: { ...(match[key].bowlers || {}) },
    fow: [...(match[key].fow || [])]
  };
  if (!inn.events.length) throw new Error('No events to undo');
  const last = inn.events.pop();
  const runs = Number(last.runs) || 0;
  const legal = !!last.legal;
  if (last.type !== 'dead_ball') inn.runs = Math.max(0, (inn.runs || 0) - runs);
  if (legal) inn.balls = Math.max(0, (inn.balls || 0) - 1);
  if (last.wicket) inn.wickets = Math.max(0, (inn.wickets || 0) - 1);
  if (last.type === 'wide') {
    inn.extras.wide = Math.max(0, (inn.extras.wide || 0) - runs);
    inn.extras.total = Math.max(0, (inn.extras.total || 0) - runs);
  } else if (last.type === 'noball' || last.type === 'no_ball') {
    inn.extras.noball = Math.max(0, (inn.extras.noball || 0) - runs);
    inn.extras.total = Math.max(0, (inn.extras.total || 0) - runs);
  } else if (last.type === 'bye') {
    inn.extras.bye = Math.max(0, (inn.extras.bye || 0) - runs);
    inn.extras.total = Math.max(0, (inn.extras.total || 0) - runs);
  } else if (last.type === 'legbye' || last.type === 'leg_bye') {
    inn.extras.legbye = Math.max(0, (inn.extras.legbye || 0) - runs);
    inn.extras.total = Math.max(0, (inn.extras.total || 0) - runs);
  }
  if (last.strikerId && inn.batters[last.strikerId]) {
    const bat = inn.batters[last.strikerId];
    if (legal) bat.balls = Math.max(0, bat.balls - 1);
    if (last.offBat) {
      bat.runs = Math.max(0, bat.runs - runs);
      if (runs === 4) bat.fours = Math.max(0, bat.fours - 1);
      if (runs === 6) bat.sixes = Math.max(0, bat.sixes - 1);
    }
    if (last.wicket) {
      bat.out = false;
      bat.dismissal = null;
    }
  }
  if (last.bowlerId && inn.bowlers[last.bowlerId]) {
    const bw = inn.bowlers[last.bowlerId];
    if (legal) bw.balls = Math.max(0, bw.balls - 1);
    bw.runs = Math.max(0, (bw.runs || 0) - runs);
    if (last.wicket) bw.wickets = Math.max(0, (bw.wickets || 0) - 1);
  }
  if (last.wicket && inn.fow.length) inn.fow.pop();
  inn.freeHit = !!last.freeHitBefore;
  const { updateMatch } = require('../data/store');
  return updateMatch(match.id, { [key]: inn, updatedAt: new Date().toISOString() });
}

function computePointsTable() {
  const matches = getMatches().filter(m => m.status === 'completed' && m.published !== false);
  const table = {};
  const ensure = (name) => {
    if (!table[name]) table[name] = { team: name, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0 };
    return table[name];
  };
  for (const m of matches) {
    const a = ensure(m.teamAName);
    const b = ensure(m.teamBName);
    a.played++; b.played++;
    const summary = (m.result && m.result.summary) || '';
    if (/tied/i.test(summary)) { a.tied++; b.tied++; a.points += 1; b.points += 1; }
    else if (/no result|abandoned/i.test(summary)) { a.nr++; b.nr++; a.points += 1; b.points += 1; }
    else if (summary.includes(m.teamAName) && /won/i.test(summary)) { a.won++; b.lost++; a.points += 2; }
    else if (summary.includes(m.teamBName) && /won/i.test(summary)) { b.won++; a.lost++; b.points += 2; }
    a.runsFor += m.innings1?.runs || 0; a.ballsFor += m.innings1?.balls || 0;
    a.runsAgainst += m.innings2?.runs || 0; a.ballsAgainst += m.innings2?.balls || 0;
    b.runsFor += m.innings2?.runs || 0; b.ballsFor += m.innings2?.balls || 0;
    b.runsAgainst += m.innings1?.runs || 0; b.ballsAgainst += m.innings1?.balls || 0;
  }
  return Object.values(table)
    .map(t => {
      const rf = t.ballsFor ? (t.runsFor / t.ballsFor) * 6 : 0;
      const ra = t.ballsAgainst ? (t.runsAgainst / t.ballsAgainst) * 6 : 0;
      t.nrr = Math.round((rf - ra) * 1000) / 1000;
      return t;
    })
    .sort((x, y) => y.points - x.points || y.nrr - x.nrr);
}

function getSquadForTeam(teamId, teamName) {
  const sold = getSoldPlayers().filter(s => s.teamId === teamId);
  const players = getPlayers();
  if (sold.length) {
    return sold.map(s => {
      const p = players.find(x => x.id === s.playerId);
      return { id: s.playerId, name: p?.name || s.playerId, role: p?.role || null };
    });
  }
  // Fallback: name match against player list (for ad-hoc teams without auction)
  return players
    .filter(p => p.status === 'Approved' || p.auctionStatus === 'Sold')
    .slice(0, 15)
    .map(p => ({ id: p.id, name: p.name, role: p.role }));
}

module.exports = { undoEvent, computePointsTable, getSquadForTeam };
