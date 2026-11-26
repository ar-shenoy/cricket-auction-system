const express = require('express');
const crypto = require('crypto');
const { addPayment, updatePayment } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const H = require('./billing_helpers');

const router = express.Router();
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || KEY_SECRET;
const hasRazorpay = () => !!(KEY_ID && KEY_SECRET);

router.get('/promos', authMiddleware, requireRole('developer'), (_req, res) => {
  const list = H.getPromoCodes().slice().sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
  res.json(list);
});

router.post('/promos', authMiddleware, requireRole('developer'), (req, res) => {
  try {
    const code = H.normalizeCode(req.body.code);
    if (!code || code.length < 3) return res.status(400).json({ error: 'Code must be at least 3 characters' });
    if (H.getPromoByCode(code)) return res.status(409).json({ error: 'Code already exists' });
    const discountType = req.body.discountType === 'fixed' ? 'fixed' : 'percent';
    const discountValue = Number(req.body.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      return res.status(400).json({ error: 'Discount value must be a positive number' });
    }
    if (discountType === 'percent' && discountValue > 100) {
      return res.status(400).json({ error: 'Percent discount cannot exceed 100' });
    }
    const maxRedemptions = req.body.maxRedemptions == null || req.body.maxRedemptions === ''
      ? null
      : Math.max(0, parseInt(req.body.maxRedemptions, 10));
    const row = H.addPromoCode({
      id: H.uuidv4(),
      code,
      discountType,
      discountValue,
      appliesTo: req.body.appliesTo === 'all' ? 'all' : 'pro_upgrade',
      maxRedemptions,
      redeemedCount: 0,
      expiresAt: req.body.expiresAt || null,
      active: req.body.active !== false,
      note: String(req.body.note || '').slice(0, 200),
      createdBy: req.user?.id || null,
      createdAt: new Date().toISOString()
    });
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create promo' });
  }
});

router.patch('/promos/:id', authMiddleware, requireRole('developer'), (req, res) => {
  const existing = H.getPromoCodes().find(p => p.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updates = {};
  if (req.body.code != null) {
    const code = H.normalizeCode(req.body.code);
    if (code.length < 3) return res.status(400).json({ error: 'Code too short' });
    const clash = H.getPromoByCode(code);
    if (clash && clash.id !== existing.id) return res.status(409).json({ error: 'Code already exists' });
    updates.code = code;
  }
  if (req.body.discountType != null) updates.discountType = req.body.discountType === 'fixed' ? 'fixed' : 'percent';
  if (req.body.discountValue != null) {
    const v = Number(req.body.discountValue);
    if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: 'Invalid discount' });
    updates.discountValue = v;
  }
  if (req.body.appliesTo != null) updates.appliesTo = req.body.appliesTo === 'all' ? 'all' : 'pro_upgrade';
  if (req.body.maxRedemptions !== undefined) {
    updates.maxRedemptions = req.body.maxRedemptions == null || req.body.maxRedemptions === ''
      ? null
      : Math.max(0, parseInt(req.body.maxRedemptions, 10));
  }
  if (req.body.expiresAt !== undefined) updates.expiresAt = req.body.expiresAt || null;
  if (req.body.active !== undefined) updates.active = !!req.body.active;
  if (req.body.note !== undefined) updates.note = String(req.body.note || '').slice(0, 200);
  res.json(H.updatePromoCode(existing.id, updates));
});

