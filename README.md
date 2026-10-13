# Cricket Auction System

A **lightweight, easy-to-use, real-time** cricket player auction system.  
Perfect for local tournaments, college leagues, corporate events, and franchise auctions.

---

## Features (Complete)

-  Authentication (Admin + Team Managers)
-  Team management with purse tracking
-  Player management (add, search, filter)
-  **Hybrid CSV Import** from Google Form
-  Approve / Reject / Bulk Approve players
-  **Live Auction Room** with real-time bidding (Socket.IO)
-  Countdown timer + bid increment
-  Automatic purse deduction on sell
-  Sold / Unsold handling
-  Live sold list + remaining purse
-  **Reports** (Summary, Sold list, Team Squads, Unsold)
-  Export to CSV
-  Mobile-friendly clean UI

---

## Default Login

| Role  | Email               | Password  |
|-------|---------------------|-----------|
| Admin | admin@auction.com   | admin123  |

---

## Project Structure

```
cricket-auction/
├── backend/
│   ├── src/
│   │   ├── data/store.js       # Simple JSON file database
│   │   ├── middleware/auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── teams.js
│   │   │   ├── players.js
│   │   │   └── auctions.js
│   │   └── server.js
│   ├── .env
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── context/AuthContext.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Teams.tsx
│   │   │   ├── Players.tsx
│   │   │   ├── Auction.tsx
│   │   │   └── Reports.tsx
│   │   ├── services/api.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
└── README.md
```

---

## Quick Start (Local Development)

### 1. Backend
```bash
cd backend
npm install
npm run dev
```
→ http://localhost:5000

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
→ http://localhost:3000

Open http://localhost:3000 and login with the admin credentials above.

---

## How to Use (End-to-End Flow)

1. **Login** as Admin
2. **Create Teams** (Teams page) → set purse amount  
   (Optionally create Team Manager accounts at the same time)
3. **Import Players**
   - Create a Google Form (Name, Mobile, Role, City, Age, Bio…)
   - Players fill the form
   - Download CSV → go to Players page → **Import CSV**
4. **Approve** players (Pending → Approved)
5. Go to **Live Auction**
   - Create Auction → Start
   - Select an Approved player
   - Teams place bids
   - Timer runs, highest bid wins
   - Click **Sell** or wait for timer
6. View **Reports** anytime (Summary, Squads, Export CSV)

---

## Deployment Guide (Free & Easy)

### Option A: Recommended (Vercel + Railway)

**Frontend (Vercel)**
1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Root Directory: `frontend`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Add Environment Variable (optional): none needed if using proxy

**Backend (Railway)**
1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Root Directory: `backend`
3. Add environment variables:
   ```
   PORT=5000
   JWT_SECRET=your_long_random_secret_here
   ```
4. Railway will give you a public URL (e.g. `https://your-app.up.railway.app`)

**Connect Frontend to Backend**
- In frontend, update the Socket.IO connection and API base if needed
- Or set up a simple proxy / use full backend URL in production

### Option B: Render.com
- Backend: Web Service → Node
- Frontend: Static Site

### Option C: Single VPS (DigitalOcean / AWS Lightsail)
```bash
# Install Node, PM2, Nginx
pm2 start backend/src/server.js --name auction-api
# Serve frontend build with Nginx
```

---

## Tech Stack

| Layer       | Technology                  |
|-------------|-----------------------------|
| Frontend    | React + TypeScript + Vite + Tailwind |
| Real-time   | Socket.IO                   |
| Backend     | Node.js + Express           |
| Database    | Simple JSON file (lightweight) |
| Auth        | JWT                         |

No heavy database required for MVP. Data is stored in `backend/src/data/db.json`.

---

## Google Form → CSV Tips

Recommended form fields:
- Full Name *
- Mobile Number *
- Role (Batsman / Bowler / All-rounder / Wicket-keeper)
- City
- Age
- Bio / Experience
- Base Price (optional)

The importer automatically maps common column names.

---

## Security Notes for Production

1. Change `JWT_SECRET` in `.env`
2. Change default admin password after first login
3. Restrict CORS origin in `server.js`
4. Consider moving from JSON file to PostgreSQL/SQLite for larger events

---

## Future Improvements (Optional)

- Photo upload for players
- Multiple concurrent auctions
- Viewer-only public link
- Push notifications
- Dark mode
- PostgreSQL migration

---

**Built as a complete, lightweight, ready-to-use system.**

Enjoy your auction!
