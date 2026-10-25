const jwt = require('jsonwebtoken');
const { db } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'pawalert-dev-secret-change-in-production-2026';

function signToken(user) {
  return jwt.sign(
    { userId: user.UserID, role: user.Role, name: user.Name, orgId: user.OrgID },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = db.prepare('SELECT * FROM User WHERE UserID = ?').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if ((user.Role === 'Coordinator' || user.Role === 'Rescuer') && !user.IsApproved) {
      return res.status(403).json({ error: 'Account pending approval' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.Role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { signToken, authRequired, requireRole, JWT_SECRET };
