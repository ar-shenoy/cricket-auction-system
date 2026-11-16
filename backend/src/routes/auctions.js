const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, addAuction, updateAuction, getPlayers, updatePlayer,
  getTeams, updateTeam, getSoldPlayers, addSoldPlayer, getBids, addBid,
  removeBid, getUsers, persist
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const MIN_SLOT = 1000;

function timerEndsAtFor(auction) {
  const secs = Number(auction.bidTimerSeconds);
  if (!secs || secs <= 0) return null;
  return new Date(Date.now() + secs * 1000).toISOString();
}

function normalizeBidRules(rules) {
  if (!Array.isArray(rules) || !rules.length) return null;
  return rules
    .map(r => ({
      upTo: r.upTo == null ? null : Number(r.upTo),
      increment: Number(r.increment) || 0
    }))
    .filter(r => r.increment > 0)
    .sort((a, b) => {
      if (a.upTo == null) return 1;
      if (b.upTo == null) return -1;
      return a.upTo - b.upTo;
    });
}

function nextMinBid(currentBid, hasBidder, auction) {
  const rules = normalizeBidRules(auction.bidRules) || [{ upTo: null, increment: Number(auction.bidIncrement) || 1000 }];
  const base = Number(currentBid) || 0;
  if (!hasBidder) return base;
  for (const r of rules) {
    if (r.upTo == null || base < r.upTo) return base + r.increment;
  }
  return base + (rules[rules.length - 1]?.increment || Number(auction.bidIncrement) || 1000);
}

function emitAuction(io, auctionId, event, payload) {
  if (!io) return;
  if (auctionId) io.to(`auction-${auctionId}`).emit(event, payload);
  io.emit(event, payload);
}

function maxBidForTeam(team, soldCount) {
  if (team.maxPlayers == null) return team.remainingPurse;
  const slotsAfter = Math.max(0, Number(team.maxPlayers) - soldCount - 1);
  return Math.max(0, team.remainingPurse - slotsAfter * MIN_SLOT);
}

router.get('/', authMiddleware, (req, res) => {
  res.json(getAuctions());
});

router.get('/active', authMiddleware, (req, res) => {
  const auctions = getAuctions();
  // Prefer live/paused/draft — never auto-pick a completed auction as "active"
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused' || a.status === 'draft')
    || null;
  res.json(active);
});

router.get('/public/active', (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused')
    || auctions.find(a => a.status === 'draft')
    || null;
  res.json(active);
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, bidIncrement, bidTimerSeconds, bidRules } = req.body;
  const auction = addAuction({
    id: uuidv4(),
    name: name || `Auction ${new Date().toLocaleDateString()}`,
    status: 'draft',
    currentPlayerId: null,
    currentBid: 0,
    currentBidderTeamId: null,
    bidIncrement: Number(bidIncrement) || 1000,
    bidTimerSeconds: bidTimerSeconds === 0 || bidTimerSeconds === '0' ? 0 : (Number(bidTimerSeconds) || 20),
    bidRules: normalizeBidRules(bidRules),
    timerEndsAt: null,
    orgId: req.user?.orgId || 'org-default',
    createdAt: new Date().toISOString()
  });
  res.status(201).json(auction);
});

router.put('/:id/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const { name, bidIncrement, bidTimerSeconds, bidRules } = req.body;
  const updates = {};
  if (name != null) updates.name = String(name);
  if (bidIncrement != null) updates.bidIncrement = Number(bidIncrement);
  if (bidTimerSeconds != null) updates.bidTimerSeconds = Number(bidTimerSeconds);
  if (bidRules != null) updates.bidRules = normalizeBidRules(bidRules);
  const updated = updateAuction(auction.id, updates);
  emitAuction(req.app.get('io'), auction.id, 'auction-status', updated);
  res.json(updated);
});

router.post('/:id/start', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const updated = updateAuction(auction.id, { status: 'live', startedAt: new Date().toISOString(), timerEndsAt: null });
  emitAuction(req.app.get('io'), auction.id, 'auction-started', updated);
  res.json(updated);
});

router.post('/:id/pause', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const newStatus = auction.status === 'paused' ? 'live' : 'paused';
  const updated = updateAuction(auction.id, { status: newStatus, timerEndsAt: newStatus === 'paused' ? null : auction.timerEndsAt });
  emitAuction(req.app.get('io'), auction.id, 'auction-status', updated);
  res.json(updated);
});

router.post('/:id/end', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const updated = updateAuction(auction.id, {
    status: 'completed', completedAt: new Date().toISOString(),
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null, timerEndsAt: null
  });
  emitAuction(req.app.get('io'), auction.id, 'auction-ended', updated);
  res.json(updated);
});

