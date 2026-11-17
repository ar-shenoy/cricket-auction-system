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

router.get('/intelligence', authMiddleware, (req, res) => {
  try {
    const teams = getTeams() || [];
    const players = getPlayers() || [];
    const sold = getSoldPlayers() || [];
    const matches = getMatches() || [];

    const prices = sold
      .map(s => Number(s.soldPrice) || 0)
      .filter(n => n > 0)
      .sort((a, b) => a - b);

    const totalSpend = prices.reduce((a, b) => a + b, 0);
    const soldCount = sold.length;
    const avgPrice = soldCount ? Math.round(totalSpend / soldCount) : 0;
    const medianPrice = prices.length
      ? (prices.length % 2
          ? prices[(prices.length - 1) / 2]
          : Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2))
      : 0;

    const roleBuckets = {};
    sold.forEach(s => {
      const pl = players.find(p => p.id === s.playerId);
      const role = (pl?.role || s.role || 'Unknown').trim() || 'Unknown';
      if (!roleBuckets[role]) roleBuckets[role] = { role, count: 0, spend: 0 };
      roleBuckets[role].count += 1;
      roleBuckets[role].spend += Number(s.soldPrice) || 0;
    });

    const roleInflationRaw = Object.values(roleBuckets).map(r => ({
      role: r.role,
      count: r.count,
      spend: r.spend,
      avgPrice: r.count ? Math.round(r.spend / r.count) : 0
    }));
    const roleInflation = roleInflationRaw
      .map(r => ({
        ...r,
        vsMarket: avgPrice ? Math.round(((r.avgPrice - avgPrice) / avgPrice) * 100) : 0
      }))
      .sort((a, b) => b.avgPrice - a.avgPrice);

    const roleAvgMap = {};
    roleInflation.forEach(r => { roleAvgMap[r.role] = r.avgPrice; });

    const marketValues = sold
      .map(s => {
        const pl = players.find(p => p.id === s.playerId);
        const tm = teams.find(t => t.id === s.teamId);
        const role = (pl?.role || s.role || 'Unknown').trim() || 'Unknown';
        const soldPrice = Number(s.soldPrice) || 0;
        const roleAvgPrice = roleAvgMap[role] || avgPrice || 0;
        const premiumPct = roleAvgPrice
          ? Math.round(((soldPrice - roleAvgPrice) / roleAvgPrice) * 100)
          : 0;
        let marketFlag = 'fair';
        if (premiumPct >= 20) marketFlag = 'overpay';
        else if (premiumPct <= -15) marketFlag = 'value';
        return {
          playerId: s.playerId,
          playerName: pl?.name || s.playerName || s.playerId,
          role,
          teamId: s.teamId,
          teamName: tm?.name || s.teamName || s.teamId,
          soldPrice,
          roleAvgPrice,
          premiumPct,
          marketFlag
        };
      })
      .sort((a, b) => b.soldPrice - a.soldPrice);

    const batters = [];
    const bowlers = [];
    matches.forEach(m => {
      const label = m.name || `${m.teamAName} vs ${m.teamBName}`;
      const cards = [];
      if (m.innings1?.battingCard) cards.push(...m.innings1.battingCard.map(x => ({ ...x, match: label })));
      if (m.innings2?.battingCard) cards.push(...m.innings2.battingCard.map(x => ({ ...x, match: label })));
      if (m.display?.battingCard) cards.push(...m.display.battingCard.map(x => ({ ...x, match: label })));
      cards.forEach(b => {
        if (!b?.name) return;
        batters.push({
          name: b.name,
          match: b.match || label,
          runs: Number(b.runs) || 0,
          balls: Number(b.balls) || 0,
          sr: b.balls ? Math.round((Number(b.runs) || 0) / Number(b.balls) * 100) : 0
        });
      });
      const bowlCards = [];
      if (m.innings1?.bowlingCard) bowlCards.push(...m.innings1.bowlingCard.map(x => ({ ...x, match: label })));
      if (m.innings2?.bowlingCard) bowlCards.push(...m.innings2.bowlingCard.map(x => ({ ...x, match: label })));
      if (m.display?.bowlingCard) bowlCards.push(...m.display.bowlingCard.map(x => ({ ...x, match: label })));
      bowlCards.forEach(b => {
        if (!b?.name) return;
        bowlers.push({
          name: b.name,
          match: b.match || label,
          wickets: Number(b.wickets) || 0,
          runs: Number(b.runs) || 0
        });
      });
    });

    batters.sort((a, b) => b.runs - a.runs);
    bowlers.sort((a, b) => b.wickets - a.wickets || a.runs - b.runs);

    res.json({
      generatedAt: new Date().toISOString(),
      market: {
        soldCount,
        avgPrice,
        medianPrice,
        totalSpend
      },
      roleInflation,
      marketValues,
      impact: {
        batters: batters.slice(0, 12),
        bowlers: bowlers.slice(0, 12)
      }
    });
  } catch (err) {
    console.error('intelligence error', err);
    res.status(500).json({ error: 'Failed to compute intelligence' });
  }
});

module.exports = router;
