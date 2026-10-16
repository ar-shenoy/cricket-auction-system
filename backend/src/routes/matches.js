const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getMatches, addMatch, updateMatch, getTeams } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

function emptyInnings() {
  return {
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0, total: 0 },
    events: []
  };
}

function formatOvers(balls) {
  const o = Math.floor(balls / 6);
  const b = balls % 6;
  return `${o}.${b}`;
}

function enrichMatch(m) {
  if (!m) return null;
  const inn = m.innings === 1 ? m.innings1 : m.innings2;
  const battingName = m.battingSide === 'A' ? m.teamAName : m.teamBName;
  const bowlingName = m.battingSide === 'A' ? m.teamBName : m.teamAName;
  const target = m.innings === 2 ? (m.innings1?.runs || 0) + 1 : null;
  const ballsLeft =
    m.oversLimit != null
      ? Math.max(0, m.oversLimit * 6 - (inn?.balls || 0))
      : null;
  const crr =
    inn && inn.balls > 0 ? ((inn.runs / inn.balls) * 6).toFixed(2) : '0.00';
  let rrr = null;
  if (target != null && ballsLeft != null && ballsLeft > 0) {
    rrr = (((target - (inn?.runs || 0)) / ballsLeft) * 6).toFixed(2);
  }
  const currentOver = Math.floor((inn?.balls || 0) / 6);
  const thisOver = (inn?.events || [])
    .filter(e => e.overIndex === currentOver || (e.overIndex === currentOver - 0))
    .filter(e => e.overIndex === Math.floor(((inn?.balls || 0) - (e.legal ? 1 : 0)) / 6) || e.overIndex === currentOver)
    .slice(-8)
    .map(e => e.label);
  // simpler this-over: last events until 6 legal in current over
  const events = inn?.events || [];
  const labels = [];
  let legalInOver = (inn?.balls || 0) % 6;
  if (legalInOver === 0 && (inn?.balls || 0) > 0) legalInOver = 6;
  // collect from end until we have roughly this over
  for (let i = events.length - 1; i >= 0 && labels.length < 12; i--) {
    labels.unshift(events[i].label);
    if (events[i].legal) {
      legalInOver--;
      if (legalInOver <= 0 && labels.length >= 1) break;
    }
  }
  return {
    ...m,
    display: {
      battingName,
      bowlingName,
      score: `${inn?.runs || 0}/${inn?.wickets || 0}`,
      overs: formatOvers(inn?.balls || 0),
      crr,
      rrr,
      target,
      ballsLeft,
      thisOver: labels
    }
  };
}

function applyEvent(match, eventType, extraRuns = 0) {
  const key = match.innings === 1 ? 'innings1' : 'innings2';
  const inn = { ...match[key], extras: { ...match[key].extras }, events: [...(match[key].events || [])] };

  let runsAdd = 0;
  let legal = true;
  let wicket = false;
  let label = '';

  switch (eventType) {
    case 'dot':
      runsAdd = 0; label = '•'; break;
    case '1':
      runsAdd = 1; label = '1'; break;
    case '2':
      runsAdd = 2; label = '2'; break;
    case '3':
      runsAdd = 3; label = '3'; break;
    case '4':
      runsAdd = 4; label = '4'; break;
    case '6':
      runsAdd = 6; label = '6'; break;
    case 'wicket':
      runsAdd = 0; wicket = true; label = 'W'; break;
    case 'wide':
      runsAdd = 1 + (Number(extraRuns) || 0);
      legal = false;
      inn.extras.wide += runsAdd;
      inn.extras.total += runsAdd;
      label = Number(extraRuns) > 0 ? `Wd+${extraRuns}` : 'Wd';
      break;
    case 'noball':
      runsAdd = 1 + (Number(extraRuns) || 0);
      legal = false;
      inn.extras.noball += runsAdd;
      inn.extras.total += runsAdd;
      label = Number(extraRuns) > 0 ? `Nb+${extraRuns}` : 'Nb';
      break;
    case 'bye':
      runsAdd = Math.max(1, Number(extraRuns) || 1);
      inn.extras.bye += runsAdd;
      inn.extras.total += runsAdd;
      label = `B${runsAdd}`;
      break;
    case 'legbye':
      runsAdd = Math.max(1, Number(extraRuns) || 1);
      inn.extras.legbye += runsAdd;
      inn.extras.total += runsAdd;
      label = `Lb${runsAdd}`;
      break;
    default:
      return { error: 'Unknown event type' };
  }

  const overIndex = Math.floor(inn.balls / 6);
  inn.runs += runsAdd;
  if (wicket) inn.wickets = Math.min(10, inn.wickets + 1);
  if (legal) inn.balls += 1;

  inn.events.push({
    id: uuidv4(),
    type: eventType,
    runs: runsAdd,
    legal,
    wicket,
    label,
    overIndex: legal ? Math.floor((inn.balls - 1) / 6) : overIndex,
    at: new Date().toISOString()
  });

  const updates = { [key]: inn, updatedAt: new Date().toISOString() };
  return { updates };
}

