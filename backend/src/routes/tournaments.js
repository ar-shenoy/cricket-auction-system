const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getTournaments, addTournament, updateTournament,
  getFixtures, addFixture, updateFixture, deleteFixture,
  getVenues, addVenue,
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
  if (bRuns > aRuns) {
    return { played: true, winnerName: m.teamBName, loserName: m.teamAName, aRuns, bRuns, aBalls, bBalls };
  }
  return { played: true, winnerName: m.teamAName, loserName: m.teamBName, aRuns, bRuns, aBalls, bBalls };
}

function computeTable(matches, teams) {
  const map = {};
  teams.forEach(t => {
    map[t.name] = {
      teamId: t.id, teamName: t.name, logoUrl: t.logoUrl || null,
      played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0,
      runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0
    };
  });
  matches.filter(m => m.status === 'completed' || m.status === 'abandoned' || m.status === 'no_result').forEach(m => {
    const r = parseResult(m);
    if (!r.played) return;
    const ensure = (name) => {
      if (!map[name]) {
        map[name] = {
          teamId: null, teamName: name, logoUrl: null,
          played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0,
          runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0, nrr: 0
        };
      }
      return map[name];
    };
    const A = ensure(m.teamAName);
    const B = ensure(m.teamBName);
    A.played += 1; B.played += 1;
    if (r.isNR) { A.nr += 1; B.nr += 1; A.points += 1; B.points += 1; return; }
    A.runsFor += r.aRuns; A.ballsFor += Math.max(1, r.aBalls);
    A.runsAgainst += r.bRuns; A.ballsAgainst += Math.max(1, r.bBalls);
    B.runsFor += r.bRuns; B.ballsFor += Math.max(1, r.bBalls);
    B.runsAgainst += r.aRuns; B.ballsAgainst += Math.max(1, r.aBalls);
    if (r.isTie) { A.tied += 1; B.tied += 1; A.points += 1; B.points += 1; }
    else if (r.winnerName === m.teamAName) { A.won += 1; B.lost += 1; A.points += 2; }
    else { B.won += 1; A.lost += 1; B.points += 2; }
  });
  const table = Object.values(map).map(row => {
    const rrFor = row.ballsFor > 0 ? (row.runsFor / row.ballsFor) * 6 : 0;
    const rrAg = row.ballsAgainst > 0 ? (row.runsAgainst / row.ballsAgainst) * 6 : 0;
    row.nrr = Math.round((rrFor - rrAg) * 1000) / 1000;
    return row;
  });
  table.sort((a, b) => b.points - a.points || b.nrr - a.nrr || a.teamName.localeCompare(b.teamName));
  return table.map((r, i) => ({ ...r, rank: i + 1 }));
}

router.get('/', authMiddleware, tenantMiddleware, (req, res) => {
  res.json(getTournaments(req.orgId));
});

router.post('/', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const { name, season, startDate, endDate, format } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const t = addTournament({
    id: uuidv4(), orgId: req.orgId, name: String(name).trim(),
    season: season || new Date().getFullYear().toString(),
    startDate: startDate || null, endDate: endDate || null,
    format: format || 'T20', status: 'active', createdAt: new Date().toISOString()
  });
  res.status(201).json(t);
});

router.put('/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const existing = getTournaments(req.orgId).find(x => x.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updates = {};
  ['name', 'season', 'startDate', 'endDate', 'format', 'status'].forEach(k => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });
  res.json(updateTournament(req.params.id, updates));
});

router.get('/venues/list', authMiddleware, tenantMiddleware, (req, res) => {
  res.json(getVenues(req.orgId));
});

router.post('/venues', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const { name, city, capacity } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const v = addVenue({
    id: uuidv4(), orgId: req.orgId, name: String(name).trim(),
    city: city || '', capacity: capacity ? Number(capacity) : null,
    createdAt: new Date().toISOString()
  });
  res.status(201).json(v);
});

router.get('/fixtures/list', authMiddleware, tenantMiddleware, (req, res) => {
  const fixtures = getFixtures(req.orgId);
  const venues = getVenues(req.orgId);
  const teams = getTeams(req.orgId);
  const vMap = Object.fromEntries(venues.map(v => [v.id, v]));
  const tMap = Object.fromEntries(teams.map(t => [t.id, t]));
  res.json(fixtures.map(f => ({
    ...f,
    venue: f.venueId ? vMap[f.venueId] : null,
    teamA: f.teamAId ? tMap[f.teamAId] : null,
    teamB: f.teamBId ? tMap[f.teamBId] : null
  })).sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0)));
});

