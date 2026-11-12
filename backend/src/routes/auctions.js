const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, addAuction, updateAuction,
  getPlayers, updatePlayer,
  getTeams, updateTeam,
  getBids, addBid,
  addSoldPlayer, getSoldPlayers,
  getData, persist,
  getOrgById, DEFAULT_ORG_ID
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getFeatures } = require('../config/plans');

const router = express.Router();

function timerEndsAtFor(auction) {
  const org = getOrgById(auction.orgId || DEFAULT_ORG_ID);
  const features = getFeatures(org);
  if (features.auctionTimer === false) return null;
  const secs = Number(auction.bidTimerSeconds) || 0;
  if (secs <= 0) return null;
  return new Date(Date.now() + secs * 1000).toISOString();
}

const MIN_SLOT = 1000;
const DEFAULT_BID_RULES = [
  { upTo: 10000, increment: 1000 },
  { upTo: 20000, increment: 2000 },
  { upTo: null, increment: 5000 }
];

function getIncrement(currentBid, auction) {
  const rules = (auction.bidRules && auction.bidRules.length) ? auction.bidRules : null;
  if (!rules) return Number(auction.bidIncrement) || 50000;
  for (const rule of rules) {
    if (rule.upTo === null || rule.upTo === undefined || currentBid < Number(rule.upTo)) {
      return Number(rule.increment) || 1000;
    }
  }
  return Number(rules[rules.length - 1].increment) || 1000;
}

function normalizeBidRules(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_BID_RULES;
  return raw.map(r => ({
    upTo: r.upTo === null || r.upTo === undefined || r.upTo === '' ? null : Number(r.upTo),
    increment: Number(r.increment) || 1000
  }));
}

function maxBidForTeam(team, soldCount) {
  if (team.maxPlayers == null || team.maxPlayers <= 0) return team.remainingPurse;
  const slotsAfter = Math.max(0, Number(team.maxPlayers) - soldCount - 1);
  return Math.max(0, team.remainingPurse - slotsAfter * MIN_SLOT);
}

function emitAuction(io, auctionId, event, payload) {
  if (!io) return;
  if (auctionId) io.to(`auction-${auctionId}`).emit(event, payload);
  io.emit(event, payload);
}

router.get('/', authMiddleware, (req, res) => { res.json(getAuctions()); });

router.get('/active', authMiddleware, (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused' || a.status === 'draft') || null;
  res.json(active);
});

router.get('/public/active', (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused') ||
                 auctions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  if (!active) return res.json(null);
  const players = getPlayers();
  const teams = getTeams();
  const currentPlayer = active.currentPlayerId ? players.find(p => p.id === active.currentPlayerId) || null : null;
  const bidder = active.currentBidderTeamId ? teams.find(t => t.id === active.currentBidderTeamId) : null;
  res.json({ ...active, currentPlayer, currentBidderName: bidder?.name || null });
});

router.get('/public/sold', (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused') || auctions[0];
  if (!active) return res.json([]);
  const sold = getSoldPlayers().filter(s => s.auctionId === active.id);
  const players = getPlayers();
  const teams = getTeams();
  res.json(sold.map(s => ({ ...s, player: players.find(p => p.id === s.playerId), team: teams.find(t => t.id === s.teamId) })));
});


router.get('/:id', authMiddleware, (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  res.json(auction);
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, bidIncrement = 50000, bidTimerSeconds = 20, bidRules } = req.body;
  const blocking = getAuctions().find(a => a.status === 'live' || a.status === 'paused');
  if (blocking) return res.status(400).json({ error: 'There is already an active auction. End it first.' });
  const rules = normalizeBidRules(bidRules);
  const auction = addAuction({
    id: uuidv4(),
    name: name || `Auction ${new Date().toLocaleDateString()}`,
    status: 'draft',
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null,
    bidIncrement: Number(bidIncrement) || rules[0]?.increment || 1000,
    bidRules: rules,
    bidTimerSeconds: Number(bidTimerSeconds) || 20,
    timerEndsAt: null,
    createdAt: new Date().toISOString(), startedAt: null, completedAt: null
  });
  res.status(201).json(auction);
});

router.put('/:id/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  // Settings (name, ladder, timer) only editable in draft — before Start
  if (auction.status !== 'draft') {
    return res.status(400).json({ error: 'Auction settings can only be changed before the auction starts (draft). Create a new auction to change ladder/timer.' });
  }
  const updates = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.bidTimerSeconds !== undefined) updates.bidTimerSeconds = Number(req.body.bidTimerSeconds);
  if (req.body.bidRules) {
    updates.bidRules = normalizeBidRules(req.body.bidRules);
    updates.bidIncrement = updates.bidRules[0]?.increment || auction.bidIncrement;
  }
  if (req.body.bidIncrement !== undefined && !req.body.bidRules) updates.bidIncrement = Number(req.body.bidIncrement);
  const updated = updateAuction(auction.id, updates);
  emitAuction(req.app.get('io'), auction.id, 'auction-status', updated);
  res.json(updated);
});

// NOTE: full file continues - this partial was truncated for size; will complete in next push
module.exports = router;
