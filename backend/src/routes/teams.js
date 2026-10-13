const express = require('express');
const { getTeams, addTeam, updateTeam, getUsers, addUser } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Get all teams (public for live viewer)
router.get('/', (req, res) => {
  const teams = getTeams();
  res.json(teams);
});

// Get single team
router.get('/:id', authMiddleware, (req, res) => {
  const teams = getTeams();
  const team = teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team);
});

// Create team (Admin only)
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { name, purse, managerName, managerEmail, managerPassword } = req.body;

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
      createdAt: new Date().toISOString()
    });

    // Optionally create manager account
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

// Update team (Admin only)
router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, purse, remainingPurse } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (purse !== undefined) updates.purse = Number(purse);
  if (remainingPurse !== undefined) updates.remainingPurse = Number(remainingPurse);

  const updated = updateTeam(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Team not found' });
  res.json(updated);
});

// Delete team (Admin only)
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const teams = getTeams();
  const idx = teams.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Team not found' });

  teams.splice(idx, 1);
  require('../data/store').persist();
  res.json({ message: 'Team deleted' });
});

module.exports = router;
