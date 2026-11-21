const express = require('express');
const {
  getAuctions,
  getSoldPlayers,
  getPlayers,
  getTeams,
  getMatches,
  getBids
} = require('../data/store');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

/** Intelligence — market flags + team efficiency + if-ended-now */
router.get('/intelligence', authMiddleware, (req, res) => {
  try {
    const teams = getTeams();
    const players = getPlayers();
    const sold = getSoldPlayers();
    const matches = getMatches();
    const auctions = getAuctions();
    const active =
      auctions.find(a => a.status === 'live' || a.status === 'paused') ||
      auctions.find(a => a.status === 'draft') ||
      null;

    const prices = sold.map(s => Number(s.soldPrice) || 0).filter(n => n > 0);
    const totalSpend = prices.reduce((a, b) => a + b, 0);
    const avgPrice = prices.length ? Math.round(totalSpend / prices.length) : 0;
    const sorted = prices.slice().sort((a, b) => a - b);
    const medianPrice = sorted.length
      ? sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : 0;

    const roleBuckets = {};
    sold.forEach(s => {
      const pl = players.find(p => p.id === s.playerId);
      const role = pl?.role || 'Unknown';
      if (!roleBuckets[role]) roleBuckets[role] = [];
      roleBuckets[role].push(Number(s.soldPrice) || 0);
    });

    const roleInflation = Object.entries(roleBuckets)
      .map(([role, arr]) => {
        const avg = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
        return {
          role,
          count: arr.length,
          avgPrice: avg,
          vsMarket: avgPrice ? Math.round(((avg - avgPrice) / avgPrice) * 1000) / 10 : 0,
          maxPrice: arr.length ? Math.max(...arr) : 0
        };
      })
      .sort((a, b) => b.avgPrice - a.avgPrice);

    const lastSale = sold
      .slice()
      .sort((a, b) => new Date(b.soldAt || 0).getTime() - new Date(a.soldAt || 0).getTime())[0];
    const sinceLastSaleMs = lastSale?.soldAt
      ? Date.now() - new Date(lastSale.soldAt).getTime()
      : null;

    const marketValues = sold
      .map(s => {
        const pl = players.find(p => p.id === s.playerId);
        const tm = teams.find(t => t.id === s.teamId);
        const price = Number(s.soldPrice) || 0;
        const role = pl?.role || 'Unknown';
        const roleAvg = roleBuckets[role]
          ? Math.round(roleBuckets[role].reduce((a, b) => a + b, 0) / roleBuckets[role].length)
          : avgPrice;
        const premium = roleAvg ? Math.round(((price - roleAvg) / roleAvg) * 1000) / 10 : 0;
        return {
          playerId: s.playerId,
          playerName: pl?.name || s.playerId,
          role,
          teamId: s.teamId,
          teamName: tm?.name || s.teamId,
          soldPrice: price,
          roleAvgPrice: roleAvg,
          premiumPct: premium,
          marketFlag: premium > 25 ? 'overpay' : premium < -25 ? 'value' : 'fair',
          soldAt: s.soldAt || null
        };
      })
      .sort((a, b) => b.soldPrice - a.soldPrice);

    const approvedLeft = players.filter(
      p => p.status === 'Approved' && !sold.some(s => s.playerId === p.id)
    );
    const teamEfficiency = teams
      .map(t => {
        const buys = sold.filter(s => s.teamId === t.id);
        const spent = buys.reduce((a, x) => a + (Number(x.soldPrice) || 0), 0);
        const remaining =
          Number(t.remainingPurse) != null ? Number(t.remainingPurse) : Number(t.purse) - spent;
        const maxP = t.maxPlayers != null ? Number(t.maxPlayers) : 11;
        const slotsFilled = buys.length;
        const slotsLeft = Math.max(0, maxP - slotsFilled);
        const avgPerSlot = slotsFilled ? Math.round(spent / slotsFilled) : 0;
        const budgetPerRemainingSlot =
          slotsLeft > 0 ? Math.round(remaining / slotsLeft) : remaining;
        return {
          teamId: t.id,
          teamName: t.name,
          purse: Number(t.purse) || 0,
          remaining,
          spent,
          slotsFilled,
          slotsLeft,
          maxPlayers: maxP,
          avgPerSlot,
          budgetPerRemainingSlot
        };
      })
      .sort((a, b) => b.spent - a.spent);

    const totalRemainingPurse = teams.reduce(
      (a, t) => a + (Number(t.remainingPurse) != null ? Number(t.remainingPurse) : 0),
      0
    );
    const remainingSlots = teamEfficiency.reduce((a, t) => a + t.slotsLeft, 0);
    const ifEndedNow = {
      soldCount: sold.length,
      remainingApproved: approvedLeft.length,
      totalRemainingPurse,
      remainingSlots,
      avgPursePerRemainingSlot:
        remainingSlots > 0 ? Math.round(totalRemainingPurse / remainingSlots) : totalRemainingPurse,
      note:
        remainingSlots > 0
          ? `~₹${Math.round(totalRemainingPurse / remainingSlots).toLocaleString('en-IN')} left per open slot across franchises`
          : 'All squad slots filled or no maxPlayers set'
    };

    res.json({
      generatedAt: new Date().toISOString(),
      auction: active
        ? { id: active.id, name: active.name, status: active.status }
        : null,
      sinceLastSale: {
        ms: sinceLastSaleMs,
        playerName: lastSale
          ? players.find(p => p.id === lastSale.playerId)?.name || lastSale.playerId
          : null,
        price: lastSale ? Number(lastSale.soldPrice) || 0 : null,
        at: lastSale?.soldAt || null
      },
      market: {
        soldCount: sold.length,
        avgPrice,
        medianPrice,
        totalSpend
      },
      roleInflation,
      marketValues: marketValues.slice(0, 50),
      teamEfficiency,
      ifEndedNow,
      impact: { batters: [], bowlers: [] }
    });
  } catch (err) {
    console.error('intelligence error', err);
    res.status(500).json({ error: 'Intelligence failed' });
  }
});

