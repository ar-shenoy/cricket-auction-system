/** Bid ladder rule: apply `increment` while current bid is below `upTo` (null = no upper limit). */
export interface BidRule {
  upTo: number | null;
  increment: number;
}

export const DEFAULT_BID_RULES: BidRule[] = [
  { upTo: 10000, increment: 1000 },
  { upTo: 20000, increment: 2000 },
  { upTo: null, increment: 5000 },
];

export function getIncrement(
  currentBid: number,
  auction?: { bidRules?: BidRule[]; bidIncrement?: number } | null
): number {
  const rules = auction?.bidRules?.length ? auction.bidRules : null;
  if (!rules) {
    return Number(auction?.bidIncrement) || 1000;
  }
  for (const rule of rules) {
    if (rule.upTo === null || rule.upTo === undefined || currentBid < Number(rule.upTo)) {
      return Number(rule.increment) || 1000;
    }
  }
  return Number(rules[rules.length - 1].increment) || 1000;
}

export function nextMinBid(
  currentBid: number,
  hasBidder: boolean,
  auction?: { bidRules?: BidRule[]; bidIncrement?: number } | null
): number {
  const step = getIncrement(currentBid, auction);
  return hasBidder ? currentBid + step : Math.max(currentBid, 0);
}
