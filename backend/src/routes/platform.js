const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  getOrganizations,
  getOrgById,
  addOrganization,
  updateOrganization,
  getAllUsers,
  addUser,
  updateUser,
  getTeams,
  getPlayers,
  getAuctions,
  getMatches,
  getSoldPlayers,
  DEFAULT_ORG_ID
} = require('../data/store');
const { authMiddleware, requireRole, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'org';
}

function safeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    orgId: u.orgId,
    teamId: u.teamId || null,
    active: u.active !== false,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt || null
  };
}

function orgUsage(orgId) {
  return {
    teams: (getTeams(orgId) || []).length,
    players: (getPlayers(orgId) || []).length,
    auctions: (getAuctions(orgId) || []).length,
    matches: (getMatches(orgId) || []).length,
    sold: (getSoldPlayers(orgId) || []).length
  };
}

function enrichOrg(org) {
  const users = getAllUsers().filter(u => u.orgId === org.id && u.role !== 'developer');
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan || 'free',
    planExpiresAt: org.planExpiresAt || null,
    status: org.status || 'active',
    accessUntil: org.accessUntil || null,
    notes: org.notes || '',
    seasonLabel: org.seasonLabel || '',
    createdAt: org.createdAt || null,
    usage: orgUsage(org.id),
    users: users.map(safeUser),
    features: org.features || null
  };
}

router.get('/orgs', authMiddleware, requireRole('developer'), (_req, res) => {
  const list = getOrganizations().map(enrichOrg);
  list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  res.json(list);
});

router.get('/orgs/:id', authMiddleware, requireRole('developer'), (req, res) => {
  const org = getOrgById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Not found' });
  res.json(enrichOrg(org));
});

router.post('/orgs', authMiddleware, requireRole('developer'), async (req, res) => {
  try {
    const {
      orgName, adminName, adminEmail, adminPassword, plan, accessUntil, notes, seasonLabel, status
    } = req.body || {};

    if (!orgName || !String(orgName).trim()) {
      return res.status(400).json({ error: 'Organisation name required' });
    }
    if (!adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'Admin email and password required' });
    }
    if (String(adminPassword).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const email = String(adminEmail).toLowerCase().trim();
    if (getAllUsers().find(u => (u.email || '').toLowerCase() === email)) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    let slug = slugify(orgName);
    const orgs = getOrganizations();
    if (orgs.find(o => o.slug === slug)) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const org = addOrganization({
      id: uuidv4(),
      name: String(orgName).trim(),
      slug,
      plan: plan === 'pro' ? 'pro' : 'free',
      planExpiresAt: plan === 'pro'
        ? new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()
        : null,
      status: ['active', 'suspended', 'archived'].includes(status) ? status : 'active',
      accessUntil: accessUntil || null,
      notes: String(notes || '').slice(0, 500),
      seasonLabel: String(seasonLabel || '').slice(0, 80),
      features: null,
      createdAt: new Date().toISOString(),
      createdBy: req.user?.id || null
    });

    const hashed = await bcrypt.hash(String(adminPassword), 10);
    const admin = addUser({
      id: uuidv4(),
      name: String(adminName || orgName).trim() || 'Organiser',
      email,
      password: hashed,
      role: 'admin',
      teamId: null,
      orgId: org.id,
      active: true,
      createdAt: new Date().toISOString(),
      provisionedBy: req.user?.id || null
    });

    res.status(201).json({
      organization: enrichOrg(org),
      admin: safeUser(admin),
      credentials: { email, password: String(adminPassword), loginUrl: '/login' },
      message: 'Organiser created. Share login details securely.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create organisation' });
  }
});

router.patch('/orgs/:id', authMiddleware, requireRole('developer'), (req, res) => {
  const org = getOrgById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Not found' });
  const updates = {};
  if (req.body.name != null) updates.name = String(req.body.name).trim();
  if (req.body.plan === 'free' || req.body.plan === 'pro') {
    updates.plan = req.body.plan;
    if (req.body.plan === 'pro' && !org.planExpiresAt) {
      updates.planExpiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
    }
  }
  if (req.body.status != null) {
    if (!['active', 'suspended', 'archived'].includes(req.body.status)) {
      return res.status(400).json({ error: 'status must be active | suspended | archived' });
    }
    updates.status = req.body.status;
  }
  if (req.body.accessUntil !== undefined) updates.accessUntil = req.body.accessUntil || null;
  if (req.body.notes !== undefined) updates.notes = String(req.body.notes || '').slice(0, 500);
  if (req.body.seasonLabel !== undefined) updates.seasonLabel = String(req.body.seasonLabel || '').slice(0, 80);
  const updated = updateOrganization(org.id, updates);
  res.json(enrichOrg(updated));
});

