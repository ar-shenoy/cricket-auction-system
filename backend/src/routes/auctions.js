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

// ==================== GET ALL AUCTIONS ====================
router.get('/', authMiddleware, (req, res) => {
  res.json(getAuctions());
});

// ==================== GET ACTIVE / LATEST AUCTION ====================
router.get('/active', authMiddleware, (req, res) => {
  const auctions = getAuctions();
  const active = auctions.find(a => a.status === 'live' || a.status === 'paused') ||
                 auctions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  res.json(active);
});

// ==================== GET SINGLE AUCTION ====================
router.get('/:id', authMiddleware, (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  res.json(auction);
});

// ==================== CREATE AUCTION (Admin) ====================
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, bidIncrement = 50000, bidTimerSeconds = 20 } = req.body;

  // Only one live auction at a time for simplicity
  const existingLive = getAuctions().find(a => a.status === 'live' || a.status === 'paused');
  if (existingLive) {
    return res.status(400).json({ error: 'There is already an active auction. End it first.' });
  }

  const auction = addAuction({
    id: uuidv4(),
    name: name || `Auction ${new Date().toLocaleDateString()}`,
    status: 'draft', // draft → live → paused → completed
    currentPlayerId: null,
    currentBid: 0,
    currentBidderTeamId: null,
    bidIncrement: Number(bidIncrement) || 50000,
    bidTimerSeconds: Number(bidTimerSeconds) || 20,
    timerEndsAt: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  });

  res.status(201).json(auction);
});

// ==================== START AUCTION ====================
router.post('/:id/start', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status === 'live') return res.status(400).json({ error: 'Already live' });
  if (auction.status === 'completed') return res.status(400).json({ error: 'Auction already completed' });

  const updated = updateAuction(auction.id, {
    status: 'live',
    startedAt: new Date().toISOString()
  });

  // Notify via socket
  const io = req.app.get('io');
  if (io) io.to(`auction-${auction.id}`).emit('auction-started', updated);

  res.json(updated);
});

// ==================== PAUSE / RESUME ====================
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

// ==================== SELECT NEXT PLAYER ====================
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

  // Reset bidding state for new player
  const timerEndsAt = new Date(Date.now() + (auction.bidTimerSeconds * 1000)).toISOString();

  const updated = updateAuction(auction.id, {
    currentPlayerId: playerId,
    currentBid: player.basePrice || 0,
    currentBidderTeamId: null,
    timerEndsAt,
    status: 'live'
  });

  const io = req.app.get('io');
  if (io) {
    io.to(`auction-${auction.id}`).emit('player-selected', {
      auction: updated,
      player
    });
  }

  res.json({ auction: updated, player });
});

// ==================== PLACE BID (Team Manager) ====================
router.post('/:id/bid', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (auction.status !== 'live') return res.status(400).json({ error: 'Auction is not live' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player currently being auctioned' });

  // Only team managers can bid
  if (req.user.role !== 'team_manager' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only team managers can place bids' });
  }

  const teamId = req.user.teamId;
  if (!teamId && req.user.role !== 'admin') {
    return res.status(400).json({ error: 'You are not assigned to any team' });
  }

  // Admin can bid on behalf of a team if teamId provided
  const finalTeamId = req.body.teamId || teamId;
  if (!finalTeamId) return res.status(400).json({ error: 'Team ID required' });

  const team = getTeams().find(t => t.id === finalTeamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const bidAmount = Number(amount);
  if (isNaN(bidAmount) || bidAmount <= 0) {
    return res.status(400).json({ error: 'Invalid bid amount' });
  }

  // Must be higher than current bid by at least increment (or equal to base if first bid)
  const minBid = auction.currentBidderTeamId
    ? auction.currentBid + auction.bidIncrement
    : Math.max(auction.currentBid, 0);

  if (bidAmount < minBid) {
    return res.status(400).json({
      error: `Bid must be at least ₹${minBid.toLocaleString()}`,
      minBid
    });
  }

  // Purse check
  if (team.remainingPurse < bidAmount) {
    return res.status(400).json({
      error: `Insufficient purse. Remaining: ₹${team.remainingPurse.toLocaleString()}`
    });
  }

  // Record bid
  const bid = addBid({
    id: uuidv4(),
    auctionId: auction.id,
    playerId: auction.currentPlayerId,
    teamId: finalTeamId,
    amount: bidAmount,
    createdAt: new Date().toISOString()
  });

  // Extend timer
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

  res.json({ auction: updatedAuction, bid });
});

// ==================== SELL PLAYER (Force or on timer end) ====================
router.post('/:id/sell', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  if (!auction.currentPlayerId) return res.status(400).json({ error: 'No player selected' });

  const player = getPlayers().find(p => p.id === auction.currentPlayerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  let result;

  if (auction.currentBidderTeamId && auction.currentBid > 0) {
    // SOLD
    const team = getTeams().find(t => t.id === auction.currentBidderTeamId);
    if (!team) return res.status(400).json({ error: 'Bidding team not found' });

    // Deduct purse
    updateTeam(team.id, {
      remainingPurse: team.remainingPurse - auction.currentBid
    });

    // Mark player sold
    updatePlayer(player.id, { status: 'Sold' });

    // Record sold
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
    // UNSOLD (no bids)
    updatePlayer(player.id, { status: 'Unsold' });
    result = { status: 'Unsold', player };
  }

  // Clear current player from auction
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
      result
    });
  }

  res.json({ auction: updatedAuction, result });
});

// ==================== MARK UNSOLD (explicit) ====================
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

// ==================== END AUCTION ====================
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

// ==================== GET BIDS FOR AUCTION ====================
router.get('/:id/bids', authMiddleware, (req, res) => {
  const bids = getBids().filter(b => b.auctionId === req.params.id);
  res.json(bids);
});

// ==================== GET SOLD PLAYERS ====================
router.get('/:id/sold', authMiddleware, (req, res) => {
  const sold = getSoldPlayers().filter(s => s.auctionId === req.params.id);
  // Enrich with player & team names
  const players = getPlayers();
  const teams = getTeams();
  const enriched = sold.map(s => ({
    ...s,
    player: players.find(p => p.id === s.playerId),
    team: teams.find(t => t.id === s.teamId)
  }));
  res.json(enriched);
});

// ==================== GET AVAILABLE PLAYERS FOR AUCTION ====================
router.get('/:id/available-players', authMiddleware, (req, res) => {
  const players = getPlayers().filter(p => p.status === 'Approved');
  res.json(players);
});

module.exports = router;
