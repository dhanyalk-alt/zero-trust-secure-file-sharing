import React, { useState, useEffect } from 'react';
import { shareLinksAPI } from '../api/client';
import { Shield, Download, FileText, Clock, AlertTriangle, CheckCircle, RefreshCw, Lock } from 'lucide-react';

export default function PublicAccess({ token }) {
  const [fileInfo, setFileInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const fetchInfo = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await shareLinksAPI.getPublicInfo(token);
        setFileInfo(res.data);
      } catch (err) {
        if (err.response?.status === 410) {
          setError(err.response?.data?.detail || 'This secure share link has expired or reached its maximum download limit.');
        } else if (err.response?.status === 404) {
          setError(err.response?.data?.detail || 'Share link not found or invalid.');
        } else {
          setError('Failed to load shared file information.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchInfo();
    }
  }, [token]);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = () => {
    setDownloading(true);
    const downloadUrl = shareLinksAPI.downloadPublic(token);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.setAttribute('download', fileInfo?.filename || 'download');
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(() => setDownloading(false), 2000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: 'var(--bg-main)'
    }}>
      <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Brand header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
          <Shield size={28} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            ZeroTrust <span style={{ color: 'var(--accent-blue)', fontWeight: 400 }}>Vault</span>
          </span>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>Secure Public Transfer</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Encrypted end-to-end. Download without requiring user registration.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px', color: 'var(--accent-blue)' }} />
            <p style={{ fontSize: '0.88rem' }}>Verifying secure token and decrypting manifest...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(244, 63, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--accent-rose)' }}>
              <AlertTriangle size={24} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--accent-rose)' }}>Access Unavailable</div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '6px' }}>{error}</p>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="btn-secondary btn-sm"
              style={{ marginTop: '16px' }}
            >
              Return to Vault
            </button>
          </div>
        ) : fileInfo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* File info card */}
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--bg-input)',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={22} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {fileInfo.filename}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {formatBytes(fileInfo.file_size)} • {fileInfo.mime_type || 'Encrypted Binary'}
                  </div>
                </div>
              </div>

              {fileInfo.label && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px' }}>
                  <strong>Note:</strong> {fileInfo.label}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-dim)', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '8px' }}>
                <span>Shared by: {fileInfo.owner_username}</span>
                {fileInfo.uses_remaining !== null && (
                  <span>{fileInfo.uses_remaining} downloads remaining</span>
                )}
              </div>

              {fileInfo.expires_at && (
                <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
                  <span>Expires: {new Date(fileInfo.expires_at).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Security note */}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={14} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
              <span>AES-256-GCM encrypted. Authenticity cryptographically assured.</span>
            </div>

            {/* Download button */}
            <button
              onClick={handleDownload}
              className="btn-primary"
              disabled={downloading}
              style={{
                padding: '12px',
                fontSize: '0.95rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Download size={18} />
              <span>{downloading ? 'Decrypting & Downloading...' : 'Download Secure File'}</span>
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => { window.location.href = '/'; }}
                style={{ fontSize: '0.78rem', color: 'var(--text-dim)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Go to ZeroTrust Vault Home
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
