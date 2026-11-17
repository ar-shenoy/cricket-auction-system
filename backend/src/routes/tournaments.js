const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getTournaments, addTournament, updateTournament,
  getFixtures, addFixture, updateFixture, deleteFixture,
  getVenues, addVenue, updateVenue, deleteVenue,
  getTeams, getMatches, getOrganizations, getOrgBySlug
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

const router = express.Router();

function parseResult(m) {
  if (!m || (m.status !== 'completed' && m.status !== 'abandoned' && m.status !== 'no_result')) {
    return { played: false };
  }
  if (m.status === 'abandoned' || m.status === 'no_result') {
    return { played: true, isNR: true };
  }
  const a = m.innings1 || {};
  const b = m.innings2 || {};
  const aRuns = Number(a.runs) || 0;
  const bRuns = Number(b.runs) || 0;
  const aBalls = Number(a.balls) || 0;
  const bBalls = Number(b.balls) || 0;
  if (aRuns === bRuns) return { played: true, isTie: true, aRuns, bRuns, aBalls, bBalls };
  const aWon = aRuns > bRuns;
  return { played: true, aWon, bWon: !aWon, aRuns, bRuns, aBalls, bBalls };
}

function computeTable(orgId) {
  const matches = getMatches(orgId).filter(m => m.status === 'completed' || m.status === 'abandoned' || m.status === 'no_result');
  const teams = getTeams(orgId);
  const map = {};
  teams.forEach(t => {
    map[t.name] = { teamName: t.name, played: 0, won: 0, lost: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0 };
  });
  matches.forEach(m => {
    const pr = parseResult(m);
    if (!pr.played) return;
    const aName = m.teamAName;
    const bName = m.teamBName;
    if (!map[aName]) map[aName] = { teamName: aName, played: 0, won: 0, lost: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0 };
    if (!map[bName]) map[bName] = { teamName: bName, played: 0, won: 0, lost: 0, points: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0 };
    map[aName].played++;
    map[bName].played++;
    if (pr.isNR || pr.isTie) {
      map[aName].points += 1;
      map[bName].points += 1;
    } else if (pr.aWon) {
      map[aName].won++; map[bName].lost++; map[aName].points += 2;
    } else {
      map[bName].won++; map[aName].lost++; map[bName].points += 2;
    }
    if (pr.aRuns != null) {
      map[aName].runsFor += pr.aRuns; map[aName].ballsFor += pr.aBalls || 1;
      map[aName].runsAgainst += pr.bRuns; map[aName].ballsAgainst += pr.bBalls || 1;
      map[bName].runsFor += pr.bRuns; map[bName].ballsFor += pr.bBalls || 1;
      map[bName].runsAgainst += pr.aRuns; map[bName].ballsAgainst += pr.aBalls || 1;
    }
  });
  const table = Object.values(map).map(r => {
    const rf = r.ballsFor > 0 ? (r.runsFor / r.ballsFor) * 6 : 0;
    const ra = r.ballsAgainst > 0 ? (r.runsAgainst / r.ballsAgainst) * 6 : 0;
    r.nrr = Math.round((rf - ra) * 1000) / 1000;
    return r;
  }).sort((a, b) => b.points - a.points || b.nrr - a.nrr);
  table.forEach((r, i) => { r.rank = i + 1; });
  return table;
}

router.get('/', authMiddleware, tenantMiddleware, (req, res) => {
  res.json(getTournaments(req.orgId));
});

router.post('/', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const { name, season } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const t = addTournament({ id: uuidv4(), name, season: season || '', orgId: req.orgId, createdAt: new Date().toISOString() });
  res.status(201).json(t);
});

