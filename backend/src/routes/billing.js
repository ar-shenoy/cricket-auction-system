const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { addPayment, updatePayment, updateOrganization, getPayments, getOrgById } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { PLANS } = require('../config/plans');

const router = express.Router();
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || KEY_SECRET;
const hasRazorpay = () => !!(KEY_ID && KEY_SECRET);

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

router.post('/create-order', authMiddleware, requireRole('admin'), tenantMiddleware, async (req, res) => {
  try {
    const amountInr = PLANS.pro.priceInr;
    const amountPaise = amountInr * 100;
    const receipt = `pro_${req.orgId.slice(0, 8)}_${Date.now()}`;
    const payment = addPayment({
      id: uuidv4(), orgId: req.orgId, amountInr, currency: 'INR', status: 'created',
      purpose: 'pro_upgrade', receipt, createdAt: new Date().toISOString()
    });
    if (!hasRazorpay()) {
      return res.json({
        demo: true,
        message: 'Razorpay keys not set. Use /api/billing/demo-activate for testing.',
        orderId: `order_demo_${payment.id}`, amount: amountPaise, currency: 'INR',
        keyId: null, paymentId: payment.id, amountInr
      });
    }
    const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
    const rpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes: { orgId: req.orgId, paymentId: payment.id } })
    });
    const order = await rpRes.json();
    if (!rpRes.ok) return res.status(502).json({ error: 'Failed to create payment order', details: order });
    updatePayment(payment.id, { razorpayOrderId: order.id });
    res.json({ demo: false, orderId: order.id, amount: order.amount, currency: order.currency, keyId: KEY_ID, paymentId: payment.id, amountInr });
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
  activatePro(req.orgId, paymentId, razorpay_payment_id, razorpay_order_id);
  res.json({ success: true, plan: 'pro', organization: getOrgById(req.orgId) });
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
      if (orgId) activatePro(orgId, paymentId, payload.id, payload.order_id);
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
  activatePro(req.orgId, null, 'demo', 'demo');
  res.json({ success: true, plan: 'pro', demo: true, organization: getOrgById(req.orgId) });
});

router.get('/history', authMiddleware, requireRole('admin'), tenantMiddleware, (req, res) => {
  res.json(getPayments(req.orgId));
});

module.exports = router;
