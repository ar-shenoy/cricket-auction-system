const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUsers, addUser, getAllUsers, getOrgById, persist } = require('../data/store');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const DEV_EMAIL = 'developer@auction.com';
const DEV_PASS = 'devxai2026';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const users = getAllUsers();
    let user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    // Bootstrap platform developer if missing from persisted db
    if (!user && email.toLowerCase() === DEV_EMAIL && password === DEV_PASS) {
      user = {
        id: 'dev-001',
        name: 'Platform Developer',
        email: DEV_EMAIL,
        password: await bcrypt.hash(DEV_PASS, 10),
        role: 'developer',
        teamId: null,
        orgId: 'org-default'
      };
      addUser(user);
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.email.toLowerCase() === DEV_EMAIL) {
      user.role = 'developer';
    }

    let isMatch = false;
    const isHashed = String(user.password || '').startsWith('$2a$')
      || String(user.password || '').startsWith('$2b$');

    if (isHashed) {
      isMatch = await bcrypt.compare(password, user.password);
      // Recovery: platform developer known password always works
      if (!isMatch && user.email.toLowerCase() === DEV_EMAIL && password === DEV_PASS) {
        user.password = await bcrypt.hash(DEV_PASS, 10);
        user.role = 'developer';
        persist();
        isMatch = true;
      }
    } else {
      isMatch = password === user.password;
      if (isMatch) {
        user.password = await bcrypt.hash(password, 10);
        persist();
      }
    }

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const role = user.email.toLowerCase() === DEV_EMAIL ? 'developer' : user.role;

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role,
        teamId: user.teamId,
        name: user.name,
        orgId: user.orgId || 'org-default'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        teamId: user.teamId,
        orgId: user.orgId || 'org-default'
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

    const users = getAllUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = {
      id: require('uuid').v4(),
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: role === 'admin' || role === 'developer' ? 'team_manager' : role,
      teamId,
      orgId: 'org-default'
    };

    addUser(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        teamId: newUser.teamId,
        orgId: newUser.orgId
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/change-password', require('../middleware/auth').authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Current password and new password (min 6 chars) required' });
    }
    const users = getAllUsers();
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
  const users = getAllUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const org = getOrgById(user.orgId);

  let role = user.role;
  if (user.email && user.email.toLowerCase() === DEV_EMAIL) {
    role = 'developer';
  }
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    teamId: user.teamId,
    orgId: user.orgId || 'org-default',
    organization: org
      ? { id: org.id, name: org.name, slug: org.slug, plan: org.plan || 'free' }
      : null
  });
});

module.exports = router;
