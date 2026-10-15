const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUsers, addUser, getData, persist } = require('../data/store');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const users = getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    let isMatch = false;
    const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');

    if (isHashed) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      // First-run plain password (e.g. default admin123)
      isMatch = password === user.password;
      if (isMatch) {
        user.password = await bcrypt.hash(password, 10);
        persist();
      }
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, teamId: user.teamId, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: user.teamId
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'team_manager', teamId = null } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password required' });
    }

    const users = getUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
      id: require('uuid').v4(),
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: role === 'admin' ? 'team_manager' : role,
      teamId
    };

    addUser(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        teamId: newUser.teamId
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Change password (authenticated)
router.post('/change-password', require('../middleware/auth').authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Current password and new password (min 6 chars) required' });
    }
    const users = getUsers();
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
    const ok = isHashed
      ? await bcrypt.compare(currentPassword, user.password)
      : currentPassword === user.password;
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 10);
    persist();
    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
  const users = getUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    teamId: user.teamId
  });
});

module.exports = router;
