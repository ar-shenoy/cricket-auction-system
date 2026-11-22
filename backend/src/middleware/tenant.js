const { getOrgById, DEFAULT_ORG_ID } = require('../data/store');
const { getPlan } = require('../config/plans');

/**
 * Attach org scope from JWT.
 * - Normal users/admins: locked to their orgId (cannot see other orgs).
 * - Platform developer: can pass x-org-id to inspect one org, or omit for global scope (orgId null).
 */
function tenantMiddleware(req, res, next) {
  const isDeveloper = req.user?.role === 'developer'
    || (req.user?.email || '').toLowerCase() === 'developer@auction.com';

  if (isDeveloper) {
    const headerOrg = req.headers['x-org-id'];
    if (headerOrg) {
      const org = getOrgById(String(headerOrg)) || getOrgById(DEFAULT_ORG_ID);
      req.org = org;
      req.orgId = org?.id || String(headerOrg);
      req.plan = getPlan(org?.plan || 'free');
    } else {
      // Global platform view — store getters with null orgId return all rows
      req.org = null;
      req.orgId = null;
      req.plan = getPlan('pro');
    }
    req.isPlatformDev = true;
    return next();
  }

  const orgId = req.user?.orgId || DEFAULT_ORG_ID;
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
  req.isPlatformDev = false;
  next();
}

function requirePro(req, res, next) {
  if (req.isPlatformDev || req.user?.role === 'developer') return next();
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
    if (req.isPlatformDev || req.user?.role === 'developer') return next();
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
