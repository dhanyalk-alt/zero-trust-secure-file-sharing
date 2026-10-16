import React, { useState, useEffect, useCallback } from 'react';
import { filesAPI } from '../api/client';
import { getApiErrorMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import {
  Share2,
  Download,
  ShieldCheck,
  RefreshCw,
  FileText,
  AlertCircle,
  Copy,
  Search,
  Clock,
  Eye,
  Flame
} from 'lucide-react';
import VerifyModal from '../components/VerifyModal';
import ShareModal from '../components/ShareModal';
import SecureViewerModal from '../components/SecureViewerModal';

export default function SharedWithMe({ setActiveTab }) {
  const { privateKeys } = useAuth();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState('');
  const [isKeyError, setIsKeyError] = useState(false);
  const [verifyingFile, setVerifyingFile] = useState(null);
  const [sharingFile, setSharingFile] = useState(null);
  const [viewingFile, setViewingFile] = useState(null);
  const [search, setSearch] = useState('');

  const fetchSharedFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      const res = await filesAPI.getSharedWithMe(params);
      setFiles(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch shared files.');
      setIsKeyError(false);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchSharedFiles(); }, [fetchSharedFiles]);

  const handleDownload = async (file) => {
    if (!privateKeys?.encryption_private_key) {
      setError('Your private encryption key is required in this session to decrypt shared files. Please import or set your key in Key Management.');
      setIsKeyError(true);
      return;
    }
    setDownloadingId(file.id); setError(''); setIsKeyError(false);
    try {
      const res = await filesAPI.download(file.id, privateKeys.encryption_private_key);
      const blob = new Blob([res.data], { type: file.mime_type || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.original_filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const detail = await getApiErrorMessage(err, 'Download failed. Verify your access and matching encryption key, then retry.');
      const lowerDetail = (detail || '').toLowerCase();
      const keyMismatch = lowerDetail.includes('private key') || lowerDetail.includes('unwrap') || lowerDetail.includes('encryption key');
      setError(detail || 'Download failed. Verify your access and matching encryption key, then retry.');
      setIsKeyError(keyMismatch);
    } finally { setDownloadingId(null); }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard.`);
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const d = new Date(expiresAt);
    const diffHours = (d - new Date()) / 3600000;
    if (diffHours < 0) return { label: 'Expired', cls: 'badge-danger' };
    if (diffHours < 24) return { label: `Expires in ${Math.round(diffHours)}h`, cls: 'badge-warning' };
    return { label: `Expires ${d.toLocaleDateString()}`, cls: 'badge-info' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Files Shared With Me</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Inbound files shared with your cryptographic identity. Evaluated dynamically via Zero Trust access policy.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '32px', width: '180px', height: '34px', fontSize: '0.85rem' }}
            />
          </div>
          <button onClick={fetchSharedFiles} className="btn-secondary" disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-box alert-danger" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
          {isKeyError && setActiveTab && (
            <button
              onClick={() => setActiveTab('keys')}
              className="btn-primary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              Open Key Management &rarr;
            </button>
          )}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '12px', color: 'var(--accent-blue)' }} />
            <p>Loading authorized shared files...</p>
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <Share2 size={36} style={{ color: 'var(--text-dim)', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{search ? 'No files match your search' : 'No shared files'}</h3>
            <p style={{ fontSize: '0.88rem', marginTop: '4px' }}>
              {search ? 'Try a different search term.' : 'When other users grant you access to files, they will appear here with your specific permissions.'}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Shared by</th>
                  <th>Owner</th>
                  <th>Size</th>
                  <th>SHA-256 Fingerprint</th>
                  <th>Your Rights</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const expiryInfo = formatExpiry(f.expires_at);
                  return (
                    <tr key={f.id} style={f.is_expired ? { opacity: 0.5 } : {}}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                          <FileText size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                          <span>{f.original_filename}</span>
                        </div>
                        {expiryInfo && (
                          <span className={`badge ${expiryInfo.cls}`} style={{ marginTop: '4px', display: 'inline-block', fontSize: '0.75rem' }}>
                            <Clock size={10} style={{ marginRight: '3px' }} />{expiryInfo.label}
                          </span>
                        )}
                      </td>
                      <td><span className="badge badge-info">{f.shared_by_username || f.owner_username}</span></td>
                      <td><span className="badge badge-info">{f.owner_username}</span></td>
                      <td>{formatBytes(f.file_size)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="mono" style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)' }}>
                            {f.file_sha256_hash.slice(0, 16)}...
                          </span>
                          <button onClick={() => copyToClipboard(f.file_sha256_hash, 'SHA-256 Hash')} title="Copy full SHA-256 hash" style={{ color: 'var(--text-dim)' }}>
                            <Copy size={13} />
                          </button>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {f.can_read && <span className="badge badge-success">Read</span>}
                          {f.can_download && <span className="badge badge-success">Download</span>}
                          {f.can_share && <span className="badge badge-info">Share</span>}
                          {f.is_one_time && (
                            <span className="badge badge-warning" style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.4)', display: 'inline-flex', alignItems: 'center' }} title="One-time access. Self-destructs after reading/downloading.">
                              <Flame size={10} style={{ marginRight: '3px' }} />1-Time Access
                            </span>
                          )}
                          {f.is_expired && <span className="badge badge-danger">Expired</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {!f.is_expired && (
                            <>
                              {f.can_read && (
                                <button onClick={() => setViewingFile(f)} className="btn-secondary btn-sm" title="Zero Trust in-memory preview with dynamic security watermark">
                                  <Eye size={14} style={{ color: 'var(--accent-blue)' }} />
                                  <span>Secure View</span>
                                </button>
                              )}
                              <button onClick={() => setVerifyingFile(f)} className="btn-secondary btn-sm" title="Verify authenticity of sender's signature">
                                <ShieldCheck size={14} style={{ color: 'var(--accent-emerald)' }} />
                                <span>Verify</span>
                              </button>
                              {f.can_download && (
                                <button onClick={() => handleDownload(f)} disabled={downloadingId === f.id} className="btn-primary btn-sm" title="Decrypt with your private key & Download">
                                  <Download size={14} />
                                  <span>{downloadingId === f.id ? 'Decrypting...' : 'Download'}</span>
                                </button>
                              )}
                              {f.can_share && (
                                <button onClick={() => setSharingFile(f)} className="btn-secondary btn-sm" title="Share this file with another user">
                                  <Share2 size={14} />
                                  <span>Share</span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {verifyingFile && <VerifyModal file={verifyingFile} onClose={() => setVerifyingFile(null)} />}
      {sharingFile && <ShareModal file={sharingFile} onClose={() => setSharingFile(null)} onSuccess={fetchSharedFiles} />}
      {viewingFile && <SecureViewerModal file={viewingFile} onClose={() => setViewingFile(null)} onAccessConsumed={fetchSharedFiles} onManageKeys={() => { setViewingFile(null); setActiveTab?.('keys'); }} />}
    </div>
  );
}
