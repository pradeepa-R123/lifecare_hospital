const express    = require('express');
const mongoose   = require('mongoose');
const dotenv     = require('dotenv');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { WebSocketServer } = require('ws');

dotenv.config();

// Groq is optional — only init if key is present
let groq = null;
if (process.env.GROQ_API_KEY && 
    process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
  const Groq = require('groq-sdk');
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log('✅ Groq AI enabled');
} else {
  console.log('⚠️  GROQ_API_KEY not set — chatbot will use static responses');
}

const app    = express();
const server = http.createServer(app);

// ── WebSocket ─────────────────────────────────────────────────
const wss = new WebSocketServer({ server });
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}
wss.on('connection', ws => ws.send(JSON.stringify({ type: 'CONNECTED' })));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MongoDB ───────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected to', process.env.DB_NAME || 'lifecare_hos');
    if (process.env.RUN_SEED === 'true') {
      const seed = require('./backend/config/seed');
      await seed();
    }
  })
  .catch(err => console.log('❌ MongoDB Error:', err));

// ── Helper: read any collection ───────────────────────────────
const DB = () => process.env.DB_NAME || 'lifecare_hos';

async function getCollection(collectionName, limit = 20) {
  try {
    const db   = mongoose.connection.client.db(DB());
    const data = await db.collection(collectionName)
                         .find({})
                         .limit(limit)
                         .toArray();
    console.log(`📦 Fetched ${data.length} from ${DB()}.${collectionName}`);
    return data;
  } catch (err) {
    console.error(`Error fetching ${DB()}.${collectionName}:`, err.message);
    return [];
  }
}

// ── Chatbot PIN Login ─────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { role, pin } = req.body;
  if (role === 'patient') return res.json({ success: true, role });
  const pinMap = {
    doctor:    process.env.DOCTOR_PIN    || '1234',
    staff:     process.env.STAFF_PIN     || '5678',
    bloodbank: process.env.BLOODBANK_PIN || '9012',
  };
  if (!pinMap[role]) return res.status(400).json({ error: 'Invalid role' });
  if (pin !== pinMap[role]) return res.status(401).json({ success: false });
  res.json({ success: true, role });
});

