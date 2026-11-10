const express = require('express');
const {
  getTeams, getPlayers, getSoldPlayers, getMatches, getFixtures, getVenues, getAuctions
} = require('../data/store');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

const router = express.Router();

router.get('/me', authMiddleware, tenantMiddleware, (req, res) => {
  if (req.user.role !== 'team_manager' && req.user.role !== 'admin' && req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Franchise access only' });
  }
  const teamId = req.user.role === 'team_manager' ? req.user.teamId : (req.query.teamId || req.user.teamId);
  if (!teamId) {
    return res.status(400).json({ error: 'No team assigned. Admin can pass ?teamId=' });
  }
  const team = getTeams(req.orgId).find(t => t.id === teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const sold = getSoldPlayers(req.orgId).filter(s => s.teamId === teamId);
  const players = getPlayers(req.orgId);
  const squad = sold.map(s => {
    const pl = players.find(p => p.id === s.playerId);
    return {
      soldId: s.id,
      playerId: s.playerId,
      name: pl?.name || s.playerId,
      role: pl?.role || null,
      city: pl?.city || null,
      photoUrl: pl?.photoUrl || null,
      soldPrice: Number(s.soldPrice) || 0,
      soldAt: s.soldAt || null
    };
  }).sort((a, b) => b.soldPrice - a.soldPrice);

  const spent = squad.reduce((s, x) => s + x.soldPrice, 0);
  const byRole = {};
  squad.forEach(p => {
    const r = p.role || 'Unknown';
    byRole[r] = (byRole[r] || 0) + 1;
  });

  const fixtures = getFixtures(req.orgId)
    .filter(f => f.teamAId === teamId || f.teamBId === teamId)
    .sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0));

  const venues = getVenues(req.orgId);
  const vMap = Object.fromEntries(venues.map(v => [v.id, v]));
  const teams = getTeams(req.orgId);
  const tMap = Object.fromEntries(teams.map(t => [t.id, t]));

  const matches = getMatches(req.orgId).filter(m =>
    m.teamAName === team.name || m.teamBName === team.name
  );

  const auction = getAuctions(req.orgId).find(a => a.status === 'live' || a.status === 'paused');

  res.json({
    team: {
      id: team.id,
      name: team.name,
      logoUrl: team.logoUrl || null,
      purse: Number(team.purse) || 0,
      remainingPurse: Number(team.remainingPurse) || 0,
      maxPlayers: team.maxPlayers ?? null,
      spent,
      squadSize: squad.length
    },
    squad,
    roleMix: byRole,
    fixtures: fixtures.map(f => ({
      ...f,
      venueName: f.venueId ? vMap[f.venueId]?.name : null,
      opponentName: f.teamAId === teamId
        ? (tMap[f.teamBId]?.name || 'TBD')
        : (tMap[f.teamAId]?.name || 'TBD'),
      home: f.teamAId === teamId
    })),
    matches: matches.slice(0, 12).map(m => ({
      id: m.id,
      name: m.name,
      status: m.status,
      teamAName: m.teamAName,
      teamBName: m.teamBName,
      result: m.result || null
    })),
    liveAuction: auction ? { id: auction.id, name: auction.name, status: auction.status } : null,
    rtm: {
      enabled: false,
      note: 'Right-to-Match can be enabled per league in a future Pro rule-set. Portal is ready for RTM events.'
    }
  });
});

module.exports = router;
