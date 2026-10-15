# 🏏 Cricket Auction System

A **lightweight, easy-to-use, real-time** cricket player auction system.  
Perfect for local tournaments, college leagues, corporate events, and franchise auctions.

---

## Features

- ✅ Authentication (Admin + Team Managers)
- ✅ Team management with purse tracking + **logo URL**
- ✅ Player management + **photo URL** (CSV + form)
- ✅ **Hybrid CSV Import** from Google Form
- ✅ Approve / Reject / Bulk Approve / Select all
- ✅ **Live Auction** with real-time bidding (Socket.IO)
- ✅ Configurable bid ladder, max bid / last-slot all-in
- ✅ Recall unsold, undo last sell, restart / fresh auction
- ✅ Reports + **Export CSV** + **Print / PDF**
- ✅ **Dark Mode**
- ✅ **Public Live Viewer** at `/live`
- ✅ **Public Results** at `/results`
- ✅ Auction history on dashboard

---

## Default Login

| Role  | Email               | Password  |
|-------|---------------------|-----------|
| Admin | admin@auction.com   | admin123  |

---

## Quick Start

### Backend
```bash
cd backend
npm install
npm run dev
```
→ http://localhost:5000

### Frontend
```bash
cd frontend
npm install
npm run dev
```
→ http://localhost:3000

### Public pages (no login)
- **Live:** `/live`
- **Results:** `/results`

---

## CSV columns

**Players:** name, mobile, role, city, age, bio, base_price, **photo_url**  
**Teams:** name, purse, max_players, **logo_url**, manager_name, manager_email, manager_password

Photo/logo values must be **public image URLs** (Drive share links that allow view, Cloudinary, ImgBB, etc.).

---

## Deploy notes

### Render keep-alive (free tier)
Set on the backend service:

```
KEEP_ALIVE_URL=https://your-backend.onrender.com
```

Optional: `KEEP_ALIVE_MS=600000` (default 10 min).

Open the app or `/api/health` before a live auction so the first bid is not delayed. The dashboard also pings health on load.

---

## Tech Stack

| Layer       | Technology                  |
|-------------|-----------------------------|
| Frontend    | React + TypeScript + Vite + Tailwind |
| Real-time   | Socket.IO                   |
| Backend     | Node.js + Express           |
| Database    | JSON file (lightweight) |
| Auth        | JWT                         |

**Enjoy your auction!** 🏏
