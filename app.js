/* PawAlert Frontend Application */
const API = '';
let state = {
  user: null,
  token: localStorage.getItem('paw_token') || null,
  route: 'home',
  cases: [],
  currentCase: null,
  notifs: [],
  teams: [],
  rescuers: [],
  orgs: [],
  stats: null
};

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, Object.assign({}, opts, { headers: headers }));
  const data = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}

function toast(msg, type) {
  type = type || '';
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(function() { el.classList.remove('show'); }, 3200);
}

async function loadMe() {
  if (!state.token) return;
  try {
    state.user = await api('/api/auth/me');
    document.getElementById('notifBtn').style.display = 'block';
    loadNotifs();
  } catch (e) {
    logout(false);
  }
}

function logout(showMsg) {
  if (showMsg === undefined) showMsg = true;
  state.token = null;
  state.user = null;
  localStorage.removeItem('paw_token');
  document.getElementById('notifBtn').style.display = 'none';
  if (showMsg) toast('Logged out');
  navigate('home');
}

async function doLogin(email, password) {
  const data = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email, password: password })
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem('paw_token', data.token);
  document.getElementById('notifBtn').style.display = 'block';
  toast('Welcome, ' + data.user.name, 'success');
  loadNotifs();
  navigate(roleHome(data.user.role));
}

function roleHome(role) {
  if (role === 'Admin') return 'admin';
  if (role === 'Coordinator') return 'coordinator';
  if (role === 'Rescuer') return 'rescuer';
  return 'myreports';
}

function navigate(route, param) {
  state.route = route;
  state.param = param;
  var nav = document.querySelector('.nav');
  if (nav) nav.classList.remove('open');
  var panel = document.getElementById('notifPanel');
  if (panel) panel.classList.remove('open');
  renderNav();
  render();
  window.scrollTo(0, 0);
}

function toggleMobileNav() {
  document.getElementById('mainNav').classList.toggle('open');
}

function renderNav() {
  var nav = document.getElementById('mainNav');
  var links = '<a onclick="navigate(\'home\')" class="' + (state.route==='home'?'active':'') + '">Home</a>' +
    '<a onclick="navigate(\'report\')" class="' + (state.route==='report'?'active':'') + '">Report Animal</a>' +
    '<a onclick="navigate(\'track\')" class="' + (state.route==='track'?'active':'') + '">Track Report</a>';

  if (state.user) {
    var r = state.user.role;
    if (r === 'Coordinator' || r === 'Admin') {
      links += '<a onclick="navigate(\'coordinator\')" class="' + (state.route==='coordinator'?'active':'') + '">Dashboard</a>';
    }
    if (r === 'Rescuer' || r === 'Admin') {
      links += '<a onclick="navigate(\'rescuer\')" class="' + (state.route==='rescuer'?'active':'') + '">My Cases</a>';
    }
    if (r === 'Reporter' || r === 'Admin') {
      links += '<a onclick="navigate(\'myreports\')" class="' + (state.route==='myreports'?'active':'') + '">My Reports</a>';
    }
    if (r === 'Admin') {
      links += '<a onclick="navigate(\'admin\')" class="' + (state.route==='admin'?'active':'') + '">Admin</a>';
    }
    links += '<button onclick="logout()">Logout (' + esc(state.user.name.split(' ')[0]) + ')</button>';
  } else {
    links += '<a onclick="navigate(\'login\')" class="' + (state.route==='login'?'active':'') + '">Login</a>' +
      '<a onclick="navigate(\'register\')" class="' + (state.route==='register'?'active':'') + '">Register</a>';
  }
  nav.innerHTML = links;
}

