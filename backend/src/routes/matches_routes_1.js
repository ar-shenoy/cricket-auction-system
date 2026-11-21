const {
  getMatches, addMatch, updateMatch, getTeams, getPlayers, getSoldPlayers
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const H = require('./matches_helpers');
const { emptyInnings, formatOvers, enrichMatch, emitScore, applyEvent, undoEvent,
  computeResult, computePointsTable, getSquadForTeam, resolveTeamLogos,
  ensureBatter, ensureBowler, swapStrike, uuidv4 } = H;

module.exports = function registerMatchRoutes1(router) {
router.post('/fixtures/generate', authMiddleware, requireRole('admin'), (req, res) => {
  const teams = getTeams();
  let list = [];
  if (Array.isArray(req.body.teamIds) && req.body.teamIds.length >= 2) {
    list = req.body.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean);
  } else if (Array.isArray(req.body.teamNames) && req.body.teamNames.length >= 2) {
    list = req.body.teamNames.map(n => ({ name: String(n).trim() })).filter(t => t.name);
  } else {
    list = teams.slice();
  }
  if (list.length < 2) return res.status(400).json({ error: 'Need at least 2 teams' });

  const venue = req.body.venue || null;
  const weatherNote = req.body.weatherNote || null;
  const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid startDate' });

  const n = list.length;
  const isOdd = n % 2 === 1;
  const arr = list.map(t => ({ id: t.id || null, name: t.name }));
  if (isOdd) arr.push({ id: null, name: 'BYE' });
  const total = arr.length;
  const rounds = total - 1;
  const half = total / 2;
  const fixtures = [];
  const rotating = arr.slice(1);
  for (let r = 0; r < rounds; r++) {
    const roundTeams = [arr[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const home = roundTeams[i];
      const away = roundTeams[total - 1 - i];
      if (home.name === 'BYE' || away.name === 'BYE') continue;
      const day = new Date(startDate.getTime() + r * 24 * 3600 * 1000);
      fixtures.push({
        round: r + 1,
        date: day.toISOString().slice(0, 10),
        teamAId: home.id,
        teamAName: home.name,
        teamBId: away.id,
        teamBName: away.name,
        venue: venue,
        weatherNote: weatherNote || null,
        status: 'scheduled'
      });
    }
    rotating.unshift(rotating.pop());
  }
  res.json({
    generatedAt: new Date().toISOString(),
    teamCount: list.length,
    matchCount: fixtures.length,
    fixtures
  });
});

router.get('/', authMiddleware, (req, res) => {
  const list = getMatches()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(enrichMatch);
  res.json(list);
});

router.get('/public/live', (req, res) => {
  const matches = getMatches();
  const live =
    matches.find(m => m.status === 'live') ||
    matches.find(m => m.status === 'innings_break') ||
    matches
      .slice()
      .sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
      )[0];
  if (!live) return res.json(null);
  res.json(enrichMatch(live));
});

router.get('/public/points', (req, res) => {
  const table = computePointsTable();
  const recent = getMatches()
    .filter(m => m.status === 'completed' && m.published !== false)
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 15)
    .map(m => {
      const e = enrichMatch(m);
      return {
        id: m.id,
        name: m.name,
        teamAName: m.teamAName,
        teamBName: m.teamBName,
        teamALogo: e.teamALogo,
        teamBLogo: e.teamBLogo,
        summary: e.result?.summary || null,
        scoreA: `${m.innings1?.runs || 0}/${m.innings1?.wickets || 0}`,
        scoreB: `${m.innings2?.runs || 0}/${m.innings2?.wickets || 0}`,
        updatedAt: m.updatedAt || m.createdAt
      };
    });
  res.json({ table, recent });
});

router.get('/public/:id', (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  res.json(enrichMatch(m));
});

router.get('/points', authMiddleware, (req, res) => {
  const table = computePointsTable();
  const recent = getMatches()
    .filter(m => m.status === 'completed' && m.published !== false)
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 15)
    .map(m => {
      const e = enrichMatch(m);
      return {
        id: m.id,
        name: m.name,
        teamAName: m.teamAName,
        teamBName: m.teamBName,
        summary: e.result?.summary || null,
        scoreA: `${m.innings1?.runs || 0}/${m.innings1?.wickets || 0}`,
        scoreB: `${m.innings2?.runs || 0}/${m.innings2?.wickets || 0}`,
        updatedAt: m.updatedAt || m.createdAt
      };
    });
  res.json({ table, recent });
});
};
