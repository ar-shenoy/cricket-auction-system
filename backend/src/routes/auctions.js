const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, addAuction, updateAuction,
  getPlayers, updatePlayer,
  getTeams, updateTeam,
  getBids, addBid,
  addSoldPlayer, getSoldPlayers,
  getData, persist
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
const MIN_SLOT = 1000;

const DEFAULT_BID_RULES = [
  { upTo: 10000, increment: 1000 },
  { upTo: 20000, increment: 2000 },
  { upTo: null, increment: 5000 }
];

function getIncrement(currentBid, auction) {
  const rules = (auction.bidRules && auction.bidRules.length) ? auction.bidRules : null;
  if (!rules) {
    return Number(auction.bidIncrement) || 50000;
  }
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

router.get('/', authMiddleware, (req, res) => {
  res.json(getAuctions());
});

router.get('/active', authMiddleware, (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused' || a.status === 'draft') ||
                 auctions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  res.json(active);
});

router.get('/public/active', (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused') ||
                 auctions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  if (!active) return res.json(null);
  const players = getPlayers();
  const teams = getTeams();
  const currentPlayer = active.currentPlayerId
    ? players.find(p => p.id === active.currentPlayerId) || null
    : null;
  const bidder = active.currentBidderTeamId
    ? teams.find(t => t.id === active.currentBidderTeamId)
    : null;
  res.json({
    ...active,
    currentPlayer,
    currentBidderName: bidder?.name || null
  });
});

router.get('/:id', authMiddleware, (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  res.json(auction);
});

// NOTE: truncated mid-push - full file continues in next commit if needed
module.exports = router;
