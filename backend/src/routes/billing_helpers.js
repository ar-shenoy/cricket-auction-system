const {
  getPromoByCode, getPromoCodes, addPromoCode, updatePromoCode, deletePromoCode,
  incrementPromoRedemption, updateOrganization, updatePayment, getOrgById, getPayments
} = require('../data/store');
const { PLANS, getFeatures } = require('../config/plans');
const { v4: uuidv4 } = require('uuid');

function activatePro(orgId, paymentId, rpPaymentId, rpOrderId) {
  const expires = new Date();
  expires.setDate(expires.getDate() + 90);
  updateOrganization(orgId, { plan: 'pro', planExpiresAt: expires.toISOString() });
  if (paymentId) {
    updatePayment(paymentId, {
      status: 'paid',
      razorpayPaymentId: rpPaymentId,
      razorpayOrderId: rpOrderId,
      paidAt: new Date().toISOString()
    });
  }
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function evaluatePromo(rawCode, purpose, listPriceInr) {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: 'Enter a promo code' };
  const promo = getPromoByCode(code);
  if (!promo) return { ok: false, error: 'Invalid promo code' };
  if (promo.active === false) return { ok: false, error: 'Promo code is inactive' };
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: 'Promo code has expired' };
  }
  const max = promo.maxRedemptions;
  if (max != null && max >= 0 && (promo.redeemedCount || 0) >= max) {
    return { ok: false, error: 'Promo code fully redeemed' };
  }
  const applies = promo.appliesTo || 'pro_upgrade';
  if (applies !== 'all' && applies !== purpose) {
    return { ok: false, error: 'Promo does not apply to this purchase' };
  }
  let discountInr = 0;
  if (promo.discountType === 'fixed') {
    discountInr = Math.max(0, Number(promo.discountValue) || 0);
  } else {
    const pct = Math.min(100, Math.max(0, Number(promo.discountValue) || 0));
    discountInr = Math.round((listPriceInr * pct) / 100);
  }
  if (discountInr > listPriceInr) discountInr = listPriceInr;
  const amountInr = Math.max(0, listPriceInr - discountInr);
  return {
    ok: true,
    promo: {
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      appliesTo: promo.appliesTo
    },
    listPriceInr,
    discountInr,
    amountInr
  };
}

function orgPromoEnabled(org) {
  const f = getFeatures(org || {});
  return f.promoCodes === true;
}

module.exports = {
  activatePro,
  normalizeCode,
  evaluatePromo,
  orgPromoEnabled,
  PLANS,
  getOrgById,
  getPayments,
  incrementPromoRedemption,
  getPromoCodes,
  addPromoCode,
  updatePromoCode,
  deletePromoCode,
  getPromoByCode,
  uuidv4
};
