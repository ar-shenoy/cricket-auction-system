const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  getOrganizations,
  getOrgById,
  getOrgBySlug,
  addOrganization,
  updateOrganization,
  addUser,
  getAllUsers,
  getTeams,
  getPlayers,
  getMatches,
  getAuctions
} = require('../data/store');
const { authMiddleware, requireRole, JWT_SECRET } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { PLANS, getPlan } = require('../config/plans');

const router = express.Router();

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'org';
}

/** Public: list plans (marketing) */
router.get('/plans', (req, res) => {
  res.json(Object.values(PLANS));
});

/** Register new organization + owner admin */
router.post('/register', async (req, res) => {
  try {
    const { orgName, name, email, password } = req.body;
    if (!orgName || !name || !email || !password) {
      return res.status(400).json({ error: 'orgName, name, email, password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password min 6 characters' });
    }
    const users = getAllUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    let slug = slugify(orgName);
    let n = 0;
    while (getOrgBySlug(slug)) {
      n += 1;
      slug = `${slugify(orgName)}-${n}`;
    }

    const org = addOrganization({
      id: uuidv4(),
      name: String(orgName).trim().slice(0, 80),
      slug,
      plan: 'free',
      planExpiresAt: null,
      createdAt: new Date().toISOString()
    });

    const hashed = await bcrypt.hash(password, 10);
    const user = addUser({
      id: uuidv4(),
      name: String(name).trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      role: 'admin',
      teamId: null,
      orgId: org.id
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        teamId: null,
        name: user.name,
        orgId: org.id
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamId: null,
        orgId: org.id
      },
      organization: publicOrg(org)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

function publicOrg(org) {
  if (!org) return null;
  const plan = getPlan(org.plan);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan || 'free',
    planExpiresAt: org.planExpiresAt || null,
    limits: plan.limits,
    planName: plan.name
  };
}

/** Current org (auth) */
router.get('/me', authMiddleware, tenantMiddleware, (req, res) => {
  const teams = getTeams(req.orgId).length;
  const players = getPlayers(req.orgId).length;
  const matches = getMatches(req.orgId).length;
  const auctions = getAuctions(req.orgId).length;
  res.json({
    ...publicOrg(req.org),
    usage: { teams, players, matches, auctions }
  });
});

router.patch('/me', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  const { name } = req.body;
  const updates = {};
  if (name) updates.name = String(name).trim().slice(0, 80);
  const updated = updateOrganization(req.orgId, updates);
  res.json(publicOrg(updated));
});

/** Public org by slug (for branded public pages later) */
router.get('/public/:slug', (req, res) => {
  const org = getOrgBySlug(req.params.slug);
  if (!org) return res.status(404).json({ error: 'Not found' });
  res.json({
    name: org.name,
    slug: org.slug,
    plan: org.plan || 'free'
  });
});

module.exports = router;
