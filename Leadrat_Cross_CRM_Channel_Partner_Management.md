# Cross-CRM Channel Partner Management — Leadrat

## 1. Product Overview

**Product:** Cross-CRM Channel Partner Management  
**Platform:** Leadrat CRM  
**Focus Area:** Channel Partner Ecosystem  
**Solution Nature:** Cross-organisation product workflow

The solution enables a channel partner to register and work a customer from Leadrat, a simulated external CRM, or another partner system while preserving ownership, preventing duplicates, controlling builder visibility, managing booking handover, and retaining partner commission attribution.

The objective is to create a trusted collaboration layer between **Builders** and **Channel Partners** without forcing partners to duplicate their customer data and activities inside the builder's CRM.

---

## 2. Problem Statement

Builders and channel partners frequently use separate CRM systems and maintain different versions of the same customer journey.

Typical processes such as:

- Lead registration
- Duplicate checking
- Customer ownership
- Lead status updates
- Booking responsibility
- Partner attribution
- Commission tracking

are often handled through portals, spreadsheets, emails, WhatsApp messages, or manual coordination.

This creates:

- Ownership disputes
- Duplicate registrations
- Data duplication
- Limited visibility
- Manual reconciliation
- Unclear booking handover
- Commission attribution issues

---

## 3. Product Objective

Build a Leadrat workflow that allows:

1. Channel partners to register customers from their own CRM.
2. Leadrat to validate registrations and detect duplicates.
3. The partner to retain ownership and working responsibility before booking.
4. The builder to receive only permitted customer and progress information.
5. Booking to automatically transfer operational responsibility to the builder.
6. Partner attribution to survive the ownership transfer.
7. Commission eligibility to be created automatically.
8. Every important action to be captured in an audit timeline.

---

## 4. Primary Users

### Channel Partner

Responsible for:

- Customer registration
- Lead qualification
- Customer follow-up
- Journey updates
- Maintaining customer ownership before booking

### Builder / Developer

Responsible for:

- Validating registrations
- Monitoring permitted progress
- Managing post-booking customer operations
- Taking responsibility after booking

### Sales Operations

Responsible for:

- Registration validation
- Duplicate management
- Ownership monitoring
- Booking handover
- Conflict/dispute management

### Finance / Commission Team

Responsible for:

- Partner attribution
- Commission eligibility
- Commission records
- Future commission statements

---

# 5. Core Product Workflow

```text
Partner CRM
     |
     v
Leadrat Registration API
     |
     v
Identity & Duplicate Check
     |
     +----------------------+
     |                      |
     v                      v
Accepted                Rejected
     |                      |
     v                      v
Partner Ownership       Reason Returned
     |
     v
Partner Works Customer
     |
     v
Controlled Builder Visibility
     |
     v
Booking Event
     |
     v
Operational Responsibility Transfer
     |
     +----------------------+----------------------+
     |                      |                      |
     v                      v                      v
Builder Ownership     Partner Attribution    Commission Eligibility
     |
     v
Audit Timeline
```

---

# 6. Registration

## Objective

Allow a channel partner to submit a customer registration from:

- Leadrat
- Simulated external CRM
- Partner CRM
- External API
- Integration connector

## Registration Data

Example:

```json
{
  "partnerId": "PARTNER-001",
  "projectId": "PROJECT-A",
  "customer": {
    "name": "Rahul Kumar",
    "mobile": "+91XXXXXXXXXX",
    "email": "rahul@example.com"
  },
  "source": "PARTNER_CRM",
  "externalReferenceId": "CRM-12345"
}
```

## Expected Response

### Accepted

```json
{
  "status": "ACCEPTED",
  "registrationId": "REG-10001",
  "owner": "PARTNER-001",
  "protectionDays": 30,
  "expiryDate": "YYYY-MM-DD"
}
```

### Rejected

```json
{
  "status": "REJECTED",
  "reasonCode": "DUPLICATE_PROTECTED",
  "reason": "Customer is already registered by another partner.",
  "protectedUntil": "YYYY-MM-DD"
}
```

---

# 7. Duplicate Protection

Duplicate protection is one of the core capabilities.

## Configurable Rules

The system should support configurable identity matching using combinations such as:

- Mobile number
- Email
- Customer name
- Project
- Unit/property
- Other configured identifiers

## Protection Window

The builder can configure an X-day ownership window.

Example:

```text
Duplicate Protection = 30 Days
```

If Partner A registers a customer today:

```text
Registration Date: 17-Sep-2026
Protection Expiry: 17-Oct-2026
```

Another partner attempting to register the same customer during this period should receive a clear rejection.

## Important Requirements

- Duplicate decisions must be consistent.
- Duplicate decisions must be explainable.
- Protection expiry must be visible.
- Rules must be configurable.
- Ownership must never be silently overwritten.

---

# 8. Ownership Model

Leadrat should maintain separate concepts for:

### Partner Working Ownership

The partner responsible for working the customer before booking.

### Builder Visibility

The information the builder is allowed to see before booking.

### Builder Operational Ownership

The organisation responsible for the customer after booking.

This separation prevents the builder from taking over a partner's customer prematurely.

## Example

### Before Booking

```text
Working Owner       = ABC Realty
Operational Owner   = ABC Realty
Builder Visibility  = Limited
Partner Attribution = ABC Realty
```

### After Booking

```text
Working Owner       = ABC Realty
Operational Owner   = Builder
Builder Visibility  = Full/Post-booking permitted
Partner Attribution = ABC Realty
Commission          = Eligible
```

