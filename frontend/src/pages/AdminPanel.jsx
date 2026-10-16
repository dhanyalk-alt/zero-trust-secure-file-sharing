import React, { useState, useEffect } from 'react';
import { adminAPI } from '../api/client';
import {
  Users,
  HardDrive,
  Shield,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, icon: Icon }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: `rgba(${color}, 0.15)`, color: `rgb(${color})`, flexShrink: 0 }}>
        <Icon size={22} />
      </div>
      <div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{value}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{label}</div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [files, setFiles] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('stats');
  const [userSearch, setUserSearch] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await adminAPI.getSystemStats();
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load system stats.');
    }
  };

  const fetchUsers = async () => {
    try {
      const params = {};
      if (userSearch) params.search = userSearch;
      const res = await adminAPI.listUsers(params);
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load users.');
    }
  };

  const fetchFiles = async () => {
    try {
      const params = { include_deleted: false };
      if (fileSearch) params.search = fileSearch;
      const res = await adminAPI.listFiles(params);
      setFiles(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load files.');
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await adminAPI.getAuditLogs({ limit: 100 });
      setAuditLogs(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load audit logs.');
    }
  };

  const loadAll = async () => {
    setLoading(true); setError('');
    await Promise.all([fetchStats(), fetchUsers(), fetchFiles(), fetchAuditLogs()]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (activeSection === 'users') fetchUsers(); }, [userSearch]);
  useEffect(() => { if (activeSection === 'files') fetchFiles(); }, [fileSearch]);

  const handleUserUpdate = async (userId, data) => {
    setUpdatingUserId(userId);
    try {
      await adminAPI.updateUser(userId, data);
      await fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update user.');
    } finally { setUpdatingUserId(null); }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const sections = [
    { id: 'stats', label: 'System Stats', icon: Shield },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'files', label: 'Files', icon: HardDrive },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ marginBottom: '12px', color: 'var(--accent-blue)' }} />
        <p>Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={24} style={{ color: 'var(--accent-rose)' }} /> Admin Control Panel
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            System-wide management. All actions are audit-logged. Zero Trust enforced on every request.
          </p>
        </div>
        <button onClick={loadAll} className="btn-secondary" disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          <span>Refresh All</span>
        </button>
      </div>

      {error && (
        <div className="alert-box alert-danger">
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: activeSection === id ? 'var(--accent-blue)' : 'transparent',
              color: activeSection === id ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}
          >
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* ── System Stats ─────────────────────────────────────────────────────── */}
      {activeSection === 'stats' && stats && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <StatCard label="Total Users" value={stats.total_users} color="59,130,246" icon={Users} />
            <StatCard label="Active Users" value={stats.active_users} color="16,185,129" icon={CheckCircle} />
            <StatCard label="Locked Users" value={stats.locked_users} color="244,63,94" icon={Lock} />
            <StatCard label="Total Files" value={stats.total_files} color="6,182,212" icon={HardDrive} />
            <StatCard label="Deleted Files" value={stats.deleted_files} color="156,163,175" icon={XCircle} />
            <StatCard label="Expired Files" value={stats.expired_files} color="245,158,11" icon={AlertTriangle} />
            <StatCard label="Total Permissions" value={stats.total_permissions} color="139,92,246" icon={Shield} />
            <StatCard label="Revoked Permissions" value={stats.revoked_permissions} color="244,63,94" icon={XCircle} />
            <StatCard label="Total Audit Logs" value={stats.total_audit_logs} color="59,130,246" icon={FileText} />
            <StatCard label="Denied Events" value={stats.denied_events} color="244,63,94" icon={AlertTriangle} />
            <StatCard label="Tamper Alerts" value={stats.tamper_alerts} color="244,63,94" icon={Shield} />
          </div>
        </div>
      )}

      {/* ── Users ────────────────────────────────────────────────────────────── */}
      {activeSection === 'users' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Users ({users.length})</span>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search users..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', width: '200px', height: '34px', fontSize: '0.85rem' }}
              />
            </div>
          </div>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Keys</th>
                  <th>Files</th>
                  <th>Failed Logins</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.username}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{u.email}</div>
                    </td>
                    <td>
                      <span className={`badge ${u.role === 'ADMIN' ? 'badge-danger' : 'badge-info'}`}>{u.role}</span>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>
                        <span className={`badge ${u.has_encryption_key ? 'badge-success' : 'badge-danger'}`} style={{ marginRight: '4px' }}>Enc</span>
                        <span className={`badge ${u.has_signing_key ? 'badge-success' : 'badge-danger'}`}>Sign</span>
                      </div>
                    </td>
                    <td>{u.files_owned}</td>
                    <td style={{ color: u.failed_login_count > 0 ? 'var(--accent-rose)' : 'inherit' }}>
                      {u.failed_login_count}
                      {u.lockout_until && <div style={{ fontSize: '0.75rem', color: 'var(--accent-amber)' }}>Locked</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleUserUpdate(u.id, { is_active: !u.is_active })}
                          className={u.is_active ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                          disabled={updatingUserId === u.id}
                          title={u.is_active ? 'Deactivate user' : 'Activate user'}
                        >
                          {u.is_active ? <Lock size={13} /> : <Unlock size={13} />}
                          <span>{u.is_active ? 'Deactivate' : 'Activate'}</span>
                        </button>
                        {u.lockout_until && (
                          <button
                            onClick={() => handleUserUpdate(u.id, { clear_lockout: true })}
                            className="btn-secondary btn-sm"
                            disabled={updatingUserId === u.id}
                            title="Clear lockout"
                          >
                            <Unlock size={13} style={{ color: 'var(--accent-emerald)' }} />
                            <span>Unlock</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleUserUpdate(u.id, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}
                          className="btn-secondary btn-sm"
                          disabled={updatingUserId === u.id}
                          title="Toggle admin role"
                        >
                          <Shield size={13} style={{ color: 'var(--accent-purple)' }} />
                          <span>{u.role === 'ADMIN' ? '→ User' : '→ Admin'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Files ────────────────────────────────────────────────────────────── */}
      {activeSection === 'files' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>All Files ({files.length})</span>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search files..."
                value={fileSearch}
                onChange={e => setFileSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', width: '200px', height: '34px', fontSize: '0.85rem' }}
              />
            </div>
          </div>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Owner</th>
                  <th>Size</th>
                  <th>Permissions</th>
                  <th>Expiry</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{f.original_filename}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{f.mime_type}</div>
                    </td>
                    <td><span className="badge badge-info">{f.owner_username}</span></td>
                    <td>{formatBytes(f.file_size)}</td>
                    <td>
                      <span className="badge badge-success">{f.active_permissions} active</span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {f.expires_at ? new Date(f.expires_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {new Date(f.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Audit Logs ───────────────────────────────────────────────────────── */}
      {activeSection === 'audit' && (
        <div className="card">
          <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '16px' }}>
            System Audit Log — last {auditLogs.length} events
          </div>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>User</th>
                  <th>Resource</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((ev) => (
                  <tr key={ev.id}>
                    <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: '0.82rem' }}>{ev.action}</td>
                    <td>
                      <span className={`badge ${
                        ev.status === 'SUCCESS' ? 'badge-success' :
                        ev.status === 'TAMPERED' || ev.status === 'DENIED' ? 'badge-danger' :
                        'badge-warning'
                      }`}>{ev.status}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{ev.username || 'System'}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{ev.resource_name || ev.resource_id || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '280px' }}>{ev.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
