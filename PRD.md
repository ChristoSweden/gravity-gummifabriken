# Gravity @ Gummifabriken — Product Requirements Document

## Overview

Gravity is a proximity-based professional networking app for coworking spaces. It matches people by shared professional interests and enables them to connect and message each other when they are physically nearby at the Gummifabriken building in Värnamo.

## Core Concept

**"Proximity creates Opportunity."**

When professionals share a physical space, Gravity surfaces the people around them with overlapping interests — enabling serendipitous, high-value connections that wouldn't happen otherwise.

---

## User Flow — Sign-In & Onboarding

The onboarding is a 4-step flow (3 steps for already-authenticated users) with a consistent header (back arrow + "Gravity." branding), step counter ("STEP X OF Y"), and segmented progress bar. All UI uses pure inline styles with the copper color palette to ensure consistent rendering.

### Step 0: Splash / Landing Screen

- Gravity branding with copper ball visual
- Tagline: "Proximity creates Opportunity."
- Three CTAs:
  - **"Create Your Account"** → begins the onboarding flow (Step 1)
  - **"Log In"** → existing users go directly to email/password login
  - **"Skip to Demo"** → bypasses all onboarding, enters demo mode directly on the Radar screen

### Step 1: Proximity & Notifications (first screen after splash)

- Description: Default GPS and notifications are automatically activated when in proximity of the building.
- **Proximity settings:**
  - **GPS Location** — toggle switch, default ON. Detect proximity to Gummifabriken.
  - **Notifications** — toggle switch, default ON. Get notified on connection requests.
  - Each toggle in its own bordered card with label and description.
  - **Privacy note** — "Your exact location is never shared — only proximity."
- Sticky bottom button: **"Continue"**

### Step 2: Interests

- Title: "Interests"
- **Custom interest input** — text field with "Add" button, supports Enter key
- **Suggestions grid** — pre-populated professional interest tags as selectable pills.
- **Selected interests panel** — shows removable chips with `×` button
  - Counter: "Selected (X/10)" with "Y more needed" if < 3
- Minimum 3 selections required to proceed
- Sticky bottom button: **"Continue"**

### Step 3: Profile Info

- **Profile section:**
  - **Full Name** (text input, required) — how they appear on the radar
  - **Profession** (text input, required) — e.g. "Software Engineer", "UX Designer"
  - **Company** (text input, optional)
- **Intent section:**
  - **Intent text area** — free-form text, optional
- Sticky bottom button: **"Continue to Radar"** (if authenticated) or **"Continue"** (if unauthenticated, proceeds to Step 4)

### Step 4: Account Creation (Sign Up) — only for unauthenticated users

- Title: "Create your account"
- Subtitle: "We'll send a verification link to your email."
- Fields: **Email**, **Password** (min 6 chars)
- **"Skip Login"** button — allows bypassing authentication for demo purposes.
- Submit button: **"Create Account"**
- On submit:
  1. Create Supabase auth user
  2. Store meta-data and upsert profile to `profiles` table.
- On email link click → redirect to **Radar screen**.

- Title: "Create your account"
- Subtitle: "We'll send a verification link to your email."
- Fields:
  - **Email** (required)
  - **Password** (required, min 6 characters)
- Submit button: **"Create Account"**
- On submit:
  1. Create Supabase auth user with email + password
  2. Store `full_name`, `profession`, `company` in user_metadata
  3. Upsert profile to `profiles` table with all collected data:
     - `id`, `full_name`, `profession`, `company`, `interests[]`, `intent`, `gps_enabled`, `notifications_enabled`
  4. Show success confirmation with green checkmark
  5. Supabase sends verification email with magic link
- On email link click → user is authenticated and redirected to the **Radar screen**
- **"Skip — try Demo Mode instead"** link available

### Post-auth: Radar Screen

- User lands here after email verification or demo mode entry
- Shows matching profiles of other people nearby with overlapping interests
- Each match card displays:
  - Avatar (initial in circle)
  - Professional name
  - Profession / Role
  - Number of shared interests
  - Interest tags (shared ones highlighted)
  - Action button: Connect / Pending / Respond / Message
- User's own interests shown as badges at the top

---

## Database Schema — `profiles` Table

| Column                 | Type       | Description                                    |
| ---------------------- | ---------- | ---------------------------------------------- |
| `id`                   | UUID (PK)  | Foreign key to `auth.users`                    |
| `full_name`            | text       | Professional display name                      |
| `profession`           | text       | Role / job title                               |
| `company`              | text       | Company or organization (optional)             |
| `interests`            | text[]     | Array of selected interest strings             |
| `intent`               | text       | Free-form connection intent (optional)         |
| `gps_enabled`          | boolean    | Whether GPS proximity detection is active      |
| `notifications_enabled`| boolean    | Whether push notifications are active          |
| `is_incognito`         | boolean    | Incognito mode — hidden from radar             |
| `visibility_setting`   | text       | 'All of Gummifabriken' / 'Workspace only' / 'Off' |
| `profile_blur`         | boolean    | Blur profile for unconnected users             |
| `updated_at`           | timestamp  | Last profile update                            |

## Database Schema — `connections` Table

| Column          | Type       | Description                         |
| --------------- | ---------- | ----------------------------------- |
| `id`            | UUID (PK)  | Primary key                         |
| `requester_id`  | UUID (FK)  | User who initiated the request      |
| `recipient_id`  | UUID (FK)  | User who received the request       |
| `status`        | text       | 'pending' / 'accepted' / 'rejected' |
| `created_at`    | timestamp  | When the connection was requested   |

## Database Schema — `messages` Table

| Column          | Type       | Description                    |
| --------------- | ---------- | ------------------------------ |
| `id`            | UUID (PK)  | Message ID                     |
| `sender_id`     | UUID (FK)  | User who sent the message      |
| `recipient_id`  | UUID (FK)  | User who received the message  |
| `content`       | text       | Message text                   |
| `created_at`    | timestamp  | When the message was sent      |

---

## App Routes

| Route          | Screen               | Auth Required | Description                              |
| -------------- | -------------------- | ------------- | ---------------------------------------- |
| `/`            | Landing / Splash     | No            | Branding + Get Started / Log In / Demo   |
| `/onboarding`  | Multi-step onboarding| No            | Steps 2-4: Interests → Profile → Signup  |
| `/login`       | Login                | No            | Email/password for returning users       |
| `/radar`       | Radar                | Yes           | Interest-matched nearby profiles         |
| `/connections` | Connections          | Yes           | Pending requests + accepted connections  |
| `/chat/:userId`| Chat                 | Yes           | 1-on-1 messaging                         |
| `/profile`     | Profile Settings     | Yes           | Edit profile, privacy, GDPR controls     |

---

## Demo Mode

- Accessible via "Skip to Demo" on landing page and signup screen
- Uses mock data (5 sample users with varied interests)
- Full app functionality without real account
- Session-scoped (cleared on logout or tab close)
- If user fills in interests/profile before entering demo, those are preserved in the demo session

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 6, TailwindCSS 4, React Router 7
- **Backend:** Supabase (Auth, Database, Realtime)
- **Animation:** Motion (Framer Motion)
- **Icons:** Lucide React
- **Analytics:** Vercel Analytics
- **Design:** Copper/warm color palette (#B87333 primary, #D4AF37 accent), Playfair Display + Inter fonts

---

## Privacy & GDPR

- Profile visibility controls (All / Workspace only / Off)
- Incognito mode
- Profile blur for unconnected users
- Export personal data as JSON
- Right to erasure (account deletion)
- GPS and notification permissions are user-controlled with clear defaults
