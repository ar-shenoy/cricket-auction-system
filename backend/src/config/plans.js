/**
 * Free vs Pro plan limits + developer-toggled product features.
 * Free plan forces certain product features off (Pro unlocks).
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

/** Feature keys that stay OFF on Free plan (Pro required). */
const PRO_ONLY_FEATURES = [
  'intelligence',
  'intelMarketValues',
  'intelSpendEfficiency',
  'intelProjection',
  'intelPerformancePrice',
  'broadcast',
  'sponsorRotation',
  'soldWebhook',
  'sheetSync',
  'publicEmbed',
  'commentaryFeed',
  'matchDls',
  'matchSuperOver',
  'ownerPackExport',
  'spectatorLinks',
  'playerBulkPhoto',
  'auctionMultiSet',
  'promoCodes',
  'whatsappNotify'
];

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
  points: true,
  scoreboard: true,
  hub: true,
  broadcast: true,
  franchise: true,
  intelligence: true,

  publicLive: true,
  publicResults: true,
  publicMatchCentre: true,
  publicTournament: true,
  publicPoints: true,
  liveTeams: false,
  liveBidHistory: true,
  liveSoldList: true,
  spectatorLinks: true,

  auctionTimer: true,
  auctionNoBidGrace: true,
  auctionKeyboard: true,
  auctionExport: true,
  auctionBudgetHints: true,
  auctionRecallUnsold: true,
  auctionShareLive: true,
  auctionFocusMode: true,
  auctionPlayerCard: true,
  auctionUndoBid: true,
  auctionUndoSell: true,
  auctionSoftPause: true,
  auctionMultiSet: true,
  auctionRandomDraw: true,

  playerTags: true,
  playerNotes: true,
  playerBulkPhoto: true,
  playerMergeHelper: true,
  teamOwnerPortal: true,
  purseAuditLog: true,

  matchDls: true,
  matchSuperOver: true,
  matchRainDelay: true,
  matchCsvImport: true,
  scoringBigTap: true,
  scoringKeyboard: true,
  commentaryFeed: true,

  sponsorRotation: true,
  soldWebhook: true,
  sheetSync: true,
  publicEmbed: true,

  intelMarketValues: true,
  intelSpendEfficiency: true,
  intelProjection: true,
  intelPerformancePrice: true,
  ownerPackExport: true,
  reportPdfCsv: true,

  dashboardAnalytics: true,
  dashboardPublicFeeds: true,

  promoCodes: false,
  whatsappNotify: false
};

function getFeatures(org) {
  const merged = { ...DEFAULT_FEATURES, ...(org && org.features ? org.features : {}) };
  if ((org?.plan || 'free') === 'free') {
    for (const key of PRO_ONLY_FEATURES) {
      merged[key] = false;
    }
  }
  return merged;
}

module.exports = { PLANS, getPlan, canUse, DEFAULT_FEATURES, getFeatures, PRO_ONLY_FEATURES };
