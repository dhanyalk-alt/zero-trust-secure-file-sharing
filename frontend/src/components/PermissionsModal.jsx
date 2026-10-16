import React, { useState, useEffect } from 'react';
import { permissionsAPI } from '../api/client';
import { Shield, X, UserMinus, Check, AlertCircle, RefreshCw, Clock } from 'lucide-react';

export default function PermissionsModal({ file, onClose, onUpdated }) {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingWindow, setEditingWindow] = useState(null);
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4]); // Mon-Fri default

  const fetchPermissions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await permissionsAPI.getPermissions(file.id);
      setPermissions(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch file permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (file) {
      fetchPermissions();
    }
  }, [file]);

  const handleRevoke = async (recipientId, username) => {
    if (!window.confirm(`Are you sure you want to REVOKE all access for user '${username}' immediately? This destroys their active decryption key.`)) {
      return;
    }

    setActionLoading(recipientId);
    setError('');
    setNotice('');

    try {
      await permissionsAPI.revokePermission(file.id, recipientId);
      setNotice(`Access revoked immediately for '${username}'.`);
      await fetchPermissions();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to revoke permission.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTogglePermission = async (perm, field) => {
    const updatedValues = {
      can_read: field === 'can_read' ? !perm.can_read : perm.can_read,
      can_download: field === 'can_download' ? !perm.can_download : perm.can_download,
      can_share: field === 'can_share' ? !perm.can_share : perm.can_share,
    };

    setActionLoading(perm.recipient_id);
    setError('');
    setNotice('');

    try {
      await permissionsAPI.updatePermission(file.id, perm.recipient_id, updatedValues);
      setNotice(`Permissions updated for '${perm.recipient_username}'.`);
      await fetchPermissions();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update permission.');
    } finally {
      setActionLoading(null);
    }
  };

  const openWindowEditor = (perm) => {
    if (editingWindow === perm.recipient_id) {
      setEditingWindow(null);
      return;
    }
    setEditingWindow(perm.recipient_id);
    setStartHour(perm.access_start_hour !== null && perm.access_start_hour !== undefined ? String(perm.access_start_hour) : '');
    setEndHour(perm.access_end_hour !== null && perm.access_end_hour !== undefined ? String(perm.access_end_hour) : '');
    if (perm.access_days) {
      setSelectedDays(perm.access_days.split(',').map((d) => parseInt(d.trim(), 10)).filter((n) => !isNaN(n)));
    } else {
      setSelectedDays([0, 1, 2, 3, 4]);
    }
  };

  const handleSaveWindow = async (recipientId) => {
    setActionLoading(recipientId);
    setError('');
    setNotice('');
    try {
      const data = {
        access_start_hour: startHour !== '' ? parseInt(startHour, 10) : null,
        access_end_hour: endHour !== '' ? parseInt(endHour, 10) : null,
        access_days: selectedDays.length > 0 ? selectedDays.sort((a, b) => a - b).join(',') : null
      };
      await permissionsAPI.setTemporalWindow(file.id, recipientId, data);
      setNotice('Temporal access window updated successfully.');
      setEditingWindow(null);
      await fetchPermissions();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update temporal window.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearWindow = async (recipientId) => {
    setActionLoading(recipientId);
    setError('');
    try {
      await permissionsAPI.setTemporalWindow(file.id, recipientId, {
        access_start_hour: null,
        access_end_hour: null,
        access_days: null
      });
      setNotice('Temporal access window cleared (unrestricted).');
      setEditingWindow(null);
      await fetchPermissions();
      if (onUpdated) onUpdated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to clear temporal window.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Shield size={20} style={{ color: 'var(--accent-blue)' }} />
            <span>Manage Access & Revocation</span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>File:</div>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>{file?.original_filename}</div>
        </div>

        {error && (
          <div className="alert-box alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        {notice && (
          <div className="alert-box alert-success">
            <Check size={18} style={{ flexShrink: 0 }} />
            <div>{notice}</div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px', color: 'var(--accent-blue)' }} />
            <p>Loading active permission grants...</p>
          </div>
        ) : permissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            No recipients currently have access to this file. Use 'Share' to grant access.
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Read</th>
                  <th>Download</th>
                  <th>Share</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.recipient_username}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{p.recipient_email}</div>
                        {p.access_start_hour !== null && p.access_start_hour !== undefined && (
                          <div style={{ marginTop: '3px' }}>
                            <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>
                              🕒 {String(p.access_start_hour).padStart(2, '0')}:00 - {String(p.access_end_hour).padStart(2, '0')}:00 UTC
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          disabled={p.is_revoked || actionLoading === p.recipient_id}
                          checked={p.can_read}
                          onChange={() => handleTogglePermission(p, 'can_read')}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          disabled={p.is_revoked || actionLoading === p.recipient_id}
                          checked={p.can_download}
                          onChange={() => handleTogglePermission(p, 'can_download')}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          disabled={p.is_revoked || actionLoading === p.recipient_id}
                          checked={p.can_share}
                          onChange={() => handleTogglePermission(p, 'can_share')}
                        />
                      </td>
                      <td>
                        {p.is_revoked ? (
                          <span className="badge badge-danger">Revoked</span>
                        ) : p.is_one_time ? (
                          <span className="badge badge-warning" style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.4)' }} title="One-time access. Self-destructs after 1 download/view.">🔥 1-Time Access</span>
                        ) : (
                          <span className="badge badge-success">Active</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {!p.is_revoked ? (
                            <>
                              <button
                                onClick={() => openWindowEditor(p)}
                                disabled={actionLoading === p.recipient_id}
                                className="btn-secondary btn-sm"
                                style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="Configure temporal access window"
                              >
                                <Clock size={12} />
                                <span>Window</span>
                              </button>
                              <button
                                onClick={() => handleRevoke(p.recipient_id, p.recipient_username)}
                                disabled={actionLoading === p.recipient_id}
                                className="btn-danger btn-sm"
                                title="Immediately destroy recipient key and revoke access"
                              >
                                <UserMinus size={14} />
                                <span>Revoke</span>
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                              Revoked at {new Date(p.revoked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingWindow === p.recipient_id && (
                      <tr style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                        <td colSpan="6" style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={14} style={{ color: 'var(--accent-blue)' }} />
                            <span>Set Temporal Access Window for {p.recipient_username}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Start Hour (UTC, 0-23):</label>
                              <input
                                type="number"
                                min="0"
                                max="23"
                                placeholder="e.g. 9"
                                value={startHour}
                                onChange={(e) => setStartHour(e.target.value)}
                                style={{ width: '90px', padding: '4px 8px', fontSize: '0.8rem' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>End Hour (UTC, 0-23):</label>
                              <input
                                type="number"
                                min="0"
                                max="23"
                                placeholder="e.g. 17"
                                value={endHour}
                                onChange={(e) => setEndHour(e.target.value)}
                                style={{ width: '90px', padding: '4px 8px', fontSize: '0.8rem' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Allowed Days:</label>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
                                  <label key={day} style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={selectedDays.includes(idx)}
                                      onChange={() => {
                                        if (selectedDays.includes(idx)) {
                                          setSelectedDays(selectedDays.filter((d) => d !== idx));
                                        } else {
                                          setSelectedDays([...selectedDays, idx]);
                                        }
                                      }}
                                    />
                                    {day}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleSaveWindow(p.recipient_id)}
                              disabled={actionLoading === p.recipient_id}
                              className="btn-primary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              Save Window
                            </button>
                            <button
                              onClick={() => handleClearWindow(p.recipient_id)}
                              disabled={actionLoading === p.recipient_id}
                              className="btn-secondary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              Clear Window (24/7)
                            </button>
                            <button
                              onClick={() => setEditingWindow(null)}
                              className="btn-secondary btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} className="btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
