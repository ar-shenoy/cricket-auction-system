const {
  getAuctions, updateAuction, getPlayers, updatePlayer,
  getTeams, updateTeam, getSoldPlayers, getBids, persist, addAuditLog
} = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const {
  timerEndsAtFor, emitAuction, appendPurseLog, uuidv4
} = require('./auctions_helpers');

module.exports = function registerAuctionRoutesB(router) {
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
  const price = Number(last.soldPrice || 0);
  let purseLog = auction.purseLog;
  if (team) {
    const beforePurse = Number(team.remainingPurse) || 0;
    const afterPurse = beforePurse + price;
    updateTeam(team.id, { remainingPurse: afterPurse });
    purseLog = appendPurseLog(auction, {
      type: 'undo-sell',
      teamId: team.id,
      teamName: team.name,
      playerId: last.playerId,
      playerName: getPlayers().find(p => p.id === last.playerId)?.name || last.playerId,
      amount: price,
      remainingPurseBefore: beforePurse,
      remainingPurseAfter: afterPurse,
      by: req.user?.email || req.user?.id || null
    });
  }
  const player = getPlayers().find(p => p.id === last.playerId);
  if (player) updatePlayer(player.id, { auctionStatus: null });
  const updatedAuction = updateAuction(auction.id, {
    currentPlayerId: last.playerId,
    currentBid: price,
    currentBidderTeamId: last.teamId,
    timerEndsAt: timerEndsAtFor(auction),
    status: auction.status === 'draft' ? 'live' : auction.status,
    purseLog
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
  let bids = getBids().filter(b => b.auctionId === req.params.id);
  if (req.query.playerId) {
    bids = bids.filter(b => b.playerId === req.query.playerId);
  }
  const teams = getTeams();
  bids = bids
    .slice()
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map(b => ({
      ...b,
      teamName: teams.find(t => t.id === b.teamId)?.name || null
    }));
  res.json(bids);
});

router.get('/:id/public/bids', (req, res) => {
  const bids = getBids().filter(b => b.auctionId === req.params.id);
  const teams = getTeams();
  res.json(bids.map(b => ({
    ...b,
    teamName: teams.find(t => t.id === b.teamId)?.name
  })));
});

/** Full auction session report */
router.get('/:id/report', authMiddleware, (req, res) => {
  try {
    const auction = getAuctions().find(a => a.id === req.params.id);
    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    const players = getPlayers();
    const teams = getTeams();
    const sold = getSoldPlayers().filter(s => s.auctionId === auction.id);
    const bids = getBids().filter(b => b.auctionId === auction.id);

    const soldRows = sold.map(s => {
      const pl = players.find(p => p.id === s.playerId);
      const tm = teams.find(t => t.id === s.teamId);
      return {
        playerId: s.playerId,
        playerName: pl?.name || s.playerName || s.playerId,
        role: pl?.role || s.role || null,
        teamId: s.teamId,
        teamName: tm?.name || s.teamName || s.teamId,
        soldPrice: Number(s.soldPrice) || 0,
        soldAt: s.soldAt || null
      };
    });

    const teamSpend = teams.map(t => {
      const teamSold = soldRows.filter(s => s.teamId === t.id);
      const spent = teamSold.reduce((sum, s) => sum + s.soldPrice, 0);
      return {
        teamId: t.id,
        teamName: t.name,
        players: teamSold.length,
        spent,
        remaining: Number(t.remainingPurse) || 0,
        purse: Number(t.purse) || 0
      };
    });

    const byRole = {};
    for (const s of soldRows) {
      const r = s.role || 'Unknown';
      if (!byRole[r]) byRole[r] = { role: r, count: 0, total: 0 };
      byRole[r].count += 1;
      byRole[r].total += s.soldPrice;
    }
    const roleAverages = Object.values(byRole).map(x => ({
      role: x.role,
      count: x.count,
      total: x.total,
      avg: x.count ? Math.round(x.total / x.count) : 0
    }));

    const unsold = players.filter(p => p.auctionStatus === 'Unsold' && p.status === 'Approved')
      .map(p => ({ id: p.id, name: p.name, role: p.role, basePrice: p.basePrice }));

    const prices = soldRows.map(s => s.soldPrice).sort((a, b) => a - b);
    const median = prices.length
      ? (prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
      : 0;

    res.json({
      auction: {
        id: auction.id,
        name: auction.name,
        status: auction.status,
        pauseReason: auction.pauseReason || null,
        pauseLog: auction.pauseLog || [],
        purseLog: auction.purseLog || []
      },
      summary: {
        soldCount: soldRows.length,
        unsoldCount: unsold.length,
        totalSpend: soldRows.reduce((s, x) => s + x.soldPrice, 0),
        avgPrice: soldRows.length ? Math.round(soldRows.reduce((s, x) => s + x.soldPrice, 0) / soldRows.length) : 0,
        medianPrice: Math.round(median),
        bidCount: bids.length
      },
      sold: soldRows,
      teamSpend,
      roleAverages,
      unsold,
      purseLog: auction.purseLog || []
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Report failed' });
  }
});

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
        basePrice: currentPlayer.basePrice,
        photoUrl: currentPlayer.photoUrl || null
      } : null,
      teams: teams.map(t => ({
        id: t.id,
        name: t.name,
        logoUrl: t.logoUrl || null,
        remainingPurse: t.remainingPurse
      })),
      sold
    });
  }
  res.status(404).json({ error: 'Invalid or expired spectator token' });
});
};
