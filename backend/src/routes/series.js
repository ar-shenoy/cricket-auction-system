const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getSeries,
  addSeries,
  updateSeries,
  getFixtures,
  setFixtures,
  getAuctions,
  getMatches,
  getTeams,
  addAuditLog
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

const router = express.Router();

router.get('/', authMiddleware, tenantMiddleware, (req, res) => {
  res.json(getSeries(req.orgId));
});

router.post('/', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const row = addSeries({
    id: uuidv4(),
    orgId: req.orgId,
    name: name.slice(0, 80),
    season: req.body.season ? String(req.body.season).slice(0, 40) : null,
    auctionIds: Array.isArray(req.body.auctionIds) ? req.body.auctionIds.slice(0, 20) : [],
    matchIds: Array.isArray(req.body.matchIds) ? req.body.matchIds.slice(0, 200) : [],
    venueNotes: req.body.venueNotes || null,
    createdAt: new Date().toISOString()
  });
  addAuditLog({
    orgId: req.orgId,
    action: 'series.create',
    by: req.user?.email || req.user?.id,
    detail: row.name
  });
  res.status(201).json(row);
});

router.put('/:id', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  const existing = getSeries(req.orgId).find(s => s.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updates = {};
  ['name', 'season', 'venueNotes'].forEach(k => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });
  if (Array.isArray(req.body.auctionIds)) updates.auctionIds = req.body.auctionIds.slice(0, 20);
  if (Array.isArray(req.body.matchIds)) updates.matchIds = req.body.matchIds.slice(0, 200);
  const updated = updateSeries(req.params.id, updates);
  res.json(updated);
});

router.get('/:id/summary', authMiddleware, tenantMiddleware, (req, res) => {
  const series = getSeries(req.orgId).find(s => s.id === req.params.id);
  if (!series) return res.status(404).json({ error: 'Not found' });
  const auctions = getAuctions(req.orgId).filter(a => (series.auctionIds || []).includes(a.id));
  const matches = getMatches(req.orgId).filter(m => (series.matchIds || []).includes(m.id));
  const fixtures = getFixtures(req.orgId).filter(f => f.seriesId === series.id);
  res.json({ series, auctions, matches, fixtures, teams: getTeams(req.orgId).length });
});

/** Persist generated fixtures with optional weather notes */
router.post('/:id/fixtures', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  const series = getSeries(req.orgId).find(s => s.id === req.params.id);
  if (!series) return res.status(404).json({ error: 'Not found' });
  const list = Array.isArray(req.body.fixtures) ? req.body.fixtures : [];
  const normalized = list.slice(0, 200).map(f => ({
    ...f,
    seriesId: series.id,
    weatherNote: f.weatherNote != null ? String(f.weatherNote).slice(0, 200) : null,
    venue: f.venue != null ? String(f.venue).slice(0, 120) : null
  }));
  const saved = setFixtures(req.orgId, [
    ...getFixtures(req.orgId).filter(f => f.seriesId !== series.id),
    ...normalized
  ]);
  res.json({ count: normalized.length, fixtures: saved.filter(f => f.seriesId === series.id) });
});

router.get('/fixtures/all', authMiddleware, tenantMiddleware, (req, res) => {
  res.json(getFixtures(req.orgId));
});

module.exports = router;