// ── Chatbot Data Endpoints ────────────────────────────────────
app.get('/api/patients-chatbot', async (req, res) => {
  try { res.json(await getCollection('patients')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bloodstocks', async (req, res) => {
  try { res.json(await getCollection('bloodbanks')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bloodrequests', async (req, res) => {
  try { res.json(await getCollection('bloodrequests')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/staffs', async (req, res) => {
  try { res.json(await getCollection('users')); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/appointment', async (req, res) => {
  try {
    const db = mongoose.connection.client.db(DB());
    await db.collection('appointments').insertOne({ 
      ...req.body, 
      createdAt: new Date() 
    });
    res.json({ success: true, ...req.body });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/bloodrequest', async (req, res) => {
  try {
    const db = mongoose.connection.client.db(DB());
    await db.collection('bloodrequests').insertOne({
      ...req.body, 
      status: 'Pending', 
      requestDate: new Date(), 
      createdAt: new Date(),
    });
    res.json({ success: true, ...req.body });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// ── AI Chat Route ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { question, role, roleName } = req.body;
  let { dbContext } = req.body;

  // Auto-fetch relevant data
  if (!dbContext || dbContext === '' || dbContext === '[]') {
    const q = (question || '').toLowerCase();
    let data = [];
    if (q.includes('patient')) {
      data = await getCollection('patients');
    } else if (
      q.includes('blood request') || 
      q.includes('pending blood') || 
      q.includes('urgent blood') || 
      q.includes('fulfilled')
    ) {
      data = await getCollection('bloodrequests');
    } else if (
      q.includes('blood') || 
      q.includes('stock') || 
      q.includes('units') || 
      q.includes('blood group') || 
      q.includes('blood bank')
    ) {
      data = await getCollection('bloodbanks');
    } else if (q.includes('staff') || q.includes('doctor')) {
      data = await getCollection('users');
    } else if (q.includes('surger') || q.includes('operation')) {
      data = await getCollection('surgeries');
    }
    dbContext = data.length > 0 ? JSON.stringify(data) : '';
  }

  const systemPrompt = `You are HealthCare Hospital's friendly AI assistant based in Chennai, India.
User role: ${roleName || 'User'} (${role || 'guest'}).

== HOSPITAL KNOWLEDGE ==
- Name: HealthCare Hospital
- Location: No. 12, Anna Salai, Chennai – 600002
- Emergency: 1800-LIFECARE | Ambulance: +91-44-2345-6789
- Blood Bank: +91-44-2345-6700 | Email: info@lifecarehospital.in
- OPD: Mon–Sat 9AM–5PM | Emergency: 24/7
- Departments: Cardiology (Dr. Ravi), Neurology (Dr. Ramesh), Orthopedics (Dr. Meena), Emergency (Dr. Suresh), Pediatrics (Dr. Priya)
- Also: General Medicine, Hematology
- Services: Emergency & Trauma, OPD, ICU, Blood Bank, Diagnostic Lab, Radiology, Pharmacy (24/7), Ambulance, Online Appointments

== DATABASE DATA (from lifecare_hos) ==
${dbContext || 'No records fetched for this question.'}

== RULES ==
1. For general hospital questions — answer from Hospital Knowledge.
2. For specific records (patients, blood, staff) — use Database Data above.
3. If Database Data is empty: say "I couldn't find matching records right now."
4. Keep answers to 3-5 bullet points. Be friendly and professional.
5. Always end with: FOLLOWUP: q1 | q2 | q3`;

  // ── If no Groq key — query database directly ──────────────
  if (!groq) {
    const q = (question || '').toLowerCase();
    let reply = '';

    try {

      // ── PATIENT QUERIES ───────────────────────────────────
      if (q.includes('patient')) {
        const patients = await getCollection('patients');

        if (patients.length === 0) {
          reply = `• No patients found in the database yet.\n• Please register patients first.\n\nFOLLOWUP: How to register patient? | Show doctors | What departments are available?`;
        }
        else if (
          q.includes('how many') || 
          q.includes('count')    || 
          q.includes('total')
        ) {
          // Count patients by status
          const total      = patients.length;
          const waiting    = patients.filter(p => p.status === 'Waiting').length;
          const admitted   = patients.filter(p => p.status === 'Admitted').length;
          const discharged = patients.filter(p => p.status === 'Discharged').length;
          const surgery    = patients.filter(p => p.status === 'Surgery Scheduled').length;

          reply = `• **Total Registered Patients: ${total}**\n• Waiting: ${waiting}\n• Admitted: ${admitted}\n• Surgery Scheduled: ${surgery}\n• Discharged: ${discharged}\n\nFOLLOWUP: Show admitted patients | Show waiting patients | Show recent patients`;
        }
        else if (q.includes('admitted')) {
          // Show admitted patients
          const admitted = patients.filter(p => p.status === 'Admitted');
          if (admitted.length === 0) {
            reply = `• No admitted patients currently.\n\nFOLLOWUP: Show all patients | Show waiting patients`;
          } else {
            const list = admitted.slice(0, 5).map(p =>
              `• ${p.name} | ${p.age}yrs | ${p.bloodGroup} | ${p.department} | Dr.${p.doctorName}`
            ).join('\n');
            const more = admitted.length > 5 
              ? `\n• ...and ${admitted.length - 5} more` 
              : '';
            reply = `• **Admitted Patients (${admitted.length}):**\n${list}${more}\n\nFOLLOWUP: Show waiting patients | Show all patients | Show blood requests`;
          }
        }
        else if (q.includes('waiting')) {
          // Show waiting patients
          const waiting = patients.filter(p => p.status === 'Waiting');
          if (waiting.length === 0) {
            reply = `• No patients currently waiting.\n\nFOLLOWUP: Show admitted patients | Show all patients`;
          } else {
            const list = waiting.slice(0, 5).map(p =>
              `• ${p.name} | ${p.age}yrs | ${p.bloodGroup} | ${p.department}`
            ).join('\n');
            const more = waiting.length > 5 
              ? `\n• ...and ${waiting.length - 5} more` 
              : '';
            reply = `• **Waiting Patients (${waiting.length}):**\n${list}${more}\n\nFOLLOWUP: Show admitted patients | Show all patients`;
          }
        }
        else if (q.includes('discharged')) {
          // Show discharged patients
          const discharged = patients.filter(p => p.status === 'Discharged');
          if (discharged.length === 0) {
            reply = `• No discharged patients found.\n\nFOLLOWUP: Show admitted patients | Show all patients`;
          } else {
            const list = discharged.slice(0, 5).map(p =>
              `• ${p.name} | ${p.age}yrs | ${p.bloodGroup} | ${p.department}`
            ).join('\n');
            reply = `• **Discharged Patients (${discharged.length}):**\n${list}\n\nFOLLOWUP: Show admitted patients | Show all patients`;
          }
        }
        else if (
          q.includes('recent') || 
          q.includes('latest') || 
          q.includes('new')    ||
          q.includes('register')
        ) {
          // Show recently registered patients
          const recent = patients
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);
          const list = recent.map(p =>
            `• ${p.name} | ${p.age}yrs | ${p.bloodGroup} | ${p.department} | ${p.status}`
          ).join('\n');
          reply = `• **Recently Registered Patients:**\n${list}\n\nFOLLOWUP: How many patients total? | Show admitted patients | Show waiting patients`;
        }
        else if (q.includes('blood')) {
          // Patients who need blood
          const needBlood = patients.filter(p => p.bloodNeeded === true);
          if (needBlood.length === 0) {
            reply = `• No patients currently need blood.\n\nFOLLOWUP: Show all patients | Show blood requests`;
          } else {
            const list = needBlood.map(p =>
              `• ${p.name} | Needs: ${p.bloodGroupRequired || p.bloodGroup} | ${p.bloodUnits || 1} units`
            ).join('\n');
            reply = `• **Patients Needing Blood (${needBlood.length}):**\n${list}\n\nFOLLOWUP: Show blood requests | Show all patients`;
          }
        }
        else {
          // Show all patients (default patient query)
          const list = patients.slice(0, 5).map(p =>
            `• ${p.name} | ${p.age}yrs | ${p.bloodGroup} | ${p.department} | ${p.status}`
          ).join('\n');
          const more = patients.length > 5 
            ? `\n• ...and ${patients.length - 5} more patients` 
            : '';
          reply = `• **Patient List (${patients.length} total):**\n${list}${more}\n\nFOLLOWUP: How many patients registered? | Show admitted patients | Show waiting patients`;
        }
      }

      // ── BLOOD REQUEST QUERIES ─────────────────────────────
      else if (
        q.includes('blood request') || 
        q.includes('blood req')     ||
        q.includes('pending request') ||
        q.includes('fulfilled request')
      ) {
        const requests = await getCollection('bloodrequests');

        if (requests.length === 0) {
          reply = `• No blood requests found.\n\nFOLLOWUP: Show patients | Show blood stock`;
        } else {
          const pending   = requests.filter(r => r.status === 'Pending').length;
          const sent      = requests.filter(r => r.status === 'Sent to Blood Bank').length;
          const fulfilled = requests.filter(r => r.status === 'Fulfilled').length;
          const rejected  = requests.filter(r => r.status === 'Rejected').length;

          const list = requests.slice(0, 5).map(r =>
            `• ${r.patientName} | ${r.bloodGroup} | ${r.units} units | ${r.status}`
          ).join('\n');

          reply = `• **Blood Requests (${requests.length} total):**\n${list}\n• Pending: ${pending} | Sent to Bank: ${sent} | Fulfilled: ${fulfilled} | Rejected: ${rejected}\n\nFOLLOWUP: Show pending requests | Show fulfilled requests | Show blood stock`;
        }
      }

      // ── BLOOD STOCK QUERIES ───────────────────────────────
      else if (
        q.includes('blood stock') || 
        q.includes('blood bank')  ||
        q.includes('stock')       ||
        q.includes('blood units')
      ) {
        const banks = await getCollection('bloodbanks');

        if (banks.length === 0) {
          reply = `• No blood bank data found.\n\nFOLLOWUP: Show blood requests | Show patients`;
        } else {
          const bank  = banks[0];
          const stock = bank.stock || {};
          reply = `• **Blood Bank Stock — ${bank.name}:**\n• A+: ${stock.A_pos || 0} units\n• A-: ${stock.A_neg || 0} units\n• B+: ${stock.B_pos || 0} units\n• B-: ${stock.B_neg || 0} units\n• O+: ${stock.O_pos || 0} units\n• O-: ${stock.O_neg || 0} units\n• AB+: ${stock.AB_pos || 0} units\n• AB-: ${stock.AB_neg || 0} units\n\nFOLLOWUP: Show blood requests | Show patients needing blood | Which group is low?`;
        }
      }

      // ── SURGERY QUERIES ───────────────────────────────────
      else if (
        q.includes('surger') || 
        q.includes('operation') ||
        q.includes('scheduled')
      ) {
        const surgeries = await getCollection('surgeries');

        if (surgeries.length === 0) {
          reply = `• No surgeries scheduled currently.\n\nFOLLOWUP: Show patients | Show doctors`;
        } else {
          const scheduled  = surgeries.filter(s => s.status === 'Scheduled');
          const completed  = surgeries.filter(s => s.status === 'Completed');
          const inProgress = surgeries.filter(s => s.status === 'In Progress');

          const list = scheduled.slice(0, 5).map(s =>
            `• ${s.patientName} | ${s.surgeryType} | Dr.${s.doctorName} | ${new Date(s.scheduledAt).toLocaleDateString('en-IN')}`
          ).join('\n');

          reply = `• **Surgeries — Total: ${surgeries.length}**\n• Scheduled: ${scheduled.length} | In Progress: ${inProgress.length} | Completed: ${completed.length}\n${list}\n\nFOLLOWUP: Show all patients | Show doctors`;
        }
      }

      // ── DOCTOR QUERIES ────────────────────────────────────
      else if (q.includes('doctor')) {
        const users   = await getCollection('users');
        const doctors = users.filter(u => u.role === 'Doctor');

        if (doctors.length === 0) {
          reply = `• No doctors found in database.\n\nFOLLOWUP: What departments are available? | Show staff`;
        } else {
          const list = doctors.map(d =>
            `• ${d.name} | ${d.department} | ${d.specialization || 'Specialist'} | ${d.experience || ''}`
          ).join('\n');
          reply = `• **Doctors (${doctors.length}):**\n${list}\n\nFOLLOWUP: Show patients | What departments are available? | Show surgeries`;
        }
      }

      // ── STAFF QUERIES ─────────────────────────────────────
      else if (q.includes('staff') || q.includes('team')) {
        const users = await getCollection('users');

        if (users.length === 0) {
          reply = `• No staff found in database.\n\nFOLLOWUP: Show doctors | Show patients`;
        } else {
          const byRole = {};
          users.forEach(u => {
            byRole[u.role] = (byRole[u.role] || 0) + 1;
          });
          const summary = Object.entries(byRole)
            .map(([role, count]) => `• ${role}: ${count} member(s)`)
            .join('\n');
          reply = `• **Staff Summary (${users.length} total):**\n${summary}\n\nFOLLOWUP: Show doctors | Show patients | Show surgeries`;
        }
      }

      // ── LOCATION QUERIES ──────────────────────────────────
      else if (
        q.includes('location') || 
        q.includes('address')  || 
        q.includes('where')
      ) {
        reply = `• **HealthCare Hospital** — No. 12, Anna Salai, Chennai – 600002\n• Landmark: Near Anna Salai Main Road\n• GPS: 13.0604° N, 80.2496° E\n• Metro: Thousand Lights Station\n• Open: Mon–Sat 9AM–5PM | Emergency: 24/7\n\nFOLLOWUP: What are emergency contacts? | What departments are available? | Show doctors`;
      }

      // ── DEPARTMENT QUERIES ────────────────────────────────
      else if (
        q.includes('department') || 
        q.includes('specialt')
      ) {
        reply = `• **Cardiology** — Dr. Ravi (Heart & vascular care)\n• **Neurology** — Dr. Ramesh (Brain & nervous system)\n• **Orthopedics** — Dr. Meena (Bone, joint & spine surgery)\n• **Emergency** — Dr. Suresh (24/7 critical & trauma care)\n• **Pediatrics** — Dr. Priya (Child & infant healthcare)\n• Also: General Medicine, Hematology\n\nFOLLOWUP: Show patients by department | Who are the doctors? | Show surgeries`;
      }

      // ── EMERGENCY / CONTACT QUERIES ───────────────────────
      else if (
        q.includes('emergency') || 
        q.includes('contact')   || 
        q.includes('phone')     || 
        q.includes('number')
      ) {
        reply = `• **Emergency Helpline:** 1800-LIFECARE (24/7)\n• **Ambulance:** +91-44-2345-6789\n• **Blood Bank:** +91-44-2345-6700\n• **Email:** info@lifecarehospital.in\n• **OPD Hours:** Mon–Sat, 9:00 AM – 5:00 PM\n\nFOLLOWUP: Where is hospital located? | What departments are available? | Show doctors`;
      }

      // ── SERVICE QUERIES ───────────────────────────────────
      else if (q.includes('service')) {
        reply = `• Emergency & Trauma Care (24/7)\n• Outpatient Department (OPD)\n• Inpatient & ICU Care\n• Blood Bank & Transfusion Services\n• Diagnostic Lab & Radiology\n• Pharmacy (24/7) & Ambulance\n• Online Appointment Booking\n\nFOLLOWUP: What departments are available? | Emergency contacts | Show doctors`;
      }

      // ── DEFAULT FALLBACK ──────────────────────────────────
      else {
        const patients = await getCollection('patients');
        const requests = await getCollection('bloodrequests');

        reply = `• Welcome to **HealthCare Hospital** Assistant!\n• Total Patients: ${patients.length}\n• Blood Requests: ${requests.length}\n• Ask me about patients, doctors, blood stock, surgeries\n\nFOLLOWUP: Show patient list | Show blood requests | Show doctors`;
      }

    } catch (err) {
      console.error('Static chatbot error:', err);
      reply = `• Sorry, I could not fetch data right now.\n• Please try again in a moment.\n\nFOLLOWUP: Show patients | Show doctors | Emergency contacts`;
    }

    return res.json({ reply });
  }

  // ── Groq AI response ──────────────────────────────────────
  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: question },
      ],
    });
    res.json({ 
      reply: response.choices[0]?.message?.content || 'No response.' 
    });
  } catch (err) {
    console.error('❌ Groq API error:', err.message);
    res.status(500).json({ error: 'AI service error: ' + err.message });
  }
});

// ── Backend API Routes ────────────────────────────────────────
app.use('/api/auth',           require('./backend/routes/auth'));
app.use('/api/users',          require('./backend/routes/users'));
app.use('/api/departments',    require('./backend/routes/departments'));
app.use('/api/hospital',       require('./backend/routes/hospital'));
app.use('/api/patients',       require('./backend/routes/patients'));
app.use('/api/surgeries',      require('./backend/routes/surgeries'));
app.use('/api/bloodbanks',     require('./backend/routes/bloodbanks'));
app.use('/api/blood-requests', require('./backend/routes/bloodRequests')(broadcast));
app.use('/api/visits',         require('./backend/routes/Visits')(broadcast));
// ── Serve Frontend ────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🏥 HealthCare Hospital → http://localhost:${PORT}`);
  console.log(`📦 Database: ${process.env.DB_NAME || 'lifecare_hos'}`);
});
