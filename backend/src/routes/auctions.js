const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, addAuction, updateAuction,
  getPlayers, updatePlayer,
  getTeams, updateTeam,
  getBids, addBid,
  addSoldPlayer, getSoldPlayers,
  getData, persist, getOrgById, DEFAULT_ORG_ID, getFeatures
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

function timerEndsAtFor(auction) {
  try {
    const org = getOrgById(auction.orgId || DEFAULT_ORG_ID);
    const features = getFeatures(org);
    if (features && features.auctionTimer === false) return null;
  } catch (_) { /* store may not export features helpers in all deploys */ }
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

function normalizeBidRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return DEFAULT_BID_RULES;
  return rules.map(r => ({
    upTo: r.upTo === null || r.upTo === undefined || r.upTo === '' ? null : Number(r.upTo),
    increment: Number(r.increment) || 1000
  }));
}

function emitAuction(io, auctionId, event, payload) {
  if (io) io.to(`auction:${auctionId}`).emit(event, payload);
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
  const currentPlayer = active.currentPlayerId ? players.find(p => p.id === active.currentPlayerId) || null : null;
  const bidder = active.currentBidderTeamId ? teams.find(t => t.id === active.currentBidderTeamId) : null;
  res.json({ ...active, currentPlayer, currentBidderName: bidder?.name || null });
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
    bidTimerSeconds: (bidTimerSeconds === 0 || bidTimerSeconds === '0') ? 0 : (Number(bidTimerSeconds) || 20),
    timerEndsAt: null,
    createdAt: new Date().toISOString(), startedAt: null, completedAt: null
  });
  res.status(201).json(auction);
});

router.put('/:id/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'draft') {
    return res.status(400).json({ error: 'Auction settings can only be changed before the auction starts (draft).' });
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

router.post('/:id/start', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'draft' && auction.status !== 'paused') {
    return res.status(400).json({ error: 'Can only start from draft or paused' });
  }
  const updated = updateAuction(auction.id, { status: 'live', startedAt: auction.startedAt || new Date().toISOString(), timerEndsAt: null });
  emitAuction(req.app.get('io'), auction.id, 'auction-started', updated);
  res.json(updated);
});

router.post('/:id/pause', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const newStatus = auction.status === 'paused' ? 'live' : 'paused';
  const updated = updateAuction(auction.id, { status: newStatus, timerEndsAt: null });
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

router.post('/:id/next-random', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'live' && auction.status !== 'paused') {
    return res.status(400).json({ error: 'Auction is not live' });
  }
  if (auction.currentPlayerId) {
    return res.status(400).json({ error: 'Finish current player (Sell / Unsold) before drawing next' });
  }
  const available = getPlayers().filter(p => p.status === 'Approved');
  if (available.length === 0) return res.status(400).json({ error: 'No approved players left' });
  const player = available[Math.floor(Math.random() * available.length)];
  const updated = updateAuction(auction.id, {
    currentPlayerId: player.id,
    currentBid: player.basePrice || 0,
    currentBidderTeamId: null,
    timerEndsAt: timerEndsAtFor(auction),
    status: 'live'
  });
  emitAuction(req.app.get('io'), auction.id, 'player-selected', { auction: updated, player });
  res.json({ auction: updated, player });
});

router.post('/:id/select-player', authMiddleware, requireRole('admin'), (req, res) => {
  const { playerId } = req.body;
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'live' && auction.status !== 'paused') {
    return res.status(400).json({ error: 'Auction is not live' });
  }
  if (auction.currentPlayerId) {
    return res.status(400).json({ error: 'Finish current player (Sell / Unsold) before selecting another' });
  }
  let player = getPlayers().find(p => p.id === playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (player.status !== 'Approved' && player.status !== 'Unsold') {
    return res.status(400).json({ error: 'Only Approved or Unsold players can be auctioned' });
  }
  if (player.status === 'Unsold') {
    updatePlayer(player.id, { status: 'Approved' });
    player = getPlayers().find(p => p.id === playerId);
  }
  const updated = updateAuction(auction.id, {
    currentPlayerId: playerId,
    currentBid: player.basePrice || 0,
    currentBidderTeamId: null,
    timerEndsAt: timerEndsAtFor(auction),
    status: 'live'
  });
  emitAuction(req.app.get('io'), auction.id, 'player-selected', { auction: updated, player });
  res.json({ auction: updated, player });
});