router.post('/:id/select-player', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.currentPlayerId) return res.status(400).json({ error: 'Finish current player first' });
  const { playerId } = req.body;
  const player = getPlayers().find(p => p.id === playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (player.status !== 'Approved') return res.status(400).json({ error: 'Player not approved' });
  const sold = getSoldPlayers().some(s => s.playerId === playerId);
  if (sold) return res.status(400).json({ error: 'Player already sold' });
  const updated = updateAuction(auction.id, {
    currentPlayerId: player.id,
    currentBid: Number(player.basePrice) || 0,
    currentBidderTeamId: null,
    timerEndsAt: timerEndsAtFor(auction),
    status: auction.status === 'draft' ? 'live' : auction.status
  });
  emitAuction(req.app.get('io'), auction.id, 'player-selected', { auction: updated, player });
  res.json({ auction: updated, player });
});

router.post('/:id/next-random', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.currentPlayerId) return res.status(400).json({ error: 'Finish current player first' });
  const soldIds = new Set(getSoldPlayers().map(s => s.playerId));
  const pool = getPlayers().filter(p => p.status === 'Approved' && !soldIds.has(p.id));
  if (!pool.length) return res.status(400).json({ error: 'No available players' });
  const player = pool[Math.floor(Math.random() * pool.length)];
  const updated = updateAuction(auction.id, {
    currentPlayerId: player.id,
    currentBid: Number(player.basePrice) || 0,
    currentBidderTeamId: null,
    timerEndsAt: timerEndsAtFor(auction),
    status: auction.status === 'draft' ? 'live' : auction.status
  });
  emitAuction(req.app.get('io'), auction.id, 'player-selected', { auction: updated, player });
  res.json({ auction: updated, player });
});

router.post('/:id/bid', authMiddleware, (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'live') return res.status(400).json({ error: 'Auction not live' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player on the block' });
  const { teamId, amount } = req.body;
  const team = getTeams().find(t => t.id === teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  if (auction.currentBidderTeamId === teamId) return res.status(400).json({ error: 'Already highest bidder' });
  const soldCount = getSoldPlayers().filter(s => s.teamId === teamId).length;
  if (team.maxPlayers != null && soldCount >= Number(team.maxPlayers)) {
    return res.status(400).json({ error: 'Squad full' });
  }
  const minBid = nextMinBid(auction.currentBid || 0, !!auction.currentBidderTeamId, auction);
  const bidAmount = Number(amount);
  if (Number.isNaN(bidAmount) || bidAmount < minBid) {
    return res.status(400).json({ error: `Bid must be at least ${minBid}` });
  }
  if (bidAmount > maxBidForTeam(team, soldCount)) {
    return res.status(400).json({ error: 'Insufficient purse / slot reserve' });
  }
  const bid = addBid({
    id: uuidv4(),
    auctionId: auction.id,
    playerId: auction.currentPlayerId,
    teamId,
    amount: bidAmount,
    createdAt: new Date().toISOString()
  });
  const updatedAuction = updateAuction(auction.id, {
    currentBid: bidAmount,
    currentBidderTeamId: teamId,
    timerEndsAt: timerEndsAtFor(auction)
  });
  emitAuction(req.app.get('io'), auction.id, 'new-bid', {
    auction: updatedAuction,
    bid,
    team: { id: team.id, name: team.name }
  });
  res.json({ auction: updatedAuction, bid });
});

router.post('/:id/sell', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player' });
  if (!auction.currentBidderTeamId) return res.status(400).json({ error: 'No bidder — mark unsold instead' });
  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  const team = getTeams().find(t => t.id === auction.currentBidderTeamId);
  if (!player || !team) return res.status(400).json({ error: 'Invalid player/team' });
  const price = Number(auction.currentBid) || 0;
  const sold = addSoldPlayer({
    id: uuidv4(),
    auctionId: auction.id,
    playerId: player.id,
    teamId: team.id,
    soldPrice: price,
    soldAt: new Date().toISOString()
  });
  updateTeam(team.id, { remainingPurse: Math.max(0, Number(team.remainingPurse) - price) });
  updatePlayer(player.id, { auctionStatus: 'Sold' });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null, timerEndsAt: null
  });
  const result = { status: 'Sold', player, team, price, sold };
  emitAuction(req.app.get('io'), auction.id, 'player-sold', { auction: updatedAuction, result });
  res.json({ auction: updatedAuction, result });
});

router.post('/:id/unsold', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player' });
  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  if (player) updatePlayer(player.id, { auctionStatus: 'Unsold' });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null, timerEndsAt: null
  });
  emitAuction(req.app.get('io'), auction.id, 'player-sold', {
    auction: updatedAuction,
    result: { status: 'Unsold', player, price: 0 }
  });
  res.json({ auction: updatedAuction, result: { status: 'Unsold', player } });
});

