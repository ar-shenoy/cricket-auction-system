const express = require('express');
const { v4: uuidv4 } = require('uuid');
const {
  getAuctions, updateAuction, getPlayers, getTeams, getSoldPlayers
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

/** Time-limited spectator token for public live viewing without login. */
router.post('/:id/spectator-token', authMiddleware, requireRole('admin'), (req, res) => {
  const auction = getAuctions().find(a => a.id === req.params.id);
  if (!auction) return res.status(404).json({ error: 'Auction not found' });
  const hours = Math.min(72, Math.max(1, Number(req.body?.hours) || 24));
  const token = uuidv4().replace(/-/g, '').slice(0, 16);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const tokens = Array.isArray(auction.spectatorTokens) ? [...auction.spectatorTokens] : [];
  tokens.push({ token, expiresAt, createdAt: new Date().toISOString(), createdBy: req.user?.email || null });
  const updated = updateAuction(auction.id, { spectatorTokens: tokens.slice(-8) });
  res.json({
    token,
    expiresAt,
    hours,
    path: `/live?token=${token}`,
    auctionId: updated.id
  });
});

/** Resolve a spectator token → public-safe auction payload (no auth). */
router.get('/public/by-token/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Token required' });
  const now = Date.now();
  const auctions = getAuctions();
  for (const a of auctions) {
    const match = (a.spectatorTokens || []).find(t => t.token === token && new Date(t.expiresAt).getTime() > now);
    if (!match) continue;
    const players = getPlayers();
    const teams = getTeams();
    const sold = getSoldPlayers().filter(s => s.auctionId === a.id).map(s => {
      const pl = players.find(p => p.id === s.playerId);
      const tm = teams.find(t => t.id === s.teamId);
      return {
        id: s.id,
        playerId: s.playerId,
        playerName: pl?.name || s.playerId,
        role: pl?.role || null,
        teamId: s.teamId,
        teamName: tm?.name || s.teamId,
        soldPrice: Number(s.soldPrice) || 0,
        soldAt: s.soldAt
      };
    });
    const currentPlayer = a.currentPlayerId ? players.find(p => p.id === a.currentPlayerId) : null;
    return res.json({
      valid: true,
      expiresAt: match.expiresAt,
      auction: {
        id: a.id,
        name: a.name,
        status: a.status,
        currentBid: a.currentBid,
        currentBidderTeamId: a.currentBidderTeamId,
        currentPlayerId: a.currentPlayerId,
        timerEndsAt: a.timerEndsAt,
        bidTimerSeconds: a.bidTimerSeconds
      },
      currentPlayer: currentPlayer ? {
        id: currentPlayer.id,
        name: currentPlayer.name,
        role: currentPlayer.role,
        photoUrl: currentPlayer.photoUrl || null,
        basePrice: currentPlayer.basePrice
      } : null,
      sold
    });
  }
  return res.status(404).json({ error: 'Invalid or expired token' });
});

module.exports = router;