router.post('/:id/bid', authMiddleware, (req, res) => {
  const { amount, teamId } = req.body;
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'live') return res.status(400).json({ error: 'Auction is not live' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player selected' });
  const finalTeamId = teamId || req.user?.teamId;
  if (!finalTeamId) return res.status(400).json({ error: 'teamId required' });
  const team = getTeams().find(t => t.id === finalTeamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  if (auction.currentBidderTeamId === finalTeamId) {
    return res.status(400).json({ error: 'You already have the highest bid' });
  }
  const bidAmount = Number(amount);
  if (!Number.isFinite(bidAmount) || bidAmount <= 0) return res.status(400).json({ error: 'Invalid bid amount' });
  const soldForTeam = getSoldPlayers().filter(s => s.teamId === finalTeamId && s.auctionId === auction.id);
  if (team.maxPlayers != null && soldForTeam.length >= Number(team.maxPlayers)) {
    return res.status(400).json({ error: 'Squad is full' });
  }
  const maxAllowed = maxBidForTeam(team, soldForTeam.length);
  if (bidAmount > team.remainingPurse) return res.status(400).json({ error: 'Insufficient purse' });
  if (bidAmount > maxAllowed) return res.status(400).json({ error: `Max bid for remaining slots is ₹${maxAllowed.toLocaleString()}` });
  const increment = getIncrement(auction.currentBid || 0, auction);
  const minBid = auction.currentBidderTeamId
    ? (Number(auction.currentBid) || 0) + increment
    : Math.max(Number(auction.currentBid) || 0, 0);
  const isLastSlot = team.maxPlayers != null && soldForTeam.length >= Number(team.maxPlayers) - 1;
  const isAllIn = bidAmount === team.remainingPurse;
  const beatsCurrent = bidAmount >= Math.max(auction.currentBid, 0);
  if (bidAmount < minBid) {
    if (!((isLastSlot || isAllIn) && beatsCurrent)) {
      return res.status(400).json({ error: `Bid must be at least ₹${minBid.toLocaleString()}`, minBid, increment, maxBid: maxAllowed });
    }
  }
  const bid = addBid({
    id: uuidv4(), auctionId: auction.id, playerId: auction.currentPlayerId,
    teamId: finalTeamId, amount: bidAmount, createdAt: new Date().toISOString()
  });
  const updatedAuction = updateAuction(auction.id, {
    currentBid: bidAmount, currentBidderTeamId: finalTeamId, timerEndsAt: timerEndsAtFor(auction)
  });
  emitAuction(req.app.get('io'), auction.id, 'new-bid', { auction: updatedAuction, bid, team: { id: team.id, name: team.name } });
  res.json({ auction: updatedAuction, bid, increment, maxBid: maxAllowed });
});

router.post('/:id/sell', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player selected' });
  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  let result;
  if (auction.currentBidderTeamId && auction.currentBid > 0) {
    const team = getTeams().find(t => t.id === auction.currentBidderTeamId);
    if (!team) return res.status(400).json({ error: 'Bidding team not found' });
    updateTeam(team.id, { remainingPurse: team.remainingPurse - auction.currentBid });
    updatePlayer(player.id, { status: 'Sold' });
    const sold = addSoldPlayer({
      id: uuidv4(), auctionId: auction.id, playerId: player.id, teamId: team.id,
      soldPrice: auction.currentBid, soldAt: new Date().toISOString()
    });
    result = { status: 'Sold', sold, team, player, price: auction.currentBid };
  } else {
    updatePlayer(player.id, { status: 'Unsold' });
    result = { status: 'Unsold', player };
  }
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null, timerEndsAt: null
  });
  emitAuction(req.app.get('io'), auction.id, 'player-sold', { auction: updatedAuction, result });
  res.json({ auction: updatedAuction, result });
});

router.post('/:id/unsold', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player selected' });
  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  if (player) updatePlayer(player.id, { status: 'Unsold' });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null, timerEndsAt: null
  });
  emitAuction(req.app.get('io'), auction.id, 'player-sold', {
    auction: updatedAuction, result: { status: 'Unsold', player }
  });
  res.json({ auction: updatedAuction, result: { status: 'Unsold', player } });
});

router.post('/:id/undo-last-bid', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const bids = getBids().filter(b => b.auctionId === auction.id && b.playerId === auction.currentPlayerId);
  if (bids.length === 0) return res.status(400).json({ error: 'No bids to undo' });
  bids.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const last = bids[0];
  const data = getData();
  const idx = data.bids.findIndex(b => b.id === last.id);
  if (idx !== -1) data.bids.splice(idx, 1);
  persist();
  const remaining = getBids().filter(b => b.auctionId === auction.id && b.playerId === auction.currentPlayerId);
  remaining.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const prev = remaining[0];
  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  const updated = updateAuction(auction.id, {
    currentBid: prev ? Number(prev.amount) : (player?.basePrice || 0),
    currentBidderTeamId: prev ? prev.teamId : null,
    timerEndsAt: timerEndsAtFor(auction)
  });
  emitAuction(req.app.get('io'), auction.id, 'new-bid', { auction: updated, undo: true });
  res.json({ auction: updated, message: 'Last bid undone' });
});

