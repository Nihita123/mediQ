# MediQ — AI Healthcare Intake & Triage System

MediQ is a production-quality AI-powered healthcare intake and triage platform that helps patients describe their symptoms and receive preliminary assessments before connecting with medical professionals.

---

## Project Structure

```
mediq/
├── client/          # React + Vite frontend
├── server/          # Node.js + Express backend
├── docs/            # Documentation
└── README.md
```

---

## Tech Stack

### Frontend
- React 18
- Vite
- Tailwind CSS
- shadcn/ui
- React Router v6
- Axios

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT Authentication
- bcrypt

---

## Quick Start

### Prerequisites
- Node.js >= 18
- MongoDB (local or Atlas)
- npm

### Installation

```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### Environment Setup

```bash
# Server — copy and fill in values
cp server/.env.example server/.env

# Client — copy and fill in values
cp client/.env.example client/.env
```

### Running in Development

```bash
# Terminal 1 — Start the backend
cd server && npm run dev

# Terminal 2 — Start the frontend
cd client && npm run dev
```

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register a new user |
| POST | /api/auth/login | Login and receive JWT |
| POST | /api/session/create | Start a new triage session |
| GET | /api/session/history | Get session history for user |
| GET | /api/session/:id | Get a specific session |
| POST | /api/report/create | Generate a report |
| GET | /api/report/:id | Get a specific report |

See `docs/API.md` for full documentation.

---

## License

MIT
