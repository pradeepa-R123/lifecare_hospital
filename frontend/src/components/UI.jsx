export const G = {
  navy:"#0B1F3A", navyD:"#071429", navyL:"#132845",
  red:"#C8102E",  redL:"#FFF0F2",  white:"#FFFFFF",
  bg:"#F1F5F9",   ivory:"#FAF8F5", border:"#E2E8F0",
  muted:"#64748B",text:"#1E293B",
  green:"#0A7A50",greenL:"#ECFDF5",
  blue:"#1D4ED8", blueL:"#EFF6FF",
  orange:"#C2690A",orangeL:"#FFF7ED",
  purple:"#6D28D9",purpleL:"#F5F3FF",
  teal:"#0D7490", tealL:"#ECFEFF",
};

// ✅ CHANGE 1: "Pediatrics" → "General Physician" globally
export const DEPTS = [
  "Cardiology",
  "Neurology",
  "Orthopedics",
  "Emergency",
  "General Physician",   // ← was "Pediatrics"
];

export const BLOOD_GROUPS = ["A+","A-","B+","B-","O+","O-","AB+","AB-"];

export const DOCTOR_BY_DEPT = {
  Cardiology:        "Dr. Ravi",
  Neurology:         "Dr. Ramesh",
  Orthopedics:       "Dr. Meena",
  Emergency:         "Dr. Suresh",
  "General Physician": "Dr. Priya",  
};

export const PATIENT_STATUSES = ["Waiting", "Admitted", "Surgery Scheduled"];

// ✅ CHANGE 2: Add visit statuses to statusStyle
export const VISIT_STATUS_LABELS = {
  WAITING:         "Waiting",
  IN_CONSULTATION: "In Consultation",
  COMPLETED:       "Completed",
  ADMITTED:        "Admitted",
  SURGERY:         "Surgery Scheduled",
  DISCHARGED:      "Discharged",
};

export const inp = (extra={}) => ({
  width:"100%", padding:"10px 14px", border:`1.5px solid ${G.border}`,
  borderRadius:9, fontSize:13.5, fontFamily:"'DM Sans',sans-serif",
  outline:"none", background:G.white, boxSizing:"border-box",
  color:G.text, ...extra,
});

const SC = {
  // Blood request statuses
  Pending:              { bg:G.orangeL, c:G.orange },
  "Sent to Blood Bank": { bg:G.purpleL, c:G.purple },
  "Requested By Doctor":{ bg:G.blueL,   c:G.blue   },
  Approved:             { bg:G.blueL,   c:G.blue   },
  Fulfilled:            { bg:G.greenL,  c:G.green  },
  Rejected:             { bg:"#FEE2E2", c:"#B91C1C"},
  // Patient statuses
  Waiting:              { bg:G.orangeL, c:G.orange },
  Admitted:             { bg:G.blueL,   c:G.blue   },
  "Surgery Scheduled":  { bg:G.purpleL, c:G.purple },
  DISCHARGED:           { bg:G.greenL,  c:G.green  },
  // Surgery statuses
  Scheduled:            { bg:G.purpleL, c:G.purple },
  Completed:            { bg:G.greenL,  c:G.green  },
  Cancelled:            { bg:"#FEE2E2", c:"#B91C1C"},
  // Visit statuses
  WAITING:              { bg:G.orangeL,  c:G.orange  },
  IN_CONSULTATION:      { bg:G.blueL,    c:G.blue    },
  COMPLETED:            { bg:G.greenL,   c:G.green   },
  ADMITTED:             { bg:"#EDE9FE",  c:"#5B21B6" },
  SURGERY:              { bg:G.purpleL,  c:G.purple  },
};

export const statusStyle = s => SC[s] || { bg:G.bg, c:G.muted };

export const Badge = ({label,color=G.blue,bg=G.blueL,size=11.5})=>(
  <span style={{background:bg,color,padding:"3px 10px",borderRadius:20,
    fontSize:size,fontWeight:700,letterSpacing:.3,whiteSpace:"nowrap"}}>
    {label}
  </span>
);

export const Stat = ({icon,value,label,color=G.navy,bg=G.white})=>(
  <div style={{background:bg,border:`1.5px solid ${G.border}`,borderRadius:14,
    padding:"18px 20px",flex:1,minWidth:130}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:24}}>{icon}</span>
      <span style={{fontSize:30,fontWeight:800,color}}>{value}</span>
    </div>
    <div style={{fontSize:12.5,color:G.muted,marginTop:6,fontWeight:500}}>{label}</div>
  </div>
);

export const Card = ({children,style={}})=>(
  <div style={{background:G.white,border:`1.5px solid ${G.border}`,
    borderRadius:14,overflow:"hidden",...style}}>{children}</div>
);