router.post('/:id/undo-last-sell', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const data = getData();
  const soldList = getSoldPlayers().filter(s => s.auctionId === auction.id);
  if (soldList.length === 0) return res.status(400).json({ error: 'No sold players to undo' });
  soldList.sort((a, b) => new Date(b.soldAt || 0) - new Date(a.soldAt || 0));
  const last = soldList[0];
  const soldIdx = data.soldPlayers.findIndex(s => s.id === last.id);
  if (soldIdx === -1) return res.status(404).json({ error: 'Sold record not found' });
  const team = getTeams().find(t => t.id === last.teamId);
  if (team) updateTeam(team.id, { remainingPurse: team.remainingPurse + last.soldPrice });
  data.soldPlayers.splice(soldIdx, 1);
  persist();
  let player = getPlayers().find(p => p.id === last.playerId);
  if (player) {
    updatePlayer(player.id, { status: 'Approved' });
    player = getPlayers().find(p => p.id === last.playerId);
  }
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: last.playerId,
    currentBid: Number(last.soldPrice) || (player && player.basePrice) || 0,
    currentBidderTeamId: last.teamId,
    timerEndsAt: timerEndsAtFor(auction),
    status: auction.status === 'completed' ? 'live' : auction.status
  });
  const result = { status: 'Undone', player, price: last.soldPrice };
  emitAuction(req.app.get('io'), auction.id, 'player-sold', { auction: updatedAuction, result });
  res.json({ auction: updatedAuction, player, result, message: 'Last sale undone' });
});

router.post('/:id/recall-unsold', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.currentPlayerId) {
    return res.status(400).json({ error: 'Finish current player before recalling unsold' });
  }
  const unsold = getPlayers().filter(p => p.status === 'Unsold');
  if (unsold.length === 0) return res.status(400).json({ error: 'No unsold players' });
  const player = unsold[Math.floor(Math.random() * unsold.length)];
  updatePlayer(player.id, { status: 'Approved' });
  const refreshed = getPlayers().find(p => p.id === player.id);
  const updated = updateAuction(auction.id, {
    currentPlayerId: player.id,
    currentBid: refreshed?.basePrice || 0,
    currentBidderTeamId: null,
    timerEndsAt: timerEndsAtFor(auction),
    status: 'live'
  });
  emitAuction(req.app.get('io'), auction.id, 'player-selected', { auction: updated, player: refreshed });
  res.json({ auction: updated, player: refreshed, remainingUnsold: unsold.length - 1 });
});

router.get('/:id/bids', authMiddleware, (req, res) => {
  res.json(getBids().filter(b => b.auctionId === req.params.id));
});

router.get('/:id/public/bids', (req, res) => {
  const teams = getTeams();
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t.name]));
  const bids = getBids().filter(b => b.auctionId === req.params.id);
  const sorted = bids.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json(sorted.map(b => ({
    id: b.id, amount: Number(b.amount) || 0, teamId: b.teamId,
    teamName: teamMap[b.teamId] || b.teamId, playerId: b.playerId, createdAt: b.createdAt || null
  })));
});

router.get('/:id/sold', authMiddleware, (req, res) => {
  const sold = getSoldPlayers().filter(s => s.auctionId === req.params.id);
  const players = getPlayers();
  const teams = getTeams();
  res.json(sold.map(s => ({ ...s, player: players.find(p => p.id === s.playerId), team: teams.find(t => t.id === s.teamId) })));
});

router.get('/:id/public/sold', (req, res) => {
  const sold = getSoldPlayers().filter(s => s.auctionId === req.params.id);
  const players = getPlayers();
  const teams = getTeams();
  res.json(sold.map(s => ({ ...s, player: players.find(p => p.id === s.playerId), team: teams.find(t => t.id === s.teamId) })));
});

router.get('/:id/unsold-players', authMiddleware, (req, res) => {
  res.json(getPlayers().filter(p => p.status === 'Unsold'));
});

router.get('/:id/available-players', authMiddleware, (req, res) => {
  res.json(getPlayers().filter(p => p.status === 'Approved'));
});

module.exports = router;
