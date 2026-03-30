import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const G = {
  navy:"#0B1F3A", navyD:"#071429", red:"#C8102E", redL:"#FFF0F2",
  white:"#FFFFFF", ivory:"#FAF8F5", border:"#E2E8F0",
  muted:"#64748B", text:"#1E293B"
};

const DEPTS = [
  { name:"Cardiology",   icon:"❤️",  desc:"Heart & vascular care",           doctor:"Dr. Ravi" },
  { name:"Neurology",    icon:"🧠",  desc:"Brain & nervous system disorders", doctor:"Dr. Ramesh" },
  { name:"Orthopedics",  icon:"🦴",  desc:"Bone, joint & spine surgery",      doctor:"Dr. Meena" },
  { name:"Emergency",    icon:"🚨",  desc:"24/7 critical & trauma care",      doctor:"Dr. Suresh" },
  { name:"General Physician", icon:"🩺",  desc:"General health & primary care",    doctor:"Dr. Priya" },
];

const DOCTORS = [
  { name:"Dr. Ravi",   dept:"Cardiology",  spec:"Interventional Cardiology",   exp:"16 yrs", edu:"MBBS, DM — AIIMS Delhi" },
  { name:"Dr. Ramesh", dept:"Neurology",   spec:"Neurosurgery",                exp:"11 yrs", edu:"MBBS, DM — CMC Vellore" },
  { name:"Dr. Meena",  dept:"Orthopedics", spec:"Joint Replacement Surgery",   exp:"10 yrs", edu:"MBBS, MS — JIPMER" },
  { name:"Dr. Suresh", dept:"Emergency",   spec:"Emergency & Trauma Medicine", exp:"8 yrs",  edu:"MBBS, MD — Madras Medical" },
    { name:"Dr. Priya",  dept:"General Physician",  spec:"General Medicine & Primary Care", exp:"7 yrs", edu:"MBBS, DCH — SRMC Chennai" },
];

function Footer() {
  return (
    <div style={{ background:G.navyD, padding:"11px 32px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", borderTop:"1px solid rgba(255,255,255,.07)" }}>
      <span style={{color:"rgba(255,255,255,.35)",fontSize:12}}>🏥 HealthCare Hospital · No. 12, Anna Salai, Chennai – 600002</span>
      <span style={{color:"rgba(255,255,255,.22)",fontSize:12}}>© 2026 HealthCare Hospital. All rights reserved.</span>
      <span style={{color:"rgba(255,255,255,.35)",fontSize:12}}>🚨 Emergency: 1800-HEALTHCARE</span>
    </div>
  );
}

