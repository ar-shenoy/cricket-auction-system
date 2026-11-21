const {
  getMatches, addMatch, updateMatch, getTeams, getPlayers, getSoldPlayers
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const H = require('./matches_helpers');
const { emptyInnings, formatOvers, enrichMatch, emitScore, applyEvent, undoEvent,
  computeResult, computePointsTable, getSquadForTeam, resolveTeamLogos,
  ensureBatter, ensureBowler, swapStrike, uuidv4 } = H;

module.exports = function registerMatchRoutes2(router) {
router.get('/:id/squad', authMiddleware, (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const side = req.query.side === 'bowl' ? 'bowl' : 'bat';
  const battingSide = m.battingSide;
  const bowlingSide = battingSide === 'A' ? 'B' : 'A';
  const useSide = side === 'bat' ? battingSide : bowlingSide;
  const teamId = useSide === 'A' ? m.teamAId : m.teamBId;
  const teamName = useSide === 'A' ? m.teamAName : m.teamBName;
  res.json({
    side: useSide,
    teamName,
    players: getSquadForTeam(teamId, teamName)
  });
});

router.get('/:id', authMiddleware, (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  res.json(enrichMatch(m));
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const {
    name, teamAName, teamBName, teamAId, teamBId, oversLimit,
    tossWinner, battingFirst, sponsorText
  } = req.body;
  if (!teamAName || !teamBName) {
    return res.status(400).json({ error: 'Both team names are required' });
  }
  const limit = oversLimit != null && oversLimit !== '' ? Number(oversLimit) : 20;
  const batFirst = battingFirst === 'B' ? 'B' : 'A';
  const teams = getTeams();
  const teamA =
    (teamAId && teams.find(t => t.id === teamAId)) ||
    teams.find(t => t.name === String(teamAName).trim());
  const teamB =
    (teamBId && teams.find(t => t.id === teamBId)) ||
    teams.find(t => t.name === String(teamBName).trim());

  const drsPerSide = req.body.drsPerSide != null ? Math.max(0, Math.min(5, Number(req.body.drsPerSide) || 2)) : 2;
  const match = addMatch({
    id: uuidv4(),
    orgId: req.user?.orgId || 'org-default',
    name: name || `${teamAName} vs ${teamBName}`,
    teamAName: String(teamAName).trim(),
    teamBName: String(teamBName).trim(),
    teamAId: teamA?.id || teamAId || null,
    teamBId: teamB?.id || teamBId || null,
    oversLimit: limit,
    status: 'live',
    innings: 1,
    battingSide: batFirst,
    tossWinner: tossWinner || null,
    sponsorText: sponsorText || null,
    boardTheme: 'dark',
    published: false,
    drsRemaining: { A: drsPerSide, B: drsPerSide },
    innings1: emptyInnings(),
    innings2: emptyInnings(),
    strikerId: null,
    strikerName: null,
    nonStrikerId: null,
    nonStrikerName: null,
    bowlerId: null,
    bowlerName: null,
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  res.status(201).json(enrichMatch(match));
});

router.post('/:id/personnel', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  if (m.status === 'completed') return res.status(400).json({ error: 'Match completed' });

  const {
    strikerId, strikerName, nonStrikerId, nonStrikerName, bowlerId, bowlerName
  } = req.body;

  const updates = { updatedAt: new Date().toISOString() };
  if (strikerId !== undefined) {
    updates.strikerId = strikerId || null;
    updates.strikerName = strikerName || null;
  }
  if (nonStrikerId !== undefined) {
    updates.nonStrikerId = nonStrikerId || null;
    updates.nonStrikerName = nonStrikerName || null;
  }
  if (bowlerId !== undefined) {
    updates.bowlerId = bowlerId || null;
    updates.bowlerName = bowlerName || null;
  }

  const key = m.innings === 1 ? 'innings1' : 'innings2';
  const inn = {
    ...m[key],
    batters: { ...(m[key].batters || {}) },
    bowlers: { ...(m[key].bowlers || {}) },
    extras: { ...(m[key].extras || {}) },
    events: [...(m[key].events || [])],
    fow: [...(m[key].fow || [])]
  };
  if (updates.strikerId) ensureBatter(inn, updates.strikerId, updates.strikerName);
  if (updates.nonStrikerId) ensureBatter(inn, updates.nonStrikerId, updates.nonStrikerName);
  if (updates.bowlerId) ensureBowler(inn, updates.bowlerId, updates.bowlerName);
  updates[key] = inn;

  const updated = updateMatch(m.id, updates);
  const enriched = enrichMatch(updated);
  const io = req.app.get('io');
  if (io) {
    io.to(`match-${m.id}`).emit('score-update', enriched);
    io.emit('score-update', enriched);
  }
  res.json(enriched);
});

router.patch('/:id/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const { sponsorText, boardTheme } = req.body;
  const updates = { updatedAt: new Date().toISOString() };
  if (sponsorText !== undefined) updates.sponsorText = String(sponsorText);
  if (boardTheme === 'light' || boardTheme === 'dark') updates.boardTheme = boardTheme;
  const updated = updateMatch(m.id, updates);
  const enriched = enrichMatch(updated);
  const io = req.app.get('io');
  if (io) {
    io.to(`match-${m.id}`).emit('score-update', enriched);
    io.emit('score-update', enriched);
  }
  res.json(enriched);
});
};
