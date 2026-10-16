import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MyFiles from './pages/MyFiles';
import SharedWithMe from './pages/SharedWithMe';
import AuditLogs from './pages/AuditLogs';
import KeyManagement from './pages/KeyManagement';
import AdminPanel from './pages/AdminPanel';
import Organizations from './pages/Organizations';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import PublicAccess from './pages/PublicAccess';

export default function App() {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState('login'); // 'login' | 'register'
  const [activeTab, setActiveTab] = useState('dashboard');

  // Direct public access to shared file links without authentication
  const shareToken = new URLSearchParams(window.location.search).get('share');
  if (shareToken) {
    return <PublicAccess token={shareToken} />;
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)'
      }}>
        Loading Zero Trust Vault...
      </div>
    );
  }

  if (!user) {
    if (authView === 'register') {
      return <Register onSwitchToLogin={() => setAuthView('login')} />;
    }
    return <Login onSwitchToRegister={() => setAuthView('register')} />;
  }

  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="app-container">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
        {activeTab === 'my-files' && <MyFiles setActiveTab={setActiveTab} />}
        {activeTab === 'shared' && <SharedWithMe setActiveTab={setActiveTab} />}
        {activeTab === 'organizations' && <Organizations setActiveTab={setActiveTab} />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'settings' && <Settings />}
        {activeTab === 'audit' && <AuditLogs />}
        {activeTab === 'keys' && <KeyManagement />}
        {activeTab === 'admin' && isAdmin && <AdminPanel />}
        {activeTab === 'admin' && !isAdmin && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            <p>Access denied: Admin privilege required.</p>
          </div>
        )}
      </main>
    </div>
  );
}
