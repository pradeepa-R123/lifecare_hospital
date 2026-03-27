// FILE: frontend/src/pages/ReceptionistDashboard.jsx
// CHANGES:
//   1. Added "Discharged" Stat card (green, 🚪 icon)
//   2. Total Patients now = waiting + admitted + surgery + discharged (all statuses)
//   3. fetchPatients passes discharged count from backend counts object
//   4. All other logic unchanged

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import {
  G, DEPTS, BLOOD_GROUPS, DOCTOR_BY_DEPT,
  inp, statusStyle, Badge, Stat, Card, CardHead, THead,
  PageHeader, Sidebar, ProfileCard
} from "../components/UI";

function validate(form) {
  const errors = {};
  if (!form.name || form.name.trim().length < 2)
    errors.name = "Name required.";
  else if (!/^[a-zA-Z\s]+$/.test(form.name.trim()))
    errors.name = "Name should only contain letters.";
  if (!form.age)
    errors.age = "Age is required.";
  else if (isNaN(form.age) || Number(form.age) < 1 || Number(form.age) > 120)
    errors.age = "Age required.";
  if (!form.gender)
    errors.gender = "Please select a gender.";
  if (!form.bloodGroup)
    errors.bloodGroup = "Please select a blood group.";
  if (!form.phone || form.phone.trim() === "")
    errors.phone = "Phone number is required.";
  else {
    const cleaned = form.phone.replace(/[\s\-]/g, "");
    if (!/^(\+91|91)?[6-9]\d{9}$/.test(cleaned))
      errors.phone = "Enter a valid 10-digit mobile number.";
  }
  if (!form.symptoms || form.symptoms.trim().length < 5)
    errors.symptoms = "Describe symptoms.";
  if (!form.department)
    errors.department = "Please select a department.";
  if (!form.doctorName)
    errors.doctorName = "Please select a department.";
  return errors;
}

