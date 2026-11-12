const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cricket_auction_secret_key_2026';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    const role = req.user.role;
    // Developer-only gates stay exclusive
    if (roles.length === 1 && roles[0] === 'developer') {
      if (role !== 'developer') {
        return res.status(403).json({ error: 'Access denied. Developer only.' });
      }
      return next();
    }
    // Platform developer may perform admin/manager actions
    if (role === 'developer') return next();
    if (!roles.includes(role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, JWT_SECRET };
