const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getMatches, addMatch, updateMatch, getTeams } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const DISMISSAL_TYPES = [
  'bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired_hurt'
];

function emptyInnings() {
  return {
    runs: 0,
    wickets: 0,
    balls: 0,
    extras: { wide: 0, noball: 0, bye: 0, legbye: 0, penalty: 0, total: 0 },
    events: [],
    freeHit: false,
    powerplayEndOver: null
  };
}

function formatOvers(balls) {
  const o = Math.floor((balls || 0) / 6);
  const b = (balls || 0) % 6;
  return `${o}.${b}`;
}

function dlsTarget(firstRuns, fullOvers, revisedOvers) {
  if (!fullOvers || fullOvers <= 0 || revisedOvers == null) return null;
  if (revisedOvers >= fullOvers) return firstRuns + 1;
  const scaled = Math.ceil((firstRuns * revisedOvers) / fullOvers);
  return Math.max(1, scaled + 1);
}

function thisOverLabels(inn) {
  const events = inn?.events || [];
  const labels = [];
  let legalNeeded = (inn?.balls || 0) % 6;
  if (legalNeeded === 0 && (inn?.balls || 0) > 0) legalNeeded = 6;
  for (let i = events.length - 1; i >= 0 && labels.length < 14; i--) {
    labels.unshift(events[i].label);
    if (events[i].legal) {
      legalNeeded--;
      if (legalNeeded <= 0) break;
    }
  }
  return labels;
}

function enrichMatch(m) {
  if (!m) return null;
  const inn = m.innings === 1 ? m.innings1 : m.innings2;
  const battingName = m.battingSide === 'A' ? m.teamAName : m.teamBName;
  const bowlingName = m.battingSide === 'A' ? m.teamBName : m.teamAName;

  const fullOvers = Number(m.oversLimit) || 20;
  const revisedOvers = m.revisedOvers != null ? Number(m.revisedOvers) : fullOvers;
  const effectiveOvers = m.innings === 2 && m.revisedOvers != null ? revisedOvers : fullOvers;

  let target = null;
  if (m.innings === 2) {
    if (m.dlsTarget != null) target = Number(m.dlsTarget);
    else if (m.revisedOvers != null) target = dlsTarget(m.innings1?.runs || 0, fullOvers, revisedOvers);
    else target = (m.innings1?.runs || 0) + 1;
  }

  const ballsLeft =
    effectiveOvers != null
      ? Math.max(0, Math.round(effectiveOvers * 6) - (inn?.balls || 0))
      : null;

  const crr =
    inn && inn.balls > 0 ? ((inn.runs / inn.balls) * 6).toFixed(2) : '0.00';
  let rrr = null;
  if (target != null && ballsLeft != null && ballsLeft > 0) {
    rrr = (((target - (inn?.runs || 0)) / ballsLeft) * 6).toFixed(2);
  } else if (target != null && ballsLeft === 0) {
    rrr = '—';
  }

  const currentOver = Math.floor((inn?.balls || 0) / 6) + 1;
  const ppEnd = Number(m.powerplayOvers) || 6;
  const inPowerplay = m.status === 'live' && currentOver <= ppEnd;

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
      thisOver: thisOverLabels(inn),
      freeHit: !!(inn?.freeHit),
      inPowerplay,
      powerplayOvers: ppEnd,
      currentOver,
      matchStatus: m.status,
      rainDelay: m.status === 'rain_delay',
      abandoned: m.status === 'abandoned',
      superOver: !!m.superOver,
      revisedOvers: m.revisedOvers != null ? revisedOvers : null,
      dlsTarget: m.dlsTarget != null ? Number(m.dlsTarget) : null,
      resultText: m.result || null
    }
  };
}

function emitScore(req, enriched) {
  const io = req.app.get('io');
  if (!io || !enriched) return;
  io.to(`match-${enriched.id}`).emit('score-update', enriched);
  io.emit('score-update', enriched);
}

