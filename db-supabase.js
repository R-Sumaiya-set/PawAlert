/**
 * PawAlert Database Layer – Supabase (PostgreSQL)
 * Drop-in replacement for db.js when SUPABASE_URL is set.
 */
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const UPLOADS_DIR = process.env.PAWALERT_UPLOADS || path.join('/tmp', 'pawalert_uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

/* ---------- row mappers (snake_case DB ↔ camelCase API) ---------- */
function mapUser(r) {
  if (!r) return null;
  return {
    UserID: r.user_id, Name: r.name, Email: r.email, Phone: r.phone,
    PasswordHash: r.password_hash, Role: r.role, OrgID: r.org_id,
    IsApproved: r.is_approved ? 1 : 0, IsAvailable: r.is_available ? 1 : 0,
    CreatedAt: r.created_at
  };
}
function mapOrg(r) {
  if (!r) return null;
  return {
    OrgID: r.org_id, Name: r.name, ServiceArea: r.service_area,
    ContactInfo: r.contact_info, IsActive: r.is_active ? 1 : 0,
    RegisteredAt: r.registered_at
  };
}
function mapTeam(r) {
  if (!r) return null;
  return {
    TeamID: r.team_id, OrgID: r.org_id, TeamName: r.team_name,
    AvailabilityStatus: r.availability_status ? 1 : 0,
    ServiceArea: r.service_area, IsActive: r.is_active ? 1 : 0
  };
}
function mapCase(r) {
  if (!r) return null;
  return {
    CaseID: r.case_id, TrackingCode: r.tracking_code,
    ReporterID: r.reporter_id, ReporterName: r.reporter_name,
    ReporterPhone: r.reporter_phone, AnimalType: r.animal_type,
    ConditionType: r.condition_type, UrgencyLevel: r.urgency_level,
    LocationText: r.location_text, GeoLat: r.geo_lat, GeoLng: r.geo_lng,
    Description: r.description, PhotoURL: r.photo_url, Status: r.status,
    AssignedTeamID: r.assigned_team_id, AssignedRescuerID: r.assigned_rescuer_id,
    OrgID: r.org_id, CreatedAt: r.created_at, UpdatedAt: r.updated_at
  };
}
function mapNotif(r) {
  if (!r) return null;
  return {
    NotificationID: r.notification_id, RecipientID: r.recipient_id,
    CaseID: r.case_id, Channel: r.channel, Message: r.message,
    DeliveryStatus: r.delivery_status, IsRead: r.is_read ? 1 : 0,
    SentAt: r.sent_at
  };
}
function mapUpdate(r) {
  if (!r) return null;
  return {
    UpdateID: r.update_id, CaseID: r.case_id, UpdatedBy: r.updated_by,
    StatusValue: r.status_value, Notes: r.notes, PhotoURL: r.photo_url,
    Timestamp: r.timestamp
  };
}

async function enrichCase(c) {
  if (!c) return null;
  const out = Object.assign({}, c);
  if (c.AssignedRescuerID) {
    const { data } = await supabase.from('users').select('name').eq('user_id', c.AssignedRescuerID).maybeSingle();
    out.AssignedRescuerName = data ? data.name : null;
  }
  if (c.AssignedTeamID) {
    const { data } = await supabase.from('teams').select('team_name').eq('team_id', c.AssignedTeamID).maybeSingle();
    out.AssignedTeamName = data ? data.team_name : null;
  }
  if (c.OrgID) {
    const { data } = await supabase.from('organizations').select('name').eq('org_id', c.OrgID).maybeSingle();
    out.OrgName = data ? data.name : null;
  }
  return out;
}

const helpers = {
  async findUserByEmail(email) {
    const { data, error } = await supabase.from('users').select('*').eq('email', email.toLowerCase()).maybeSingle();
    if (error) throw error;
    return mapUser(data);
  },
  async findUserById(id) {
    const { data, error } = await supabase.from('users').select('*').eq('user_id', +id).maybeSingle();
    if (error) throw error;
    return mapUser(data);
  },
  async createUser(fields) {
    const { data, error } = await supabase.from('users').insert({
      name: fields.Name,
      email: fields.Email.toLowerCase(),
      phone: fields.Phone || null,
      password_hash: fields.PasswordHash,
      role: fields.Role || 'Reporter',
      org_id: fields.OrgID || null,
      is_approved: fields.IsApproved ? true : (fields.Role === 'Reporter'),
      is_available: true
    }).select().single();
    if (error) throw error;
    return mapUser(data);
  },
  async listOrgs() {
    const { data, error } = await supabase.from('organizations').select('*').eq('is_active', true).order('name');
    if (error) throw error;
    return (data || []).map(mapOrg);
  },
  async listTeams(orgId) {
    let q = supabase.from('teams').select('*').eq('is_active', true);
    if (orgId) q = q.eq('org_id', +orgId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(mapTeam);
  },
  async nextCaseId() {
    const year = new Date().getFullYear();
    const key = 'case_num_' + year;
    const { data: row } = await supabase.from('app_meta').select('value').eq('key', key).maybeSingle();
    let n = row ? row.value + 1 : 1;
    if (row) {
      await supabase.from('app_meta').update({ value: n }).eq('key', key);
    } else {
      await supabase.from('app_meta').insert({ key, value: n });
    }
    return 'AR-' + year + '-' + String(n).padStart(3, '0');
  },
  async createCase(data) {
    const row = {
      case_id: data.CaseID,
      tracking_code: data.TrackingCode,
      reporter_id: data.ReporterID || null,
      reporter_name: data.ReporterName || null,
      reporter_phone: data.ReporterPhone || null,
      animal_type: data.AnimalType,
      condition_type: data.ConditionType || null,
      urgency_level: data.UrgencyLevel,
      location_text: data.LocationText,
      geo_lat: data.GeoLat || null,
      geo_lng: data.GeoLng || null,
      description: data.Description || null,
      photo_url: data.PhotoURL || null,
      status: 'Pending',
      org_id: data.OrgID || null
    };
    const { data: inserted, error } = await supabase.from('cases').insert(row).select().single();
    if (error) throw error;
    return mapCase(inserted);
  },
  async getCase(id) {
    let { data, error } = await supabase.from('cases').select('*').eq('case_id', id).maybeSingle();
    if (!data) {
      const r = await supabase.from('cases').select('*').eq('tracking_code', id).maybeSingle();
      data = r.data; error = r.error;
    }
    if (error) throw error;
    return mapCase(data);
  },
  async updateCase(id, fields) {
    const patch = { updated_at: new Date().toISOString() };
    if (fields.Status !== undefined) patch.status = fields.Status;
    if (fields.AssignedTeamID !== undefined) patch.assigned_team_id = fields.AssignedTeamID;
    if (fields.AssignedRescuerID !== undefined) patch.assigned_rescuer_id = fields.AssignedRescuerID;
    if (fields.OrgID !== undefined) patch.org_id = fields.OrgID;
    if (fields.PhotoURL !== undefined) patch.photo_url = fields.PhotoURL;
    const { data, error } = await supabase.from('cases').update(patch).eq('case_id', id).select().single();
    if (error) throw error;
    return mapCase(data);
  },
  async listCases(filterFn) {
    const { data, error } = await supabase.from('cases').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    let list = (data || []).map(mapCase);
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
    const enriched = [];
    for (const c of list) enriched.push(await enrichCase(c));
    return enriched;
  },
  async enrichCase(c) { return enrichCase(c); },
  async addStatusUpdate(caseId, userId, status, notes, photoURL) {
    const { data, error } = await supabase.from('status_updates').insert({
      case_id: caseId,
      updated_by: userId || null,
      status_value: status,
      notes: notes || null,
      photo_url: photoURL || null
    }).select().single();
    if (error) throw error;
    await supabase.from('cases').update({ status, updated_at: new Date().toISOString() }).eq('case_id', caseId);
    return mapUpdate(data);
  },
  async getHistory(caseId) {
    const { data, error } = await supabase
      .from('status_updates')
      .select('*')
      .eq('case_id', caseId)
      .order('timestamp', { ascending: true });
    if (error) throw error;
    const out = [];
    for (const s of (data || [])) {
      const m = mapUpdate(s);
      if (s.updated_by) {
        const { data: u } = await supabase.from('users').select('name').eq('user_id', s.updated_by).maybeSingle();
        m.UpdatedByName = u ? u.name : 'System';
      } else {
        m.UpdatedByName = 'System';
      }
      out.push(m);
    }
    return out;
  },
  async createNotification(data) {
    const { data: n, error } = await supabase.from('notifications').insert({
      recipient_id: data.RecipientID,
      case_id: data.CaseID || null,
      channel: data.Channel || 'InApp',
      message: data.Message,
      delivery_status: 'Sent',
      is_read: false
    }).select().single();
    if (error) throw error;
    return mapNotif(n);
  },
  async listNotifications(userId) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', +userId)
      .order('sent_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const out = [];
    for (const n of (data || [])) {
      const m = mapNotif(n);
      if (n.case_id) {
        const { data: c } = await supabase.from('cases')
          .select('animal_type,urgency_level,location_text')
          .eq('case_id', n.case_id).maybeSingle();
        if (c) {
          m.AnimalType = c.animal_type;
          m.UrgencyLevel = c.urgency_level;
          m.LocationText = c.location_text;
        }
      }
      out.push(m);
    }
    return out;
  },
  async markNotifRead(id, userId) {
    await supabase.from('notifications')
      .update({ is_read: true, delivery_status: 'Opened' })
      .eq('notification_id', +id)
      .eq('recipient_id', +userId);
  },
  async markAllRead(userId) {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', +userId)
      .eq('is_read', false);
  },
  async listRescuers(orgId) {
    let q = supabase.from('users').select('*').eq('role', 'Rescuer').eq('is_approved', true);
    if (orgId) q = q.eq('org_id', +orgId);
    const { data, error } = await q;
    if (error) throw error;
    const out = [];
    for (const u of (data || [])) {
      const m = mapUser(u);
      let orgName = null;
      if (u.org_id) {
        const { data: o } = await supabase.from('organizations').select('name').eq('org_id', u.org_id).maybeSingle();
        orgName = o ? o.name : null;
      }
      out.push({
        UserID: m.UserID, Name: m.Name, Phone: m.Phone,
        IsAvailable: m.IsAvailable, OrgName: orgName
      });
    }
    return out;
  },
  async getOnDutyRescuers() {
    const { data, error } = await supabase.from('users')
      .select('*')
      .eq('role', 'Rescuer')
      .eq('is_approved', true)
      .eq('is_available', true);
    if (error) throw error;
    return (data || []).map(mapUser);
  },
  async setAvailability(userId, available) {
    await supabase.from('users').update({ is_available: !!available }).eq('user_id', +userId);
  },
  async listUsers() {
    const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapUser);
  },
  async setUserApproved(userId, approved) {
    await supabase.from('users').update({ is_approved: !!approved }).eq('user_id', +userId);
  },
  async createOrg(fields) {
    const { data, error } = await supabase.from('organizations').insert({
      name: fields.Name,
      service_area: fields.ServiceArea || null,
      contact_info: fields.ContactInfo || null,
      is_active: true
    }).select().single();
    if (error) throw error;
    return mapOrg(data);
  },
  async getStats() {
    const { data: cases, error } = await supabase.from('cases').select('status,urgency_level,animal_type');
    if (error) throw error;
    const list = cases || [];
    const byStatus = {}, byUrgency = {}, byAnimal = {};
    let openCritical = 0;
    list.forEach(function(c) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      byUrgency[c.urgency_level] = (byUrgency[c.urgency_level] || 0) + 1;
      byAnimal[c.animal_type] = (byAnimal[c.animal_type] || 0) + 1;
      if (['Critical', 'High'].indexOf(c.urgency_level) >= 0 &&
          ['Completed', 'Closed', 'Rejected'].indexOf(c.status) < 0) {
        openCritical++;
      }
    });
    return {
      total: list.length,
      openCritical,
      byStatus: Object.keys(byStatus).map(k => ({ Status: k, n: byStatus[k] })),
      byUrgency: Object.keys(byUrgency).map(k => ({ UrgencyLevel: k, n: byUrgency[k] })),
      byAnimal: Object.keys(byAnimal).map(k => ({ AnimalType: k, n: byAnimal[k] }))
    };
  },
  async findNearby(caseId, geoLat, geoLng, locationText) {
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.from('cases')
      .select('*')
      .neq('case_id', caseId)
      .not('status', 'in', '("Completed","Closed","Rejected")')
      .gte('created_at', cutoff)
      .limit(30);
    if (error) throw error;
    const matches = (data || []).filter(function(c) {
      if (geoLat && c.geo_lat && Math.abs(c.geo_lat - geoLat) < 0.02 && Math.abs(c.geo_lng - geoLng) < 0.02) return true;
      const key = (locationText || '').split(',')[0].trim().toLowerCase().slice(0, 15);
      if (key && (c.location_text || '').toLowerCase().indexOf(key) >= 0) return true;
      return false;
    }).slice(0, 5);
    return matches.map(c => ({
      CaseID: c.case_id, AnimalType: c.animal_type, ConditionType: c.condition_type,
      LocationText: c.location_text, Status: c.status, CreatedAt: c.created_at
    }));
  },
  async countProgressUpdates(caseId) {
    const { count, error } = await supabase.from('status_updates')
      .select('*', { count: 'exact', head: true })
      .eq('case_id', caseId)
      .in('status_value', ['Rescued', 'AtVetCare', 'UnableToLocate']);
    if (error) throw error;
    return count || 0;
  },
  /** One-time seed of demo accounts (idempotent) */
  async seedIfEmpty() {
    const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
    if (count && count > 0) {
      console.log('Database already has users – skip seed.');
      return false;
    }
    const hash = hashPassword('password123');
    const { data: orgs, error: oe } = await supabase.from('organizations').insert([
      { name: 'Colombo Animal Rescue Network', service_area: 'Colombo', contact_info: 'contact@carn.lk | +94 11 234 5678', is_active: true },
      { name: 'Kandy Wildlife Care', service_area: 'Kandy', contact_info: 'help@kwc.lk | +94 81 222 3344', is_active: true }
    ]).select();
    if (oe) throw oe;
    const org1 = orgs[0].org_id, org2 = orgs[1].org_id;
    const { error: te } = await supabase.from('teams').insert([
      { org_id: org1, team_name: 'CARN Rapid Response', availability_status: true, service_area: 'Colombo', is_active: true },
      { org_id: org1, team_name: 'CARN Night Patrol', availability_status: true, service_area: 'Colombo South', is_active: true },
      { org_id: org2, team_name: 'KWC Field Unit', availability_status: true, service_area: 'Kandy', is_active: true }
    ]);
    if (te) throw te;
    const users = [
      { name: 'System Admin', email: 'admin@pawalert.lk', phone: '0700000001', password_hash: hash, role: 'Admin', org_id: null, is_approved: true, is_available: true },
      { name: 'Nimal Perera', email: 'nimal@carn.lk', phone: '0712345678', password_hash: hash, role: 'Coordinator', org_id: org1, is_approved: true, is_available: true },
      { name: 'Saman Fernando', email: 'saman@carn.lk', phone: '0771234567', password_hash: hash, role: 'Rescuer', org_id: org1, is_approved: true, is_available: true },
      { name: 'Kamala Silva', email: 'kamala@carn.lk', phone: '0769876543', password_hash: hash, role: 'Rescuer', org_id: org1, is_approved: true, is_available: true },
      { name: 'Priya Wickramasinghe', email: 'priya@kwc.lk', phone: '0755551234', password_hash: hash, role: 'Coordinator', org_id: org2, is_approved: true, is_available: true },
      { name: 'Ruwan Jayasuriya', email: 'ruwan@kwc.lk', phone: '0744449876', password_hash: hash, role: 'Rescuer', org_id: org2, is_approved: true, is_available: true },
      { name: 'Asha De Silva', email: 'asha@email.com', phone: '0781112233', password_hash: hash, role: 'Reporter', org_id: null, is_approved: true, is_available: true }
    ];
    const { error: ue } = await supabase.from('users').insert(users);
    if (ue) throw ue;
    await supabase.from('app_meta').upsert({ key: 'case_num_' + new Date().getFullYear(), value: 0 });
    console.log('Seeded demo data (password for all: password123)');
    return true;
  }
};

helpers.hashPassword = hashPassword;
helpers.verifyPassword = verifyPassword;

// Aliases matching original db-json API names
helpers.getUserByEmail = helpers.findUserByEmail;
helpers.getUserById = helpers.findUserById;
helpers.updateUser = async function(id, fields) {
  const patch = {};
  if (fields.IsAvailable !== undefined) patch.is_available = !!fields.IsAvailable;
  if (fields.IsApproved !== undefined) patch.is_approved = !!fields.IsApproved;
  if (fields.Name !== undefined) patch.name = fields.Name;
  if (fields.Phone !== undefined) patch.phone = fields.Phone;
  if (Object.keys(patch).length) {
    await supabase.from('users').update(patch).eq('user_id', +id);
  }
  return helpers.getUserById(id);
};
helpers.setAvailability = helpers.setAvailability || (async function(userId, available) {
  await supabase.from('users').update({ is_available: !!available }).eq('user_id', +userId);
});

module.exports = { UPLOADS_DIR, helpers, now, supabase };