---

# 9. Controlled Synchronisation

The partner and builder should not need complete bidirectional CRM synchronisation.

Leadrat should share only explicitly permitted information.

## Example Builder View

The builder may see:

- Customer name
- Project
- Registration date
- Registration status
- Lead stage
- Last progress event
- Expected next action
- Booking status

The builder should not automatically receive:

- Partner internal notes
- Private follow-up information
- Internal partner activities
- Unauthorised customer fields
- Other partner registrations

---

# 10. Field-Level Sharing

Sharing rules should be configurable.

Example:

| Field | Partner | Builder Before Booking | Builder After Booking |
|---|---|---|---|
| Customer Name | Full | Full | Full |
| Mobile | Full | Configurable | Full/Configurable |
| Email | Full | Configurable | Full/Configurable |
| Project | Full | Full | Full |
| Lead Stage | Full | Allowed | Allowed |
| Partner Notes | Full | No | No/Configurable |
| Internal Activities | Full | No | Configurable |
| Booking Status | Full | Limited | Full |
| Commission Status | Full | Limited | Configurable |

---

# 11. Partner Journey

The partner should be able to continue working the customer through its own CRM.

Example journey:

```text
Registered
    |
    v
Contacted
    |
    v
Qualified
    |
    v
Site Visit
    |
    v
Negotiation
    |
    v
Booking
```

The partner remains responsible for the customer until the configured booking event.

---

# 12. Builder View

The builder receives controlled visibility rather than ownership.

Example:

```text
Customer: Rahul Kumar
Project: Project A
Partner: ABC Realty
Registration: Accepted
Protection Until: 17-Oct-2026
Current Stage: Site Visit
Last Update: Site visit completed
Ownership: Partner
Booking: Pending
```

### Builder Restrictions Before Booking

The builder should not be able to:

- Take ownership
- Assign the customer to another partner
- Delete the partner registration
- Change partner attribution
- Override duplicate protection
- Access unauthorised partner information

---

# 13. Booking Handover

Booking is the key responsibility-transfer event.

When a booking is completed:

1. Booking event is generated.
2. Partner working responsibility is retained historically.
3. Builder becomes the operational owner.
4. Partner attribution is preserved.
5. Commission eligibility record is created.
6. Audit event is generated.
7. Required systems receive the booking event.

## Example

```text
BEFORE BOOKING

Owner              = ABC Realty
Builder Ownership  = No
Partner Attribution = ABC Realty
Commission          = Pending


BOOKING EVENT


AFTER BOOKING

Owner              = Builder
Builder Ownership  = Yes
Partner Attribution = ABC Realty
Commission          = Eligible
```

---

# 14. Commission Eligibility

The system should create a commission-eligibility record when the booking meets the configured conditions.

Example:

```json
{
  "registrationId": "REG-10001",
  "partnerId": "PARTNER-001",
  "bookingId": "BOOK-90001",
  "projectId": "PROJECT-A",
  "attributionStatus": "ATTRIBUTED",
  "commissionEligibility": "ELIGIBLE",
  "createdAt": "YYYY-MM-DDTHH:mm:ss"
}
```

The hackathon MVP does **not** require actual commission payout.

---

# 15. Audit Timeline

Every important cross-company action should be recorded.

Example:

```text
17-Sep 10:00 — Partner registration received
17-Sep 10:00 — Duplicate check completed
17-Sep 10:00 — Registration accepted
17-Sep 10:01 — 30-day protection granted
17-Sep 11:30 — Partner updated stage to Contacted
18-Sep 15:00 — Partner updated stage to Site Visit
19-Sep 12:00 — Builder viewed permitted progress
25-Sep 16:30 — Booking completed
25-Sep 16:30 — Operational ownership transferred to Builder
25-Sep 16:30 — Partner attribution preserved
25-Sep 16:31 — Commission eligibility created
25-Sep 16:31 — Handover completed
```

---

# 16. Idempotency

External events must be idempotent.

The same external event should not:

- Create multiple registrations
- Create duplicate bookings
- Create duplicate commission eligibility records
- Transfer ownership multiple times
- Generate duplicate audit events

Use an external reference/event ID.

Example:

```text
externalEventId = PARTNER-CRM-BOOKING-12345
```

If the same event is received again, Leadrat should return the existing result instead of performing the operation again.

---

# 17. API / Integration Layer

## Suggested APIs

### Register Customer

```http
POST /api/channel-partner/registrations
```

### Check Registration

```http
GET /api/channel-partner/registrations/{registrationId}
```

### Update Progress

```http
POST /api/channel-partner/registrations/{registrationId}/progress
```

### Check Duplicate

```http
POST /api/channel-partner/duplicate-check
```

### Booking

```http
POST /api/channel-partner/registrations/{registrationId}/booking
```

### Audit Timeline

```http
GET /api/channel-partner/registrations/{registrationId}/audit
```

### Commission Eligibility

```http
GET /api/channel-partner/registrations/{registrationId}/commission
```

---

# 18. Suggested MVP Screens

## Screen 1 — Partner Registration

Fields:

- Partner
- Customer Name
- Mobile
- Email
- Project
- External CRM Reference
- Register Customer

---

## Screen 2 — Registration Result

Show:

```text
Registration Status: ACCEPTED

Registration ID: REG-10001
Partner: ABC Realty
Project: Project A

Ownership: ABC Realty
Protection Window: 30 Days
Protected Until: 17-Oct-2026
```