function FloatingChat() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ position:"fixed", bottom:28, right:28, zIndex:9999, width:54, height:54, borderRadius:"50%", background:"linear-gradient(135deg,#1a4a6b,#2563a0)", border:"none", cursor:"pointer", fontSize:24, boxShadow:"0 6px 24px rgba(0,0,0,.28)", display:"flex", alignItems:"center", justifyContent:"center" }} title="AI Assistant">🤖</button>
      {open && (
        <div style={{ position:"fixed", bottom:92, right:28, zIndex:9998, width:310, background:"white", borderRadius:16, boxShadow:"0 12px 48px rgba(0,0,0,.22)", border:"1px solid #e2e8f0", overflow:"hidden", fontFamily:"'DM Sans',sans-serif" }}>
          <div style={{background:"linear-gradient(135deg,#1a4a6b,#2563a0)",padding:"13px 15px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <span style={{fontSize:20}}>🤖</span>
              <div>
                <div style={{color:"white",fontWeight:700,fontSize:13}}>HealthCare AI</div>
                <div style={{color:"rgba(255,255,255,.6)",fontSize:11}}>Available 24/7</div>
              </div>
            </div>
            <button onClick={()=>setOpen(false)} style={{background:"rgba(255,255,255,.15)",border:"none",color:"white",borderRadius:6,padding:"2px 8px",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>✕</button>
          </div>
          <div style={{padding:"13px 13px 8px"}}>
            <div style={{fontSize:12,color:G.muted,marginBottom:9}}>How can I help you today?</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {["📅 Book Appointment","🩸 Blood Request","👨‍⚕️ Find a Doctor","📞 Emergency Info"].map(t=>(
                <button key={t} style={{ background:G.ivory,border:"1px solid "+G.border,borderRadius:20,padding:"5px 10px",fontSize:11,color:G.text,cursor:"pointer",fontFamily:"inherit" }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{padding:"8px 13px 13px",display:"flex",gap:7}}>
            <input placeholder="Type your message..." style={{ flex:1,border:"1px solid "+G.border,borderRadius:20,padding:"8px 13px",fontSize:12.5,outline:"none",fontFamily:"inherit" }}/>
            <button style={{ background:"#2563a0",border:"none",borderRadius:20,color:"white",padding:"8px 13px",fontSize:13,cursor:"pointer" }}>→</button>
          </div>
        </div>
      )}
    </>
  );
}

// ✅ uses useNavigate instead of onEnterPortal prop
function HomeSection() {
  const navigate = useNavigate();
  const [cnt, setCnt] = useState({ p:0, d:0, y:0 });

  useEffect(() => {
    let step = 0;
    const t = setInterval(() => {
      step++;
      const e = step/60<.5 ? 2*(step/60)**2 : -1+(4-2*(step/60))*(step/60);
      setCnt({ p:Math.round(50000*e), d:Math.round(5*e), y:Math.round(25*e) });
      if (step >= 60) clearInterval(t);
    }, 28);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{ flex:1, background:`linear-gradient(135deg,${G.navyD},${G.navy} 55%,#1e3a5f)`, display:"flex", alignItems:"center", position:"relative", overflow:"hidden" }}>
        {[380,260,165].map((s,i)=>(
          <div key={i} style={{ position:"absolute", right:(-60+i*30)+"px", top:(-80+i*40)+"px", width:s, height:s, borderRadius:"50%", background:"rgba(200,16,46,.06)", pointerEvents:"none" }}/>
        ))}
        <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 40px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:48, alignItems:"center", width:"100%", boxSizing:"border-box" }}>
          <div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:8, background:"rgba(200,16,46,.15)", border:"1px solid rgba(200,16,46,.3)", borderRadius:20, padding:"5px 14px", marginBottom:18 }}>
              <span style={{width:6,height:6,background:G.red,borderRadius:"50%",display:"inline-block"}}/>
              <span style={{color:"rgba(220,100,100,.9)",fontSize:12,fontWeight:600,letterSpacing:.5}}>NABH Accredited</span>
            </div>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:46, fontWeight:800, color:"white", lineHeight:1.1, marginBottom:16, marginTop:0 }}>
              Advanced Care,<br/><span style={{color:G.red}}>Compassionate</span><br/>Healing
            </h1>
            <p style={{color:"rgba(255,255,255,.58)",fontSize:14.5,lineHeight:1.8,marginBottom:26,maxWidth:440}}>
              Chennai's trusted multi-specialty hospital with expert doctors across Cardiology, Neurology, Orthopedics, Emergency, and General Physician
            </p>
            {/* ✅ navigate("/login") instead of onEnterPortal() */}
            <button onClick={() => navigate("/login")} style={{ padding:"12px 28px", background:G.red, color:"white", border:"none", borderRadius:10, fontSize:14, fontWeight:700, cursor:"pointer" }}>
              Doctor / Staff Login →
            </button>
            <div style={{ display:"flex", gap:28, marginTop:28, paddingTop:20, borderTop:"1px solid rgba(255,255,255,.08)" }}>
              {[[`${Math.round(cnt.p/1000)}K+`,"Patients Treated"],[`${cnt.d}`,"Specialist Doctors"],[`${cnt.y}+`,"Years of Care"]].map(([v,l])=>(
                <div key={l}>
                  <div style={{color:"white",fontSize:24,fontWeight:800,fontFamily:"'Playfair Display',serif"}}>{v}</div>
                  <div style={{color:"rgba(255,255,255,.4)",fontSize:11.5,marginTop:2}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"center"}}>
            <div style={{animation:"float 4s ease-in-out infinite"}}>
              <div style={{width:260,height:260,borderRadius:"50%",background:"rgba(200,16,46,.07)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{width:200,height:200,borderRadius:"50%",background:"rgba(200,16,46,.09)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{ width:148, height:148, borderRadius:"50%", background:`linear-gradient(135deg,${G.red},#1e3a5f)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:60, boxShadow:"0 16px 50px rgba(200,16,46,.4)" }}>🏥</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer/>
    </div>
  );
}

function DepartmentsSection() {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:G.white,overflow:"hidden"}}>
      <div style={{ flex:1, maxWidth:1200, margin:"0 auto", padding:"32px 36px 20px", width:"100%", boxSizing:"border-box", display:"flex", flexDirection:"column" }}>
        <div style={{textAlign:"center",marginBottom:24,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:3,color:G.red,textTransform:"uppercase",marginBottom:6}}>OUR SPECIALTIES</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:800,color:G.navy,margin:0}}>Medical Departments</h2>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14}}>
          {DEPTS.map(d=>(
            <div key={d.name} style={{ background:G.ivory, border:`1.5px solid ${G.border}`, borderRadius:14, padding:"18px 15px", display:"flex", flexDirection:"column", gap:7 }}>
              <div style={{width:44,height:44,background:G.redL,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:21}}>{d.icon}</div>
              <div style={{fontWeight:700,color:G.navy,fontSize:13.5}}>{d.name}</div>
              <div style={{color:G.muted,fontSize:12,lineHeight:1.55,flex:1}}>{d.desc}</div>
              <div style={{color:G.red,fontSize:12,fontWeight:600}}>👨‍⚕️ {d.doctor}</div>
            </div>
          ))}
        </div>
      </div>
      <Footer/>
    </div>
  );
}

function DoctorsSection() {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:G.ivory,overflow:"hidden"}}>
      <div style={{ flex:1, maxWidth:1200, margin:"0 auto", padding:"32px 36px 20px", width:"100%", boxSizing:"border-box", display:"flex", flexDirection:"column" }}>
        <div style={{textAlign:"center",marginBottom:24,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:3,color:G.red,textTransform:"uppercase",marginBottom:6}}>OUR TEAM</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:800,color:G.navy,margin:0}}>Meet Our Specialists</h2>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14}}>
          {DOCTORS.map(d=>(
            <div key={d.name} style={{ background:G.white, border:`1.5px solid ${G.border}`, borderRadius:14, padding:"16px 15px", display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ width:50, height:50, borderRadius:"50%", background:`linear-gradient(135deg,${G.navy},#1e3a5f)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, border:`3px solid ${G.redL}` }}>👨‍⚕️</div>
              <div style={{fontWeight:700,color:G.navy,fontSize:13.5}}>{d.name}</div>
              <span style={{ background:G.redL, color:G.red, padding:"2px 9px", borderRadius:20, fontSize:11, fontWeight:700, alignSelf:"flex-start" }}>{d.dept}</span>
              <div style={{color:G.muted,fontSize:11.5,lineHeight:1.6,marginTop:1}}>{d.spec}<br/>⏳ {d.exp} · 🎓 {d.edu}</div>
            </div>
          ))}
        </div>
      </div>
      <Footer/>
    </div>
  );
}

function ContactSection() {
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",background:G.navyD,overflow:"hidden"}}>
      <div style={{ flex:1, maxWidth:1200, margin:"0 auto", padding:"32px 36px 20px", width:"100%", boxSizing:"border-box", display:"flex", flexDirection:"column" }}>
        <div style={{textAlign:"center",marginBottom:28,flexShrink:0}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:3,color:G.red,textTransform:"uppercase",marginBottom:6}}>GET IN TOUCH</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:32,fontWeight:800,color:"white",margin:0}}>Contact Us</h2>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:40}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:22}}>🏥</span>
              <span style={{color:"white",fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:700}}>HealthCare Hospital</span>
            </div>
            <p style={{color:"rgba(255,255,255,.42)",fontSize:13.5,lineHeight:1.8,marginBottom:20}}>
              No. 12, Anna Salai, Chennai – 600002<br/>Tamil Nadu, India<br/>📞 1800-HEALTHCARE
            </p>
            <div style={{background:"rgba(200,16,46,.1)",border:"1px solid rgba(200,16,46,.25)",borderRadius:12,padding:"14px 16px"}}>
              <div style={{color:G.red,fontWeight:700,fontSize:12,marginBottom:9}}>🚨 Emergency Contacts</div>
              {["📞 1800-HEALTHCARE","🚑 +91-44-2345-6789","🩸 +91-44-2345-6700"].map(t=>(
                <div key={t} style={{color:"rgba(255,255,255,.65)",fontSize:13,marginBottom:6}}>{t}</div>
              ))}
            </div>
          </div>
          <div>
            <div style={{color:"white",fontWeight:700,fontSize:13.5,marginBottom:13}}>Departments</div>
            {DEPTS.map(d=>(
              <div key={d.name} style={{color:"rgba(255,255,255,.45)",fontSize:13,marginBottom:9,display:"flex",alignItems:"center",gap:7}}>
                <span>{d.icon}</span>{d.name}
              </div>
            ))}
          </div>
          <div>
            <div style={{color:"white",fontWeight:700,fontSize:13.5,marginBottom:13}}>Hours</div>
            {[["OPD","Mon – Sat, 9 AM – 5 PM"],["Emergency","24 / 7"],["ICU","24 / 7"],["Pharmacy","24 / 7"]].map(([k,v])=>(
              <div key={k} style={{marginBottom:13}}>
                <div style={{color:"rgba(255,255,255,.36)",fontSize:10.5,fontWeight:600,letterSpacing:.8,textTransform:"uppercase",marginBottom:2}}>{k}</div>
                <div style={{color:"rgba(255,255,255,.7)",fontSize:13}}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Footer/>
    </div>
  );
}

// ✅ No more onEnterPortal prop — uses useNavigate internally
export default function HomePage() {
  const navigate = useNavigate();
  const [active, setActive] = useState("Home");
  const NAVS = ["Home","Departments","Doctors","Contact"];

  const renderSection = () => {
    switch(active) {
      case "Home":        return <HomeSection />;
      case "Departments": return <DepartmentsSection />;
      case "Doctors":     return <DoctorsSection />;
      case "Contact":     return <ContactSection />;
      default:            return <HomeSection />;
    }
  };

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{overflow:hidden;height:100%}
        ::-webkit-scrollbar{display:none}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes marquee{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
      `}</style>

      {/* Emergency Ticker */}
      <div style={{background:G.red,color:"white",padding:"7px 0",overflow:"hidden",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center"}}>
          <span style={{background:"rgba(255,255,255,.15)",padding:"0 16px",fontSize:11.5,fontWeight:700,flexShrink:0,letterSpacing:.8}}>🚨 EMERGENCY</span>
          <div style={{overflow:"hidden",flex:1}}>
            <div style={{display:"inline-block",fontSize:11.5,paddingLeft:32,whiteSpace:"nowrap",animation:"marquee 22s linear infinite"}}>
              📞 Emergency: 1800-HEALTHCARE &nbsp;|&nbsp; Ambulance: +91-44-2345-6789 &nbsp;|&nbsp; Blood Bank: +91-44-2345-6700 &nbsp;|&nbsp; 24/7 ICU Available &nbsp;|&nbsp; 📍 No. 12, Anna Salai, Chennai – 600002
            </div>
          </div>
        </div>
      </div>

      {/* Navbar */}
      <nav style={{background:"rgba(11,31,58,0.97)",borderBottom:"1px solid rgba(200,16,46,.2)",padding:"10px 0",flexShrink:0}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:11}}>
            <div style={{width:38,height:38,background:G.red,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19}}>🏥</div>
            <div>
              <div style={{color:"white",fontWeight:800,fontSize:16,fontFamily:"'Playfair Display',serif",lineHeight:1.1}}>HealthCare</div>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:9,letterSpacing:2,textTransform:"uppercase"}}>Hospital</div>
            </div>
          </div>
          <div style={{display:"flex",gap:4,alignItems:"center"}}>
            {NAVS.map(l=>(
              <button key={l} onClick={()=>setActive(l)} style={{ background:active===l ? G.red : "transparent", color:active===l ? "white" : "rgba(255,255,255,.7)", border:"none", borderRadius:8, padding:"7px 18px", fontSize:13.5, fontWeight:active===l ? 700 : 500, cursor:"pointer", transition:"all .18s", fontFamily:"'DM Sans',sans-serif" }}>{l}</button>
            ))}
          </div>
          {/* ✅ navigate("/login") instead of onEnterPortal() */}
          <button onClick={() => navigate("/login")} style={{ padding:"8px 18px", background:G.red, color:"white", border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
            Staff Portal →
          </button>
        </div>
      </nav>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {renderSection()}
      </div>

      <FloatingChat/>
    </div>
  );
}