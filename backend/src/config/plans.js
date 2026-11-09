/**
 * Free vs Pro feature flags & soft limits.
 * Enforce in API so UI cannot bypass.
 */
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    priceInr: 0,
    limits: {
      maxTournaments: 1,
      maxMatchesPerTournament: 10,
      maxPlayers: 120,
      maxTeams: 8,
      maxScorers: 2,
      customBranding: false,
      hidePoweredBy: false,
      pdfExport: true,
      photoRetentionDays: 15,
      historyDays: 30
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceInr: 1499,
    limits: {
      maxTournaments: 50,
      maxMatchesPerTournament: 500,
      maxPlayers: 2000,
      maxTeams: 32,
      maxScorers: 20,
      customBranding: true,
      hidePoweredBy: true,
      pdfExport: true,
      photoRetentionDays: 15,
      historyDays: 365
    }
  }
};

function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

function canUse(org, feature) {
  const plan = getPlan(org?.plan || 'free');
  return !!plan.limits[feature];
}

const DEFAULT_FEATURES = {
  players: true,
  teams: true,
  auction: true,
  scoring: true,
  reports: true,
  billing: true,
  liveTeams: false,
  points: true,
  scoreboard: true
};

function getFeatures(org) {
  return { ...DEFAULT_FEATURES, ...(org && org.features ? org.features : {}) };
}

module.exports = { PLANS, getPlan, canUse, DEFAULT_FEATURES, getFeatures };
