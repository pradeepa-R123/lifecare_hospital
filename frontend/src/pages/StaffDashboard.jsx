// FILE: frontend/src/pages/StaffDashboard.jsx
// ~~~ FULL UPDATED FILE — replaces existing StaffDashboard.jsx ~~~
// CHANGES:
//  1. ✅ VITALS_COMPLETED added to VSC color map and VLabel
//  2. ✅ Staff blood bank card shows contact info only — no stock/inventory
//  3. ✅ WebSocket handles NEW_BLOOD_REQUEST for real-time updates

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import {
  G, inp, statusStyle, Badge, Stat, Card, CardHead, THead,
  PageHeader, Sidebar, ProfileCard,
} from "../components/UI";
import { useWebSocket } from "../context/useWebSocket";

// ── Visit status colors ───────────────────────────────────────────────────
const VSC = {
  WAITING:          { bg: G.orangeL, c: G.orange  },
  VITALS_PENDING:   { bg: "#FEF3C7", c: "#92400E" },
  VITALS_COMPLETED: { bg: "#DCFCE7", c: "#166534" }, // ✅ NEW — green tint
  IN_CONSULTATION:  { bg: G.blueL,   c: G.blue    },
  COMPLETED:        { bg: G.greenL,  c: G.green   },
  ADMITTED:         { bg: "#EDE9FE", c: "#5B21B6" },
  SURGERY:          { bg: G.purpleL, c: G.purple  },
  DISCHARGED:       { bg: G.bg,      c: G.muted   },
};

const VLabel = {
  WAITING:          "Waiting",
  VITALS_PENDING:   "Vitals Pending",
  VITALS_COMPLETED: "Vitals Completed",  // ✅ NEW
  IN_CONSULTATION:  "In Consultation",
  COMPLETED:        "Completed",
  ADMITTED:         "Admitted",
  SURGERY:          "Surgery Scheduled",
  DISCHARGED:       "Discharged",
};

