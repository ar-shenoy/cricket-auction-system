const express = require('express');
const {
  getAuctions, getSoldPlayers, getPlayers, getTeams, getMatches, getBids
} = require('../data/store');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/summary', authMiddleware, (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const sold = getSoldPlayers();
  const auctions = getAuctions();
  const matches = getMatches();
  const bids = getBids();

  const activeAuction = auctions.find(a => a.status === 'live' || a.status === 'paused' || a.status === 'draft') || null;
  const liveMatch = matches.find(m => m.status === 'live' || m.status === 'rain_delay' || m.status === 'super_over') || null;
  const completedMatches = matches.filter(m => m.status === 'completed' || m.status === 'abandoned' || m.status === 'no_result');

  const spendByTeam = teams.map(t => {
    const buys = sold.filter(s => s.teamId === t.id);
    const spent = buys.reduce((s, x) => s + (Number(x.soldPrice) || 0), 0);
    return {
      teamId: t.id,
      name: t.name,
      logoUrl: t.logoUrl || null,
      purse: Number(t.purse) || 0,
      remaining: Number(t.remainingPurse) || 0,
      spent,
      playersBought: buys.length,
      maxPlayers: t.maxPlayers ?? null
    };
  }).sort((a, b) => b.spent - a.spent);

  const topBuys = sold
    .slice()
    .sort((a, b) => (Number(b.soldPrice) || 0) - (Number(a.soldPrice) || 0))
    .slice(0, 8)
    .map(s => {
      const pl = players.find(p => p.id === s.playerId);
      const tm = teams.find(t => t.id === s.teamId);
      return {
        playerName: pl?.name || s.playerId,
        role: pl?.role || null,
        teamName: tm?.name || s.teamId,
        price: Number(s.soldPrice) || 0
      };
    });

  const byRole = {};
  sold.forEach(s => {
    const pl = players.find(p => p.id === s.playerId);
    const role = pl?.role || 'Unknown';
    if (!byRole[role]) byRole[role] = { role, count: 0, spend: 0 };
    byRole[role].count += 1;
    byRole[role].spend += Number(s.soldPrice) || 0;
  });

  const totalPurse = teams.reduce((s, t) => s + (Number(t.purse) || 0), 0);
  const totalSpent = sold.reduce((s, x) => s + (Number(x.soldPrice) || 0), 0);

  res.json({
    generatedAt: new Date().toISOString(),
    counts: {
      teams: teams.length,
      players: players.length,
      approved: players.filter(p => p.status === 'Approved').length,
      sold: sold.length,
      unsold: players.filter(p => p.status === 'Unsold').length,
      matches: matches.length,
      matchesCompleted: completedMatches.length,
      bids: bids.length
    },
    auction: {
      active: activeAuction
        ? { id: activeAuction.id, name: activeAuction.name, status: activeAuction.status }
        : null,
      totalPurse,
      totalSpent,
      remainingPurse: totalPurse - totalSpent,
      spendByTeam,
      topBuys,
      spendByRole: Object.values(byRole).sort((a, b) => b.spend - a.spend)
    },
    match: {
      live: liveMatch
        ? {
            id: liveMatch.id,
            name: liveMatch.name,
            status: liveMatch.status,
            teamAName: liveMatch.teamAName,
            teamBName: liveMatch.teamBName,
            innings: liveMatch.innings,
            scoreA: `${liveMatch.innings1?.runs || 0}/${liveMatch.innings1?.wickets || 0}`,
            scoreB: liveMatch.innings >= 2
              ? `${liveMatch.innings2?.runs || 0}/${liveMatch.innings2?.wickets || 0}`
              : null
          }
        : null,
      recent: matches
        .slice()
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
        .slice(0, 6)
        .map(m => ({
          id: m.id,
          name: m.name,
          status: m.status,
          teamAName: m.teamAName,
          teamBName: m.teamBName,
          result: m.result || null
        }))
    }
  });
});

router.get('/public/pulse', (req, res) => {
  const matches = getMatches();
  const live = matches.find(m => m.status === 'live' || m.status === 'rain_delay' || m.status === 'super_over');
  const auctions = getAuctions();
  const liveAuction = auctions.find(a => a.status === 'live' || a.status === 'paused');
  res.json({
    liveMatch: live
      ? {
          id: live.id,
          name: live.name,
          teamAName: live.teamAName,
          teamBName: live.teamBName,
          status: live.status
        }
      : null,
    liveAuction: liveAuction
      ? { id: liveAuction.id, name: liveAuction.name, status: liveAuction.status }
      : null
  });
});

module.exports = router;
