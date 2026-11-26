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
    whatsappEnabled: org?.whatsappEnabled !== false,
    whatsappWebhookUrl: org?.whatsappWebhookUrl || '',
    whatsappCallMeBotKey: org?.whatsappCallMeBotKey ? '••••' : '',
    whatsappPhones: org?.whatsappPhones || [],
    features: getFeatures(org),
    limits: getPlan(org?.plan || 'free').limits
  });
});

router.patch('/me', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const orgId = req.orgId || req.headers['x-org-id'] || DEFAULT_ORG_ID;
  const updates = {};
  if (typeof req.body?.soldWebhookUrl === 'string') updates.soldWebhookUrl = req.body.soldWebhookUrl.trim();
  if (typeof req.body?.name === 'string' && req.body.name.trim()) updates.name = req.body.name.trim();
  if (typeof req.body?.whatsappEnabled === 'boolean') updates.whatsappEnabled = req.body.whatsappEnabled;
  if (typeof req.body?.whatsappWebhookUrl === 'string') updates.whatsappWebhookUrl = req.body.whatsappWebhookUrl.trim();
  if (typeof req.body?.whatsappCallMeBotKey === 'string') updates.whatsappCallMeBotKey = req.body.whatsappCallMeBotKey.trim();
  if (req.body?.whatsappPhones != null) {
    if (Array.isArray(req.body.whatsappPhones)) {
      updates.whatsappPhones = req.body.whatsappPhones.map(p => String(p).trim()).filter(Boolean);
    } else {
      updates.whatsappPhones = String(req.body.whatsappPhones)
        .split(/[,;\n]+/)
        .map(s => s.trim())
        .filter(Boolean);
    }
  }
  const updated = updateOrganization(orgId, updates);
  res.json({ organization: updated, message: 'Organization updated' });
});

router.get('/features', authMiddleware, tenantMiddleware, (req, res) => {
  const org = req.org || getOrgById(req.user?.orgId) || getOrgById(DEFAULT_ORG_ID);
  res.json({ features: getFeatures(org), defaults: DEFAULT_FEATURES });
});

router.put('/features', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const incoming = req.body?.features && typeof req.body.features === 'object' ? req.body.features : {};
  const scope = req.body?.scope;
  const targetOrgId = req.body?.orgId || req.headers['x-org-id'] || req.orgId || DEFAULT_ORG_ID;

  function mergeFeatures(org) {
    const merged = { ...getFeatures(org) };
    Object.keys(DEFAULT_FEATURES).forEach(k => {
      if (typeof incoming[k] === 'boolean') merged[k] = incoming[k];
    });
    Object.keys(incoming).forEach(k => {
      if (typeof incoming[k] === 'boolean') merged[k] = incoming[k];
    });
    return merged;
  }

  if (req.user?.role === 'developer' && scope === 'all') {
    const results = [];
    for (const org of getOrganizations()) {
      const merged = mergeFeatures(org);
      const updated = updateOrganization(org.id, { features: merged });
      results.push({ orgId: org.id, name: org.name, features: getFeatures(updated) });
    }
    return res.json({ scope: 'all', results, message: `Features updated for ${results.length} organisations` });
  }

  const orgId = req.user?.role === 'developer' ? targetOrgId : (req.orgId || DEFAULT_ORG_ID);
  const org = getOrgById(orgId) || getOrgById(DEFAULT_ORG_ID);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });
  if (req.user?.role !== 'developer' && orgId !== req.orgId && orgId !== req.user?.orgId) {
    return res.status(403).json({ error: 'Cannot edit another organisation' });
  }
  const merged = mergeFeatures(org);
  const updated = updateOrganization(orgId, { features: merged });
  res.json({
    features: getFeatures(updated),
    orgId: org.id,
    orgName: org.name,
    message: 'Features updated'
  });
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
