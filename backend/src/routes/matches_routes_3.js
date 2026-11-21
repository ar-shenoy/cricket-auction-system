const {
  getMatches, addMatch, updateMatch, getTeams, getPlayers, getSoldPlayers
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const H = require('./matches_helpers');
const { emptyInnings, formatOvers, enrichMatch, emitScore, applyEvent, undoEvent,
  computeResult, computePointsTable, getSquadForTeam, resolveTeamLogos,
  ensureBatter, ensureBowler, swapStrike, uuidv4 } = H;

module.exports = function registerMatchRoutes3(router) {
router.post('/:id/drs', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const side = req.body.side === 'B' ? 'B' : 'A';
  const action = String(req.body.action || 'use').toLowerCase();
  const drs = { ...(m.drsRemaining || { A: 2, B: 2 }) };
  if (action === 'use') {
    if ((drs[side] || 0) <= 0) return res.status(400).json({ error: 'No DRS remaining' });
    drs[side] = (drs[side] || 0) - 1;
  } else if (action === 'reset') {
    const per = req.body.perSide != null ? Number(req.body.perSide) : 2;
    drs.A = per; drs.B = per;
  } else if (action === 'set') {
    if (req.body.A != null) drs.A = Number(req.body.A);
    if (req.body.B != null) drs.B = Number(req.body.B);
  }
  const updated = updateMatch(m.id, { drsRemaining: drs, updatedAt: new Date().toISOString() });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/event', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  if (m.status === 'completed' || m.status === 'abandoned') {
    return res.status(400).json({ error: `Match is ${m.status}` });
  }
  try {
    const updated = applyEvent(m, req.body || {});
    const enriched = enrichMatch(updated);
    emitScore(req, enriched);
    res.json(enriched);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Event failed' });
  }
});

router.post('/:id/undo', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  try {
    const updated = undoEvent(m);
    const enriched = enrichMatch(updated);
    emitScore(req, enriched);
    res.json(enriched);
  } catch (e) {
    res.status(400).json({ error: e.message || 'Undo failed' });
  }
});

router.post('/:id/end-innings', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  if (m.innings === 1) {
    const nextBat = m.battingSide === 'A' ? 'B' : 'A';
    const updated = updateMatch(m.id, {
      innings: 2,
      battingSide: nextBat,
      status: 'live',
      strikerId: null, strikerName: null,
      nonStrikerId: null, nonStrikerName: null,
      bowlerId: null, bowlerName: null,
      updatedAt: new Date().toISOString()
    });
    const enriched = enrichMatch(updated);
    emitScore(req, enriched);
    return res.json(enriched);
  }
  const result = computeResult(m);
  const updated = updateMatch(m.id, {
    status: 'completed',
    result,
    updatedAt: new Date().toISOString()
  });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/publish', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const published = req.body.published !== false;
  const updated = updateMatch(m.id, {
    published,
    publishedAt: published ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString()
  });
  res.json(enrichMatch(updated));
});

router.post('/:id/status', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const status = String(req.body.status || '').toLowerCase();
  const allowed = ['live', 'innings_break', 'rain_delay', 'completed', 'abandoned'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const updates = { status, updatedAt: new Date().toISOString() };
  if (status === 'abandoned' || status === 'completed') {
    updates.result = req.body.result || m.result || { summary: status };
  }
  const updated = updateMatch(m.id, updates);
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const all = getMatches();
  const idx = all.findIndex(x => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Match not found' });
  all.splice(idx, 1);
  const { persist } = require('../data/store');
  if (typeof persist === 'function') persist();
  res.json({ ok: true, message: 'Match deleted' });
});
};
