const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getTournaments, addTournament, updateTournament,
  getFixtures, addFixture, updateFixture, deleteFixture,
  getVenues, addVenue, updateVenue, deleteVenue,
  getTeams, getMatches
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

function standingsFromMatches() {
  const matches = (getMatches() || []).filter(m => m.status === 'completed');
  const teams = getTeams() || [];
  const map = {};
  teams.forEach(t => {
    map[t.name] = { teamId: t.id, teamName: t.name, played: 0, won: 0, lost: 0, tied: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0, rank: 0 };
  });
  matches.forEach(m => {
    const aName = m.teamAName;
    const bName = m.teamBName;
    if (!map[aName]) map[aName] = { teamId: null, teamName: aName, played: 0, won: 0, lost: 0, tied: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0, rank: 0 };
    if (!map[bName]) map[bName] = { teamId: null, teamName: bName, played: 0, won: 0, lost: 0, tied: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0, rank: 0 };
    const aRuns = Number(m.innings1?.runs) || 0;
    const bRuns = Number(m.innings2?.runs) || 0;
    const aBalls = Number(m.innings1?.balls) || 1;
    const bBalls = Number(m.innings2?.balls) || 1;
    map[aName].played += 1;
    map[bName].played += 1;
    map[aName].runsFor += aRuns; map[aName].ballsFor += aBalls;
    map[aName].runsAgainst += bRuns; map[aName].ballsAgainst += bBalls;
    map[bName].runsFor += bRuns; map[bName].ballsFor += bBalls;
    map[bName].runsAgainst += aRuns; map[bName].ballsAgainst += aBalls;
    if (aRuns === bRuns) {
      map[aName].tied += 1; map[bName].tied += 1;
      map[aName].points += 1; map[bName].points += 1;
    } else if (bRuns > aRuns) {
      map[bName].won += 1; map[aName].lost += 1;
      map[bName].points += 2;
    } else {
      map[aName].won += 1; map[bName].lost += 1;
      map[aName].points += 2;
    }
  });
  const table = Object.values(map).map(r => {
    const rf = r.ballsFor > 0 ? (r.runsFor / r.ballsFor) * 6 : 0;
    const ra = r.ballsAgainst > 0 ? (r.runsAgainst / r.ballsAgainst) * 6 : 0;
    r.nrr = Number((rf - ra).toFixed(3));
    return r;
  }).sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  table.forEach((r, i) => { r.rank = i + 1; });
  return table;
}

router.get('/', authMiddleware, (req, res) => {
  res.json(getTournaments() || []);
});

router.post('/', authMiddleware, requireRole('admin', 'developer'), (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const row = addTournament({
    id: uuidv4(),
    name,
    season: String(req.body.season || '').trim() || null,
    status: 'active',
    createdAt: new Date().toISOString()
  });
  res.status(201).json(row);
});

router.get('/venues/list', authMiddleware, (req, res) => {
  res.json(getVenues() || []);
});

router.post('/venues', authMiddleware, requireRole('admin', 'developer'), (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const row = addVenue({
    id: uuidv4(),
    name,
    city: String(req.body.city || '').trim() || null,
    capacity: req.body.capacity != null && req.body.capacity !== '' ? Number(req.body.capacity) : null,
    createdAt: new Date().toISOString()
  });
  res.status(201).json(row);
});

router.put('/venues/:id', authMiddleware, requireRole('admin', 'developer'), (req, res) => {
  const updates = {};
  if (req.body.name != null) updates.name = String(req.body.name).trim();
  if (req.body.city != null) updates.city = String(req.body.city).trim();
  if (req.body.capacity !== undefined) updates.capacity = req.body.capacity === '' || req.body.capacity == null ? null : Number(req.body.capacity);
  const row = updateVenue(req.params.id, updates);
  if (!row) return res.status(404).json({ error: 'Venue not found' });
  res.json(row);
});

router.delete('/venues/:id', authMiddleware, requireRole('admin', 'developer'), (req, res) => {
  try {
    if (typeof deleteVenue === 'function') deleteVenue(req.params.id);
    else {
      const all = getVenues() || [];
      const idx = all.findIndex(v => v.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: 'Venue not found' });
      all.splice(idx, 1);
      require('../data/store').persist();
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/fixtures/list', authMiddleware, (req, res) => {
  const fixtures = getFixtures() || [];
  const teams = getTeams() || [];
  const venues = getVenues() || [];
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const venueMap = Object.fromEntries(venues.map(v => [v.id, v]));
  res.json(fixtures.map(f => ({
    ...f,
    teamA: teamMap[f.teamAId] || null,
    teamB: teamMap[f.teamBId] || null,
    venue: venueMap[f.venueId] || null
  })));
});

router.post('/fixtures', authMiddleware, requireRole('admin', 'developer'), (req, res) => {
  const { teamAId, teamBId, venueId, scheduledAt, tournamentId } = req.body;
  if (!teamAId || !teamBId) return res.status(400).json({ error: 'teamAId and teamBId required' });
  const row = addFixture({
    id: uuidv4(),
    tournamentId: tournamentId || null,
    teamAId,
    teamBId,
    venueId: venueId || null,
    scheduledAt: scheduledAt || null,
    status: 'scheduled',
    createdAt: new Date().toISOString()
  });
  res.status(201).json(row);
});

router.delete('/fixtures/:id', authMiddleware, requireRole('admin', 'developer'), (req, res) => {
  const ok = deleteFixture(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Fixture not found' });
  res.json({ ok: true });
});

router.get('/standings', authMiddleware, (req, res) => {
  res.json({ table: standingsFromMatches() });
});

module.exports = router;
