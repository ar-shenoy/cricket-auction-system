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
  getAuctions,
  getSoldPlayers,
  getBids,
  DEFAULT_ORG_ID
} = require('../data/store');
const { authMiddleware, requireRole, JWT_SECRET } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { PLANS, getPlan, DEFAULT_FEATURES, getFeatures } = require('../config/plans');

const router = express.Router();

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'org';
}

router.get('/plans', (req, res) => {
  res.json(Object.values(PLANS));
});

router.post('/register', async (req, res) => {
  try {
    const { orgName, name, email, password } = req.body;
    if (!orgName || !name || !email || !password) {
      return res.status(400).json({ error: 'orgName, name, email, password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const users = getAllUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    let slug = slugify(orgName);
    const orgs = getOrganizations();
    if (orgs.find(o => o.slug === slug)) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    const org = addOrganization({
      id: uuidv4(),
      name: orgName,
      slug,
      plan: 'free',
      planExpiresAt: null,
      razorpaySubId: null,
      features: null,
      createdAt: new Date().toISOString()
    });

    const hashed = await bcrypt.hash(password, 10);
    const user = addUser({
      id: uuidv4(),
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: 'admin',
      teamId: null,
      orgId: org.id
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, teamId: null, name: user.name, orgId: org.id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, teamId: null, orgId: org.id },
      organization: { id: org.id, name: org.name, slug: org.slug, plan: org.plan }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.get('/me', authMiddleware, tenantMiddleware, (req, res) => {
  const org = req.org || getOrgById(req.user?.orgId) || getOrgById(DEFAULT_ORG_ID);
  res.json({
    id: org?.id,
    name: org?.name,
    slug: org?.slug,
    plan: org?.plan || 'free',
    planExpiresAt: org?.planExpiresAt || null,
    soldWebhookUrl: org?.soldWebhookUrl || '',
    features: getFeatures(org),
    limits: getPlan(org?.plan || 'free').limits
  });
});

router.patch('/me', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const orgId = req.orgId || req.headers['x-org-id'] || DEFAULT_ORG_ID;
  const updates = {};
  if (typeof req.body?.soldWebhookUrl === 'string') updates.soldWebhookUrl = req.body.soldWebhookUrl.trim();
  if (typeof req.body?.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
  const updated = updateOrganization(orgId, updates);
  res.json({ organization: updated, message: 'Organization updated' });
});

router.get('/features', authMiddleware, tenantMiddleware, (req, res) => {
  const org = req.org || getOrgById(req.user?.orgId) || getOrgById(DEFAULT_ORG_ID);
  res.json({ features: getFeatures(org), defaults: DEFAULT_FEATURES });
});

router.put('/features', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const incoming = req.body?.features && typeof req.body.features === 'object' ? req.body.features : {};
  // Developer with global scope writes to default org (or x-org-id target)
  const orgId = req.orgId || req.headers['x-org-id'] || DEFAULT_ORG_ID;
  const org = req.org || getOrgById(orgId) || getOrgById(DEFAULT_ORG_ID);
  const merged = { ...getFeatures(org) };
  Object.keys(DEFAULT_FEATURES).forEach(k => {
    if (typeof incoming[k] === 'boolean') merged[k] = incoming[k];
  });
  // Forward-compat: accept any extra boolean keys developer sends
  Object.keys(incoming).forEach(k => {
    if (typeof incoming[k] === 'boolean') merged[k] = incoming[k];
  });
  const updated = updateOrganization(orgId, { features: merged });
  res.json({ features: getFeatures(updated), message: 'Features updated' });
});

router.get('/public-features', (req, res) => {
  const orgId = req.query.orgId || req.headers['x-org-id'];
  let org = null;
  if (orgId) org = getOrgById(orgId);
  if (!org) {
    const all = getOrganizations();
    org = all[0] || null;
  }
  res.json({ features: getFeatures(org) });
});

/** Full org data dump for backup (admin or developer) */
router.get('/export', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const orgId = req.orgId || req.headers['x-org-id'] || DEFAULT_ORG_ID;
  const org = getOrgById(orgId);
  const role = req.user?.role;
  if (role !== 'admin' && role !== 'developer') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const dump = {
    exportedAt: new Date().toISOString(),
    organization: org
      ? {
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          features: org.features || null
        }
      : null,
    teams: getTeams(orgId),
    players: getPlayers(orgId),
    auctions: getAuctions(orgId),
    bids: getBids(orgId),
    soldPlayers: getSoldPlayers(orgId),
    matches: getMatches(orgId)
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="org-export-${orgId}.json"`);
  res.send(JSON.stringify(dump, null, 2));
});

router.get('/', authMiddleware, requireRole('developer'), (req, res) => {
  res.json(getOrganizations());
});

module.exports = router;
