import React, { useState, useCallback } from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  NavLink,
} from "react-router-dom";

import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import RoomPage from "./pages/RoomPage";
import DeviceSettingsPage from "./pages/DeviceSettingsPage";

import "./styles.css";
import { logout as apiLogout } from "./api";

/**
 * Small helper to DRY up the "user ? children : redirect" logic.
 */
const ProtectedRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const App = () => {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("authUser");
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      // If parsing fails, clear bad data and start fresh
      localStorage.removeItem("authUser");
      localStorage.removeItem("authToken");
      return null;
    }
  });

  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    try {
      await apiLogout();
    } catch (err) {
      // If logout API fails (e.g., already invalid token), we still want to log out locally
      console.warn("Logout error (ignored):", err);
    } finally {
      setUser(null);
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const handleAuthSuccess = useCallback(
    (data) => {
      // Expecting data.user from LoginPage when login succeeds
      setUser(data.user);
      navigate("/", { replace: true });
    },
    [navigate]
  );

  return (
    <Routes>
      {/* Public: login */}
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/" replace />
          ) : (
            <LoginPage onAuthSuccess={handleAuthSuccess} />
          )
        }
      />

      {/* Authenticated: dashboard */}
      <Route
        path="/"
        element={
          <ProtectedRoute user={user}>
            <DashboardLayout user={user} onLogout={handleLogout}>
              <DashboardPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Authenticated: room view */}
      <Route
        path="/rooms/:roomId"
        element={
          <ProtectedRoute user={user}>
            <DashboardLayout user={user} onLogout={handleLogout}>
              <RoomPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Authenticated: device settings */}
      <Route
        path="/devices/:deviceId/settings"
        element={
          <ProtectedRoute user={user}>
            <DashboardLayout user={user} onLogout={handleLogout}>
              <DeviceSettingsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Fallback: unknown routes → dashboard or login */}
      <Route
        path="*"
        element={
          user ? <Navigate to="/" replace /> : <Navigate to="/login" replace />
        }
      />
    </Routes>
  );
};

const DashboardLayout = ({ user, onLogout, children }) => {
  const navLinkClass = ({ isActive }) =>
    "sidebar-link " + (isActive ? "sidebar-link-active" : "sidebar-link-idle");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-circle">HA</div>
          <div>
            <h1 className="logo-text">Home Automation Hub</h1>
            <p className="logo-sub">Your home, at a glance</p>
          </div>
        </div>

        <div className="sidebar-user">
          <span className="sidebar-user-name">{user?.username}</span>
          <button className="sidebar-logout" type="button" onClick={onLogout}>
            Log out
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" className={navLinkClass} end>
            Dashboard
          </NavLink>
          {/* Future links:
            <NavLink to="/scenes" className={navLinkClass}>Scenes</NavLink>
            <NavLink to="/settings" className={navLinkClass}>Settings</NavLink>
          */}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footer-text">
            Integrate Google Home, Nest, Ring &amp; more.
          </p>
        </div>
      </aside>

      <main className="app-main">{children}</main>
    </div>
  );
};

export default App;