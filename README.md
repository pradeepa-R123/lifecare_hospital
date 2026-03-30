

Full-stack hospital management system with an integrated AI chatbot assistant.

---

## 🚀 Quick Start

### 1. Clone / Extract the project
```bash
cd lifecare-hospital
```

### 2. Set up environment variables
```bash
cp .env.example .env
```
Edit `.env` and fill in:
- `MONGO_URI` — your MongoDB Atlas connection string
- `GROQ_API_KEY` — from https://console.groq.com (free)
- `JWT_SECRET` — any long random string
- `DOCTOR_PIN`, `STAFF_PIN`, `BLOODBANK_PIN` — 4-digit PINs for the chatbot

### 3. Install all dependencies
```bash
npm run install:all
```

### 4. Build the frontend
```bash
npm run build
```

### 5. Seed the database (first time only)
Set `RUN_SEED=true` in `.env`, start the server once, then set it back to `false`.

### 6. Start the server
```bash
npm start
# or for development with auto-reload:
npm run dev
```

Visit: **http://localhost:5001**

---

## 🛠️ Development Mode (hot reload)

Run backend and frontend simultaneously:

**Terminal 1 — Backend:**
```bash
npm run dev
```

**Terminal 2 — Frontend (with Vite HMR):**
```bash
cd frontend
npm run dev
```
Frontend dev server: http://localhost:5100 (proxies API to :5001)

---

## 📁 Project Structure

```
lifecare-hospital/
├── server.js                  ← Main Express + WebSocket server
├── package.json
├── .env.example
├── public/                    ← Built frontend (served statically)
│   ├── index.html
│   └── chatbot-widget.js      ← AI chatbot widget
├── backend/
│   ├── config/seed.js         ← Database seeder
│   ├── middleware/auth.js      ← JWT middleware
│   ├── models/                ← Mongoose models
│   │   ├── User.js
│   │   ├── Patient.js
│   │   ├── BloodRequest.js
│   │   ├── Bloodbank.js
│   │   ├── Hospital.js
│   │   └── Surgery.js
│   └── routes/                ← Express routes
│       ├── auth.js
│       ├── users.js
│       ├── patients.js
│       ├── bloodRequests.js
│       ├── bloodbanks.js
│       ├── surgeries.js
│       ├── departments.js
│       └── hospital.js
└── frontend/                  ← React + Vite source
    ├── index.html             ← Includes chatbot widget script tag
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── index.css
        ├── components/UI.jsx
        ├── context/
        │   ├── AuthContext.jsx
        │   └── useWebSocket.js
        └── pages/
            ├── HomePage.jsx           ← Public landing page + chatbot banner
            ├── LoginPage.jsx
            ├── ReceptionistDashboard.jsx
            ├── DoctorDashboard.jsx
            └── StaffDashboard.jsx
```

---

## 🤖 AI Chatbot Integration

The chatbot (`public/chatbot-widget.js`) is injected into every page via `frontend/index.html`:

```html
<script>window.LIFECARE_SERVER = '';</script>
<script src="/chatbot-widget.js"></script>
```

Setting `LIFECARE_SERVER = ''` makes the widget call the **same origin** as the frontend (since backend and frontend are served from the same Express server in production).

### Chatbot Features
- Role-based access: Patient / Doctor / Staff / Blood Bank
- PIN authentication for staff roles
- AI responses powered by **Groq (LLaMA 3.3 70B)**
- Live database context (patients, blood requests, staff)
- Appointment booking form
- Blood request form
- Follow-up question chips

### Chatbot PIN Codes
Set these in `.env`:
```
DOCTOR_PIN=1234
STAFF_PIN=5678
BLOODBANK_PIN=9012
```

### Chatbot API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Chatbot PIN authentication |
| POST | `/api/chat` | Groq AI chat with DB context |
| GET | `/api/patients-chatbot` | Patient data for chatbot |
| GET | `/api/bloodstocks` | Blood bank stock |
| GET | `/api/bloodrequests` | Blood requests |
| GET | `/api/staffs` | Staff list |
| POST | `/api/appointment` | Book appointment |
| POST | `/api/bloodrequest` | Submit blood request |

---

## 👤 Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Doctor (Cardiology) | ravi@lifecare.com | Doctor@123 |
| Doctor (Neurology) | ramesh@lifecare.com | Doctor@123 |
| Doctor (Orthopedics) | meena@lifecare.com | Doctor@123 |
| Doctor (Emergency) | suresh@lifecare.com | Doctor@123 |
| Doctor (General Physician) | priya@lifecare.com | Doctor@123 |
| Receptionist | maran@lifecare.com | Staff@123 |
| Staff | nursepriya@lifecare.com | Staff@123 |

---

## 🔌 WebSocket (Real-time)

Blood request updates are broadcast in real-time via WebSocket. The `useWebSocket` hook in `frontend/src/context/useWebSocket.js` connects to `ws://<same-host>` automatically.

---

## 🩸 Blood Bank Integration

The hospital backend can connect to a separate Blood Bank service at `BLOOD_BANK_URL` (default: `http://localhost:5002`). If unavailable, the system gracefully falls back to stored stock data.

---

## ⚙️ Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5001) |
| `MONGO_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `GROQ_API_KEY` | ✅ | Groq API key for AI chat |
| `DOCTOR_PIN` | ✅ | 4-digit PIN for doctor chatbot access |
| `STAFF_PIN` | ✅ | 4-digit PIN for staff chatbot access |
| `BLOODBANK_PIN` | ✅ | 4-digit PIN for blood bank chatbot access |
| `BLOOD_BANK_URL` | No | Separate blood bank service URL |
| `RUN_SEED` | No | Set `true` to seed DB on startup |
