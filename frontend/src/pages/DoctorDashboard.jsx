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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const VISIT_STATUS_LABELS = {
  WAITING:          "Waiting",
  VITALS_PENDING:   "Vitals Pending",
  VITALS_COMPLETED: "Vitals Completed",
  IN_CONSULTATION:  "In Consultation",
  COMPLETED:        "Completed",
  ADMITTED:         "Admitted",
  SURGERY:          "Surgery Scheduled",
  DISCHARGED:       "Discharged",
};

const VISIT_STATUS_COLORS = {
  WAITING:          { bg: G.orangeL,  c: G.orange  },
  VITALS_PENDING:   { bg: "#FEF3C7",  c: "#92400E" },
  VITALS_COMPLETED: { bg: "#DCFCE7",  c: "#166534" },
  IN_CONSULTATION:  { bg: G.blueL,    c: G.blue    },
  COMPLETED:        { bg: G.greenL,   c: G.green   },
  ADMITTED:         { bg: "#EDE9FE",  c: "#5B21B6" },
  SURGERY:          { bg: G.purpleL,  c: G.purple  },
  DISCHARGED:       { bg: G.greenL,   c: G.green   },
};

const STATUS_COLORS = {
  WAITING:          { bg: "#FFF7ED", c: "#C2410C" },
  VITALS_PENDING:   { bg: "#FFF7ED", c: "#C2410C" },
  VITALS_COMPLETED: { bg: "#FEF9C3", c: "#92400E" },
  IN_CONSULTATION:  { bg: "#EFF6FF", c: "#1D4ED8" },
  COMPLETED:        { bg: "#DCFCE7", c: "#166534" },
  ADMITTED:         { bg: "#EDE9FE", c: "#5B21B6" },
  SURGERY:          { bg: "#F5F3FF", c: "#6D28D9" },
  DISCHARGED:       { bg: "#F0FDFA", c: "#0F766E" },
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

const ACTIVE_STATUSES = ["WAITING", "IN_CONSULTATION", "ADMITTED", "SURGERY"];

const LETTERS_ONLY = /^[a-zA-Z\s,.\-\/()]+$/;
function stripNumbers(val) { return val.replace(/[0-9]/g, ""); }
function blockNumbers(e) { if (/^[0-9]$/.test(e.key)) e.preventDefault(); }

const NEXT_ACTIONS = {
  WAITING:          [{ s: "IN_CONSULTATION", label: "▶ Start Consultation",  color: G.blue,    requiresVitals: true }],
  VITALS_PENDING:   [{ s: "IN_CONSULTATION", label: "▶ Start Consultation",  color: G.blue,    requiresVitals: true }],
  VITALS_COMPLETED: [{ s: "IN_CONSULTATION", label: "▶ Start Consultation",  color: G.blue,    requiresVitals: true }],
  IN_CONSULTATION: [
    { s: "COMPLETED",  label: "✅ Complete",          color: G.green   },
    { s: "ADMITTED",   label: "🏥 Admit Patient",     color: "#5B21B6" },
    { s: "SURGERY",    label: "🔪 Schedule Surgery",  color: G.purple  },
    { s: "DISCHARGED", label: "🚪 Discharge",         color: G.green   },
  ],
  ADMITTED:   [{ s: "SURGERY",    label: "🔪 Schedule Surgery", color: G.purple }, { s: "DISCHARGED", label: "🚪 Discharge", color: G.green }],
  SURGERY:    [{ s: "DISCHARGED", label: "🚪 Discharge",        color: G.green  }],
  COMPLETED:  [],
  DISCHARGED: [],
};

const BLOOD_ALLOWED = ["WAITING", "VITALS_PENDING", "VITALS_COMPLETED", "IN_CONSULTATION", "ADMITTED", "SURGERY"];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function toLocalDateStr(date) { return new Date(date).toISOString().split("T")[0]; }

function formatDateLabel(dateStr) {
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diff   = Math.round((today - target) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return target.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// FIX: Truncate long reason text to max N chars with ellipsis
function truncateReason(text, max = 30) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function validateEMR(emr, status) {
  const errors = {};
  if (!emr.diagnosis || emr.diagnosis.trim().length < 3)
    errors.diagnosis = "Please enter a diagnosis (min 3 characters).";
  else if (!LETTERS_ONLY.test(emr.diagnosis.trim()))
    errors.diagnosis = "Diagnosis must contain letters only — no numbers allowed.";
  if (!emr.treatment || emr.treatment.trim().length < 5)
    errors.treatment = "Please enter the treatment or prescription (min 5 characters).";
  else if (!LETTERS_ONLY.test(emr.treatment.trim()))
    errors.treatment = "Treatment must contain letters only — no numbers allowed.";
  if (status === "SURGERY") {
    if (!emr.surgeryType || emr.surgeryType.trim().length < 2)
      errors.surgeryType = "Please enter the surgery type.";
    else if (!LETTERS_ONLY.test(emr.surgeryType.trim()))
      errors.surgeryType = "Surgery type must contain letters only — no numbers allowed.";
    if (!emr.scheduledAt)
      errors.scheduledAt = "Please select a date & time for the surgery.";
  }
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX: getBloodUnitsForSurgery
// Each surgery should only show blood requests from its OWN linked visit.
// If visitId is stored on the surgery, use exact match only.
// If no visitId, show 0 units — do NOT fall through to all visits.
// This prevents all surgeries sharing the same blood unit total.
// ─────────────────────────────────────────────────────────────────────────────
function getBloodUnitsForSurgery(surgery, visits) {
  let bloodRequests = [];

  // Strategy 1: surgery has explicit visitId — exact match only
  if (surgery.visitId) {
    const matchedVisit = visits.find(
      v => String(v._id) === String(surgery.visitId) ||
           String(v.visitId) === String(surgery.visitId)
    );
    if (matchedVisit) bloodRequests = matchedVisit.bloodRequests || [];
  }

  // Strategy 2: NO visitId stored — try surgeryType + same scheduledAt day
  // Only if exactly ONE visit matches — avoids bleed-through
  if (!bloodRequests.length && !surgery.visitId && surgery.surgeryType && surgery.scheduledAt) {
    const surgeryDay = new Date(surgery.scheduledAt).toISOString().split("T")[0];
    const typeAndDayMatches = visits.filter(v => {
      if (v.surgeryType !== surgery.surgeryType) return false;
      if (!v.scheduledAt) return false;
      return new Date(v.scheduledAt).toISOString().split("T")[0] === surgeryDay;
    });
    if (typeAndDayMatches.length === 1) bloodRequests = typeAndDayMatches[0].bloodRequests || [];
  }

  // INTENTIONALLY no global fallback — if we can't match, show 0.
  // This prevents multiple surgeries all showing the same total.
  const totalUnits = bloodRequests.reduce((sum, br) => sum + (Number(br.units) || 0), 0);
  return { totalUnits, bloodRequests };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX: computePatientTotalBloodUnits
// Sum blood units across ALL visits (no double-counting).
// ─────────────────────────────────────────────────────────────────────────────
function computePatientTotalBloodUnits(visits) {
  return (visits || []).reduce((total, v) => {
    const visitUnits = (v.bloodRequests || []).reduce(
      (s, br) => s + (Number(br.units) || 0), 0
    );
    return total + visitUnits;
  }, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX: computeTotalUnitsFromVisit
// Returns total blood units for a single visit (used for BLOOD REQ column).
// ─────────────────────────────────────────────────────────────────────────────
function computeTotalUnitsFromVisit(visit) {
  return (visit.bloodRequests || []).reduce((s, br) => s + (Number(br.units) || 0), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// VisitBadge
// ─────────────────────────────────────────────────────────────────────────────
function VisitBadge({ status }) {
  const sc = VISIT_STATUS_COLORS[status] || { bg: G.bg, c: G.muted };
  return (
    <span style={{
      background: sc.bg, color: sc.c,
      padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {VISIT_STATUS_LABELS[status] || status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BloodReasonCell — FIX: truncate long reason text, expand on click
// ─────────────────────────────────────────────────────────────────────────────
function BloodReasonCell({ reason }) {
  const [expanded, setExpanded] = useState(false);
  if (!reason) return <span style={{ fontSize: 12, color: G.muted, flex: 1 }}>—</span>;

  const MAX = 30;
  const isTruncatable = reason.length > MAX;
  const display = expanded ? reason : truncateReason(reason, MAX);

  return (
    <span
      onClick={() => isTruncatable && setExpanded(p => !p)}
      title={reason}
      style={{
        fontSize: 12, color: G.muted, flex: 1,
        cursor: isTruncatable ? "pointer" : "default",
        display: "block",
        overflow: "hidden",
        whiteSpace: expanded ? "normal" : "nowrap",
        textOverflow: expanded ? "unset" : "ellipsis",
        maxWidth: 160,
        wordBreak: expanded ? "break-word" : "normal",
        lineHeight: 1.5,
      }}
    >
      {display}
      {isTruncatable && !expanded && (
        <span style={{ color: G.blue, fontSize: 10.5, fontWeight: 600, marginLeft: 2 }}>▸</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ClickablePatientId
// ─────────────────────────────────────────────────────────────────────────────
function ClickablePatientId({ patientId, mongoId, onOpen }) {
  return (
    <span
      onClick={e => { e.stopPropagation(); onOpen(mongoId || patientId); }}
      title={`Click to view full details for ${patientId}`}
      style={{
        color: G.blue, fontWeight: 700, fontSize: 12,
        cursor: "pointer",
        textDecoration: "underline",
        textDecorationStyle: "dotted",
        textUnderlineOffset: 3,
      }}
    >
      {patientId}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PatientDetailPanel — inline (not overlay modal)
// ─────────────────────────────────────────────────────────────────────────────
export function PatientDetailPanel({ patientId, onClose }) {
  const [patient,   setPatient]   = useState(null);
  const [visits,    setVisits]    = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!patientId) return;
    setLoading(true); setError("");
    setPatient(null); setVisits([]); setSurgeries([]);

    const fetchAll = async () => {
      try {
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
        const allVisits    = Array.isArray(visitsRes)              ? visitsRes              : [];
        const allSurgeries = Array.isArray(surgeriesRes.surgeries) ? surgeriesRes.surgeries : [];
        setVisits(allVisits);
        setSurgeries(allSurgeries);
      } catch {
        setError("Failed to load patient details.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [patientId]);

  const activeVisit   = visits.find(v => ACTIVE_STATUSES.includes(v.status));
  const pastVisits    = visits.filter(v => v.status === "DISCHARGED" || v.status === "COMPLETED");
  const overallTotalUnits = computePatientTotalBloodUnits(visits);

  if (!patientId) return null;

  return (
    <div style={{
      background: G.white,
      borderRadius: 16,
      border: `2px solid ${G.border}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.10)",
      overflow: "hidden",
      marginTop: 20,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {/* Header */}
      <div style={{ background: G.navy, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: G.white }}>
            {loading ? "Loading…" : patient ? patient.name : "Patient Details"}
          </div>
          {patient && (
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
              {patient.patientId} · {patient.age} yrs · {patient.gender} · {patient.bloodGroup}
              {overallTotalUnits > 0 && (
                <span style={{ marginLeft: 12, background: "#FFF7ED", color: "#C2410C", border: "1px solid #FED7AA", padding: "1px 9px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                  🩸 {overallTotalUnits} total units
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ background: "rgba(255,255,255,0.12)", border: "none", color: G.white, borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          ✕ Close
        </button>
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
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: "12px 22px", background: "none", border: "none",
                  borderBottom: activeTab === t.id ? `2.5px solid ${G.navy}` : "2.5px solid transparent",
                  color: activeTab === t.id ? G.navy : G.muted,
                  fontWeight: activeTab === t.id ? 700 : 500,
                  fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ padding: "22px 24px", maxHeight: 600, overflowY: "auto" }}>

            {/* ── OVERVIEW ── */}
            {activeTab === "overview" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Patient ID",  value: patient.patientId },
                    { label: "Name",        value: patient.name },
                    { label: "Age",         value: `${patient.age} years` },
                    { label: "Gender",      value: patient.gender },
                    { label: "Blood Group", value: patient.bloodGroup },
                    { label: "Phone",       value: patient.phone || "—" },
                    { label: "Department",  value: patient.department || "—" },
                    { label: "Doctor",      value: patient.doctorName || "—" },
                    { label: "Registered",  value: new Date(patient.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) },
                  ].map(item => (
                    <div key={item.label} style={{ background: G.bg, borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: G.muted, marginBottom: 4 }}>{item.label.toUpperCase()}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: G.navy }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Overall blood total banner */}
                {visits.length > 0 && (
                  <div style={{ background: overallTotalUnits > 0 ? "#FFF7ED" : G.bg, border: `1.5px solid ${overallTotalUnits > 0 ? "#FED7AA" : G.border}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>🩸</span>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: overallTotalUnits > 0 ? "#C2410C" : G.muted }}>TOTAL BLOOD UNITS REQUESTED (ALL VISITS)</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: overallTotalUnits > 0 ? "#C2410C" : G.navy, marginTop: 2 }}>
                        {overallTotalUnits > 0 ? `${overallTotalUnits} units` : "No blood requests"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Active visit banner */}
                {activeVisit && (() => {
                  const sc = STATUS_COLORS[activeVisit.status] || { bg: "#F1F5F9", c: "#64748B" };
                  return (
                    <div style={{ background: sc.bg, border: `1.5px solid ${sc.c}55`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: sc.c, marginBottom: 8 }}>⚡ CURRENT ACTIVE VISIT</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ color: G.blue, fontWeight: 700, fontSize: 13 }}>{activeVisit.visitId}</span>
                        <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}66`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                          {VISIT_STATUS_LABELS[activeVisit.status] || activeVisit.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: G.navy, fontWeight: 700 }}>👨‍⚕️ {activeVisit.doctorName}</div>
                      <div style={{ fontSize: 12, color: G.muted, marginTop: 3 }}>🏥 {activeVisit.department}</div>
                      {activeVisit.complaints && <div style={{ fontSize: 12, color: G.text, marginTop: 6 }}><strong>Complaints:</strong> {activeVisit.complaints}</div>}
                    </div>
                  );
                })()}

                {/* Surgery summary — FIX: each surgery shows its OWN blood units only */}
                {surgeries.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: G.muted, marginBottom: 10 }}>SURGERY SUMMARY</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {surgeries.map((s, idx) => {
                        const { totalUnits } = getBloodUnitsForSurgery(s, visits);
                        const sc = SURGERY_STATUS_COLORS[s.status] || { bg: "#F1F5F9", c: "#64748B" };
                        return (
                          <div key={s._id || idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: G.bg, borderRadius: 10, padding: "10px 14px", border: `1.5px solid ${G.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: G.muted }}>#{idx + 1}</span>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: G.navy }}>{s.surgeryType}</span>
                              <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}55`, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.status}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ background: totalUnits > 0 ? "#FFF7ED" : G.bg, color: totalUnits > 0 ? "#C2410C" : G.muted, border: `1.5px solid ${totalUnits > 0 ? "#FED7AA" : G.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                                🩸 {totalUnits > 0 ? `${totalUnits} units` : "No blood req."}
                              </span>
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

            {/* ── VISITS ── */}
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
                          {VISIT_STATUS_LABELS[activeVisit.status] || activeVisit.status}
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
                                {/* FIX: truncate long reason text */}
                                {br.reason && <BloodReasonCell reason={br.reason} />}
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

            {/* ── SURGERIES ── */}
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
                      // FIX: each surgery gets its OWN blood units — no sharing
                      const { totalUnits, bloodRequests: brs } = getBloodUnitsForSurgery(s, visits);
                      return (
                        <div key={s._id || idx} style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 13, overflow: "hidden" }}>
                          <div style={{ background: sc.bg, borderBottom: `1.5px solid ${G.border}`, padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: G.muted }}>SURGERY {idx + 1}</span>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: G.navy }}>{s.surgeryType}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ background: totalUnits > 0 ? "#FFF7ED" : G.bg, color: totalUnits > 0 ? "#C2410C" : G.muted, border: `1.5px solid ${totalUnits > 0 ? "#FED7AA" : G.border}`, padding: "3px 11px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                                🩸 {totalUnits > 0 ? `${totalUnits} units` : "No blood req."}
                              </span>
                              <span style={{ background: sc.bg, color: sc.c, border: `1.5px solid ${sc.c}55`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.status}</span>
                            </div>
                          </div>
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
                            {brs.length > 0 ? (
                              <div style={{ background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 10, padding: "10px 13px" }}>
                                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#C2410C", marginBottom: 8 }}>
                                  🩸 BLOOD REQUESTS — {totalUnits} total unit{totalUnits !== 1 ? "s" : ""} ({brs.length} request{brs.length > 1 ? "s" : ""})
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {brs.map((br, i) => {
                                    const bc = BLOOD_STATUS_COLORS[br.status] || { bg: "#F1F5F9", c: "#64748B" };
                                    return (
                                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: G.white, borderRadius: 8, padding: "7px 10px", border: `1px solid ${G.border}` }}>
                                        <Badge label={br.bloodGroup} color={G.red} bg={G.redL} />
                                        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{br.units}u</span>
                                        {/* FIX: truncate long reason */}
                                        {br.reason && <BloodReasonCell reason={br.reason} />}
                                        <span style={{ background: bc.bg, color: bc.c, padding: "2px 9px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{br.status}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: G.muted, background: "#F8FAFC", borderRadius: 8, padding: "8px 12px" }}>
                                🩸 No blood request linked to this surgery
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
  );
}

// Keep old export name as alias
export { PatientDetailPanel as PatientDetailModal };

// ─────────────────────────────────────────────────────────────────────────────
// DoctorDashboard — main export
// ─────────────────────────────────────────────────────────────────────────────
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
  const [loading,   setLoading]   = useState(false);

  const [inlinePatientId, setInlinePatientId] = useState(null);
  const openInlinePanel  = (id) => setInlinePatientId(id);
  const closeInlinePanel = ()   => setInlinePatientId(null);

  const todayStr = toLocalDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [customDate,   setCustomDate]   = useState("");

  const [newBR,  setNewBR]  = useState({ units: 1, reason: "", priority: "Normal" });
  const [brMsg,  setBrMsg]  = useState("");
  const [brBusy, setBrBusy] = useState(false);
  const [prevComplaints, setPrevComplaints] = useState("");

  const [emr, setEmr] = useState({
    diagnosis: "", treatment: "", surgeryType: "", scheduledAt: "", surgeryNotes: "",
  });

  useEffect(() => {
    axios.get("/api/users/me").then(r => setUser(r.data)).catch(() => {});
  }, []);

  const fetchVisits = useCallback(() => {
    if (!user) return;
    setLoading(true);
    axios.get(`/api/visits?doctorName=${encodeURIComponent(user.name)}`)
      .then(r => setVisits(Array.isArray(r.data) ? r.data : []))
      .catch(() => setVisits([]))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { fetchVisits(); }, [fetchVisits]);

  useWebSocket(useCallback((msg) => {
    const { type, data } = msg;
    if (["VITALS_UPDATED", "VISIT_UPDATED", "VISIT_STATUS_CHANGED", "BLOOD_REQUEST_STATUS_UPDATED"].includes(type)) {
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      if (selected?._id === data._id) setSelected(data);
    }
    if (type === "NEW_VISIT" && data.doctorName === user?.name) {
      setVisits(prev => [data, ...prev]);
    }
  }, [selected, user]));

  useEffect(() => {
    if (!selected) return;
    setEmr({
      diagnosis:    selected.diagnosis    || "",
      treatment:    selected.treatment    || "",
      surgeryType:  selected.surgeryType  || "",
      scheduledAt:  selected.scheduledAt ? selected.scheduledAt.slice(0, 16) : "",
      surgeryNotes: selected.surgeryNotes || "",
    });
    setEmrErrors({}); setEmrMsg(""); setBrMsg("");
    setNewBR({ units: 1, reason: "", priority: "Normal" });
    if (selected.complaints) {
      setPrevComplaints(selected.complaints);
    } else {
      const patId = selected.patientId?._id || selected.patientId;
      if (patId) {
        axios.get(`/api/patients/${patId}/visits`)
          .then(r => {
            const history = Array.isArray(r.data) ? r.data : [];
            const prev = history.find(v => v._id !== selected._id && v.complaints);
            setPrevComplaints(prev?.complaints || "");
          })
          .catch(() => setPrevComplaints(""));
      } else { setPrevComplaints(""); }
    }
  }, [selected]);

  const changeStatus = async (visitId, newStatus) => {
    try {
      const { data } = await axios.patch(`/api/visits/${visitId}/status`, { status: newStatus });
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      setSelected(data);
    } catch (e) { setEmrMsg("❌ " + (e.response?.data?.message || "Status update failed")); }
  };

  const canAddBlood = selected && BLOOD_ALLOWED.includes(selected.status);
  const vitalsReady = !!(selected?.vitalsCompleted || selected?.vitals);

  const saveEMR = async () => {
    if (!selected) return;
    if (!vitalsReady) { setEmrMsg("❌ Vitals must be recorded by Staff before saving consultation."); return; }
    const errs = validateEMR(emr, selected.status);
    setEmrErrors(errs);
    if (Object.keys(errs).length > 0) { setEmrMsg("❌ Fix errors before saving."); return; }
    setEmrBusy(true); setEmrMsg("");
    try {
      const payload = {
        complaints:   prevComplaints,
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

      // FIX: Save surgery record with correct patientId string + duplicate prevention
      if (selected.status === "SURGERY" && emr.surgeryType && emr.scheduledAt) {
        const pt     = selected.patientId || {};
        // Safely extract whether pt is populated object or raw string
        const ptName = (typeof pt === "object" && pt !== null ? pt.name      : null) || "Unknown";
        const ptId   = (typeof pt === "object" && pt !== null ? pt.patientId : null) || "";

        try {
          // Check if surgery already saved for this visit to prevent duplicates
          const existing = await axios.get(`/api/surgeries/patient/${ptId}`)
            .then(r => r.data.surgeries || [])
            .catch(() => []);

          const alreadySaved = existing.some(
            s => String(s.visitId) === String(selected._id)
          );

          if (!alreadySaved) {
            await axios.post("/api/surgeries", {
              patientName: ptName,
              patientId:   ptId,       // ✅ always "HC-2026-004" string, never undefined
              visitId:     selected._id, // ✅ links surgery → visit for blood unit matching
              surgeryType: emr.surgeryType,
              department:  selected.department,
              doctorName:  selected.doctorName,
              scheduledAt: emr.scheduledAt,
              notes:       emr.surgeryNotes || "",
            });
          }
        } catch (surgErr) {
          console.error("Surgery record save failed:", surgErr?.response?.data || surgErr.message);
          setEmrMsg("✅ Consultation saved. ⚠ Surgery record could not be saved — please retry.");
        }
      }
    } catch (e) { setEmrMsg("❌ " + (e.response?.data?.message || "Save failed")); }
    finally { setEmrBusy(false); }
  };

  const addBloodRequest = async () => {
    if (!selected) return;
    if (!newBR.units || newBR.units < 1) { setBrMsg("❌ Units must be at least 1."); return; }
    setBrBusy(true); setBrMsg("");
    try {
      const { data } = await axios.post(`/api/visits/${selected._id}/blood-requests`, {
        units:    newBR.units,
        reason:   newBR.reason,
        priority: newBR.priority,
      });
      setVisits(prev => prev.map(v => v._id === data._id ? data : v));
      setSelected(data);
      setNewBR({ units: 1, reason: "", priority: "Normal" });
      setBrMsg("✅ Blood request saved.");
    } catch (e) { setBrMsg("❌ " + (e.response?.data?.message || "Failed to save blood request.")); }
    finally { setBrBusy(false); }
  };

  const safeVisits   = Array.isArray(visits) ? visits : [];
  const visitsByDate = {};
  safeVisits.forEach(v => {
    const dateKey = toLocalDateStr(v.createdAt);
    if (!visitsByDate[dateKey]) visitsByDate[dateKey] = [];
    visitsByDate[dateKey].push(v);
  });
  const allDates       = Object.keys(visitsByDate).sort((a, b) => b.localeCompare(a));
  const filteredVisits = selectedDate ? (visitsByDate[selectedDate] || []) : safeVisits;
  const statsVisits    = filteredVisits;

  const totalVisits = statsVisits.length;
  const waiting     = statsVisits.filter(v => v.status === "WAITING").length;
  const active      = statsVisits.filter(v => v.status === "IN_CONSULTATION").length;
  const admitted    = statsVisits.filter(v => ["ADMITTED", "SURGERY"].includes(v.status)).length;
  const discharged  = statsVisits.filter(v => v.status === "DISCHARGED").length;
  const completed   = statsVisits.filter(v => v.status === "COMPLETED").length;

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

  const lockedStyle = (field) => ({
    ...inp(),
    border: `1.5px solid ${G.border}`, background: "#F1F5F9",
    color: G.muted, cursor: "not-allowed", opacity: 0.7,
    marginBottom: emrErrors[field] ? 4 : 11,
  });

  const ErrMsg = ({ field }) => emrErrors[field]
    ? <div style={{ color: "#EF4444", fontSize: 11.5, fontWeight: 600, marginBottom: 10 }}>⚠ {emrErrors[field]}</div>
    : null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: G.bg, fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'); @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <Sidebar
        role="Doctor"
        dept={user?.department}
        name={user?.name || "Doctor"}
        tab={tab}
        setTab={t => { setTab(t); setSelected(null); closeInlinePanel(); }}
        onLogout={onLogout}
        tabs={tabs}
      />

      <div style={{ marginLeft: 258, flex: 1, padding: 28 }}>
        <PageHeader
          title={tab === "queue" ? "👥 My Queue" : tab === "history" ? "📖 Visit History" : "👤 My Profile"}
          sub={`${user?.department || ""} · ${user?.name || ""}`}
        />

        {/* ── QUEUE TAB ── */}
        {tab === "queue" && (
          <>
            {/* Date filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {(() => {
                const datesToShow = new Set([todayStr, ...allDates]);
                const sorted = [...datesToShow].sort((a, b) => b.localeCompare(a)).slice(0, 7);
                return sorted.map(dateStr => {
                  const count    = visitsByDate[dateStr]?.length || 0;
                  const isActive = selectedDate === dateStr;
                  return (
                    <button
                      key={dateStr}
                      onClick={() => { setSelectedDate(dateStr); setSelected(null); closeInlinePanel(); }}
                      style={{ padding: "6px 14px", background: isActive ? G.navy : G.white, color: isActive ? G.white : G.text, border: `1.5px solid ${isActive ? G.navy : G.border}`, borderRadius: 20, fontSize: 12.5, fontWeight: isActive ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      {formatDateLabel(dateStr)}
                      {count > 0 && (
                        <span style={{ background: isActive ? "rgba(255,255,255,0.25)" : G.bg, color: isActive ? G.white : G.muted, borderRadius: 10, fontSize: 10.5, fontWeight: 700, padding: "1px 6px" }}>{count}</span>
                      )}
                    </button>
                  );
                });
              })()}
              <input type="date" max={todayStr} value={customDate} onChange={e => { const val = e.target.value; setCustomDate(val); if (val) { setSelectedDate(val); setSelected(null); closeInlinePanel(); } }} style={{ ...inp({ width: "auto", padding: "6px 12px", fontSize: 12.5 }), marginBottom: 0 }} />
              <button onClick={() => { setSelectedDate(null); setSelected(null); setCustomDate(""); closeInlinePanel(); }} style={{ padding: "6px 14px", background: !selectedDate ? G.red : G.white, color: !selectedDate ? G.white : G.muted, border: `1.5px solid ${!selectedDate ? G.red : G.border}`, borderRadius: 20, fontSize: 12.5, fontWeight: !selectedDate ? 700 : 500, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>All Dates</button>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
              <Stat icon="👥" label="Total Visits"       value={totalVisits} color={G.navy} />
              <Stat icon="⏳" label="Waiting"            value={waiting}    color={G.orange} bg={G.orangeL} />
              <Stat icon="🩺" label="In Consultation"    value={active}     color={G.blue}   bg={G.blueL} />
              <Stat icon="🏥" label="Admitted / Surgery" value={admitted}   color={G.purple} bg={G.purpleL} />
              <Stat icon="🚪" label="Discharged"         value={discharged} color={G.green}  bg={G.greenL} />
              <Stat icon="✅" label="Completed"          value={completed}  color={G.green}  bg={G.greenL} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 440px" : "1fr", gap: 22 }}>
              {/* Visits table */}
              <div>
                <Card>
                  <CardHead title={selectedDate ? `${formatDateLabel(selectedDate)} — ${user?.department || ""} (${filteredVisits.length} visits)` : `All Visits — ${user?.department || ""} (${filteredVisits.length} total)`} />
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      {/* FIX: BLOOD REQ column header changed to "BLOOD REQ (units)" for clarity */}
                      <THead cols={["DATE", "VISIT ID", "PATIENT ID", "PATIENT", "AGE", "BLOOD", "COMPLAINTS", "VITALS", "STATUS", "BLOOD REQ", "ACTION"]} />
                      <tbody>
                        {loading ? (
                          <tr><td colSpan={11} style={{ padding: "36px", textAlign: "center", color: G.muted }}>Loading visits…</td></tr>
                        ) : filteredVisits.length === 0 ? (
                          <tr><td colSpan={11} style={{ padding: "36px", textAlign: "center", color: G.muted }}>{selectedDate ? `No visits on ${formatDateLabel(selectedDate)}.` : "No visits found."}</td></tr>
                        ) : (
                          filteredVisits.map((v, i) => {
                            const pt        = v.patientId || {};
                            const visitDate = toLocalDateStr(v.createdAt);
                            const isToday   = visitDate === todayStr;
                            // FIX: show total UNITS in the blood req column, not count of requests
                            const totalBloodUnits = computeTotalUnitsFromVisit(v);
                            return (
                              <tr
                                key={v._id}
                                style={{ borderTop: `1px solid ${G.border}`, background: selected?._id === v._id ? G.blueL : i % 2 === 0 ? G.white : "#FAFBFC", cursor: "pointer" }}
                                onClick={() => { setSelected(v); closeInlinePanel(); }}
                              >
                                <td style={{ padding: "11px 14px", fontSize: 11.5, color: isToday ? G.green : G.muted, fontWeight: isToday ? 700 : 400, whiteSpace: "nowrap" }}>
                                  {isToday ? "Today" : new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                </td>
                                <td style={{ padding: "11px 14px", fontSize: 11.5, color: G.blue, fontWeight: 700 }}>{v.visitId}</td>
                                <td style={{ padding: "11px 14px" }}>
                                  <ClickablePatientId
                                    patientId={pt.patientId || "—"}
                                    mongoId={pt._id}
                                    onOpen={(id) => {
                                      setSelected(null);
                                      setInlinePatientId(prev => prev === id ? null : id);
                                    }}
                                  />
                                </td>
                                <td style={{ padding: "11px 14px", fontWeight: 700, color: G.navy }}>{pt.name}</td>
                                <td style={{ padding: "11px 14px", color: G.muted }}>{pt.age}</td>
                                <td style={{ padding: "11px 14px" }}><Badge label={pt.bloodGroup} color={G.red} bg={G.redL} /></td>
                                <td style={{ padding: "11px 14px", fontSize: 12, color: G.muted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.complaints || "—"}</td>
                                <td style={{ padding: "11px 14px" }}>{v.vitals ? <span style={{ fontSize: 11, color: G.green, fontWeight: 600 }}>✅ {v.vitals.bp}</span> : <span style={{ fontSize: 11, color: G.orange }}>Pending</span>}</td>
                                <td style={{ padding: "11px 14px" }}><VisitBadge status={v.status} /></td>
                                {/* FIX: show total UNITS not request count */}
                                <td style={{ padding: "11px 14px" }}>
                                  {["COMPLETED", "DISCHARGED"].includes(v.status) ? (
                                    <span style={{ background: G.greenL, color: G.green, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>✅ Done</span>
                                  ) : totalBloodUnits > 0 ? (
                                    <Badge
                                      label={`🩸 ${totalBloodUnits}u`}
                                      color={G.red}
                                      bg={G.redL}
                                      title={v.bloodRequests.map(br => `${br.bloodGroup} ${br.units}u - ${br.status}`).join(", ")}
                                    />
                                  ) : (
                                    <span style={{ color: G.muted, fontSize: 12 }}>—</span>
                                  )}
                                </td>
                                <td style={{ padding: "11px 14px" }}>
                                  <button
                                    style={{ padding: "5px 11px", background: G.navy, color: "white", border: "none", borderRadius: 7, fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                                    onClick={e => { e.stopPropagation(); setSelected(v); closeInlinePanel(); }}
                                  >
                                    Open →
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Inline patient detail panel */}
                {inlinePatientId && !selected && (
                  <PatientDetailPanel
                    patientId={inlinePatientId}
                    onClose={closeInlinePanel}
                  />
                )}
              </div>

              {/* ── Patient detail side panel ── */}
              {selected && (
                <Card style={{ alignSelf: "flex-start" }}>
                  <CardHead
                    title={`📋 ${selected.patientId?.name || "—"} — ${selected.visitId}`}
                    right={
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          onClick={() => {
                            const id = selected.patientId?._id || selected.patientId;
                            setSelected(null);
                            setInlinePatientId(id);
                          }}
                          style={{ padding: "5px 10px", background: G.blueL, color: G.blue, border: `1.5px solid ${G.blue}33`, borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
                        >
                          🔍 Full Details
                        </button>
                        <button
                          onClick={() => { setSelected(null); setEmrMsg(""); setEmrErrors({}); }}
                          style={{ border: "none", background: G.bg, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 12.5, color: G.muted }}
                        >
                          ✕
                        </button>
                      </div>
                    }
                  />
                  <div style={{ padding: 16, maxHeight: "78vh", overflowY: "auto" }}>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {[
                        ["ID",     selected.patientId?.patientId],
                        ["Age",    selected.patientId?.age],
                        ["Blood",  selected.patientId?.bloodGroup],
                        ["Status", VISIT_STATUS_LABELS[selected.status] || selected.status],
                        ["Visit",  selected.visitId],
                        ["Date",   new Date(selected.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })],
                      ].map(([k, val]) => (
                        <div key={k} style={{ background: G.bg, borderRadius: 8, padding: "7px 10px" }}>
                          <div style={{ fontSize: 9.5, color: G.muted, fontWeight: 700, letterSpacing: 0.5 }}>{k}</div>
                          {k === "ID" && val ? (
                            <div
                              onClick={() => {
                                const id = selected.patientId?._id;
                                setSelected(null);
                                setInlinePatientId(id);
                              }}
                              style={{ fontSize: 13, fontWeight: 700, color: G.blue, marginTop: 2, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                            >
                              {val}
                            </div>
                          ) : (
                            <div style={{ fontSize: 13, fontWeight: 700, color: G.navy, marginTop: 2 }}>{val || "—"}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Status actions */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: G.muted, marginBottom: 6 }}>STATUS ACTIONS</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <VisitBadge status={selected.status} />
                        {(NEXT_ACTIONS[selected.status] || []).map(({ s, label, color, requiresVitals }) => {
                          const vitalsBlocked = requiresVitals && !vitalsReady;
                          return (
                            <button
                              key={s}
                              onClick={() => !vitalsBlocked && changeStatus(selected._id, s)}
                              title={vitalsBlocked ? "Staff must record vitals first" : undefined}
                              style={{ padding: "4px 11px", background: vitalsBlocked ? "#E2E8F0" : "transparent", border: `1.5px solid ${vitalsBlocked ? G.border : color}`, borderRadius: 20, color: vitalsBlocked ? G.muted : color, fontSize: 11.5, fontWeight: 700, cursor: vitalsBlocked ? "not-allowed" : "pointer", opacity: vitalsBlocked ? 0.6 : 1 }}
                            >
                              {vitalsBlocked ? "🔒 " : ""}{label}
                            </button>
                          );
                        })}
                        {!vitalsReady && (
                          <div style={{ width: "100%", marginTop: 6, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "7px 10px", fontSize: 11.5, color: "#92400E", fontWeight: 600 }}>
                            ⚠️ Waiting for Staff to record vitals before consultation can begin.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Vitals */}
                    {selected.vitals ? (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: G.muted, marginBottom: 6 }}>VITALS ✅</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7 }}>
                          {[["BP", selected.vitals.bp, "mmHg"], ["Pulse", selected.vitals.pulse, "bpm"], ["SpO₂", selected.vitals.spo2, "%"], ["Temp", selected.vitals.temperature, "°F"], ["Sugar", selected.vitals.sugar, "mg/dL"], ["Wt", selected.vitals.weight, "kg"]].map(([l, val, u]) => (
                            <div key={l} style={{ background: G.bg, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                              <div style={{ fontSize: 17, fontWeight: 800, color: G.navy }}>{val ?? "—"}</div>
                              <div style={{ fontSize: 9.5, color: G.muted, fontWeight: 600, marginTop: 1 }}>{l} {u}</div>
                            </div>
                          ))}
                        </div>
                        {selected.vitals.notes && <div style={{ fontSize: 12, color: G.muted, marginTop: 7, padding: "7px 10px", background: G.bg, borderRadius: 7 }}>📝 {selected.vitals.notes}</div>}
                      </div>
                    ) : (
                      <div style={{ background: G.blueL, border: "1px solid #BFDBFE", borderRadius: 9, padding: "9px 13px", marginBottom: 14, fontSize: 12.5, color: G.blue, fontWeight: 600 }}>⏳ Vitals not yet recorded by Staff.</div>
                    )}

                    {/* Complaints */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>COMPLAINTS</label>
                      <div style={{ background: "#F8FAFC", border: `1.5px solid ${G.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, color: prevComplaints ? G.navy : G.muted, fontStyle: prevComplaints ? "normal" : "italic", minHeight: 52, lineHeight: 1.6, marginTop: 4 }}>
                        {prevComplaints || "No complaints on record for this patient yet."}
                      </div>
                    </div>

                    {/* Diagnosis */}
                    <label style={{ fontSize: 11, fontWeight: 700, color: vitalsReady ? G.muted : "#B45309", display: "block", marginBottom: 4 }}>DIAGNOSIS *</label>
                    <input
                      style={vitalsReady ? errStyle("diagnosis") : lockedStyle("diagnosis")}
                      placeholder={vitalsReady ? "e.g. Brain Stroke, Fever…" : "Locked — vitals required first"}
                      value={emr.diagnosis}
                      disabled={!vitalsReady}
                      onKeyDown={blockNumbers}
                      onInput={e => { e.target.value = stripNumbers(e.target.value); }}
                      onChange={e => { if (!vitalsReady) return; const clean = stripNumbers(e.target.value); setEmr(p => ({ ...p, diagnosis: clean })); setEmrErrors(p => ({ ...p, diagnosis: "" })); }}
                    />
                    <ErrMsg field="diagnosis" />

                    {/* Treatment */}
                    <label style={{ fontSize: 11, fontWeight: 700, color: vitalsReady ? G.muted : "#B45309", display: "block", marginBottom: 4 }}>TREATMENT / PRESCRIPTION *</label>
                    <textarea
                      style={{ ...(vitalsReady ? errStyle("treatment") : lockedStyle("treatment")), height: 68, resize: "none" }}
                      placeholder={vitalsReady ? "e.g. Medications, Physiotherapy…" : "Locked — vitals required first"}
                      value={emr.treatment}
                      disabled={!vitalsReady}
                      onKeyDown={blockNumbers}
                      onInput={e => { e.target.value = stripNumbers(e.target.value); }}
                      onChange={e => { if (!vitalsReady) return; const clean = stripNumbers(e.target.value); setEmr(p => ({ ...p, treatment: clean })); setEmrErrors(p => ({ ...p, treatment: "" })); }}
                    />
                    <ErrMsg field="treatment" />

                    {/* Surgery details */}
                    {selected.status === "SURGERY" && (
                      <div style={{ background: G.purpleL, border: `1.5px solid ${(emrErrors.surgeryType || emrErrors.scheduledAt) ? "#EF4444" : "#DDD6FE"}`, borderRadius: 11, padding: 14, marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: G.purple, marginBottom: 9 }}>🔪 Surgery Details</div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: emrErrors.surgeryType ? "#EF4444" : G.muted, display: "block", marginBottom: 4 }}>SURGERY TYPE <span style={{ color: "#EF4444" }}>*</span></label>
                        <input
                          style={{ ...inp(), marginBottom: emrErrors.surgeryType ? 4 : 9, border: `1.5px solid ${emrErrors.surgeryType ? "#EF4444" : G.border}`, background: emrErrors.surgeryType ? "#FFF5F5" : G.white }}
                          placeholder="e.g. Open Surgery, CABG, Appendectomy…"
                          value={emr.surgeryType}
                          onKeyDown={blockNumbers}
                          onInput={e => { e.target.value = stripNumbers(e.target.value); }}
                          onChange={e => { const clean = stripNumbers(e.target.value); setEmr(p => ({ ...p, surgeryType: clean })); setEmrErrors(p => ({ ...p, surgeryType: "" })); }}
                        />
                        {emrErrors.surgeryType && <div style={{ color: "#EF4444", fontSize: 11.5, fontWeight: 600, marginBottom: 9 }}>⚠ {emrErrors.surgeryType}</div>}
                        <label style={{ fontSize: 10, fontWeight: 700, color: emrErrors.scheduledAt ? "#EF4444" : G.muted, display: "block", marginBottom: 4 }}>DATE & TIME <span style={{ color: "#EF4444" }}>*</span></label>
                        <input
                          type="datetime-local"
                          style={{ ...inp(), marginBottom: emrErrors.scheduledAt ? 4 : 9, border: `1.5px solid ${emrErrors.scheduledAt ? "#EF4444" : G.border}`, background: emrErrors.scheduledAt ? "#FFF5F5" : G.white }}
                          value={emr.scheduledAt}
                          onChange={e => { setEmr(p => ({ ...p, scheduledAt: e.target.value })); setEmrErrors(p => ({ ...p, scheduledAt: "" })); }}
                        />
                        {emrErrors.scheduledAt && <div style={{ color: "#EF4444", fontSize: 11.5, fontWeight: 600, marginBottom: 9 }}>⚠ {emrErrors.scheduledAt}</div>}
                        <label style={{ fontSize: 10, fontWeight: 700, color: G.muted, display: "block", marginBottom: 4 }}>PRE-OP NOTES <span style={{ fontWeight: 400, marginLeft: 4 }}>(optional)</span></label>
                        <textarea style={{ ...inp(), height: 52, resize: "none" }} placeholder="Pre-op notes, allergies…" value={emr.surgeryNotes} onChange={e => setEmr(p => ({ ...p, surgeryNotes: e.target.value }))} />
                      </div>
                    )}

                    {emrMsg && (
                      <div style={{ background: emrMsg.startsWith("❌") ? G.redL : G.greenL, border: `1px solid ${emrMsg.startsWith("❌") ? "#FECACA" : "#A7F3D0"}`, borderRadius: 8, padding: "10px 13px", color: emrMsg.startsWith("❌") ? G.red : G.green, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                        {emrMsg}
                      </div>
                    )}

                    <button
                      onClick={saveEMR}
                      disabled={emrBusy || !vitalsReady}
                      style={{ width: "100%", padding: "12px 0", background: (!vitalsReady || emrBusy) ? "#94A3B8" : G.green, color: "white", border: "none", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: (!vitalsReady || emrBusy) ? "not-allowed" : "pointer", marginBottom: 16 }}
                    >
                      {emrBusy ? "Saving…" : !vitalsReady ? "🔒 Awaiting Vitals to Save" : "💾 Save Consultation"}
                    </button>

                    {/* Blood requests */}
                    <div style={{ borderTop: `1.5px solid ${G.border}`, paddingTop: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: G.navy, marginBottom: 10 }}>🩸 Blood Requests</div>
                      {(selected.bloodRequests || []).map((br, idx) => {
                        const brColors = {
                          "Requested By Doctor": { bg: G.orangeL, c: G.orange },
                          "Sent to Blood Bank":  { bg: G.purpleL, c: G.purple },
                          Approved:              { bg: G.blueL,   c: G.blue   },
                          Fulfilled:             { bg: G.greenL,  c: G.green  },
                          Rejected:              { bg: "#FEE2E2", c: "#B91C1C" },
                        };
                        const bc = brColors[br.status] || { bg: G.bg, c: G.muted };
                        return (
                          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", background: G.bg, borderRadius: 8, marginBottom: 5 }}>
                            <Badge label={br.bloodGroup} color={G.red} bg={G.redL} />
                            <span style={{ fontWeight: 700, fontSize: 12.5 }}>{br.units}u</span>
                            {/* FIX: truncate long reason */}
                            <BloodReasonCell reason={br.reason} />
                            <span style={{ background: bc.bg, color: bc.c, padding: "2px 8px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{br.status}</span>
                          </div>
                        );
                      })}
                      {canAddBlood ? (
                        <div style={{ background: G.redL, border: "1.5px solid #FECACA", borderRadius: 10, padding: 12, marginTop: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: G.white, borderRadius: 8, marginBottom: 8, border: "1px solid #FECACA" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: G.muted }}>BLOOD GROUP:</span>
                            <Badge label={selected.patientId?.bloodGroup || "—"} color={G.red} bg={G.redL} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, marginBottom: 7 }}>
                            <input type="number" min={1} style={inp()} placeholder="Units" value={newBR.units} onChange={e => setNewBR(p => ({ ...p, units: Number(e.target.value) }))} />
                            <input style={inp()} placeholder="Reason…" value={newBR.reason} onChange={e => setNewBR(p => ({ ...p, reason: e.target.value }))} />
                          </div>
                          <select style={{ ...inp(), marginBottom: 7 }} value={newBR.priority} onChange={e => setNewBR(p => ({ ...p, priority: e.target.value }))}>
                            {["Normal", "Urgent", "Emergency"].map(x => <option key={x}>{x}</option>)}
                          </select>
                          {brMsg && <div style={{ fontSize: 12, fontWeight: 600, color: brMsg.startsWith("✅") ? G.green : G.red, marginBottom: 6 }}>{brMsg}</div>}
                          <button
                            onClick={addBloodRequest}
                            disabled={brBusy}
                            style={{ width: "100%", padding: "9px 0", background: brBusy ? "#94A3B8" : G.red, color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: brBusy ? "not-allowed" : "pointer" }}
                          >
                            {brBusy ? "Sending…" : "➕ Save Blood Request"}
                          </button>
                        </div>
                      ) : (
                        <div style={{ background: "#FEF3C7", border: "1.5px solid #FDE68A", borderRadius: 10, padding: "12px 14px", marginTop: 8 }}>
                          <div style={{ fontSize: 12.5, color: "#92400E", fontWeight: 700 }}>
                            {["COMPLETED", "DISCHARGED"].includes(selected.status)
                              ? "✅ Visit completed — no new blood requests"
                              : "🚫 Blood requests not allowed for this status"}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </>
        )}

        {tab === "history" && <VisitHistoryTab doctorName={user?.name} onOpenPatient={openInlinePanel} />}

        {tab === "profile" && user && (
          <ProfileCard
            name={user.name}
            role={user.role}
            dept={user.department}
            email={user.email}
            specialization={user.specialization}
            experience={user.experience}
            education={user.education}
            studiedAt={user.studiedAt}
          />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// VisitHistoryTab
// ══════════════════════════════════════════════════════════════════════════
function VisitHistoryTab({ doctorName, onOpenPatient }) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [searched,  setSearched]  = useState(false);
  const [visits,    setVisits]    = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  const [selPt,     setSelPt]     = useState(null);
  const [histLoad,  setHistLoad]  = useState(false);
  const [error,     setError]     = useState("");

  const isVisitId = (q) => /^v-/i.test(q.trim());

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true); setSearched(true); setError("");
    setResults([]); setSelPt(null); setVisits([]); setSurgeries([]);
    try {
      if (isVisitId(q)) {
        const { data: allVisits } = await axios.get("/api/visits");
        const matched = (Array.isArray(allVisits) ? allVisits : []).filter(v => v.visitId?.toLowerCase() === q.toLowerCase());
        if (matched.length > 0) {
          const visit   = matched[0];
          const patient = visit.patientId;
          if (patient?._id) {
            const pt = { _id: patient._id, name: patient.name, patientId: patient.patientId, phone: patient.phone };
            setResults([pt]);
            await loadHistory(pt);
          } else { setError(`Visit ${q} found but patient data is missing.`); }
        } else { setError(`No visit found with ID "${q}".`); }
      } else {
        const { data } = await axios.get(`/api/patients/search?q=${encodeURIComponent(q)}`);
        const list = Array.isArray(data) ? data : [];
        setResults(list);
        if (list.length === 0) setError(`No patients found for "${q}".`);
        else if (list.length === 1) await loadHistory(list[0]);
      }
    } catch { setError("Search failed. Please check your connection and try again."); }
    finally { setLoading(false); }
  };

  const loadHistory = async (pt) => {
    setSelPt(pt); setHistLoad(true); setVisits([]); setSurgeries([]);
    try {
      const [visitsRes, surgeriesRes] = await Promise.all([
        axios.get(`/api/patients/${pt._id}/visits`).then(r => r.data).catch(() => []),
        axios.get(`/api/surgeries/patient/${pt.patientId}`).then(r => r.data).catch(() => ({})),
      ]);
      setVisits(Array.isArray(visitsRes) ? visitsRes : []);
      setSurgeries(Array.isArray(surgeriesRes.surgeries) ? surgeriesRes.surgeries : []);
    } catch {
      setVisits([]); setSurgeries([]);
    } finally {
      setHistLoad(false);
    }
  };

  const brColors = {
    "Requested By Doctor": { bg: "#FFF7ED", c: "#C2690A" },
    "Sent to Blood Bank":  { bg: "#F5F3FF", c: "#6D28D9" },
    Approved:              { bg: "#EFF6FF", c: "#1D4ED8" },
    Fulfilled:             { bg: "#ECFDF5", c: "#0A7A50" },
    Rejected:              { bg: "#FEE2E2", c: "#B91C1C" },
  };

  const dotColor = (status) => {
    if (["DISCHARGED", "COMPLETED"].includes(status))  return "#0A7A50";
    if (status === "IN_CONSULTATION")                  return "#1D4ED8";
    if (status === "VITALS_COMPLETED")                 return "#16A34A";
    if (status === "SURGERY")                          return "#6D28D9";
    return "#CBD5E1";
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" }}>
      {/* Search panel */}
      <Card>
        <CardHead title="🔍 Search Patient" />
        <div style={{ padding: 16 }}>
          <input
            style={{ ...inp(), marginBottom: 10 }}
            placeholder="Name / phone / V-2026-0007…"
            value={query}
            onChange={e => { setQuery(e.target.value); if (error) setError(""); }}
            onKeyDown={e => e.key === "Enter" && search()}
            autoFocus
          />
          <button
            onClick={search}
            disabled={loading || !query.trim()}
            style={{ width: "100%", padding: "10px 0", background: (loading || !query.trim()) ? "#94A3B8" : G.navy, color: "white", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: (loading || !query.trim()) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {loading ? (
              <><span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />Searching…</>
            ) : "🔍 Search"}
          </button>

          {error && (
            <div style={{ marginTop: 12, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 13px", fontSize: 12.5, color: "#B91C1C", fontWeight: 600, lineHeight: 1.6 }}>⚠ {error}</div>
          )}

          {results.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: G.muted, marginBottom: 7 }}>{results.length} PATIENTS FOUND — SELECT ONE</div>
              {results.map(pt => (
                <div
                  key={pt._id}
                  onClick={() => loadHistory(pt)}
                  style={{ padding: "10px 12px", background: selPt?._id === pt._id ? G.blueL : G.bg, border: `1.5px solid ${selPt?._id === pt._id ? G.blue : G.border}`, borderRadius: 9, marginBottom: 6, cursor: "pointer" }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: G.navy }}>{pt.name}</div>
                  <div style={{ fontSize: 11.5, color: G.muted, marginTop: 2 }}>{pt.patientId} · {pt.phone}</div>
                </div>
              ))}
            </div>
          )}

          {results.length === 1 && selPt && !error && (
            <div style={{ marginTop: 12, background: G.greenL, border: "1px solid #A7F3D0", borderRadius: 9, padding: "10px 13px" }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: G.green }}>✅ Patient found</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: G.navy, marginTop: 3 }}>{selPt.name}</div>
              <div style={{ fontSize: 12, color: G.muted, marginTop: 1 }}>{selPt.patientId} · {selPt.phone}</div>
            </div>
          )}
        </div>
      </Card>

      {/* History panel */}
      <div>
        {!searched && (
          <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: "64px 40px", textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>📖</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: G.navy, marginBottom: 8 }}>Visit History</div>
            <div style={{ fontSize: 13.5, color: G.muted, lineHeight: 1.8 }}>
              Search for a patient by name, phone, or patient ID.<br />
              You can also paste a <strong>Visit ID</strong> (e.g. <code style={{ background: "#F1F5F9", padding: "2px 7px", borderRadius: 5, fontSize: 12 }}>V-2026-0007</code>).
            </div>
          </div>
        )}

        {histLoad && (
          <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 14, padding: "60px", textAlign: "center", color: G.muted }}>
            <div style={{ width: 32, height: 32, border: `3px solid ${G.border}`, borderTopColor: G.blue, borderRadius: "50%", animation: "spin 0.75s linear infinite", margin: "0 auto 12px" }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Loading visit history…</div>
          </div>
        )}

        {selPt && !histLoad && (
          <>
            {/* Patient header */}
            <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 13, padding: "14px 20px", marginBottom: 16, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: G.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, color: "white", fontWeight: 800, flexShrink: 0 }}>
                {selPt.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: G.navy }}>{selPt.name}</div>
                <div style={{ fontSize: 12, color: G.muted, marginTop: 2 }}>
                  {onOpenPatient ? (
                    <span
                      onClick={() => onOpenPatient(selPt._id)}
                      style={{ color: G.blue, cursor: "pointer", fontWeight: 700, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                    >
                      {selPt.patientId}
                    </span>
                  ) : selPt.patientId}
                  {" · "}{selPt.phone}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: G.blue, background: G.blueL, padding: "5px 14px", borderRadius: 20 }}>
                  {visits.length} visit{visits.length !== 1 ? "s" : ""}
                </span>
                {surgeries.length > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: G.purple, background: G.purpleL, padding: "5px 14px", borderRadius: 20 }}>
                    🔪 {surgeries.length} surger{surgeries.length !== 1 ? "ies" : "y"}
                  </span>
                )}
                {onOpenPatient && (
                  <button
                    onClick={() => onOpenPatient(selPt._id)}
                    style={{ padding: "6px 14px", background: G.navy, color: G.white, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    🔍 Full Details
                  </button>
                )}
              </div>
            </div>

            {visits.length === 0 && (
              <div style={{ background: G.white, border: `1.5px solid ${G.border}`, borderRadius: 13, padding: "40px", textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: G.muted }}>No visits on record for {selPt.name}.</div>
              </div>
            )}

            {visits.length > 0 && (
              <div style={{ position: "relative", paddingLeft: 28 }}>
                <div style={{ position: "absolute", left: 9, top: 8, bottom: 8, width: 2, background: "#E2E8F0", borderRadius: 2 }} />
                {visits.map(v => {
                  // FIX: match surgeries to this visit by visitId (Mongo _id or visitId string)
                  const visitSurgeries = surgeries.filter(s =>
                    String(s.visitId) === String(v._id) ||
                    String(s.visitId) === String(v.visitId) ||
                    // Fallback: no visitId stored, match by surgeryType + same day
                    (!s.visitId && v.surgeryType && s.surgeryType === v.surgeryType &&
                      v.scheduledAt && new Date(s.scheduledAt).toISOString().split("T")[0] ===
                      new Date(v.scheduledAt).toISOString().split("T")[0])
                  );

                  return (
                    <div key={v._id} style={{ position: "relative", marginBottom: 14 }}>
                      <div style={{ position: "absolute", left: -22, top: 18, width: 14, height: 14, borderRadius: "50%", background: dotColor(v.status), border: "2px solid white", boxShadow: `0 0 0 2px ${dotColor(v.status)}40`, zIndex: 1 }} />
                      <div style={{ background: "white", border: "1.5px solid #E2E8F0", borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: G.blue }}>{v.visitId}</span>
                            <VisitBadge status={v.status} />
                          </div>
                          <span style={{ fontSize: 11.5, color: G.muted }}>{new Date(v.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: G.muted, marginBottom: 8 }}>🏥 {v.department} &nbsp;·&nbsp; 👨‍⚕️ {v.doctorName}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: (v.vitals || v.bloodRequests?.length || visitSurgeries.length) ? 10 : 0 }}>
                          {v.complaints && <div style={{ fontSize: 13, color: G.text }}><span style={{ fontWeight: 700, color: G.muted }}>Complaints: </span>{v.complaints}</div>}
                          {v.diagnosis  && <div style={{ fontSize: 13, color: G.text }}><span style={{ fontWeight: 700, color: G.muted }}>Diagnosis: </span>{v.diagnosis}</div>}
                          {v.treatment  && <div style={{ fontSize: 13, color: G.text }}><span style={{ fontWeight: 700, color: G.muted }}>Treatment: </span>{v.treatment}</div>}
                        </div>

                        {/* Surgeries for this visit */}
                        {visitSurgeries.length > 0 && (
                          <div style={{ background: G.purpleL, border: "1.5px solid #DDD6FE", borderRadius: 9, padding: "10px 13px", marginBottom: 10 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: G.purple, marginBottom: 8 }}>
                              🔪 SURGERIES ({visitSurgeries.length})
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {visitSurgeries.map((s, si) => {
                                const sc = SURGERY_STATUS_COLORS[s.status] || { bg: "#F1F5F9", c: "#64748B" };
                                return (
                                  <div key={s._id || si} style={{ background: G.white, borderRadius: 8, padding: "9px 12px", border: "1px solid #DDD6FE" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: G.navy }}>{s.surgeryType}</span>
                                        <span style={{ background: sc.bg, color: sc.c, border: `1px solid ${sc.c}44`, padding: "1px 8px", borderRadius: 12, fontSize: 10.5, fontWeight: 700 }}>{s.status}</span>
                                      </div>
                                      {s.scheduledAt && (
                                        <span style={{ fontSize: 11, color: G.muted }}>
                                          {new Date(s.scheduledAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                      )}
                                    </div>
                                    {s.notes && <div style={{ fontSize: 11.5, color: G.muted, marginTop: 3 }}>📝 {s.notes}</div>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Vitals chips */}
                        {v.vitals && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                            {[["BP", v.vitals.bp, ""], ["Pulse", v.vitals.pulse, "bpm"], ["SpO₂", v.vitals.spo2, "%"], ["Temp", v.vitals.temperature, "°F"], ["Sugar", v.vitals.sugar, "mg/dL"], ["Wt", v.vitals.weight, "kg"]].map(([l, val, u]) =>
                              val != null && val !== "" ? (
                                <span key={l} style={{ fontSize: 11.5, background: "#F1F5F9", padding: "3px 9px", borderRadius: 10, color: G.navy, fontWeight: 600 }}>{l}: {val}{u}</span>
                              ) : null
                            )}
                          </div>
                        )}

                        {/* Blood request chips — FIX: truncate long reason text */}
                        {v.bloodRequests?.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                            {v.bloodRequests.map((br, i) => {
                              const bc = brColors[br.status] || { bg: "#F1F5F9", c: "#64748B" };
                              return (
                                <span key={i} style={{ fontSize: 11.5, background: bc.bg, color: bc.c, padding: "3px 9px", borderRadius: 12, fontWeight: 600 }}>
                                  🩸 {br.bloodGroup} {br.units}u — {truncateReason(br.reason, 20)} — {br.status}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {v.dischargedAt && <div style={{ fontSize: 12, color: "#0A7A50", fontWeight: 600, marginTop: 4 }}>🚪 Discharged: {new Date(v.dischargedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
                        {v.completedAt  && <div style={{ fontSize: 12, color: "#166534", fontWeight: 600, marginTop: 4 }}>✅ Completed: {new Date(v.completedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}