For duplicates:

```text
Registration Status: REJECTED

Reason: DUPLICATE_PROTECTED

Existing registration is protected until:
17-Oct-2026
```

---

## Screen 3 — Partner Lead Journey

Show:

- Customer
- Project
- Current owner
- Protection expiry
- Lead stage
- Progress history
- Add progress
- Booking action

---

## Screen 4 — Builder View

Show only permitted information:

```text
Customer
Project
Partner
Registration Status
Current Stage
Last Progress
Booking Status
```

Actions should be restricted before booking.

---

## Screen 5 — Booking Handover

Show:

```text
Booking Confirmed

Operational Owner:
Builder

Partner Attribution:
ABC Realty

Commission Eligibility:
Eligible

Handover:
Completed
```

---

## Screen 6 — Audit Timeline

Display the complete event history from registration through booking and handover.

---

# 19. Mandatory Hackathon Demo

The team must demonstrate one connected working flow.

### Scenario

**Partner:** ABC Realty  
**Project:** Project A  
**Duplicate Window:** 30 days

### Step 1

ABC Realty registers Rahul Kumar from a simulated external CRM.

### Step 2

Leadrat performs duplicate validation.

Result:

```text
ACCEPTED
30-day protection granted
Owner = ABC Realty
```

### Step 3

The same or another partner attempts to register Rahul Kumar.

Result:

```text
REJECTED
Reason = DUPLICATE_PROTECTED
Protection expiry displayed
```

### Step 4

ABC Realty updates Rahul's journey.

Example:

```text
Registered → Contacted → Qualified → Site Visit
```

### Step 5

Builder opens the customer.

Builder sees only configured fields and progress.

Builder cannot take ownership.

### Step 6

ABC Realty completes a booking.

### Step 7

Leadrat performs the handover.

```text
Operational Owner → Builder
Partner Attribution → ABC Realty
Commission Eligibility → Created
```

### Step 8

Both parties can inspect the audit history.

---

# 20. Success Criteria

The MVP is successful when:

- Duplicate decisions are consistent and explainable.
- A partner can work the customer without duplicate data entry.
- Partner ownership remains protected before booking.
- Builder visibility is limited according to configured rules.
- Builder cannot exceed pre-booking permissions.
- Booking creates a clean responsibility transition.
- Partner attribution survives the handover.
- Commission eligibility is created.
- Complete audit history is available.
- Repeated external events do not create duplicate records.

---

# 21. Required Safeguards

### Data Isolation

One partner must never see another partner's registrations.

### Configurable Duplicate Rules

Duplicate rules and protection duration must be configurable.

### Field-Level Security

Every shared field should have explicit visibility rules.

### Ownership Protection

The system must never silently overwrite ownership.

### Idempotent Events

External integrations must safely handle retries.

### Synthetic Data

Use only synthetic/demo customer and partner data during the hackathon.

---

# 22. Suggested Leadrat Architecture

```text
                  +----------------------+
                  |   Partner CRM        |
                  | Simulated External   |
                  +----------+-----------+
                             |
                             | API / Webhook
                             v
                  +----------------------+
                  | Leadrat Integration  |
                  |       Layer          |
                  +----------+-----------+
                             |
                             v
                  +----------------------+
                  | Registration Service |
                  +----------+-----------+
                             |
               +-------------+-------------+
               |                           |
               v                           v
       +---------------+           +---------------+
       | Duplicate     |           | Ownership &   |
       | Engine        |           | Permission    |
       +---------------+           +---------------+
               |                           |
               +-------------+-------------+
                             |
                             v
                  +----------------------+
                  | Lead / Project       |
                  | Management           |
                  +----------+-----------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
      +---------------+             +---------------+
      | Builder View  |             | Partner View |
      +---------------+             +---------------+
              |                             |
              +--------------+--------------+
                             |
                             v
                  +----------------------+
                  | Booking / Handover   |
                  +----------+-----------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
      +---------------+             +---------------+
      | Commission    |             | Audit Trail  |
      | Eligibility   |             |              |
      +---------------+             +---------------+
```

---

# 23. Data Model — Suggested

## Partner

Superseded by the full Channel Partner Registration field set - see section 30. Summary:

```text
Partner
- partnerId, partnerCode (system-generated)
- name, mobile, email, username, passwordHash        (mandatory)
- ~40 optional fields: profile, address, KYC, documents, banking,
  business profile, integration, agreement, commission, notes
- status, kycStatus, approvalStatus, createdBy, lastLoginAt    (system-controlled)
- customFields (admin-defined, open-ended - see section 30)
```

## Customer

```text
Customer
- customerId
- name
- mobile
- email
```

## Registration

```text
Registration
- registrationId
- customerId
- partnerId
- projectId
- status
- registeredAt
- protectionStart
- protectionExpiry
- rejectionReason
- externalReferenceId
```

## Ownership

```text
Ownership
- ownershipId
- registrationId
- workingOwner
- operationalOwner
- ownershipStatus
- effectiveFrom
- effectiveTo
```

## Progress Event

```text
ProgressEvent
- eventId
- registrationId
- stage
- eventType
- eventTime
- source
```

## Booking

```text
Booking
- bookingId
- registrationId
- projectId
- bookingDate
- status
```

## Commission Eligibility

```text
CommissionEligibility
- commissionId
- registrationId
- partnerId
- bookingId
- eligibilityStatus
- createdAt
```

## Audit Event

