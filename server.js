/**
 * PawAlert – zero-dependency HTTP server (Node built-ins only)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const { helpers, UPLOADS_DIR } = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pawalert-dev-secret-2026';
const FRONTEND = path.join(__dirname, '..', 'frontend');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp'
};

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signToken(user) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    userId: user.UserID, role: user.Role, name: user.Name, orgId: user.OrgID,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600
  }));
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + payload).digest());
  return header + '.' + payload + '.' + sig;
}
function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(parts[0] + '.' + parts[1]).digest());
    if (sig !== parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function send(res, status, data, headers) {
  headers = headers || {};
  headers['Access-Control-Allow-Origin'] = '*';
  headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS';
  if (Buffer.isBuffer(data)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/octet-stream';
    headers['Content-Length'] = data.length;
    res.writeHead(status, headers);
    res.end(data);
  } else if (typeof data === 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
    res.writeHead(status, headers);
    res.end(data);
  } else {
    headers['Content-Type'] = 'application/json';
    res.writeHead(status, headers);
    res.end(JSON.stringify(data));
  }
}
function readBody(req) {
  return new Promise(function(resolve, reject) {
    const chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() {
      const buf = Buffer.concat(chunks);
      const ct = (req.headers['content-type'] || '');
      if (ct.indexOf('multipart/form-data') >= 0) {
        resolve(parseMultipart(buf, ct));
      } else if (ct.indexOf('application/json') >= 0) {
        try { resolve({ fields: JSON.parse(buf.toString() || '{}'), file: null }); }
        catch { resolve({ fields: {}, file: null }); }
      } else {
        const params = new URLSearchParams(buf.toString());
        const fields = {};
        params.forEach(function(v, k) { fields[k] = v; });
        resolve({ fields: fields, file: null });
      }
    });
    req.on('error', reject);
  });
}
function parseMultipart(buf, ct) {
  const m = ct.match(/boundary=(?:"([^"]+)"|([^\s;]+))/i);
  if (!m) return { fields: {}, file: null };
  const boundary = '--' + (m[1] || m[2]);
  const parts = buf.toString('binary').split(boundary);
  const fields = {};
  let file = null;
  parts.forEach(function(part) {
    if (part === '--\r\n' || part === '--' || part.length < 10) return;
    const idx = part.indexOf('\r\n\r\n');
    if (idx < 0) return;
    const head = part.slice(0, idx);
    let body = part.slice(idx + 4);
    if (body.endsWith('\r\n')) body = body.slice(0, -2);
    if (body.endsWith('--')) body = body.slice(0, -2);
    if (body.endsWith('\r\n')) body = body.slice(0, -2);
    const nameM = head.match(/name="([^"]+)"/);
    const fileM = head.match(/filename="([^"]+)"/);
    if (!nameM) return;
    if (fileM && fileM[1]) {
      const fname = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + path.extname(fileM[1]);
      const fpath = path.join(UPLOADS_DIR, fname);
      fs.writeFileSync(fpath, Buffer.from(body, 'binary'));
      file = { filename: fname, path: fpath, field: nameM[1] };
      fields[nameM[1]] = '/uploads/' + fname;
    } else {
      fields[nameM[1]] = Buffer.from(body, 'binary').toString('utf8');
    }
  });
  return { fields: fields, file: file };
}

async function await auth(req) {
  const h = req.headers.authorization || '';
  if (h.indexOf('Bearer ') !== 0) return null;
  const payload = verifyToken(h.slice(7));
  if (!payload) return null;
  return await helpers.getUserById(payload.userId);
}

function trackingCode() {
  return 'TRK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function await notifyOnDuty(caseRow, title, message) {
  const rescuers = await helpers.getOnDutyRescuers();
  for (const r of rescuers) {
    for (const ch of ['InApp', 'Push']) {
      await helpers.createNotification({ CaseID: caseRow.CaseID, RecipientID: r.UserID, channel: ch, Title: title, Message: message });
    }
    if (caseRow.UrgencyLevel === 'Critical') {
      await helpers.createNotification({ CaseID: caseRow.CaseID, RecipientID: r.UserID, channel: 'SMS', Title: title, Message: '[PawAlert CRITICAL] ' + message });
    }
  }
}

const ALLOWED = {
  Pending: ['Verified', 'Rejected'], Verified: ['Assigned', 'Rejected'],
  Assigned: ['Accepted', 'Declined'], Accepted: ['EnRoute', 'UnableToLocate'],
  Declined: ['Verified'], EnRoute: ['Rescued', 'UnableToLocate'],
  Rescued: ['AtVetCare', 'Completed'], AtVetCare: ['Completed'],
  UnableToLocate: ['Closed', 'Verified'], Rejected: ['Closed'], Completed: [], Closed: []
};

async function handleApi(req, res, pathname) {
  const method = req.method;
  if (method === 'OPTIONS') return send(res, 204, '');

  // AUTH
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { fields } = await readBody(req);
    if (!fields.name || !fields.phone || !fields.password) return send(res, 400, { error: 'Name, phone and password required' });
    if (fields.email && await helpers.getUserByEmail(fields.email)) return send(res, 409, { error: 'Email already registered' });
    const role = ['Reporter', 'Coordinator', 'Rescuer'].indexOf(fields.role) >= 0 ? fields.role : 'Reporter';
    const needs = role === 'Coordinator' || role === 'Rescuer';
    const user = await helpers.createUser({
      Name: fields.name, Email: fields.email || null, Phone: fields.phone,
      PasswordHash: helpers.hashPassword(fields.password), Role: role,
      OrgID: fields.orgId ? +fields.orgId : null, IsApproved: needs ? 0 : 1
    });
    return send(res, 201, { message: needs ? 'Registration successful. Awaiting administrator approval.' : 'Registration successful.', userId: user.UserID });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { fields } = await readBody(req);
    const user = await helpers.getUserByEmail(fields.email);
    if (!user || !helpers.verifyPassword(fields.password, user.PasswordHash)) return send(res, 401, { error: 'Invalid credentials' });
    if ((user.Role === 'Coordinator' || user.Role === 'Rescuer') && !user.IsApproved) return send(res, 403, { error: 'Account pending administrator approval' });
    return send(res, 200, {
      token: signToken(user),
      user: { id: user.UserID, name: user.Name, email: user.Email, role: user.Role, orgId: user.OrgID, isAvailable: !!user.IsAvailable }
    });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = await auth(req);
    if (!user) return send(res, 401, { error: 'Authentication required' });
    return send(res, 200, { id: user.UserID, name: user.Name, email: user.Email, phone: user.Phone, role: user.Role, orgId: user.OrgID, isAvailable: !!user.IsAvailable });
  }

  if (pathname === '/api/organizations' && method === 'GET') return send(res, 200, await helpers.listOrgs());

  if (pathname === '/api/teams' && method === 'GET') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    return send(res, 200, await helpers.listTeams(user.Role === 'Admin' ? null : user.OrgID));
  }

  if (pathname === '/api/rescuers' && method === 'GET') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    if (['Coordinator', 'Admin'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Insufficient permissions' });
    return send(res, 200, await helpers.listRescuers(user.Role === 'Admin' ? null : user.OrgID));
  }

  // CREATE CASE
  if (pathname === '/api/cases' && method === 'POST') {
    const { fields, file } = await readBody(req);
    if (!fields.animalType || !fields.conditionType || !fields.urgencyLevel || !fields.locationText) {
      return send(res, 400, { error: 'Mandatory fields missing' });
    }
    let reporterId = null;
    const u = await auth(req);
    if (u) reporterId = u.UserID;
    if (!reporterId && (!fields.guestName || !fields.guestPhone)) {
      return send(res, 400, { error: 'Guest reports require guestName and guestPhone' });
    }
    const caseId = await helpers.nextCaseId();
    const track = trackingCode();
    const photoURL = file ? '/uploads/' + file.filename : (fields.photo || null);
    const caseRow = await helpers.createCase({
      CaseID: caseId, ReporterID: reporterId,
      GuestName: reporterId ? null : fields.guestName,
      GuestPhone: reporterId ? null : fields.guestPhone,
      AnimalType: fields.animalType, ConditionType: fields.conditionType,
      UrgencyLevel: fields.urgencyLevel, LocationText: fields.locationText,
      GeoLat: fields.geoLat ? parseFloat(fields.geoLat) : null,
      GeoLng: fields.geoLng ? parseFloat(fields.geoLng) : null,
      PhotoURL: photoURL, Description: fields.description || null, TrackingCode: track
    });
    await helpers.addStatusUpdate(caseId, reporterId || 1, 'Pending', 'Case submitted');
    if (fields.urgencyLevel === 'Critical' || fields.urgencyLevel === 'High') {
      await notifyOnDuty(caseRow, fields.urgencyLevel + ' Rescue Alert',
        fields.animalType + ' – ' + fields.conditionType + ' at ' + fields.locationText + '. Case ' + caseId);
    }
    const nearby = await helpers.findNearby(caseId,
      fields.geoLat ? parseFloat(fields.geoLat) : null,
      fields.geoLng ? parseFloat(fields.geoLng) : null, fields.locationText);
    return send(res, 201, {
      caseId: caseId, trackingCode: track, status: 'Pending',
      message: 'Report submitted successfully', nearbyCases: nearby,
      emergencyNotified: fields.urgencyLevel === 'Critical' || fields.urgencyLevel === 'High'
    });
  }

  // TRACK
  const trackMatch = pathname.match(/^\/api\/cases\/track\/(.+)$/);
  if (trackMatch && method === 'GET') {
    const c = await helpers.getCase(decodeURIComponent(trackMatch[1]));
    if (!c) return send(res, 404, { error: 'Case not found' });
    return send(res, 200, {
      caseId: c.CaseID, animalType: c.AnimalType, conditionType: c.ConditionType,
      urgencyLevel: c.UrgencyLevel, locationText: c.LocationText, status: c.Status,
      photoURL: c.PhotoURL, description: c.Description,
      createdAt: c.CreatedAt, updatedAt: c.UpdatedAt, history: await helpers.getHistory(c.CaseID)
    });
  }

  // LIST CASES
  if (pathname === '/api/cases' && method === 'GET') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    const url = new URL(req.url, 'http://localhost');
    const q = Object.fromEntries(url.searchParams);
    let teamIds = [];
    if (user.Role === 'Rescuer' || user.Role === 'Coordinator') {
      const teams = await helpers.listTeams(user.OrgID);
      teamIds = teams.map(function(t) { return t.TeamID; });
    }
    let filterFn = null;
    if (user.Role === 'Reporter' || q.mine === '1') {
      filterFn = function(c) { return c.ReporterID === user.UserID; };
    } else if (user.Role === 'Rescuer') {
      filterFn = function(c) {
        return c.AssignedRescuerID === user.UserID || teamIds.indexOf(c.AssignedTeamID) >= 0;
      };
    } else if (user.Role === 'Coordinator') {
      filterFn = function(c) {
        return teamIds.indexOf(c.AssignedTeamID) >= 0 || ['Pending', 'Verified', 'Declined'].indexOf(c.Status) >= 0;
      };
    }
    let cases = await helpers.listCases(filterFn);
    if (q.status) cases = cases.filter(function(c) { return c.Status === q.status; });
    if (q.urgency) cases = cases.filter(function(c) { return c.UrgencyLevel === q.urgency; });
    if (q.search) {
      const s = q.search.toLowerCase();
      cases = cases.filter(function(c) { return (c.CaseID + c.LocationText + (c.Description || '')).toLowerCase().indexOf(s) >= 0; });
    }
    return send(res, 200, cases);
  }

  // CASE DETAIL
  const caseMatch = pathname.match(/^\/api\/cases\/([^/]+)$/);
  if (caseMatch && method === 'GET') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    const c = await helpers.getCase(caseMatch[1]);
    if (!c) return send(res, 404, { error: 'Case not found' });
    const enriched = await helpers.enrichCase(c);
    enriched.history = await helpers.getHistory(c.CaseID);
    return send(res, 200, enriched);
  }

  // CASE ACTIONS
  const actionMatch = pathname.match(/^\/api\/cases\/([^/]+)\/(verify|reject|assign|accept|decline|status)$/);
  if (actionMatch && method === 'POST') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    const caseId = actionMatch[1], action = actionMatch[2];
    const c = await helpers.getCase(caseId);
    if (!c) return send(res, 404, { error: 'Case not found' });
    const { fields } = await readBody(req);

    if (action === 'verify') {
      if (['Coordinator', 'Admin'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Forbidden' });
      if (['Pending', 'Declined'].indexOf(c.Status) < 0) return send(res, 400, { error: 'Cannot verify from ' + c.Status });
      await helpers.addStatusUpdate(c.CaseID, user.UserID, 'Verified', fields.notes || 'Case verified');
      return send(res, 200, { message: 'Case verified', status: 'Verified' });
    }
    if (action === 'reject') {
      if (['Coordinator', 'Admin'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Forbidden' });
      const reason = fields.reason || 'Rejected as duplicate/false report';
      await helpers.addStatusUpdate(c.CaseID, user.UserID, 'Rejected', reason);
      return send(res, 200, { message: 'Case rejected', status: 'Rejected' });
    }
    if (action === 'assign') {
      if (['Coordinator', 'Admin'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Forbidden' });
      if (c.Status === 'Pending') return send(res, 400, { error: 'Verify the case before assigning' });
      const teamId = fields.teamId ? +fields.teamId : null;
      const rescuerId = fields.rescuerId ? +fields.rescuerId : null;
      if (!teamId && !rescuerId) return send(res, 400, { error: 'teamId or rescuerId required' });
      await helpers.updateCase(c.CaseID, { AssignedTeamID: teamId, AssignedRescuerID: rescuerId, Status: 'Assigned' });
      await helpers.addStatusUpdate(c.CaseID, user.UserID, 'Assigned', 'Assigned');
      const recipients = [];
      if (rescuerId) recipients.push(rescuerId);
      const rescuerList = await helpers.listRescuers(user.Role === 'Admin' ? null : user.OrgID);
      rescuerList.forEach(function(r) { recipients.push(r.UserID); });
      const unique = recipients.filter(function(v, i, a) { return a.indexOf(v) === i; });
      for (const rid of unique) {
        await helpers.createNotification({ CaseID: c.CaseID, RecipientID: rid, channel: 'InApp', Title: 'New Case Assignment', Message: 'Case ' + c.CaseID + ' assigned (' + c.UrgencyLevel + ')' });
        await helpers.createNotification({ CaseID: c.CaseID, RecipientID: rid, channel: 'Push', Title: 'New Case Assignment', Message: 'Case ' + c.CaseID + ': ' + c.AnimalType });
        if (c.UrgencyLevel === 'Critical') {
          await helpers.createNotification({ CaseID: c.CaseID, RecipientID: rid, channel: 'SMS', Title: 'CRITICAL', Message: '[PawAlert] Critical case ' + c.CaseID });
        }
      }
      return send(res, 200, { message: 'Case assigned', status: 'Assigned' });
    }
    if (action === 'accept') {
      if (['Rescuer', 'Admin'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Forbidden' });
      if (c.Status !== 'Assigned') return send(res, 400, { error: 'Not in Assigned state' });
      await helpers.updateCase(c.CaseID, { AssignedRescuerID: user.UserID, Status: 'Accepted' });
      await helpers.addStatusUpdate(c.CaseID, user.UserID, 'Accepted', 'Accepted');
      if (c.ReporterID) await helpers.createNotification({ CaseID: c.CaseID, RecipientID: c.ReporterID, channel: 'InApp', Title: 'Help is on the way', Message: 'Rescuer accepted ' + c.CaseID });
      return send(res, 200, { message: 'Case accepted', status: 'Accepted' });
    }
    if (action === 'decline') {
      if (['Rescuer', 'Admin'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Forbidden' });
      if (c.Status !== 'Assigned') return send(res, 400, { error: 'Not in Assigned state' });
      await helpers.updateCase(c.CaseID, { AssignedTeamID: null, AssignedRescuerID: null, Status: 'Verified' });
      await helpers.addStatusUpdate(c.CaseID, user.UserID, 'Declined', fields.reason || 'Declined');
      await helpers.addStatusUpdate(c.CaseID, user.UserID, 'Verified', 'Returned for reassignment');
      return send(res, 200, { message: 'Declined', status: 'Verified' });
    }
    if (action === 'status') {
      if (['Rescuer', 'Coordinator', 'Admin'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Forbidden' });
      const status = fields.status;
      if (!status) return send(res, 400, { error: 'status required' });
      const allowed = ALLOWED[c.Status] || [];
      if (allowed.indexOf(status) < 0 && user.Role !== 'Admin') {
        return send(res, 400, { error: 'Invalid transition from ' + c.Status + ' to ' + status, allowed: allowed });
      }
      if (status === 'Completed' && await helpers.countProgressUpdates(c.CaseID) === 0 && user.Role !== 'Admin') {
        return send(res, 400, { error: 'Cannot mark Completed without prior progress (BR-4)' });
      }
      await helpers.addStatusUpdate(c.CaseID, user.UserID, status, fields.notes || null);
      if (c.ReporterID) await helpers.createNotification({ CaseID: c.CaseID, RecipientID: c.ReporterID, channel: 'InApp', Title: 'Status Update', Message: 'Case ' + c.CaseID + ' is now: ' + status });
      return send(res, 200, { message: 'Status updated', status: status });
    }
  }

  // NOTIFICATIONS
  if (pathname === '/api/notifications' && method === 'GET') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    return send(res, 200, await helpers.listNotifications(user.UserID));
  }
  const notifMatch = pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
  if (notifMatch && method === 'POST') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    await helpers.markNotifRead(notifMatch[1], user.UserID);
    return send(res, 200, { ok: true });
  }
  if (pathname === '/api/notifications/read-all' && method === 'POST') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    await helpers.markAllRead(user.UserID);
    return send(res, 200, { ok: true });
  }

  // AVAILABILITY
  if (pathname === '/api/users/me/availability' && method === 'POST') {
    const user = await auth(req); if (!user) return send(res, 401, { error: 'Authentication required' });
    if (user.Role !== 'Rescuer') return send(res, 403, { error: 'Forbidden' });
    const { fields } = await readBody(req);
    await helpers.updateUser(user.UserID, { IsAvailable: fields.available ? 1 : 0 });
    return send(res, 200, { isAvailable: !!fields.available });
  }

  // ADMIN
  if (pathname === '/api/admin/users' && method === 'GET') {
    const user = await auth(req); if (!user || user.Role !== 'Admin') return send(res, 403, { error: 'Forbidden' });
    return send(res, 200, await helpers.listUsers());
  }
  const approveMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/(approve|suspend)$/);
  if (approveMatch && method === 'POST') {
    const user = await auth(req); if (!user || user.Role !== 'Admin') return send(res, 403, { error: 'Forbidden' });
    await helpers.updateUser(approveMatch[1], { IsApproved: approveMatch[2] === 'approve' ? 1 : 0 });
    return send(res, 200, { message: 'OK' });
  }
  if (pathname === '/api/admin/stats' && method === 'GET') {
    const user = await auth(req); if (!user || ['Admin', 'Coordinator'].indexOf(user.Role) < 0) return send(res, 403, { error: 'Forbidden' });
    return send(res, 200, await helpers.getStats());
  }
  if (pathname === '/api/admin/organizations' && method === 'POST') {
    const user = await auth(req); if (!user || user.Role !== 'Admin') return send(res, 403, { error: 'Forbidden' });
    const { fields } = await readBody(req);
    try {
      const o = await helpers.createOrg({ Name: fields.name, ServiceArea: fields.serviceArea, ContactInfo: fields.contactInfo });
      return send(res, 201, { orgId: o.OrgID });
    } catch (e) { return send(res, 409, { error: e.message }); }
  }

  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(FRONTEND, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(FRONTEND)) return send(res, 403, 'Forbidden');
  // uploads
  if (pathname.indexOf('/uploads/') === 0) {
    filePath = path.join(UPLOADS_DIR, path.basename(pathname));
  }
  fs.readFile(filePath, function(err, data) {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(FRONTEND, 'index.html'), function(e2, html) {
        if (e2) return send(res, 404, 'Not found');
        send(res, 200, html, { 'Content-Type': 'text/html' });
      });
      return;
    }
    const ext = path.extname(filePath);
    send(res, 200, data, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  });
}

const server = http.createServer(async function(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    if (pathname.indexOf('/api/') === 0) {
      await handleApi(req, res, pathname);
    } else {
      serveStatic(req, res, pathname);
    }
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message || 'Server error' });
  }
});

server.listen(PORT, async function() {
  try {
    if (helpers.seedIfEmpty) await helpers.seedIfEmpty();
  } catch (e) { console.error('Seed error:', e.message); }
  console.log('');
  console.log('  🐾  PawAlert running at http://localhost:' + PORT);
  console.log('  Demo: admin@pawalert.lk / password123');
  console.log('       nimal@carn.lk (Coordinator) / saman@carn.lk (Rescuer)');
  console.log('');
});
