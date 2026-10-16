import React, { useState, useEffect } from 'react';
import { auditAPI } from '../api/client';
import { Shield, Filter, RefreshCw, AlertTriangle, CheckCircle, Search, Copy, ShieldCheck, Link2 } from 'lucide-react';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [verifyingChain, setVerifyingChain] = useState(false);
  const [chainStatus, setChainStatus] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await auditAPI.getLogs(params);
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setVerifyingChain(true);
    setChainStatus(null);
    try {
      const res = await auditAPI.verifyChain();
      setChainStatus(res.data);
    } catch (err) {
      console.error('Failed to verify chain:', err);
      setChainStatus({ error: 'Failed to verify chain integrity.' });
    } finally {
      setVerifyingChain(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, statusFilter]);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Security & Audit Logs</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Cryptographically linked immutable audit trail with SHA-256 blockchain verification and Zero Trust policy checks.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleVerifyChain}
            className="btn-primary"
            disabled={verifyingChain}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ShieldCheck size={16} className={verifyingChain ? 'spin' : ''} />
            <span>{verifyingChain ? 'Verifying Chain...' : 'Verify Chain Integrity'}</span>
          </button>

          <button onClick={fetchLogs} className="btn-secondary" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh Logs</span>
          </button>
        </div>
      </div>

      {/* Blockchain Chain Verification Banner */}
      {chainStatus && (
        <div
          className={`card ${chainStatus.chain_valid ? 'alert-box alert-success' : 'alert-box alert-danger'}`}
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRadius: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {chainStatus.chain_valid ? (
              <CheckCircle size={22} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
            ) : (
              <AlertTriangle size={22} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                {chainStatus.chain_valid
                  ? 'Cryptographic Chain Integrity Verified'
                  : 'Blockchain Audit Integrity Alert'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {chainStatus.chain_valid
                  ? `All ${chainStatus.verified} chained log entries are cryptographically intact and tamper-free.`
                  : `Tampering or broken links detected! Flagged records: ${chainStatus.tampered?.join(', ') || 'None'}`}
              </div>
            </div>
          </div>
          <button
            onClick={() => setChainStatus(null)}
            className="btn-secondary btn-sm"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          <Filter size={16} />
          <span>Filter By:</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          >
            <option value="">All Actions</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="LOGIN_ATTEMPT">LOGIN_ATTEMPT</option>
            <option value="FILE_UPLOAD">FILE_UPLOAD</option>
            <option value="FILE_DOWNLOAD">FILE_DOWNLOAD</option>
            <option value="PERMISSION_GRANTED">PERMISSION_GRANTED</option>
            <option value="PERMISSION_MODIFIED">PERMISSION_MODIFIED</option>
            <option value="ACCESS_REVOKED">ACCESS_REVOKED</option>
            <option value="REVOKED_ACCESS_ATTEMPT">REVOKED_ACCESS_ATTEMPT</option>
            <option value="ZERO_TRUST_DENIAL">ZERO_TRUST_DENIAL</option>
            <option value="INTEGRITY_VERIFIED">INTEGRITY_VERIFIED</option>
            <option value="SIGNATURE_VERIFICATION_FAILED">SIGNATURE_VERIFICATION_FAILED</option>
            <option value="AES_GCM_AUTH_FAILED">AES_GCM_AUTH_FAILED</option>
            <option value="ACCOUNT_LOCKED">ACCOUNT_LOCKED</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          >
            <option value="">All Statuses</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="DENIED">DENIED</option>
            <option value="FAILED">FAILED</option>
            <option value="TAMPERED">TAMPERED</option>
            <option value="SUSPICIOUS">SUSPICIOUS</option>
          </select>
        </div>

        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
          Showing {logs.length} events
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '12px', color: 'var(--accent-blue)' }} />
            <p>Loading security audit stream...</p>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <Shield size={36} style={{ color: 'var(--text-dim)', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No audit logs match criteria</h3>
            <p style={{ fontSize: '0.88rem', marginTop: '4px' }}>
              Try adjusting your action or status filters.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Actor / Resource</th>
                  <th>Security Details</th>
                  <th>Correlation ID</th>
                  <th>Block Hash</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{log.action}</span>
                    </td>
                    <td>
                      <span className={`badge ${
                        log.status === 'SUCCESS' ? 'badge-success' :
                        log.status === 'TAMPERED' || log.status === 'DENIED' ? 'badge-danger' :
                        'badge-warning'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>
                        <strong>{log.username || 'Unauthenticated'}</strong>
                      </div>
                      {log.resource_name && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                          {log.resource_name}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '320px' }}>
                      {log.details || '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                          {log.correlation_id ? log.correlation_id.slice(0, 8) + '...' : '—'}
                        </span>
                        {log.correlation_id && (
                          <button
                            onClick={() => copyToClipboard(log.correlation_id, 'Correlation ID')}
                            title="Copy Correlation ID"
                            style={{ color: 'var(--text-dim)' }}
                          >
                            <Copy size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      {log.event_hash ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span
                            className="mono"
                            style={{ fontSize: '0.72rem', color: 'var(--accent-purple)' }}
                            title={log.event_hash}
                          >
                            {log.event_hash.slice(0, 8)}...
                          </span>
                          <button
                            onClick={() => copyToClipboard(log.event_hash, 'Block Hash')}
                            title="Copy Block Hash"
                            style={{ color: 'var(--text-dim)' }}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