router.delete('/promos/:id', authMiddleware, requireRole('developer'), (req, res) => {
  const ok = H.deletePromoCode(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.post('/validate-promo', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  const org = H.getOrgById(req.orgId);
  if (!H.orgPromoEnabled(org)) {
    return res.status(403).json({ error: 'Promo codes are not enabled for this organisation' });
  }
  const result = H.evaluatePromo(req.body.code, 'pro_upgrade', H.PLANS.pro.priceInr);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.post('/create-order', authMiddleware, requireRole('admin'), tenantMiddleware, async (req, res) => {
  try {
    const org = H.getOrgById(req.orgId);
    const listPriceInr = H.PLANS.pro.priceInr;
    let amountInr = listPriceInr;
    let discountInr = 0;
    let promoMeta = null;

    if (req.body.promoCode) {
      if (!H.orgPromoEnabled(org)) {
        return res.status(403).json({ error: 'Promo codes are not enabled for this organisation' });
      }
      const result = H.evaluatePromo(req.body.promoCode, 'pro_upgrade', listPriceInr);
      if (!result.ok) return res.status(400).json({ error: result.error });
      amountInr = result.amountInr;
      discountInr = result.discountInr;
      promoMeta = result.promo;
    }

    const amountPaise = Math.max(100, amountInr * 100);
    if (amountInr <= 0) {
      const payment = addPayment({
        id: H.uuidv4(),
        orgId: req.orgId,
        amountInr: 0,
        listPriceInr,
        discountInr,
        promoCode: promoMeta?.code || null,
        promoId: promoMeta?.id || null,
        currency: 'INR',
        status: 'paid',
        purpose: 'pro_upgrade',
        receipt: `pro_free_${req.orgId.slice(0, 8)}_${Date.now()}`,
        createdAt: new Date().toISOString(),
        paidAt: new Date().toISOString()
      });
      if (promoMeta?.id) H.incrementPromoRedemption(promoMeta.id);
      H.activatePro(req.orgId, payment.id, 'promo_full', 'promo_full');
      return res.json({
        free: true,
        success: true,
        plan: 'pro',
        amountInr: 0,
        discountInr,
        promo: promoMeta,
        organization: H.getOrgById(req.orgId)
      });
    }

    const receipt = `pro_${req.orgId.slice(0, 8)}_${Date.now()}`;
    const payment = addPayment({
      id: H.uuidv4(),
      orgId: req.orgId,
      amountInr,
      listPriceInr,
      discountInr,
      promoCode: promoMeta?.code || null,
      promoId: promoMeta?.id || null,
      currency: 'INR',
      status: 'created',
      purpose: 'pro_upgrade',
      receipt,
      createdAt: new Date().toISOString()
    });

    if (!hasRazorpay()) {
      return res.json({
        demo: true,
        message: 'Razorpay keys not set. Use /api/billing/demo-activate for testing.',
        orderId: `order_demo_${payment.id}`,
        amount: amountPaise,
        currency: 'INR',
        keyId: null,
        paymentId: payment.id,
        amountInr,
        listPriceInr,
        discountInr,
        promo: promoMeta
      });
    }

    const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
    const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: { orgId: req.orgId, paymentId: payment.id, promoCode: promoMeta?.code || '' }
      })
    });
    const order = await rpRes.json();
    if (!rpRes.ok) return res.status(502).json({ error: 'Failed to create payment order', details: order });
    updatePayment(payment.id, { razorpayOrderId: order.id });
    res.json({
      demo: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: KEY_ID,
      paymentId: payment.id,
      amountInr,
      listPriceInr,
      discountInr,
      promo: promoMeta
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Billing error' });
  }
});

router.post('/verify', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;
  if (!hasRazorpay()) return res.status(400).json({ error: 'Razorpay not configured' });
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(body).digest('hex');
  if (expected !== razorpay_signature) return res.status(400).json({ error: 'Invalid payment signature' });
  const pay = H.getPayments(req.orgId).find(p => p.id === paymentId);
  if (pay?.promoId) {
    try { H.incrementPromoRedemption(pay.promoId); } catch (_) {}
  }
  H.activatePro(req.orgId, paymentId, razorpay_payment_id, razorpay_order_id);
  res.json({ success: true, plan: 'pro', organization: H.getOrgById(req.orgId) });
});

router.post('/webhook', express.json({ type: '*/*' }), (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (WEBHOOK_SECRET && signature) {
      const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(req.body)).digest('hex');
      if (expected !== signature) return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    const event = req.body?.event;
    const payload = req.body?.payload?.payment?.entity || req.body?.payload?.order?.entity;
    if (event === 'payment.captured' && payload) {
      const orgId = payload.notes?.orgId;
      const paymentId = payload.notes?.paymentId;
      if (orgId) {
        if (paymentId) {
          const pay = H.getPayments(orgId).find(p => p.id === paymentId);
          if (pay?.promoId) {
            try { H.incrementPromoRedemption(pay.promoId); } catch (_) {}
          }
        }
        H.activatePro(orgId, paymentId, payload.id, payload.order_id);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error', err);
    res.status(500).json({ error: 'Webhook failed' });
  }
});

router.post('/demo-activate', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  if (hasRazorpay() && process.env.ALLOW_DEMO_UPGRADE !== 'true') {
    return res.status(403).json({ error: 'Demo upgrade disabled when Razorpay is configured' });
  }
  const org = H.getOrgById(req.orgId);
  let promoMeta = null;
  if (req.body.promoCode && H.orgPromoEnabled(org)) {
    const result = H.evaluatePromo(req.body.promoCode, 'pro_upgrade', H.PLANS.pro.priceInr);
    if (result.ok) {
      promoMeta = result.promo;
      if (promoMeta?.id) H.incrementPromoRedemption(promoMeta.id);
    }
  }
  H.activatePro(req.orgId, null, 'demo', 'demo');
  res.json({
    success: true,
    plan: 'pro',
    demo: true,
    promo: promoMeta,
    organization: H.getOrgById(req.orgId)
  });
});

router.get('/history', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  res.json(H.getPayments(req.orgId));
});

module.exports = router;