```text
AuditEvent
- auditId
- registrationId
- eventType
- actor
- source
- timestamp
- previousValue
- newValue
```

---

# 24. Optional Stretch Scope

The following can be considered after the MVP:

- Multiple projects
- Multiple partner organisations
- Partner onboarding
- Partner hierarchy
- Mandate partner flow
- Conflict/dispute workflow
- Commission statement integration
- Advanced partner dashboards
- Webhook subscription management
- Partner performance analytics

---

# 25. Out of Scope

The hackathon MVP does not require:

- Complete production-ready partner portal
- Full bidirectional synchronisation with every CRM
- Partner post-booking payment management
- Actual commission payout
- Production-grade financial settlement
- Complete partner hierarchy management

---

# 26. Recommended Hackathon Positioning

### Product Name

**Leadrat Cross-CRM Channel Partner Management**

### One-Line Pitch

> **Let channel partners work customers from their own CRM while Leadrat protects ownership, controls builder visibility, and seamlessly transfers responsibility at booking without losing partner attribution.**

### Core Differentiator

The solution is not another partner portal.

It is a **trusted cross-organisation collaboration and ownership layer** that connects the partner's CRM with the builder's Leadrat CRM while maintaining:

```text
Ownership
+
Duplicate Protection
+
Controlled Visibility
+
Booking Handover
+
Partner Attribution
+
Commission Eligibility
+
Auditability
```

---

# 27. Hackathon Demo Success Story

```text
ABC Realty registers Rahul
          ↓
Leadrat checks duplicate
          ↓
Registration accepted
          ↓
30-day ownership protection
          ↓
Partner works Rahul in own CRM
          ↓
Builder sees limited progress
          ↓
Rahul books Project A
          ↓
Responsibility moves to Builder
          ↓
ABC Realty remains attributed
          ↓
Commission eligibility created
          ↓
Complete audit timeline preserved
```

**Final Outcome:**  
Leadrat becomes the trusted system coordinating the customer journey between the builder and channel partner without requiring either organisation to abandon its existing CRM workflow.

---

# 28. Implementation — MERN + React Native Setup

The MVP described above has been scaffolded as three codebases in this repository, implementing the workflow, data model, and APIs from sections 5–23.

## Stack

- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Web Frontend (Channel Partner / Builder):** React.js (Vite), React Router, Axios
- **Admin Portal:** React.js (Vite), React Router, Axios — separate app, separate API (see section 29)
- **Mobile App:** React Native (Expo), React Navigation, Axios

## Folder Structure

```text
backend/
  server.js                    Express entry point, mounts BOTH route groups, connects Mongo
  src/config/db.js             MongoDB connection
  src/config/businessRules.js  DEFAULT_* values only - seeds the Settings document once (section 29)
  src/models/                  Partner, Customer, Registration, Ownership, ProgressEvent,
                                Booking, CommissionEligibility, AuditEvent, Counter, IdempotencyRecord,
                                Admin, Settings
  src/services/                duplicateService, ownershipService, auditService, idempotencyService,
                                visibilityService, settingsService, adminAuthService
  src/controllers/             registration, duplicate, booking, audit, commission   (channel-partner)
  src/controllers/admin/       auth, partner, registration, audit, settings, dashboard   (admin)
  src/middleware/adminAuth.js  JWT bearer-token guard, applied only to /api/admin/*
  src/routes/channelPartnerRoutes.js   mounted at /api/channel-partner (no auth layer)
  src/routes/adminRoutes.js            mounted at /api/admin (JWT-protected, except /auth/login)
  seed/seed.js                 Seeds partners, default admin login, and the global Settings document

frontend/                      Channel-partner / builder web app - unchanged, talks only to /api/channel-partner
  src/api/client.js
  src/pages/                   PartnerRegistration, RegistrationResult, PartnerJourney,
                                BuilderView, BookingHandover, AuditTimeline, Lookup

admin/                         Admin Portal - separate app, talks only to /api/admin
  src/api/client.js             Axios client with JWT auth interceptor + 401-redirect-to-login
  src/context/AuthContext.jsx   Login/logout/session state (JWT in localStorage)
  src/pages/                    Login, Dashboard, Partners, PartnerDetail,
                                 Registrations, RegistrationDetail, Audit, Settings

mobile/
  App.js, src/navigation/AppNavigator.js
  src/screens/                 RegisterCustomerScreen, RegistrationResultScreen,
                                PartnerJourneyScreen, BookingHandoverScreen
                                (partner-facing subset of the MVP screens, for on-the-go use)
  src/api/client.js            Axios client, base URL configurable via app.json `expo.extra.apiBaseUrl`
```

## Running Locally

```text
# Backend (requires a local or remote MongoDB)
cd backend
cp .env.example .env
npm install
npm run seed      # creates partners, default admin login, and global settings (see section 29)
npm run dev       # starts on http://localhost:5000

# Web frontend (channel partner / builder)
cd frontend
npm install
npm run dev       # starts on http://localhost:5173, proxies /api to the backend

# Admin Portal
cd admin
npm install
npm run dev       # starts on http://localhost:5174, proxies /api to the backend

# Mobile app (Expo)
cd mobile
npm install
npm start         # opens Expo dev tools; scan QR with Expo Go, or press a/i for emulator
```

## Implementation Notes Beyond the Original Spec

These are additions made while building the MVP, not present in the original design sections above:

