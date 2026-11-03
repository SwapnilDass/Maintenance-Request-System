import { useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { homeFor } from "./auth/roles";
import { AdminCategoriesPage } from "./pages/AdminCategoriesPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AllRequestsPage } from "./pages/AllRequestsPage";
import { AssignedRequestsPage } from "./pages/AssignedRequestsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { SubmitRequestPage } from "./pages/SubmitRequestPage";
import "./App.css";

// the tabs managers and admins use to move between their pages (sprint 3)
const MANAGER_TABS = [
  { to: "/manager", label: "Requests" },
  { to: "/manager/dashboard", label: "Dashboard" },
];
const ADMIN_TABS = [
  { to: "/admin", label: "Users" },
  { to: "/admin/categories", label: "Categories" },
  { to: "/admin/dashboard", label: "Dashboard" },
  { to: "/admin/requests", label: "Requests" },
];

// header card with the welcome message + log out, shown on every logged in page.
// tabs (optional) shows a row of links under it
function Layout({ children, tabs }: { children: ReactNode; tabs?: { to: string; label: string }[] }) {
  const { user, logout } = useAuth();

  return (
    <div className="page-center">
      <div className="card">
        <h1>Maintenance Requests</h1>
        <p className="welcome-text">
          Welcome, {user?.name} ({user?.role})
        </p>
        <button className="btn-primary" onClick={logout}>
          Log out
        </button>
      </div>
      {tabs && (
        <nav className="tabs" aria-label="Sections">
          {tabs.map((t) => (
            // end = only highlight /manager on /manager itself, not on /manager/dashboard
            <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? "tab tab-active" : "tab")}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
      {children}
    </div>
  );
}

// the customer/employee page - submit a request + see my requests (stories #2 and #3)
function CustomerHome() {
  // bumped after a successful submit so "My requests" reloads and shows the new one
  const [requestsVersion, setRequestsVersion] = useState(0);

  return (
    <Layout>
      <SubmitRequestPage onSubmitted={() => setRequestsVersion((v) => v + 1)} />
      <MyRequestsPage refreshKey={requestsVersion} />
    </Layout>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* already logged in -> skip the login page */}
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <LoginPage />} />

      <Route
        path="/requests"
        element={
          <ProtectedRoute roles={["CUSTOMER"]}>
            <CustomerHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/technician"
        element={
          <ProtectedRoute roles={["TECHNICIAN"]}>
            <Layout>
              <AssignedRequestsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager"
        element={
          <ProtectedRoute roles={["MANAGER"]}>
            <Layout tabs={MANAGER_TABS}>
              <AllRequestsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      {/* manager dashboard (story #11) */}
      <Route
        path="/manager/dashboard"
        element={
          <ProtectedRoute roles={["MANAGER"]}>
            <Layout tabs={MANAGER_TABS}>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      {/* admin pages (sprint 3): users (#9), categories (#10), plus the manager's dashboard and request list */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Layout tabs={ADMIN_TABS}>
              <AdminUsersPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/categories"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Layout tabs={ADMIN_TABS}>
              <AdminCategoriesPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Layout tabs={ADMIN_TABS}>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/requests"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Layout tabs={ADMIN_TABS}>
              <AllRequestsPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* request detail with notes (story #7) - every role can open it, the backend checks they're allowed to see that request */}
      <Route
        path="/requests/:id"
        element={
          <ProtectedRoute roles={["CUSTOMER", "TECHNICIAN", "MANAGER", "ADMIN"]}>
            <Layout>
              <RequestDetailPage />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* anything else -> your own home page, or login if you're logged out */}
      <Route path="*" element={<Navigate to={user ? homeFor(user.role) : "/login"} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
