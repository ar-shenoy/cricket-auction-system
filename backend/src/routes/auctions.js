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

router.get('/', authMiddleware, (req, res) => {
  res.json(getAuctions());
});

router.get('/active', authMiddleware, (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused') ||
                 auctions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  res.json(active);
});

router.get('/public/active', (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused') ||
                 auctions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  res.json(active);
});

router.get('/:id', authMiddleware, (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  res.json(auction);
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, bidIncrement = 50000, bidTimerSeconds = 20, bidRules } = req.body;
  const blocking = getAuctions().find(a => a.status === 'live' || a.status === 'paused');
  if (blocking) {
    return res.status(400).json({ error: 'There is already an active auction. End it first.' });
  }
  const rules = normalizeBidRules(bidRules);
  const auction = addAuction({
    id: uuidv4(),
    name: name || `Auction ${new Date().toLocaleDateString()}`,
    status: 'draft',
    currentPlayerId: null,
    currentBid: 0,
    currentBidderTeamId: null,
    bidIncrement: Number(bidIncrement) || rules[0]?.increment || 1000,
    bidRules: rules,
    bidTimerSeconds: Number(bidTimerSeconds) || 20,
    timerEndsAt: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  });
  res.status(201).json(auction);
});

router.put('/:id/settings', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status === 'completed') {
    return res.status(400).json({ error: 'Cannot edit a completed auction' });
  }
  if (auction.currentPlayerId && req.body.bidRules) {
    return res.status(400).json({ error: 'Cannot change bid rules while a player is being auctioned.' });
  }
  const updates = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.bidTimerSeconds !== undefined) updates.bidTimerSeconds = Number(req.body.bidTimerSeconds);
  if (req.body.bidRules) {
    updates.bidRules = normalizeBidRules(req.body.bidRules);
    updates.bidIncrement = updates.bidRules[0]?.increment || auction.bidIncrement;
  }
  if (req.body.bidIncrement !== undefined && !req.body.bidRules) {
    updates.bidIncrement = Number(req.body.bidIncrement);
  }
  const updated = updateAuction(auction.id, updates);
  const io = req.app.get('io');
  if (io) io.to(`auction-${auction.id}`).emit('auction-status', updated);
  res.json(updated);
});

router.post('/:id/start', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status === 'live') return res.status(400).json({ error: 'Already live' });
  if (auction.status === 'completed') return res.status(400).json({ error: 'Auction already completed' });
  const updated = updateAuction(auction.id, { status: 'live', startedAt: new Date().toISOString() });
  const io = req.app.get('io');
  if (io) io.to(`auction-${auction.id}`).emit('auction-started', updated);
  res.json(updated);
});

router.post('/:id/pause', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const newStatus = auction.status === 'live' ? 'paused' : 'live';
  const updated = updateAuction(auction.id, {
    status: newStatus,
    timerEndsAt: newStatus === 'paused' ? null : auction.timerEndsAt
  });
  const io = req.app.get('io');
  if (io) io.to(`auction-${auction.id}`).emit('auction-status', updated);
  res.json(updated);
});

router.post('/:id/select-player', authMiddleware, requireRole('admin'), (req, res) => {
  const { playerId } = req.body;
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'live' && auction.status !== 'paused') {
    return res.status(400).json({ error: 'Auction is not live' });
  }
  const player = getPlayers().find(p => p.id === playerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (player.status !== 'Approved') {
    return res.status(400).json({ error: 'Only Approved players can be auctioned' });
  }
  const timerEndsAt = new Date(Date.now() + (auction.bidTimerSeconds * 1000)).toISOString();
  const updated = updateAuction(auction.id, {
    currentPlayerId: playerId,
    currentBid: player.basePrice || 0,
    currentBidderTeamId: null,
    timerEndsAt,
    status: 'live'
  });
  const io = req.app.get('io');
  if (io) io.to(`auction-${auction.id}`).emit('player-selected', { auction: updated, player });
  res.json({ auction: updated, player });
});

