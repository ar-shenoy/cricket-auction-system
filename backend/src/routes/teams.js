const express = require('express');
const { getTeams, addTeam, updateTeam, getUsers, addUser, getSoldPlayers, persist } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

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
      maxPlayers, roleCaps
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

router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, purse, remainingPurse, maxPlayers, roleCaps } = req.body;
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

  const updated = updateTeam(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Team not found' });
  res.json(updated);
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const teamId = req.params.id;
  const teams = getTeams();
  const idx = teams.findIndex(t => t.id === teamId);
  if (idx === -1) return res.status(404).json({ error: 'Team not found' });

  // Block delete if team already bought players in any auction
  const hasSold = getSoldPlayers().some(s => s.teamId === teamId);
  if (hasSold) {
    return res.status(400).json({
      error: 'Cannot delete team that has bought players. End auction / clear sold records first.'
    });
  }

  teams.splice(idx, 1);

  // Remove manager accounts linked to this team
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
