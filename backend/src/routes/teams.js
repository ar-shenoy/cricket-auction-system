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
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv') || file.mimetype === 'application/vnd.ms-excel') {
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

/** Normalize CSV cell / header keys */
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  return '';
}

router.get('/', (req, res) => {
  const orgId = req.headers['x-org-id'] || req.query.orgId || null;
  const teams = orgId ? getTeams(orgId) : getTeams();
  res.json(teams);
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
      orgId: req.user?.orgId || 'org-default',
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
          teamId: team.id,
          orgId: req.user?.orgId || 'org-default'
        });
      }
    }

    res.status(201).json(team);
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

/**
 * CSV import — flexible headers (case-insensitive, spaces → underscores):
 *   name | team_name | team
 *   purse | purse_value | budget | total_purse | purse_amount
 *   max_players | maxplayers | squad_size | max_player
 *   logo_url | logo | image (optional)
 *   manager_name, manager_email, manager_password (optional)
 */
router.post('/import', authMiddleware, requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSV file is required' });
  }

  const errors = [];
  let imported = 0;
  let skipped = 0;
  const rows = [];

  try {
    await new Promise((resolve, reject) => {
      fs.createReadStream(req.file.path)
        .pipe(csv({
          mapHeaders: ({ header }) =>
            String(header || '')
              .replace(/^\uFEFF/, '') // BOM
              .trim()
              .toLowerCase()
              .replace(/\s+/g, '_')
              .replace(/[^a-z0-9_]/g, '_')
        }))
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Failed to parse CSV', details: err.message });
  }

  for (const row of rows) {
    try {
      const name = pick(row, ['name', 'team_name', 'team', 'teamname', 'franchise', 'franchise_name']);
      const purseRaw = pick(row, [
        'purse', 'purse_value', 'budget', 'total_purse', 'purse_amount',
        'total_budget', 'wallet', 'amount', 'purse_rs', 'purse_inr'
      ]);
      // Strip currency symbols / commas: "₹1,00,00,000" or "10000000"
      const purse = Number(String(purseRaw).replace(/[₹$,\s]/g, '').replace(/inr/gi, ''));
      const maxPlayersRaw = pick(row, [
        'max_players', 'maxplayers', 'squad_size', 'max_player',
        'max_squad', 'squad', 'players_limit', 'player_limit'
      ]);
      const maxPlayers = maxPlayersRaw !== '' ? Number(maxPlayersRaw) : null;
      const managerName = pick(row, ['manager_name', 'manager', 'owner']);
      const managerEmail = pick(row, ['manager_email', 'email', 'manager_mail']);
      const managerPassword = pick(row, ['manager_password', 'password', 'manager_pass']);
      const logoUrl = pick(row, ['logo_url', 'logo', 'image', 'photo', 'photo_url']);

      if (!name) {
        skipped++;
        errors.push({ row: '(empty)', reason: 'Missing team name' });
        continue;
      }
      if (!Number.isFinite(purse) || purse <= 0) {
        skipped++;
        errors.push({
          row: name,
          reason: `Invalid or missing purse (got "${purseRaw || ''}"). Use a column like purse / purse_value / budget.`
        });
        continue;
      }

      const teams = getTeams(req.user?.orgId);
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
        maxPlayers: maxPlayers != null && Number.isFinite(maxPlayers) && maxPlayers > 0 ? maxPlayers : null,
        roleCaps: null,
        logoUrl: logoUrl || '',
        orgId: req.user?.orgId || 'org-default',
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
            teamId: team.id,
            orgId: req.user?.orgId || 'org-default'
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
  res.json({
    message: 'Import completed',
    imported,
    skipped,
    errors: errors.slice(0, 30)
  });
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
