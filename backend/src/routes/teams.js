const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { getTeams, addTeam, updateTeam, getUsers, addUser, getSoldPlayers, persist } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

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
  limits: { fileSize: 2 * 1024 * 1024 }
});

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.get('/', (req, res) => {
  res.json(getTeams());
});

router.get('/:id', authMiddleware, (req, res) => {
  const team = getTeams().find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team);
});

router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const {
      name, purse, managerName, managerEmail, managerPassword,
      maxPlayers, roleCaps, logoUrl
    } = req.body;

    if (!name || purse === undefined) {
      return res.status(400).json({ error: 'Team name and purse are required' });
    }

    const teams = getTeams();
    if (teams.find(t => t.name.toLowerCase() === name.toLowerCase())) {
      return res.status(400).json({ error: 'Team name already exists' });
    }

    const team = addTeam({
      id: uuidv4(),
      name,
      purse: Number(purse),
      remainingPurse: Number(purse),
      maxPlayers: maxPlayers != null && maxPlayers !== '' ? Number(maxPlayers) : null,
      roleCaps: roleCaps && typeof roleCaps === 'object' ? roleCaps : null,
      logoUrl: logoUrl ? String(logoUrl).trim() : '',
      createdAt: new Date().toISOString()
    });

    if (managerEmail && managerPassword) {
      const users = getUsers();
      if (!users.find(u => u.email.toLowerCase() === managerEmail.toLowerCase())) {
        const hashed = await bcrypt.hash(managerPassword, 10);
        addUser({
          id: uuidv4(),
          name: managerName || `${name} Manager`,
          email: managerEmail.toLowerCase(),
          password: hashed,
          role: 'team_manager',
          teamId: team.id
        });
      }
    }

    res.status(201).json(team);
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

/** CSV columns: name, purse, max_players, logo_url (optional), manager_name, manager_email, manager_password */
router.post('/import', authMiddleware, requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const errors = [];
  let imported = 0;
  let skipped = 0;
  const rows = [];

  await new Promise((resolve, reject) => {
    fs.createReadStream(req.file.path)
      .pipe(csv({
        mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_')
      }))
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  }).catch((err) => {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Failed to parse CSV', details: err.message });
  });

  if (res.headersSent) return;

  for (const row of rows) {
    try {
      const name = (row.name || row.team_name || row.team || '').trim();
      const purse = Number(row.purse || row.budget || row.total_purse || 0);
      const maxPlayersRaw = row.max_players || row.maxplayers || row.squad_size || '';
      const maxPlayers = maxPlayersRaw !== '' ? Number(maxPlayersRaw) : null;
      const managerName = (row.manager_name || row.manager || '').trim();
      const managerEmail = (row.manager_email || row.email || '').trim();
      const managerPassword = (row.manager_password || row.password || '').trim();
      const logoUrl = (row.logo_url || row.logo || row.image || '').trim();

      if (!name || !purse) {
        skipped++;
        errors.push({ row: name || '(empty)', reason: 'Name and purse required' });
        continue;
      }

      const teams = getTeams();
      if (teams.find(t => t.name.toLowerCase() === name.toLowerCase())) {
        skipped++;
        errors.push({ row: name, reason: 'Team name already exists' });
        continue;
      }

      const team = addTeam({
        id: uuidv4(),
        name,
        purse,
        remainingPurse: purse,
        maxPlayers: maxPlayers && !isNaN(maxPlayers) ? maxPlayers : null,
        roleCaps: null,
        logoUrl: logoUrl || '',
        createdAt: new Date().toISOString()
      });

      if (managerEmail && managerPassword) {
        const users = getUsers();
        if (!users.find(u => u.email.toLowerCase() === managerEmail.toLowerCase())) {
          const hashed = await bcrypt.hash(managerPassword, 10);
          addUser({
            id: uuidv4(),
            name: managerName || `${name} Manager`,
            email: managerEmail.toLowerCase(),
            password: hashed,
            role: 'team_manager',
            teamId: team.id
          });
        }
      }

      imported++;
    } catch (err) {
      skipped++;
      errors.push({ reason: err.message });
    }
  }

  fs.unlink(req.file.path, () => {});
  res.json({ message: 'Import completed', imported, skipped, errors: errors.slice(0, 20) });
});

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, purse, remainingPurse, maxPlayers, roleCaps, logoUrl } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (purse !== undefined) updates.purse = Number(purse);
  if (remainingPurse !== undefined) updates.remainingPurse = Number(remainingPurse);
  if (maxPlayers !== undefined) {
    updates.maxPlayers = maxPlayers === null || maxPlayers === '' ? null : Number(maxPlayers);
  }
  if (roleCaps !== undefined) {
    updates.roleCaps = roleCaps && typeof roleCaps === 'object' ? roleCaps : null;
  }
  if (logoUrl !== undefined) updates.logoUrl = String(logoUrl || '').trim();

  const updated = updateTeam(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Team not found' });
  res.json(updated);
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const teamId = req.params.id;
  const teams = getTeams();
  const idx = teams.findIndex(t => t.id === teamId);
  if (idx === -1) return res.status(404).json({ error: 'Team not found' });

  const hasSold = getSoldPlayers().some(s => s.teamId === teamId);
  if (hasSold) {
    return res.status(400).json({
      error: 'Cannot delete team that has bought players. End auction / clear sold records first.'
    });
  }

  teams.splice(idx, 1);

  const users = getUsers();
  for (let i = users.length - 1; i >= 0; i--) {
    if (users[i].teamId === teamId && users[i].role === 'team_manager') {
      users.splice(i, 1);
    }
  }

  persist();
  res.json({ message: 'Team and linked managers deleted' });
});

module.exports = router;