async function render() {
  var el = document.getElementById('content');
  try {
    switch (state.route) {
      case 'home': el.innerHTML = viewHome(); break;
      case 'report': el.innerHTML = viewReport(); bindReportForm(); break;
      case 'track': el.innerHTML = viewTrack(); break;
      case 'login': el.innerHTML = viewLogin(); break;
      case 'register': el.innerHTML = viewRegister(); loadOrgsForRegister(); break;
      case 'coordinator': await viewCoordinator(el); break;
      case 'rescuer': await viewRescuer(el); break;
      case 'myreports': await viewMyReports(el); break;
      case 'case': await viewCaseDetail(el, state.param); break;
      case 'admin': await viewAdmin(el); break;
      default: el.innerHTML = viewHome();
    }
  } catch (e) {
    el.innerHTML = '<div class="card"><p class="empty">Error: ' + esc(e.message) + '</p></div>';
  }
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function urgencyBadge(u) {
  return '<span class="urgency urgency-' + esc(u) + '">' + esc(u) + '</span>';
}
function statusPill(s) {
  return '<span class="status-pill status-' + esc(s) + '">' + esc(s) + '</span>';
}
function animalIcon(t) {
  var map = { Dog: '🐕', Cat: '🐈', Bird: '🐦', Other: '🐾' };
  return map[t] || '🐾';
}

function viewHome() {
  return '<section class="hero">' +
    '<h1>Help an Animal in Distress</h1>' +
    '<p>Report injured, trapped or abandoned animals in under two minutes. ' +
    'Rescuers are notified instantly for Critical and High urgency cases.</p>' +
    '<div class="hero-actions">' +
    '<button class="btn btn-accent btn-lg" onclick="navigate(\'report\')">🐾 Report an Animal</button>' +
    '<button class="btn btn-outline btn-lg" style="border-color:#fff;color:#fff" onclick="navigate(\'track\')">Track a Report</button>' +
    '</div></section>' +
    '<div class="steps">' +
    '<div class="step"><div class="num">1</div><h4>Report</h4><p>Submit animal type, condition, location and urgency — no account needed.</p></div>' +
    '<div class="step"><div class="num">2</div><h4>Verify</h4><p>A Rescue Coordinator confirms the case and assigns a rescuer.</p></div>' +
    '<div class="step"><div class="num">3</div><h4>Notify</h4><p>Critical/High cases trigger instant push + SMS alerts to on-duty rescuers.</p></div>' +
    '<div class="step"><div class="num">4</div><h4>Track</h4><p>Follow the rescue from submission to completion with a live status trail.</p></div>' +
    '</div>' +
    '<div class="card"><h3>Why PawAlert?</h3>' +
    '<p style="margin-bottom:10px">Today animal rescues in Sri Lanka (and similar regions) rely on scattered phone calls, Facebook posts and WhatsApp groups. ' +
    'This causes delayed responses, duplicate efforts, and no visibility for the person who reported the animal.</p>' +
    '<p>PawAlert centralises reporting, verification, assignment, emergency notification and status tracking in one lightweight platform — ' +
    'designed so any citizen can use it from a mobile phone in under two minutes.</p></div>';
}

function viewReport() {
  var guestFields = state.user ? '' :
    '<div class="form-row">' +
    '<div class="form-group"><label>Your Name <span class="req">*</span></label>' +
    '<input type="text" name="guestName" required placeholder="Name" /></div>' +
    '<div class="form-group"><label>Contact Phone <span class="req">*</span></label>' +
    '<input type="tel" name="guestPhone" required placeholder="07X XXX XXXX" /></div></div>';

  return '<div class="card" style="max-width:640px;margin:0 auto">' +
    '<h2>Report an Animal in Distress</h2>' +
    '<div class="privacy-note">Your contact details are shared only with the Coordinator and Rescuer handling this case. ' +
    'PawAlert is a coordination tool — for dangerous wild or venomous animals also contact the relevant emergency authority.</div>' +
    '<form id="reportForm">' +
    '<div class="form-row">' +
    '<div class="form-group"><label>Animal Type <span class="req">*</span></label>' +
    '<select name="animalType" required><option value="">Select…</option>' +
    '<option value="Dog">🐕 Dog</option><option value="Cat">🐈 Cat</option>' +
    '<option value="Bird">🐦 Bird</option><option value="Other">🐾 Other</option></select></div>' +
    '<div class="form-group"><label>Condition <span class="req">*</span></label>' +
    '<select name="conditionType" required><option value="">Select…</option>' +
    '<option value="Injured">Injured</option><option value="Trapped">Trapped</option>' +
    '<option value="Abandoned">Abandoned</option><option value="Sick">Sick</option>' +
    '<option value="Deceased">Deceased</option><option value="Other">Other</option></select></div></div>' +
    '<div class="form-group"><label>Urgency Level <span class="req">*</span></label>' +
    '<select name="urgencyLevel" required><option value="">Select…</option>' +
    '<option value="Critical">🔴 Critical – life-threatening, needs immediate response</option>' +
    '<option value="High">🟠 High – serious injury / severe distress</option>' +
    '<option value="Medium">🟡 Medium – needs help soon but stable</option>' +
    '<option value="Low">🟢 Low – non-urgent (e.g. healthy abandoned)</option></select>' +
    '<div class="form-hint">Critical and High cases automatically alert all on-duty rescuers.</div></div>' +
    '<div class="form-group"><label>Location <span class="req">*</span></label>' +
    '<input type="text" name="locationText" required placeholder="Street, landmark, or area" />' +
    '<div class="form-hint"><button type="button" class="btn-text" onclick="captureGPS()">📍 Use my current GPS location</button> <span id="gpsStatus"></span></div>' +
    '<input type="hidden" name="geoLat" id="geoLat" /><input type="hidden" name="geoLng" id="geoLng" /></div>' +
    '<div class="form-group"><label>Description</label>' +
    '<textarea name="description" placeholder="Any extra details that will help the rescuer…"></textarea></div>' +
    '<div class="form-group"><label>Photo (optional)</label>' +
    '<input type="file" name="photo" accept="image/*" capture="environment" />' +
    '<div class="form-hint">Photos help rescuers prepare. Max 3 MB.</div></div>' +
    guestFields +
    '<button type="submit" class="btn btn-primary btn-lg btn-block">Submit Report</button></form>' +
    '<div id="reportResult" style="display:none;margin-top:20px"></div></div>';
}

function bindReportForm() {
  var form = document.getElementById('reportForm');
  if (!form) return;
  form.onsubmit = async function(e) {
    e.preventDefault();
    var fd = new FormData(form);
    try {
      var data = await api('/api/cases', { method: 'POST', body: fd, headers: {} });
      var nearbyHtml = '';
      if (data.nearbyCases && data.nearbyCases.length) {
        nearbyHtml = '<div class="nearby-warn"><strong>⚠️ Similar recent cases nearby</strong> — please check you are not reporting a duplicate:<ul>' +
          data.nearbyCases.map(function(c) {
            return '<li>' + esc(c.CaseID) + ' – ' + esc(c.AnimalType) + ' / ' + esc(c.ConditionType) +
              ' at ' + esc(c.LocationText) + ' (' + esc(c.Status) + ')</li>';
          }).join('') + '</ul></div>';
      }
      document.getElementById('reportResult').style.display = 'block';
      document.getElementById('reportResult').innerHTML =
        '<div class="card" style="border-color:var(--success);background:#EAFAF1">' +
        '<h3 style="color:var(--success)">✓ Report Submitted</h3>' +
        '<p><strong>Case ID:</strong> ' + esc(data.caseId) + '</p>' +
        '<p><strong>Tracking Code:</strong> ' + esc(data.trackingCode) + '</p>' +
        '<p>Save this code to track status without logging in.</p>' +
        (data.emergencyNotified ? '<p style="color:var(--danger)"><strong>Emergency alerts sent</strong> to on-duty rescuers.</p>' : '') +
        nearbyHtml +
        '<div style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="navigate(\'track\');setTimeout(function(){document.getElementById(\'trackCode\').value=\'' +
        esc(data.trackingCode) + '\';doTrack()},200)">Track this case</button></div></div>';
      form.reset();
      toast('Report submitted successfully', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

function captureGPS() {
  var status = document.getElementById('gpsStatus');
  status.textContent = ' Locating…';
  if (!navigator.geolocation) { status.textContent = ' GPS not supported'; return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      document.getElementById('geoLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('geoLng').value = pos.coords.longitude.toFixed(6);
      status.textContent = ' ✓ ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
      var loc = document.querySelector('[name=locationText]');
      if (loc && !loc.value) loc.value = 'GPS ' + pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
    },
    function() { status.textContent = ' Could not get location — enter manually'; },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function viewTrack() {
  return '<div class="card" style="max-width:520px;margin:0 auto">' +
    '<h2>Track a Report</h2>' +
    '<p style="margin-bottom:14px;color:var(--muted);font-size:0.9rem">Enter the Case ID or Tracking Code you received after submitting.</p>' +
    '<div class="form-group"><input type="text" id="trackCode" placeholder="e.g. AR-2026-001 or TRK-A1B2C3" /></div>' +
    '<button class="btn btn-primary btn-block" onclick="doTrack()">Look Up</button>' +
    '<div id="trackResult" style="margin-top:20px"></div></div>';
}

async function doTrack() {
  var code = document.getElementById('trackCode').value.trim();
  if (!code) return toast('Enter a tracking code', 'error');
  try {
    var c = await api('/api/cases/track/' + encodeURIComponent(code));
    document.getElementById('trackResult').innerHTML = renderCaseSummary(c, true);
  } catch (e) {
    document.getElementById('trackResult').innerHTML = '<p style="color:var(--danger)">' + esc(e.message) + '</p>';
  }
}

function renderCaseSummary(c) {
  var hist = (c.history || []).map(function(h) {
    return '<div class="timeline-item"><div><strong>' + esc(h.StatusValue) + '</strong>' +
      (h.Notes ? ' – ' + esc(h.Notes) : '') + '</div>' +
      '<div class="who">' + esc(h.UpdatedByName || '') + '</div>' +
      '<div class="time">' + esc(h.Timestamp) + '</div></div>';
  }).join('');
  var animal = c.animalType || c.AnimalType;
  var condition = c.conditionType || c.ConditionType;
  var urgency = c.urgencyLevel || c.UrgencyLevel;
  var status = c.status || c.Status;
  var loc = c.locationText || c.LocationText;
  var desc = c.description || c.Description;
  var photo = c.photoURL || c.PhotoURL;
  var cid = c.caseId || c.CaseID;
  return '<div class="card"><div class="detail-header">' +
    '<span style="font-size:2rem">' + animalIcon(animal) + '</span><div>' +
    '<div style="font-weight:700;color:var(--primary)">' + esc(cid) + '</div>' +
    '<div>' + esc(animal) + ' · ' + esc(condition) + '</div></div>' +
    urgencyBadge(urgency) + ' ' + statusPill(status) + '</div>' +
    '<p><strong>Location:</strong> ' + esc(loc) + '</p>' +
    (desc ? '<p style="margin-top:6px">' + esc(desc) + '</p>' : '') +
    (photo ? '<img class="detail-photo" src="' + esc(photo) + '" alt="Case photo" />' : '') +
    '<h4 style="margin:16px 0 10px">Status Timeline</h4>' +
    '<div class="timeline">' + (hist || '<p class="form-hint">No updates yet</p>') + '</div></div>';
}

function viewLogin() {
  return '<div class="auth-box"><h2>Login</h2>' +
    '<form onsubmit="event.preventDefault(); handleLogin(this)">' +
    '<div class="form-group"><label>Email</label><input type="email" name="email" required placeholder="you@email.com" /></div>' +
    '<div class="form-group"><label>Password</label><input type="password" name="password" required /></div>' +
    '<button class="btn btn-primary btn-block" type="submit">Login</button></form>' +
    '<div class="auth-switch">No account? <a onclick="navigate(\'register\')">Register</a></div>' +
    '<div class="form-hint" style="margin-top:16px;text-align:center">' +
    'Demo: admin@pawalert.lk / nimal@carn.lk / saman@carn.lk / asha@email.com<br>Password: <code>password123</code></div></div>';
}

async function handleLogin(form) {
  try { await doLogin(form.email.value, form.password.value); }
  catch (e) { toast(e.message, 'error'); }
}

function viewRegister() {
  return '<div class="auth-box"><h2>Register</h2>' +
    '<form onsubmit="event.preventDefault(); handleRegister(this)">' +
    '<div class="form-group"><label>Full Name</label><input type="text" name="name" required /></div>' +
    '<div class="form-group"><label>Email</label><input type="email" name="email" required /></div>' +
    '<div class="form-group"><label>Phone</label><input type="tel" name="phone" required /></div>' +
    '<div class="form-group"><label>Password</label><input type="password" name="password" required minlength="6" /></div>' +
    '<div class="form-group"><label>Role</label>' +
    '<select name="role" onchange="toggleOrgField(this.value)">' +
    '<option value="Reporter">Reporter (General Public)</option>' +
    '<option value="Rescuer">Rescuer / Volunteer</option>' +
    '<option value="Coordinator">Rescue Coordinator</option></select></div>' +
    '<div class="form-group" id="orgField" style="display:none"><label>Organisation</label>' +
    '<select name="orgId" id="orgSelect"><option value="">Select…</option></select>' +
    '<div class="form-hint">Coordinator/Rescuer accounts require admin approval.</div></div>' +
    '<button class="btn btn-primary btn-block" type="submit">Create Account</button></form>' +
    '<div class="auth-switch">Already have an account? <a onclick="navigate(\'login\')">Login</a></div></div>';
}

function toggleOrgField(role) {
  document.getElementById('orgField').style.display =
    (role === 'Coordinator' || role === 'Rescuer') ? 'block' : 'none';
}

async function loadOrgsForRegister() {
  try {
    var orgs = await api('/api/organizations');
    var sel = document.getElementById('orgSelect');
    if (sel) sel.innerHTML = '<option value="">Select…</option>' +
      orgs.map(function(o) {
        return '<option value="' + o.OrgID + '">' + esc(o.Name) + ' (' + esc(o.ServiceArea) + ')</option>';
      }).join('');
  } catch (e) {}
}

async function handleRegister(form) {
  try {
    var body = {
      name: form.name.value, email: form.email.value, phone: form.phone.value,
      password: form.password.value, role: form.role.value,
      orgId: form.orgId ? form.orgId.value : null
    };
    var data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    toast(data.message, 'success');
    navigate('login');
  } catch (e) { toast(e.message, 'error'); }
}

function renderCaseList(cases) {
  if (!cases.length) return '<div class="empty"><div class="icon">📭</div>No cases match</div>';
  return cases.map(function(c) {
    return '<div class="case-item" onclick="navigate(\'case\',\'' + esc(c.CaseID) + '\')">' +
      '<div class="animal-icon">' + animalIcon(c.AnimalType) + '</div><div>' +
      '<div class="id">' + esc(c.CaseID) + ' · ' + esc(c.AnimalType) + ' / ' + esc(c.ConditionType) + '</div>' +
      '<div class="meta">' + esc(c.LocationText) + ' · ' + esc(c.CreatedAt) + '</div></div>' +
      '<div class="right" style="text-align:right">' + urgencyBadge(c.UrgencyLevel) + ' ' + statusPill(c.Status) + '</div></div>';
  }).join('');
}

async function viewCoordinator(el) {
  el.innerHTML = '<div class="empty"><div class="icon">⏳</div>Loading dashboard…</div>';
  var results = await Promise.all([api('/api/cases'), api('/api/admin/stats'), api('/api/teams'), api('/api/rescuers')]);
  state.cases = results[0]; state.stats = results[1]; state.teams = results[2]; state.rescuers = results[3];
  var stats = state.stats;
  var pending = 0, verified = 0;
  (stats.byStatus || []).forEach(function(s) {
    if (s.Status === 'Pending') pending = s.n;
    if (s.Status === 'Verified') verified = s.n;
  });
  el.innerHTML = '<h2 style="margin-bottom:16px;color:var(--primary)">Coordinator Dashboard</h2>' +
    '<div class="grid-4" style="margin-bottom:20px">' +
    '<div class="stat-card"><div class="num">' + stats.total + '</div><div class="label">Total Cases</div></div>' +
    '<div class="stat-card"><div class="num" style="color:var(--danger)">' + stats.openCritical + '</div><div class="label">Open Critical/High</div></div>' +
    '<div class="stat-card"><div class="num">' + pending + '</div><div class="label">Pending</div></div>' +
    '<div class="stat-card"><div class="num">' + verified + '</div><div class="label">Verified</div></div></div>' +
    '<div class="filters">' +
    '<select id="fStatus" onchange="filterCases()"><option value="">All statuses</option>' +
    ['Pending','Verified','Assigned','Accepted','EnRoute','Rescued','Completed','Rejected'].map(function(s){return '<option>'+s+'</option>';}).join('') +
    '</select><select id="fUrgency" onchange="filterCases()"><option value="">All urgency</option>' +
    ['Critical','High','Medium','Low'].map(function(s){return '<option>'+s+'</option>';}).join('') +
    '</select><input type="text" id="fSearch" placeholder="Search…" oninput="filterCases()" style="min-width:160px" /></div>' +
    '<div class="case-list" id="caseList">' + renderCaseList(state.cases) + '</div>';
}

function filterCases() {
  var st = (document.getElementById('fStatus') || {}).value || '';
  var ug = (document.getElementById('fUrgency') || {}).value || '';
  var q = ((document.getElementById('fSearch') || {}).value || '').toLowerCase();
  var list = state.cases;
  if (st) list = list.filter(function(c) { return c.Status === st; });
  if (ug) list = list.filter(function(c) { return c.UrgencyLevel === ug; });
  if (q) list = list.filter(function(c) {
    return (c.CaseID + c.LocationText + (c.Description || '')).toLowerCase().indexOf(q) >= 0;
  });
  document.getElementById('caseList').innerHTML = renderCaseList(list);
}

async function viewRescuer(el) {
  el.innerHTML = '<div class="empty"><div class="icon">⏳</div>Loading…</div>';
  var cases = await api('/api/cases');
  state.cases = cases;
  var avail = state.user && state.user.isAvailable !== false;
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
    '<h2 style="color:var(--primary);margin:0">My Cases</h2>' +
    '<button class="btn btn-sm ' + (avail ? 'btn-success' : 'btn-outline') + '" onclick="toggleAvailability()">' +
    (avail ? '● On Duty' : '○ Off Duty') + '</button></div>' +
    '<div class="case-list">' + renderCaseList(cases) + '</div>';
}

async function toggleAvailability() {
  var next = !(state.user.isAvailable !== false);
  await api('/api/users/me/availability', { method: 'POST', body: JSON.stringify({ available: next }) });
  state.user.isAvailable = next;
  toast(next ? 'You are now On Duty' : 'You are now Off Duty', 'success');
  navigate('rescuer');
}

async function viewMyReports(el) {
  el.innerHTML = '<div class="empty"><div class="icon">⏳</div>Loading…</div>';
  var cases = await api('/api/cases?mine=1');
  el.innerHTML = '<h2 style="margin-bottom:16px;color:var(--primary)">My Reports</h2>' +
    '<div class="case-list">' + renderCaseList(cases) + '</div>';
}

async function viewCaseDetail(el, caseId) {
  el.innerHTML = '<div class="empty"><div class="icon">⏳</div>Loading case…</div>';
  var c = await api('/api/cases/' + encodeURIComponent(caseId));
  state.currentCase = c;
  var role = state.user ? state.user.role : '';
  var actions = '';

  if (role === 'Coordinator' || role === 'Admin') {
    if (c.Status === 'Pending' || c.Status === 'Declined') {
      actions += '<button class="btn btn-success btn-sm" onclick="caseAction(\'verify\')">✓ Verify</button> ' +
        '<button class="btn btn-danger btn-sm" onclick="caseAction(\'reject\')">✗ Reject</button> ';
    }
    if (c.Status === 'Verified' || c.Status === 'Declined') {
      actions += '<button class="btn btn-primary btn-sm" onclick="showAssignForm()">Assign Rescuer</button> ';
    }
  }
  if (role === 'Rescuer' || role === 'Admin') {
    if (c.Status === 'Assigned') {
      actions += '<button class="btn btn-success btn-sm" onclick="caseAction(\'accept\')">Accept</button> ' +
        '<button class="btn btn-danger btn-sm" onclick="caseAction(\'decline\')">Decline</button> ';
    }
    var nextMap = {
      Accepted: ['EnRoute', 'UnableToLocate'],
      EnRoute: ['Rescued', 'UnableToLocate'],
      Rescued: ['AtVetCare', 'Completed'],
      AtVetCare: ['Completed']
    };
    if (nextMap[c.Status]) {
      actions += '<select id="nextStatus" style="width:auto;padding:6px 10px">' +
        nextMap[c.Status].map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('') +
        '</select> <input type="text" id="statusNotes" placeholder="Notes (optional)" style="width:auto;min-width:140px;padding:6px 10px" /> ' +
        '<button class="btn btn-primary btn-sm" onclick="updateStatus()">Update Status</button>';
    }
  }

  if ((role === 'Coordinator' || role === 'Admin') && (!state.teams || !state.teams.length)) {
    state.teams = await api('/api/teams');
    state.rescuers = await api('/api/rescuers');
  }

  var contactHtml = '';
  if (c.ReporterPhone && (role === 'Coordinator' || role === 'Rescuer' || role === 'Admin')) {
    contactHtml = '<div class="card"><strong>Reporter contact:</strong> ' + esc(c.ReporterName) + ' · ' + esc(c.ReporterPhone) + '</div>';
  }

  el.innerHTML = '<button class="btn-text" onclick="navigate(roleHome(state.user ? state.user.role : \'home\'))" style="margin-bottom:12px">← Back</button>' +
    renderCaseSummary(c) + contactHtml +
    '<div class="detail-actions">' + actions + '</div>' +
    '<div id="assignForm" style="display:none;margin-top:16px" class="card"><h3>Assign Rescuer / Team</h3>' +
    '<div class="form-row"><div class="form-group"><label>Team</label>' +
    '<select id="assignTeam"><option value="">—</option>' +
    (state.teams || []).map(function(t) { return '<option value="' + t.TeamID + '">' + esc(t.TeamName) + '</option>'; }).join('') +
    '</select></div><div class="form-group"><label>Rescuer</label>' +
    '<select id="assignRescuer"><option value="">—</option>' +
    (state.rescuers || []).map(function(r) {
      return '<option value="' + r.UserID + '">' + esc(r.Name) + (r.IsAvailable ? ' (available)' : ' (off-duty)') + '</option>';
    }).join('') +
    '</select></div></div>' +
    '<button class="btn btn-primary btn-sm" onclick="doAssign()">Confirm Assignment</button></div>';
}

function showAssignForm() {
  document.getElementById('assignForm').style.display = 'block';
}

async function doAssign() {
  var teamId = document.getElementById('assignTeam').value || null;
  var rescuerId = document.getElementById('assignRescuer').value || null;
  try {
    await api('/api/cases/' + state.currentCase.CaseID + '/assign', {
      method: 'POST',
      body: JSON.stringify({ teamId: teamId ? +teamId : null, rescuerId: rescuerId ? +rescuerId : null })
    });
    toast('Case assigned', 'success');
    navigate('case', state.currentCase.CaseID);
  } catch (e) { toast(e.message, 'error'); }
}

async function caseAction(action) {
  var body = {};
  if (action === 'reject' || action === 'decline') {
    body.reason = prompt('Reason (optional):') || '';
  }
  if (action === 'verify') body.notes = 'Verified by coordinator';
  try {
    await api('/api/cases/' + state.currentCase.CaseID + '/' + action, {
      method: 'POST', body: JSON.stringify(body)
    });
    toast('Case ' + action + 'ed', 'success');
    navigate('case', state.currentCase.CaseID);
  } catch (e) { toast(e.message, 'error'); }
}

async function updateStatus() {
  var status = document.getElementById('nextStatus').value;
  var notes = document.getElementById('statusNotes').value;
  try {
    await api('/api/cases/' + state.currentCase.CaseID + '/status', {
      method: 'POST', body: JSON.stringify({ status: status, notes: notes })
    });
    toast('Status updated to ' + status, 'success');
    navigate('case', state.currentCase.CaseID);
  } catch (e) { toast(e.message, 'error'); }
}

async function viewAdmin(el) {
  el.innerHTML = '<div class="empty"><div class="icon">⏳</div>Loading…</div>';
  var results = await Promise.all([api('/api/admin/users'), api('/api/admin/stats'), api('/api/organizations')]);
  var users = results[0], stats = results[1], orgs = results[2];
  el.innerHTML = '<h2 style="margin-bottom:16px;color:var(--primary)">Administration</h2>' +
    '<div class="grid-4" style="margin-bottom:20px">' +
    '<div class="stat-card"><div class="num">' + stats.total + '</div><div class="label">Total Cases</div></div>' +
    '<div class="stat-card"><div class="num" style="color:var(--danger)">' + stats.openCritical + '</div><div class="label">Open Critical/High</div></div>' +
    '<div class="stat-card"><div class="num">' + users.length + '</div><div class="label">Users</div></div>' +
    '<div class="stat-card"><div class="num">' + orgs.length + '</div><div class="label">Organisations</div></div></div>' +
    '<div class="card"><h3>Users</h3><div style="overflow-x:auto"><table>' +
    '<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Org</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
    users.map(function(u) {
      return '<tr><td>' + esc(u.Name) + '</td><td>' + esc(u.Email || '—') + '</td><td>' + esc(u.Role) + '</td>' +
        '<td>' + esc(u.OrgName || '—') + '</td><td>' +
        (u.IsApproved ? '<span style="color:var(--success)">Approved</span>' : '<span style="color:var(--warning)">Pending</span>') +
        '</td><td>' +
        (!u.IsApproved ? '<button class="btn btn-success btn-sm" onclick="adminApprove(' + u.UserID + ')">Approve</button> ' : '') +
        (u.IsApproved && u.Role !== 'Admin' ? '<button class="btn btn-danger btn-sm" onclick="adminSuspend(' + u.UserID + ')">Suspend</button>' : '') +
        '</td></tr>';
    }).join('') +
    '</tbody></table></div></div>' +
    '<div class="card"><h3>Statistics by Urgency</h3><div class="grid-4">' +
    (stats.byUrgency || []).map(function(s) {
      return '<div class="stat-card"><div class="num">' + s.n + '</div><div class="label">' + esc(s.UrgencyLevel) + '</div></div>';
    }).join('') + '</div></div>' +
    '<div class="card"><h3>Add Organisation</h3>' +
    '<form onsubmit="event.preventDefault(); addOrg(this)" class="form-row">' +
    '<div class="form-group"><label>Name</label><input name="name" required /></div>' +
    '<div class="form-group"><label>Service Area</label><input name="serviceArea" required /></div>' +
    '<div class="form-group"><label>Contact</label><input name="contactInfo" required /></div>' +
    '<div class="form-group" style="display:flex;align-items:flex-end"><button class="btn btn-primary btn-sm" type="submit">Add</button></div>' +
    '</form></div>';
}

async function adminApprove(id) {
  await api('/api/admin/users/' + id + '/approve', { method: 'POST', body: '{}' });
  toast('User approved', 'success');
  navigate('admin');
}
async function adminSuspend(id) {
  await api('/api/admin/users/' + id + '/suspend', { method: 'POST', body: '{}' });
  toast('User suspended', 'success');
  navigate('admin');
}
async function addOrg(form) {
  try {
    await api('/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({ name: form.name.value, serviceArea: form.serviceArea.value, contactInfo: form.contactInfo.value })
    });
    toast('Organisation added', 'success');
    navigate('admin');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadNotifs() {
  if (!state.token) return;
  try {
    state.notifs = await api('/api/notifications');
    var unread = state.notifs.filter(function(n) { return !n.IsRead; }).length;
    var badge = document.getElementById('notifBadge');
    if (unread > 0) { badge.style.display = 'flex'; badge.textContent = unread; }
    else badge.style.display = 'none';
  } catch (e) {}
}

function toggleNotifPanel() {
  var panel = document.getElementById('notifPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    document.getElementById('notifList').innerHTML = state.notifs.length
      ? state.notifs.map(function(n) {
          return '<div class="notif-item ' + (n.IsRead ? '' : 'unread') + '" onclick="openNotif(' + n.NotificationID + ',\'' + esc(n.CaseID) + '\')">' +
            '<div class="ntitle">' + esc(n.Title) + ' <small style="color:var(--muted)">[' + esc(n.Channel) + ']</small></div>' +
            '<div>' + esc(n.Message) + '</div><div class="ntime">' + esc(n.SentAt) + '</div></div>';
        }).join('')
      : '<div class="empty" style="padding:24px">No notifications</div>';
  }
}

async function openNotif(id, caseId) {
  try { await api('/api/notifications/' + id + '/read', { method: 'POST', body: '{}' }); } catch (e) {}
  document.getElementById('notifPanel').classList.remove('open');
  navigate('case', caseId);
  loadNotifs();
}

async function markAllRead() {
  await api('/api/notifications/read-all', { method: 'POST', body: '{}' });
  loadNotifs();
  document.getElementById('notifPanel').classList.remove('open');
}

(async function init() {
  await loadMe();
  renderNav();
  render();
  setInterval(function() { if (state.token) loadNotifs(); }, 30000);
})();
