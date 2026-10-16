import React, { useState, useEffect } from 'react';
import { statsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { HardDrive, Share2, Shield, Building2, AlertTriangle, FileCheck, RefreshCw, Key } from 'lucide-react';

export default function Dashboard({ setActiveTab }) {
  const { user, privateKeys } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const statsRes = await statsAPI.getDashboard();
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
        <RefreshCw size={28} className="spin" style={{ marginBottom: '12px', color: 'var(--accent-blue)' }} />
        <p>Loading vault metrics...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Vault Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Zero Trust cloud storage overview and personal vault statistics.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleRefresh} className="btn-secondary" disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Metrics'}</span>
          </button>
          <button onClick={() => setActiveTab('my-files')} className="btn-primary">
            <FileCheck size={16} />
            <span>Upload New File</span>
          </button>
        </div>
      </div>

      {/* Key Warning if not loaded in session */}
      {!privateKeys && (
        <div className="alert-box alert-danger">
          <Key size={20} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong>Cryptographic Private Keys Not Loaded in Current Session:</strong>
            <div style={{ marginTop: '4px', fontSize: '0.85rem' }}>
              To download or decrypt files and share with recipients, your private key is required.
            </div>
          </div>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px'
      }}>
        {/* Total Files */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Personal Files</span>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)' }}>
              <HardDrive size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '12px' }}>
            {stats?.total_files_count || 0}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '4px' }}>
            AES-256-GCM Encrypted
          </div>
        </div>

        {/* Storage Used */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Encrypted Storage</span>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)' }}>
              <HardDrive size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '12px' }}>
            {formatBytes(stats?.total_bytes_stored)}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '4px' }}>
            Vault Storage Volume
          </div>
        </div>

        {/* Shared by User */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Shares Granted</span>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-emerald)' }}>
              <Share2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '12px' }}>
            {stats?.total_shared_by_user || 0}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '4px' }}>
            Active Recipient Grants
          </div>
        </div>

        {/* Shared with User */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Shared With Me</span>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-purple)' }}>
              <Share2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '12px' }}>
            {stats?.total_shared_with_user || 0}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '4px' }}>
            Authorized Inbound Files
          </div>
        </div>

        {/* Security Alerts */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Security Incidents</span>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)' }}>
              <AlertTriangle size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '12px', color: (stats?.security_events_count > 0 ? 'var(--accent-rose)' : 'inherit') }}>
            {stats?.security_events_count || 0}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '4px' }}>
            Denied / Tamper Signals
          </div>
        </div>

        {/* Organizations Count */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>Organizations</span>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)' }}>
              <Building2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, marginTop: '12px' }}>
            {stats?.organizations_count || 0}
          </div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '4px' }}>
            Workspaces Joined
          </div>
        </div>
      </div>
    </div>
  );
}