router.get('/summary', authMiddleware, (req, res) => {
  const teams = getTeams();
  const players = getPlayers();
  const sold = getSoldPlayers();
  const auctions = getAuctions();
  const matches = getMatches();
  res.json({
    teams: teams.length,
    players: players.length,
    sold: sold.length,
    auctions: auctions.length,
    matches: matches.length,
    bids: getBids().length
  });
});

router.get('/performance-vs-price', authMiddleware, (req, res) => {
  try {
    const players = getPlayers();
    const sold = getSoldPlayers();
    const matches = getMatches();
    const priceByName = {};
    sold.forEach(s => {
      const pl = players.find(p => p.id === s.playerId);
      if (!pl) return;
      priceByName[String(pl.name).toLowerCase()] = Number(s.soldPrice) || 0;
    });
    const bat = {};
    const bowl = {};
    matches.forEach(m => {
      [m.innings1, m.innings2].forEach(inn => {
        if (!inn) return;
        const batters = inn.batters ? Object.values(inn.batters) : inn.batting || [];
        batters.forEach(b => {
          const key = String(b.name || '').toLowerCase();
          if (!key) return;
          if (!bat[key]) bat[key] = { name: b.name, runs: 0, balls: 0 };
          bat[key].runs += Number(b.runs) || 0;
          bat[key].balls += Number(b.balls) || 0;
        });
        const bowlers = inn.bowlers ? Object.values(inn.bowlers) : inn.bowling || [];
        bowlers.forEach(b => {
          const key = String(b.name || '').toLowerCase();
          if (!key) return;
          if (!bowl[key]) bowl[key] = { name: b.name, wickets: 0, runs: 0, balls: 0 };
          bowl[key].wickets += Number(b.wickets) || 0;
          bowl[key].runs += Number(b.runs) || 0;
        });
      });
    });
    const batRows = Object.entries(bat)
      .filter(([k]) => priceByName[k] > 0)
      .map(([k, v]) => ({
        name: v.name,
        soldPrice: priceByName[k],
        runs: v.runs,
        balls: v.balls,
        runsPerLakh: priceByName[k]
          ? Math.round((v.runs / priceByName[k]) * 100000 * 10) / 10
          : null
      }))
      .sort((a, b) => (b.runsPerLakh || 0) - (a.runsPerLakh || 0));
    const bowlRows = Object.entries(bowl)
      .filter(([k]) => priceByName[k] > 0)
      .map(([k, v]) => ({
        name: v.name,
        soldPrice: priceByName[k],
        wickets: v.wickets,
        runs: v.runs,
        wicketsPerLakh: priceByName[k]
          ? Math.round((v.wickets / priceByName[k]) * 100000 * 100) / 100
          : null
      }))
      .sort((a, b) => (b.wicketsPerLakh || 0) - (a.wicketsPerLakh || 0));
    res.json({
      generatedAt: new Date().toISOString(),
      batters: batRows.slice(0, 30),
      bowlers: bowlRows.slice(0, 30),
      note: 'Only players with both auction price and match stats.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Performance report failed' });
  }
});

router.get('/compare-auctions', authMiddleware, (req, res) => {
  const aId = req.query.a;
  const bId = req.query.b;
  if (!aId || !bId) return res.status(400).json({ error: 'Query a and b (auction ids) required' });
  const auctions = getAuctions();
  const sold = getSoldPlayers();
  const players = getPlayers();
  const teams = getTeams();
  function pack(id) {
    const auction = auctions.find(x => x.id === id);
    if (!auction) return null;
    const rows = sold.filter(s => s.auctionId === id);
    const spend = rows.reduce((s, x) => s + (Number(x.soldPrice) || 0), 0);
    const prices = rows.map(s => Number(s.soldPrice) || 0).filter(n => n > 0);
    const avg = prices.length ? Math.round(spend / prices.length) : 0;
    return {
      id: auction.id,
      name: auction.name,
      status: auction.status,
      soldCount: rows.length,
      totalSpend: spend,
      avgPrice: avg,
      topBuys: rows
        .slice()
        .sort((x, y) => (Number(y.soldPrice) || 0) - (Number(x.soldPrice) || 0))
        .slice(0, 8)
        .map(s => {
          const pl = players.find(p => p.id === s.playerId);
          const tm = teams.find(t => t.id === s.teamId);
          return {
            playerName: pl?.name || s.playerId,
            teamName: tm?.name || s.teamId,
            price: Number(s.soldPrice) || 0
          };
        })
    };
  }
  const A = pack(aId);
  const B = pack(bId);
  if (!A || !B) return res.status(404).json({ error: 'Auction not found' });
  res.json({
    generatedAt: new Date().toISOString(),
    a: A,
    b: B,
    delta: {
      soldCount: A.soldCount - B.soldCount,
      totalSpend: A.totalSpend - B.totalSpend,
      avgPrice: A.avgPrice - B.avgPrice
    }
  });
});

module.exports = router;
