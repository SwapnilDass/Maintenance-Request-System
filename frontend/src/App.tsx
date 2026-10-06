import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { SubmitRequestPage } from "./pages/SubmitRequestPage";
import "./App.css";

function AppContent() {
  const { user, logout } = useAuth();
  // bumped after a successful submit so "My requests" reloads and shows the new one
  const [requestsVersion, setRequestsVersion] = useState(0);

  // no user yet = show the login form, this is our only route guard for now
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="page-center">
      <div className="card">
        <h1>Maintenance Requests</h1>
        <p className="welcome-text">
          Welcome, {user.name} ({user.role})
        </p>
        <button className="btn-primary" onClick={logout}>
          Log out
        </button>
      </div>
      <SubmitRequestPage onSubmitted={() => setRequestsVersion((v) => v + 1)} />
      <MyRequestsPage refreshKey={requestsVersion} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
