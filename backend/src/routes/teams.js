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
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'Empty CSV' });

    function splitCsvLine(line) {
      const out = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          out.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur.trim());
      return out;
    }

    function normHeader(h) {
      return String(h || '')
        .trim()
        .toLowerCase()
        .replace(/["']/g, '')
        .replace(/[\s\-]+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
    }

    const rawHeaders = splitCsvLine(lines[0]);
    const headers = rawHeaders.map(normHeader);

    const NAME_KEYS = [
      'name', 'team', 'team_name', 'teamname', 'franchise', 'franchise_name',
      'club', 'club_name', 'squad', 'squad_name', 'title'
    ];
    const PURSE_KEYS = [
      'purse', 'purse_value', 'pursevalue', 'total_purse', 'total_purse_value',
      'totalpurse', 'totalpursevalue', 'budget', 'budget_value', 'purse_val',
      'purse_amount', 'amount', 'wallet', 'funds', 'capital', 'purse_rupees',
      'pursue_value', 'pursue_values', 'purse_values', 'total_budget'
    ];
    const MAX_KEYS = [
      'max_players', 'maxplayers', 'max_player', 'maxplayer', 'squad_size',
      'squadsize', 'size', 'limit', 'player_limit', 'players_max', 'max_squad'
    ];
    const LOGO_KEYS = [
      'logo_url', 'logourl', 'logo', 'image', 'image_url', 'imageurl',
      'avatar', 'avatar_url', 'photo', 'photo_url'
    ];
    const OWNER_NAME_KEYS = [
      'owner_name', 'ownername', 'owner', 'manager_name', 'managername',
      'manager', 'contact_name', 'contactname'
    ];
    const EMAIL_KEYS = [
      'email', 'owner_email', 'owneremail', 'manager_email', 'manageremail',
      'contact_email', 'contactemail'
    ];
    const PASS_KEYS = [
      'password', 'owner_password', 'ownerpassword', 'manager_password',
      'managerpassword', 'pass', 'pwd'
    ];

    let imported = 0, skipped = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const row = {};
      headers.forEach((h, j) => { row[h] = (cols[j] || '').replace(/^"|"$/g, '').trim(); });

      const name = pick(row, NAME_KEYS);
      const purseStr = pick(row, PURSE_KEYS);
      if (!name || !purseStr) {
        skipped++;
        errors.push({ row: i + 1, reason: 'missing name/purse', headers_seen: headers.slice(0, 8) });
        continue;
      }
      const purse = Number(String(purseStr).replace(/[^0-9.]/g, ''));
      if (Number.isNaN(purse)) {
        skipped++;
        errors.push({ row: i + 1, reason: 'bad purse' });
        continue;
      }
      if (getTeams().find(tm => tm.name.toLowerCase() === name.toLowerCase())) {
        skipped++;
        errors.push({ row: i + 1, reason: 'duplicate name' });
        continue;
      }

      const maxPlayersRaw = pick(row, MAX_KEYS);
      const logoUrl = pick(row, LOGO_KEYS) || '';
      const team = addTeam({
        id: uuidv4(),
        name,
        purse,
        remainingPurse: purse,
        maxPlayers: maxPlayersRaw !== '' && maxPlayersRaw != null ? Number(maxPlayersRaw) : null,
        logoUrl: logoUrl ? String(logoUrl).trim() : '',
        orgId: req.user?.orgId || 'org-default',
        createdAt: new Date().toISOString()
      });

      const managerEmail = pick(row, EMAIL_KEYS);
      const managerPassword = pick(row, PASS_KEYS);
      const managerName = pick(row, OWNER_NAME_KEYS) || (name + ' Manager');
      if (managerEmail && managerPassword) {
        try {
          const hash = await bcrypt.hash(String(managerPassword), 10);
          addUser({
            id: uuidv4(),
            name: managerName,
            email: managerEmail,
            passwordHash: hash,
            role: 'team_manager',
            teamId: team.id,
            orgId: req.user?.orgId || 'org-default',
            createdAt: new Date().toISOString()
          });
        } catch (e) {
          errors.push({ row: i + 1, reason: 'team ok, manager failed: ' + (e.message || 'error') });
        }
      }
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