router.post('/:id/undo-last-bid', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const bids = getBids().filter(b => b.auctionId === auction.id && b.playerId === auction.currentPlayerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!bids.length) return res.status(400).json({ error: 'No bids to undo' });
  const removed = bids[0];
  removeBid(removed.id);
  const remaining = bids.slice(1);
  const currentBid = remaining.length ? Number(remaining[0].amount) : (getPlayers().find(p => p.id === auction.currentPlayerId)?.basePrice || 0);
  const currentBidderTeamId = remaining.length ? remaining[0].teamId : null;
  const team = remaining.length ? getTeams().find(t => t.id === remaining[0].teamId) : null;
  const updated = updateAuction(auction.id, {
    currentBid, currentBidderTeamId, timerEndsAt: timerEndsAtFor(auction)
  });
  emitAuction(req.app.get('io'), auction.id, 'new-bid', {
    auction: updated, bid: remaining[0] || null,
    team: team ? { id: team.id, name: team.name } : null,
    undoneBid: removed, undo: true
  });
  res.json({ auction: updated, message: 'Last bid undone' });
});

router.post('/:id/undo-last-sell', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const sold = getSoldPlayers().filter(s => s.auctionId === auction.id)
    .sort((a, b) => new Date(b.soldAt || 0) - new Date(a.soldAt || 0));
  if (!sold.length) return res.status(400).json({ error: 'No sales to undo' });
  const last = sold[0];
  const all = getSoldPlayers();
  const idx = all.findIndex(s => s.id === last.id);
  if (idx >= 0) { all.splice(idx, 1); persist(); }
  const team = getTeams().find(t => t.id === last.teamId);
  if (team) updateTeam(team.id, { remainingPurse: Number(team.remainingPurse) + Number(last.soldPrice || 0) });
  const player = getPlayers().find(p => p.id === last.playerId);
  if (player) updatePlayer(player.id, { auctionStatus: null });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: last.playerId,
    currentBid: Number(last.soldPrice) || 0,
    currentBidderTeamId: last.teamId,
    timerEndsAt: timerEndsAtFor(auction),
    status: auction.status === 'draft' ? 'live' : auction.status
  });
  emitAuction(req.app.get('io'), auction.id, 'player-selected', { auction: updatedAuction, player });
  res.json({ auction: updatedAuction, player, message: 'Last sale undone' });
});

router.post('/:id/recall-unsold', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.currentPlayerId) return res.status(400).json({ error: 'Finish current player first' });
  const unsold = getPlayers().filter(p => p.auctionStatus === 'Unsold' && p.status === 'Approved');
  if (!unsold.length) return res.status(400).json({ error: 'No unsold players' });
  const player = unsold[0];
  updatePlayer(player.id, { auctionStatus: null });
  const refreshed = getPlayers().find(p => p.id === player.id);
  const updated = updateAuction(auction.id, {
    currentPlayerId: player.id,
    currentBid: Number(player.basePrice) || 0,
    currentBidderTeamId: null,
    timerEndsAt: timerEndsAtFor(auction),
    status: 'live'
  });
  emitAuction(req.app.get('io'), auction.id, 'player-selected', { auction: updated, player: refreshed });
  res.json({ auction: updated, player: refreshed });
});

router.get('/:id/sold', authMiddleware, (req, res) => {
  const sold = getSoldPlayers().filter(s => s.auctionId === req.params.id);
  const players = getPlayers();
  const teams = getTeams();
  res.json(sold.map(s => ({
    ...s,
    player: players.find(p => p.id === s.playerId),
    team: teams.find(t => t.id === s.teamId)
  })));
});

router.get('/:id/public/sold', (req, res) => {
  const sold = getSoldPlayers().filter(s => s.auctionId === req.params.id);
  const players = getPlayers();
  const teams = getTeams();
  res.json(sold.map(s => ({
    ...s,
    player: players.find(p => p.id === s.playerId),
    team: teams.find(t => t.id === s.teamId)
  })));
});

router.get('/public/sold', (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused') || auctions[0];
  if (!active) return res.json([]);
  const sold = getSoldPlayers().filter(s => s.auctionId === active.id);
  const players = getPlayers();
  const teams = getTeams();
  res.json(sold.map(s => ({
    ...s,
    player: players.find(p => p.id === s.playerId),
    team: teams.find(t => t.id === s.teamId)
  })));
});

router.get('/:id/unsold-players', authMiddleware, (req, res) => {
  res.json(getPlayers().filter(p => p.auctionStatus === 'Unsold' && p.status === 'Approved'));
});

router.get('/:id/available-players', authMiddleware, (req, res) => {
  const soldIds = new Set(getSoldPlayers().map(s => s.playerId));
  res.json(getPlayers().filter(p => p.status === 'Approved' && !soldIds.has(p.id) && p.auctionStatus !== 'Unsold'));
});

router.get('/:id/bids', authMiddleware, (req, res) => {
  res.json(getBids().filter(b => b.auctionId === req.params.id));
});

router.get('/:id/public/bids', (req, res) => {
  const bids = getBids().filter(b => b.auctionId === req.params.id);
  const teams = getTeams();
  res.json(bids.map(b => ({
    ...b,
    teamName: teams.find(t => t.id === b.teamId)?.name
  })));
});

module.exports = router;
