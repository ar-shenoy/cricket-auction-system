const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getPlayers, addPlayer, updatePlayer, getData, persist, getSoldPlayers, updateTeam, getTeams } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.get('/', authMiddleware, (req, res) => {
  const { status, role, search } = req.query;
  let players = getPlayers();

  if (status) players = players.filter(p => p.status === status);
  if (role) players = players.filter(p => p.role === role);
  if (search) {
    const q = search.toLowerCase();
    players = players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.mobile && p.mobile.includes(q)) ||
      (p.city && p.city.toLowerCase().includes(q))
    );
  }

  players.sort((a, b) => {
    if (a.status === 'Pending' && b.status !== 'Pending') return -1;
    if (a.status !== 'Pending' && b.status === 'Pending') return 1;
    return a.name.localeCompare(b.name);
  });

  res.json(players);
});

router.get('/public/:id', (req, res) => {
  const players = getPlayers();
  const player = players.find(p => p.id === req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json({
    id: player.id,
    name: player.name,
    role: player.role,
    basePrice: player.basePrice,
    city: player.city,
    bio: player.bio,
    photoUrl: player.photoUrl,
    battingStyle: player.battingStyle,
    bowlingStyle: player.bowlingStyle,
    age: player.age,
    status: player.status
  });
});

router.get('/:id', authMiddleware, (req, res) => {
  const players = getPlayers();
  const player = players.find(p => p.id === req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  res.json(player);
});

router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { name, mobile, email, role, battingStyle, bowlingStyle, age, city, bio, basePrice, photoUrl } = req.body;

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and Role are required' });
    }

    const players = getPlayers();
    if (mobile && players.find(p => p.mobile === mobile)) {
      return res.status(400).json({ error: 'Player with this mobile number already exists' });
    }

    const player = addPlayer({
      id: uuidv4(),
      name: name.trim(),
      mobile: mobile || '',
      email: email || '',
      role,
      battingStyle: battingStyle || '',
      bowlingStyle: bowlingStyle || '',
      age: age ? Number(age) : null,
      city: city || '',
      bio: bio || '',
      basePrice: basePrice ? Number(basePrice) : 0,
      status: 'Pending',
      photoUrl: photoUrl || '',
      createdAt: new Date().toISOString()
    });

    res.status(201).json(player);
  } catch (err) {
    console.error('Create player error:', err);
    res.status(500).json({ error: 'Failed to create player' });
  }
});

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const allowed = ['name', 'mobile', 'email', 'role', 'battingStyle', 'bowlingStyle', 'age', 'city', 'bio', 'basePrice', 'status', 'photoUrl'];
  const updates = {};
  allowed.forEach(key => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  if (updates.age) updates.age = Number(updates.age);
  if (updates.basePrice !== undefined) updates.basePrice = Number(updates.basePrice);

  const updated = updatePlayer(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Player not found' });
  res.json(updated);
});

