# PawAlert – Animal Rescue Incident Management System


**University of Moratuwa · Bachelor of Information Technology**  
**Author:** Techeow | R. Sumaiya

---

## Overview
Web-based system for reporting and coordinating animal rescue incidents in Sri Lanka. Supports public reporting, coordinator verification, rescuer assignment, and real-time status tracking.

## Tech stack
- Frontend: HTML/CSS/JavaScript (mobile-first PWA)
- Backend: Node.js (REST API)
- Database: PostgreSQL (Supabase)
- Auth: JWT + role-based access (Admin, Coordinator, Rescuer, Reporter)
- Hosting: Render (free tier)

## Demo
Live: [render-url]  
Demo password for all accounts: `password123`

| Email              | Role        |
|--------------------|-------------|
| admin@pawalert.lk  | Admin       |
| nimal@carn.lk      | Coordinator |
| saman@carn.lk      | Rescuer     |
| asha@email.com     | Reporter    |


## Local run
bash
cd backend
npm install
node server.js
---

## Features Implemented

- **Public / Guest reporting** – no registration required; tracking code issued
- **Role-based dashboards** – Reporter, Coordinator, Rescuer, Admin
- **Case workflow** – Pending → Verified → Assigned → Accepted → EnRoute → Rescued → AtVetCare → Completed
- **Emergency notifications** – In-app + Push + SMS (simulated) for Critical/High cases
- **Nearby / duplicate case hints** – reduces wasted rescue effort (research-gap improvement)
- **Immutable status audit trail**
- **GPS location capture**
- **Photo upload**
- **Rescuer on-duty toggle**
- **Admin user approval & organisation management**
- **Responsive mobile-first UI** (PWA-ready)

---

## Architecture

```
frontend/          Static SPA (HTML/CSS/JS)
backend/
  server.js        Express REST API
  db.js            SQLite schema + seed data
  middleware/      JWT authentication
  uploads/         Incident photos
  pawalert.db      SQLite database (auto-created)
```

Three-tier design: Presentation (SPA) → Application (Express) → Data (SQLite).

---

## API Overview

| Method | Endpoint                         | Description                |
|--------|----------------------------------|----------------------------|
| POST   | /api/auth/register               | Register user              |
| POST   | /api/auth/login                  | Login → JWT                |
| POST   | /api/cases                       | Submit rescue report       |
| GET    | /api/cases/track/:code           | Guest status tracking      |
| GET    | /api/cases                       | List cases (role-filtered) |
| POST   | /api/cases/:id/verify            | Coordinator verify         |
| POST   | /api/cases/:id/assign            | Assign rescuer/team        |
| POST   | /api/cases/:id/accept            | Rescuer accept             |
| POST   | /api/cases/:id/status            | Update rescue progress     |
| GET    | /api/notifications               | User notifications         |
| GET    | /api/admin/stats                 | Dashboard statistics       |

---

## Improvements Beyond Original SRS

1. **Nearby-case / duplicate detection** on submission – addresses the research gap of wasted parallel rescue efforts.
2. **Urgency guidance text** on the report form – helps non-experts choose the correct priority.
3. **Rescuer On-Duty / Off-Duty toggle** – improves notification targeting.
4. **In-app notification centre** with read/unread state – works even without real FCM keys.
5. **Privacy notice** on the report form – aligns with current data-protection expectations.
6. **Soft-active flags** on organisations and teams – preserves audit history.
7. **Mobile-first responsive design** with PWA manifest.
8. **Demo seed data** so evaluators can exercise every role immediately.

---

## Testing

Use the demo accounts to walk through:

1. Guest submits a Critical report → check Coordinator dashboard + Rescuer notifications.
2. Coordinator verifies → assigns → Rescuer accepts → progresses status → Completed.
3. Reporter tracks via tracking code.
4. Admin approves a new Rescuer registration.

---

## License

Techeow | R. Sumaiya