router.post('/:id/bid', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'live') return res.status(400).json({ error: 'Auction is not live' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player currently being auctioned' });
  if (req.user.role !== 'team_manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only team managers can place bids' });
  }
  const teamId = req.user.teamId;
  if (!teamId && req.user.role !== 'admin') {
    return res.status(400).json({ error: 'You are not assigned to any team' });
  }
  const finalTeamId = req.body.teamId || teamId;
  if (!finalTeamId) return res.status(400).json({ error: 'Team ID required' });
  const team = getTeams().find(t => t.id === finalTeamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const bidAmount = Number(amount);
  if (isNaN(bidAmount) || bidAmount <= 0) {
    return res.status(400).json({ error: 'Invalid bid amount' });
  }
  const increment = getIncrement(auction.currentBid, auction);
  const minBid = auction.currentBidderTeamId
    ? auction.currentBid + increment
    : Math.max(auction.currentBid, 0);
  if (bidAmount < minBid) {
    return res.status(400).json({
      error: `Bid must be at least ₹${minBid.toLocaleString()} (step +₹${increment.toLocaleString()})`,
      minBid,
      increment
    });
  }
  if (team.remainingPurse < bidAmount) {
    return res.status(400).json({
      error: `Insufficient purse. Remaining: ₹${team.remainingPurse.toLocaleString()}`
    });
  }
  const soldForTeam = getSoldPlayers().filter(s => s.teamId === finalTeamId && s.auctionId === auction.id);
  if (team.maxPlayers != null && soldForTeam.length >= Number(team.maxPlayers)) {
    return res.status(400).json({ error: `Team has reached max players (${team.maxPlayers})` });
  }
  if (team.roleCaps && typeof team.roleCaps === 'object') {
    const player = getPlayers().find(p => p.id === auction.currentPlayerId);
    if (player && team.roleCaps[player.role] != null) {
      const roleCount = soldForTeam.filter(s => {
        const pl = getPlayers().find(p => p.id === s.playerId);
        return pl && pl.role === player.role;
      }).length;
      if (roleCount >= Number(team.roleCaps[player.role])) {
        return res.status(400).json({ error: `Team has reached max ${player.role}s (${team.roleCaps[player.role]})` });
      }
    }
  }
  const bid = addBid({
    id: uuidv4(),
    auctionId: auction.id,
    playerId: auction.currentPlayerId,
    teamId: finalTeamId,
    amount: bidAmount,
    createdAt: new Date().toISOString()
  });
  const timerEndsAt = new Date(Date.now() + (auction.bidTimerSeconds * 1000)).toISOString();
  const updatedAuction = updateAuction(auction.id, {
    currentBid: bidAmount,
    currentBidderTeamId: finalTeamId,
    timerEndsAt
  });
  const io = req.app.get('io');
  if (io) {
    io.to(`auction-${auction.id}`).emit('new-bid', {
      auction: updatedAuction,
      bid,
      team: { id: team.id, name: team.name }
    });
  }
  res.json({ auction: updatedAuction, bid, increment: getIncrement(bidAmount, updatedAuction) });
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
      id: uuidv4(),
      auctionId: auction.id,
      playerId: player.id,
      teamId: team.id,
      soldPrice: auction.currentBid,
      soldAt: new Date().toISOString()
    });
    result = { status: 'Sold', sold, team, player, price: auction.currentBid };
  } else {
    updatePlayer(player.id, { status: 'Unsold' });
    result = { status: 'Unsold', player };
  }
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null,
    currentBid: 0,
    currentBidderTeamId: null,
    timerEndsAt: null
  });
  const io = req.app.get('io');
  if (io) io.to(`auction-${auction.id}`).emit('player-sold', { auction: updatedAuction, result });
  res.json({ auction: updatedAuction, result });
});

router.post('/:id/unsold', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player selected' });
  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  if (player) updatePlayer(player.id, { status: 'Unsold' });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: null,
    currentBid: 0,
    currentBidderTeamId: null,
    timerEndsAt: null
  });
  const io = req.app.get('io');
  if (io) {
    io.to(`auction-${auction.id}`).emit('player-sold', {
      auction: updatedAuction,
      result: { status: 'Unsold', player }
    });
  }
  res.json({ auction: updatedAuction, result: { status: 'Unsold', player } });
});

router.post('/:id/undo-last-sell', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status === 'completed') {
    return res.status(400).json({ error: 'Cannot undo on a completed auction' });
  }
  const soldList = getSoldPlayers().filter(s => s.auctionId === auction.id);
  if (soldList.length === 0) {
    return res.status(400).json({ error: 'No sold players to undo' });
  }
  soldList.sort((a, b) => new Date(b.soldAt) - new Date(a.soldAt));
  const last = soldList[0];
  const data = getData();
  const soldIdx = data.soldPlayers.findIndex(s => s.id === last.id);
  if (soldIdx === -1) return res.status(404).json({ error: 'Sold record not found' });

  const team = getTeams().find(t => t.id === last.teamId);
  if (team) {
    updateTeam(team.id, { remainingPurse: team.remainingPurse + last.soldPrice });
  }
  updatePlayer(last.playerId, { status: 'Approved' });
  data.soldPlayers.splice(soldIdx, 1);
  persist();

  const player = getPlayers().find(p => p.id === last.playerId);
  const result = { status: 'Undone', player, team, price: last.soldPrice };
  const io = req.app.get('io');
  if (io) {
    io.to(`auction-${auction.id}`).emit('player-sold', { auction, result });
  }
  res.json({ message: 'Last sale undone', result });
});

router.post('/:id/end', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const updated = updateAuction(auction.id, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    currentPlayerId: null,
    currentBid: 0,
    currentBidderTeamId: null,
    timerEndsAt: null
  });
  const io = req.app.get('io');
  if (io) io.to(`auction-${auction.id}`).emit('auction-ended', updated);
  res.json(updated);
});

router.get('/:id/bids', authMiddleware, (req, res) => {
  res.json(getBids().filter(b => b.auctionId === req.params.id));
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

router.get('/:id/available-players', authMiddleware, (req, res) => {
  res.json(getPlayers().filter(p => p.status === 'Approved'));
});

module.exports = router;
