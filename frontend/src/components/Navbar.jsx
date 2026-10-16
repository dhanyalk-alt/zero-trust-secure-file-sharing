import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, HardDrive, Share2, FileText, LogOut, User as UserIcon, ShieldAlert, Users, Settings as SettingsIcon, BarChart2, KeyRound } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <header className="navbar">
      <div className="brand" onClick={() => setActiveTab('dashboard')} style={{ cursor: 'pointer' }}>
        <Shield className="brand-icon" size={26} />
        <span>ZeroTrust <span style={{ color: 'var(--accent-blue)', fontWeight: 400 }}>Vault</span></span>
      </div>

      <nav className="nav-links">
        <button
          className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <HardDrive size={18} />
          <span>Dashboard</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'my-files' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-files')}
        >
          <FileText size={18} />
          <span>My Files</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'shared' ? 'active' : ''}`}
          onClick={() => setActiveTab('shared')}
        >
          <Share2 size={18} />
          <span>Shared With Me</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'organizations' ? 'active' : ''}`}
          onClick={() => setActiveTab('organizations')}
        >
          <Users size={18} />
          <span>Organizations</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart2 size={18} />
          <span>Analytics</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon size={18} />
          <span>Settings</span>
        </button>

        <button
          className={`nav-item ${activeTab === 'keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('keys')}
        >
          <KeyRound size={18} />
          <span>Keys</span>
        </button>

        {/* Admin-only tab — only visible to ADMIN role users */}
        {isAdmin && (
          <button
            className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
            style={{ color: activeTab === 'admin' ? '' : 'var(--accent-rose)' }}
            title="Admin Control Panel"
          >
            <ShieldAlert size={18} />
            <span>Admin</span>
          </button>
        )}
      </nav>

      <div className="nav-user">
        <div
          className="user-badge"
          onClick={() => setActiveTab('settings')}
          style={{ cursor: 'pointer' }}
          title="Account Settings"
        >
          {user?.profile_pic ? (
            <img
              src={user.profile_pic}
              alt={user.username}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid var(--accent-blue)'
              }}
            />
          ) : (
            <UserIcon size={14} style={{ color: isAdmin ? 'var(--accent-rose)' : 'var(--accent-emerald)' }} />
          )}
          <span>{user?.username}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>({user?.role})</span>
        </div>

        <button
          onClick={logout}
          className="btn-danger btn-sm"
          title="Sign out and invalidate session token"
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
