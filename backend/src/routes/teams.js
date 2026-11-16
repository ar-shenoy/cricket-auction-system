const express = require('express');
const multer = require('multer');
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

router.post('/bulk-delete', authMiddleware, requireRole('admin'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  const teams = getTeams();
  const users = getUsers();
  const sold = getSoldPlayers();
  const locked = new Set(sold.map(s => s.teamId));
  let deleted = 0;
  const skipped = [];
  for (const id of ids) {
    if (locked.has(id)) { skipped.push(id); continue; }
    const idx = teams.findIndex(x => x.id === id);
    if (idx === -1) continue;
    teams.splice(idx, 1);
    for (let i = users.length - 1; i >= 0; i--) {
      if (users[i].teamId === id && users[i].role === 'team_manager') users.splice(i, 1);
    }
    deleted++;
  }
  if (deleted > 0) persist();
  res.json({ deleted, skipped });
});

router.post('/bulk-update', authMiddleware, requireRole('admin'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'ids required' });
  const { purse, maxPlayers } = req.body;
  let updated = 0;
  for (const id of ids) {
    const patch = {};
    if (purse !== undefined && purse !== null && purse !== '') {
      const p = Number(purse);
      if (!Number.isNaN(p)) {
        patch.purse = p;
        const team = getTeams().find(x => x.id === id);
        if (team) {
          const spent = Math.max(0, Number(team.purse || 0) - Number(team.remainingPurse || 0));
          patch.remainingPurse = Math.max(0, p - spent);
        }
      }
    }
    if (maxPlayers !== undefined) {
      patch.maxPlayers = (maxPlayers === null || maxPlayers === '') ? null : Number(maxPlayers);
    }
    if (Object.keys(patch).length) {
      updateTeam(id, patch);
      updated++;
    }
  }
  res.json({ updated });
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
      const hash = await bcrypt.hash(String(managerPassword), 10);
      addUser({
        id: uuidv4(),
        name: managerName || name + ' Manager',
        email: managerEmail,
        passwordHash: hash,
        role: 'team_manager',
        teamId: team.id,
        orgId: req.user?.orgId || 'org-default',
        createdAt: new Date().toISOString()
      });
    }

    res.status(201).json(team);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Create failed' });
  }
});

router.post('/import', authMiddleware, requireRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });
  try {
    const text = fs.readFileSync(req.file.path, 'utf8');
    fs.unlinkSync(req.file.path);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'Empty CSV' });
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/["']/g, ''));
    let imported = 0, skipped = 0;
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, j) => { row[h] = cols[j]; });
      const name = pick(row, ['name', 'team', 'team_name']);
      const purseStr = pick(row, ['purse', 'purse_value', 'budget']);
      if (!name || !purseStr) { skipped++; errors.push({ row: i + 1, reason: 'missing name/purse' }); continue; }
      const purse = Number(purseStr.replace(/[^0-9.]/g, ''));
      if (Number.isNaN(purse)) { skipped++; errors.push({ row: i + 1, reason: 'bad purse' }); continue; }
      if (getTeams().find(t => t.name.toLowerCase() === name.toLowerCase())) { skipped++; continue; }
      const maxPlayersRaw = pick(row, ['max_players', 'maxplayers', 'squad_size']);
      addTeam({
        id: uuidv4(),
        name,
        purse,
        remainingPurse: purse,
        maxPlayers: maxPlayersRaw ? Number(maxPlayersRaw) : null,
        logoUrl: pick(row, ['logo_url', 'logo']),
        orgId: req.user?.orgId || 'org-default',
        createdAt: new Date().toISOString()
      });
      imported++;
    }
    res.json({ imported, skipped, errors });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Import failed' });
  }
});

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const team = getTeams().find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const { name, purse, remainingPurse, maxPlayers, logoUrl, roleCaps } = req.body;
  const updates = {};
  if (name != null) updates.name = String(name);
  if (purse != null) updates.purse = Number(purse);
  if (remainingPurse != null) updates.remainingPurse = Number(remainingPurse);
  if (maxPlayers !== undefined) updates.maxPlayers = maxPlayers === null || maxPlayers === '' ? null : Number(maxPlayers);
  if (logoUrl !== undefined) updates.logoUrl = logoUrl ? String(logoUrl) : '';
  if (roleCaps !== undefined) updates.roleCaps = roleCaps;
  const updated = updateTeam(team.id, updates);
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
