import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const G = { navy:"#0B1F3A",navyD:"#071429",red:"#C8102E",redL:"#FFF0F2",white:"#FFFFFF",bg:"#F1F5F9",border:"#E2E8F0",muted:"#64748B",text:"#1E293B" };
const i = (e={})=>({width:"100%",padding:"10px 14px",border:`1.5px solid ${G.border}`,borderRadius:9,fontSize:13.5,fontFamily:"'DM Sans',sans-serif",outline:"none",background:G.white,color:G.text,...e});

const DEMOS=[
  {role:"Doctor",      email:"ravi@lifecare.com",      password:"Doctor@123", label:"Dr. Ravi",   sub:"Cardiology"},
  {role:"Doctor",      email:"ramesh@lifecare.com",    password:"Doctor@123", label:"Dr. Ramesh", sub:"Neurology"},
  {role:"Doctor",      email:"meena@lifecare.com",     password:"Doctor@123", label:"Dr. Meena",  sub:"Orthopedics"},
  {role:"Doctor",      email:"suresh@lifecare.com",    password:"Doctor@123", label:"Dr. Suresh", sub:"Emergency"},
  {role:"Doctor",      email:"priya@lifecare.com",     password:"Doctor@123", label:"Dr. Priya",  sub:"General Physician"}, // ✅ was "Pediatrics"
  {role:"Receptionist",email:"maran@lifecare.com",     password:"Staff@123",  label:"Maran",      sub:"Receptionist"},
  {role:"Staff",       email:"nursepriya@lifecare.com",password:"Staff@123",  label:"Staff Priya",sub:"Staff"},              // ✅ was "Nurse Priya"
];

export default function LoginPage() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [err,   setErr]   = useState("");
  const [busy,  setBusy]  = useState(false);

  const go = async (e, p) => {
    setErr(""); setBusy(true);
    try {
      await login(e || email, p || pass);
      navigate("/dashboard");
    } catch(ex) {
      setErr("Invalid credentials");
    } finally {
      setBusy(false);
    }
  };

  const roleIcon = r => r==="Doctor"?"👨‍⚕️":r==="Receptionist"?"🧾":"🩺";

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,${G.navyD},#1a3658)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap');`}</style>
      <div style={{display:"flex",gap:48,alignItems:"flex-start",maxWidth:920,width:"100%"}}>

        {/* Left Panel */}
        <div style={{flex:"0 0 300px",paddingTop:8}}>
          <button
            onClick={() => navigate("/")}
            style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",color:"rgba(255,255,255,.55)",borderRadius:8,padding:"7px 14px",fontSize:12.5,cursor:"pointer",fontFamily:"inherit",marginBottom:24}}>
            ← Home
          </button>
          <div style={{fontSize:38,marginBottom:8}}>🏥</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:800,color:"white",lineHeight:1.1}}>
            LifeCare<br/><span style={{color:G.red}}>Staff Portal</span>
          </div>
          <p style={{color:"rgba(255,255,255,.45)",fontSize:13.5,lineHeight:1.75,marginTop:12}}>
            Role-based access for Doctors, Receptionists and Staff.
          </p>
          <div style={{marginTop:22,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,padding:16}}>
            <div style={{color:"rgba(255,255,255,.35)",fontSize:10,fontWeight:700,letterSpacing:1,marginBottom:10}}>QUICK DEMO LOGIN</div>
            {DEMOS.map(d=>(
              <button key={d.email} onClick={()=>go(d.email, d.password)} disabled={busy}
                style={{width:"100%",marginBottom:5,padding:"9px 12px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",color:"white",fontSize:12.5,textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>{roleIcon(d.role)} {d.label}</span>
                <span style={{color:"rgba(255,255,255,.3)",fontSize:11}}>{d.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div style={{flex:1,background:G.white,borderRadius:20,padding:"32px 30px",boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
          <div style={{fontSize:20,fontWeight:800,color:G.navy,marginBottom:24}}>Sign In to Your Account 👋</div>
          <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:5}}>EMAIL ADDRESS</label>
          <input
            style={{...i(),marginBottom:14}}
            placeholder="your@email.com"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&go()}
          />
          <label style={{fontSize:11,fontWeight:700,color:G.muted,display:"block",marginBottom:5}}>PASSWORD</label>
          <input
            type="password"
            style={{...i(),marginBottom:18}}
            placeholder="••••••••"
            value={pass}
            onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&go()}
          />
          {err && (
            <div style={{background:G.redL,border:"1px solid #FECACA",borderRadius:8,padding:"10px 14px",color:G.red,fontSize:13,marginBottom:14,fontWeight:500}}>
              ⚠️ {err}
            </div>
          )}
          <button
            onClick={()=>go()}
            disabled={busy||!email||!pass}
            style={{width:"100%",padding:"13px 0",background:(busy||!email||!pass)?"#94A3B8":G.red,color:"white",border:"none",borderRadius:10,fontSize:14.5,fontWeight:700,cursor:(busy||!email||!pass)?"not-allowed":"pointer"}}>
            {busy ? "Signing in…" : "Sign In →"}
          </button>
        </div>

      </div>
    </div>
  );
}