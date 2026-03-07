# Gravity @ Gummifabriken — Product Requirements Document

## Overview

Gravity is a proximity-based professional networking app for coworking spaces. It matches people by shared professional interests and enables them to connect and message each other when they are physically nearby at the Gummifabriken building in Värnamo.

## Core Concept

**"Proximity creates Opportunity."**

When professionals share a physical space, Gravity surfaces the people around them with overlapping interests — enabling serendipitous, high-value connections that wouldn't happen otherwise.

---

## Branding & Design System

- **App name:** Gravity.  (with trailing period)
- **Tagline:** "Proximity creates Opportunity."
- **Logo:** Copper ball ("Gravity" embossed), displayed on landing, radar, and navbar
- **Color palette:** Copper (#B87333 primary), gold accent (#D4AF37), warm sand backgrounds (#FAF7F2), deep charcoal text (#1A1714)
- **Typography:** Playfair Display (serif, headings + brand) + Inter (sans, body)
- **Tone:** Premium, minimal, warm — not social-media, more like a private members club

---

## User Flow — Sign-In & Onboarding

The onboarding is a 4-step flow (3 steps for already-authenticated users) with a consistent header (back arrow + "Gravity." branding), step counter ("STEP X OF Y"), and segmented progress bar.

### Step 0: Splash / Landing Screen

- Gravity logo (copper ball) with subtle radar-pulse ring animation
- Tagline: "Proximity creates Opportunity." (italic, copper)
- Three CTAs:
  - **"Create Your Account"** → begins the onboarding flow (Step 1)
  - **"Log In"** → existing users go directly to email/password login
  - **"Skip to Demo"** → bypasses all onboarding, enters demo mode directly on the Radar screen

### Step 1: Proximity & Notifications

- Title: "Proximity"
- Description: Enable location detection for Gummifabriken
- **Proximity settings:**
  - **GPS Location** — toggle switch, default ON. Detect proximity to Gummifabriken.
  - **Notifications** — toggle switch, default ON. Get notified on connection requests.
  - Each toggle in its own bordered card with label and description.
  - **Privacy note** — "Your exact location is never shared — only proximity."
- Sticky bottom button: **"Continue"**

### Step 2: Interests

- Title: "Interests"
- Subtitle: "Select 3–10 topics that define your work"
- **Custom interest input** — text field with "Add" button (+ icon), supports Enter key
- **Suggestions grid** — pre-populated professional interest tags as selectable pills (selected = copper filled)
- **Selected interests panel** — shows removable chips with `×` button
  - Counter: "Selected (X/10)" with "Y more needed" if < 3
- Minimum 3 selections required to proceed
- Sticky bottom button: **"Continue"** (disabled until 3+ selected)

### Step 3: Profile Info

- Title: "Profile"
- Subtitle: "How you appear on the radar"
- **Full Name** (text input, required)
- **Profession** (text input, required) — e.g. "Software Engineer", "UX Designer"
- **Company** (text input, optional)
- **Intent** (textarea, optional) — free-form text: what they're looking for
- Sticky bottom button: **"Continue to Radar"** (if authenticated) or **"Continue"** (proceeds to Step 4)

### Step 4: Account Creation — only for unauthenticated users

- Title: "Create your account"
- Subtitle: "We'll send a verification link to your email."
- Fields: **Email**, **Password** (min 6 chars)
- **"Skip — try Demo Mode instead"** link — allows bypassing authentication
- Submit button: **"Create Account"**
- On submit:
  1. Create Supabase auth user
  2. Store `full_name`, `profession`, `company` in user_metadata
  3. Upsert profile to `profiles` table with all collected data
  4. Show success confirmation: "Check your inbox" with send icon
- On email link click → user is authenticated and redirected to the **Radar screen**

---

## Radar Screen (`/radar`)

The main screen. Shows matching profiles of nearby people with overlapping interests.

### Header
- Left: "Radar" title (Playfair Display, 3xl) + subtitle "{RADAR_RADIUS} radius · {LOCATION_NAME}"
- Right: **`● Active`** status badge (green, animated pulse) — always visible when the user is on the radar

### Radar Visual
- Full circular radar with concentric rings, crosshair lines, and a rotating sweep animation (conic gradient)
- **Center:** Gravity logo pip (copper ball, 40px, glowing shadow)
- **Avatar pips:** Up to 6 matches plotted as circular avatar buttons at fixed polar coordinates
  - Unrevealed (not connected): blurred silhouette placeholder
  - Revealed (accepted connection): real avatar photo or initial letter
  - Border colour: white (none) → amber (pending) → green (accepted)
  - Distance label below pip in meters (e.g. `45m`)
  - Hover tooltip: profession (unrevealed) or first name (revealed)
  - Click: opens the connection modal
- **Radar pulse ring** animation on outermost circle

### Pending Request Banner
- When incoming connection requests exist: amber banner below header linking to `/connections`
- "N connection request(s) waiting" with animated pulse dot and chevron

### Nearby Professionals List
- Section header: "Nearby Professionals" + "{N} matches found"
- Each card (blurred for unconnected):
  - **Unrevealed:** blurred silhouette avatar + profession title + shared interest tags + distance (right) + chevron button
  - **Revealed (accepted):** real avatar + full name + profession + distance + chat button (→ `/chat/:userId`)
  - **Pending sent:** "Sent" amber badge
  - **Pending received:** "Respond" red pulsing badge
- Cards animate in with staggered fade-up
- Empty state: magnifying glass icon + "No matches yet" message

### Connection Request Modal
- Triggered by tapping a pip or list card
- Bottom sheet on mobile, centered modal on desktop (spring animation)
- **Blurred identity** until accepted: silhouette avatar + "Identity revealed on connect" label
- Shows: profession, distance, shared interest pills
- **Message textarea:** "Introduce yourself..." placeholder
- CTA: **"Request Connection"** (primary button, full width)
- Cancel text button

### Incoming Request — Premium Request Modal
- When an incoming (received) pending connection request exists, it surfaces as a **full-screen premium modal** (z-200) on the radar — not buried in the Connections tab
- Blurred backdrop (`backdrop-blur-xl`)
- Centered card with:
  - Copper-tinted header section: blurred avatar with gold star badge, "Premium Request" title, "New Connection Detected" subtitle
  - Requester's profession + shared interest tags
  - Icebreaker message (if they included one when requesting) — shown in an italic frosted card
  - **Accept Connection** (primary CTA, full width, shadow-premium)
  - **Ignore for now** (text link)
- Works in both demo mode and live mode
- On accept/decline: modal closes, radar re-fetches

### Connection Request Sent Modal *(replaces toast)*
- Shown immediately after sending a request — overlays everything (z-110)
- Green checkmark circle + "Connection Request Sent" title + "We'll notify you once they accept." subtitle
- Manual **"Close"** button (no auto-dismiss)

### Error Toast
- Shown for failures (duplicate connection etc.) at top of screen (z-110)
- Red pill with error message, auto-fades

---

## Connections Screen (`/connections`)

### Pending Requests section
- Shown only when requests exist
- Amber pulse dot + "Pending Requests (N)" label
- Each card: accent-coloured initial avatar + name + profession + **Accept** / **Decline** buttons

### Your Network section
- "Your Network (N)" label
- Each card: copper initial avatar + name + interests preview → taps to open chat (`/chat/:userId`)
- Chat icon on right

### Empty state
- "No connections yet" with users icon + link to Radar

---

## Chat Screen (`/chat/:userId`)

### Header
- Back arrow → `/connections`
- Recipient avatar + name + profession (truncated)

### Message area
- **iMessage-style bubbles:**
  - Sent (mine): copper background, right-aligned
  - Received: white with sand border, left-aligned
  - Avatar shown left of first message in a received run
  - Bubble corner radii collapse for consecutive messages from same sender
- **Date separators** between message groups (e.g. "TODAY", "YESTERDAY", "Monday, 3 Mar")
- **Timestamps** shown below last message in a run (right for sent, left for received)

### Input bar
- Rounded white input with sand border, copper focus ring
- Auto-expanding textarea (max 120px)
- Send button (copper circle, arrow icon) — disabled + faded when empty
- Enter to send, Shift+Enter for new line

### Unauthorized state
- If no accepted connection: lock icon + "Not Connected" + "Back to Radar" button

---

## Profile Screen (`/profile`)

- Header: "Profile" title + "Identity, privacy & settings" subtitle

### Sections
- **Identity:** Full Name, Profession, Company, Interests (comma-separated), Intent
- **Proximity:** GPS Location toggle, Notifications toggle (both with descriptions)
- **Privacy:** Incognito Mode toggle (hide from radar), Profile Blur toggle (blur details for unconnected users)
- **Save Changes** button (primary, full width)

### Data & Privacy
- **Export Data** — downloads JSON of profile + connections + messages
- **Delete Account** — destructive, with confirmation dialog

### Sign Out
- Text button at bottom

---

## Navigation (Navbar)

- **Top bar** (sticky, glass effect) visible on all authenticated screens except onboarding/login
- Left: Logo + "Gravity." brand link → `/radar`
- Right links: **Radar** | **Network** (with pending badge if requests exist) | **Profile** (icon)
- Badge: red dot with count on Network link when pending connection requests exist

---

## Database Schema

### `profiles`

| Column                  | Type       | Description                                         |
| ----------------------- | ---------- | --------------------------------------------------- |
| `id`                    | UUID (PK)  | Foreign key to `auth.users`                         |
| `full_name`             | text       | Professional display name                           |
| `profession`            | text       | Role / job title                                    |
| `company`               | text       | Company or organization (optional)                  |
| `interests`             | text[]     | Array of selected interest strings                  |
| `intent`                | text       | Free-form connection intent (optional)              |
| `gps_enabled`           | boolean    | Whether GPS proximity detection is active           |
| `notifications_enabled` | boolean    | Whether push notifications are active               |
| `is_incognito`          | boolean    | Incognito mode — hidden from radar                  |
| `visibility_setting`    | text       | 'All of Gummifabriken' / 'Workspace only' / 'Off'   |
| `profile_blur`          | boolean    | Blur avatar/name for users not yet connected        |
| `avatar_url`            | text       | Profile photo URL (optional)                        |
| `updated_at`            | timestamp  | Last profile update                                 |

### `connections`

| Column          | Type       | Description                         |
| --------------- | ---------- | ----------------------------------- |
| `id`            | UUID (PK)  | Primary key                         |
| `requester_id`  | UUID (FK)  | User who initiated the request      |
| `recipient_id`  | UUID (FK)  | User who received the request       |
| `status`        | text       | 'pending' / 'accepted' / 'rejected' |
| `created_at`    | timestamp  | When the connection was requested   |

### `messages`

| Column          | Type       | Description                    |
| --------------- | ---------- | ------------------------------ |
| `id`            | UUID (PK)  | Message ID                     |
| `sender_id`     | UUID (FK)  | User who sent the message      |
| `recipient_id`  | UUID (FK)  | User who received the message  |
| `content`       | text       | Message text                   |
| `created_at`    | timestamp  | When the message was sent      |

---

## App Routes

| Route           | Screen               | Auth Required | Description                              |
| --------------- | -------------------- | ------------- | ---------------------------------------- |
| `/`             | Landing / Splash     | No            | Branding + Get Started / Log In / Demo   |
| `/onboarding`   | Multi-step onboarding| No            | Steps 1-4: Proximity → Interests → Profile → Signup |
| `/login`        | Login                | No            | Email/password for returning users       |
| `/radar`        | Radar                | Yes           | Interest-matched nearby profiles + radar visual |
| `/connections`  | Connections          | Yes           | Pending requests + accepted connections  |
| `/chat/:userId` | Chat                 | Yes           | 1-on-1 messaging (accepted connections only) |
| `/profile`      | Profile Settings     | Yes           | Edit profile, privacy, GDPR controls     |

---

## Demo Mode

- Accessible via "Skip to Demo" on landing page and signup screen
- Uses 5 mock users (Dr. Evelyn Reed, Marcus Chen, Anya Petrova, Julian Wright, Lars Svensson) with varied interests
- Seeded with 1 incoming pending request on entry (from Dr. Evelyn Reed)
- Full app functionality: view radar, send/accept connections, chat
- Session-scoped (cleared on logout or tab close)
- If user fills in interests/profile before entering demo, those are preserved in the demo session
- Demo user ID: `me-demo`, email: `demo@gravity.app`

---

## Privacy & GDPR

- **Profile blur:** Avatars and names are hidden (blurred silhouette) for unconnected users — revealed only on accepted connection
- **Incognito mode:** User is completely hidden from all radar views
- **Visibility settings:** All of Gummifabriken / Workspace only / Off
- **GDPR data export:** Downloads JSON of profile, connections, and messages
- **Right to erasure:** Account deletion removes profile from `profiles` table and signs out
- **Location privacy:** Only proximity is used — exact GPS coordinates are never stored or shared
- GPS and notification permissions are user-controlled with clear defaults (both ON)

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 6, TailwindCSS 4, React Router 7
- **Backend:** Supabase (Auth, PostgreSQL, Realtime subscriptions)
- **Animation:** Motion (Framer Motion v11)
- **Icons:** Lucide React + inline SVG
- **Analytics:** Vercel Analytics (`track()` for key events)
- **Design tokens:** CSS custom properties (`--color-*`, `--radius-*`) + Tailwind `@theme`

---

## Configuration (`APP_CONFIG`)

| Key                 | Default            | Env var                  |
| ------------------- | ------------------ | ------------------------ |
| `APP_NAME`          | `Gravity`          | `VITE_APP_NAME`          |
| `LOCATION_NAME`     | `Gummifabriken`    | `VITE_LOCATION_NAME`     |
| `RADAR_RADIUS`      | `150m`             | `VITE_RADAR_RADIUS`      |

Allows easy white-labelling for other coworking venues.

---

## Known Gaps / Future Work

- **Profile photo upload:** `avatar_url` is in the schema but upload UI is not yet built
- **Messages inbox route:** No `/messages` route exists; messaging is accessed via `/connections` → tap connection → chat. A standalone messages list view would improve discoverability.
- **Interests editing on Profile page:** Currently uses a comma-separated textarea. Should be upgraded to the same pill-selector UI used in onboarding.
- **Real proximity detection:** GPS geofencing logic is not yet implemented — the radar currently shows all users in the database rather than only those physically present at Gummifabriken.
- **Push notifications:** Schema and toggle exist; actual push delivery is not yet wired up.
- **Bottom tab navigation:** Screenshots show a mobile-optimised bottom tab bar (Home / Network / Messages / Profile). Current implementation uses a top navbar. Bottom nav is the preferred direction for mobile-first.