- **Sequential IDs** (`REG-10001`, `BOOK-90001`, etc.) are generated via a `Counter` collection rather than raw ObjectIds, to match the ID style used throughout this spec's examples.
- **`view=partner|builder` query parameter** on `GET /registrations/:registrationId` distinguishes the full partner detail view from the field-filtered builder view (section 9/10/12), rather than two separate endpoints.
- **Idempotency** (section 16) is implemented as an `IdempotencyRecord` collection keyed on `(externalReferenceId/externalEventId, routeName)`; a repeated key replays the stored response instead of re-running registration/booking side effects.
- **Progress history** on Screen 3 and Screen 6 is served from the audit timeline (`AuditEvent`) rather than a separate progress-events endpoint, since every stage change is already audit-logged.
- The mobile app intentionally omits the Builder View screen (Screen 4) — builder review is treated as a desktop/web workflow, while the mobile app targets the channel partner working leads on the go.
- Business rules (section 7, 10) moved from static config to a DB-backed `Settings` document once the Admin Portal was introduced — see section 29.

---

# 29. Admin Portal

An internal, operator-facing portal giving Leadrat/Sales Operations full visibility and control across every channel partner, registration, and configuration setting - separate from both the partner-facing web app and the mobile app.

## Why Separate APIs

The admin API (`/api/admin/*`) is a fully independent Express router from the channel-partner API (`/api/channel-partner/*`):

- Different auth model: `/api/admin/*` requires a JWT bearer token (`src/middleware/adminAuth.js`); `/api/channel-partner/*` has no auth layer of its own, matching the original spec's model of partner/builder identity being asserted by the caller.
- Different trust level: admin endpoints return full, unfiltered data and allow mutations (partner status, settings, ownership overrides) that the channel-partner API deliberately never allows a builder to perform (section 12).
- Independently deployable: the admin app (`admin/`) is its own Vite project with its own login screen, calling only the admin API - it can be hosted/restricted separately from the partner-facing frontend.

## Admin API Endpoints

```http
POST   /api/admin/auth/login                              Public - returns a JWT
GET    /api/admin/auth/me                                 Current admin identity

GET    /api/admin/dashboard                                Summary counts (partners, registrations, bookings, commission)

GET    /api/admin/partners                                 List every channel partner
POST   /api/admin/partners                                 Create a new channel partner (client account)
GET    /api/admin/partners/:partnerId                       Partner detail + their registrations + commission summary
PATCH  /api/admin/partners/:partnerId                       Update org details / activate-deactivate

GET    /api/admin/registrations                             List ALL registrations, filter by partnerId/projectId/status/isBooked
GET    /api/admin/registrations/:registrationId              Full unrestricted detail (registration + customer + ownership + booking + commission)
GET    /api/admin/registrations/:registrationId/audit        Audit timeline for one registration
POST   /api/admin/registrations/:registrationId/override     Explicit, audited dispute-resolution action:
                                                              RELEASE_PROTECTION or REASSIGN_PARTNER (reason required)

GET    /api/admin/audit                                       Global audit feed across every partner/registration,
                                                              filterable by registrationId/eventType/actor/date range, paginated

GET    /api/admin/settings                                   View the configurable business rules
PUT    /api/admin/settings                                   Update duplicate protection days, match fields,
                                                              or the field-level visibility table - takes effect immediately
```

## Settings Are Now Live-Editable

`DUPLICATE_PROTECTION_DAYS`, `DUPLICATE_MATCH_FIELDS`, and the `FIELD_VISIBILITY` table (section 10) moved out of static config into a single `Settings` document (`backend/src/models/Settings.js`), read through `settingsService.getSettings()` (cached, invalidated on every admin write). `businessRules.js` now only supplies the one-time seed defaults. The channel-partner API's duplicate check, protection-window calculation, and builder-view field filtering all read from this same live document, so an admin change is reflected on the very next request with no restart.

## Admin Override — Staying Consistent with Section 21's Safeguards

Section 21 requires that "the system must never silently overwrite ownership." The admin override endpoint honors this by design: every override requires a `reason`, is performed by an identified admin (`ADMIN:<email>`), and writes an explicit `AuditEvent` (`ADMIN_PROTECTION_RELEASED` or `ADMIN_PARTNER_REASSIGNED`) to the same audit trail partners and builders can see - so admin control is total, but never silent.

## Default Admin Login (seeded)

```text
Email:    admin@leadrat.example   (override via DEFAULT_ADMIN_EMAIL)
Password: Admin@12345             (override via DEFAULT_ADMIN_PASSWORD)
```

Created by `npm run seed` if no admin with that email exists yet. Change the password (or seed a new admin) before using this outside a local demo.

## Admin Portal Screens

- **Login** — email/password, JWT stored client-side, auto-redirect to login on 401/expiry.
- **Dashboard** — partner/registration/booking/commission counts at a glance.
- **Channel Partners** — list, create, and open a partner to see its registrations, commission summary, and activate/deactivate its account.
- **Registrations** — every registration across every partner, filterable; opening one shows the full unrestricted detail plus an override form and its per-registration audit timeline.
- **Audit** — the global, cross-partner audit feed, filterable by registration/event type/actor.
- **Settings** — edit the duplicate protection window, match fields, and the full field-visibility table from a form, with changes applying immediately.
- **Partner Fields** — see section 30.

---

# 30. Channel Partner Registration — Full Field Set, Custom Fields & CRUD

The Channel Partner record was expanded from the minimal `{partnerId, organisationName, status, contactDetails}` shape into the full registration field set below, with admin-managed custom fields on top. This is entirely an Admin Portal capability - partners themselves still have no self-service signup or login (see "Deliberately Not Built" below).