router.post('/fixtures', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const { tournamentId, teamAId, teamBId, venueId, scheduledAt, label } = req.body;
  if (!teamAId || !teamBId) return res.status(400).json({ error: 'teamAId and teamBId required' });
  const f = addFixture({
    id: uuidv4(), orgId: req.orgId, tournamentId: tournamentId || null,
    teamAId, teamBId, venueId: venueId || null, scheduledAt: scheduledAt || null,
    label: label || null, status: 'scheduled', matchId: null, createdAt: new Date().toISOString()
  });
  res.status(201).json(f);
});

router.put('/fixtures/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const existing = getFixtures(req.orgId).find(x => x.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updates = {};
  ['tournamentId', 'teamAId', 'teamBId', 'venueId', 'scheduledAt', 'label', 'status', 'matchId'].forEach(k => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });
  res.json(updateFixture(req.params.id, updates));
});

router.delete('/fixtures/:id', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  if (!deleteFixture(req.params.id)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.get('/standings', authMiddleware, tenantMiddleware, (req, res) => {
  res.json({ table: computeTable(getMatches(req.orgId), getTeams(req.orgId)) });
});

router.get('/public', (req, res) => {
  const org = getOrganizations()[0];
  if (!org) return res.json({ org: null, table: [], fixtures: [] });
  const orgId = org.id;
  const tournaments = getTournaments(orgId);
  const active = tournaments.find(t => t.status === 'active') || tournaments[0] || null;
  const teams = getTeams(orgId);
  const fixtures = getFixtures(orgId);
  const venues = getVenues(orgId);
  const vMap = Object.fromEntries(venues.map(v => [v.id, v]));
  const tMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const matches = getMatches(orgId);
  const live = matches.find(m => m.status === 'live' || m.status === 'rain_delay' || m.status === 'super_over');
  res.json({
    org: { id: org.id, name: org.name, slug: org.slug },
    tournament: active,
    liveMatch: live ? { id: live.id, name: live.name, teamAName: live.teamAName, teamBName: live.teamBName, status: live.status } : null,
    fixtures: fixtures.map(f => ({
      ...f,
      venueName: f.venueId ? vMap[f.venueId]?.name : null,
      teamAName: f.teamAId ? tMap[f.teamAId]?.name : null,
      teamBName: f.teamBId ? tMap[f.teamBId]?.name : null
    })),
    table: computeTable(matches, teams),
    recent: matches.filter(m => m.status === 'completed').slice(0, 8),
    teams: teams.map(t => ({ id: t.id, name: t.name, logoUrl: t.logoUrl || null }))
  });
});

router.get('/public/:slug', (req, res) => {
  const org = getOrgBySlug(req.params.slug) || getOrganizations()[0];
  if (!org) return res.status(404).json({ error: 'League not found' });
  req.url = '/public';
  const orgId = org.id;
  const tournaments = getTournaments(orgId);
  const active = tournaments.find(t => t.status === 'active') || tournaments[0] || null;
  const teams = getTeams(orgId);
  const fixtures = getFixtures(orgId);
  const venues = getVenues(orgId);
  const vMap = Object.fromEntries(venues.map(v => [v.id, v]));
  const tMap = Object.fromEntries(teams.map(t => [t.id, t]));
  const matches = getMatches(orgId);
  const live = matches.find(m => m.status === 'live' || m.status === 'rain_delay' || m.status === 'super_over');
  res.json({
    org: { id: org.id, name: org.name, slug: org.slug },
    tournament: active,
    liveMatch: live ? { id: live.id, name: live.name, teamAName: live.teamAName, teamBName: live.teamBName, status: live.status } : null,
    fixtures: fixtures.map(f => ({
      ...f,
      venueName: f.venueId ? vMap[f.venueId]?.name : null,
      teamAName: f.teamAId ? tMap[f.teamAId]?.name : null,
      teamBName: f.teamBId ? tMap[f.teamBId]?.name : null
    })),
    table: computeTable(matches, teams),
    recent: matches.filter(m => m.status === 'completed').slice(0, 8),
    teams: teams.map(t => ({ id: t.id, name: t.name, logoUrl: t.logoUrl || null }))
  });
});

module.exports = router;
module.exports.computeTable = computeTable;