function VisitBadge({ status }) {
  const sc = VSC[status] || { bg:G.bg, c:G.muted };
  return (
    <span style={{
      background: sc.bg, color: sc.c,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {VLabel[status] || status}
    </span>
  );
}

export default function StaffDashboard() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const onLogout   = () => { logout(); navigate("/"); };

  const [tab,       setTab]      = useState("vitals");
  const [user,      setUser]     = useState(null);
  const [visits,    setVisits]   = useState([]);
  const [banks,     setBanks]    = useState([]);

  // Vitals state
  const [selVisit,  setSelVisit] = useState(null);
  const [vForm,     setVForm]    = useState({ bp:"", pulse:"", spo2:"", temperature:"", sugar:"", weight:"", notes:"" });
  const [vMsg,      setVMsg]     = useState("");
  const [vBusy,     setVBusy]    = useState(false);

  // Legacy blood requests (old system)
  const [requests,  setRequests] = useState([]);
  const [msg,       setMsg]      = useState({});

  useEffect(() => {
    axios.get("/api/users/me").then(r => setUser(r.data)).catch(() => {});
    axios.get("/api/bloodbanks").then(r => setBanks(r.data)).catch(() => {});
    fetchVisits();
    fetchRequests();
  }, []);

  const fetchVisits = () =>
    axios.get("/api/visits")
      .then(r => setVisits(Array.isArray(r.data) ? r.data : []))
      .catch(() => setVisits([]));

  const fetchRequests = () =>
    axios.get("/api/blood-requests")
      .then(r => setRequests(r.data))
      .catch(() => {});

  // ── WebSocket live updates ────────────────────────────────
  useWebSocket(useCallback((m) => {
    const { type, data } = m;

    if (["VITALS_UPDATED", "VISIT_UPDATED", "VISIT_STATUS_CHANGED", "BLOOD_REQUEST_SENT"].includes(type)) {
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      if (selVisit?._id === data._id) setSelVisit(data);
    }

    if (type === "NEW_VISIT") {
      setVisits(prev => [data, ...prev]);
    }

    // ✅ NEW_BLOOD_REQUEST — real-time notification from doctor
    if (type === "NEW_BLOOD_REQUEST") {
      const updatedVisit = data.visit;
      if (updatedVisit) {
        setVisits(prev =>
          prev.some(v => v._id === updatedVisit._id)
            ? prev.map(v => v._id === updatedVisit._id ? updatedVisit : v)
            : [updatedVisit, ...prev]
        );
        if (selVisit?._id === updatedVisit._id) setSelVisit(updatedVisit);
      }
    }

    if (type === "NEW_REQUEST")    setRequests(p => [m.data, ...p.filter(r => r._id !== m.data._id)]);
    if (type === "UPDATE_REQUEST") setRequests(p => p.map(r => r._id === m.data._id ? m.data : r));
    if (type === "DELETE_REQUEST") setRequests(p => p.filter(r => r._id !== m.data._id));
  }, [selVisit]));

  // ── Open visit for vitals ─────────────────────────────────
  const openVisit = (v) => {
    setSelVisit(v);
    const vt = v.vitals || {};
    setVForm({
      bp:          vt.bp          || "",
      pulse:       vt.pulse       || "",
      spo2:        vt.spo2        || "",
      temperature: vt.temperature || "",
      sugar:       vt.sugar       || "",
      weight:      vt.weight      || "",
      notes:       vt.notes       || "",
    });
    setVMsg("");
  };

  // ── Save vitals ───────────────────────────────────────────
  const saveVitals = async () => {
    if (!selVisit) return;
    setVBusy(true); setVMsg("");
    try {
      const { data } = await axios.post(`/api/visits/${selVisit._id}/vitals`, {
        bp:          vForm.bp          || undefined,
        pulse:       vForm.pulse       ? Number(vForm.pulse)       : undefined,
        spo2:        vForm.spo2        ? Number(vForm.spo2)        : undefined,
        temperature: vForm.temperature ? Number(vForm.temperature) : undefined,
        sugar:       vForm.sugar       ? Number(vForm.sugar)       : undefined,
        weight:      vForm.weight      ? Number(vForm.weight)      : undefined,
        notes:       vForm.notes       || undefined,
      });
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      setSelVisit(data);
      setVMsg("✅ Vitals saved");
    } catch (e) {
      setVMsg("❌ " + (e.response?.data?.message || "Failed to save"));
    } finally { setVBusy(false); }
  };

  // ── Forward visit blood request to Blood Bank ─────────────
  const sendVisitBRToBank = async (visitId, brId) => {
    try {
      const { data } = await axios.post(`/api/visits/${visitId}/blood-requests/${brId}/send`);
      const updated = data.visit;
      setVisits(prev => prev.map(v => v._id === updated._id ? updated : v));
      if (selVisit?._id === updated._id) setSelVisit(updated);
    } catch (e) {
      alert("❌ " + (e.response?.data?.message || "Send failed"));
    }
  };

  // ── Forward legacy blood request to Blood Bank ────────────
  const sendToBloodBank = async (req) => {
    const bank = banks[0];
    try {
      await axios.post(`/api/blood-requests/${req._id}/send-to-bank`, {});
      setMsg(p => ({ ...p, [req._id]: `✅ Sent to ${bank?.name || "Blood Bank"}` }));
      setTimeout(() => setMsg(p => ({ ...p, [req._id]: "" })), 4000);
    } catch (e) {
      setMsg(p => ({ ...p, [req._id]: `❌ ${e.response?.data?.message || "Failed to send"}` }));
    }
  };

  // ── Computed ──────────────────────────────────────────────
  const safeVisits   = Array.isArray(visits) ? visits : [];

  // ✅ Active visits now excludes VITALS_COMPLETED from "pending" — it's done
  const activeVisits = safeVisits.filter(v => !["DISCHARGED", "COMPLETED"].includes(v.status));

  // ✅ noVitals: visits that still need vitals (WAITING or VITALS_PENDING only)
  const noVitals = activeVisits.filter(v =>
    !v.vitals && !["VITALS_COMPLETED", "IN_CONSULTATION", "ADMITTED", "SURGERY"].includes(v.status)
  ).length;

  const allVisitBRs = safeVisits.flatMap(v =>
    (v.bloodRequests || []).map(br => ({ ...br, visit: v }))
  );

  const pendingVisitBRs = allVisitBRs.filter(br => br.status === "Requested By Doctor").length;
  const pending         = requests.filter(r => r.status === "Pending").length;
  const sent            = requests.filter(r => r.status === "Sent to Blood Bank").length;
  const fulfilled       = requests.filter(r => r.status === "Fulfilled").length;

  const bgKeyMap = {
    "A+":"A_pos","A-":"A_neg","B+":"B_pos","B-":"B_neg",
    "O+":"O_pos","O-":"O_neg","AB+":"AB_pos","AB-":"AB_neg",
  };
  const stockFor = (bg) => {
    const bank = banks[0];
    if (!bank) return null;
    const k = bgKeyMap[bg];
    return k ? bank.stock?.[k] : null;
  };

  const tabs = [
    { id:"vitals",     icon:"🩺", label:"Vitals Entry",   badge: noVitals || undefined },
    { id:"blood",      icon:"🩸", label:"Blood Requests", badge: (pendingVisitBRs + pending) || undefined },
    { id:"bloodbanks", icon:"🏦", label:"Blood Banks" },
    { id:"profile",    icon:"👤", label:"My Profile" },
  ];

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:G.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap');`}</style>

      <Sidebar
        role="Staff" name={user?.name || "Staff"}
        tab={tab} setTab={t => { setTab(t); setSelVisit(null); }}
        onLogout={onLogout} tabs={tabs}
      />

      <div style={{ marginLeft:258, flex:1, padding:28 }}>
        <PageHeader
          title={
            tab==="vitals"     ? "🩺 Vitals Entry"  :
            tab==="blood"      ? "🩸 Blood Requests" :
            tab==="bloodbanks" ? "🏦 Blood Banks"    : "👤 My Profile"
          }
        />

        {/* ══════════════ VITALS TAB ══════════════ */}
        {tab === "vitals" && (
          <div style={{ display:"grid", gridTemplateColumns: selVisit ? "1fr 360px" : "1fr", gap:20 }}>
            <div>
              <div style={{ display:"flex", gap:14, marginBottom:18, flexWrap:"wrap" }}>
                <Stat icon="📋" label="Active Visits"   value={activeVisits.length}                color={G.navy}/>
                <Stat icon="⚠️" label="Vitals Pending"  value={noVitals}                           color={G.orange} bg={G.orangeL}/>
                <Stat icon="✅" label="Vitals Recorded" value={activeVisits.length - noVitals}     color={G.green}  bg={G.greenL}/>
              </div>

              <Card>
                <CardHead title={`Active Visits (${activeVisits.length})`}/>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse" }}>
                    <THead cols={["VISIT ID","PATIENT","DEPT","DOCTOR","STATUS","VITALS","ACTION"]}/>
                    <tbody>
                      {activeVisits.map((v, i) => {
                        const pt = v.patientId || {};
                        return (
                          <tr
                            key={v._id}
                            style={{
                              borderTop: `1px solid ${G.border}`,
                              background: selVisit?._id===v._id ? G.blueL : i%2===0 ? G.white : "#FAFBFC",
                            }}
                          >
                            <td style={{ padding:"11px 14px", fontSize:11.5, color:G.blue, fontWeight:700 }}>{v.visitId}</td>
                            <td style={{ padding:"11px 14px", fontWeight:700, color:G.navy }}>{pt.name}</td>
                            <td style={{ padding:"11px 14px", color:G.muted }}>{v.department}</td>
                            <td style={{ padding:"11px 14px", color:G.muted, fontSize:12.5 }}>{v.doctorName}</td>
                            <td style={{ padding:"11px 14px" }}><VisitBadge status={v.status}/></td>
                            <td style={{ padding:"11px 14px" }}>
                              {v.vitals
                                ? <span style={{ fontSize:11.5, color:G.green, fontWeight:600 }}>✅ {v.vitals.bp}</span>
                                : <span style={{ fontSize:11.5, color:G.orange, fontWeight:600 }}>⚠ Pending</span>}
                            </td>
                            <td style={{ padding:"11px 14px" }}>
                              <button
                                onClick={() => openVisit(v)}
                                style={{
                                  padding:"5px 11px",
                                  background: v.vitals ? G.teal : G.blue,
                                  color:"white", border:"none", borderRadius:7,
                                  fontSize:11.5, cursor:"pointer", fontWeight:700,
                                }}
                              >
                                {v.vitals ? "Update" : "Record"} Vitals
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {activeVisits.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding:"32px", textAlign:"center", color:G.muted }}>
                            No active visits.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* ── Vitals form panel ── */}
            {selVisit && (
              <Card style={{ alignSelf:"flex-start" }}>
                <CardHead
                  title={`🩺 ${selVisit.patientId?.name || "—"}`}
                  right={
                    <button
                      onClick={() => { setSelVisit(null); setVMsg(""); }}
                      style={{ border:"none", background:G.bg, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:12.5, color:G.muted }}
                    >✕</button>
                  }
                />
                <div style={{ padding:16 }}>
                  <div style={{ background:G.bg, borderRadius:9, padding:"9px 12px", marginBottom:14 }}>
                    <div style={{ fontWeight:700, color:G.navy, fontSize:13 }}>{selVisit.patientId?.name}</div>
                    <div style={{ fontSize:11.5, color:G.muted, marginTop:2 }}>
                      {selVisit.visitId} · {selVisit.department}
                    </div>
                    <div style={{ marginTop:4 }}><VisitBadge status={selVisit.status}/></div>
                  </div>

                  {vMsg && (
                    <div style={{
                      background: vMsg.startsWith("✅") ? G.greenL : G.redL,
                      border: `1px solid ${vMsg.startsWith("✅") ? "#A7F3D0" : "#FECACA"}`,
                      borderRadius:8, padding:"9px 12px",
                      color: vMsg.startsWith("✅") ? G.green : G.red,
                      fontSize:12.5, fontWeight:600, marginBottom:12,
                    }}>
                      {vMsg}
                    </div>
                  )}

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:9 }}>
                    {[
                      ["bp",          "Blood Pressure",        "e.g. 120/80", "text"  ],
                      ["pulse",       "Pulse (bpm)",           "60-100",          "number"],
                      ["spo2",        "SpO₂ (%)",              "95%-100%",          "number"],
                      ["temperature", "Temperature (°F)",      "97-99",        "number"],
                      ["sugar",       "Blood Sugar (mg/dL)",   "70-100",          "number"],
                      ["weight",      "Weight (kg)",           "",          "number"],
                    ].map(([k, label, placeholder, type]) => (
                      <div key={k}>
                        <label style={{ fontSize:10, fontWeight:700, color:G.muted, display:"block", marginBottom:3 }}>
                          {label.toUpperCase()}
                        </label>
                        <input
                          type={type}
                          placeholder={placeholder}
                          step={type==="number" ? "0.1" : undefined}
                          style={{ ...inp(), padding:"8px 11px" }}
                          value={vForm[k]}
                          onChange={e => setVForm(p => ({ ...p, [k]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop:10 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:G.muted, display:"block", marginBottom:3 }}>NOTES</label>
                    <textarea
                      style={{ ...inp(), height:56, resize:"none" }}
                      placeholder="Observations, remarks…"
                      value={vForm.notes}
                      onChange={e => setVForm(p => ({ ...p, notes: e.target.value }))}
                    />
                  </div>

                  <button
                    onClick={saveVitals}
                    disabled={vBusy}
                    style={{
                      width:"100%", padding:"11px 0",
                      background: vBusy ? "#94A3B8" : G.green,
                      color:"white", border:"none", borderRadius:10,
                      fontSize:13.5, fontWeight:700,
                      cursor: vBusy ? "not-allowed" : "pointer",
                      marginTop:12,
                    }}
                  >
                    {vBusy ? "Saving…" : "💾 Save Vitals "}
                  </button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════ BLOOD REQUESTS TAB ══════════════ */}
        {tab === "blood" && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>

            {/* Visit-based blood requests */}
            <Card>
              <CardHead
                title={`Visit Blood Requests (${allVisitBRs.length})`}
                right={<Badge label={`${pendingVisitBRs} pending`} color={G.orange} bg={G.orangeL}/>}
              />
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <THead cols={["VISIT","PATIENT","DEPT","DOCTOR","BLOOD","UNITS","PRIORITY","STATUS","ACTION"]}/>
                  <tbody>
                    {allVisitBRs.map((br, i) => {
                      const brLabels = {
                        "Requested By Doctor": "Requested By Doctor",
                        "Sent to Blood Bank":  "Sent to Blood Bank",
                        Approved:              "Approved",
                        Fulfilled:             "Fulfilled",
                        Rejected:              "Rejected",
                      };
                      const brColors = {
                        "Requested By Doctor": { bg:G.orangeL, c:G.orange  },
                        "Sent to Blood Bank":  { bg:G.purpleL, c:G.purple  },
                        Approved:              { bg:G.blueL,   c:G.blue    },
                        Fulfilled:             { bg:G.greenL,  c:G.green   },
                        Rejected:              { bg:"#FEE2E2", c:"#B91C1C" },
                      };
                      const bc = brColors[br.status] || { bg:G.bg, c:G.muted };
                      return (
                        <tr
                          key={`${br.visit._id}-${br._id}`}
                          style={{ borderTop:`1px solid ${G.border}`, background: i%2===0 ? G.white : "#FAFBFC" }}
                        >
                          <td style={{ padding:"11px 14px", color:G.blue, fontWeight:700, fontSize:11.5 }}>{br.visit.visitId}</td>
                          <td style={{ padding:"11px 14px", fontWeight:700, color:G.navy }}>{br.visit.patientId?.name}</td>
                          <td style={{ padding:"11px 14px", color:G.muted }}>{br.visit.department}</td>
                          <td style={{ padding:"11px 14px", color:G.muted, fontSize:12.5 }}>{br.visit.doctorName}</td>
                          <td style={{ padding:"11px 14px" }}><Badge label={br.bloodGroup} color={G.red} bg={G.redL}/></td>
                          <td style={{ padding:"11px 14px", fontWeight:700 }}>{br.units}u</td>
                          <td style={{ padding:"11px 14px", fontSize:12, color:G.muted }}>{br.priority || "Normal"}</td>
                          <td style={{ padding:"11px 14px" }}>
                            <span style={{ background:bc.bg, color:bc.c, padding:"3px 9px", borderRadius:12, fontSize:10.5, fontWeight:700 }}>
                              {brLabels[br.status] || br.status}
                            </span>
                          </td>
                          <td style={{ padding:"11px 14px" }}>
                            {br.status === "Requested By Doctor" && (
                              <button
                                onClick={() => sendVisitBRToBank(br.visit._id, br._id)}
                                style={{ padding:"5px 11px", background:G.purple, color:"white", border:"none", borderRadius:7, fontSize:11.5, cursor:"pointer", fontWeight:700 }}
                              >📤 Send to Bank</button>
                            )}
                            {br.status === "Sent to Blood Bank" && <span style={{ fontSize:11.5, color:G.purple, fontWeight:600 }}>⏳ Awaiting</span>}
                            {br.status === "Approved"           && <span style={{ fontSize:11.5, color:G.blue,   fontWeight:600 }}>✔ Approved</span>}
                            {br.status === "Fulfilled"          && <span style={{ fontSize:11.5, color:G.green,  fontWeight:600 }}>✅ Fulfilled</span>}
                            {br.status === "Rejected"           && <span style={{ fontSize:11.5, color:"#B91C1C",fontWeight:600 }}>❌ Rejected</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {allVisitBRs.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ padding:"28px", textAlign:"center", color:G.muted }}>
                          No blood requests from visits yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════ BLOOD BANKS TAB ══════════════ */}
        {tab === "bloodbanks" && (
          <div style={{ display:"grid", gap:16 }}>
            {banks.map(bank => <BloodBankCard key={bank._id} bank={bank}/>)}
            {banks.length === 0 && (
              <div style={{ padding:"40px", textAlign:"center", color:G.muted, background:G.white, borderRadius:14, border:`1.5px solid ${G.border}` }}>
                No blood banks found.
              </div>
            )}
          </div>
        )}

        {/* ══════════════ PROFILE TAB ══════════════ */}
        {tab === "profile" && user && (
          <ProfileCard name={user.name} role={user.role} dept={user.department} email={user.email}/>
        )}
      </div>
    </div>
  );
}

// ── Blood bank card ──────────────────────────────────────────────────────
// ✅ Staff sees ONLY name, contact, address — NO stock/inventory
function BloodBankCard({ bank }) {
  const sc = bank.status === "Open 24/7"
    ? { c:"#0A7A50", bg:"#ECFDF5" }
    : { c:"#C2690A", bg:"#FFF7ED" };
  return (
    <div style={{ background:"white", border:`1.5px solid ${G.border}`, borderRadius:14, overflow:"hidden" }}>
      <div style={{
        padding:"15px 20px", borderBottom:`1px solid ${G.border}`,
        display:"flex", justifyContent:"space-between", alignItems:"center",
      }}>
        <div style={{ fontSize:14, fontWeight:700, color:G.navy }}>🏦 {bank.name}</div>
        <Badge label={bank.status} color={sc.c} bg={sc.bg}/>
      </div>
      <div style={{ padding:"18px 20px" }}>
        {/* ✅ Only contact info shown — NO stock grid */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, color:G.text }}>
            <span>📍</span>
            <span>{bank.location}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, color:G.text }}>
            <span>📞</span>
            <span>{bank.phone}</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:13.5, color:G.text }}>
            <span>🕐</span>
            <span>{bank.status}</span>
          </div>
        </div>
        <div style={{
          marginTop:14, background:G.blueL, border:`1px solid #BFDBFE`,
          borderRadius:9, padding:"10px 14px", fontSize:12.5, color:G.blue,
        }}>
          ℹ️ For stock and inventory details, contact the Blood Bank directly at{" "}
          <strong>{bank.phone}</strong>.
        </div>
      </div>
    </div>
  );
}