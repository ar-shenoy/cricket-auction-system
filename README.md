# 🏏 Cricket Auction System

A **lightweight, easy-to-use, real-time** cricket player auction system.  
Perfect for local tournaments, college leagues, corporate events, and franchise auctions.

---

## Features

- ✅ Authentication (Admin + Team Managers)
- ✅ Team management with purse tracking
- ✅ Player management (add, search, filter)
- ✅ **Hybrid CSV Import** from Google Form
- ✅ Approve / Reject / Bulk Approve players
- ✅ **Live Auction Room** with real-time bidding (Socket.IO)
- ✅ Countdown timer + bid increment
- ✅ Automatic purse deduction on sell
- ✅ Sold / Unsold handling
- ✅ Live sold list + remaining purse
- ✅ **Reports** (Summary, Sold list, Team Squads, Unsold)
- ✅ Export to CSV
- ✅ Mobile-friendly clean UI
- ✅ **Dark Mode** (toggle + system preference + localStorage)
- ✅ **Public Live Viewer** at `/live` (no login required)

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

### Public Viewer (no login)
Open: **http://localhost:3000/live**

---

## How to Use

1. Login as Admin
2. Create Teams (+ optional managers)
3. Import players via Google Form CSV or add manually
4. Approve players
5. Start Live Auction → select players → teams bid → sell
6. Share `/live` link for audience / big screen
7. View Reports & export CSV

---

## Tech Stack

| Layer       | Technology                  |
|-------------|-----------------------------|
| Frontend    | React + TypeScript + Vite + Tailwind |
| Real-time   | Socket.IO                   |
| Backend     | Node.js + Express           |
| Database    | Simple JSON file (lightweight) |
| Auth        | JWT                         |

---

**Enjoy your auction!** 🏏
