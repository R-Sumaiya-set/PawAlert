/**
 * PawAlert Database Layer – pure-JS JSON persistence
 * Schema mirrors the ER design; no native modules required.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.PAWALERT_DATA || path.join('/tmp', 'pawalert_data');
const DB_FILE = path.join(DATA_DIR, 'pawalert.json');
const UPLOADS_DIR = process.env.PAWALERT_UPLOADS || path.join('/tmp', 'pawalert_uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function emptyDb() {
  return {
    organizations: [],
    users: [],
    teams: [],
    cases: [],
    statusUpdates: [],
    notifications: [],
    seq: { org: 0, user: 0, team: 0, update: 0, notif: 0, caseNum: 0 }
  };
}

let store = emptyDb();

function load() {
  if (fs.existsSync(DB_FILE)) {
    try { store = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
    catch (e) { store = emptyDb(); }
  }
}
function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2));
}
load();

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored) {
  const parts = (stored || '').split(':');
  if (parts.length !== 2) return false;
  const hash = crypto.scryptSync(pw, parts[0], 64).toString('hex');
  return hash === parts[1];
}

function seed() {
  if (store.users.length > 0) {
    console.log('Database already seeded (' + store.users.length + ' users).');
    return;
  }
  const hash = hashPassword('password123');
  const t = now();

  store.seq.org = 2;
  store.organizations = [
    { OrgID: 1, Name: 'Colombo Animal Rescue Network', ServiceArea: 'Colombo', ContactInfo: 'contact@carn.lk | +94 11 234 5678', IsActive: 1, RegisteredAt: t },
    { OrgID: 2, Name: 'Kandy Wildlife Care', ServiceArea: 'Kandy', ContactInfo: 'help@kwc.lk | +94 81 222 3344', IsActive: 1, RegisteredAt: t }
  ];

  store.seq.team = 3;
  store.teams = [
    { TeamID: 1, OrgID: 1, TeamName: 'CARN Rapid Response', AvailabilityStatus: 1, ServiceArea: 'Colombo', IsActive: 1 },
    { TeamID: 2, OrgID: 1, TeamName: 'CARN Night Patrol', AvailabilityStatus: 1, ServiceArea: 'Colombo South', IsActive: 1 },
    { TeamID: 3, OrgID: 2, TeamName: 'KWC Field Unit', AvailabilityStatus: 1, ServiceArea: 'Kandy', IsActive: 1 }
  ];

  store.seq.user = 7;
  store.users = [
    { UserID: 1, Name: 'System Admin', Email: 'admin@pawalert.lk', Phone: '0700000001', PasswordHash: hash, Role: 'Admin', OrgID: null, IsApproved: 1, IsAvailable: 1, CreatedAt: t },
    { UserID: 2, Name: 'Nimal Perera', Email: 'nimal@carn.lk', Phone: '0712345678', PasswordHash: hash, Role: 'Coordinator', OrgID: 1, IsApproved: 1, IsAvailable: 1, CreatedAt: t },
    { UserID: 3, Name: 'Saman Fernando', Email: 'saman@carn.lk', Phone: '0771234567', PasswordHash: hash, Role: 'Rescuer', OrgID: 1, IsApproved: 1, IsAvailable: 1, CreatedAt: t },
    { UserID: 4, Name: 'Kamala Silva', Email: 'kamala@carn.lk', Phone: '0769876543', PasswordHash: hash, Role: 'Rescuer', OrgID: 1, IsApproved: 1, IsAvailable: 1, CreatedAt: t },
    { UserID: 5, Name: 'Priya Wickramasinghe', Email: 'priya@kwc.lk', Phone: '0755551234', PasswordHash: hash, Role: 'Coordinator', OrgID: 2, IsApproved: 1, IsAvailable: 1, CreatedAt: t },
    { UserID: 6, Name: 'Ruwan Jayasuriya', Email: 'ruwan@kwc.lk', Phone: '0744449876', PasswordHash: hash, Role: 'Rescuer', OrgID: 2, IsApproved: 1, IsAvailable: 1, CreatedAt: t },
    { UserID: 7, Name: 'Asha De Silva', Email: 'asha@email.com', Phone: '0781112233', PasswordHash: hash, Role: 'Reporter', OrgID: null, IsApproved: 1, IsAvailable: 1, CreatedAt: t }
  ];

  const year = new Date().getFullYear();
  store.seq.caseNum = 3;
  store.cases = [
    {
      CaseID: 'AR-' + year + '-001', ReporterID: 7, GuestName: null, GuestPhone: null,
      AnimalType: 'Dog', ConditionType: 'Injured', UrgencyLevel: 'Critical',
      LocationText: 'Near Galle Face Green, Colombo', GeoLat: 6.9271, GeoLng: 79.8612,
      PhotoURL: null, Description: 'Brown street dog with deep cut on left hind leg, bleeding. Unable to walk.',
      Status: 'Pending', AssignedTeamID: null, AssignedRescuerID: null,
      TrackingCode: 'TRK-A1B2C3', CreatedAt: t, UpdatedAt: t
    },
    {
      CaseID: 'AR-' + year + '-002', ReporterID: null, GuestName: 'Guest Reporter', GuestPhone: '0779988776',
      AnimalType: 'Cat', ConditionType: 'Trapped', UrgencyLevel: 'High',
      LocationText: 'Apartment balcony, Union Place', GeoLat: 6.9147, GeoLng: 79.8585,
      PhotoURL: null, Description: 'Cat stuck between balcony bars for several hours.',
      Status: 'Verified', AssignedTeamID: null, AssignedRescuerID: null,
      TrackingCode: 'TRK-D4E5F6', CreatedAt: t, UpdatedAt: t
    },
    {
      CaseID: 'AR-' + year + '-003', ReporterID: 7, GuestName: null, GuestPhone: null,
      AnimalType: 'Dog', ConditionType: 'Abandoned', UrgencyLevel: 'Medium',
      LocationText: 'Dehiwala beach road', GeoLat: 6.8301, GeoLng: 79.8800,
      PhotoURL: null, Description: 'Puppy left in a cardboard box near the bus stop.',
      Status: 'Assigned', AssignedTeamID: 1, AssignedRescuerID: 3,
      TrackingCode: 'TRK-G7H8I9', CreatedAt: t, UpdatedAt: t
    }
  ];

  store.seq.update = 2;
  store.statusUpdates = [
    { UpdateID: 1, CaseID: 'AR-' + year + '-003', UpdatedBy: 2, StatusValue: 'Verified', Notes: 'Confirmed genuine abandoned puppy report.', PhotoURL: null, Timestamp: t },
    { UpdateID: 2, CaseID: 'AR-' + year + '-003', UpdatedBy: 2, StatusValue: 'Assigned', Notes: 'Assigned to CARN Rapid Response / Saman.', PhotoURL: null, Timestamp: t }
  ];

  store.notifications = [];
  save();
  console.log('Database seeded successfully.');
  console.log('Demo accounts (password: password123):');
  console.log('  admin@pawalert.lk       → Admin');
  console.log('  nimal@carn.lk           → Coordinator (Colombo)');
  console.log('  saman@carn.lk           → Rescuer (Colombo)');
  console.log('  asha@email.com          → Reporter');
}

seed();

function enrichCase(c) {
  const reporter = c.ReporterID ? store.users.find(u => u.UserID === c.ReporterID) : null;
  const team = c.AssignedTeamID ? store.teams.find(t => t.TeamID === c.AssignedTeamID) : null;
  const org = team ? store.organizations.find(o => o.OrgID === team.OrgID) : null;
  return Object.assign({}, c, {
    ReporterName: reporter ? reporter.Name : c.GuestName,
    ReporterPhone: reporter ? reporter.Phone : c.GuestPhone,
    TeamName: team ? team.TeamName : null,
    OrgName: org ? org.Name : null
  });
}

const helpers = {
  getUserByEmail(email) {
    return store.users.find(u => u.Email === email) || null;
  },
  getUserById(id) {
    return store.users.find(u => u.UserID === +id) || null;
  },
  createUser(data) {
    store.seq.user += 1;
    const u = Object.assign({ UserID: store.seq.user, IsApproved: 0, IsAvailable: 1, CreatedAt: now(), OrgID: null }, data);
    store.users.push(u);
    save();
    return u;
  },
  updateUser(id, fields) {
    const u = store.users.find(x => x.UserID === +id);
    if (!u) return null;
    Object.assign(u, fields);
    save();
    return u;
  },
  listUsers() {
    return store.users.map(u => {
      const org = store.organizations.find(o => o.OrgID === u.OrgID);
      const copy = Object.assign({}, u, { OrgName: org ? org.Name : null });
      delete copy.PasswordHash;
      return copy;
    });
  },
  listOrgs() {
    return store.organizations.filter(o => o.IsActive);
  },
  createOrg(data) {
    if (store.organizations.find(o => o.Name === data.Name)) throw new Error('Organisation name already exists');
    store.seq.org += 1;
    const o = Object.assign({ OrgID: store.seq.org, IsActive: 1, RegisteredAt: now() }, data);
    store.organizations.push(o);
    save();
    return o;
  },
  listTeams(orgId) {
    let teams = store.teams.filter(t => t.IsActive);
    if (orgId) teams = teams.filter(t => t.OrgID === +orgId);
    return teams.map(t => {
      const org = store.organizations.find(o => o.OrgID === t.OrgID);
      return Object.assign({}, t, { OrgName: org ? org.Name : null });
    });
  },
  createTeam(data) {
    store.seq.team += 1;
    const t = Object.assign({ TeamID: store.seq.team, AvailabilityStatus: 1, IsActive: 1 }, data);
    store.teams.push(t);
    save();
    return t;
  },
  nextCaseId() {
    const year = new Date().getFullYear();
    store.seq.caseNum += 1;
    return 'AR-' + year + '-' + String(store.seq.caseNum).padStart(3, '0');
  },
  createCase(data) {
    const c = Object.assign({
      Status: 'Pending', AssignedTeamID: null, AssignedRescuerID: null,
      CreatedAt: now(), UpdatedAt: now()
    }, data);
    store.cases.push(c);
    save();
    return c;
  },
  getCase(id) {
    return store.cases.find(c => c.CaseID === id || c.TrackingCode === id) || null;
  },
  updateCase(id, fields) {
    const c = store.cases.find(x => x.CaseID === id);
    if (!c) return null;
    Object.assign(c, fields, { UpdatedAt: now() });
    save();
    return c;
  },
  listCases(filterFn) {
    let list = store.cases.slice();
    if (filterFn) list = list.filter(filterFn);
    const urgOrder = { Critical: 1, High: 2, Medium: 3, Low: 4 };
    const open = ['Pending', 'Verified', 'Declined'];
    list.sort(function(a, b) {
      const ua = urgOrder[a.UrgencyLevel] || 5;
      const ub = urgOrder[b.UrgencyLevel] || 5;
      if (ua !== ub) return ua - ub;
      const oa = open.indexOf(a.Status) >= 0 ? 0 : 1;
      const ob = open.indexOf(b.Status) >= 0 ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return a.CreatedAt < b.CreatedAt ? -1 : 1;
    });
    return list.map(enrichCase);
  },
  enrichCase: enrichCase,
  addStatusUpdate(caseId, userId, status, notes, photoURL) {
    store.seq.update += 1;
    const u = {
      UpdateID: store.seq.update, CaseID: caseId, UpdatedBy: userId,
      StatusValue: status, Notes: notes || null, PhotoURL: photoURL || null, Timestamp: now()
    };
    store.statusUpdates.push(u);
    const c = store.cases.find(x => x.CaseID === caseId);
    if (c) { c.Status = status; c.UpdatedAt = now(); }
    save();
    return u;
  },
  getHistory(caseId) {
    return store.statusUpdates
      .filter(s => s.CaseID === caseId)
      .sort(function(a, b) { return a.Timestamp < b.Timestamp ? -1 : 1; })
      .map(function(s) {
        const user = store.users.find(u => u.UserID === s.UpdatedBy);
        return Object.assign({}, s, { UpdatedByName: user ? user.Name : 'System' });
      });
  },
  createNotification(data) {
    store.seq.notif += 1;
    const n = Object.assign({
      NotificationID: store.seq.notif, DeliveryStatus: 'Sent', IsRead: 0, SentAt: now()
    }, data);
    store.notifications.push(n);
    save();
    return n;
  },
  listNotifications(userId) {
    return store.notifications
      .filter(n => n.RecipientID === +userId)
      .sort(function(a, b) { return a.SentAt < b.SentAt ? 1 : -1; })
      .slice(0, 50)
      .map(function(n) {
        const c = store.cases.find(x => x.CaseID === n.CaseID);
        return Object.assign({}, n, {
          AnimalType: c ? c.AnimalType : null,
          UrgencyLevel: c ? c.UrgencyLevel : null,
          LocationText: c ? c.LocationText : null
        });
      });
  },
  markNotifRead(id, userId) {
    const n = store.notifications.find(x => x.NotificationID === +id && x.RecipientID === +userId);
    if (n) { n.IsRead = 1; n.DeliveryStatus = 'Opened'; save(); }
  },
  markAllRead(userId) {
    store.notifications.filter(n => n.RecipientID === +userId && !n.IsRead)
      .forEach(function(n) { n.IsRead = 1; });
    save();
  },
  listRescuers(orgId) {
    return store.users
      .filter(u => u.Role === 'Rescuer' && u.IsApproved && (!orgId || u.OrgID === +orgId))
      .map(function(u) {
        const org = store.organizations.find(o => o.OrgID === u.OrgID);
        return { UserID: u.UserID, Name: u.Name, Phone: u.Phone, IsAvailable: u.IsAvailable, OrgName: org ? org.Name : null };
      });
  },
  getOnDutyRescuers() {
    return store.users.filter(u => u.Role === 'Rescuer' && u.IsApproved && u.IsAvailable);
  },
  getStats() {
    const total = store.cases.length;
    const byStatus = {};
    const byUrgency = {};
    const byAnimal = {};
    let openCritical = 0;
    store.cases.forEach(function(c) {
      byStatus[c.Status] = (byStatus[c.Status] || 0) + 1;
      byUrgency[c.UrgencyLevel] = (byUrgency[c.UrgencyLevel] || 0) + 1;
      byAnimal[c.AnimalType] = (byAnimal[c.AnimalType] || 0) + 1;
      if (['Critical', 'High'].indexOf(c.UrgencyLevel) >= 0 && ['Completed', 'Closed', 'Rejected'].indexOf(c.Status) < 0) {
        openCritical++;
      }
    });
    return {
      total: total,
      openCritical: openCritical,
      byStatus: Object.keys(byStatus).map(function(k) { return { Status: k, n: byStatus[k] }; }),
      byUrgency: Object.keys(byUrgency).map(function(k) { return { UrgencyLevel: k, n: byUrgency[k] }; }),
      byAnimal: Object.keys(byAnimal).map(function(k) { return { AnimalType: k, n: byAnimal[k] }; })
    };
  },
  findNearby(caseId, geoLat, geoLng, locationText) {
    const cutoff = Date.now() - 48 * 3600 * 1000;
    return store.cases.filter(function(c) {
      if (c.CaseID === caseId) return false;
      if (['Completed', 'Closed', 'Rejected'].indexOf(c.Status) >= 0) return false;
      const created = new Date(c.CreatedAt.replace(' ', 'T') + 'Z').getTime();
      if (created < cutoff) return false;
      if (geoLat && c.GeoLat && Math.abs(c.GeoLat - geoLat) < 0.02 && Math.abs(c.GeoLng - geoLng) < 0.02) return true;
      const key = (locationText || '').split(',')[0].trim().toLowerCase().slice(0, 15);
      if (key && (c.LocationText || '').toLowerCase().indexOf(key) >= 0) return true;
      return false;
    }).slice(0, 5).map(function(c) {
      return {
        CaseID: c.CaseID, AnimalType: c.AnimalType, ConditionType: c.ConditionType,
        LocationText: c.LocationText, Status: c.Status, CreatedAt: c.CreatedAt
      };
    });
  },
  countProgressUpdates(caseId) {
    return store.statusUpdates.filter(function(s) {
      return s.CaseID === caseId && ['Rescued', 'AtVetCare', 'UnableToLocate'].indexOf(s.StatusValue) >= 0;
    }).length;
  }
};

helpers.hashPassword = hashPassword; helpers.verifyPassword = verifyPassword;
module.exports = { UPLOADS_DIR: UPLOADS_DIR, helpers: helpers, now: now };
