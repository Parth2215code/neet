# 📸 Neet Photography · Full-Stack Live Shoot Schedule & Database

A production-grade, dynamic photography scheduling web application with a **live persistent database** (SQLite) and **role-based permissions**, designed to run responsively on both **mobile phones** and **PCs**.

---

## ⚡ What Makes This a Proper Full-Stack Web App

1. **Persistent Real-Time Database**:
   - Backed by an automated SQLite database (`neet_schedule.db`) with zero external DB maintenance.
   - Any shoot date signed, updated, or released by Neet is instantly saved to the database.
   - Includes real-time database version polling (`/api/version`): When Neet edits a date on his phone, anyone viewing on PC or another phone automatically sees the update without refreshing!

2. **Strict Role-Based Security (Neet vs Public)**:
   - **Public / Client View (Read-Only)**: Clients can browse open vs booked dates, filter shoot categories, copy availability, and click any open date to initiate a direct WhatsApp inquiry. Private client numbers and notes are automatically sanitized and hidden.
   - **Photographer Admin (Neet Only)**: Unlocked with a private PIN (Default: `1234`). Neet can sign dates, enter client names, shoot venues, call times, client phone numbers, package notes, or release dates.

3. **Dynamic Responsive Design (Mobile & PC)**:
   - **Mobile Experience**:
     - Ergonomic **Mobile Bottom Navigation Bar** (Calendar, Agenda, WhatsApp, PDF, Login).
     - Horizontally swipeable shoot category tabs.
     - Touch-friendly day cells (>38px) with visual status indicators.
     - 1-tap WhatsApp booking button pre-filled with the exact selected date.
   - **PC / Desktop Experience**:
     - Widescreen 4-month interactive calendar grid.
     - Real-time statistics banner (Available Slots, Booked Shoots, Next Confirmed Shoot).
     - High-resolution PDF generation with branded printable layout.
     - Formatted WhatsApp schedule clipboard copying.
     - Agenda / List View toggle.

---

## 🚀 Running the App Locally

### Step 1: Start the Server
Open PowerShell in `d:\Projects\neet` and run:
```powershell
node server.js
```
*Or using npm:*
```powershell
npm.cmd start
```

### Step 2: Open in Your Browser
Visit:
```
http://localhost:3000
```

---

## 🌐 How to Deploy Live on the Web (With Database)

To make this live on the internet so Neet can use it from his phone and share it with clients anywhere in the world, use any of these free Node.js hosting providers:

### Option 1: Render.com (Recommended & Free)
1. Push your project to a [GitHub](https://github.com) repository.
2. Sign up for free at **[render.com](https://render.com)**.
3. Click **"New"** → **"Web Service"**.
4. Connect your GitHub repository.
5. Settings will be auto-detected:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. Click **"Deploy Web Service"**.
7. In ~60 seconds, your site will be live at a public URL like `https://neet-photography.onrender.com`.

### Option 2: Railway.app (Instant 1-Click Deployment)
1. Go to **[railway.app](https://railway.app)**.
2. Click **"New Project"** → **"Deploy from GitHub repo"**.
3. Railway will build and deploy `server.js` automatically.

---

## 🔒 Security & Admin Details

- **Default Secret PIN**: `1234`
- **Change PIN**: Log in as Photographer → click **"Settings"** (gear icon) → enter your new PIN and click **"Save Changes"**.
- **Backup & Restore**: Download a complete JSON database backup anytime from the Settings menu.

---

## 📁 Project Architecture

```
d:\Projects\neet\
  ├── db.js                 # SQLite database engine, queries, seeds & auth
  ├── server.js             # Express REST API, session tokens & real-time poller
  ├── neet_schedule.db      # Persistent SQLite database file
  ├── package.json          # Server dependencies & start scripts
  ├── Procfile              # Cloud deployment descriptor (Render / Railway)
  └── public\
      ├── index.html        # Dynamic frontend layout (Mobile & PC)
      ├── style.css         # Responsive mobile-first & widescreen styles
      └── app.js            # Real-time API client, calendar engine & PDF export
```
