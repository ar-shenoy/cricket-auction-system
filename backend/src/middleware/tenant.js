const { getOrgById, DEFAULT_ORG_ID } = require('../data/store');
const { getPlan } = require('../config/plans');

function tenantMiddleware(req, res, next) {
  const orgId = req.user?.orgId || req.headers['x-org-id'] || DEFAULT_ORG_ID;
  const org = getOrgById(orgId) || getOrgById(DEFAULT_ORG_ID);
  if (!org) {
    return res.status(400).json({ error: 'Organization not found' });
  }
  if (org.plan === 'pro' && org.planExpiresAt && new Date(org.planExpiresAt) < new Date()) {
    org.plan = 'free';
  }
  req.org = org;
  req.orgId = org.id;
  req.plan = getPlan(org.plan || 'free');
  next();
}

function requirePro(req, res, next) {
  if ((req.org?.plan || 'free') !== 'pro') {
    return res.status(402).json({
      error: 'Pro plan required',
      code: 'PRO_REQUIRED',
      upgrade: true
    });
  }
  next();
}

function checkLimit(limitKey, countFn) {
  return (req, res, next) => {
    const limit = req.plan?.limits?.[limitKey];
    if (limit == null) return next();
    const count = countFn(req);
    if (count >= limit) {
      return res.status(402).json({
        error: `Free plan limit reached (${limitKey}: ${limit}). Upgrade to Pro.`,
        code: 'LIMIT_REACHED',
        limitKey,
        limit,
        upgrade: true
      });
    }
    next();
  };
}

module.exports = { tenantMiddleware, requirePro, checkLimit };
