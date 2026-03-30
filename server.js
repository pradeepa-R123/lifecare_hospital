const express    = require('express');
const mongoose   = require('mongoose');
const dotenv     = require('dotenv');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { WebSocketServer } = require('ws');

dotenv.config();

let groq = null;
if (process.env.GROQ_API_KEY &&
    process.env.GROQ_API_KEY !== 'your_groq_api_key_here') {
  const Groq = require('groq-sdk');
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log('✅ Groq AI enabled');
} else {
  console.log('⚠️  GROQ_API_KEY not set — chatbot uses static responses');
}

const app    = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}
wss.on('connection', ws => ws.send(JSON.stringify({ type: 'CONNECTED' })));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB Connected to', process.env.DB_NAME || 'lifecare_hos');
    if (process.env.RUN_SEED === 'true') {
      const seed = require('./backend/config/seed');
      await seed();
    }
  })
  .catch(err => console.log('❌ MongoDB Error:', err));

const DB = () => process.env.DB_NAME || 'lifecare_hos';

async function getCollection(collectionName, limit = 20) {
  try {
    const db   = mongoose.connection.client.db(DB());
    const data = await db.collection(collectionName).find({}).limit(limit).toArray();
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
    doctor: process.env.DOCTOR_PIN || '1234',
    staff:  process.env.STAFF_PIN  || '5678',
  };
  if (!pinMap[role]) return res.status(400).json({ error: 'Invalid role' });
  if (pin !== pinMap[role]) return res.status(401).json({ success: false });
  res.json({ success: true, role });
});