router.get('/', authMiddleware, (req, res) => {
  const list = getMatches()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(enrichMatch);
  res.json(list);
});

router.get('/public/live', (req, res) => {
  const matches = getMatches();
  const live = matches.find(m => m.status === 'live') ||
    matches.find(m => m.status === 'innings_break') ||
    matches.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0];
  if (!live) return res.json(null);
  res.json(enrichMatch(live));
});

router.get('/public/:id', (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  res.json(enrichMatch(m));
});

router.get('/:id', authMiddleware, (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  res.json(enrichMatch(m));
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, teamAName, teamBName, teamAId, teamBId, oversLimit, tossWinner, battingFirst } = req.body;
  if (!teamAName || !teamBName) {
    return res.status(400).json({ error: 'Both team names are required' });
  }
  const limit = oversLimit != null && oversLimit !== '' ? Number(oversLimit) : 20;
  const batFirst = battingFirst === 'B' ? 'B' : 'A';

  const match = addMatch({
    id: uuidv4(),
    name: name || `${teamAName} vs ${teamBName}`,
    teamAName: String(teamAName).trim(),
    teamBName: String(teamBName).trim(),
    teamAId: teamAId || null,
    teamBId: teamBId || null,
    oversLimit: limit,
    tossWinner: tossWinner || batFirst,
    battingSide: batFirst,
    innings: 1,
    status: 'live',
    innings1: emptyInnings(),
    innings2: emptyInnings(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const io = req.app.get('io');
  if (io) io.emit('score-update', enrichMatch(match));

  res.status(201).json(enrichMatch(match));
});

router.post('/:id/event', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  if (m.status === 'completed') return res.status(400).json({ error: 'Match is completed' });

  const { type, extraRuns } = req.body;
  const result = applyEvent(m, type, extraRuns);
  if (result.error) return res.status(400).json({ error: result.error });

  const updated = updateMatch(m.id, { ...result.updates, status: 'live' });
  const enriched = enrichMatch(updated);

  const io = req.app.get('io');
  if (io) {
    io.to(`match-${m.id}`).emit('score-update', enriched);
    io.emit('score-update', enriched);
  }

  res.json(enriched);
});

router.post('/:id/undo', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });

  const key = m.innings === 1 ? 'innings1' : 'innings2';
  const inn = { ...m[key], extras: { ...m[key].extras }, events: [...(m[key].events || [])] };
  if (inn.events.length === 0) return res.status(400).json({ error: 'Nothing to undo' });

  const last = inn.events.pop();
  inn.runs = Math.max(0, inn.runs - (last.runs || 0));
  if (last.wicket) inn.wickets = Math.max(0, inn.wickets - 1);
  if (last.legal) inn.balls = Math.max(0, inn.balls - 1);

  if (last.type === 'wide') {
    inn.extras.wide = Math.max(0, inn.extras.wide - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  } else if (last.type === 'noball') {
    inn.extras.noball = Math.max(0, inn.extras.noball - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  } else if (last.type === 'bye') {
    inn.extras.bye = Math.max(0, inn.extras.bye - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  } else if (last.type === 'legbye') {
    inn.extras.legbye = Math.max(0, inn.extras.legbye - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  }

  const updated = updateMatch(m.id, { [key]: inn, updatedAt: new Date().toISOString() });
  const enriched = enrichMatch(updated);

  const io = req.app.get('io');
  if (io) {
    io.to(`match-${m.id}`).emit('score-update', enriched);
    io.emit('score-update', enriched);
  }

  res.json(enriched);
});

router.post('/:id/end-innings', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });

  if (m.innings === 1) {
    const nextBat = m.battingSide === 'A' ? 'B' : 'A';
    const updated = updateMatch(m.id, {
      innings: 2,
      battingSide: nextBat,
      status: 'live',
      updatedAt: new Date().toISOString()
    });
    const enriched = enrichMatch(updated);
    const io = req.app.get('io');
    if (io) {
      io.to(`match-${m.id}`).emit('score-update', enriched);
      io.emit('score-update', enriched);
    }
    return res.json(enriched);
  }

  const updated = updateMatch(m.id, { status: 'completed', updatedAt: new Date().toISOString() });
  const enriched = enrichMatch(updated);
  const io = req.app.get('io');
  if (io) {
    io.to(`match-${m.id}`).emit('score-update', enriched);
    io.emit('score-update', enriched);
  }
  res.json(enriched);
});

router.post('/:id/complete', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const updated = updateMatch(m.id, { status: 'completed', updatedAt: new Date().toISOString() });
  const enriched = enrichMatch(updated);
  const io = req.app.get('io');
  if (io) {
    io.to(`match-${m.id}`).emit('score-update', enriched);
    io.emit('score-update', enriched);
  }
  res.json(enriched);
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const matches = getMatches();
  const idx = matches.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Match not found' });
  matches.splice(idx, 1);
  const { persist } = require('../data/store');
  persist();
  res.json({ message: 'Match deleted' });
});

module.exports = router;
