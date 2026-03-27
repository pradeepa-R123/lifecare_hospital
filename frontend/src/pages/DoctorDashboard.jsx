// FILE: frontend/src/pages/DoctorDashboard.jsx

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { useWebSocket } from "../context/useWebSocket";
import {
  G, BLOOD_GROUPS, inp, statusStyle, Badge, Stat, Card, CardHead,
  THead, PageHeader, Sidebar, ProfileCard,
} from "../components/UI";

const VISIT_STATUS_LABELS = {
  WAITING: "Waiting", IN_CONSULTATION: "In Consultation",
  COMPLETED: "Completed", ADMITTED: "Admitted",
  SURGERY: "Surgery Scheduled", DISCHARGED: "Discharged",
};
const VISIT_STATUS_COLORS = {
  WAITING:         { bg: G.orangeL, c: G.orange },
  IN_CONSULTATION: { bg: G.blueL,   c: G.blue   },
  COMPLETED:       { bg: G.greenL,  c: G.green  },
  ADMITTED:        { bg: "#EDE9FE", c: "#5B21B6" },
  SURGERY:         { bg: G.purpleL, c: G.purple  },
  DISCHARGED:      { bg: G.greenL,  c: G.green   },
};

function VisitBadge({ status }) {
  const sc = VISIT_STATUS_COLORS[status] || { bg: G.bg, c: G.muted };
  return (
    <span style={{
      background: sc.bg, color: sc.c, padding: "3px 10px",
      borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {VISIT_STATUS_LABELS[status] || status}
    </span>
  );
}

function validateEMR(emr) {
  const errors = {};
  if (!emr.diagnosis || emr.diagnosis.trim().length < 3)
    errors.diagnosis = "Please enter a diagnosis.";
  if (!emr.treatment || emr.treatment.trim().length < 5)
    errors.treatment = "Please enter the treatment or prescription.";
  return errors;
}

const NEXT_ACTIONS = {
  WAITING:         [{ s: "IN_CONSULTATION", label: "▶ Start Consultation", color: G.blue }],
  IN_CONSULTATION: [
    { s: "COMPLETED",  label: "✅ Complete",         color: G.green   },
    { s: "ADMITTED",   label: "🏥 Admit Patient",    color: "#5B21B6" },
    { s: "SURGERY",    label: "🔪 Schedule Surgery", color: G.purple  },
    { s: "DISCHARGED", label: "🚪 Discharge",        color: G.green   },
  ],
  ADMITTED: [
    { s: "SURGERY",    label: "🔪 Schedule Surgery", color: G.purple },
    { s: "DISCHARGED", label: "🚪 Discharge",        color: G.green  },
  ],
  SURGERY:    [{ s: "DISCHARGED", label: "🚪 Discharge", color: G.green }],
  COMPLETED:  [],
  DISCHARGED: [],
};

// Only these statuses can have blood requests added
const BLOOD_ALLOWED = ["WAITING", "IN_CONSULTATION", "ADMITTED", "SURGERY"];

export default function DoctorDashboard() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const onLogout   = () => { logout(); navigate("/"); };

  const [tab,       setTab]       = useState("queue");
  const [user,      setUser]      = useState(null);
  const [visits,    setVisits]    = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [emrBusy,   setEmrBusy]   = useState(false);
  const [emrMsg,    setEmrMsg]    = useState("");
  const [emrErrors, setEmrErrors] = useState({});

  // FIX: no bloodGroup here — auto-fetched from patient record
  const [newBR, setNewBR] = useState({ units: 1, reason: "", priority: "Normal" });
  const [brMsg, setBrMsg] = useState("");

  const [emr, setEmr] = useState({
    complaints: "", diagnosis: "", treatment: "",
    surgeryType: "", scheduledAt: "", surgeryNotes: "",
  });

  useEffect(() => {
    axios.get("/api/users/me").then(r => setUser(r.data)).catch(() => {});
  }, []);

  const fetchVisits = useCallback(() => {
    if (!user) return;
    axios.get(`/api/visits?doctorName=${encodeURIComponent(user.name)}&today=true`)
      .then(r => setVisits(Array.isArray(r.data) ? r.data : []))
      .catch(() => setVisits([]));
  }, [user]);

  useEffect(() => { fetchVisits(); }, [fetchVisits]);

  useWebSocket(useCallback((msg) => {
    const { type, data } = msg;
    if (["VITALS_UPDATED","VISIT_UPDATED","VISIT_STATUS_CHANGED"].includes(type)) {
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      if (selected?._id === data._id) setSelected(data);
    }
    if (type === "NEW_VISIT") {
      if (data.doctorName === user?.name) setVisits(prev => [data, ...prev]);
    }
  }, [selected, user]));

  useEffect(() => {
    if (selected) {
      setEmr({
        complaints:   selected.complaints   || "",
        diagnosis:    selected.diagnosis    || "",
        treatment:    selected.treatment    || "",
        surgeryType:  selected.surgeryType  || "",
        scheduledAt:  selected.scheduledAt  ? selected.scheduledAt.slice(0, 16) : "",
        surgeryNotes: selected.surgeryNotes || "",
      });
      setEmrErrors({}); setEmrMsg(""); setBrMsg("");
      setNewBR({ units: 1, reason: "", priority: "Normal" });
    }
  }, [selected]);

  const changeStatus = async (visitId, newStatus) => {
    try {
      const { data } = await axios.patch(`/api/visits/${visitId}/status`, { status: newStatus });
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      setSelected(data);
    } catch (e) {
      setEmrMsg("❌ " + (e.response?.data?.message || "Status update failed"));
    }
  };

  const saveEMR = async () => {
    if (!selected) return;
    const errs = validateEMR(emr);
    setEmrErrors(errs);
    if (Object.keys(errs).length > 0) { setEmrMsg("❌ Fix errors before saving."); return; }
    setEmrBusy(true); setEmrMsg("");
    try {
      const payload = {
        complaints:   emr.complaints,
        diagnosis:    emr.diagnosis,
        treatment:    emr.treatment,
        surgeryType:  emr.surgeryType  || undefined,
        scheduledAt:  emr.scheduledAt  || undefined,
        surgeryNotes: emr.surgeryNotes || undefined,
      };
      const { data } = await axios.put(`/api/visits/${selected._id}`, payload);
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      setSelected(data);
      setEmrMsg("✅ Consultation saved successfully.");
      setEmrErrors({});
    } catch (e) { setEmrMsg("❌ " + (e.response?.data?.message || "Save failed")); }
    finally { setEmrBusy(false); }
  };

  const addBloodRequest = async () => {
    if (!selected) return;
    // FIX: frontend guard
    if (!BLOOD_ALLOWED.includes(selected.status)) {
      setBrMsg("❌ Cannot add blood request for a " + (VISIT_STATUS_LABELS[selected.status] || selected.status) + " patient.");
      return;
    }
    setBrMsg("");
    try {
      // FIX: no bloodGroup sent — backend reads from patient record
      const { data } = await axios.post(`/api/visits/${selected._id}/blood-requests`, newBR);
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      setSelected(data);
      setNewBR({ units: 1, reason: "", priority: "Normal" });
      setBrMsg("✅ Blood request added.");
    } catch (e) { setBrMsg("❌ " + (e.response?.data?.message || "Failed")); }
  };

  const safeVisits = Array.isArray(visits) ? visits : [];
  const waiting    = safeVisits.filter(v => v.status === "WAITING").length;
  const active     = safeVisits.filter(v => v.status === "IN_CONSULTATION").length;
  const admitted   = safeVisits.filter(v => ["ADMITTED","SURGERY"].includes(v.status)).length;
  const discharged = safeVisits.filter(v => v.status === "DISCHARGED").length;
  const bloodTotal = safeVisits.reduce((acc, v) => acc + (v.bloodRequests?.length || 0), 0);
  const todayTotal = safeVisits.length;

  const canAddBlood = selected && BLOOD_ALLOWED.includes(selected.status);

  const tabs = [
    { id: "queue",   icon: "👥", label: "My Queue",     badge: waiting || undefined },
    { id: "history", icon: "📖", label: "Visit History" },
    { id: "profile", icon: "👤", label: "My Profile"    },
  ];

  const errStyle = (field) => ({
    ...inp(),
    border:       emrErrors[field] ? "1.5px solid #EF4444" : `1.5px solid ${G.border}`,
    background:   emrErrors[field] ? "#FFF5F5" : G.white,
    marginBottom: emrErrors[field] ? 4 : 11,
  });
  const ErrMsg = ({ field }) => emrErrors[field]
    ? <div style={{ color:"#EF4444", fontSize:11.5, fontWeight:600, marginBottom:10 }}>⚠ {emrErrors[field]}</div>
    : null;

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:G.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap');`}</style>

      <Sidebar
        role="Doctor" dept={user?.department} name={user?.name || "Doctor"}
        tab={tab} setTab={t => { setTab(t); setSelected(null); }}
        onLogout={onLogout} tabs={tabs}
      />

      <div style={{ marginLeft:258, flex:1, padding:28 }}>
        <PageHeader
          title={tab === "queue" ? "👥 My Queue" : tab === "history" ? "📖 Visit History" : "👤 My Profile"}
          sub={`${user?.department || ""} · ${user?.name || ""}`}
        />

        <div style={{ display:"flex", gap:14, marginBottom:22, flexWrap:"wrap" }}>
          <Stat icon="👥" label="Today's Visits"    value={todayTotal}  color={G.navy}/>
          <Stat icon="⏳" label="Waiting"            value={waiting}     color={G.orange} bg={G.orangeL}/>
          <Stat icon="🩺" label="In Consultation"    value={active}      color={G.blue}   bg={G.blueL}/>
          <Stat icon="🏥" label="Admitted / Surgery" value={admitted}    color={G.purple} bg={G.purpleL}/>
          <Stat icon="🚪" label="Discharged"         value={discharged}  color={G.green}  bg={G.greenL}/>
          <Stat icon="🩸" label="Blood Requests"     value={bloodTotal}  color={G.red}    bg={G.redL}/>
        </div>

        {tab === "queue" && (
          <div style={{ display:"grid", gridTemplateColumns: selected ? "1fr 430px" : "1fr", gap:22 }}>
            <Card>
              <CardHead title={`Today's Visits — ${user?.department || ""}`} />
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <THead cols={["VISIT ID","PATIENT","AGE","BLOOD","COMPLAINTS","VITALS","STATUS","BLOOD REQ","ACTION"]}/>
                  <tbody>
                    {safeVisits.map((v, i) => {
                      const pt = v.patientId || {};
                      return (
                        <tr
                          key={v._id}
                          style={{ borderTop:`1px solid ${G.border}`, background: selected?._id === v._id ? G.blueL : i%2===0 ? G.white : "#FAFBFC", cursor:"pointer" }}
                          onClick={() => setSelected(v)}
                        >
                          <td style={{ padding:"11px 14px", fontSize:11.5, color:G.blue, fontWeight:700 }}>{v.visitId}</td>
                          <td style={{ padding:"11px 14px", fontWeight:700, color:G.navy }}>{pt.name}</td>
                          <td style={{ padding:"11px 14px", color:G.muted }}>{pt.age}</td>
                          <td style={{ padding:"11px 14px" }}><Badge label={pt.bloodGroup} color={G.red} bg={G.redL}/></td>
                          <td style={{ padding:"11px 14px", fontSize:12, color:G.muted, maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.complaints || "—"}</td>
                          <td style={{ padding:"11px 14px" }}>
                            {v.vitals
                              ? <span style={{ fontSize:11, color:G.green, fontWeight:600 }}>✅ {v.vitals.bp}</span>
                              : <span style={{ fontSize:11, color:G.orange }}>Pending</span>}
                          </td>
                          <td style={{ padding:"11px 14px" }}><VisitBadge status={v.status}/></td>
                          <td style={{ padding:"11px 14px" }}>
                            {v.bloodRequests?.length
                              ? <Badge label={`🩸 ${v.bloodRequests.length}`} color={G.red} bg={G.redL}/>
                              : <span style={{ color:G.muted, fontSize:12 }}>—</span>}
                          </td>
                          <td style={{ padding:"11px 14px" }}>
                            <button
                              style={{ padding:"5px 11px", background:G.navy, color:"white", border:"none", borderRadius:7, fontSize:12, cursor:"pointer", fontWeight:600 }}
                              onClick={e => { e.stopPropagation(); setSelected(v); }}
                            >Open →</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {safeVisits.length === 0 && (
                  <div style={{ padding:"36px", textAlign:"center", color:G.muted }}>No visits today.</div>
                )}
              </div>
            </Card>

            {selected && (
              <Card style={{ alignSelf:"flex-start" }}>
                <CardHead
                  title={`📋 ${selected.patientId?.name || "—"} — ${selected.visitId}`}
                  right={
                    <button
                      onClick={() => { setSelected(null); setEmrMsg(""); setEmrErrors({}); }}
                      style={{ border:"none", background:G.bg, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12.5, color:G.muted }}
                    >✕</button>
                  }
                />
                <div style={{ padding:16, maxHeight:"78vh", overflowY:"auto" }}>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                    {[
                      ["ID",     selected.patientId?.patientId],
                      ["Age",    selected.patientId?.age],
                      ["Blood",  selected.patientId?.bloodGroup],
                      ["Status", VISIT_STATUS_LABELS[selected.status] || selected.status],
                    ].map(([k, val]) => (
                      <div key={k} style={{ background:G.bg, borderRadius:8, padding:"7px 10px" }}>
                        <div style={{ fontSize:9.5, color:G.muted, fontWeight:700, letterSpacing:.5 }}>{k}</div>
                        <div style={{ fontSize:13, fontWeight:700, color:G.navy, marginTop:2 }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:10.5, fontWeight:700, color:G.muted, marginBottom:6 }}>STATUS ACTIONS</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <VisitBadge status={selected.status}/>
                      {(NEXT_ACTIONS[selected.status] || []).map(({ s, label, color }) => (
                        <button key={s} onClick={() => changeStatus(selected._id, s)}
                          style={{ padding:"4px 11px", background:"transparent", border:`1.5px solid ${color}`, borderRadius:20, color, fontSize:11.5, fontWeight:700, cursor:"pointer" }}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  {selected.vitals ? (
                    <div style={{ marginBottom:14 }}>
                      <div style={{ fontSize:10.5, fontWeight:700, color:G.muted, marginBottom:6 }}>VITALS (Recorded by Nurse)</div>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:7 }}>
                        {[["BP",selected.vitals.bp,"mmHg"],["Pulse",selected.vitals.pulse,"bpm"],["SpO₂",selected.vitals.spo2,"%"],["Temp",selected.vitals.temperature,"°F"],["Sugar",selected.vitals.sugar,"mg/dL"],["Weight",selected.vitals.weight,"kg"]].map(([l,val,u]) => (
                          <div key={l} style={{ background:G.bg, borderRadius:8, padding:"8px 10px", textAlign:"center" }}>
                            <div style={{ fontSize:17, fontWeight:800, color:G.navy }}>{val ?? "—"}</div>
                            <div style={{ fontSize:9.5, color:G.muted, fontWeight:600, marginTop:1 }}>{l} {u}</div>
                          </div>
                        ))}
                      </div>
                      {selected.vitals.notes && (
                        <div style={{ fontSize:12, color:G.muted, marginTop:7, padding:"7px 10px", background:G.bg, borderRadius:7 }}>📝 {selected.vitals.notes}</div>
                      )}
                    </div>
                  ) : (
                    <div style={{ background:G.blueL, border:`1px solid #BFDBFE`, borderRadius:9, padding:"9px 13px", marginBottom:14, fontSize:12.5, color:G.blue, fontWeight:600 }}>
                      ⏳ Vitals not yet recorded by nurse.
                    </div>
                  )}

                  <label style={{ fontSize:11, fontWeight:700, color:G.muted, display:"block", marginBottom:4 }}>COMPLAINTS</label>
                  <textarea style={{ ...inp(), height:52, resize:"none", marginBottom:11 }} placeholder="Chief complaints…" value={emr.complaints} onChange={e => setEmr(p => ({ ...p, complaints: e.target.value }))}/>

                  <label style={{ fontSize:11, fontWeight:700, color:G.muted, display:"block", marginBottom:4 }}>DIAGNOSIS *</label>
                  <input style={errStyle("diagnosis")} placeholder="Enter diagnosis…" value={emr.diagnosis} onChange={e => { setEmr(p => ({ ...p, diagnosis: e.target.value })); setEmrErrors(p => ({ ...p, diagnosis:"" })); }}/>
                  <ErrMsg field="diagnosis"/>

                  <label style={{ fontSize:11, fontWeight:700, color:G.muted, display:"block", marginBottom:4 }}>TREATMENT / PRESCRIPTION *</label>
                  <textarea style={{ ...errStyle("treatment"), height:68, resize:"none" }} placeholder="Medications, instructions…" value={emr.treatment} onChange={e => { setEmr(p => ({ ...p, treatment: e.target.value })); setEmrErrors(p => ({ ...p, treatment:"" })); }}/>
                  <ErrMsg field="treatment"/>

                  {["SURGERY","ADMITTED"].includes(selected.status) && (
                    <div style={{ background:G.purpleL, border:`1.5px solid #DDD6FE`, borderRadius:11, padding:14, marginBottom:14 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:G.purple, marginBottom:9 }}>🔪 Surgery Details</div>
                      <label style={{ fontSize:10, fontWeight:700, color:G.muted, display:"block", marginBottom:4 }}>SURGERY TYPE</label>
                      <input style={{ ...inp(), marginBottom:9 }} placeholder="e.g. CABG…" value={emr.surgeryType} onChange={e => setEmr(p => ({ ...p, surgeryType: e.target.value }))}/>
                      <label style={{ fontSize:10, fontWeight:700, color:G.muted, display:"block", marginBottom:4 }}>DATE & TIME</label>
                      <input type="datetime-local" style={{ ...inp(), marginBottom:9 }} value={emr.scheduledAt} onChange={e => setEmr(p => ({ ...p, scheduledAt: e.target.value }))}/>
                      <label style={{ fontSize:10, fontWeight:700, color:G.muted, display:"block", marginBottom:4 }}>PRE-OP NOTES</label>
                      <textarea style={{ ...inp(), height:52, resize:"none" }} placeholder="Pre-op notes…" value={emr.surgeryNotes} onChange={e => setEmr(p => ({ ...p, surgeryNotes: e.target.value }))}/>
                    </div>
                  )}

                  {emrMsg && (
                    <div style={{ background: emrMsg.startsWith("❌") ? G.redL : G.greenL, border:`1px solid ${emrMsg.startsWith("❌") ? "#FECACA" : "#A7F3D0"}`, borderRadius:8, padding:"10px 13px", color: emrMsg.startsWith("❌") ? G.red : G.green, fontSize:13, fontWeight:600, marginBottom:12 }}>{emrMsg}</div>
                  )}

                  <button onClick={saveEMR} disabled={emrBusy} style={{ width:"100%", padding:"12px 0", background: emrBusy ? "#94A3B8" : G.green, color:"white", border:"none", borderRadius:10, fontSize:13.5, fontWeight:700, cursor: emrBusy ? "not-allowed" : "pointer", marginBottom:16 }}>
                    {emrBusy ? "Saving…" : "💾 Save Consultation"}
                  </button>

                  {/* ── BLOOD REQUESTS ── */}
                  <div style={{ borderTop:`1.5px solid ${G.border}`, paddingTop:14 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:G.navy, marginBottom:10 }}>🩸 Blood Requests</div>

                    {(selected.bloodRequests || []).map((br, idx) => {
                      const brColors = {
                        PENDING:          { bg:G.orangeL, c:G.orange  },
                        SENT_TO_BLOODBANK: { bg:G.purpleL, c:G.purple  },
                        APPROVED:         { bg:G.blueL,   c:G.blue    },
                        FULFILLED:        { bg:G.greenL,  c:G.green   },
                        REJECTED:         { bg:"#FEE2E2", c:"#B91C1C" },
                      };
                      const bc = brColors[br.status] || { bg:G.bg, c:G.muted };
                      return (
                        <div key={idx} style={{ display:"flex", alignItems:"center", gap:7, padding:"8px 10px", background:G.bg, borderRadius:8, marginBottom:5 }}>
                          <Badge label={br.bloodGroup} color={G.red} bg={G.redL}/>
                          <span style={{ fontWeight:700, fontSize:12.5 }}>{br.units}u</span>
                          <span style={{ fontSize:12, color:G.muted, flex:1 }}>{br.reason || "—"}</span>
                          <span style={{ background:bc.bg, color:bc.c, padding:"2px 8px", borderRadius:12, fontSize:10.5, fontWeight:700 }}>{br.status.replace(/_/g," ")}</span>
                        </div>
                      );
                    })}

                    {/* FIX: only show add form if status allows */}
                    {canAddBlood ? (
                      <div style={{ background:G.redL, border:`1.5px solid #FECACA`, borderRadius:10, padding:12, marginTop:8 }}>

                        {/* FIX: auto blood group display — no dropdown */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:G.white, borderRadius:8, marginBottom:8, border:`1px solid #FECACA` }}>
                          <span style={{ fontSize:11, fontWeight:700, color:G.muted }}>BLOOD GROUP:</span>
                          <Badge label={selected.patientId?.bloodGroup || "—"} color={G.red} bg={G.redL}/>
                          <span style={{ fontSize:11, color:G.muted, fontStyle:"italic" }}>auto from patient record</span>
                        </div>

                        <div style={{ display:"grid", gridTemplateColumns:"80px 1fr", gap:8, marginBottom:7 }}>
                          <input type="number" min={1} style={inp()} placeholder="Units"
                            value={newBR.units}
                            onChange={e => setNewBR(p => ({ ...p, units: Number(e.target.value) }))}
                          />
                          <input style={inp()} placeholder="Reason…"
                            value={newBR.reason}
                            onChange={e => setNewBR(p => ({ ...p, reason: e.target.value }))}
                          />
                        </div>

                        <select style={{ ...inp(), marginBottom:7 }} value={newBR.priority} onChange={e => setNewBR(p => ({ ...p, priority: e.target.value }))}>
                          {["Normal","Urgent","Emergency"].map(x => <option key={x}>{x}</option>)}
                        </select>

                        {brMsg && <div style={{ fontSize:12, fontWeight:600, color: brMsg.startsWith("✅") ? G.green : G.red, marginBottom:6 }}>{brMsg}</div>}

                        <button onClick={addBloodRequest}
                          style={{ width:"100%", padding:"9px 0", background:G.red, color:"white", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}
                        >➕ Add Blood Request</button>
                      </div>
                    ) : (
                      /* FIX: blocked message for discharged / completed */
                      <div style={{ background:"#FEF3C7", border:"1.5px solid #FDE68A", borderRadius:10, padding:"12px 14px", marginTop:8 }}>
                        <div style={{ fontSize:12.5, color:"#92400E", fontWeight:700 }}>🚫 Blood requests not allowed</div>
                        <div style={{ fontSize:12, color:"#92400E", marginTop:4 }}>
                          Patient is <strong>{VISIT_STATUS_LABELS[selected.status] || selected.status}</strong>.
                          Only Waiting, In Consultation, Admitted, or Surgery Scheduled patients can receive blood requests.
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </Card>
            )}
          </div>
        )}

        {tab === "history" && <VisitHistoryTab doctorName={user?.name}/>}
        {tab === "profile" && user && <ProfileCard name={user.name} role={user.role} dept={user.department} email={user.email} specialization={user.specialization} experience={user.experience} education={user.education} studiedAt={user.studiedAt}/>}
      </div>
    </div>
  );
}

function VisitHistoryTab({ doctorName }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visits,  setVisits]  = useState([]);
  const [selPt,   setSelPt]   = useState(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/patients/search?q=${encodeURIComponent(query)}`);
      setResults(data);
    } catch {} finally { setLoading(false); }
  };

  const loadHistory = async (pt) => {
    setSelPt(pt);
    try {
      const { data } = await axios.get(`/api/patients/${pt._id}/visits`);
      setVisits(Array.isArray(data) ? data : []);
    } catch { setVisits([]); }
  };

  const brColors = {
    PENDING:          { bg:G.orangeL, c:G.orange  },
    SENT_TO_BLOODBANK:{ bg:G.purpleL, c:G.purple  },
    APPROVED:         { bg:G.blueL,   c:G.blue    },
    FULFILLED:        { bg:G.greenL,  c:G.green   },
    REJECTED:         { bg:"#FEE2E2", c:"#B91C1C" },
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns: selPt ? "300px 1fr" : "1fr", gap:20 }}>
      <div>
        <Card>
          <CardHead title="Search Patient"/>
          <div style={{ padding:16 }}>
            <input style={{ ...inp(), marginBottom:10 }} placeholder="Name, phone, or patient ID…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}/>
            <button onClick={search} disabled={loading} style={{ width:"100%", padding:"9px 0", background:G.navy, color:"white", border:"none", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {loading ? "Searching…" : "🔍 Search"}
            </button>
            <div style={{ marginTop:12 }}>
              {results.map(pt => (
                <div key={pt._id} onClick={() => loadHistory(pt)} style={{ padding:"9px 11px", background: selPt?._id === pt._id ? G.blueL : G.bg, borderRadius:8, marginBottom:5, cursor:"pointer" }}>
                  <div style={{ fontWeight:700, fontSize:13, color:G.navy }}>{pt.name}</div>
                  <div style={{ fontSize:11.5, color:G.muted }}>{pt.patientId} · {pt.phone}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {selPt && (
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:G.navy, marginBottom:14 }}>📖 {selPt.name} — Visit Timeline</div>
          {visits.length === 0
            ? <div style={{ padding:"28px", textAlign:"center", color:G.muted }}>No visits found.</div>
            : (
              <div style={{ position:"relative", paddingLeft:28 }}>
                <div style={{ position:"absolute", left:9, top:0, bottom:0, width:2, background:G.border }}/>
                {visits.map((v) => {
                  const isDone = v.status === "DISCHARGED";
                  const dotBg  = isDone ? G.green : v.status === "IN_CONSULTATION" ? G.blue : G.border;
                  return (
                    <div key={v._id} style={{ position:"relative", marginBottom:20 }}>
                      <div style={{ position:"absolute", left:-22, top:4, width:12, height:12, borderRadius:"50%", background:dotBg, border:`2px solid ${G.white}`, boxShadow:`0 0 0 2px ${dotBg}40` }}/>
                      <div style={{ background:G.white, border:`1.5px solid ${G.border}`, borderRadius:12, padding:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:G.blue }}>{v.visitId}</span>
                          <span style={{ fontSize:11, color:G.muted }}>{new Date(v.createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span>
                        </div>
                        <div style={{ fontSize:12, color:G.muted, marginBottom:4 }}>Dept: {v.department} · Dr: {v.doctorName}</div>
                        {v.complaints && <div style={{ fontSize:12.5, marginBottom:4 }}><strong>Complaints:</strong> {v.complaints}</div>}
                        {v.diagnosis  && <div style={{ fontSize:12.5, marginBottom:4 }}><strong>Diagnosis:</strong> {v.diagnosis}</div>}
                        {v.treatment  && <div style={{ fontSize:12.5, marginBottom:6 }}><strong>Treatment:</strong> {v.treatment}</div>}
                        {v.vitals && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:6 }}>
                            {[["BP",v.vitals.bp],["Pulse",v.vitals.pulse],["SpO₂",v.vitals.spo2],["Temp",v.vitals.temperature]].map(([l,val]) =>
                              val ? <span key={l} style={{ fontSize:11, background:G.bg, padding:"2px 8px", borderRadius:10, color:G.navy, fontWeight:600 }}>{l}: {val}</span> : null
                            )}
                          </div>
                        )}
                        {v.bloodRequests?.length > 0 && (
                          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                            {v.bloodRequests.map((br, i) => {
                              const bc = brColors[br.status] || { bg:G.bg, c:G.muted };
                              return <span key={i} style={{ fontSize:11, background:bc.bg, color:bc.c, padding:"2px 8px", borderRadius:12, fontWeight:600 }}>🩸 {br.bloodGroup} {br.units}u — {br.status.replace(/_/g," ")}</span>;
                            })}
                          </div>
                        )}
                        {v.dischargedAt && <div style={{ fontSize:11, color:G.green, marginTop:6, fontWeight:600 }}>Discharged: {new Date(v.dischargedAt).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}