// ── Chatbot Data Endpoints ────────────────────────────────────
app.get('/api/patients-chatbot', async (req, res) => {
  try {
    const data  = await getCollection('patients', 20);
    const clean = data.map(p => ({
      _id:        p._id,
      patientId:  p.patientId,
      name:       p.name,
      age:        p.age,
      gender:     p.gender,
      bloodGroup: p.bloodGroup,
      phone:      p.phone,
      department: p.department,
      doctorName: p.doctorName,
      status:     p.status,
      symptoms:   p.symptoms,
      createdAt:  p.createdAt,
    }));
    res.json(clean);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/bloodrequests', async (req, res) => {
  try { res.json(await getCollection('bloodrequests', 20)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/staffs', async (req, res) => {
  try {
    const data  = await getCollection('users', 20);
    const clean = data.map(u => ({
      _id:            u._id,
      name:           u.name,
      role:           u.role,
      department:     u.department,
      email:          u.email,
      specialization: u.specialization || '',
    }));
    res.json(clean);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/appointment', async (req, res) => {
  try {
    const db = mongoose.connection.client.db(DB());
    await db.collection('appointments').insertOne({
      ...req.body, createdAt: new Date()
    });
    res.json({ success: true, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bloodrequest', async (req, res) => {
  try {
    const db = mongoose.connection.client.db(DB());
    await db.collection('bloodrequests').insertOne({
      ...req.body,
      status:      'Pending',
      requestDate: new Date(),
      createdAt:   new Date(),
    });
    res.json({ success: true, ...req.body });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DB Migration ──────────────────────────────────────────────
app.post('/api/migrate/rename-pediatrics', async (req, res) => {
  const { key } = req.body;
  if (key !== (process.env.MIGRATION_KEY || 'migrate-2026'))
    return res.status(403).json({ message: 'Invalid migration key' });
  try {
    const db      = mongoose.connection.client.db(DB());
    const results = {};
    const cols    = ['users','patients','visits','surgeries','bloodrequests','appointments'];
    for (const col of cols) {
      const r = await db.collection(col).updateMany(
        { department: 'Pediatrics' },
        { $set: { department: 'General Physician' } }
      );
      results[col] = r.modifiedCount;
    }
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── One-time Patient.status repair ───────────────────────────
app.post('/api/admin/repair-patient-status', async (req, res) => {
  const { key } = req.body;
  if (key !== (process.env.MIGRATION_KEY || 'migrate-2026'))
    return res.status(403).json({ message: 'Forbidden' });
  try {
    const Visit   = require('./backend/models/Visit');
    const Patient = require('./backend/models/Patient');

    const latestVisits = await Visit.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: {
        _id:     '$patientId',
        status:  { $first: '$status'  },
        visitId: { $first: '$visitId' },
      }},
    ]);

    const statusMap = {
      WAITING:          'Waiting',
      VITALS_PENDING:   'Waiting',
      VITALS_COMPLETED: 'Waiting',
      IN_CONSULTATION:  'Waiting',
      COMPLETED:        'Discharged',
      ADMITTED:         'Admitted',
      SURGERY:          'Surgery Scheduled',
      DISCHARGED:       'Discharged',
    };

    let updated = 0;
    const log   = [];
    for (const v of latestVisits) {
      const newStatus = statusMap[v.status] || 'Waiting';
      const result    = await Patient.findByIdAndUpdate(
        v._id, { status: newStatus }, { new: true }
      );
      if (result) {
        log.push(`${result.name} → ${newStatus} (visit: ${v.visitId})`);
        updated++;
      }
    }
    res.json({ success: true, message: `Repaired ${updated} records`, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Chat Route ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { question, role, roleName } = req.body;
  let { dbContext } = req.body;

  // Auto-fetch DB data based on question keywords
  if (!dbContext || dbContext === '' || dbContext === '[]') {
    const q = (question || '').toLowerCase();
    let data = [];

    if (
      q.includes('patient')     || q.includes('admitted')   ||
      q.includes('registered')  || q.includes('waiting')    ||
      q.includes('recently')    || q.includes('how many patient')
    ) {
      data = await getCollection('patients', 20);
    } else if (
      q.includes('blood request') || q.includes('pending blood') ||
      q.includes('urgent blood')  || q.includes('fulfilled')     ||
      q.includes('blood status')  || q.includes('blood req')
    ) {
      data = await getCollection('bloodrequests', 20);
    } else if (
      q.includes('staff')        || q.includes('doctor')    ||
      q.includes('nurses')       || q.includes('receptionist')
    ) {
      data = await getCollection('users', 20);
    } else if (q.includes('surger') || q.includes('operation')) {
      data = await getCollection('surgeries', 20);
    }

    dbContext = data.length > 0 ? JSON.stringify(data) : '';
  }

  const systemPrompt = `You are HealthCare Hospital's friendly AI assistant based in Chennai, India.
User role: ${roleName || 'User'} (${role || 'guest'}).

== HOSPITAL KNOWLEDGE ==
- Name: HealthCare Hospital
- Location: No. 12, Anna Salai, Chennai - 600002
- Emergency: 1800-LIFECARE | Ambulance: +91-44-2345-6789
- Blood Bank: +91-44-2345-6700 | Email: info@lifecarehospital.in
- OPD: Mon-Sat 9AM-5PM | Emergency: 24/7

- Departments & Doctors:
  Cardiology        - Dr. Ravi   (Heart & vascular care)
  Neurology         - Dr. Ramesh (Brain & nervous system)
  Orthopedics       - Dr. Meena  (Bone, joint & spine surgery)
  Emergency         - Dr. Suresh (24/7 critical & trauma care)
  General Physician - Dr. Priya  (General medicine & primary care)
  NOTE: There is NO General Physician department - always say General Physician.

- Staff: Maran (Receptionist), Priya (Staff - vitals & blood request forwarding)

- Patient Workflow:
  Receptionist registers patient → Staff records vitals →
  Doctor starts consultation (only after vitals done) →
  Doctor updates status → Discharge

- Patient Rule:
  A discharged patient can return. New visit created only after previous visit is Discharged.
  Cannot create new visit if patient has active visit.

- Blood Request Workflow:
  Step 1: Doctor creates request - status: Requested By Doctor
  Step 2: Staff sends to blood bank - status: Sent to Blood Bank
  Step 3: Blood Bank approves or fulfills

== DATABASE FIELD REFERENCE ==
Patient fields: name, age, gender, phone, bloodGroup, department, doctorName,
  status (exact values: Waiting | Admitted | Surgery Scheduled | Discharged),
  symptoms, patientId (format: HC-2026-001), createdAt

Blood Request fields: patientName, bloodGroup, units, priority (Normal/Urgent/Emergency),
  status (Pending | Sent to Blood Bank | Fulfilled | Rejected), createdAt

Staff/User fields: name, role (Doctor | Staff | Receptionist), department, email, specialization

== DATABASE RECORDS FOR THIS QUESTION ==
${dbContext ? dbContext : 'No records fetched - answer from Hospital Knowledge above.'}

== ANSWER RULES ==
1. For general hospital questions (location, departments, contacts, services, workflow) -
   answer from Hospital Knowledge above. NEVER say no data found for these.
2. For patient/staff/blood request records - use Database Records above.
3. If Database Records is empty for a record question, say: I could not find matching records right now.
4. Patient status values are: Waiting, Admitted, Surgery Scheduled, Discharged.
   NEVER say DISCHARGED in all caps - always say Discharged.
5. Never mention Pediatrics - always say General Physician.
6. Keep answers to 3-5 bullet points. Be friendly and professional.
7. For counts: count from the Database Records provided.
8. Always end your response with 3 relevant follow-up questions genuinely related to what the user asked.
   Format exactly as: FOLLOWUP: question1 | question2 | question3
   Examples based on topic:
   - Patient questions: FOLLOWUP: Show admitted patients | How many patients are waiting? | Show recently registered patients
   - Doctor questions: FOLLOWUP: Show doctors by department | Show patient list | What departments are available?
   - Blood request questions: FOLLOWUP: Show urgent blood requests | Show pending blood requests | Show fulfilled requests
   - Location questions: FOLLOWUP: What are the emergency contacts? | What departments are available? | What services does the hospital offer?
   - Department questions: FOLLOWUP: Which doctors are available? | Show patient list | What services does the hospital offer?
   - Staff questions: FOLLOWUP: Show doctors list | Show patient list | How does the patient workflow work?
   - Workflow questions: FOLLOWUP: Show patient list | Show blood requests | What departments are available?
   Never write q1, q2, q3 - always write actual meaningful questions relevant to what was just asked.`;

  // ── Static fallback when Groq key not set ────────────────
  if (!groq) {
    const q = (question || '').toLowerCase();
    let reply = '';
    try {
      if (q.includes('how many patient') || (q.includes('patient') && q.includes('count'))) {
        const patients   = await getCollection('patients', 100);
        const total      = patients.length;
        const waiting    = patients.filter(p => p.status === 'Waiting').length;
        const admitted   = patients.filter(p => p.status === 'Admitted').length;
        const discharged = patients.filter(p => p.status === 'Discharged').length;
        const surgery    = patients.filter(p => p.status === 'Surgery Scheduled').length;
        reply = `• **Total Patients: ${total}**\n• Waiting: ${waiting}\n• Admitted: ${admitted}\n• Surgery Scheduled: ${surgery}\n• Discharged: ${discharged}\n\nFOLLOWUP: Show admitted patients | Show waiting patients | Show recently registered patients`;

      } else if (
        q.includes('patient')    || q.includes('registered') ||
        q.includes('admitted')   || q.includes('waiting')    ||
        q.includes('discharged') || q.includes('recently')
      ) {
        const patients = await getCollection('patients', 20);
        if (patients.length === 0) {
          reply = `• No patients found in the database yet.\n\nFOLLOWUP: How to register a patient? | Show doctors | What departments are available?`;
        } else {
          const filtered =
            q.includes('admitted')   ? patients.filter(p => p.status === 'Admitted') :
            q.includes('waiting')    ? patients.filter(p => p.status === 'Waiting')   :
            q.includes('discharged') ? patients.filter(p => p.status === 'Discharged'):
            q.includes('surgery')    ? patients.filter(p => p.status === 'Surgery Scheduled') :
            patients.slice(0, 5);
          const list = filtered.length > 0
            ? filtered.slice(0, 5).map(p =>
                `• ${p.name} (${p.patientId}) | ${p.age}yrs ${p.gender?.[0] || ''} | ${p.bloodGroup} | ${p.department} | **${p.status}**`
              ).join('\n')
            : '• No patients found for this filter.';
          reply = `• **Patients (${filtered.length} found):**\n${list}\n\nFOLLOWUP: How many patients are registered? | Show admitted patients | Show waiting patients`;
        }

      } else if (
        q.includes('blood request') || q.includes('blood req')   ||
        q.includes('pending blood') || q.includes('urgent blood') ||
        q.includes('fulfilled')     || q.includes('blood status')
      ) {
        const requests = await getCollection('bloodrequests', 20);
        if (requests.length === 0) {
          reply = `• No blood requests found.\n\nFOLLOWUP: Show patients | Show doctors | Hospital information`;
        } else {
          const filtered =
            q.includes('pending')   ? requests.filter(r => r.status === 'Pending') :
            q.includes('urgent')    ? requests.filter(r => r.priority === 'Urgent' || r.priority === 'Emergency') :
            q.includes('fulfilled') ? requests.filter(r => r.status === 'Fulfilled') :
            requests;
          const list = filtered.slice(0, 5).map(r =>
            `• ${r.patientName} | ${r.bloodGroup} | ${r.units} units | Priority: ${r.priority || 'Normal'} | **${r.status}**`
          ).join('\n');
          reply = `• **Blood Requests (${filtered.length} found):**\n${list}\n\nFOLLOWUP: Show pending blood requests | Show urgent blood requests | Show fulfilled requests`;
        }

      } else if (
        q.includes('doctor') || q.includes('staff') || q.includes('nurses')
      ) {
        const users   = await getCollection('users', 20);
        const doctors = users.filter(u => u.role === 'Doctor');
        const staff   = users.filter(u => u.role === 'Staff');
        if (q.includes('staff')) {
          const list = staff.map(s =>
            `• ${s.name} | ${s.role} | ${s.department}`
          ).join('\n');
          reply = `• **Staff Members (${staff.length}):**\n${list || '• No staff found.'}\n\nFOLLOWUP: Show doctors list | Show patient list | How does the patient workflow work?`;
        } else {
          const list = doctors.map(d =>
            `• ${d.name} | ${d.department} | ${d.specialization || 'Specialist'}`
          ).join('\n');
          reply = `• **Doctors (${doctors.length}):**\n${list || '• No doctors found.'}\n\nFOLLOWUP: Show patients | What departments are available? | How does the patient workflow work?`;
        }

      } else if (q.includes('department') || q.includes('specialt')) {
        reply = `• **Cardiology** — Dr. Ravi (Heart & vascular care)\n• **Neurology** — Dr. Ramesh (Brain & nervous system)\n• **Orthopedics** — Dr. Meena (Bone, joint & spine surgery)\n• **Emergency** — Dr. Suresh (24/7 critical & trauma care)\n• **General Physician** — Dr. Priya (General medicine & primary care)\n\nFOLLOWUP: Which doctors are available? | Show patient list | What services does the hospital offer?`;

      } else if (
        q.includes('emergency') || q.includes('contact') ||
        q.includes('phone')     || q.includes('number')
      ) {
        reply = `• **Emergency:** 1800-LIFECARE (24/7)\n• **Ambulance:** +91-44-2345-6789\n• **Blood Bank:** +91-44-2345-6700\n• **Email:** info@lifecarehospital.in\n• **OPD:** Mon–Sat, 9AM–5PM\n\nFOLLOWUP: Where is the hospital located? | What departments are available? | What services does the hospital offer?`;

      } else if (
        q.includes('location') || q.includes('address') || q.includes('where')
      ) {
        reply = `• **HealthCare Hospital**\n• No. 12, Anna Salai, Chennai – 600002\n• OPD: Mon–Sat 9AM–5PM | Emergency: 24/7\n• Ambulance: +91-44-2345-6789\n\nFOLLOWUP: What are the emergency contacts? | What departments are available? | What services does the hospital offer?`;

      } else if (q.includes('service')) {
        reply = `• Emergency & Trauma Care (24/7)\n• Outpatient Department (OPD)\n• Inpatient & ICU Care\n• Blood Bank & Transfusion Services\n• Diagnostic Lab & Radiology (X-Ray, MRI, CT Scan)\n• Pharmacy (24/7) & Ambulance\n• Online Appointment Booking\n\nFOLLOWUP: What departments are available? | What are the emergency contacts? | Where is the hospital located?`;

      } else if (
        q.includes('workflow') || q.includes('process') || q.includes('how does')
      ) {
        reply = `• **Patient Workflow:**\n• Step 1: Receptionist (Maran) registers patient\n• Step 2: Staff (Priya) records vitals\n• Step 3: Doctor starts consultation (only after vitals done)\n• Step 4: Doctor updates diagnosis & status\n• Step 5: Patient discharged\n\nFOLLOWUP: Show patient list | Show blood requests | Show doctors list`;

      } else {
        const patients = await getCollection('patients', 5);
        const requests = await getCollection('bloodrequests', 5);
        reply = `• Welcome to **HealthCare Hospital** Assistant!\n• Total Patients: ${patients.length} | Blood Requests: ${requests.length}\n• Departments: Cardiology, Neurology, Orthopedics, Emergency, General Physician\n• Ask me anything about patients, doctors, or hospital services!\n\nFOLLOWUP: Show patient list | Show blood requests | Show doctors list`;
      }
    } catch (err) {
      reply = `• Sorry, I could not fetch data right now. Please try again.\n\nFOLLOWUP: Show patients | Show doctors | What are the emergency contacts?`;
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
    res.json({ reply: response.choices[0]?.message?.content || 'No response.' });
  } catch (err) {
    console.error('❌ Groq error:', err.message);
    res.status(500).json({ error: 'AI service error: ' + err.message });
  }
});

// ── App routes ────────────────────────────────────────────────
app.use('/api/auth',           require('./backend/routes/auth'));
app.use('/api/users',          require('./backend/routes/users'));
app.use('/api/departments',    require('./backend/routes/departments'));
app.use('/api/hospital',       require('./backend/routes/hospital'));
app.use('/api/patients',       require('./backend/routes/patients'));
app.use('/api/surgeries',      require('./backend/routes/surgeries'));
app.use('/api/bloodbanks',     require('./backend/routes/bloodbanks'));
app.use('/api/blood-requests', require('./backend/routes/bloodRequests')(broadcast));
app.use('/api/visits',         require('./backend/routes/Visits')(broadcast));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🏥 HealthCare Hospital → http://localhost:${PORT}`);
  console.log(`📦 Database: ${process.env.DB_NAME || 'lifecare_hos'}`);
});