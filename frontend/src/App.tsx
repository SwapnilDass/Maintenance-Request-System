import { useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { homeFor } from "./auth/roles";
import { LoginPage } from "./pages/LoginPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { RoleHomePage } from "./pages/RoleHomePage";
import { SubmitRequestPage } from "./pages/SubmitRequestPage";
import "./App.css";

// header card with the welcome message + log out, shown on every logged in page
function Layout({ children }: { children: ReactNode }) {
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
              <RoleHomePage role="TECHNICIAN" />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager"
        element={
          <ProtectedRoute roles={["MANAGER"]}>
            <Layout>
              <RoleHomePage role="MANAGER" />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={["ADMIN"]}>
            <Layout>
              <RoleHomePage role="ADMIN" />
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