export const CardHead = ({title,right})=>(
  <div style={{padding:"15px 20px",borderBottom:`1px solid ${G.border}`,
    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
    <div style={{fontSize:14,fontWeight:700,color:G.navy}}>{title}</div>
    {right}
  </div>
);

export const THead = ({cols})=>(
  <thead><tr style={{background:G.bg}}>
    {cols.map(c=>(
      <th key={c} style={{padding:"10px 16px",fontSize:11,fontWeight:700,
        color:G.muted,textAlign:"left",letterSpacing:.6,whiteSpace:"nowrap"}}>
        {c}
      </th>
    ))}
  </tr></thead>
);

export const PageHeader = ({title,sub})=>(
  <div style={{marginBottom:22}}>
    <h1 style={{fontSize:22,fontWeight:800,color:G.navy,margin:0}}>{title}</h1>
    {sub&&<p style={{color:G.muted,fontSize:13,marginTop:4,margin:"4px 0 0"}}>{sub}</p>}
  </div>
);

const SideBtn = ({icon,label,active,onClick,badge})=>(
  <button onClick={onClick} style={{
    width:"100%",display:"flex",alignItems:"center",gap:10,
    padding:"11px 15px",borderRadius:10,border:"none",cursor:"pointer",
    fontFamily:"'DM Sans',sans-serif",fontSize:13.5,marginBottom:3,
    fontWeight:active?700:400,textAlign:"left",
    background:active?"rgba(200,16,46,.2)":"transparent",
    color:active?G.white:"rgba(255,255,255,.6)",
    borderLeft:active?`3px solid ${G.red}`:"3px solid transparent",
    justifyContent:"space-between",
  }}>
    <span style={{display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:17}}>{icon}</span>{label}
    </span>
    {badge?<span style={{background:G.red,color:"white",borderRadius:20,
      fontSize:10,fontWeight:700,padding:"1px 7px"}}>{badge}</span>:null}
  </button>
);

export const Sidebar = ({role,dept,name,tab,setTab,onLogout,tabs})=>(
  <div style={{width:258,background:G.navy,display:"flex",flexDirection:"column",
    position:"fixed",top:0,left:0,height:"100vh",zIndex:100,
    boxShadow:"4px 0 24px rgba(0,0,0,.18)"}}>
    <div style={{padding:"20px 18px",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:40,height:40,background:G.red,borderRadius:10,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>🏥</div>
        <div>
          <div style={{color:G.white,fontWeight:700,fontSize:14}}>HealthCare Hospital</div>
          <div style={{color:"rgba(255,255,255,.35)",fontSize:10,letterSpacing:1,
            textTransform:"uppercase"}}>{role} Portal</div>
        </div>
      </div>
    </div>
    <div style={{padding:"13px 18px",borderBottom:"1px solid rgba(255,255,255,.08)"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,background:"rgba(200,16,46,.25)",borderRadius:9,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>
          {role==="Doctor"?"👨‍⚕️":role==="Receptionist"?"🧾":"🩺"}
        </div>
        <div>
          <div style={{color:G.white,fontSize:13,fontWeight:600}}>{name}</div>
          <div style={{color:"rgba(255,255,255,.38)",fontSize:11}}>
            {role}{dept?` · ${dept}`:""}
          </div>
        </div>
      </div>
    </div>
    <nav style={{flex:1,padding:"12px 10px",overflowY:"auto"}}>
      {tabs.map(t=>(
        <SideBtn key={t.id} icon={t.icon} label={t.label}
          active={tab===t.id} onClick={()=>setTab(t.id)} badge={t.badge}/>
      ))}
    </nav>
    <div style={{padding:"12px 10px",borderTop:"1px solid rgba(255,255,255,.08)"}}>
      <button onClick={onLogout} style={{width:"100%",padding:"10px 14px",
        background:"rgba(200,16,46,.1)",border:"1px solid rgba(200,16,46,.25)",
        borderRadius:10,color:"rgba(255,120,120,.9)",cursor:"pointer",
        fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:600,textAlign:"left"}}>
        🚪 Logout
      </button>
    </div>
  </div>
);

export const ProfileCard = ({name,role,dept,email,specialization,experience,
  education,studiedAt})=>{
  const icons={Doctor:"👨‍⚕️",Receptionist:"🧾",Staff:"🩺"};
  const rows=[
    ["Role",role],["Department",dept||"General"],["Email",email||"—"],
    ...(specialization?[["Specialization",specialization]]:[]),
    ...(experience?[["Experience",experience]]:[]),
    ...(education?[["Education",education]]:[]),
    ...(studiedAt?[["Studied At",studiedAt]]:[]),
    ["Status","✅ Active"],
  ];
  return(
    <div style={{background:G.white,borderRadius:16,padding:28,
      border:`1.5px solid ${G.border}`,maxWidth:520}}>
      <div style={{fontSize:48,marginBottom:12}}>{icons[role]||"👤"}</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,
        fontWeight:800,color:G.navy}}>{name}</div>
      <div style={{color:G.muted,fontSize:13.5,marginTop:4}}>
        {role}{dept?` · ${dept}`:""} HealthCare Hospital
      </div>
      <div style={{marginTop:20,display:"grid",gap:9}}>
        {rows.map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",
            padding:"11px 14px",background:G.bg,borderRadius:9,fontSize:13.5}}>
            <span style={{color:G.muted,fontWeight:500}}>{k}</span>
            <span style={{fontWeight:700,color:G.navy}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
};