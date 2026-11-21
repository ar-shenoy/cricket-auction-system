const express = require('express');
const { getAuditLog } = require('../data/store');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

const router = express.Router();

router.get('/', authMiddleware, requireRole('admin', 'developer'), tenantMiddleware, (req, res) => {
  const limit = Math.min(200, Math.max(20, Number(req.query.limit) || 100));
  const rows = getAuditLog(req.orgId)
    .slice()
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, limit);
  res.json({ rows, count: rows.length });
});

module.exports = router;