## Standard Field Set

**Mandatory:** Channel Partner Name, Mobile Number, Email, Username, Password

**Optional**, grouped for the admin UI: Profile (partner type, company name, contact person, alternate mobile/email, website) · Address (address lines, city, state, country, PIN) · KYC (PAN, GSTIN, RERA number/state/expiry) · Documents (PAN/GST/RERA/address-proof - stored as URLs, see note below) · Banking (account holder, bank, account number, IFSC, account type) · Business profile (partner source, referred by, relationship manager, category, operating cities/states, years of experience, sales agent count) · Integration (CRM name, external partner ID, integration type) · Agreement (number, start/expiry dates) · Commission (plan, type, rate) · Notes.

**System-generated** (never entered by a partner or exposed as an editable form field): Partner ID, Partner Code, Status, KYC Status, Approval Status, Created By, Last Login.

## Custom Fields — `FieldDefinition`

Every field above - standard or custom - is a row in a `FieldDefinition` collection (`fieldKey`, `label`, `group`, `dataType`, `options`, `isRequired`, `isEnabled`, `isSystemGenerated`, `isCustom`). The admin portal's **Partner Fields** page lets an admin:

- **Enable/disable** any field (standard or custom) - a disabled field disappears from the partner create/edit form immediately, no code change.
- **Toggle required** on any non-system field.
- **Add a new custom field** (key, label, group, data type - TEXT/TEXTAREA/NUMBER/DATE/BOOLEAN/SELECT/LIST - and options for SELECT) - it appears in the partner form right away and its values are stored in `Partner.customFields` (a schema-less map), so adding a field never requires a migration.
- **Delete** a custom field (standard/system fields cannot be deleted, only disabled, to keep the base schema intact).

The base 56 field-definition rows are seeded once via `npm run seed` (`backend/src/config/partnerFieldDefaults.js` → `fieldDefinitionService.ensureBaseFields`).

## CRUD & Filtering (Admin API)

```http
GET    /api/admin/partners                 List, filtered by any standard field (partial match on text,
                                            exact on status/kycStatus/approvalStatus/partnerId/partnerCode),
                                            createdFrom/createdTo/updatedFrom/updatedTo, and cf_<key> for custom fields
POST   /api/admin/partners                 Create (hashes password, generates partnerId + partnerCode)
GET    /api/admin/partners/:partnerId       Full detail + registrations + commission summary
PATCH  /api/admin/partners/:partnerId       Update any field, including kycStatus/approvalStatus/status
GET    /api/admin/partners/:partnerId/activity   Per-partner activity history (created/updated/status changes)

GET    /api/admin/field-definitions
POST   /api/admin/field-definitions         Create a custom field
PATCH  /api/admin/field-definitions/:fieldKey    Enable/disable, toggle required, edit label/options
DELETE /api/admin/field-definitions/:fieldKey    Custom fields only
```

`passwordHash` is never returned by any admin endpoint. Every create/update writes to the same partner-scoped activity trail (`AuditEvent` with `registrationId: "PARTNER:<partnerId>"`), shown on the Partner Detail page.

## Admin Frontend

The `admin/` app's partner create/edit form (`src/components/PartnerForm.jsx`) is rendered directly from the enabled `FieldDefinition` rows, grouped and ordered the same way as this section - so a newly-added custom field shows up in the form with no frontend change. The Partners list page exposes filters for name/city/status/KYC status and a created-date range, calling straight through to the generic backend filter.

## Deliberately Simplified / Not Built (flagged for transparency)

- **Documents are URL fields, not file uploads.** PAN/GST/RERA/address-proof are plain text URL inputs; no file storage (multer/S3/etc.) was added. Revisit if real document upload becomes a requirement.
- **`username`/`password` are stored (hashed) but there is no partner-facing login yet.** The channel-partner API (`/api/channel-partner/*`) still has no auth layer - it trusts the `partnerId` passed by the caller, unchanged from section 28. These credentials exist so the field set matches the registration requirements and so a partner-login flow can be added later without a schema change, but no login endpoint currently checks them.
- **No hard delete for partners** - only activate/deactivate (`status`), consistent with section 21's "ownership must never be silently overwritten" and to avoid orphaning existing registrations that reference a `partnerId`.

---

# 31. Channel Partner Self-Service (Registration, Login, My Leads)

Section 30 noted that `username`/`password` were captured but nothing checked them yet. This section closes that gap: a channel partner can now register their own account, log in, and manage only their own leads - closing the "one partner must never see another partner's registrations" safeguard (section 21) for real, instead of trusting a client-supplied `partnerId`.

## What Changed vs. Sections 6-17

The **original** `/api/channel-partner/registrations*` endpoints are untouched and still work exactly as before - they remain the unauthenticated surface for server-to-server / simulated-external-CRM integrations (section 6) and for the builder persona (which still has no login concept). Nothing that already worked was broken.

**Added alongside them**: a `/api/channel-partner/partners/*` (public) and `/api/channel-partner/my/*` (JWT-protected) surface for a human channel partner using the web app directly.