router.patch('/:id/status', authMiddleware, requireRole('admin'), (req, res) => {
  const { status } = req.body;
  const allowed = ['Pending', 'Approved', 'Rejected', 'Sold', 'Unsold'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Use ${allowed.join(', ')}` });
  }

  const player = getPlayers().find(p => p.id === req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found' });

  if (player.status === 'Sold' && status !== 'Sold') {
    const data = getData();
    const soldIdx = data.soldPlayers.findIndex(s => s.playerId === player.id);
    if (soldIdx !== -1) {
      const sold = data.soldPlayers[soldIdx];
      const team = getTeams().find(t => t.id === sold.teamId);
      if (team) {
        updateTeam(team.id, { remainingPurse: team.remainingPurse + sold.soldPrice });
      }
      data.soldPlayers.splice(soldIdx, 1);
      persist();
    }
  }

  const updated = updatePlayer(req.params.id, { status });
  res.json(updated);
});

router.post('/bulk-approve', authMiddleware, requireRole('admin'), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  let count = 0;
  ids.forEach(id => {
    if (updatePlayer(id, { status: 'Approved' })) count++;
  });
  res.json({ message: `${count} players approved`, count });
});

router.post('/bulk-delete', authMiddleware, requireRole('admin'), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  const data = getData();
  let count = 0;
  ids.forEach(id => {
    const idx = data.players.findIndex(p => p.id === id);
    if (idx === -1) return;
    const soldIdx = data.soldPlayers.findIndex(s => s.playerId === id);
    if (soldIdx !== -1) {
      const sold = data.soldPlayers[soldIdx];
      const team = getTeams().find(t => t.id === sold.teamId);
      if (team) {
        updateTeam(team.id, { remainingPurse: team.remainingPurse + sold.soldPrice });
      }
      data.soldPlayers.splice(soldIdx, 1);
    }
    data.players.splice(idx, 1);
    count++;
  });
  persist();
  res.json({ message: `${count} players deleted`, count });
});

router.post('/import', authMiddleware, requireRole('admin'), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const errors = [];
  let imported = 0;
  let skipped = 0;

  fs.createReadStream(req.file.path)
    .pipe(csv({
      mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_')
    }))
    .on('data', (row) => {
      try {
        const name = row.name || row.full_name || row.player_name || row['full name'] || '';
        const mobile = row.mobile || row.mobile_number || row.phone || row['mobile number'] || '';
        const email = row.email || row.email_address || '';
        const role = (row.role || row.playing_role || row['playing role'] || 'All-rounder').trim();
        const battingStyle = row.batting_style || row.batting || row['batting style'] || '';
        const bowlingStyle = row.bowling_style || row.bowling || row['bowling style'] || '';
        const age = row.age || row.dob || '';
        const city = row.city || row.location || row.state || '';
        const bio = row.bio || row.experience || row['experience / bio'] || row.comments || '';
        const basePrice = row.base_price || row.baseprice || row['base price'] || 0;
        const photoUrl = row.photo || row.photo_url || row['photo url'] || '';

        if (!name || name.trim().length < 2) {
          errors.push({ row, reason: 'Missing or invalid name' });
          skipped++;
          return;
        }

        let normalizedRole = 'All-rounder';
        const r = role.toLowerCase();
        if (r.includes('bat')) normalizedRole = 'Batsman';
        else if (r.includes('bowl')) normalizedRole = 'Bowler';
        else if (r.includes('wicket') || r.includes('wk') || r.includes('keeper')) normalizedRole = 'Wicket-keeper';
        else if (r.includes('all')) normalizedRole = 'All-rounder';

        const players = getPlayers();
        if (mobile && players.find(p => p.mobile === String(mobile).trim())) {
          skipped++;
          errors.push({ name, reason: 'Duplicate mobile number' });
          return;
        }

        addPlayer({
          id: uuidv4(),
          name: name.trim(),
          mobile: String(mobile).trim(),
          email: String(email).trim(),
          role: normalizedRole,
          battingStyle: String(battingStyle).trim(),
          bowlingStyle: String(bowlingStyle).trim(),
          age: age ? Number(age) || null : null,
          city: String(city).trim(),
          bio: String(bio).trim(),
          basePrice: Number(basePrice) || 0,
          status: 'Pending',
          photoUrl: String(photoUrl).trim(),
          createdAt: new Date().toISOString(),
          importedFrom: 'csv'
        });

        imported++;
      } catch (err) {
        errors.push({ row, reason: err.message });
        skipped++;
      }
    })
    .on('end', () => {
      fs.unlink(req.file.path, () => {});
      res.json({ message: 'Import completed', imported, skipped, errors: errors.slice(0, 20) });
    })
    .on('error', (err) => {
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: 'Failed to parse CSV', details: err.message });
    });
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const data = getData();
  const idx = data.players.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Player not found' });

  const soldIdx = data.soldPlayers.findIndex(s => s.playerId === req.params.id);
  if (soldIdx !== -1) {
    const sold = data.soldPlayers[soldIdx];
    const team = getTeams().find(t => t.id === sold.teamId);
    if (team) {
      updateTeam(team.id, { remainingPurse: team.remainingPurse + sold.soldPrice });
    }
    data.soldPlayers.splice(soldIdx, 1);
  }

  data.players.splice(idx, 1);
  persist();
  res.json({ message: 'Player deleted' });
});

router.get('/stats/summary', authMiddleware, (req, res) => {
  const players = getPlayers();
  res.json({
    total: players.length,
    pending: players.filter(p => p.status === 'Pending').length,
    approved: players.filter(p => p.status === 'Approved').length,
    rejected: players.filter(p => p.status === 'Rejected').length,
    sold: players.filter(p => p.status === 'Sold').length,
    unsold: players.filter(p => p.status === 'Unsold').length,
    byRole: {
      Batsman: players.filter(p => p.role === 'Batsman').length,
      Bowler: players.filter(p => p.role === 'Bowler').length,
      'All-rounder': players.filter(p => p.role === 'All-rounder').length,
      'Wicket-keeper': players.filter(p => p.role === 'Wicket-keeper').length
    }
  });
});

module.exports = router;
