import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import HomePage         from "./pages/HomePage";
import LoginPage        from "./pages/LoginPage";
import ReceptionistDash from "./pages/ReceptionistDashboard";
import DoctorDash       from "./pages/DoctorDashboard";
import StaffDash        from "./pages/StaffDashboard";

function LoadingScreen() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0B1F3A" }}>
      <div style={{ textAlign:"center", color:"white", fontFamily:"sans-serif" }}>
        <div style={{ fontSize:52 }}>🏥</div>
        <div style={{ marginTop:14, fontSize:15, opacity:.5 }}>Loading LifeCare…</div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user)    return <Navigate to="/dashboard" replace />;
  return children;
}

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/"); };
  const props = { onLogout: handleLogout };

  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      {user.role === "Receptionist" && <ReceptionistDash {...props} />}
      {user.role === "Doctor"        && <DoctorDash       {...props} />}
      {user.role === "Staff"         && <StaffDash        {...props} />}
    </>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><HomePage /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}