```http
POST   /api/channel-partner/partners/register     Public. Creates the account AND returns a session
                                                   token immediately - "register, then manage leads",
                                                   no separate login step or approval gate required.
POST   /api/channel-partner/partners/login         Public. Rejects if Partner.status is INACTIVE
                                                   (admin deactivation still cuts off access). Updates
                                                   lastLoginAt - the first real use of that field.

GET    /api/channel-partner/my/profile             All below require a partner Bearer token.
GET    /api/channel-partner/my/registrations       Only the logged-in partner's own leads.
POST   /api/channel-partner/my/registrations       Create a lead - partnerId is taken from the
                                                   session, never from the request body.
GET    /api/channel-partner/my/registrations/:id    403s if the registration belongs to another partner.
POST   /api/channel-partner/my/registrations/:id/progress
POST   /api/channel-partner/my/registrations/:id/booking
GET    /api/channel-partner/my/registrations/:id/audit
```

## Auth Design

- Partner sessions use a JWT (`partnerAuthService.js`), completely separate from the admin JWT (`adminAuthService.js`) - both are now tagged with a `type` claim (`PARTNER` / `ADMIN`) so a token issued for one can never be replayed against the other's routes, even though they currently share `JWT_SECRET`.
- `partnerAuth` middleware re-checks `Partner.status === 'ACTIVE'` on every request (not just at login), so an admin deactivating a partner mid-session takes effect immediately, not just on next login.
- Self-registration accepts identity/profile fields only (`SELF_REGISTRATION_FIELDS` in `partnerAuthController.js`) - it deliberately excludes admin/builder-controlled business terms (commission plan/type/rate, relationship manager, agreement details, CRM integration settings, internal notes). Those stay admin-only via section 30's Admin Portal.
- `kycStatus`/`approvalStatus` default to `PENDING` on self-registration but do **not** block login or lead management - only `Partner.status` does. They remain informational flags for the admin portal to act on later, matching the requested "register → account opens → manage leads" flow with no approval gate in between.

## Frontend (`frontend/`)

- `PartnerSignup.jsx` / `PartnerLogin.jsx` - new entry points; signup logs the partner in immediately (no separate login step).
- `MyLeads.jsx` - new authenticated home screen listing only the logged-in partner's registrations, replacing "type in a registrationId" as the primary flow.
- `RegisterLead.jsx` - the authenticated register-a-customer form (no partner ID field - implicit from session), reachable from My Leads.
- `PartnerJourney.jsx` was rewired to call the `/my/*` endpoints instead of the old public ones, so it's now ownership-enforced end to end.
- The original `PartnerRegistration.jsx` (Screen 1) is kept, moved to `/simulate-registration`, for the unauthenticated simulated-external-CRM demo flow from section 19 - it still requires typing a `partnerId` by hand, matching that scenario.
- `BuilderView.jsx`, `AuditTimeline.jsx`, `BookingHandover.jsx`, `Lookup.jsx` are unchanged (still public) - the builder persona has no login system in this MVP.

## Deliberately Not Built

- No email/mobile verification, password reset, or "forgot username" flow.
- No admin approval gate before a self-registered partner can work leads (see kycStatus/approvalStatus note above) - can be added later by having `partnerAuth` also check `approvalStatus === 'APPROVED'` if that becomes a requirement.
- The mobile app (`mobile/`) was not updated with the equivalent signup/login/My Leads screens in this pass - it still uses the original unauthenticated flow.

---

# 32. Profile Updates, Manage Team, and Worldwide Timezone Support

Three related additions on top of section 31: a channel partner can update their own profile, can add teammates to help work the same pool of leads, and every date/time in the app is rendered in a timezone each user chooses for themselves (the app runs worldwide, not on one assumed local clock).

## Update Own Info

```http
GET    /api/channel-partner/my/profile      Returns { role, profile } - OWNER gets the Partner record,
                                             MEMBER gets their own TeamMember record.
PATCH  /api/channel-partner/my/profile      OWNER may update the org profile (same field set as
                                             self-registration, section 31) plus name/mobile/email/
                                             timezone/password. MEMBER may only update their own
                                             name/mobile/email/timezone/password.
```

Frontend: `MyProfile.jsx`, reachable via the nav bar for both owners and team members.

## Manage Team

A channel partner ("owner") can add people to their team so more than one person can register and work leads under the same account. Team members log in through the **same** `/api/channel-partner/partners/login` endpoint as the owner - the backend checks the `Partner` collection first, then `TeamMember`, and issues a session scoped to the same `partnerId` either way. Because every `/my/registrations*` check is keyed on `partnerId`, not on who specifically is logged in, a team member automatically sees and can work the exact same leads as the owner - no extra wiring needed.

```http
GET    /api/channel-partner/my/team                 Readable by owner AND team members (roster view).
POST   /api/channel-partner/my/team                 Owner only. Rejects a username already used by
                                                     any Partner or TeamMember (they share one login).
PATCH  /api/channel-partner/my/team/:memberId        Owner only. Can rename, change contact info,
                                                     reset password, or set status ACTIVE/INACTIVE.
DELETE /api/channel-partner/my/team/:memberId        Owner only. Hard delete - a TeamMember is not
                                                     referenced by any Registration (only partnerId is),
                                                     so nothing is orphaned.
```

**Owner-only enforcement** is server-side (`requireOwner` middleware in `partnerAuth.js`), not just hidden in the UI - a member's token gets a `403` if they try to call the mutation endpoints directly.

**Deactivation is immediate**: `partnerAuth` re-checks both the parent Partner's `status` AND (for a member) the `TeamMember`'s own `status` on every request, not just at login - confirmed live: an already-issued session token stopped working the instant the owner deactivated that member.

