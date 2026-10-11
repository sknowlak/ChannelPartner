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

---

# 34. Roles & Permissions

Section 32 gave every team member equal rights (add/edit/remove members and manage leads, gated only by OWNER vs MEMBER). This section replaces that binary split with real role-based access control: named roles carrying specific permissions, three built-in roles seeded per partner, and a module for creating custom roles.

## Permissions

Three permissions exist, each tied to an actual gated action - no speculative "everything" list:

```text
MANAGE_LEADS   create/progress/book leads (viewing the shared pool is never gated - unchanged from section 32)
MANAGE_TEAM    add/edit/remove/activate team members
MANAGE_ROLES   create/edit/delete custom roles, assign roles to members
```

## Roles

Roles are scoped per-partner (`Role.partnerId`) - each organisation has its own set. Three are seeded automatically at registration and are **immutable** (can't edit their permissions, can't be deleted):

```text
Super Admin  → MANAGE_LEADS, MANAGE_TEAM, MANAGE_ROLES   (always assigned to the account owner)
Admin        → MANAGE_LEADS, MANAGE_TEAM
Manager      → MANAGE_LEADS                               (default role for a newly-added team member)
```

An owner (or anyone holding `MANAGE_ROLES`) can create additional **custom roles** with any combination of the three permissions via the new Roles & Permissions module.

**The account owner's full access is never dependent on a database lookup.** `role === 'OWNER'` short-circuits to every permission unconditionally in `roleService.resolvePermissions` - even if their `Role` record were somehow missing or corrupted, the owner can never be locked out of their own account. `Partner.roleId` is stored and shown for display ("Super Admin") but is not part of the authorization path.

**Permissions are re-derived from the database on every request**, exactly like the OWNER/MEMBER role check in section 32's `partnerAuth` middleware - never trusted from the JWT. Verified live: promoting a team member to a role with `MANAGE_TEAM` took effect immediately on their *already-issued* session token, with no re-login required.

## API

```http
GET    /api/channel-partner/my/roles                Readable by the whole team (needed for role pickers).
                                                     Returns { availablePermissions, roles: [...{ ...role, memberCount }] }
POST   /api/channel-partner/my/roles                 Create a custom role. Requires MANAGE_ROLES.
PATCH  /api/channel-partner/my/roles/:roleId          Rename / change permissions. Requires MANAGE_ROLES.
                                                     Rejects system roles ("System roles cannot be edited").
DELETE /api/channel-partner/my/roles/:roleId          Requires MANAGE_ROLES. Rejects system roles, and rejects
                                                     a role still assigned to any team member (reassign first).
```

