const express = require('express');
const { getBroadcast, upsertBroadcast, getOrgById } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

const router = express.Router();

function defaultBrand(orgId, name) {
  return {
    orgId,
    primaryColor: '#0a84ff',
    secondaryColor: '#1c1c1e',
    accentColor: '#30d158',
    logoUrl: null,
    sponsorLogos: [],
    showSponsors: true,
    sponsorRotateSeconds: 8,
    lowerThirdTitle: name || 'Live',
    lowerThirdSubtitle: 'AuctionScore',
    sheetSyncUrl: null,
    sheetSyncEnabled: false
  };
}

router.get('/settings', authMiddleware, tenantMiddleware, (req, res) => {
  const row = getBroadcast(req.orgId)[0];
  const org = getOrgById(req.orgId);
  res.json(row || defaultBrand(req.orgId, org?.name));
});

router.put('/settings', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  const allowed = [
    'primaryColor', 'secondaryColor', 'accentColor', 'logoUrl',
    'sponsorLogos', 'showSponsors', 'sponsorRotateSeconds',
    'lowerThirdTitle', 'lowerThirdSubtitle', 'sheetSyncUrl', 'sheetSyncEnabled'
  ];
  const data = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) data[k] = req.body[k];
  });
  if (data.sponsorRotateSeconds != null) {
    data.sponsorRotateSeconds = Math.max(0, Math.min(120, Number(data.sponsorRotateSeconds) || 0));
  }
  if (Array.isArray(data.sponsorLogos)) {
    data.sponsorLogos = data.sponsorLogos
      .slice(0, 20)
      .map(s => ({
        url: String(s.url || '').slice(0, 500),
        label: s.label ? String(s.label).slice(0, 40) : null,
        position: ['top', 'bottom', 'left', 'right', 'corner'].includes(s.position) ? s.position : 'bottom'
      }))
      .filter(s => s.url);
  }
  if (data.sheetSyncUrl != null) {
    const u = String(data.sheetSyncUrl || '').trim();
    if (u && !/^https?:\/\//i.test(u)) {
      return res.status(400).json({ error: 'sheetSyncUrl must be http(s)' });
    }
    data.sheetSyncUrl = u.slice(0, 500);
  }
  const org = getOrgById(req.orgId);
  const base = getBroadcast(req.orgId)[0] || defaultBrand(req.orgId, org?.name);
  const updated = upsertBroadcast(req.orgId, { ...base, ...data });
  res.json(updated);
});

router.get('/public', (req, res) => {
  const orgId = req.query.orgId || req.headers['x-org-id'];
  let row = null;
  if (orgId) row = getBroadcast(orgId)[0];
  if (!row) {
    const all = getBroadcast();
    row = all[0] || defaultBrand('org-default', 'Live');
  }
  const logos = row.showSponsors === false ? [] : (Array.isArray(row.sponsorLogos) ? row.sponsorLogos : []);
  const rotate = Number(row.sponsorRotateSeconds) || 0;
  let activeIndex = 0;
  if (rotate > 0 && logos.length > 1) {
    activeIndex = Math.floor(Date.now() / (rotate * 1000)) % logos.length;
  }
  res.json({
    logoUrl: row.logoUrl || null,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    lowerThirdTitle: row.lowerThirdTitle,
    lowerThirdSubtitle: row.lowerThirdSubtitle,
    showSponsors: row.showSponsors !== false,
    sponsorRotateSeconds: rotate,
    sponsorLogos: logos,
    activeSponsorIndex: activeIndex,
    activeSponsor: logos.length ? logos[activeIndex] : null
  });
});

module.exports = router;