export default function ReceptionistDashboard() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const onLogout   = () => { logout(); navigate("/"); };

  const [tab,        setTab]        = useState("register");
  const [patients,   setPatients]   = useState([]);
  const [user,       setUser]       = useState(null);
  const [success,    setSuccess]    = useState("");
  const [busy,       setBusy]       = useState(false);
  const [search,     setSearch]     = useState("");
  const [errors,     setErrors]     = useState({});
  const [touched,    setTouched]    = useState({});
  const [page,       setPage]       = useState(1);
  const [pagination, setPagination] = useState({});

  // ── CHANGE: added discharged to counts ──────────────────────────────────
  const [counts, setCounts] = useState({ waiting: 0, admitted: 0, surgery: 0, discharged: 0 });

  const INIT = { name:"", age:"", gender:"Male", phone:"", bloodGroup:"A+", symptoms:"", department:"", doctorName:"" };
  const [form, setForm] = useState(INIT);

  const set = (k, v) => {
    const updated = { ...form, [k]: v };
    setForm(updated);
    if (touched[k]) {
      const e = validate(updated);
      setErrors(prev => ({ ...prev, [k]: e[k] }));
    }
  };

  const touch = (k) => {
    setTouched(t => ({ ...t, [k]: true }));
    const e = validate(form);
    setErrors(prev => ({ ...prev, [k]: e[k] }));
  };

  useEffect(() => {
    axios.get("/api/users/me").then(r => setUser(r.data)).catch(() => {});
    fetchPatients(1, "");
  }, []);

  const fetchPatients = (pageNum = 1, searchVal = search) => {
    const params = new URLSearchParams();
    if (searchVal) params.append("search", searchVal);
    params.append("page", pageNum);

    axios.get(`/api/patients?${params}`)
      .then(r => {
        if (r.data.data) {
          setPatients(r.data.data);
          setPagination(r.data.pagination);
          setPage(r.data.pagination.page);
          // ── CHANGE: read discharged from backend counts, default 0 if missing ──
          setCounts({
            waiting:    r.data.counts?.waiting    || 0,
            admitted:   r.data.counts?.admitted   || 0,
            surgery:    r.data.counts?.surgery    || 0,
            discharged: r.data.counts?.discharged || 0,   // ← NEW
          });
        } else {
          setPatients(r.data);
          setPagination({});
        }
      })
      .catch(() => {});
  };

  const handleSearch = (e) => {
    const val = e.target.value;
    setSearch(val);
    setPage(1);
    setTimeout(() => fetchPatients(1, val), 300);
  };

  const registerPatient = async () => {
    const allTouched = Object.keys(INIT).reduce((acc, k) => ({ ...acc, [k]: true }), {});
    setTouched(allTouched);
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) { setSuccess("❌ Please fix the errors shown below."); return; }

    setBusy(true);
    try {
      const { data } = await axios.post("/api/patients", form);
      const patient  = data.patient || data;
      const visit    = data.visit;
      const visitInfo = visit ? ` | Visit: ${visit.visitId}` : "";
      setSuccess(`✅ Patient registered! ID: ${patient.patientId}${visitInfo} → ${form.doctorName} (${form.department})`);
      setForm(INIT); setErrors({}); setTouched({});
      setPage(1);
      fetchPatients(1, "");
      setTimeout(() => setSuccess(""), 6000);
    } catch (e) {
      setSuccess("❌ " + (e.response?.data?.message || "Registration failed"));
    } finally { setBusy(false); }
  };

  const displayPatients = patients;

  // ── CHANGE: totalPatients includes discharged so the number is accurate ──
  const waitingCount    = counts.waiting;
  const admittedCount   = counts.admitted;
  const surgeryCount    = counts.surgery;
  const dischargedCount = counts.discharged;                          // ← NEW
  const totalPatients   = waitingCount + admittedCount + surgeryCount + dischargedCount; // ← FIXED

  const tabs = [
    { id:"register",  icon:"➕", label:"OP Registration" },
    { id:"returning", icon:"🔄", label:"Returning Patient" },
    { id:"patients",  icon:"👥", label:"Patient List", badge: waitingCount > 0 ? waitingCount : undefined },
    { id:"profile",   icon:"👤", label:"My Profile" },
  ];

  const fStyle = (field, extra = {}) => ({
    ...inp(extra),
    marginBottom: errors[field] && touched[field] ? 4 : 13,
    border: errors[field] && touched[field] ? "1.5px solid #EF4444" : `1.5px solid ${G.border}`,
    background: errors[field] && touched[field] ? "#FFF5F5" : G.white,
  });

  const ErrMsg = ({ field }) => errors[field] && touched[field]
    ? <div style={{color:"#EF4444",fontSize:11.5,fontWeight:600,marginBottom:10}}>⚠ {errors[field]}</div>
    : null;

  return (
    <div style={{display:"flex",minHeight:"100vh",background:G.bg,fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap');`}</style>
      <Sidebar role="Receptionist" name={user?.name||"Receptionist"} tab={tab} setTab={setTab} onLogout={onLogout} tabs={tabs}/>
      <div style={{marginLeft:258,flex:1,padding:28}}>
        <PageHeader
          title={
            tab==="register"  ? "➕ OP Registration"      :
            tab==="returning" ? "🔄 Returning Patient"    :
            tab==="patients"  ? "👥 Registered Patients"  :
                                "👤 My Profile"
          }
          sub="HealthCare Hospital · Reception Desk"
        />

        {/* ── STATS — CHANGE: added Discharged card ── */}
        <div style={{display:"flex",gap:14,marginBottom:16,flexWrap:"wrap"}}>
          <Stat icon="🧑‍🦽" label="Total Patients"   value={totalPatients}   color={G.navy}/>
          <Stat icon="⏳"   label="Waiting"           value={waitingCount}    color={G.orange} bg={G.orangeL}/>
          <Stat icon="🏥"   label="Admitted"          value={admittedCount}   color={G.blue}   bg={G.blueL}/>
          <Stat icon="🔪"   label="Surgery Scheduled" value={surgeryCount}    color="#6D28D9"  bg="#F5F3FF"/>
          {/* ── NEW Discharged stat card ── */}
          <Stat icon="🚪"   label="Discharged"        value={dischargedCount} color={G.green}  bg={G.greenL}/>
        </div>

        {/* ── REGISTER TAB ── */}
        {tab === "register" && (
          <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:22}}>
            <Card>
              <CardHead title="New Patient Registration"/>
              <div style={{padding:22}}>
                {success && (
                  <div style={{
                    background: success.startsWith("❌") ? G.redL : G.greenL,
                    border:`1px solid ${success.startsWith("❌")?"#FECACA":"#A7F3D0"}`,
                    borderRadius:9,padding:"11px 14px",
                    color: success.startsWith("❌") ? G.red : G.green,
                    fontWeight:600,fontSize:13,marginBottom:16
                  }}>{success}</div>
                )}

                <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:5}}>PATIENT NAME *</label>
                <input style={fStyle("name")} placeholder="Full name (letters only)" value={form.name}
                  onChange={e=>set("name",e.target.value)} onBlur={()=>touch("name")}/>
                <ErrMsg field="name"/>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:4}}>AGE *</label>
                    <input
                      style={{...inp(),border:errors.age&&touched.age?"1.5px solid #EF4444":`1.5px solid ${G.border}`,background:errors.age&&touched.age?"#FFF5F5":G.white}}
                      type="number" placeholder="1–120" min={1} max={120} value={form.age}
                      onChange={e=>set("age",e.target.value)} onBlur={()=>touch("age")}/>
                    {errors.age&&touched.age&&<div style={{color:"#EF4444",fontSize:10.5,fontWeight:600,marginTop:2}}>⚠ {errors.age}</div>}
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:4}}>GENDER *</label>
                    <select
                      style={{...inp(),border:errors.gender&&touched.gender?"1.5px solid #EF4444":`1.5px solid ${G.border}`}}
                      value={form.gender} onChange={e=>set("gender",e.target.value)} onBlur={()=>touch("gender")}>
                      <option value="">Select</option>
                      <option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:4}}>BLOOD GROUP *</label>
                    <select style={inp()} value={form.bloodGroup} onChange={e=>set("bloodGroup",e.target.value)}>
                      {BLOOD_GROUPS.map(b=><option key={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:13}}/>

                <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:5}}>PHONE NUMBER *</label>
                <input
                  style={fStyle("phone")}
                  placeholder="Phone number"
                  value={form.phone}
                  onChange={e => { const val = e.target.value.replace(/[^0-9+\s]/g, ""); set("phone", val); }}
                  onBlur={()=>touch("phone")}
                  maxLength={13}
                />
                <ErrMsg field="phone"/>

                <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:4}}>SYMPTOMS / COMPLAINT *</label>
                <textarea
                  style={{...inp(),height:80,resize:"vertical",marginBottom:errors.symptoms&&touched.symptoms?4:13,
                    border:errors.symptoms&&touched.symptoms?"1.5px solid #EF4444":`1.5px solid ${G.border}`,
                    background:errors.symptoms&&touched.symptoms?"#FFF5F5":G.white}}
                  placeholder="Describe symptoms or chief complaint"
                  value={form.symptoms}
                  onChange={e=>set("symptoms",e.target.value)}
                  onBlur={()=>touch("symptoms")}/>
                <ErrMsg field="symptoms"/>

                <button onClick={registerPatient} disabled={busy}
                  style={{width:"100%",padding:"12px 0",background:busy?"#94A3B8":G.red,color:"white",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>
                  {busy?"Registering…":"🏥 Register Patient"}
                </button>
              </div>
            </Card>

            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <Card>
                <CardHead title="Assign Department & Doctor"/>
                <div style={{padding:20}}>
                  <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:5}}>DEPARTMENT *</label>
                  <select
                    style={{...inp(),marginBottom:errors.department&&touched.department?4:14,
                      border:errors.department&&touched.department?"1.5px solid #EF4444":`1.5px solid ${G.border}`,
                      background:errors.department&&touched.department?"#FFF5F5":G.white}}
                    value={form.department}
                    onChange={e=>{
                      const dept=e.target.value;
                      const doc=DOCTOR_BY_DEPT[dept]||"";
                      setForm(p=>({...p,department:dept,doctorName:doc}));
                      if(touched.department){
                        const ne=validate({...form,department:dept,doctorName:doc});
                        setErrors(er=>({...er,department:ne.department,doctorName:ne.doctorName}));
                      }
                    }}
                    onBlur={()=>touch("department")}>
                    <option value="">Select Department</option>
                    {DEPTS.map(d=><option key={d}>{d}</option>)}
                  </select>
                  {errors.department&&touched.department&&<div style={{color:"#EF4444",fontSize:11.5,fontWeight:600,marginBottom:10}}>⚠ {errors.department}</div>}

                  <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:5}}>ASSIGNED DOCTOR *</label>
                  <input style={{...inp(),marginBottom:14,opacity:form.department?1:.45,background:G.bg}}
                    value={form.doctorName} readOnly placeholder="Auto-filled when department selected"/>

                  {form.department&&form.doctorName&&(
                    <div style={{background:G.blueL,border:`1px solid ${G.blue}22`,borderRadius:10,padding:"13px 14px"}}>
                      <div style={{fontSize:10,color:G.blue,fontWeight:700,marginBottom:5}}>DOCTOR</div>
                      <div style={{fontSize:13.5,color:G.navy,fontWeight:700}}>👨‍⚕️ {form.doctorName}</div>
                      <div style={{fontSize:12.5,color:G.muted,marginTop:3}}>🏥 {form.department}</div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === "returning" && <ReturningPatient />}

        {/* ── PATIENT LIST TAB ── */}
        {tab === "patients" && (
          <Card>
            <CardHead
              title={`All Patients (${totalPatients})`}
              right={
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input
                    style={{...inp({width:320,marginBottom:0,padding:"7px 14px",fontSize:13})}}
                    placeholder="🔍 Search: name, age, blood group, sex, doctor, dept, id, phone"
                    value={search}
                    onChange={handleSearch}
                  />
                  {search&&(
                    <button onClick={()=>{ setSearch(""); setPage(1); fetchPatients(1, ""); }}
                      style={{padding:"7px 12px",background:"#FEE2E2",color:"#B91C1C",border:"none",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                      ✕
                    </button>
                  )}
                </div>
              }
            />
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <THead cols={["PATIENT ID","NAME","AGE / SEX","BLOOD","PHONE","SPECIALIZATION","DOCTOR","STATUS","REGISTERED"]}/>
                <tbody>
                  {displayPatients.map((p,i)=>{
                    const sc=statusStyle(p.status);
                    return(
                      <tr key={p._id} style={{borderTop:`1px solid ${G.border}`,background:i%2===0?G.white:"#FAFBFC"}}>
                        <td style={{padding:"12px 16px",fontSize:12,color:G.blue,fontWeight:700}}>{p.patientId}</td>
                        <td style={{padding:"12px 16px",fontWeight:700,color:G.navy}}>{p.name}</td>
                        <td style={{padding:"12px 16px",color:G.muted,fontSize:13}}>{p.age} / {p.gender?.[0]}</td>
                        <td style={{padding:"12px 16px"}}><Badge label={p.bloodGroup} color={G.red} bg={G.redL}/></td>
                        <td style={{padding:"12px 16px",fontSize:13,color:G.muted}}>{p.phone || "—"}</td>
                        <td style={{padding:"12px 16px",fontSize:13}}>{p.department}</td>
                        <td style={{padding:"12px 16px",fontSize:13,color:G.muted}}>{p.doctorName}</td>
                        <td style={{padding:"12px 16px"}}><Badge label={p.status} color={sc.c} bg={sc.bg}/></td>
                        <td style={{padding:"12px 16px",fontSize:12,color:G.muted}}>
                          {new Date(p.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {displayPatients.length===0&&(
                <div style={{padding:"36px",textAlign:"center",color:G.muted}}>
                  {totalPatients===0 ? "No patients registered yet." : `No results for "${search}".`}
                </div>
              )}
            </div>

            {pagination.totalPages && pagination.totalPages > 1 && (
              <div style={{padding:"16px 20px",borderTop:`1px solid ${G.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
                <div style={{display:"flex",gap:10}}>
                  <button
                    disabled={!pagination.hasPrevPage}
                    onClick={()=>fetchPatients(pagination.page - 1, search)}
                    style={{padding:"10px 20px",background:pagination.hasPrevPage?G.navy:"#CBD5E1",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:pagination.hasPrevPage?"pointer":"not-allowed"}}>
                    ← Previous
                  </button>
                  <button
                    disabled={!pagination.hasNextPage}
                    onClick={()=>fetchPatients(pagination.page + 1, search)}
                    style={{padding:"10px 20px",background:pagination.hasNextPage?G.red:"#CBD5E1",color:"white",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:pagination.hasNextPage?"pointer":"not-allowed"}}>
                    Next →
                  </button>
                </div>
              </div>
            )}
          </Card>
        )}

        {tab==="profile"&&user&&<ProfileCard name={user.name} role={user.role} dept={user.department} email={user.email}/>}
      </div>
    </div>
  );
}

// ── ReturningPatient — unchanged from your original ───────────────────────
function ReturningPatient() {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState([]);
  const [selPt,      setSelPt]      = useState(null);
  const [visits,     setVisits]     = useState([]);
  const [dept,       setDept]       = useState("");
  const [doctor,     setDoctor]     = useState("");
  const [complaints, setComplaints] = useState("");
  const [msg,        setMsg]        = useState("");
  const [loading,    setLoading]    = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/patients/search?q=${encodeURIComponent(query)}`);
      setResults(data);
    } catch {} finally { setLoading(false); }
  };

  const select = async (pt) => {
    setSelPt(pt); setMsg("");
    try {
      const { data } = await axios.get(`/api/patients/${pt._id}/visits`);
      setVisits(Array.isArray(data) ? data : []);
    } catch { setVisits([]); }
  };

  const autoDept = (d) => { setDept(d); setDoctor(DOCTOR_BY_DEPT[d] || ""); };

  const createVisit = async () => {
    if (!selPt || !dept || !doctor) { setMsg("❌ Select department first."); return; }
    try {
      const doctorUser = await axios.get(`/api/users/doctors`).then(r => r.data.find(d => d.name === doctor));
      const { data } = await axios.post("/api/visits", {
        patientId:  selPt._id,
        patientRef: selPt.patientId,
        doctorId:   doctorUser?._id,
        doctorName: doctor,
        department: dept,
        complaints: complaints,
      });
      setMsg(`✅ New visit ${data.visitId} created for ${selPt.name}`);
      const updated = await axios.get(`/api/patients/${selPt._id}/visits`).then(r => r.data);
      setVisits(Array.isArray(updated) ? updated : []);
      setComplaints(""); setDept(""); setDoctor("");
    } catch (e) { setMsg("❌ " + (e.response?.data?.message || "Failed")); }
  };

  const STATUS_COLORS = {
    WAITING:         { bg: G.orangeL,  c: G.orange  },
    IN_CONSULTATION: { bg: G.blueL,    c: G.blue    },
    COMPLETED:       { bg: G.greenL,   c: G.green   },
    ADMITTED:        { bg: "#EDE9FE",  c: "#5B21B6" },
    SURGERY:         { bg: G.purpleL,  c: G.purple  },
    DISCHARGED:      { bg: G.greenL,   c: G.green   },
  };
  const STATUS_LABELS = {
    WAITING: "Waiting", IN_CONSULTATION: "In Consultation",
    COMPLETED: "Completed", ADMITTED: "Admitted",
    SURGERY: "Surgery Scheduled", DISCHARGED: "Discharged",
  };

  return (
    <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:20}}>
      <div>
        <Card>
          <CardHead title="Search Existing Patient"/>
          <div style={{padding:18}}>
            <input style={{...inp(),marginBottom:10}} placeholder="Name, phone, or ID…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}/>
            <button onClick={search} disabled={loading} style={{width:"100%",padding:"9px 0",background:G.navy,color:"white",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:12}}>
              {loading?"Searching…":"🔍 Search"}
            </button>
            {results.map(pt=>(
              <div key={pt._id} onClick={()=>select(pt)} style={{padding:"9px 11px",background:selPt?._id===pt._id?G.blueL:G.bg,borderRadius:8,marginBottom:5,cursor:"pointer",border:selPt?._id===pt._id?`1.5px solid ${G.blue}`:"1.5px solid transparent"}}>
                <div style={{fontWeight:700,fontSize:13,color:G.navy}}>{pt.name}</div>
                <div style={{fontSize:11.5,color:G.muted}}>{pt.patientId} · {pt.phone}</div>
              </div>
            ))}
          </div>
        </Card>

        {selPt && (
          <Card style={{marginTop:14}}>
            <CardHead title="Start New Visit"/>
            <div style={{padding:16}}>
              {msg && (
                <div style={{background:msg.startsWith("✅")?G.greenL:G.redL,border:`1px solid ${msg.startsWith("✅")?"#A7F3D0":"#FECACA"}`,borderRadius:8,padding:"9px 12px",color:msg.startsWith("✅")?G.green:G.red,fontSize:12.5,fontWeight:600,marginBottom:12}}>
                  {msg}
                </div>
              )}
              <label style={{fontSize:10.5,fontWeight:700,color:G.muted,display:"block",marginBottom:4}}>DEPARTMENT *</label>
              <select style={{...inp(),marginBottom:11}} value={dept} onChange={e=>autoDept(e.target.value)}>
                <option value="">Select Department</option>
                {DEPTS.map(d=><option key={d}>{d}</option>)}
              </select>
              <label style={{fontSize:10.5,fontWeight:700,color:G.muted,display:"block",marginBottom:4}}>ASSIGNED DOCTOR</label>
              <input style={{...inp(),background:G.bg,marginBottom:11}} value={doctor} readOnly placeholder="Auto-filled"/>
              <label style={{fontSize:10.5,fontWeight:700,color:G.muted,display:"block",marginBottom:4}}>COMPLAINTS</label>
              <textarea style={{...inp(),height:56,resize:"none",marginBottom:11}} placeholder="Chief complaint…" value={complaints} onChange={e=>setComplaints(e.target.value)}/>
              <button onClick={createVisit} style={{width:"100%",padding:"10px 0",background:G.red,color:"white",border:"none",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                🔄 Create New Visit
              </button>
            </div>
          </Card>
        )}
      </div>

      <div>
        {selPt ? (
          <>
            <div style={{fontSize:16,fontWeight:800,color:G.navy,marginBottom:14}}>📁 {selPt.name} — Past Visits</div>
            {visits.length === 0
              ? <div style={{padding:"28px",textAlign:"center",color:G.muted,background:G.white,borderRadius:12,border:`1.5px solid ${G.border}`}}>No past visits. Create the first visit.</div>
              : (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {visits.map(v => {
                    const sc = STATUS_COLORS[v.status] || { bg: G.bg, c: G.muted };
                    return (
                      <div key={v._id} style={{background:G.white,border:`1.5px solid ${G.border}`,borderRadius:12,padding:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                          <span style={{color:G.blue,fontWeight:700,fontSize:12.5}}>{v.visitId}</span>
                          <span style={{background:sc.bg,color:sc.c,padding:"3px 9px",borderRadius:12,fontSize:10.5,fontWeight:700}}>{STATUS_LABELS[v.status]||v.status}</span>
                          <span style={{fontSize:11,color:G.muted}}>{new Date(v.createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span>
                        </div>
                        <div style={{fontSize:12.5,color:G.muted}}>{v.department} · {v.doctorName}</div>
                        {v.complaints&&<div style={{fontSize:12.5,marginTop:4,color:G.text}}><strong>Complaints:</strong> {v.complaints}</div>}
                        {v.diagnosis&&<div style={{fontSize:12.5,marginTop:2,color:G.text}}><strong>Dx:</strong> {v.diagnosis}</div>}
                        {v.dischargedAt&&<div style={{fontSize:11,color:G.green,marginTop:4,fontWeight:600}}>Discharged: {new Date(v.dischargedAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</div>}
                      </div>
                    );
                  })}
                </div>
              )
            }
          </>
        ) : (
          <div style={{padding:"40px",textAlign:"center",color:G.muted,background:G.white,borderRadius:12,border:`1.5px solid ${G.border}`}}>
            Search and select a patient to view their visit history.
          </div>
        )}
      </div>
    </div>
  );
}