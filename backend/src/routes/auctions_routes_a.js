const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, addAuction, updateAuction, getPlayers, updatePlayer,
  getTeams, updateTeam, getSoldPlayers, addSoldPlayer, getBids, addBid,
  removeBid, getUsers, persist, getOrgById, addAuditLog
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { fireSoldWebhook: _fireSoldWA, fireUnsoldNotify } = require('./auctions_helpers');

const MIN_SLOT = 1000;
const sellLocks = new Map();

function acquireSellLock(auctionId) {
  const now = Date.now();
  const until = sellLocks.get(auctionId) || 0;
  if (until > now) return false;
  sellLocks.set(auctionId, now + 2500);
  setTimeout(() => { if ((sellLocks.get(auctionId) || 0) <= Date.now()) sellLocks.delete(auctionId); }, 3000);
  return true;
}

function timerEndsAtFor(auction) {
  const secs = Number(auction.bidTimerSeconds);
  if (!secs || secs <= 0) return null;
  const grace = Number(auction.noBidGrace) || 0;
  return new Date(Date.now() + (secs + grace) * 1000).toISOString();
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

function appendPurseLog(auction, entry) {
  const log = Array.isArray(auction.purseLog) ? [...auction.purseLog] : [];
  log.push({ at: new Date().toISOString(), ...entry });
  return log.slice(-500);
}

function fireSoldWebhook(orgId, payload) {
  try { _fireSoldWA(orgId, payload); } catch (_) {}
}

module.exports = function registerAuctionRoutesA(router) {
router.get('/', authMiddleware, (req, res) => {
  res.json(getAuctions());
});

router.get('/active', authMiddleware, (req, res) => {
  const auctions = getAuctions();
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
  const { name, bidIncrement, bidTimerSeconds, bidRules, noBidGrace } = req.body;
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
    noBidGrace: Number(noBidGrace) || 0,
    timerEndsAt: null,
    purseLog: [],
    pauseLog: [],
    spectatorTokens: [],
    orgId: req.user?.orgId || 'org-default',
    createdAt: new Date().toISOString()
  });
  res.status(201).json(auction);
});

router.put('/:id/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const { name, bidIncrement, bidTimerSeconds, bidRules, noBidGrace } = req.body;
  const updates = {};
  if (name != null) updates.name = String(name);
  if (bidIncrement != null) updates.bidIncrement = Number(bidIncrement);
  if (bidTimerSeconds != null) updates.bidTimerSeconds = Number(bidTimerSeconds);
  if (bidRules != null) updates.bidRules = normalizeBidRules(bidRules);
  if (noBidGrace != null) updates.noBidGrace = Number(noBidGrace) || 0;
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
  const reason = (req.body && req.body.reason) ? String(req.body.reason).trim().slice(0, 200) : '';
  const pauseLog = Array.isArray(auction.pauseLog) ? [...auction.pauseLog] : [];
  if (newStatus === 'paused') {
    pauseLog.push({ at: new Date().toISOString(), reason: reason || 'unspecified', by: req.user?.email || req.user?.id || null });
  } else {
    pauseLog.push({ at: new Date().toISOString(), reason: 'resumed', by: req.user?.email || req.user?.id || null });
  }
  const updated = updateAuction(auction.id, {
    status: newStatus,
    timerEndsAt: newStatus === 'paused' ? null : auction.timerEndsAt,
    pauseReason: newStatus === 'paused' ? (reason || 'unspecified') : null,
    pauseLog
  });
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
  if (!acquireSellLock(auction.id)) {
    return res.status(409).json({ error: 'Sell already in progress — wait a moment' });
  }
  const fresh = getAuctions().find(a => a.id === auction.id);
  if (!fresh || !fresh.currentPlayerId || !fresh.currentBidderTeamId) {
    return res.status(400).json({ error: 'Player already processed' });
  }
  const player = getPlayers().find(p => p.id === fresh.currentPlayerId);
  const team = getTeams().find(t => t.id === fresh.currentBidderTeamId);
  if (!player || !team) return res.status(400).json({ error: 'Invalid player/team' });
  if (getSoldPlayers().some(s => s.auctionId === fresh.id && s.playerId === player.id)) {
    return res.status(409).json({ error: 'Player already sold' });
  }
  const price = Number(fresh.currentBid) || 0;
  const beforePurse = Number(team.remainingPurse) || 0;
  const afterPurse = Math.max(0, beforePurse - price);
  const sold = addSoldPlayer({
    id: uuidv4(),
    auctionId: fresh.id,
    playerId: player.id,
    teamId: team.id,
    soldPrice: price,
    soldAt: new Date().toISOString()
  });
  updateTeam(team.id, { remainingPurse: afterPurse });
  updatePlayer(player.id, { auctionStatus: 'Sold' });
  const purseLog = appendPurseLog(fresh, {
    type: 'sell',
    teamId: team.id,
    teamName: team.name,
    playerId: player.id,
    playerName: player.name,
    amount: -price,
    remainingPurseBefore: beforePurse,
    remainingPurseAfter: afterPurse,
    by: req.user?.email || req.user?.id || null
  });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null, timerEndsAt: null,
    purseLog
  });
  const result = { status: 'Sold', player, team, price, sold };
  emitAuction(req.app.get('io'), auction.id, 'player-sold', { auction: updatedAuction, result });
  fireSoldWebhook(fresh.orgId || req.user?.orgId, {
    auctionId: fresh.id,
    auctionName: fresh.name,
    player: { id: player.id, name: player.name, role: player.role },
    team: { id: team.id, name: team.name },
    price,
    remainingPurse: afterPurse
  });
  try {
    addAuditLog({
      orgId: fresh.orgId || req.user?.orgId,
      action: 'auction.sell',
      by: req.user?.email || req.user?.id,
      detail: `${player.name} → ${team.name} @ ${price}`,
      meta: { playerId: player.id, teamId: team.id, price, auctionId: fresh.id }
    });
  } catch (_) {}
  res.json({ auction: updatedAuction, result });
});

router.post('/:id/unsold', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player' });
  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  if (player) updatePlayer(player.id, { auctionStatus: 'Unsold' });
  const purseLog = appendPurseLog(auction, {
    type: 'unsold',
    playerId: player?.id,
    playerName: player?.name,
    amount: 0,
    by: req.user?.email || req.user?.id || null
  });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null, currentBid: 0, currentBidderTeamId: null, timerEndsAt: null, purseLog
  });
  emitAuction(req.app.get('io'), auction.id, 'player-sold', {
    auction: updatedAuction,
    result: { status: 'Unsold', player, price: 0 }
  });
  try {
    fireUnsoldNotify(auction.orgId || req.user?.orgId, {
      auctionId: auction.id,
      auctionName: auction.name,
      player: player ? { id: player.id, name: player.name, role: player.role } : null
    });
  } catch (_) {}
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
};
