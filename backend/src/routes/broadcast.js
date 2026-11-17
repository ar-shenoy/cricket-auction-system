const express = require('express');
const { getBroadcast, upsertBroadcast, getOrganizations, getOrgBySlug, getMatches } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

const router = express.Router();

function defaultBrand(org) {
  return {
    orgId: org?.id || 'org-default',
    primaryColor: '#0a84ff',
    secondaryColor: '#1c1c1e',
    accentColor: '#30d158',
    logoUrl: '',
    sponsorLogos: [],
    sponsorPlacements: [],
    showSponsors: true,
    lowerThirdTitle: org?.name || 'League',
    lowerThirdSubtitle: 'Live'
  };
}

router.get('/settings', authMiddleware, tenantMiddleware, (req, res) => {
  const row = getBroadcast(req.orgId)[0];
  const org = (req.org) || null;
  res.json(row || defaultBrand(org || { id: req.orgId, name: 'League' }));
});

router.put('/settings', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const allowed = [
    'primaryColor', 'secondaryColor', 'accentColor', 'logoUrl',
    'sponsorLogos', 'sponsorPlacements', 'showSponsors', 'lowerThirdTitle', 'lowerThirdSubtitle'
  ];
  const data = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) data[k] = req.body[k];
  });
  const saved = upsertBroadcast(req.orgId, data);
  res.json(saved);
});

router.get('/public/lower-thirds', (req, res) => {
  const slug = req.query.slug;
  const org = slug ? getOrgBySlug(slug) : getOrganizations()[0];
  if (!org) return res.status(404).json({ error: 'Org not found' });
  const brand = getBroadcast(org.id)[0] || defaultBrand(org);
  const matches = getMatches(org.id);
  const live = matches.find(m => m.status === 'live' || m.status === 'rain_delay' || m.status === 'super_over');
  const d = live?.display || {};
  res.json({
    brand: {
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      accentColor: brand.accentColor,
      logoUrl: brand.logoUrl,
      sponsorLogos: brand.showSponsors === false ? [] : (brand.sponsorLogos || []),
      sponsorPlacements: brand.showSponsors === false ? [] : (brand.sponsorPlacements || []),
      title: brand.lowerThirdTitle || org.name,
      subtitle: brand.lowerThirdSubtitle || 'Live',
      showSponsors: brand.showSponsors !== false
    },
    match: live
      ? {
          id: live.id,
          name: live.name,
          status: live.status,
          teamAName: live.teamAName,
          teamBName: live.teamBName,
          score: d.score || `${live.innings1?.runs || 0}/${live.innings1?.wickets || 0}`,
          overs: d.overs || '0.0',
          crr: d.crr || null,
          rrr: d.rrr || null,
          target: d.target ?? null,
          striker: d.striker || null,
          nonStriker: d.nonStriker || null,
          bowler: d.bowler || null,
          thisOver: d.thisOver || [],
          inPowerplay: !!d.inPowerplay,
          freeHit: !!d.freeHit,
          rainDelay: !!d.rainDelay
        }
      : null,
    generatedAt: new Date().toISOString()
  });
});

router.get('/public/brand', (req, res) => {
  const slug = req.query.slug;
  const org = slug ? getOrgBySlug(slug) : getOrganizations()[0];
  if (!org) return res.status(404).json({ error: 'Org not found' });
  const brand = getBroadcast(org.id)[0] || defaultBrand(org);
  res.json({ org: { name: org.name, slug: org.slug }, brand });
});

module.exports = router;