function requireLive(m, res) {
  if (!m) {
    res.status(404).json({ error: 'Match not found' });
    return false;
  }
  if (m.status === 'abandoned') {
    res.status(400).json({ error: 'Match abandoned' });
    return false;
  }
  if (m.status === 'completed') {
    res.status(400).json({ error: 'Match completed' });
    return false;
  }
  if (m.status === 'rain_delay') {
    res.status(400).json({ error: 'Match on rain delay — resume first' });
    return false;
  }
  if (m.status !== 'live' && m.status !== 'super_over') {
    res.status(400).json({ error: `Match is ${m.status}` });
    return false;
  }
  return true;
}

router.get('/', authMiddleware, (req, res) => {
  const list = getMatches()
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .map(enrichMatch);
  res.json(list);
});

router.get('/public/live', (req, res) => {
  const all = getMatches();
  const live =
    all.find(m => m.status === 'live' || m.status === 'rain_delay' || m.status === 'super_over') ||
    all.find(m => m.status === 'innings_break') ||
    all.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] ||
    null;
  res.json(enrichMatch(live));
});

router.get('/:id', authMiddleware, (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  res.json(enrichMatch(m));
});

router.get('/:id/public', (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  res.json(enrichMatch(m));
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  const {
    name,
    teamAName,
    teamBName,
    teamAId,
    teamBId,
    oversLimit = 20,
    battingFirst = 'A',
    powerplayOvers = 6
  } = req.body;

  if (!teamAName || !teamBName) {
    return res.status(400).json({ error: 'teamAName and teamBName required' });
  }

  const match = addMatch({
    id: uuidv4(),
    name: name || `${teamAName} vs ${teamBName}`,
    teamAName: String(teamAName).trim(),
    teamBName: String(teamBName).trim(),
    teamAId: teamAId || null,
    teamBId: teamBId || null,
    oversLimit: Number(oversLimit) || 20,
    powerplayOvers: Number(powerplayOvers) || 6,
    battingSide: battingFirst === 'B' ? 'B' : 'A',
    innings: 1,
    status: 'live',
    innings1: emptyInnings(),
    innings2: emptyInnings(),
    revisedOvers: null,
    dlsTarget: null,
    superOver: false,
    result: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  res.status(201).json(enrichMatch(match));
});

router.post('/:id/event', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!requireLive(m, res)) return;

  const key = m.innings === 1 ? 'innings1' : 'innings2';
  const inn = { ...(m[key] || emptyInnings()), extras: { ...(m[key]?.extras || emptyInnings().extras) } };
  if (!Array.isArray(inn.events)) inn.events = [];

  const type = String(req.body.type || '').toLowerCase();
  let runsAdd = Number(req.body.runs);
  if (isNaN(runsAdd)) runsAdd = 0;

  let legal = false;
  let wicket = false;
  let label = '';
  let freeHitNext = !!inn.freeHit;
  let consumeFreeHit = false;
  const dismissal = req.body.dismissal ? String(req.body.dismissal).toLowerCase() : null;

  switch (type) {
    case 'run':
    case 'runs':
      runsAdd = Math.max(0, runsAdd || 0);
      legal = true;
      label = String(runsAdd);
      if (inn.freeHit) consumeFreeHit = true;
      break;
    case 'four':
      runsAdd = 4;
      legal = true;
      label = '4';
      if (inn.freeHit) consumeFreeHit = true;
      break;
    case 'six':
      runsAdd = 6;
      legal = true;
      label = '6';
      if (inn.freeHit) consumeFreeHit = true;
      break;
    case 'wicket': {
      const d = dismissal && DISMISSAL_TYPES.includes(dismissal) ? dismissal : 'bowled';
      if (inn.freeHit && d !== 'run_out') {
        return res.status(400).json({
          error: 'Free hit: only run-out can dismiss. Use run-out or score runs.'
        });
      }
      runsAdd = Math.max(0, runsAdd || 0);
      legal = true;
      wicket = true;
      label = d === 'run_out' ? (runsAdd ? `W+${runsAdd}` : 'W(ro)') : d === 'retired_hurt' ? 'RH' : 'W';
      consumeFreeHit = true;
      break;
    }
    case 'wide':
      runsAdd = Math.max(1, runsAdd || 1);
      legal = false;
      label = runsAdd > 1 ? `Wd+${runsAdd - 1}` : 'Wd';
      inn.extras.wide += runsAdd;
      inn.extras.total += runsAdd;
      break;
    case 'noball':
    case 'no_ball':
      runsAdd = Math.max(1, runsAdd || 1);
      legal = false;
      label = runsAdd > 1 ? `Nb+${runsAdd - 1}` : 'Nb';
      inn.extras.noball += runsAdd;
      inn.extras.total += runsAdd;
      freeHitNext = true;
      break;
    case 'bye':
      runsAdd = Math.max(1, runsAdd || 1);
      legal = true;
      label = runsAdd > 1 ? `B${runsAdd}` : 'B';
      inn.extras.bye += runsAdd;
      inn.extras.total += runsAdd;
      if (inn.freeHit) consumeFreeHit = true;
      break;
    case 'legbye':
    case 'leg_bye':
      runsAdd = Math.max(1, runsAdd || 1);
      legal = true;
      label = runsAdd > 1 ? `Lb${runsAdd}` : 'Lb';
      inn.extras.legbye += runsAdd;
      inn.extras.total += runsAdd;
      if (inn.freeHit) consumeFreeHit = true;
      break;
    case 'dead_ball':
      runsAdd = 0;
      legal = false;
      label = 'DB';
      break;
    case 'penalty':
      runsAdd = Math.max(1, runsAdd || 5);
      legal = false;
      label = `P${runsAdd}`;
      inn.extras.penalty = (inn.extras.penalty || 0) + runsAdd;
      inn.extras.total += runsAdd;
      break;
    default:
      return res.status(400).json({
        error: 'Unknown event type. Use: run, four, six, wicket, wide, noball, bye, legbye, dead_ball, penalty'
      });
  }

  if (type !== 'dead_ball') {
    inn.runs += runsAdd;
  }

  if (legal) inn.balls += 1;
  if (wicket) inn.wickets = Math.min(10, inn.wickets + 1);

  if (consumeFreeHit) freeHitNext = false;
  inn.freeHit = freeHitNext;

  const overIndex = Math.floor(Math.max(0, inn.balls - (legal ? 1 : 0)) / 6);
  inn.events.push({
    id: uuidv4(),
    type,
    runs: runsAdd,
    legal,
    wicket,
    dismissal: wicket ? (dismissal || 'bowled') : null,
    label,
    freeHit: !!m[key]?.freeHit,
    overIndex,
    at: new Date().toISOString()
  });

  const updated = updateMatch(m.id, { [key]: inn, updatedAt: new Date().toISOString() });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/undo', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  if (m.status === 'completed' || m.status === 'abandoned') {
    return res.status(400).json({ error: 'Cannot undo on completed/abandoned match' });
  }

  const key = m.innings === 1 ? 'innings1' : 'innings2';
  const inn = { ...(m[key] || emptyInnings()), extras: { ...(m[key]?.extras || emptyInnings().extras) } };
  if (!inn.events || inn.events.length === 0) {
    return res.status(400).json({ error: 'No events to undo' });
  }

  const last = inn.events.pop();

  if (last.type !== 'dead_ball') {
    inn.runs = Math.max(0, inn.runs - (last.runs || 0));
  }
  if (last.legal) inn.balls = Math.max(0, inn.balls - 1);
  if (last.wicket) inn.wickets = Math.max(0, inn.wickets - 1);

  if (last.type === 'wide') {
    inn.extras.wide = Math.max(0, inn.extras.wide - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  } else if (last.type === 'noball' || last.type === 'no_ball') {
    inn.extras.noball = Math.max(0, inn.extras.noball - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  } else if (last.type === 'bye') {
    inn.extras.bye = Math.max(0, inn.extras.bye - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  } else if (last.type === 'legbye' || last.type === 'leg_bye') {
    inn.extras.legbye = Math.max(0, inn.extras.legbye - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  } else if (last.type === 'penalty') {
    inn.extras.penalty = Math.max(0, (inn.extras.penalty || 0) - (last.runs || 0));
    inn.extras.total = Math.max(0, inn.extras.total - (last.runs || 0));
  }

  inn.freeHit = !!last.freeHit;

  const updated = updateMatch(m.id, { [key]: inn, updatedAt: new Date().toISOString() });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/end-innings', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });

  if (m.innings === 1) {
    const nextBat = m.battingSide === 'A' ? 'B' : 'A';
    const firstRuns = m.innings1?.runs || 0;
    const target = firstRuns + 1;
    const updated = updateMatch(m.id, {
      innings: 2,
      battingSide: nextBat,
      status: 'live',
      dlsTarget: m.dlsTarget != null ? m.dlsTarget : target,
      updatedAt: new Date().toISOString()
    });
    const enriched = enrichMatch(updated);
    emitScore(req, enriched);
    return res.json(enriched);
  }

  const t =
    m.dlsTarget != null
      ? Number(m.dlsTarget)
      : (m.innings1?.runs || 0) + 1;
  const chased = (m.innings2?.runs || 0) >= t;
  const teamChase = m.battingSide === 'A' ? m.teamAName : m.teamBName;
  const teamDefend = m.battingSide === 'A' ? m.teamBName : m.teamAName;
  let result;
  if (chased) {
    const wktsLeft = 10 - (m.innings2?.wickets || 0);
    result = `${teamChase} won by ${wktsLeft} wicket${wktsLeft === 1 ? '' : 's'}`;
  } else {
    const margin = t - 1 - (m.innings2?.runs || 0);
    result = `${teamDefend} won by ${margin} run${margin === 1 ? '' : 's'}`;
  }

  const updated = updateMatch(m.id, {
    status: 'completed',
    result,
    updatedAt: new Date().toISOString()
  });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/status', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const status = String(req.body.status || '').toLowerCase();
  const allowed = ['live', 'rain_delay', 'abandoned', 'innings_break'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }
  const updates = { status, updatedAt: new Date().toISOString() };
  if (status === 'abandoned') {
    updates.result = req.body.result || 'Match abandoned';
  }
  const updated = updateMatch(m.id, updates);
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/dls', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });

  const revisedOvers = Number(req.body.revisedOvers);
  if (!revisedOvers || revisedOvers <= 0) {
    return res.status(400).json({ error: 'revisedOvers required (e.g. 15)' });
  }
  const fullOvers = Number(m.oversLimit) || 20;
  let dlsTargetVal =
    req.body.dlsTarget != null
      ? Number(req.body.dlsTarget)
      : dlsTarget(m.innings1?.runs || 0, fullOvers, revisedOvers);

  const updated = updateMatch(m.id, {
    revisedOvers,
    dlsTarget: dlsTargetVal,
    updatedAt: new Date().toISOString()
  });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/super-over', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });

  const battingSide = req.body.battingFirst === 'B' ? 'B' : 'A';
  const updated = updateMatch(m.id, {
    superOver: true,
    status: 'super_over',
    innings: 1,
    battingSide,
    oversLimit: 1,
    powerplayOvers: 1,
    revisedOvers: null,
    dlsTarget: null,
    innings1: emptyInnings(),
    innings2: emptyInnings(),
    result: null,
    name: (m.name || 'Match') + ' — Super Over',
    updatedAt: new Date().toISOString()
  });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
  res.json(enriched);
});

router.post('/:id/complete', authMiddleware, requireRole('admin'), (req, res) => {
  const m = getMatches().find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const updated = updateMatch(m.id, {
    status: 'completed',
    result: req.body.result || m.result || 'Match completed',
    updatedAt: new Date().toISOString()
  });
  const enriched = enrichMatch(updated);
  emitScore(req, enriched);
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