router.put('/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const updates = {};
  if (req.body.name != null) updates.name = String(req.body.name);
  if (req.body.season != null) updates.season = String(req.body.season);
  const updated = updateTournament(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.get('/venues/list', authMiddleware, tenantMiddleware, (req, res) => {
  res.json(getVenues(req.orgId));
});

router.post('/venues', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const { name, city, capacity } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const v = addVenue({
    id: uuidv4(), name: String(name).trim(), city: city ? String(city).trim() : '',
    capacity: capacity != null && capacity !== '' ? Number(capacity) : null,
    orgId: req.orgId, createdAt: new Date().toISOString()
  });
  res.status(201).json(v);
});

router.put('/venues/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const { name, city, capacity } = req.body;
  const updates = {};
  if (name != null) updates.name = String(name).trim();
  if (city !== undefined) updates.city = city ? String(city).trim() : '';
  if (capacity !== undefined) updates.capacity = capacity === '' || capacity == null ? null : Number(capacity);
  const updated = updateVenue(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Venue not found' });
  res.json(updated);
});

router.delete('/venues/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const ok = deleteVenue(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Venue not found' });
  res.json({ message: 'Venue deleted' });
});

router.get('/fixtures/list', authMiddleware, tenantMiddleware, (req, res) => {
  const fixtures = getFixtures(req.orgId);
  const teams = getTeams(req.orgId);
  const venues = getVenues(req.orgId);
  const tMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const vMap = Object.fromEntries(venues.map(v => [v.id, v]));
  res.json(fixtures.map(f => ({
    ...f,
    teamA: f.teamAId ? tMap[f.teamAId] : null,
    teamB: f.teamBId ? tMap[f.teamBId] : null,
    venue: f.venueId ? vMap[f.venueId] : null
  })));
});

router.post('/fixtures', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const { tournamentId, teamAId, teamBId, venueId, scheduledAt, label } = req.body;
  const f = addFixture({
    id: uuidv4(), tournamentId: tournamentId || null,
    teamAId, teamBId, venueId: venueId || null, scheduledAt: scheduledAt || null,
    label: label || '', status: 'scheduled', orgId: req.orgId, createdAt: new Date().toISOString()
  });
  res.status(201).json(f);
});

router.put('/fixtures/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const updates = {};
  ['tournamentId', 'teamAId', 'teamBId', 'venueId', 'scheduledAt', 'label', 'status', 'matchId'].forEach(k => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });
  const updated = updateFixture(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

router.delete('/fixtures/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const ok = deleteFixture(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ message: 'Deleted' });
});

router.get('/standings', authMiddleware, tenantMiddleware, (req, res) => {
  res.json({ table: computeTable(req.orgId) });
});

router.get('/public', (req, res) => {
  const orgs = getOrganizations();
  const org = orgs[0];
  const orgId = org?.id;
  const fixtures = getFixtures(orgId);
  const teams = getTeams(orgId);
  const venues = getVenues(orgId);
  const tMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const vMap = Object.fromEntries(venues.map(v => [v.id, v]));
  res.json({
    tournaments: getTournaments(orgId),
    fixtures: fixtures.map(f => ({
      ...f,
      teamAName: f.teamAId ? tMap[f.teamAId]?.name : null,
      teamBName: f.teamBId ? tMap[f.teamBId]?.name : null,
      venueName: f.venueId ? vMap[f.venueId]?.name : null
    })),
    table: computeTable(orgId)
  });
});

router.get('/public/:slug', (req, res) => {
  const org = getOrgBySlug(req.params.slug);
  if (!org) return res.status(404).json({ error: 'Not found' });
  const orgId = org.id;
  const fixtures = getFixtures(orgId);
  const teams = getTeams(orgId);
  const venues = getVenues(orgId);
  const tMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const vMap = Object.fromEntries(venues.map(v => [v.id, v]));
  res.json({
    org: { name: org.name, slug: org.slug },
    tournaments: getTournaments(orgId),
    fixtures: fixtures.map(f => ({
      ...f,
      teamAName: f.teamAId ? tMap[f.teamAId]?.name : null,
      teamBName: f.teamBId ? tMap[f.teamBId]?.name : null,
      venueName: f.venueId ? vMap[f.venueId]?.name : null
    })),
    table: computeTable(orgId)
  });
});

module.exports = router;
module.exports.computeTable = computeTable;