router.post('/orgs/:id/suspend', authMiddleware, requireRole('developer'), (req, res) => {
  const org = getOrgById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Not found' });
  const updated = updateOrganization(org.id, {
    status: 'suspended',
    suspendedAt: new Date().toISOString(),
    suspendedReason: String(req.body?.reason || 'Tournament ended').slice(0, 200)
  });
  res.json({ organization: enrichOrg(updated), message: 'Access suspended — data retained' });
});

router.post('/orgs/:id/activate', authMiddleware, requireRole('developer'), (req, res) => {
  const org = getOrgById(req.params.id);
  if (!org) return res.status(404).json({ error: 'Not found' });
  const updates = { status: 'active', suspendedAt: null, suspendedReason: null };
  if (req.body?.accessUntil) updates.accessUntil = req.body.accessUntil;
  const updated = updateOrganization(org.id, updates);
  res.json({ organization: enrichOrg(updated), message: 'Access restored' });
});

router.post('/orgs/:id/users', authMiddleware, requireRole('developer'), async (req, res) => {
  try {
    const org = getOrgById(req.params.id);
    if (!org) return res.status(404).json({ error: 'Org not found' });
    const { name, email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
    const em = String(email).toLowerCase().trim();
    if (getAllUsers().find(u => (u.email || '').toLowerCase() === em)) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    const r = role === 'team_manager' ? 'team_manager' : 'admin';
    const hashed = await bcrypt.hash(String(password), 10);
    const user = addUser({
      id: uuidv4(),
      name: String(name || em.split('@')[0]).trim(),
      email: em,
      password: hashed,
      role: r,
      teamId: req.body.teamId || null,
      orgId: org.id,
      active: true,
      createdAt: new Date().toISOString(),
      provisionedBy: req.user?.id || null
    });
    res.status(201).json({
      user: safeUser(user),
      credentials: { email: em, password: String(password) }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create user' });
  }
});

router.patch('/users/:id', authMiddleware, requireRole('developer'), async (req, res) => {
  try {
    const users = getAllUsers();
    const user = users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'developer') {
      return res.status(403).json({ error: 'Cannot edit platform developer this way' });
    }
    const updates = {};
    if (req.body.name != null) updates.name = String(req.body.name).trim();
    if (req.body.email != null) {
      const em = String(req.body.email).toLowerCase().trim();
      const clash = users.find(u => u.id !== user.id && (u.email || '').toLowerCase() === em);
      if (clash) return res.status(409).json({ error: 'Email already in use' });
      updates.email = em;
    }
    if (typeof req.body.active === 'boolean') updates.active = req.body.active;
    if (req.body.role === 'admin' || req.body.role === 'team_manager') updates.role = req.body.role;
    if (req.body.password) {
      if (String(req.body.password).length < 6) {
        return res.status(400).json({ error: 'Password min 6 chars' });
      }
      updates.password = await bcrypt.hash(String(req.body.password), 10);
    }
    const updated = updateUser(user.id, updates);
    res.json({
      user: safeUser(updated),
      credentials: req.body.password
        ? { email: updated.email, password: String(req.body.password) }
        : undefined
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

router.post('/users/:id/disable', authMiddleware, requireRole('developer'), (req, res) => {
  const user = getAllUsers().find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (user.role === 'developer') return res.status(403).json({ error: 'Cannot disable developer' });
  const updated = updateUser(user.id, { active: false });
  res.json({ user: safeUser(updated), message: 'Login disabled' });
});

router.post('/users/:id/enable', authMiddleware, requireRole('developer'), (req, res) => {
  const user = getAllUsers().find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const updated = updateUser(user.id, { active: true });
  res.json({ user: safeUser(updated), message: 'Login enabled' });
});

router.post('/impersonate/:userId', authMiddleware, requireRole('developer'), (req, res) => {
  const user = getAllUsers().find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'developer') return res.status(400).json({ error: 'Already developer' });
  const org = getOrgById(user.orgId);
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      teamId: user.teamId || null,
      name: user.name,
      orgId: user.orgId,
      impersonatedBy: req.user.id
    },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
  res.json({
    token,
    user: safeUser(user),
    organization: org ? { id: org.id, name: org.name, status: org.status || 'active' } : null,
    message: 'Impersonation token (2h). Use carefully.'
  });
});

module.exports = router;
