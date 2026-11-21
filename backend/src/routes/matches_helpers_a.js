const {
  getMatches,
  getTeams,
  getPlayers,
  getSoldPlayers
} = require('../data/store');

function emptyInnings() {
  return {
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0, total: 0 },
    events: [],
    batters: {},
    bowlers: {},
    fow: []
  };
}

function trimEvents(events) {
  if (!Array.isArray(events) || events.length <= 280) return events;
  return events.slice(events.length - 280);
}

function formatOvers(balls) {
  const o = Math.floor(balls / 6);
  const b = balls % 6;
  return `${o}.${b}`;
}

function ensureBatter(inn, id, name) {
  if (!id) return null;
  if (!inn.batters[id]) {
    inn.batters[id] = {
      id,
      name: name || 'Batter',
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      out: false,
      dismissal: null
    };
  }
  return inn.batters[id];
}

function ensureBowler(inn, id, name) {
  if (!id) return null;
  if (!inn.bowlers[id]) {
    inn.bowlers[id] = {
      id,
      name: name || 'Bowler',
      balls: 0,
      runs: 0,
      wickets: 0,
      maidens: 0
    };
  }
  return inn.bowlers[id];
}

function battersList(inn) {
  return Object.values(inn?.batters || {}).sort((a, b) => {
    if (a.out !== b.out) return a.out ? 1 : -1;
    return (b.runs || 0) - (a.runs || 0);
  });
}

function bowlersList(inn) {
  return Object.values(inn?.bowlers || {}).sort((a, b) => (b.wickets || 0) - (a.wickets || 0));
}

function resolveTeamLogos(m) {
  const teams = getTeams();
  const a = m.teamAId ? teams.find(t => t.id === m.teamAId) : teams.find(t => t.name === m.teamAName);
  const b = m.teamBId ? teams.find(t => t.id === m.teamBId) : teams.find(t => t.name === m.teamBName);
  return {
    teamALogo: a?.logoUrl || m.teamALogo || null,
    teamBLogo: b?.logoUrl || m.teamBLogo || null
  };
}

module.exports = { emptyInnings, trimEvents, formatOvers, ensureBatter, ensureBowler, battersList, bowlersList, resolveTeamLogos };