**Per-member audit attribution**: actions taken by a team member are logged as `<partnerId> (<username>)` rather than just `<partnerId>`, so the audit trail (both the partner-facing one and the admin's global feed) shows which person on the team actually did something, alongside the standard registration audit entries from section 15.

Frontend: `ManageTeam.jsx` - visible to the whole team, but the add/edit/remove controls only render (and only succeed) for the owner.

## Worldwide Timezone Support

The backend already stored every timestamp as UTC (plain JS `Date`/Mongoose behavior) - the gap was that the frontend always rendered dates in whatever timezone the browser happened to be in, which breaks for a partner traveling, an admin in a different region, or any deployment used across time zones.

- `Partner`, `TeamMember`, and `Admin` all gained a `timezone` field (IANA name, e.g. `Asia/Kolkata`), defaulting to `UTC`.
- A channel partner sets theirs at signup (auto-detected from the browser via `Intl.DateTimeFormat().resolvedOptions().timeZone`, editable) or later from `MyProfile.jsx`, with a "use my device's timezone" shortcut.
- A shared `src/utils/timezone.js` (duplicated identically in `frontend/` and `admin/` - no shared package between the two apps) renders any UTC timestamp via the native `Intl.DateTimeFormat(..., { timeZone })` API - no extra date library needed. Applied to My Leads, Partner Journey, Registration Result, and the audit timelines in `frontend/`; to Partner Detail, Registration Detail, and the global Audit feed in `admin/`.
- The **admin's** timezone preference is deliberately a client-side-only setting (a dropdown in the admin nav bar, stored in `localStorage`) rather than a backend profile field with its own update endpoint - it only changes how dates render in that browser, so persisting it server-side wasn't warranted for this MVP.
- Unauthenticated pages (`BuilderView`, `Lookup`, the simulated-registration demo flow) have no user to derive a preference from, so they fall back to the browser's own local timezone via the same utility.

## Deliberately Not Built

- No email/SMS notification when a team member is added or removed.
- No per-member permission granularity beyond OWNER/MEMBER (e.g. a "can book but not edit team" role) - every team member currently has identical lead-management rights.
- Timezone conversion was not extended to the mobile app (`mobile/`) or to every remaining admin screen (e.g. Dashboard, Partners list) - the utility is a single small function, so extending coverage later is mechanical, not architectural.

---

# 33. Real-Estate Lead Form & Shared Data-Grid UI

Two changes: the self-service "Register New Lead" form became a proper real-estate lead-capture form (only the lead's name and mobile number are mandatory - everything else is an optional requirement detail), and the "Manage Team" data-grid look (status tabs, toolbar, dark table header, icon actions, numbered pagination) was rolled out to the other primary list screens instead of staying a one-off.

## Real-Estate Lead Form

**Mandatory:** Lead Name, Mobile Number. **Optional:** Email, Alternate Mobile, Project/Property Name, Requirement Type (Buy/Rent/Sell), Property Type (Apartment/Villa/Plot/Commercial/Office/Other), BHK, Budget Min/Max, Preferred Location, Possession Timeline, Lead Source (Website/Referral/Walk-in/Property Portal/Social Media/Cold Call/Other), Notes, External CRM Reference.

- `Registration.projectId` is no longer a required field - a lead with no project attached defaults to `''`, and duplicate-protection matching (section 7) scopes "no project" leads to that same `''` bucket so protection still works consistently for them.
- New optional fields (`requirementType`, `propertyType`, `bhk`, `budgetMin`, `budgetMax`, `preferredLocation`, `possessionTimeline`, `leadSource`, `notes`) live on `Registration`, since they describe *this particular inquiry*, not the customer's permanent identity. `Customer` gained one new optional field, `alternateMobile`.
- This only applies to the **authenticated self-service flow** (`POST /api/channel-partner/my/registrations`, backing `RegisterLead.jsx`). The original unauthenticated `POST /api/channel-partner/registrations` (the "simulate external CRM" demo endpoint from section 19) is untouched and still requires `projectId` at the controller level, even though the underlying schema no longer enforces it - kept as-is so the original hackathon demo scenario doesn't change behavior.
- `GET /api/channel-partner/my/registrations` now returns each registration enriched with `customerName`/`customerMobile` (previously the list only showed registration IDs with no indication of who the lead was - a real usability gap, fixed alongside this).

## Shared Data-Grid UI Pattern

The look built for Manage Team (section 32) - status tabs with counts, a toolbar (search + secondary filters + CSV export + "Show N entries"), a dark-header `pro-table`, and a numbered pagination footer - is now a reusable CSS pattern (`.status-tabs`, `.toolbar`, `table.pro-table`, `.icon-btn`, `.toggle-switch`, `.pagination-bar`, `.page-wide`, `.form-grid`), duplicated in both `frontend/index.css` (navy theme) and `admin/index.css` (maroon theme) since the two apps don't share a component/style package.

Applied to:
- **`frontend/`**: My Leads (tabs: All/Pending/Booked; export; lead name+mobile shown per row) and the Register New Lead / Edit Team Member forms (full-width, multi-column `.form-grid` layout).
- **`admin/`**: Channel Partners list (tabs: All/Active/Inactive) and Registrations list (tabs: All/Pending/Booked), both with CSV export and client-side pagination layered on top of the existing server-side filters.

**Not yet converted** (flagged, not overlooked): the admin Dashboard, Audit feed, Settings, and Partner Fields pages, and the entire mobile app - all still use their original styling. Since the pattern is now just a set of CSS classes plus a small amount of per-page JS (tabs/pagination state), extending it to any of these is mechanical, not a redesign.
