import { useWebSocket } from "../context/useWebSocket";
import { useCallback, useState, useEffect } from "react";
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
    errors.age = "Age must be 1–120.";
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
    errors.doctorName = "Please select a department first.";
  return errors;
}

const ACTIVE_STATUSES = ["WAITING", "IN_CONSULTATION", "ADMITTED", "SURGERY"];

const STATUS_COLORS = {
  WAITING:          { bg: "#FFF7ED", c: "#C2410C" },
  VITALS_PENDING:   { bg: "#FFF7ED", c: "#C2410C" },
  VITALS_COMPLETED: { bg: "#FEF9C3", c: "#92400E" },
  IN_CONSULTATION:  { bg: "#EFF6FF", c: "#1D4ED8" },
  COMPLETED:        { bg: "#DCFCE7", c: "#166534" },
  ADMITTED:         { bg: "#EDE9FE", c: "#5B21B6" },
  SURGERY:          { bg: "#F5F3FF", c: "#6D28D9" },
  DISCHARGED:       { bg: "#F0FDFA", c: "#0F766E" },
  Waiting:             { bg: "#FFF7ED", c: "#C2410C" },
  Admitted:            { bg: "#EDE9FE", c: "#5B21B6" },
  "Surgery Scheduled": { bg: "#F5F3FF", c: "#6D28D9" },
  Completed:           { bg: "#DCFCE7", c: "#166534" },
  Discharged:          { bg: "#F0FDFA", c: "#0F766E" },
};

const STATUS_LABELS = {
  WAITING:          "Waiting",
  VITALS_PENDING:   "Vitals Pending",
  VITALS_COMPLETED: "Vitals Completed",
  IN_CONSULTATION:  "In Consultation",
  COMPLETED:        "Completed",
  ADMITTED:         "Admitted",
  SURGERY:          "Surgery Scheduled",
  DISCHARGED:       "Discharged",
};

const SURGERY_STATUS_COLORS = {
  Scheduled:     { bg: "#EFF6FF", c: "#1D4ED8" },
  "In Progress": { bg: "#FEF9C3", c: "#92400E" },
  Completed:     { bg: "#DCFCE7", c: "#166534" },
  Cancelled:     { bg: "#FEE2E2", c: "#B91C1C" },
};

const BLOOD_STATUS_COLORS = {
  "Requested By Doctor": { bg: "#FFF7ED", c: "#C2410C" },
  "Sent to Blood Bank":  { bg: "#F5F3FF", c: "#6D28D9" },
  Approved:              { bg: "#EFF6FF", c: "#1D4ED8" },
  Fulfilled:             { bg: "#DCFCE7", c: "#166534" },
  Rejected:              { bg: "#FEE2E2", c: "#B91C1C" },
  Pending:               { bg: "#FFF7ED", c: "#C2410C" },
};

