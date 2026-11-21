const express = require('express');
const { getTeams } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

router.post('/fixtures/generate', authMiddleware, requireRole('admin'), (req, res) => {
  const teams = getTeams();
  let list = [];
  if (Array.isArray(req.body.teamIds) && req.body.teamIds.length >= 2) {
    list = req.body.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean);
  } else if (Array.isArray(req.body.teamNames) && req.body.teamNames.length >= 2) {
    list = req.body.teamNames.map(n => ({ name: String(n).trim() })).filter(t => t.name);
  } else {
    list = teams.slice();
  }
  if (list.length < 2) return res.status(400).json({ error: 'Need at least 2 teams' });
  const venue = req.body.venue || null;
  const startDate = req.body.startDate ? new Date(req.body.startDate) : new Date();
  if (Number.isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid startDate' });
  const n = list.length;
  const arr = list.map(t => ({ id: t.id || null, name: t.name }));
  if (n % 2 === 1) arr.push({ id: null, name: 'BYE' });
  const total = arr.length;
  const rounds = total - 1;
  const half = total / 2;
  const fixtures = [];
  const rotating = arr.slice(1);
  for (let r = 0; r < rounds; r++) {
    const roundTeams = [arr[0], ...rotating];
    for (let i = 0; i < half; i++) {
      const home = roundTeams[i];
      const away = roundTeams[total - 1 - i];
      if (home.name === 'BYE' || away.name === 'BYE') continue;
      const day = new Date(startDate.getTime() + r * 24 * 3600 * 1000);
      fixtures.push({
        round: r + 1,
        date: day.toISOString().slice(0, 10),
        teamAId: home.id,
        teamAName: home.name,
        teamBId: away.id,
        teamBName: away.name,
        venue,
        status: 'scheduled'
      });
    }
    rotating.unshift(rotating.pop());
  }
  res.json({ generatedAt: new Date().toISOString(), teamCount: list.length, matchCount: fixtures.length, fixtures });
});

module.exports = router;