`POST /my/team` now accepts (and defaults to the org's "Manager" role if omitted) a `roleId`; `PATCH /my/team/:memberId` can reassign it. The previous `requireOwner` gate on team-management routes was replaced with `requirePermission(MANAGE_TEAM)` - the owner's Super Admin role always has it, but so can any custom role an owner chooses to grant it to.

## My Profile Moved Under Manage Team

Per this request, "My Profile" is no longer a separate top-level sidebar item - it's now the third tab alongside "Team Members" and "Roles & Permissions" under Manage Team (`/team`, `/team/roles`, `/team/profile`, sharing a `TeamTabs` component). The old `/profile` URL redirects to `/team/profile` rather than breaking.

## Deliberately Not Built

- No permission granularity beyond the three listed - e.g. no separate "view reports" or per-project permissions, since no such features exist yet to gate.
- A custom role with zero permissions is allowed (a "read-only" role that can see the shared lead pool and team roster but do nothing else) - this is intentional, not a bug.
- The mobile app was not updated with role-aware UI in this pass.

---

# 35. UI Consistency Standard: Data-Grid and Edit-Form Patterns

Two layout patterns are now the **standing default** for `frontend/` (and, where applicable, `admin/`) - new screens should reuse them rather than inventing a new layout, so the app doesn't accumulate one-off designs per page.

## Fixed Sidebar

The left sidebar (`.nav-bar`) no longer scrolls with page content. `.app-shell` is locked to `height: 100vh; overflow: hidden`; the sidebar and `.app-content` each independently manage their own height/scroll (`.app-content` has `overflow-y: auto`). A long page (e.g. a big lead list) now scrolls just the content area - the sidebar and top bar stay put.

## Data-Grid Pattern (list screens)

Defined in section 33, applied to My Leads, Manage Team, and the admin Partners/Registrations lists: status tabs with counts → toolbar (search + secondary filters + CSV export + "Show N entries") → dark-header `pro-table` → numbered pagination footer. Any new list screen (e.g. a future admin Roles view, or additional admin tables) should follow this same structure.

## Edit-Form Pattern (create/edit screens)

New shared classes - `.edit-form-sections` (a responsive multi-column grid, one titled section per column), `.form-section-title` (a short underline beneath each section's heading), and `.edit-form-footer` (metadata on the left, Cancel/Save on the right) - standardize every create/edit form in the app:

- **My Profile** (`/team/profile`) - Basic Information / Organisation Information (or Preferences for a team member) / Security & Role
- **Edit Team Member** (`/team/:memberId/edit`) - Basic Information / Preferences / Role & Permissions (a clickable role picker showing each role's permissions inline, not just a dropdown)
- **Add Team Member** (inline form on Manage Team) - same three-column split as Edit Team Member
- **Register New Lead** - Contact Information / Property Requirement / Additional Details
- **Channel Partner Registration** (signup) - Account Details / Organisation Details

Any future create/edit screen (admin partner edit, a future lead-edit screen, etc.) should be built the same way: `.edit-form-sections` for the fields, `.edit-form-footer` for actions, rather than a single stacked column of fields.

## Deliberately Not Converted

- `PartnerRegistration.jsx` (the unauthenticated "simulate external CRM" demo form, section 19) and `Lookup.jsx` are short, single-purpose forms and were left as simple single-column layouts - the section pattern is for multi-part forms.
- The admin app's `PartnerForm.jsx` (used for creating/editing a Channel Partner from the Admin Portal) was not migrated to this pattern in this change - it already uses its own dynamic, `FieldDefinition`-driven grouped-section layout (section 30), which serves the same goal (grouped, multi-column sections) but predates and is structurally different from the `.edit-form-sections` component introduced here. Unifying the two is a reasonable future cleanup, not done now to avoid disturbing the working custom-fields system.

---

# 36. Settings — Lead Module Field Configuration

A new **Settings** page (`/settings`) lets each channel partner configure their *own* lead capture form - enable/disable any field, mark it required, or add entirely new custom fields - mirroring the Channel Partner custom-fields system from section 30, but scoped per-partner and living in the partner-facing app rather than the Admin Portal, since each partner's lead form is theirs to customize independently.

## Data Model

`LeadFieldDefinition` is scoped by `partnerId` (unlike section 30's platform-wide `FieldDefinition`) - every partner gets their own copy of the base 15 fields, seeded automatically at registration (and self-healed lazily on first read for any partner that existed before this feature, so nothing needed to be backfilled).

Each definition carries a **`scope`** the backend uses to know where to read/write its value:

```text
scope: 'customer'      -> stored on Customer.<fieldKey>       (name, mobile, alternateMobile, email)
scope: 'registration'  -> stored on Registration.<fieldKey>   (projectId, requirementType, budgetMin, ...)
scope: 'custom'        -> stored in Registration.customFields (anything a partner adds themselves)
```

`name` and `mobile` are marked `isCore: true` - per the original "only name and number mandatory" requirement (section 33), these can never be disabled or made optional, enforced server-side (`updateFieldDefinition` rejects the attempt) not just hidden in the UI.

## Dynamic Validation ("whatever field I add ... validation also gets created")

`POST /api/channel-partner/my/registrations` no longer hardcodes which fields are required. It loads this partner's field definitions and checks every `isEnabled && isRequired` field against the incoming payload - so marking "Email" required in Settings makes the next lead submission missing an email fail with `400 { reason: "Email is required" }`, with zero code changes. Verified live: toggling `email.isRequired = true` and then submitting a lead without one was correctly rejected; adding it back succeeded.

## Dynamic Filters ("filter ... also get created")

Any **enabled `SELECT`-type field** (standard or custom) automatically becomes a filter dropdown on the My Leads toolbar - `MyLeads.jsx` reads the same field-definition list and renders one `<select>` per such field, reading each registration's value from the right place (`registration[fieldKey]` for `registration`-scope, `registration.customFields[fieldKey]` for `custom`-scope). Adding a custom SELECT field in Settings makes it filterable on My Leads with no additional work.

## Dynamic Form Rendering

`RegisterLead.jsx` no longer hardcodes its fields either - it renders from the same field-definition list via a new shared `DynamicFieldInput.jsx` component (TEXT/TEXTAREA/NUMBER/DATE/SELECT/LIST), grouped into the same three sections from section 35's edit-form pattern (Contact Information / Property Requirement / Additional Details, plus any custom group a partner names). A field with `isRequired` gets the HTML5 `required` attribute automatically, so the browser also enforces it before the request ever leaves the client - the backend check above is the actual authority, this is just faster feedback.

## Permission

A fourth permission, **`MANAGE_SETTINGS`**, gates all lead-field mutations (`POST`/`PATCH`/`DELETE /my/lead-fields`) - reading the list stays open to the whole team (everyone needs it to render the same Register Lead form and My Leads filters). Only the Super Admin role has it by default; Admin and Manager do not, consistent with treating form configuration as an owner-level concern rather than day-to-day lead management. Verified live: a Manager-role member could read field definitions but got a `403` attempting to create one.

## API

```http
GET    /api/channel-partner/my/lead-fields                Readable by the whole team.
POST   /api/channel-partner/my/lead-fields                 Create a custom field. Requires MANAGE_SETTINGS.
PATCH  /api/channel-partner/my/lead-fields/:fieldKey        Rename/toggle/re-require. Requires MANAGE_SETTINGS.
                                                            Rejects disabling or un-requiring a core field.
DELETE /api/channel-partner/my/lead-fields/:fieldKey        Requires MANAGE_SETTINGS. Rejects non-custom fields.
```

## Deliberately Not Built

- No per-field ordering drag-and-drop - custom fields are appended at the end of their group (`sortOrder: 1000`); reordering would need a UI affordance not requested here.
- Filters are generated only for `SELECT`-type fields, not free-text fields (e.g., a custom `TEXT` field doesn't get its own filter box) - the existing name/mobile/registration-ID search box was judged sufficient for free-text; only enumerable fields make sense as dropdown filters.
- This Settings page only configures the **lead** form. It's a separate system from section 30's Admin-Portal-managed Channel Partner field configuration - the two are not unified, since one is platform-wide (admin-managed) and this one is per-partner (self-managed).

---

# 37. Settings as a Unified Hub (superseded by section 38)

Section 36 added Lead field configuration as its own page; this section briefly folded it, Manage Team, Roles & Permissions, and My Profile into **one** "Settings" area with category tabs, instead of leaving Settings and Manage Team as two separate top-level nav items.

**This was reverted in section 38.** The instruction that prompted it ("Setting create sub categories for lead, Manage Team, and other module also same wise") turned out to mean something narrower: Settings should only host per-module *custom form configuration* pages (Lead, User, ...), not swallow Manage Team's CRUD/roster/roles/profile screens, which remain their own top-level module. Kept here for history; see section 38 for the current structure.

# 38. Manage Team (separate module) + Settings as a Custom-Form Hub

Manage Team is its own top-level module again, exactly as it was before section 37 - its own sidebar entry, its own tab bar (`TeamTabs.jsx`: Team Members / Roles & Permissions / My Profile), its own `/team...` URLs. Settings is a pure hub of per-module **custom field configuration** pages only - Lead (section 36) and now User - with the explicit rule that any future module's field configuration is added the same way: one more category tab (`SettingsCategories.jsx`), one more route under `/settings`.

## Structure

```text
/team                  Team member roster + add/edit/remove (section 32)
/team/roles            Roles & Permissions (section 34)
/team/profile          My Profile (section 32)
/team/:memberId/edit   Edit Team Member

/settings              -> redirects to /settings/leads
/settings/leads        Lead field configuration (section 36)
/settings/users        User field configuration (new, this section)
```

The short-lived `/settings/team`, `/settings/team/roles`, `/settings/profile`, `/settings/team/:memberId/edit` URLs from section 37 redirect back to their `/team...` equivalents rather than 404ing.

## User Field Configuration (Settings → User)

The same admin-configurable-fields pattern as Lead fields (section 36), applied to the Add/Edit Team Member form instead of the lead capture form. A new `UserFieldDefinition` model (per-partner, seeded on registration and by `seed.js`) drives:

- **Dynamic form rendering** - the Add Team Member form's "Basic Information"/"Preferences" sections render one `DynamicFieldInput` per enabled field definition instead of a hardcoded list; Edit Team Member does the same (username excluded there - it's immutable, shown read-only in the footer instead).
- **Dynamic validation** - `createTeamMember` loops the enabled+required field definitions and checks `req.body[fieldKey]` is non-empty, replacing the old hardcoded `if (!name || !username || !password)` check. Required-field validation only applies at create; `updateTeamMember` keeps its existing partial-update semantics.
- **Custom fields** - a partner can add fields beyond the base set (Name, Username, Password, Mobile, Email, Timezone - the first three are core/locked, matching what a login actually needs), stored on `TeamMember.customFields` (a `Mixed` map), same shape as the lead system's custom fields.

`DynamicFieldInput` (shared with `RegisterLead.jsx`) gained two field-key special cases to support this reuse: `timezone` renders the existing `COMMON_TIMEZONES` dropdown instead of a plain text box, and `password` renders a password input.

## API

```http
GET    /api/channel-partner/my/user-fields                Readable by the whole team.
POST   /api/channel-partner/my/user-fields                 Create a custom field. Requires MANAGE_SETTINGS.
PATCH  /api/channel-partner/my/user-fields/:fieldKey        Rename/toggle/re-require. Requires MANAGE_SETTINGS.
                                                            Rejects disabling or un-requiring a core field.
DELETE /api/channel-partner/my/user-fields/:fieldKey        Requires MANAGE_SETTINGS. Rejects non-custom fields.
```

## What Didn't Change

Manage Team's actual content, permissions, and behavior (sections 32/34) are unchanged from before section 37 - this is a navigation/URL revert, not a functional rewrite of that module. The Roles & Permissions and My Profile pages still independently load their own permission set and react accordingly.

---

# 39. Full Lead Field Catalogue, Edit Lead, and Column Sorting

Expands the Add Lead form's field set to match Leadrat's real "Add Lead" screen (~50 fields across five tabs), adds an Edit Lead capability that didn't exist before, and adds three-state column sorting to the My Leads grid.

## Lead Field Catalogue

`BASE_LEAD_FIELD_DEFINITIONS` (`backend/src/config/leadFieldDefaults.js`) grew from ~15 fields in three groups to ~50 fields in five groups, renamed to match the form's tabs exactly:

- **Lead Info** - Name, Primary Number, Alternate Number, Landline Number, Email, Referral Name/Phone/Email, Source, Sub-Source, Primary/Secondary Owner, Customer Location.
- **Enquiry Info** - Min/Max Budget, Carpet/Built-up/Saleable/Property/Net Area, Unit Number/Name, Cluster Name, Purpose, Buyer, Payment Plan %, Enquired For, Property Type, Property Sub-Type, Baths, Beds, Preferred Floor(s), Furnish Status, Project(s), Property(s), Offering Type, Agency/Campaign/Channel Partner Name(s), Possession Needed By, Enquired Location.
- **Additional Info** - Profession, Company Name, Designation, Nationality, Gender, Date of Birth, Marital Status, Anniversary Date.
- **Others** - Sourcing Manager, Closing Manager, External CRM Reference.
- **Notes** - Notes (its own tab; required by default, matching the reference screen, but still just a regular field so a partner can make it optional in Settings).

Only `name` and `mobile` stay core (locked required, per section 33 - "only name and number mandatory"). Every other field, including the ~40 new ones, is a normal base field: enabled by default, toggleable via Settings → Lead like any field, and safely deletable-proof (`isCustom: false` means Settings can hide/require it but never delete it, same rule as before). Fields with no natural home in the existing `Registration` schema (areas, beds/baths, payment split, profession, etc.) use `scope: 'custom'`, landing in `Registration.customFields` - this needed no backend schema changes at all, since that path already existed for partner-added custom fields.

Two small correctness fixes that fell out of this:
- `Registration.requirementType/propertyType/bhk/possessionTimeline/leadSource` changed from hardcoded Mongoose `enum` arrays to plain strings. Their actual allowed values already live in `LeadFieldDefinition.options` (partner-editable); a schema-level enum could reject a value a partner is allowed to pick, once field-option editing is exposed. Existing data is untouched (removing an enum only becomes more permissive).
- `ensureBaseFields` (`leadFieldDefinitionService.js`) changed from "seed once if the partner has zero fields" to "insert whichever base fieldKeys this partner doesn't have yet." The former meant adding a new base field to the platform would never reach partners who'd already registered; the latter self-heals every partner up to the current base set on their next request, while leaving any field they've already customized untouched. A one-time migration (run once, not part of the codebase) applied the same relabel/regroup to already-existing partners' field rows so the rename took effect immediately instead of only for new signups.

## Edit Lead (new)

Editing a lead's own details didn't exist before - only stage progress (`/progress`) and booking (`/booking`) had update endpoints. Added:

```http
PATCH /api/channel-partner/my/registrations/:registrationId   Requires MANAGE_LEADS.
```

`updateMyRegistration` (`myLeadsController.js`) loops the partner's field definitions and, per field's `scope`, writes to the `Customer` document, a `Registration` schema column, or `Registration.customFields` - a partial update (only keys present in the request body change), same semantics as `updateTeamMember`. `EditLead.jsx` is the tabbed-form counterpart to `RegisterLead.jsx`, pre-filled from `GET /my/registrations/:id`, reachable via an Edit icon on the My Leads grid row and an "Edit Lead" button on the lead detail (Partner Journey) page.

## Add/Edit Lead UI: Tabs

Both `RegisterLead.jsx` and `EditLead.jsx` render as a tab bar (Lead Info / Enquiry Info / Additional Info / Others / Notes, `.status-tabs` styling reused from elsewhere in the app) with only the active tab's fields shown, each tab's fields split into columns of four for a denser grid than a single stacked list. The tab set itself is derived from whatever groups exist in the partner's enabled field definitions - not hardcoded - so a partner renaming a group or Settings adding a field to a new group changes the tabs with no code change, consistent with the dynamic-field philosophy from section 36. Save/Cancel stay visible under every tab, matching the reference screen's fixed footer.

## Column Sorting (My Leads grid)

Every sortable column header in the My Leads table (`Lead`, `Project`, `Requirement`, `Stage`, `Booked`, `Protection Until`) now cycles three states on click: normal → ascending → descending → normal, via a small shared pair - `utils/sort.js` (`applySort`, `nextSortDir`) and `components/SortableTh.jsx` - built to be reused by any other data-grid page, not just this one. Sorting is applied after filtering and before pagination/export, so the sorted order is what gets paginated and what CSV export downloads.

## What Didn't Change

Duplicate-protection scoping, ownership transfer, booking, and commission-eligibility logic (sections 20-27) are untouched - none of the new fields are load-bearing for those flows, they're purely descriptive lead detail. `projectId` keeps its existing single-string, schema-column identity (relabeled "Project(s)" for display only) precisely because duplicate-protection and booking/commission records key off it directly.

---

# 40. All Fields Everywhere: Get Lead Detail + Manageable/Reorderable Grid Columns

Two follow-ups to section 39's field catalogue: the lead detail ("Get Lead") view only showed five hardcoded fields, and the My Leads grid only showed six hardcoded columns - neither reflected the ~50-field catalogue that Create and Edit already used. This section makes all three (Create, Update, Get) actually show everything, and adds column management to the grid.

## Get Lead: full field detail

`PartnerJourney.jsx` (the lead detail / "Get Lead" screen) gained a "Lead Details" card below the existing operational summary (owner/stage/protection), with the same tab bar as Add/Edit Lead (Lead Info / Enquiry Info / Additional Info / Others / Notes) - just read-only `<dt>/<dd>` pairs instead of form inputs, driven by the same `GET /my/lead-fields` + per-field `scope` lookup that Add/Edit already use. The tab-sorting logic (`sortLeadTabs`, `LEAD_TAB_ORDER`) was pulled out of `RegisterLead.jsx`/`EditLead.jsx` into `utils/leadTabs.js` so all three screens agree on tab order by construction rather than by copy-pasted arrays staying in sync.

## Backend: customer fields exposed on the list endpoint

`listMyRegistrations` previously only inlined `customerName`/`customerMobile` onto each row - enough for the old 6-column grid, not enough to show `alternateMobile`/`email` (or any future `scope: 'customer'` field) as its own grid column. It now embeds the full `customer` sub-document on each registration; `customerName`/`customerMobile` stay for backward compatibility with existing search/CSV code.

## My Leads grid: every field is a column, by default

The grid went from 6 hardcoded columns to one column per enabled lead field (all ~50, visible by default) plus three system columns that aren't part of the field catalogue (Stage, Booked, Protection Until) and a pinned, non-hideable Registration ID column. Column cells are read via the same `scope`-aware `fieldValue()` helper as the rest of the dynamic-field system, formatted by data type (`LIST` joins with commas, `NUMBER` gets locale formatting, everything else is a plain string, truncated with `text-overflow: ellipsis` and a hover `title` for the full value). The table sits in a `.table-scroll` (`overflow-x: auto`) wrapper since 50+ columns don't fit any viewport.

## Manage Columns: show/hide + drag-reorder

A "Manage Columns" button opens a dropdown panel (`components/ManageColumnsPanel.jsx`) listing every manageable column with a checkbox (show/hide) and a drag handle (native HTML5 drag-and-drop, no library) for reordering - "swapping" per the request. Changes apply live, no separate save step. "Show All" and "Reset to Default" are provided as escape hatches. Column order/visibility is stored in `localStorage` (`utils/columnPrefs.js`), keyed per-partner and per-grid (`columnPrefs:myLeads:<partnerId>`) - a personal display preference, not organisation data, so it isn't sent to the backend or shared across the team. Loading a saved preference reconciles it against the current field list: keys for deleted fields are dropped, keys for newly-added fields are appended, so the preference never goes stale or hides a field the partner has never seen.

Sorting, filtering, and CSV export all read from the same `visibleColumns` array, so whatever the partner currently has shown/hidden/reordered is exactly what gets sorted, exported, and paginated - there's no separate "columns for display" vs "columns for export" list to keep in sync.

## What Didn't Change

Filtering (search box, status tabs, project filter, per-SELECT-field filter dropdowns) and pagination logic are unchanged - they operate on the full registration objects regardless of which columns are currently visible. Sort behavior (section 39) is unchanged; it now simply has more possible `colKey`s to sort by, one per visible column.

---

# 41. Lead History: Who, When, How, and System Actions

A History button on every lead row (Actions column, My Leads grid) opens the full activity trail for that lead - every audit event already logged against its `registrationId` (creation, validation steps, edits, stage changes, booking, ...), not just stage progress. The ask was specifically for four things per entry: who, when, how (platform - Mobile app or Web app), and a system-done label plus description - `AuditEvent` already had actor/timestamp/description; platform was the missing piece.

## Platform, without threading it through 30 call sites

`AuditEvent` gained a `platform` field (Web app / Mobile app / Admin Portal / External / System). Every client we control identifies itself with an `X-Client-Platform` header (`WEB` from `frontend/`, `MOBILE` from `mobile/`, `ADMIN` from `admin/`); a small piece of Express middleware in `server.js` reads that header on every request and resolves it to a human label, then wraps the rest of the request's processing in `AsyncLocalStorage.run()` (`utils/requestContext.js`). `auditService.logEvent()` reads that context to fill in `platform` automatically when the caller doesn't pass one explicitly - which is every existing call site except where `actor === 'SYSTEM'`, where `platform` is hardcoded to `'System'` regardless of which request happened to trigger the system-internal step (duplicate check, ownership transfer, commission eligibility, ...). This was a deliberate choice over editing every one of the ~30 existing `logEvent(...)` calls across 12 controllers to pass `platform` explicitly - AsyncLocalStorage propagates it implicitly through the whole async chain from one middleware, so old and new call sites both get it for free. A request with no `X-Client-Platform` header (raw API caller, true external CRM) resolves to `'External'` rather than being mislabeled as Web or Mobile.

## Who: human names instead of raw IDs

`partnerAuth` middleware's `req.actorLabel` - used by every audit-logging call as the "who" - changed from `partnerId` / `partnerId (username)` to `Name (Owner)` / `Name (username)`, using `Partner.name`/`TeamMember.name` already available in that middleware. This also improves "Added By" on the team roster and any other place `actorLabel` was already surfacing an identifier.

## Where it shows

- **My Leads grid** - a History icon per row opens `components/LeadHistoryModal.jsx`, a centered overlay (`.modal-backdrop`/`.modal-card`, new to the app) listing every event for that lead newest-first: Date & Time, Who, Platform, Description. Actor `'SYSTEM'` always displays as "System".
- **Lead detail (Partner Journey) "Progress History"** and the older unauthenticated **Audit Timeline** (Screen 6) both got the same actor/platform info appended to their existing timestamp line, at no extra cost since they already fetch the same `AuditEvent` records - only the display changed.

## What Didn't Change

The underlying audit event set and `getTimeline`/`getMyRegistrationAudit` endpoints are unchanged - this is additive (`platform` field, better `actor` label) rather than a new logging pipeline. No new event types were introduced; History surfaces exactly what was already being recorded, just with the "how" dimension it was missing.

---

# 42. History Content: Field-Level Change Breakdown, Grouped by Day

Section 41's History modal listed events with a single generic sentence each ("Updated lead details for X"). This section makes the *content* readable at the level of the reference product's Lead Preview → History tab: one line per field that actually changed, grouped under "done by X" at a point in time, grouped again under calendar-day headers ("Today", "Yesterday", ...).

## Backend: recording what changed, not just that something did

`createMyRegistration` and `updateMyRegistration` (`myLeadsController.js`) now build a `changes` array and store it on the `AuditEvent.newValue` (already a `Mixed` field, no schema change):

- **Create** - one entry per non-empty field the partner submitted: `{ fieldKey, label, value }`, attached to the existing `REGISTRATION_RECEIVED` event. Every field is "added" - there's no prior state to compare against.
- **Update** - `updateMyRegistration` now reads each field's *current* value (via a new `getCurrentFieldValue()`, scope-aware the same way the rest of the dynamic-field system is) before overwriting it, compares against the incoming value with `valuesEqual()` (normalizes `undefined`/`null`/`''` together, does an array-aware comparison for `LIST` fields), and only pushes `{ fieldKey, label, from, to }` for fields that actually differ. **If nothing changed, no `LEAD_DETAILS_UPDATED` event is logged at all** - a no-op PATCH (re-saving a form with no edits, or a field re-sent with its existing value) no longer pollutes the history with an empty entry.

A change with no meaningful previous value (`from` empty/undefined) renders as "added"; a change that overwrote a real previous value renders as "updated" - both cases are inferred client-side from whether `from`/`value` is present, no separate flag needed.

## Frontend: day groups, actor clusters, change bullets

`LeadHistoryModal.jsx` was restructured around three ideas, matching the reference screenshot's density:

1. **Day grouping** - events (already newest-first) are grouped by calendar day using a new `dayLabel()` helper (`utils/timezone.js`, alongside a new `formatTime()` for the time-only stamp) that resolves to "Today"/"Yesterday"/a plain date in the *viewer's* timezone, not the server's.
2. **One entry per event, changes as bullets** - each event renders as a timeline dot with a "Done by {actor} · {platform}" header and a timestamp, followed by either its `changes` list (one `<li>` per field: **Label** *added/updated* → **value**) or, for events with no structured changes (system steps like duplicate-check, stage updates, booking), the plain `description` line as before.
3. **Category filter** - All / Status / Assignment / Notes tabs (reusing `.status-tabs` styling) filter the event list before grouping. Status and Assignment are keyed by `eventType`; Notes is content-based - it matches any event whose `changes` array touched the `notes` field specifically, rather than being its own event type.

## What Didn't Change

The History button's entry point (My Leads grid) and the underlying `GET /my/registrations/:id/audit` endpoint are unchanged. `PartnerJourney.jsx`'s "Progress History" and the older Audit Timeline screen still use the plain description-line rendering from section 41 - they weren't upgraded to the day-grouped/bulleted layout, since that level of detail is most useful in the dedicated History view, not as a secondary section on an already-busy detail page.

---

# 43. Integrations Module: Push Leads Out, Receive Leads In

A new Settings sub-module ("push the lead and I can receive lead or lead progress update... send to a client") for connecting a partner's own systems to Leadrat in both directions. **Section 51 extends this to work with any system** (any auth, any payload format, create-then-update, scheduled pulls, an open read/write API); this section describes the original design - outbound webhooks that push lead/progress events out, and an inbound API key for the partner's own CRM/website to push leads in.

## Outbound: customisable webhooks

`IntegrationWebhook` (per partner) defines a push target: name, target URL, HTTP method (POST/PUT/PATCH), **format** (JSON / Form-urlencoded / Custom template), optional custom headers, which events to fire on (`LEAD_CREATED`, `LEAD_UPDATED`, `STAGE_UPDATED`, `BOOKING_COMPLETED`), and an enabled toggle. "Make it customisable like cURL, JSON, Form and other formats" maps onto `webhookService.js`'s three format handlers:

- **JSON** - the full lead payload (`buildLeadPayload()`: registration fields, `customFields`, and a nested `customer` object) as the raw request body.
- **FORM** - the same payload flattened to dotted keys (`customer.name`, `customFields.propertySubType`, ...) and sent `application/x-www-form-urlencoded`.
- **CUSTOM** - the partner supplies their own body template with `{{path.to.value}}` placeholders (e.g. `{"lead_id":"{{registrationId}}","name":"{{customer.name}}"}`) - works like filling in a cURL `--data` body once, and covers any shape (including XML or a provider-specific schema) the format dropdown doesn't explicitly name.

Triggering is fire-and-forget from every caller (`createMyRegistration`, `updateMyRegistration`, `updateMyProgress`, `createMyBooking` in `myLeadsController.js` call `triggerWebhooks(...).catch(() => {})` without awaiting) - a slow or dead external target can never delay or fail the partner's own API response.

## "I should get all updates failed, pass, or where its problem"

Every send attempt writes a `WebhookDelivery` row - request URL/method/headers/body exactly as sent, response status/body, and an error message on failure (including a 10-second request timeout, so a hung target still resolves to a visible failure instead of never completing). The new **Delivery Log** section (Settings → Integrations) lists these with pass/fail badges, filterable by webhook, status, and date range.

## "If by chance it gets failed I can push or fetch based on date range or sync"

Two recovery paths, both in `webhookService.js`:

- **Retry** - re-sends the *exact* stored request (same URL/method/headers/body) for one failed delivery, so a retry reproduces the original attempt rather than re-deriving it from the lead's possibly-since-changed state.
- **Resync** - picks a webhook and an optional date range (`registeredAt` between `from`/`to`, or everything if both are blank) and pushes every matching lead again, tagged with a `SYNC` event type distinct from organic activity. Resync deliberately bypasses the webhook's own `events` filter - an explicit manual resync should go through regardless of which events that webhook normally fires on.

## Inbound: "I can receive lead[s]"

Every partner gets an `apiKey` (generated at registration; self-healing for partners who existed before this feature, the same pattern as `ensureBaseFields`). A new `apiKeyAuth` middleware authenticates via `X-Api-Key` instead of a login session, setting `req.partnerId`/`req.actorLabel` the same way `partnerAuth` does - so `POST /api/channel-partner/integrations/leads` and `POST /api/channel-partner/integrations/leads/:registrationId/progress` reuse `myLeadsController.createMyRegistration`/`updateMyProgress` completely unchanged; those handlers never cared how identity was established, only that `req.partnerId`/`req.actorLabel` are set. The Integrations settings page shows the key (masked, with show/copy/regenerate) alongside ready-to-copy JSON and Form request examples - only to holders of `MANAGE_SETTINGS`, since the key acts as the whole organisation (section 50).

## Where it lives

Settings gained a third tab, **Integrations** (`IntegrationSettings.jsx`), alongside Lead and User - the same "one more category tab" extensibility the Settings hub was built for (section 38). Read access to webhooks and deliveries is open to the whole team, with credential-like header values masked for anyone without `MANAGE_SETTINGS`; viewing the API key, creating/editing/deleting webhooks, regenerating the API key, retrying a delivery, and resyncing all require `MANAGE_SETTINGS` (section 50).

## What Didn't Change

The original unauthenticated `/api/channel-partner/registrations` surface (used by the mobile app and the "Simulate External CRM Registration" demo, spec section 6/19) is untouched - the new API-key-authenticated `/integrations/leads` endpoints are an additional, more secure inbound path, not a replacement.

---

# 44. Delivery Detail View: Why "Pass" Doesn't Always Mean Received

A webhook delivery showing "Pass" in the log only means the target server returned an HTTP 2xx status - that's the entire contract of a webhook. It says nothing about whether the receiving system's own business logic actually stored or processed the payload (wrong field names for its API, an internal validation rule this payload doesn't satisfy, a test/echo endpoint that always returns 200, etc.). The delivery log's summary table (name/status/HTTP code/truncated error) has no room to show enough to tell the difference - and every delivery's exact request and response were already being persisted (`WebhookDelivery.requestUrl/requestMethod/requestHeaders/requestBody/responseBody`), just never surfaced.

Added a **View** button (available to the whole team, not just `MANAGE_SETTINGS`, since inspecting a delivery is read-only) on every Delivery Log row, opening `components/DeliveryDetailModal.jsx`: the exact request that was sent (URL, method, headers, body, pretty-printed if JSON) and the exact response that came back (HTTP status, body). No new backend endpoint was needed - `listDeliveries` already returned these fields on every `WebhookDelivery` document, they just weren't rendered.

## What Didn't Change

Delivery status logic (pass = HTTP 2xx, fail otherwise) is unchanged and correct - it's what every webhook system means by "delivered." This section is purely about making the *evidence* behind that status visible, not changing how status is computed.

---

# 45. Explaining and Discovering Webhook Variables

Prompted by "webhook always needs to accept new value like webhook contain variable then only always I will share to client new new values" - confirming and making visible a property the Custom-format template already had: **the same webhook configuration is reused for every lead; only the values change, filled in fresh at send time from that specific lead's current data.** JSON/Form formats already did this automatically (they always serialize the lead's current state); Custom format does it via `{{placeholder}}` substitution. What was missing was making that concept obvious in the UI, and making the placeholder list something to discover rather than memorize.

## Dynamic placeholder discovery

The Body Template field previously showed a static, hand-written comment listing example placeholders. It's now generated from the partner's *actual* enabled `LeadFieldDefinition` list (the same fetch the Add/Edit Lead form uses), grouped by tab (Lead Info / Enquiry Info / Additional Info / Others / Notes) plus a "Lead" group for the handful of structural fields that aren't part of the field catalogue (`registrationId`, `stage`, `isBooked`). Each field renders as a clickable chip showing its exact `{{path}}` (`customer.email` for a `scope: 'customer'` field, `customFields.propertySubType` for a `scope: 'custom'` one, or just the bare field key for a `scope: 'registration'` one) - clicking inserts it into the template. This means the available-variables list can never drift out of sync with what fields the partner has actually configured, including any custom fields they've added.

## Live preview

A read-only "Preview - what will actually be sent" box under the form renders the CURRENT format/template against a fixed, realistic sample lead (`utils/webhookPreview.js`'s `SAMPLE_LEAD_PAYLOAD`), using the same substitution logic as the backend's `renderTemplate`/`flattenForForm` (duplicated client-side deliberately - this is a client-only preview, not a real send, so it doesn't touch the network). It updates on every keystroke, so a partner can see immediately whether their Custom template is well-formed and which parts are still literal text versus substituted values, before ever saving the webhook or firing a real lead through it.

## What Didn't Change

The actual send-time behavior (`webhookService.js`'s `buildLeadPayload`/`buildRequest`/`renderTemplate`) is unchanged - this section is entirely about the setup UI: showing what variables exist, making them easy to insert, and previewing the result before saving.

---

# 46. Client CRM cURL -> Variable-Mapped Webhook (Leadrat)

Prompted by "this is my client CRM cURL... I have given real data, instead of that I can push my leads by this webhook API by variable mapping." The client's cURL (Leadrat's `connect.leadrat.com/api/v1/integration/Webhook/...` endpoint, `API-Key` header, a flat JSON body of ~60 keys) is set up as a **Custom-format webhook** (section 43): the URL and headers are copied as-is, and every hard-coded value in the body is replaced with a `{{placeholder}}`, so each new lead is pushed with its own data.

## Mapping

| Leadrat key | Variable |
|---|---|
| Name / Email / Mobile / AlternateContactNo | `customer.name` / `customer.email` / `customer.mobile` (E.164, e.g. `+915671162648`) / `customer.alternateMobile` |
| ChannelPartnerName / Mobile / Email | `partner.name` / `partner.mobile` / `partner.email` (new - see below) |
| Location / Project / Notes / BhkType / PropertyType | `preferredLocation` / `projectId` / `notes` / `bhk` / `propertyType` |
| Budget / LeadExpectedBudget | `budgetMax` / `budgetMin` |
| Property / PropertySubType / Subsource / CampaignName / AgencyName | `customFields.propertyNames` / `.propertySubType` / `.subSource` / `.campaignNames` / `.agencyNames` |
| PrimaryUser / SecondaryUser / Designation / Profession | `customFields.primaryOwner` / `.secondaryOwner` / `.designation` / `.profession` |
| Utm* / CallRecordingUrl | `customFields.utmSource` ... `.utmId` / `customFields.callRecordingUrl` |
| ReferenceId / RefrenceNo | `registrationId` - lets the client trace a lead back to this system |
| LeadSource / AccountId | kept literal (`41`, the all-zero GUID) exactly as the client's cURL sends them |

Keys with no matching field (State, City, Country, CountryCode, schedule/booking dates, etc.) stay literal `null`. Fires on `LEAD_CREATED` only - the Leadrat endpoint creates a lead per call, so `LEAD_UPDATED`/`STAGE_UPDATED` would create duplicates on the client side.

## Send-time changes (`webhookService.js`)

- **JSON-safe substitution.** Previously `renderTemplate` inserted raw strings, so a lead whose notes contained a `"` or a line break produced invalid JSON that the receiver would reject. When the request Content-Type is JSON (the default for Custom), values are now JSON-escaped, and a placeholder that is the entire quoted value (`"Email": "{{customer.email}}"`) renders as `null` when the lead has no value - matching the client's own "not provided" convention instead of `""`. Non-JSON custom bodies (XML, form text) keep the old raw substitution. Numbers stay as strings (the placeholder sits inside quotes); lists are comma-joined as before.
- **Partner in the payload.** `buildLeadPayload` now includes `partner: { name, mobile, email, companyName }` (the lead's owning channel partner, loaded in `triggerWebhooks`/`resyncRange`), and `customer` gains `countryCode` (dial code, e.g. `+91`) and `nationalNumber`. Existing JSON/FORM webhooks just get these extra keys.

The frontend preview (`utils/webhookPreview.js`) mirrors the same rules, and the variable picker gains a **Channel Partner** group plus the two new customer phone variables. Covered by `backend/tests/webhookTemplate.test.js`.

---

# 47. Import a Client CRM's cURL and Map Its Keys to CRM Fields

Prompted by "these are all my lead fields which need to be made variables to map with the webhook - give UI to add a cURL-mapped webhook to CRM fields." Section 46 hand-built one Custom template from a client's cURL; this makes that a self-serve flow in Settings → Integrations, for any client CRM.

## Flow

1. **Import from cURL** (button next to "+ Add Webhook", or a link at the top of the webhook form) - paste the example request a client's API docs/Postman gives, real sample data and all.
2. **Parse & Map Fields** - `utils/curlMapping.js`'s `parseCurl` reads the URL, method (`-X`; anything other than POST/PUT/PATCH falls back to POST, the only body-carrying methods the webhook model supports), headers (`-H`/`--header`) and body (`-d`/`--data`/`--data-raw`/`--data-binary`/`--json`), with shell quoting and `\` line continuations handled. Name defaults to the URL's host; format becomes **CUSTOM**.
3. **Field Mapping table** (`components/FieldMappingTable.jsx`) - one row per key in the client's body (nested objects walked to their leaves, shown as dotted paths), each with a dropdown: **Not mapped (send null)**, **Fixed value...** (same value for every lead), or any CRM field grouped exactly as the variable chips are (Lead, Channel Partner, and the partner's own enabled lead-field tabs - so custom fields they've added appear automatically). A "Sample result" column shows what each key would carry for the sample lead.
4. Save as normal. The table is also shown when **editing** any Custom webhook whose template is a JSON object (including the WHK-1 Leadrat webhook from section 46).

## Auto-suggest

`suggestRows` pre-fills every key whose example value is a string or `null`: a synonym table for common CRM names (`Mobile`/`Phone`/`ContactNo` → `customer.mobile`, `Budget` → `budgetMax`, `LeadExpectedBudget` → `budgetMin`, `ChannelPartnerName` → `partner.name`, `ReferenceId`/`RefrenceNo` → `registrationId`, ...), then an exact normalized match on the field key or label (so `UtmSource`, `Designation`, `CallRecordingUrl` etc. match the catalogue directly). Keys whose example is a number/boolean - typically the client's own constants, e.g. Leadrat's `"LeadSource": 41` - and string keys that match nothing stay **Fixed** with the example value, for the partner to review rather than being silently dropped. On the Leadrat cURL, 35 of 46 keys map automatically.

## Design notes

- **The body template stays the single source of truth.** The table parses `form.bodyTemplate` on every render and writes it back (pretty-printed) on every change; it holds no state of its own, so the raw template editor (now a collapsible "Body Template (raw)" section with the variable chips) and the table can never disagree. Non-JSON bodies (XML, form text) skip the table and open the raw editor.
- **Fixed values keep their JSON type** - typing `41` stays a number, `true` a boolean; anything else is a string.
- No backend change: the saved webhook is an ordinary CUSTOM template, sent through section 46's JSON-safe `renderTemplate` (escaping, `null` for empty whole-value placeholders).
- `utils/webhookPreview.js`'s `SAMPLE_LEAD_PAYLOAD` now fills every default lead field (areas, purpose, buyer type, referral, owners, UTM, ...) so the Sample result column and preview show a realistic value for each mapping instead of `null`.

Covered by `frontend/src/utils/curlMapping.test.js` (cURL parsing incl. quoting, auto-suggest on the Leadrat body, template round-trip, nested bodies).

---

# 48. Quick Lead Updates: Assign to Active Users, Status + Sub-Status + Note, Lead Preview

Prompted by "update user assignment on every lead from the list of active users - when I open any lead or lead preview I can update users available in Manage Team, only active users. Same for status: when someone connects with a lead they can quickly update lead status, sub-status and notes."

## Assignment: active users only, owner included

`Registration.assignedTo` (the team member working the lead) and its grid dropdown already existed, but with gaps this section closes:

- **Only ACTIVE users can be assigned** - `assignRegistration` previously accepted any team member, including INACTIVE ones. It now rejects them with "X is inactive - only active users can be assigned leads". Unassigning is always allowed.
- **The account owner is assignable** - the owner isn't a `TeamMember` row, so `assignedTo` could never point at them. It now also accepts the `partnerId` itself (shown as "Name (Owner)").
- **A deactivated assignee stays visible** - a lead assigned to someone later deactivated used to render "Unassigned" (the dropdown only listed active members, so the value had no matching option). `AssignSelect` now keeps the current assignee as a disabled "Name (inactive)" option, while still only *offering* active users.
- `GET /my/assignable-users` (whole team can read) returns the owner + every team member with `status`, the single source both the grid and the quick-update panel use; `listMyRegistrations`/`getMyRegistration` resolve `assignedToName` from the same list (owner included).
- `LEAD_ASSIGNED` audit events now carry a `changes` entry (`Assigned To: from → to`, by name), and `LEAD_ASSIGNED` was added to the History modal's **Assignment** tab - it was missing, so the tab never showed in-team reassignments.

## Status + Sub-Status + Note

- `config/leadStatuses.js` - the stage → sub-status catalogue (e.g. Contacted → Follow Up / Callback Requested / Not Answered / Busy / Not Reachable / Need More Info / Plan Postponed / Not Interested; Site Visit → Scheduled / Rescheduled / Done / Cancelled). Stages remain the fixed `currentStage` enum that duplicate protection, booking and commission key off; sub-statuses are descriptive only, so the list can grow freely. Served by `GET /my/lead-statuses`.
- `Registration.subStatus` (new, default `''`).
- `POST /my/registrations/:id/progress` now accepts `{ stage, subStatus, notes }`:
  - `subStatus` must belong to `stage` (400 otherwise); omitted on a stage change, it's cleared (it belonged to the old stage). Unknown stages now get a 400 instead of a Mongoose 500.
  - `notes` replaces the lead's Notes field with the latest note; the previous note is preserved in History as the `from` of the change.
  - One `STAGE_UPDATED` audit event with a `changes` array (Status / Sub-Status / Notes), so History shows each as a bullet and the Notes tab picks up quick-update notes. A note-only update logs `LEAD_DETAILS_UPDATED` ("Added a note") and fires `LEAD_UPDATED` webhooks instead of `STAGE_UPDATED`. A request that changes nothing logs nothing.
  - Backward compatible: callers sending only `{ stage }` (mobile app, inbound API) behave as before.
- Webhook payload gains `subStatus`.

## Where it shows

- **`components/LeadQuickUpdate.jsx`** - shared panel: Assigned To (saves on change), Status, Sub-Status (options follow the chosen status), Note, **Update Status**. Read-only with a hint for roles without `MANAGE_LEADS`; booked leads show the assignment but no status form.
- **Lead Preview** (`components/LeadPreviewDrawer.jsx`) - new preview icon on every My Leads row opens a right-side drawer: status badge, assignee, click-to-call mobile, email, project, source, location, latest note, the quick-update panel, and Full Details / Edit Lead / History buttons. Saving updates the grid row in place (no reload).
- **Lead detail page** (`PartnerJourney.jsx`) - the old stage dropdown + "Add Progress" is replaced by the same Quick Update card; the summary shows Lead Status (with sub-status) and Assigned To.
- **My Leads grid** - Status column shows the sub-status under the stage; the Assign To column uses `AssignSelect`.

## What Didn't Change

Stage values, booking (`Complete Booking`), ownership/protection, and the admin-level partner reassignment (section 29) are untouched. Assignment is still within one partner's own team only.


---

# 49. Custom Statuses, Status-Form Fields, Schedulers & Notifications

Prompted by "under Lead I want to create status and sub-status and schedulers and notification and notification content... when updating a lead status, show any active lead fields, mandatory or not." Settings → Lead now has three sub-tabs (`LeadSettingsTabs.jsx`): **Fields** (section 36), **Statuses & Sub-Statuses**, **Notifications & Schedulers**.

Decisions confirmed with the user: statuses are **fully custom**; timing offers immediately / 15 min / 30 min / 1 h / 1 day / 1 week / 1 month / 1 year before, at, or after the scheduled time, plus fully custom; recipients are **any combination** of assigned user, account owner, person who updated it, roles, and specific users; channels are **in-app first**, with Email and Webhook also available.

## Statuses (`LeadStatus` model, `leadStatusService.js`)

- Per-partner documents: name, colour, order, active, sub-statuses (each with id, name, active), and two flags that replace the old hardcoded stage names - **`isDefault`** (the status new leads start in, was `'Registered'`) and **`isBooking`** (the status Complete Booking sets, was `'Booking'`; never offered in the status picker). Exactly one default and at most one booking status per partner (setting the flag clears it elsewhere); the default can't be deactivated or deleted.
- **Seeded once** from `config/leadStatuses.js` (the old six stages + sub-statuses). Unlike lead fields' additive `ensureBaseFields`, a default the partner deletes stays deleted.
- `Registration.currentStage` lost its Mongoose enum and stores the status **name** (as does `subStatus`), so existing leads, History, webhooks and reports keep working unchanged. **Renaming a status or sub-status cascades** to every lead using it. Deleting a status that leads are in is refused with the count ("move them, or deactivate it instead"). Deactivated statuses/sub-statuses stop being offered but stay valid on leads already in them.
- Lead creation (`createMyRegistration`, the public `createRegistration`) uses the default status; bookings (`createMyBooking`, `bookingController`) use the booking status and clear sub-status/schedule. The public `/registrations/:id/progress` validates the stage against the partner's catalogue; new public `GET /registrations/:id/statuses` lets the mobile app follow the partner's own order for "advance to next status" (previously a hardcoded list).

## Status form: scheduler + lead fields

Each status **and** each sub-status can:
- **Ask for a date & time** (`requiresSchedule` + `scheduleLabel`, e.g. "Call back at", "Visit at"), stored on the new `Registration.scheduledAt` and cleared when the lead moves to a status that doesn't ask for one.
- **Show chosen lead fields**, each optional or **mandatory** (`fields: [{ fieldKey, isRequired }]`), picked from every *enabled* lead field (`StatusFieldsPicker.jsx`, grouped by tab, searchable).

The effective form is status + sub-status merged (a field is mandatory if either level says so): `resolveStatus()` on the server, mirrored by `resolveStatusForm()` in `LeadQuickUpdate.jsx`. `POST /my/registrations/:id/progress` now also accepts `scheduledAt` and `fields`. It rejects a missing schedule or an empty mandatory field (a mandatory field already filled on the lead counts as filled), writes field values with the same scope-aware logic and per-field diff as Edit Lead, and records Status / Sub-Status / schedule / field / note changes in one History entry (schedule values are ISO timestamps, rendered in the viewer's timezone by `LeadHistoryModal`). The Notes field is fed from the form's own Note box.

The date & time input is interpreted in the user's **profile timezone** (`toZonedInputValue` / `fromZonedInputValue` in `utils/timezone.js`, tested), not the browser's. Otherwise a time typed on a machine in IST by a user whose profile is UTC showed back shifted by 5:30 everywhere else in the app.

## Notifications (`NotificationRule`, `NotificationJob`, `Notification`, `notificationService.js`)

- **Rule**: trigger (status, optional sub-status; blank = any), timing (`IMMEDIATE` / `BEFORE` / `AT` / `AFTER` + amount + unit MINUTES to YEARS), recipients (`assignedUser`, `owner`, `updatedBy`, `roleIds[]`, `userIds[]`, any combination; the owner counts as holding the Super Admin role), channels (`inApp`, `email`, `webhook` + URL/headers), content (`title`, `message` templates).
- **Planning** (`planForStatusChange`, called after every status/schedule change, lead creation and booking): cancels the lead's still-PENDING jobs (they belonged to the old status/time) and creates a `NotificationJob` per matching rule with its `fireAt`. Schedule-based rules on a lead with no schedule aren't planned; a before/at reminder whose scheduled time has already passed is recorded as SKIPPED rather than fired late. The job snapshots who made the change, so "person who updated it" means the person at trigger time.
- **Scheduler**: `startScheduler()` (from `server.js`) runs every 30 s. Jobs are claimed atomically (`PENDING` to `PROCESSING`) so overlapping runs can't double-send; jobs left PROCESSING for over 5 minutes (a crashed run) are re-queued. Up to 10 jobs are delivered in parallel so one organisation's slow webhook can't hold up everyone else's reminders (section 50). Jobs due immediately are processed right away instead of waiting for a tick.
- **Delivery**: recipients are resolved at fire time (current assignee), and **inactive users never receive anything**. In-app creates a `Notification` per recipient. Email uses `nodemailer` to each recipient's address, only when `SMTP_*` is set in `backend/.env` (otherwise logged as SKIPPED with the reason). Webhook sends one JSON POST per job (`event: LEAD_NOTIFICATION`, title, message, recipients with name/email/mobile, full lead payload) for a WhatsApp/SMS provider to fan out. Every channel/recipient outcome is stored on the job.
- **Content variables**: everything a webhook template can use (`{{customer.name}}`, `{{budgetMax}}`, `{{customFields.x}}`, ...) plus `{{status}}`, `{{subStatus}}`, `{{schedule.at}}` (in the recipient's timezone), `{{assignedTo.name}}`, `{{updatedBy.name}}`, `{{recipient.name}}`. The editor has insert-variable chips and a live preview.
- **Settings UI** (`NotificationSettings.jsx`): rule list with enable toggle, Edit, **Test** (renders against a real lead and sends to your own bell only), Delete (cancels its pending jobs), and a **Scheduled & Sent** log of jobs with per-channel results. It warns when a before/at/after rule targets a status that never asks for a date & time.
- **Bell** (`NotificationBell.jsx` in the top bar): unread count, latest 50, click to mark read and open the lead, Mark all read; polls every 30 s.

## API

```http
GET    /my/lead-statuses                       whole team
POST   /my/lead-statuses                       MANAGE_SETTINGS
PATCH  /my/lead-statuses/:statusId             MANAGE_SETTINGS (rename cascades to leads)
DELETE /my/lead-statuses/:statusId             MANAGE_SETTINGS (refused while leads use it)
GET    /my/notification-rules                  whole team (webhook header values masked without MANAGE_SETTINGS)
POST   /my/notification-rules                  MANAGE_SETTINGS
PATCH  /my/notification-rules/:ruleId          MANAGE_SETTINGS
DELETE /my/notification-rules/:ruleId          MANAGE_SETTINGS
POST   /my/notification-rules/:ruleId/test     whole team (sends to self, in-app)
GET    /my/notification-jobs                   whole team
GET    /my/notifications                       own inbox + unreadCount
POST   /my/notifications/:id|all/read          own inbox
GET    /registrations/:id/statuses             public (mobile app)
```

## Limits

- Removing a sub-status that leads are still in is refused (move them first), the same as deleting a status. Renaming a status or sub-status also renames it in notification-rule triggers; deleting a status that a rule triggers on is refused (section 50).
- The unauthenticated `/registrations/:id/progress` (mobile, demo) validates the status name but doesn't enforce schedule/mandatory fields; those apply to the authenticated status form.
- Reminders fire within about 30 s of their time (scheduler interval).

Covered by `backend/tests/notificationRules.test.js` (fire-time maths incl. months/years; recipient combinations; inactive exclusion) and `frontend/src/utils/timezone.test.js`.

---

# 50. Security Hardening: Closing the Loopholes Found in Review

A full review of backend, web, admin and mobile code found ways to bypass permissions, take over another partner's protected customers, double-book leads, and make the server call internal addresses. This section records what was fixed and the rules the code now enforces. Everything below is server-side; the UI only mirrors it.

## Accounts, sessions and roles

- **JWT secret is mandatory** (`src/config/jwtSecret.js`): the server refuses to start if `JWT_SECRET` is missing, a known default, or under 32 characters. The old `'change-this-in-production'` fallback let anyone forge admin or partner tokens on a misconfigured deployment.
- **No privilege escalation through Manage Team** (`teamController.js`): a manager can only create, edit, reset the password of, deactivate or remove members whose role has no permissions the manager lacks, and can only assign such roles. Changing an existing member's role needs `MANAGE_ROLES` (as section 34 always said). Nobody can change their own role or status, or remove themselves. Previously an Admin (Leads + Team) could make themselves Super Admin.
- **No self-granting through Manage Roles** (`roleService.js`): you can't edit the role you hold, edit or delete a role with permissions you lack, or grant permissions you don't have.
- **Passwords**: one rule (8+ characters) everywhere a password is set. Changing your own password requires the current password. Every password change (yours, or a reset by a manager) sets `passwordChangedAt`, and `partnerAuth` rejects tokens issued before it - the response carries a fresh token so the current session continues.
- **Login**: failed attempts are rate-limited per IP (20) and per username (8) per 15 minutes (`middleware/rateLimit.js`, in-memory). The password is checked before account status, so "deactivated" no longer reveals which usernames exist. Self-signup also checks team-member usernames, so a stranger can't take an existing member's username and lock them out.
- **Admins**: `adminAuth` re-reads the admin on every request, so deactivation takes effect immediately. Creating partners, editing field definitions and changing business-rule settings now need `SUPER_ADMIN`.

## Duplicate protection and ownership

- **Atomic protection** (`RegistrationClaim`, `duplicateService.claimProtection`): the duplicate check was check-then-insert, so two simultaneous registrations of the same customer + project could both be accepted. A unique claim per customer + project is now taken before the registration is saved; only one request wins.
- **Better matching**: emails match on a normalized key (trimmed, lowercased, `+tag` removed, Gmail dots ignored), and a customer's alternate number is matched against both primary and alternate numbers.
- **Edits can't steal customers** (`services/leadEditGuards.js`): contact details on a customer that another partner also has a lead for are locked (they live on the shared Customer record, so editing them rewrote the other partner's lead). Changing a lead's mobile/email to another protected customer, or moving a lead into a project where someone else holds protection, is refused. Disabled fields can't be written through the API.
- **Field values are validated** (`utils/fieldValues.js`): type (number, date, list, ...), SELECT options, and size limits. Nested objects are refused.
- **Admin overrides stay consistent**: releasing protection also releases the claim; reassigning a lead checks the new partner exists and is active, and moves working ownership, commission attribution and the claim with it.
- **Settings are validated**: protection days must be 1-3650 and match fields a non-empty subset of mobile/email (an empty list used to switch protection off).

## Booking and commission

- **One booking per lead** (`services/bookingService.js`, shared by both booking routes): an atomic `isBooked` gate plus unique indexes on `Booking.registrationId` and `CommissionEligibility.registrationId`. Rejected leads can't be booked, and neither can a lead whose protection expired after another partner registered the same customer.
- **After booking** the partner can't change the lead's status, contact details or project (the builder is the operational owner, section 13).
- **Idempotency claims the key first** (`idempotencyService.js`): two copies of the same event arriving together no longer both run. Keys are scoped per partner, so one partner can't pre-submit another's predictable reference ID.
- Leads with no project can now be booked (`projectId` was wrongly required on Booking/Commission).

## Integrations and notifications

- **SSRF guard** (`utils/outboundUrl.js`): webhook and notification-rule URLs must be http(s) and resolve only to public addresses (no localhost, private ranges, link-local/cloud metadata). Checked when saved and again before every send; redirects are not followed. `ALLOW_PRIVATE_WEBHOOK_TARGETS=true` relaxes this for local development only.
- **Secrets**: viewing the inbound API key needs `MANAGE_SETTINGS` (it acts as the whole organisation and bypasses per-member permissions). Credential-like header values (`Authorization`, `*key*`, `*token*`, ...) are masked in webhook/rule lists for anyone without `MANAGE_SETTINGS`, and are stored redacted in the delivery log (a retry fills them back in from the live webhook). Login responses no longer include the API key, and the web app caches only display fields in `localStorage` (not bank/KYC details).
- **Header validation**: names must be valid, values single-line (no header injection), at most 30.
- **Template escaping**: CUSTOM bodies with a form-urlencoded or XML content type now URL-encode / XML-escape values, so lead text can't inject extra fields.
- **Bounded work**: webhook responses are read up to 2 KB; resync is capped at 500 leads per run, 5 at a time, one run per webhook; notification rules capped at 50 per partner; SMTP has 10 s timeouts.
- **Housekeeping**: compound index for the scheduler's polling query; TTL clean-up of webhook deliveries (90 days), processed notification jobs (90 days) and bell notifications (180 days).

## Request handling

- **Operator stripping** (`middleware/stripOperators.js`): keys starting with `$` (and `__proto__`/`constructor`/`prototype`) are removed from every body, query and params, so `{"email":{"$regex":"^a"}}` or `?status[$ne]=x` can't become a Mongo operator.
- Admin list filters escape regex input (no ReDoS) and coerce values to strings.
- Unexpected (500) errors return a generic message instead of raw Mongo/stack text; `apiKeyAuth` errors are passed to the error handler; unhandled promise rejections are logged instead of crashing the process.
- `CORS_ORIGINS` (comma-separated) restricts browser origins; `TRUST_PROXY` makes rate limiting see real client IPs behind a proxy. Request bodies are capped at 1 MB (raised from 200 KB in section 51 so receive sources can accept batches).
- CSV exports in the web and admin apps neutralise values starting with `= + - @` (formula injection).

## New settings in `backend/.env`

```text
JWT_SECRET=                         required, 32+ random characters
CORS_ORIGINS=                       optional allowlist for browsers
TRUST_PROXY=                        optional, set behind a reverse proxy
ALLOW_PRIVATE_WEBHOOK_TARGETS=false local development only
```

## Still open

- The original `/api/channel-partner/registrations*` and `/duplicate-check` routes (sections 6 and 17) are still unauthenticated by design - the mobile app, the simulated-CRM demo and the builder pages (which have no login) use them. Anyone can read customer details by registration ID, register as any partner, change stages and book leads through them. The rules above now apply there too (no double booking, no booking a superseded lead, inactive partners refused, no setting the booking status as a plain stage), but the routes themselves still need a credential.
- Customer contact details are still stored once per phone number and shared across partners: a partner who registers an existing number sees the name/email the first partner saved.
- The mobile app talks to a plain `http://` LAN address set in `mobile/app.json`.
- A partner can re-register their own customer the moment protection expires (no cooldown).

Covered by `backend/tests/securityGuards.test.js` (email normalization, SSRF address checks, operator stripping, field validation, template escaping, header masking/redaction, regex escaping, password rules and token revocation).

---

# 51. Universal Integrations: Any System, Both Directions

Prompted by "set up my integration for universal type - last implementation not working for all types of integration. I can consume any integration API to receive and push data. My API also anyone can use, 2-way communication." Section 43 assumed one shape for everything: push = one POST/PUT/PATCH URL with static headers; receive = the sender must use Leadrat's own JSON field names and an `X-Api-Key` header; nothing could be fetched, and other systems couldn't read anything back. Those assumptions are why many integrations failed - most of all **authentication** (APIs needing OAuth2, Basic auth, a key in the URL, or signed requests). Settings → Integrations now has four tabs (`components/IntegrationTabs.jsx`): **Push**, **Receive**, **Pull** and **Your API**.

## Authentication for any API (`services/httpAuthService.js`, `components/AuthEditor.jsx`)

One auth block, used by push webhooks and pull sources (and, HMAC only, to verify what receive sources are sent):

```text
NONE | API_KEY (header or query string) | BEARER | BASIC
OAUTH2  client credentials: token URL, client ID/secret, scope, audience; credentials in body or Basic header.
        Token cached until it expires; a 401 fetches a fresh token and retries once.
HMAC    signs the request body (sha1/sha256/sha512, hex/base64, optional "sha256=" prefix) into a chosen header.
```

Auth is applied **after** the request is logged, so tokens, keys and signatures never appear in the delivery log, and retries re-apply it fresh. Secrets are never returned by the API, not even to `MANAGE_SETTINGS` holders - lists show `••••abcd`, and sending that mask back on save means "keep the stored secret". The OAuth2 token URL goes through the same SSRF guard as every other outbound call (section 50).

## Push: create once, then update the same record (`webhookService.js`, `IntegrationWebhook`)

- **Methods**: POST, PUT, PATCH, GET, DELETE (GET sends no body).
- **URL variables**: `{{placeholders}}` work in the URL too, URL-encoded (e.g. `.../leads/{{external.id}}`).
- **Create + update mode** (`mode: CREATE_UPDATE`): the first push of a lead uses the create request; Leadrat reads the target's new record ID from the response (`responseIdPath`, e.g. `data.id`) and stores it in `IntegrationLink`. Every later event for that lead uses the **update** request (`updateUrl`, `updateMethod`, optional `updateBodyTemplate`) with `{{external.id}}` available - so updates change the same record on the other side instead of creating duplicates (the reason section 46's webhook had to be limited to `LEAD_CREATED`). In the default `SAME` mode the ID is still recorded when `responseIdPath` is set.
- **Automatic retries**: timeouts, network errors, HTTP 429 and 5xx are retried after 1 min, 5 min, 30 min, 2 h, 6 h (`maxRetries` 0-5, default 3). A scheduler (`startRetryScheduler`, every 30 s) claims due deliveries atomically. The delivery log shows the operation (create/update) and the next retry time.
- **Test** button per webhook: pushes the newest lead now and shows the HTTP result and the record ID read back.

## Receive: any sender, any format (`IntegrationSource` kind `RECEIVE`, `integrationSourceController.js`)

- Each source has its own URL, `POST /api/channel-partner/hooks/<sourceKey>`. The 40-hex-character key in the URL is the credential, so senders that can't set headers (form tools, many SaaS webhooks) work. The URL is shown only to `MANAGE_SETTINGS` holders, and **New URL** replaces it.
- Accepts JSON, form-encoded (nested `a[b][c]=` keys) and JSON sent as `text/plain`, a single record or a batch (up to 200 per request).
- **Sample first**: until a mapping is saved, a request is only captured as a sample (HTTP 202). The form then previews the sample, lists every field path in it, auto-maps obvious matches (name/full_name → Name, phone/phone_number → Primary Number, email, message → Notes, ...) and shows what each record would become.
- **Optional security**: HMAC signature check on the raw body (e.g. Meta's `X-Hub-Signature-256: sha256=...`), and `GET` answers `hub.challenge` when `hub.verify_token` matches (Facebook/Meta subscription handshake).
- Rate limit: 300 requests per minute per source.

## Pull: fetch from any API on a schedule (`IntegrationSource` kind `PULL`, `pullService.js`)

- GET or POST, any headers, any auth, JSON response. URL/body variables: `{{since}}` (start of the last successful run, ISO; empty the first time), `{{sinceEpoch}}`, `{{page}}`, `{{offset}}`, `{{limit}}`, `{{cursor}}`.
- Paging: none, page number, offset, cursor read from each response (`cursorPath`), or a full next-page URL read from each response (`nextUrlPath`); `maxPages` per run (≤ 50).
- Runs every 5 minutes to 24 hours (`startPullScheduler`, checked every minute; a lease on `nextRunAt` stops two backend instances running the same source). **Fetch sample & preview** calls the API once and imports nothing; **Run now** imports immediately. The list shows the last run's counts or error.

## One mapping engine for Receive and Pull (`leadImportService.js`)

- `recordsPath` - where the list of records is (`data`, `items`, `entry.0.changes`); blank = the body itself.
- `mapping` - one row per Leadrat field: **their field** (a path like `field_data.phone_number`, dots or `[0]` for arrays) or a **fixed value**. Status and Sub-Status can be mapped too, with `statusMap` translating their values (`qualified` → `Site Visit`, case-insensitive).
- `externalIdPath` - their record ID. Seen before (via `IntegrationLink`) → the lead is **updated** (fields through the Edit Lead handler, status through the status handler); new → **created**. Their ID also becomes the idempotency key, so the same record arriving twice at once still creates one lead.
- `defaultCountry` - country for phone numbers sent without a code (e.g. `IN` makes `9876543210` valid).
- Dropdown values are matched to the field's options ignoring case and spacing (`social_media` → `Social Media`); a value with no matching option is left empty with a warning, rather than failing the whole lead.
- Imported leads only need the core fields (name, mobile): the partner's own form-only required fields are skipped (`req.integrationImport`), since a sender can't fill them in.
- Every record goes through the same handlers the web app uses (`utils/invokeHandler.js` calls `createMyRegistration` / `updateMyRegistration` / `updateMyProgress` in-process), so duplicate protection (section 50), audit history, push webhooks and notifications all apply.
- Every record is logged in `InboundEvent` (CREATED / UPDATED / UNCHANGED / DUPLICATE / REJECTED / FAILED, with the reason; kept 90 days) and shown as **Received Records** on the Receive and Pull tabs.

## Your API: two-way access for any system (`openApiController.js`, `apiKeyAuth.js`)

The API key now works as `X-Api-Key`, `Authorization: Bearer <key>`, or `?api_key=<key>` for tools that can't set headers. Requests made with it act as the account owner, since only `MANAGE_SETTINGS` holders can see the key (section 50). Limit: 600 requests per minute.

```http
POST   /api/channel-partner/integrations/leads                          create (externalReferenceId = your ID, never duplicates)
GET    /api/channel-partner/integrations/leads?updatedSince=&stage=&externalReferenceId=&page=&limit=
                                                                         list, oldest change first - for incremental sync
GET    /api/channel-partner/integrations/leads/:registrationId          one lead
PATCH  /api/channel-partner/integrations/leads/:registrationId          update fields
POST   /api/channel-partner/integrations/leads/:registrationId/progress status / sub-status / schedule / note
POST   /api/channel-partner/integrations/leads/:registrationId/booking  complete booking
GET    /api/channel-partner/integrations/lead-statuses                  the partner's pipeline
GET    /api/channel-partner/integrations/lead-fields                    fields, types, options, where each goes in a request
GET    /api/channel-partner/integrations/subscriptions                  REST-hook subscriptions (Zapier/Make style)
POST   /api/channel-partner/integrations/subscriptions                  {"targetUrl", "events"} - stored as a push webhook (createdVia: API)
DELETE /api/channel-partner/integrations/subscriptions/:subscriptionId
GET    /api/channel-partner/integrations/openapi.json                   public OpenAPI 3 document for Postman, Zapier, Make, n8n
```

The **Your API** tab shows the key, the base URL, every endpoint and copy-paste examples built from the partner's own required fields.

## Settings API (logged-in partner)

```http
POST   /my/integrations/webhooks/:webhookId/test            MANAGE_SETTINGS
GET    /my/integrations/sources                             whole team (URL, verify token and header values only with MANAGE_SETTINGS)
POST   /my/integrations/sources                             MANAGE_SETTINGS   { kind: RECEIVE | PULL, ... }
PATCH  /my/integrations/sources/:sourceId                   MANAGE_SETTINGS
DELETE /my/integrations/sources/:sourceId                   MANAGE_SETTINGS   (imported leads stay; their links are removed)
POST   /my/integrations/sources/:sourceId/regenerate-key    MANAGE_SETTINGS   (receive only)
POST   /my/integrations/sources/:sourceId/test              MANAGE_SETTINGS   { draft?, sample? } -> { sample, records, preview, paths }
POST   /my/integrations/sources/:sourceId/run               MANAGE_SETTINGS   (pull only)
GET    /my/integrations/inbound-events?sourceId=&outcome=   whole team
```

## Limits

- Pull and push accept JSON responses only; XML APIs can be pushed to (custom XML bodies are escaped, section 50) but not pulled from.
- OAuth2 supports the client-credentials grant only (machine-to-machine); flows that need a person to sign in (authorization code) are not supported.
- Pull reads up to 5 MB per page; push reads up to 64 KB of a create response to find the record ID.
- For local development against a receiver on your own machine, set `ALLOW_PRIVATE_WEBHOOK_TARGETS=true` (section 50); webhooks, pulls and OAuth2 token URLs otherwise must be public addresses.

Covered by `backend/tests/universalIntegrations.test.js` (path reading, auth application and secret masking, HMAC sign/verify, record mapping incl. dropdown matching and status maps, URL templates).