function getStatusStyle(status) {
  return STATUS_COLORS[status] || statusStyle(status) || { bg: "#F1F5F9", c: "#64748B" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: total blood units requested for a single surgery record
// Matches by surgeryId (preferred), falls back to surgeryType + visit matching
// ─────────────────────────────────────────────────────────────────────────────
function getBloodUnitsForSurgery(surgery, visits) {
  let bloodRequests = [];

  // Strategy 1: surgery has a direct visitId reference
  if (surgery.visitId) {
    const matchedVisit = visits.find(v => v._id === surgery.visitId || v.visitId === surgery.visitId);
    if (matchedVisit) bloodRequests = matchedVisit.bloodRequests || [];
  }

  // Strategy 2: match via surgeryType on visit
  if (!bloodRequests.length && surgery.surgeryType) {
    const matchedVisit = visits.find(v => v.surgeryType === surgery.surgeryType);
    if (matchedVisit) bloodRequests = matchedVisit.bloodRequests || [];
  }

  // Strategy 3: fallback — any visit in a surgery-related status (most recent first)
  if (!bloodRequests.length) {
    const fallbackVisit = [...visits]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .find(v => ["SURGERY", "ADMITTED", "DISCHARGED", "COMPLETED"].includes(v.status));
    if (fallbackVisit) bloodRequests = fallbackVisit.bloodRequests || [];
  }

  const totalUnits = bloodRequests.reduce((sum, br) => sum + (Number(br.units) || 0), 0);
  return { totalUnits, bloodRequests };
}

// ─────────────────────────────────────────────────────────────────────────────
// PatientDetailModal — full-screen overlay shown on patient ID click
// Used consistently from Patient List, Returning Patient, and Doctor Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export function PatientDetailModal({ patientId, onClose }) {
  const [patient,   setPatient]   = useState(null);
  const [visits,    setVisits]    = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!patientId) return;
    setLoading(true); setError("");

    const fetchAll = async () => {
      try {
        // Accept both Mongo _id and human-readable patientId (e.g. "PT-0001")
        const isMongoId = /^[a-f\d]{24}$/i.test(patientId);
        let pt;
        if (isMongoId) {
          const { data } = await axios.get(`/api/patients/${patientId}`);
          pt = data;
        } else {
          const { data } = await axios.get(`/api/patients/search?q=${encodeURIComponent(patientId)}`);
          pt = Array.isArray(data) ? data.find(p => p.patientId === patientId) || data[0] : data;
        }
        if (!pt) { setError("Patient not found."); setLoading(false); return; }
        setPatient(pt);

        const [visitsRes, surgeriesRes] = await Promise.all([
          axios.get(`/api/patients/${pt._id}/visits`).then(r => r.data).catch(() => []),
          axios.get(`/api/surgeries/patient/${pt.patientId}`).then(r => r.data).catch(() => ({})),
        ]);
        setVisits(Array.isArray(visitsRes) ? visitsRes : []);
        setSurgeries(Array.isArray(surgeriesRes.surgeries) ? surgeriesRes.surgeries : []);
      } catch {
        setError("Failed to load patient details.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [patientId]);

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const activeVisit = visits.find(v => ACTIVE_STATUSES.includes(v.status));
  const pastVisits  = visits.filter(v => v.status === "DISCHARGED" || v.status === "COMPLETED");

  const overlayStyle = {
    position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
    zIndex: 9999, display: "flex", alignItems: "flex-start",
    justifyContent: "center", padding: "32px 16px", overflowY: "auto",
  };

  const modalStyle = {
    background: G.white, borderRadius: 16, width: "100%", maxWidth: 860,
    boxShadow: "0 24px 64px rgba(0,0,0,0.18)", overflow: "hidden",
    fontFamily: "'DM Sans',sans-serif",
  };

  if (!patientId) return null;

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        {/* Modal Header */}
        <div style={{ background: G.navy, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: G.white }}>
              {loading ? "Loading…" : patient ? `${patient.name}` : "Patient Details"}
            </div>
            {patient && (
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                {patient.patientId} · {patient.age} yrs · {patient.gender} · {patient.bloodGroup}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: G.white, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✕ Close</button>
        </div>

        {loading && (
          <div style={{ padding: "60px", textAlign: "center", color: G.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div>Loading patient details…</div>
          </div>
        )}

        {error && (
          <div style={{ padding: "40px", textAlign: "center", color: "#B91C1C" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontWeight: 700 }}>{error}</div>
          </div>
        )}

        {!loading && !error && patient && (
          <>
            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: `1.5px solid ${G.border}`, background: "#F8FAFC" }}>
              {[
                { id: "overview",  label: "📋 Overview" },
                { id: "visits",    label: `🩺 Visits (${visits.length})` },
                { id: "surgeries", label: `🔪 Surgeries (${surgeries.length})` },
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                  padding: "12px 22px", background: "none", border: "none",
                  borderBottom: activeTab === t.id ? `2.5px solid ${G.navy}` : "2.5px solid transparent",
                  color: activeTab === t.id ? G.navy : G.muted,
                  fontWeight: activeTab === t.id ? 700 : 500,
                  fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ padding: "22px 24px", maxHeight: "70vh", overflowY: "auto" }}>

              {/* ── OVERVIEW TAB ── */}
              {activeTab === "overview" && (
                <>
                  {/* Patient info grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                    {[
                      { label: "Patient ID",   value: patient.patientId },
                      { label: "Name",         value: patient.name },
                      { label: "Age",          value: `${patient.age} years` },
                      { label: "Gender",       value: patient.gender },
                      { label: "Blood Group",  value: patient.bloodGroup },
                      { label: "Phone",        value: patient.phone || "—" },
                      { label: "Department",   value: patient.department || "—" },
                      { label: "Doctor",       value: patient.doctorName || "—" },
                      { label: "Registered",   value: new Date(patient.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) },
                    ].map(item => (
                      <div key={item.label} style={{ background: G.bg, borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 4 }}>{item.label.toUpperCase()}</div>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: G.navy }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Current status banner */}
                  {activeVisit && (() => {
                    const sc = STATUS_COLORS[activeVisit.status] || { bg: "#F1F5F9", c: "#64748B" };
                    return (
                      <div style={{ background: sc.bg, border: `1.5px solid ${sc.c}55`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: sc.c, marginBottom: 8 }}>⚡ CURRENT ACTIVE VISIT</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ color: G.blue, fontWeight: 700, fontSize: 13 }}>{activeVisit.visitId}</span>
                          <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}66`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                            {STATUS_LABELS[activeVisit.status] || activeVisit.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: G.navy, fontWeight: 700 }}>👨‍⚕️ {activeVisit.doctorName}</div>
                        <div style={{ fontSize: 12, color: G.muted, marginTop: 3 }}>🏥 {activeVisit.department}</div>
                        {activeVisit.complaints && <div style={{ fontSize: 12, color: G.text, marginTop: 6 }}><strong>Complaints:</strong> {activeVisit.complaints}</div>}
                      </div>
                    );
                  })()}

                  {/* Surgery summary with blood units */}
                  {surgeries.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: G.muted, marginBottom: 10 }}>SURGERY SUMMARY</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {surgeries.map((s, idx) => {
                          const { totalUnits } = getBloodUnitsForSurgery(s, visits);
                          const sc = SURGERY_STATUS_COLORS[s.status] || { bg: "#F1F5F9", c: "#64748B" };
                          return (
                            <div key={s._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: G.bg, borderRadius: 10, padding: "10px 14px", border: `1.5px solid ${G.border}` }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: G.muted }}>#{idx + 1}</span>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: G.navy }}>{s.surgeryType}</span>
                                <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}55`, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.status}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {totalUnits > 0 && (
                                  <span style={{ background: "#FFF7ED", color: "#C2410C", border: "1.5px solid #FED7AA", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                                    🩸 {totalUnits} units
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: G.muted }}>{new Date(s.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── VISITS TAB ── */}
              {activeTab === "visits" && (
                <>
                  {activeVisit && (() => {
                    const sc = STATUS_COLORS[activeVisit.status] || { bg: "#FFF7ED", c: "#C2410C" };
                    return (
                      <div style={{ background: sc.bg, border: `1.5px solid ${sc.c}55`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: sc.c, marginBottom: 8 }}>⚡ CURRENT ACTIVE VISIT</div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ color: G.blue, fontWeight: 700, fontSize: 13 }}>{activeVisit.visitId}</span>
                          <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}66`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                            {STATUS_LABELS[activeVisit.status] || activeVisit.status}
                          </span>
                          <span style={{ fontSize: 11, color: G.muted }}>{new Date(activeVisit.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        </div>
                        <div style={{ fontSize: 13, color: G.navy, fontWeight: 700, marginBottom: 2 }}>👨‍⚕️ {activeVisit.doctorName}</div>
                        <div style={{ fontSize: 12, color: G.muted }}>🏥 {activeVisit.department}</div>
                        {activeVisit.complaints && <div style={{ fontSize: 12, color: G.text, marginTop: 6 }}><strong>Complaints:</strong> {activeVisit.complaints}</div>}
                        {activeVisit.bloodRequests?.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: sc.c, marginBottom: 6 }}>🩸 BLOOD REQUESTS ({activeVisit.bloodRequests.length})</div>
                            {activeVisit.bloodRequests.map((br, i) => {
                              const bc = BLOOD_STATUS_COLORS[br.status] || { bg: "#F1F5F9", c: "#64748B" };
                              return (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: G.white, borderRadius: 8, padding: "7px 10px", border: `1px solid ${G.border}`, marginBottom: 5 }}>
                                  <Badge label={br.bloodGroup} color={G.red} bg={G.redL} />
                                  <span style={{ fontWeight: 700, fontSize: 12 }}>{br.units}u</span>
                                  {br.reason && <span style={{ fontSize: 11.5, color: G.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{br.reason}</span>}
                                  <span style={{ background: bc.bg, color: bc.c, padding: "2px 8px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{br.status}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div style={{ fontSize: 12, fontWeight: 700, color: G.muted, marginBottom: 10 }}>PAST VISITS ({pastVisits.length})</div>
                  {pastVisits.length === 0 ? (
                    <div style={{ padding: "28px", textAlign: "center", color: G.muted, background: G.white, borderRadius: 12, border: `1.5px solid ${G.border}` }}>
                      {visits.length === 0 ? "No visits yet." : "No completed or discharged visits."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {pastVisits.map(v => {
                        const isCompleted = v.status === "COMPLETED";
                        const badgeBg    = isCompleted ? "#DCFCE7" : "#F0FDFA";
                        const badgeColor = isCompleted ? "#166534" : "#0F766E";
                        const badgeLabel = isCompleted ? "Completed" : "Discharged";
                        const dateValue  = isCompleted ? v.completedAt : v.dischargedAt;
                        return (
                          <div key={v._id} style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 12, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                              <span style={{ color: G.blue, fontWeight: 700, fontSize: 12.5 }}>{v.visitId}</span>
                              <span style={{ background: badgeBg, color: badgeColor, padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{badgeLabel}</span>
                              <span style={{ fontSize: 11, color: G.muted }}>{new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                            </div>
                            <div style={{ fontSize: 12.5, color: G.muted, marginBottom: 4 }}>{v.department} · {v.doctorName}</div>
                            {v.complaints && <div style={{ fontSize: 12.5, color: G.text, marginBottom: 2 }}><strong>Complaints:</strong> {v.complaints}</div>}
                            {v.diagnosis  && <div style={{ fontSize: 12.5, color: G.text, marginBottom: 2 }}><strong>Dx:</strong> {v.diagnosis}</div>}
                            {v.treatment  && <div style={{ fontSize: 12.5, color: G.text, marginBottom: 2 }}><strong>Treatment:</strong> {v.treatment}</div>}
                            {dateValue    && <div style={{ fontSize: 11, color: badgeColor, marginTop: 5, fontWeight: 600 }}>{badgeLabel}: {new Date(dateValue).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── SURGERIES TAB ── */}
              {activeTab === "surgeries" && (
                <>
                  {surgeries.length === 0 ? (
                    <div style={{ padding: "40px", textAlign: "center", color: G.muted, background: G.white, borderRadius: 12, border: `1.5px solid ${G.border}` }}>
                      <div style={{ fontSize: 36, marginBottom: 10 }}>🔪</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: G.navy, marginBottom: 6 }}>No surgeries on record</div>
                      <div style={{ fontSize: 13 }}>Surgeries scheduled by the doctor will appear here.</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {surgeries.map((s, idx) => {
                        const sc = SURGERY_STATUS_COLORS[s.status] || { bg: "#F1F5F9", c: "#64748B" };
                        const { totalUnits, bloodRequests } = getBloodUnitsForSurgery(s, visits);

                        return (
                          <div key={s._id} style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 13, overflow: "hidden" }}>
                            {/* Surgery card header */}
                            <div style={{ background: sc.bg, borderBottom: `1.5px solid ${G.border}`, padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: G.muted }}>SURGERY {idx + 1}</span>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: G.navy }}>{s.surgeryType}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {/* ── Blood units badge prominently shown ── */}
                                <span style={{
                                  background: totalUnits > 0 ? "#FFF7ED" : G.bg,
                                  color:      totalUnits > 0 ? "#C2410C" : G.muted,
                                  border:     `1.5px solid ${totalUnits > 0 ? "#FED7AA" : G.border}`,
                                  padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                                }}>
                                  🩸 {totalUnits > 0 ? `${totalUnits} units` : "No blood req."}
                                </span>
                                <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}55`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.status}</span>
                              </div>
                            </div>

                            {/* Surgery details */}
                            <div style={{ padding: "12px 16px" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                                <div style={{ background: G.bg, borderRadius: 8, padding: "8px 10px" }}>
                                  <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 3 }}>DEPARTMENT</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: G.navy }}>{s.department}</div>
                                </div>
                                <div style={{ background: G.bg, borderRadius: 8, padding: "8px 10px" }}>
                                  <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 3 }}>DOCTOR</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: G.navy }}>👨‍⚕️ {s.doctorName}</div>
                                </div>
                                <div style={{ background: G.bg, borderRadius: 8, padding: "8px 10px" }}>
                                  <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 3 }}>SCHEDULED</div>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: G.navy }}>{new Date(s.scheduledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                                </div>
                              </div>

                              {s.notes && <div style={{ fontSize: 12.5, color: G.text, background: "#F8FAFC", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>📝 {s.notes}</div>}

                              {/* Blood requests breakdown */}
                              {bloodRequests.length > 0 ? (
                                <div style={{ background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 10, padding: "10px 13px" }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#C2410C", marginBottom: 8 }}>
                                    🩸 BLOOD REQUESTS — {totalUnits} total units ({bloodRequests.length} request{bloodRequests.length > 1 ? "s" : ""})
                                  </div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {bloodRequests.map((br, i) => {
                                      const bc = BLOOD_STATUS_COLORS[br.status] || { bg: "#F1F5F9", c: "#64748B" };
                                      return (
                                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: G.white, borderRadius: 8, padding: "7px 10px", border: `1px solid ${G.border}` }}>
                                          <Badge label={br.bloodGroup} color={G.red} bg={G.redL} />
                                          <span style={{ fontWeight: 700, fontSize: 12.5 }}>{br.units}u</span>
                                          {br.reason && <span style={{ fontSize: 11.5, color: G.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{br.reason}</span>}
                                          <span style={{ background: bc.bg, color: bc.c, padding: "2px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{br.status}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: 12, color: G.muted, background: "#F8FAFC", borderRadius: 8, padding: "8px 12px" }}>
                                  🩸 No blood request for this surgery
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Clickable Patient ID — renders as a styled link, opens modal on click
// ─────────────────────────────────────────────────────────────────────────────
function ClickablePatientId({ patientId, mongoId, onOpen }) {
  return (
    <span
      onClick={() => onOpen(mongoId || patientId)}
      title={`Click to view details for ${patientId}`}
      style={{
        color: G.blue, fontWeight: 700, fontSize: 12,
        cursor: "pointer", textDecoration: "underline",
        textDecorationStyle: "dotted", textUnderlineOffset: 3,
      }}
    >
      {patientId}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
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
  const [counts,     setCounts]     = useState({ waiting: 0, admitted: 0, surgery: 0, discharged: 0, completed: 0 });

  // Patient detail modal state
  const [modalPatientId, setModalPatientId] = useState(null);

  const openModal  = (id) => setModalPatientId(id);
  const closeModal = ()   => setModalPatientId(null);

  const INIT = {
    name: "", age: "", gender: "Male", phone: "",
    bloodGroup: "A+", symptoms: "", department: "", doctorName: "",
  };
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

  const fetchPatients = useCallback((pageNum = 1, searchVal = "") => {
    const params = new URLSearchParams();
    if (searchVal) params.append("search", searchVal);
    params.append("page", pageNum);
    axios.get(`/api/patients?${params}`)
      .then(r => {
        if (r.data.data) {
          setPatients(r.data.data);
          setPagination(r.data.pagination);
          setPage(r.data.pagination.page);
          setCounts({
            waiting:    r.data.counts?.waiting    || 0,
            admitted:   r.data.counts?.admitted   || 0,
            surgery:    r.data.counts?.surgery    || 0,
            discharged: r.data.counts?.discharged || 0,
            completed:  r.data.counts?.completed  || 0,
          });
        } else {
          setPatients(r.data);
          setPagination({});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    axios.get("/api/users/me").then(r => setUser(r.data)).catch(() => {});
    fetchPatients(1, "");
  }, [fetchPatients]);

  useWebSocket(useCallback((msg) => {
    const syncTypes = [
      "VISIT_STATUS_CHANGED", "VISIT_UPDATED", "VITALS_UPDATED",
      "NEW_VISIT", "BLOOD_REQUEST_SENT",
    ];
    if (syncTypes.includes(msg.type)) fetchPatients(page, search);
  }, [page, search, fetchPatients]));

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
      setSuccess(`✅ Patient registered! ID: ${patient.patientId}${visitInfo}`);
      setForm(INIT); setErrors({}); setTouched({}); setPage(1);
      fetchPatients(1, "");
      setTimeout(() => setSuccess(""), 6000);
    } catch (e) {
      setSuccess("❌ " + (e.response?.data?.message || "Registration failed"));
    } finally { setBusy(false); }
  };

  const totalPatients =
    counts.waiting + counts.admitted + counts.surgery + counts.discharged + counts.completed;

  const tabs = [
    { id: "register",  icon: "➕", label: "OP Registration" },
    { id: "returning", icon: "🔄", label: "Patient" },
    { id: "patients",  icon: "👥", label: "Patient List", badge: counts.waiting > 0 ? counts.waiting : undefined },
    { id: "profile",   icon: "👤", label: "My Profile" },
  ];

  const fStyle = (field, extra = {}) => ({
    ...inp(extra),
    marginBottom: errors[field] && touched[field] ? 4 : 13,
    border: errors[field] && touched[field] ? "1.5px solid #EF4444" : `1.5px solid ${G.border}`,
    background: errors[field] && touched[field] ? "#FFF5F5" : G.white,
  });

  const ErrMsg = ({ field }) =>
    errors[field] && touched[field] ? (
      <div style={{ color: "#EF4444", fontSize: 11.5, fontWeight: 600, marginBottom: 10 }}>⚠ {errors[field]}</div>
    ) : null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: G.bg, fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Patient Detail Modal */}
      {modalPatientId && <PatientDetailModal patientId={modalPatientId} onClose={closeModal} />}

      <Sidebar role="Receptionist" name={user?.name || "Receptionist"} tab={tab} setTab={setTab} onLogout={onLogout} tabs={tabs} />
      <div style={{ marginLeft: 258, flex: 1, padding: 28 }}>
        <PageHeader
          title={tab === "register" ? "➕ OP Registration" : tab === "returning" ? "🔄  Patient" : tab === "patients" ? "👥 Registered Patients" : "👤 My Profile"}
          sub="HealthCare Hospital · Reception Desk"
        />

        {/* Stats */}
        <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
          <Stat icon="🧑‍🦽" label="Total Patients"   value={totalPatients}     color={G.navy} />
          <Stat icon="⏳"   label="Waiting"           value={counts.waiting}    color={G.orange} bg={G.orangeL} />
          <Stat icon="🏥"   label="Admitted"          value={counts.admitted}   color={G.blue}   bg={G.blueL} />
          <Stat icon="🔪"   label="Surgery Scheduled" value={counts.surgery}    color="#6D28D9"  bg="#F5F3FF" />
          <Stat icon="✅"   label="Completed"         value={counts.completed}  color="#166534"  bg="#DCFCE7" />
          <Stat icon="🚪"   label="Discharged"        value={counts.discharged} color="#0F766E"  bg="#F0FDFA" />
        </div>

        {/* REGISTER TAB */}
        {tab === "register" && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 22 }}>
            <Card>
              <CardHead title="New Patient Registration" />
              <div style={{ padding: 22 }}>
                {success && (
                  <div style={{ background: success.startsWith("❌") ? G.redL : G.greenL, border: `1px solid ${success.startsWith("❌") ? "#FECACA" : "#A7F3D0"}`, borderRadius: 9, padding: "11px 14px", color: success.startsWith("❌") ? G.red : G.green, fontWeight: 600, fontSize: 13, marginBottom: 16 }}>{success}</div>
                )}
                <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 5 }}>PATIENT NAME *</label>
                <input style={fStyle("name")} placeholder="Full name" value={form.name} onChange={e => set("name", e.target.value)} onBlur={() => touch("name")} />
                <ErrMsg field="name" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>AGE *</label>
                    <input style={{ ...inp(), border: errors.age && touched.age ? "1.5px solid #EF4444" : `1.5px solid ${G.border}`, background: errors.age && touched.age ? "#FFF5F5" : G.white }} type="number" placeholder="1–120" min={1} max={120} value={form.age} onChange={e => set("age", e.target.value)} onBlur={() => touch("age")} />
                    {errors.age && touched.age && <div style={{ color: "#EF4444", fontSize: 10.5, fontWeight: 600, marginTop: 2 }}>⚠ {errors.age}</div>}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>GENDER *</label>
                    <select style={{ ...inp(), border: errors.gender && touched.gender ? "1.5px solid #EF4444" : `1.5px solid ${G.border}` }} value={form.gender} onChange={e => set("gender", e.target.value)} onBlur={() => touch("gender")}>
                      <option value="">Select</option><option>Male</option><option>Female</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>BLOOD GROUP *</label>
                    <select style={inp()} value={form.bloodGroup} onChange={e => set("bloodGroup", e.target.value)}>
                      {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 13 }} />
                <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 5 }}>PHONE NUMBER *</label>
                <input style={fStyle("phone")} placeholder="Phone number" value={form.phone} onChange={e => set("phone", e.target.value.replace(/[^0-9+\s]/g, ""))} onBlur={() => touch("phone")} maxLength={13} />
                <ErrMsg field="phone" />
                <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>SYMPTOMS / COMPLAINT *</label>
                <textarea style={{ ...inp(), height: 80, resize: "vertical", marginBottom: errors.symptoms && touched.symptoms ? 4 : 13, border: errors.symptoms && touched.symptoms ? "1.5px solid #EF4444" : `1.5px solid ${G.border}`, background: errors.symptoms && touched.symptoms ? "#FFF5F5" : G.white }} placeholder="Describe symptoms or complaint" value={form.symptoms} onChange={e => set("symptoms", e.target.value)} onBlur={() => touch("symptoms")} />
                <ErrMsg field="symptoms" />
                <button onClick={registerPatient} disabled={busy} style={{ width: "100%", padding: "12px 0", background: busy ? "#94A3B8" : G.red, color: "white", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}>
                  {busy ? "Registering…" : "🏥 Register Patient"}
                </button>
              </div>
            </Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card>
                <CardHead title="Assign Department & Doctor" />
                <div style={{ padding: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 5 }}>DEPARTMENT *</label>
                  <select
                    style={{ ...inp(), marginBottom: errors.department && touched.department ? 4 : 14, border: errors.department && touched.department ? "1.5px solid #EF4444" : `1.5px solid ${G.border}`, background: errors.department && touched.department ? "#FFF5F5" : G.white }}
                    value={form.department}
                    onChange={e => { const dept = e.target.value; const doc = DOCTOR_BY_DEPT[dept] || ""; setForm(p => ({ ...p, department: dept, doctorName: doc })); if (touched.department) { const ne = validate({ ...form, department: dept, doctorName: doc }); setErrors(er => ({ ...er, department: ne.department, doctorName: ne.doctorName })); } }}
                    onBlur={() => touch("department")}>
                    <option value="">Select Department</option>
                    {DEPTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                  {errors.department && touched.department && <div style={{ color: "#EF4444", fontSize: 11.5, fontWeight: 600, marginBottom: 10 }}>⚠ {errors.department}</div>}
                  <label style={{ fontSize: 11, fontWeight: 700, color: G.muted, display: "block", marginBottom: 5 }}>ASSIGNED DOCTOR *</label>
                  <input style={{ ...inp(), marginBottom: 14, opacity: form.department ? 1 : 0.45, background: G.bg }} value={form.doctorName} readOnly placeholder="Select dept first" />
                  {form.department && form.doctorName && (
                    <div style={{ background: G.blueL, border: `1px solid ${G.blue}22`, borderRadius: 10, padding: "13px 14px" }}>
                      <div style={{ fontSize: 10, color: G.blue, fontWeight: 700, marginBottom: 5 }}>DOCTOR</div>
                      <div style={{ fontSize: 13.5, color: G.navy, fontWeight: 700 }}>👨‍⚕️ {form.doctorName}</div>
                      <div style={{ fontSize: 12.5, color: G.muted, marginTop: 3 }}>🏥 {form.department}</div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {tab === "returning" && <ReturningPatient onVisitCreated={() => fetchPatients(1, "")} onOpenPatient={openModal} />}

        {/* PATIENT LIST TAB */}
        {tab === "patients" && (
          <Card>
            <CardHead title={`All Patients (${totalPatients})`} right={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input style={{ ...inp({ width: 320, marginBottom: 0, padding: "7px 14px", fontSize: 13 }) }} placeholder="🔍 Search by name, ID, phone, dept…" value={search} onChange={handleSearch} />
                {search && <button onClick={() => { setSearch(""); setPage(1); fetchPatients(1, ""); }} style={{ padding: "7px 12px", background: "#FEE2E2", color: "#B91C1C", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✕</button>}
              </div>
            } />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <THead cols={["PATIENT ID", "NAME", "AGE / SEX", "BLOOD", "PHONE", "DEPARTMENT", "DOCTOR", "STATUS", "REGISTERED"]} />
                <tbody>
                  {patients.map((p, i) => {
                    const sc = getStatusStyle(p.status);
                    return (
                      <tr key={p._id} style={{ borderTop: `1px solid ${G.border}`, background: i % 2 === 0 ? G.white : "#FAFBFC" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <ClickablePatientId patientId={p.patientId} mongoId={p._id} onOpen={openModal} />
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 700, color: G.navy }}>{p.name}</td>
                        <td style={{ padding: "12px 16px", color: G.muted, fontSize: 13 }}>{p.age} / {p.gender?.[0]}</td>
                        <td style={{ padding: "12px 16px" }}><Badge label={p.bloodGroup} color={G.red} bg={G.redL} /></td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: G.muted }}>{p.phone || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13 }}>{p.department}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: G.muted }}>{p.doctorName}</td>
                        <td style={{ padding: "12px 16px" }}><Badge label={p.status} color={sc.c} bg={sc.bg} /></td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: G.muted }}>{new Date(p.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {patients.length === 0 && <div style={{ padding: "36px", textAlign: "center", color: G.muted }}>{totalPatients === 0 ? "No patients registered yet." : `No results for "${search}".`}</div>}
            </div>
            {pagination.totalPages && pagination.totalPages > 1 && (
              <div style={{ padding: "16px 20px", borderTop: `1px solid ${G.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button disabled={page <= 1} onClick={() => fetchPatients(page - 1, search)} style={{ padding: "10px 20px", background: page > 1 ? G.navy : "#CBD5E1", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: page > 1 ? "pointer" : "not-allowed" }}>← Previous</button>
                  <button disabled={page >= pagination.totalPages} onClick={() => fetchPatients(page + 1, search)} style={{ padding: "10px 20px", background: page < pagination.totalPages ? G.red : "#CBD5E1", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: page < pagination.totalPages ? "pointer" : "not-allowed" }}>Next →</button>
                </div>
                <span style={{ fontSize: 12, color: G.muted }}>Page {page} of {pagination.totalPages}</span>
              </div>
            )}
          </Card>
        )}

        {tab === "profile" && user && <ProfileCard name={user.name} role={user.role} dept={user.department} email={user.email} />}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ReturningPatient
// ══════════════════════════════════════════════════════════════════════════
function ReturningPatient({ onVisitCreated, onOpenPatient }) {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState([]);
  const [selPt,      setSelPt]      = useState(null);
  const [visits,     setVisits]     = useState([]);
  const [dept,       setDept]       = useState("");
  const [doctor,     setDoctor]     = useState("");
  const [complaints, setComplaints] = useState("");
  const [msg,        setMsg]        = useState("");
  const [loading,    setLoading]    = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [surgeries,  setSurgeries]  = useState([]);
  const [surLoad,    setSurLoad]    = useState(false);
  const [rightTab,   setRightTab]   = useState("visits");

  const activeVisit = visits.find(v => ACTIVE_STATUSES.includes(v.status));
  const pastVisits  = visits.filter(v => v.status === "DISCHARGED" || v.status === "COMPLETED");

  const loadSurgeries = async (patientIdStr) => {
    if (!patientIdStr) return;
    setSurLoad(true);
    try {
      const { data } = await axios.get(`/api/surgeries/patient/${patientIdStr}`);
      setSurgeries(Array.isArray(data.surgeries) ? data.surgeries : []);
    } catch { setSurgeries([]); }
    finally { setSurLoad(false); }
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setSelPt(null); setVisits([]); setSurgeries([]);
    setRightTab("visits"); setMsg(""); setResults([]); setDept(""); setDoctor(""); setComplaints("");
    try {
      const { data } = await axios.get(`/api/patients/search?q=${encodeURIComponent(query)}`);
      setResults(data);
      if (data.length === 0) setMsg("⚠ No patients found for this search.");
    } catch { setMsg("❌ Search failed. Please try again."); }
    finally { setLoading(false); }
  };

  const selectPatient = async (pt) => {
    setSelPt(pt); setMsg(""); setDept(""); setDoctor(""); setComplaints(""); setSurgeries([]); setRightTab("visits");
    try {
      const { data } = await axios.get(`/api/patients/${pt._id}/visits`);
      setVisits(Array.isArray(data) ? data : []);
    } catch { setVisits([]); }
    loadSurgeries(pt.patientId);
  };

  const autoDept = (d) => { setDept(d); setDoctor(DOCTOR_BY_DEPT[d] || ""); };

  const createVisit = async () => {
    if (!dept)        { setMsg("❌ Please select a department."); return; }
    if (!doctor)      { setMsg("❌ No doctor found for selected department."); return; }
    if (activeVisit)  { setMsg("❌ Patient already has an active visit. Cannot start a new visit until discharged."); return; }
    setCreating(true); setMsg("");
    try {
      const doctorsRes = await axios.get("/api/users/doctors");
      const doctorUser = doctorsRes.data.find(d => d.name === doctor);
      const { data }   = await axios.post("/api/visits", { patientId: selPt._id, patientRef: selPt.patientId, doctorId: doctorUser?._id, doctorName: doctor, department: dept, complaints });
      setMsg(`✅ Visit ${data.visitId} created for ${selPt.name}. Patient is now Waiting.`);
      const updatedVisits = await axios.get(`/api/patients/${selPt._id}/visits`).then(r => r.data).catch(() => []);
      setVisits(Array.isArray(updatedVisits) ? updatedVisits : []);
      const freshPt = await axios.get(`/api/patients/${selPt._id}`).then(r => r.data).catch(() => selPt);
      setSelPt(freshPt);
      if (onVisitCreated) onVisitCreated();
      setDept(""); setDoctor(""); setComplaints("");
    } catch (e) { setMsg("❌ " + (e.response?.data?.message || "Failed to create visit.")); }
    finally { setCreating(false); }
  };

  const PatientSummaryCard = () => {
    if (!selPt) return null;
    const sc = activeVisit ? (STATUS_COLORS[activeVisit.status] || { bg: "#F1F5F9", c: "#64748B" }) : null;
    return (
      <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: G.navy, marginBottom: 2 }}>{selPt.name}</div>
            {/* Clickable patient ID in summary card */}
            <div style={{ fontSize: 11.5, color: G.muted }}>
              {onOpenPatient ? (
                <span onClick={() => onOpenPatient(selPt._id)} style={{ color: G.blue, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3, fontWeight: 700 }}>{selPt.patientId}</span>
              ) : selPt.patientId} · {selPt.phone}
            </div>
          </div>
          <Badge label={selPt.bloodGroup} color={G.red} bg={G.redL} />
        </div>
        <div style={{ display: "flex", gap: 18, marginBottom: activeVisit ? 12 : 0 }}>
          <span style={{ fontSize: 12, color: G.muted }}><strong style={{ color: G.text }}>Age:</strong> {selPt.age}</span>
          <span style={{ fontSize: 12, color: G.muted }}><strong style={{ color: G.text }}>Gender:</strong> {selPt.gender}</span>
          <span style={{ fontSize: 12, color: G.muted }}><strong style={{ color: G.text }}>Dept:</strong> {selPt.department || "—"}</span>
        </div>
        {activeVisit && sc && (
          <div style={{ background: sc.bg, border: `1.5px solid ${sc.c}44`, borderRadius: 9, padding: "10px 13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: G.muted }}>CURRENT STATUS</span>
              <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}66`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{STATUS_LABELS[activeVisit.status] || activeVisit.status}</span>
            </div>
            <div style={{ fontSize: 13, color: G.navy, fontWeight: 700 }}>👨‍⚕️ {activeVisit.doctorName || selPt.doctorName || "—"}</div>
            <div style={{ fontSize: 11.5, color: G.muted, marginTop: 3 }}>🏥 {activeVisit.department} · Visit: {activeVisit.visitId}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20 }}>

      {/* LEFT PANEL */}
      <div>
        <Card>
          <CardHead title="Search Existing Patient" />
          <div style={{ padding: 18 }}>
            <input style={{ ...inp(), marginBottom: 10 }} placeholder="Name, phone, or patient ID…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && doSearch()} />
            <button onClick={doSearch} disabled={loading} style={{ width: "100%", padding: "9px 0", background: G.navy, color: "white", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
              {loading ? "Searching…" : "🔍 Search"}
            </button>
            {msg && !selPt && <div style={{ fontSize: 12.5, color: G.muted, textAlign: "center", padding: "8px 0" }}>{msg}</div>}
            {results.map(pt => (
              <div key={pt._id} onClick={() => selectPatient(pt)} style={{ padding: "9px 11px", background: selPt?._id === pt._id ? G.blueL : G.bg, borderRadius: 8, marginBottom: 5, cursor: "pointer", border: selPt?._id === pt._id ? `1.5px solid ${G.blue}` : "1.5px solid transparent" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: G.navy }}>{pt.name}</div>
                <div style={{ fontSize: 11.5, color: G.muted }}>{pt.patientId} · {pt.phone}</div>
              </div>
            ))}
          </div>
        </Card>

        {selPt && (
          <Card style={{ marginTop: 14 }}>
            <CardHead title={activeVisit ? "Active Visit" : "Start New Visit"} />
            <div style={{ padding: 16 }}>
              <PatientSummaryCard />
              {activeVisit && (
                <div style={{ background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 9, padding: "11px 13px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#C2410C", marginBottom: 4 }}>⚠ Active Visit In Progress</div>
                  <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.55 }}>This patient currently has an active visit</div>
                </div>
              )}
              {!activeVisit && (
                <>
                  {msg && <div style={{ background: msg.startsWith("✅") ? G.greenL : G.redL, border: `1px solid ${msg.startsWith("✅") ? "#A7F3D0" : "#FECACA"}`, borderRadius: 8, padding: "9px 12px", color: msg.startsWith("✅") ? G.green : G.red, fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>{msg}</div>}
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>DEPARTMENT *</label>
                  <select style={{ ...inp(), marginBottom: 11 }} value={dept} onChange={e => autoDept(e.target.value)}>
                    <option value="">Select Department</option>
                    {DEPTS.map(d => <option key={d}>{d}</option>)}
                  </select>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>ASSIGNED DOCTOR</label>
                  <input style={{ ...inp(), background: G.bg, marginBottom: 11 }} value={doctor} readOnly placeholder="Auto-filled after dept selection" />
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>COMPLAINTS</label>
                  <textarea style={{ ...inp(), height: 64, resize: "none", marginBottom: 12 }} placeholder="Describe complaint…" value={complaints} onChange={e => setComplaints(e.target.value)} />
                  <button onClick={createVisit} disabled={creating} style={{ width: "100%", padding: "10px 0", background: creating ? "#94A3B8" : G.red, color: "white", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer" }}>
                    {creating ? "Creating…" : "🔄 Start New Visit"}
                  </button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* RIGHT PANEL */}
      <div>
        {selPt ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, color: G.navy, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>📁 {selPt.name} — History</span>
              {onOpenPatient && (
                <button onClick={() => onOpenPatient(selPt._id)} style={{ padding: "6px 14px", background: G.blueL, color: G.blue, border: `1.5px solid ${G.blue}33`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  🔍 Full Details
                </button>
              )}
            </div>

            {/* Tab switcher */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { id: "visits",    label: `🩺 Visits (${visits.length})` },
                { id: "surgeries", label: `🔪 Surgeries (${surgeries.length})` },
              ].map(t => (
                <button key={t.id} onClick={() => setRightTab(t.id)} style={{ padding: "7px 20px", background: rightTab === t.id ? G.navy : G.white, color: rightTab === t.id ? G.white : G.text, border: `1.5px solid ${rightTab === t.id ? G.navy : G.border}`, borderRadius: 20, fontSize: 13, fontWeight: rightTab === t.id ? 700 : 500, cursor: "pointer" }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* VISITS TAB */}
            {rightTab === "visits" && (
              <>
                {activeVisit && (() => {
                  const sc = STATUS_COLORS[activeVisit.status] || { bg: "#FFF7ED", c: "#C2410C" };
                  return (
                    <div style={{ background: sc.bg, border: `1.5px solid ${sc.c}55`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: sc.c, marginBottom: 8 }}>⚡ CURRENT ACTIVE VISIT</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ color: G.blue, fontWeight: 700, fontSize: 13 }}>{activeVisit.visitId}</span>
                        <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}66`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{STATUS_LABELS[activeVisit.status] || activeVisit.status}</span>
                        <span style={{ fontSize: 11, color: G.muted }}>{new Date(activeVisit.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      </div>
                      <div style={{ fontSize: 13, color: G.navy, fontWeight: 700, marginBottom: 2 }}>👨‍⚕️ {activeVisit.doctorName}</div>
                      <div style={{ fontSize: 12, color: G.muted }}>🏥 {activeVisit.department}</div>
                      {activeVisit.complaints && <div style={{ fontSize: 12, color: G.text, marginTop: 6 }}><strong>Complaints:</strong> {activeVisit.complaints}</div>}
                      {activeVisit.bloodRequests?.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: sc.c, marginBottom: 6 }}>🩸 BLOOD REQUESTS ({activeVisit.bloodRequests.length})</div>
                          {activeVisit.bloodRequests.map((br, i) => {
                            const bc = BLOOD_STATUS_COLORS[br.status] || { bg: "#F1F5F9", c: "#64748B" };
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: G.white, borderRadius: 8, padding: "7px 10px", border: `1px solid ${G.border}`, marginBottom: 5 }}>
                                <Badge label={br.bloodGroup} color={G.red} bg={G.redL} />
                                <span style={{ fontWeight: 700, fontSize: 12 }}>{br.units}u</span>
                                {br.reason && <span style={{ fontSize: 11.5, color: G.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{br.reason}</span>}
                                <span style={{ background: bc.bg, color: bc.c, padding: "2px 8px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{br.status}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={{ fontSize: 12, fontWeight: 700, color: G.muted, marginBottom: 10 }}>PAST VISITS ({pastVisits.length})</div>
                {pastVisits.length === 0 ? (
                  <div style={{ padding: "28px", textAlign: "center", color: G.muted, background: G.white, borderRadius: 12, border: `1.5px solid ${G.border}` }}>
                    {visits.length === 0 ? "No visits yet. Start the first visit using the panel on the left." : "No past visits yet. History shows completed and discharged visits."}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {pastVisits.map(v => {
                      const isCompleted = v.status === "COMPLETED";
                      const badgeBg    = isCompleted ? "#DCFCE7" : "#F0FDFA";
                      const badgeColor = isCompleted ? "#166534" : "#0F766E";
                      const badgeLabel = isCompleted ? "Completed" : "Discharged";
                      const dateValue  = isCompleted ? v.completedAt : v.dischargedAt;
                      return (
                        <div key={v._id} style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 12, padding: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                            <span style={{ color: G.blue, fontWeight: 700, fontSize: 12.5 }}>{v.visitId}</span>
                            <span style={{ background: badgeBg, color: badgeColor, padding: "3px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{badgeLabel}</span>
                            <span style={{ fontSize: 11, color: G.muted }}>{new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: G.muted, marginBottom: 4 }}>{v.department} · {v.doctorName}</div>
                          {v.complaints && <div style={{ fontSize: 12.5, color: G.text, marginBottom: 2 }}><strong>Complaints:</strong> {v.complaints}</div>}
                          {v.diagnosis  && <div style={{ fontSize: 12.5, color: G.text, marginBottom: 2 }}><strong>Dx:</strong> {v.diagnosis}</div>}
                          {v.treatment  && <div style={{ fontSize: 12.5, color: G.text, marginBottom: 2 }}><strong>Treatment:</strong> {v.treatment}</div>}
                          {dateValue    && <div style={{ fontSize: 11, color: badgeColor, marginTop: 5, fontWeight: 600 }}>{badgeLabel}: {new Date(dateValue).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* SURGERIES TAB — now with blood unit counts */}
            {rightTab === "surgeries" && (
              <>
                {surLoad ? (
                  <div style={{ padding: "40px", textAlign: "center", color: G.muted, background: G.white, borderRadius: 12, border: `1.5px solid ${G.border}` }}>Loading surgeries…</div>
                ) : surgeries.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: G.muted, background: G.white, borderRadius: 12, border: `1.5px solid ${G.border}` }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🔪</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: G.navy, marginBottom: 6 }}>No surgeries on record</div>
                    <div style={{ fontSize: 13 }}>Surgeries scheduled by the doctor will appear here.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {surgeries.map((s, idx) => {
                      const sc = SURGERY_STATUS_COLORS[s.status] || { bg: "#F1F5F9", c: "#64748B" };
                      const { totalUnits, bloodRequests: brs } = getBloodUnitsForSurgery(s, visits);

                      return (
                        <div key={s._id} style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 13, overflow: "hidden" }}>
                          {/* Header with blood units count */}
                          <div style={{ background: sc.bg, borderBottom: `1.5px solid ${G.border}`, padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: G.muted }}>SURGERY {idx + 1}</span>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: G.navy }}>{s.surgeryType}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {/* ── Blood units pill — always visible ── */}
                              <span style={{
                                background: totalUnits > 0 ? "#FFF7ED" : G.bg,
                                color:      totalUnits > 0 ? "#C2410C" : G.muted,
                                border:     `1.5px solid ${totalUnits > 0 ? "#FED7AA" : G.border}`,
                                padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                              }}>
                                🩸 {totalUnits > 0 ? `${totalUnits} units` : "No blood req."}
                              </span>
                              <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}55`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.status}</span>
                            </div>
                          </div>

                          {/* Body */}
                          <div style={{ padding: "12px 16px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                              <div style={{ background: G.bg, borderRadius: 8, padding: "8px 10px" }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 3 }}>DEPARTMENT</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: G.navy }}>{s.department}</div>
                              </div>
                              <div style={{ background: G.bg, borderRadius: 8, padding: "8px 10px" }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 3 }}>DOCTOR</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: G.navy }}>👨‍⚕️ {s.doctorName}</div>
                              </div>
                              <div style={{ background: G.bg, borderRadius: 8, padding: "8px 10px" }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 3 }}>SCHEDULED</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: G.navy }}>{new Date(s.scheduledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                              </div>
                            </div>

                            {s.notes && <div style={{ fontSize: 12.5, color: G.text, background: "#F8FAFC", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>📝 {s.notes}</div>}

                            {/* Blood requests breakdown */}
                            {brs.length > 0 ? (
                              <div style={{ background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 10, padding: "10px 13px" }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#C2410C", marginBottom: 8 }}>
                                  🩸 BLOOD REQUESTS — {totalUnits} total units
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {brs.map((br, i) => {
                                    const bc = BLOOD_STATUS_COLORS[br.status] || { bg: "#F1F5F9", c: "#64748B" };
                                    return (
                                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: G.white, borderRadius: 8, padding: "7px 10px", border: `1px solid ${G.border}` }}>
                                        <Badge label={br.bloodGroup} color={G.red} bg={G.redL} />
                                        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{br.units}u</span>
                                        {br.reason && <span style={{ fontSize: 11.5, color: G.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{br.reason}</span>}
                                        <span style={{ background: bc.bg, color: bc.c, padding: "2px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{br.status}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: G.muted, background: "#F8FAFC", borderRadius: 8, padding: "8px 12px" }}>
                                🩸 No blood request for this surgery
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div style={{ padding: "52px 40px", textAlign: "center", color: G.muted, background: G.white, borderRadius: 12, border: `1.5px solid ${G.border}` }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>🔍</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: G.navy, marginBottom: 6 }}>Search for a Patient</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>Use the search panel on the left to find a patient by<br />name, phone number, or patient ID.</div>
          </div>
        )}
      </div>
    </div>
  );
}