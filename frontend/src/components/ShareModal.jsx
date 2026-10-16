import React, { useState, useEffect } from 'react';
import { usersAPI, permissionsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Share2, X, Search, CheckCircle, AlertCircle, Key, User } from 'lucide-react';

export default function ShareModal({ file, onClose, onSuccess }) {
  const { privateKeys } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [matchingUsers, setMatchingUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  const [canRead, setCanRead] = useState(true);
  const [canDownload, setCanDownload] = useState(true);
  const [canShare, setCanShare] = useState(false);
  const [isOneTime, setIsOneTime] = useState(false);

  const [ownerKey, setOwnerKey] = useState(privateKeys?.encryption_private_key || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (searchQuery.trim().length >= 1) {
      usersAPI.search(searchQuery)
        .then(res => setMatchingUsers(res.data))
        .catch(() => setMatchingUsers([]));
    } else {
      setMatchingUsers([]);
    }
  }, [searchQuery]);

  const handleShare = async (e) => {
    e.preventDefault();
    if (!selectedUser) {
      setError('Please select a recipient.');
      return;
    }
    const privateKey = ownerKey.trim();
    if (!privateKey) {
      setError('Your private encryption key is required to unwrap and re-wrap the file AES key for the recipient.');
      return;
    }
    if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/.test(privateKey)) {
      setError('Enter your encryption private key in PEM format. A password, PIN, or login credential cannot unwrap the file key.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await permissionsAPI.shareFile(
        file.id,
        {
          recipient_identifier: selectedUser.username,
          can_read: canRead,
          can_download: canDownload,
          can_share: canShare,
          is_one_time: isOneTime
        },
        privateKey
      );

      setSuccess(`File successfully shared with '${selectedUser.username}'!`);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to share file. Verify recipient public keys and your private key.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Share2 size={20} style={{ color: 'var(--accent-blue)' }} />
            <span>Share Encrypted File</span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>File to Share:</div>
          <div style={{ fontWeight: 600, fontSize: '0.98rem' }}>{file?.original_filename}</div>
        </div>

        {error && (
          <div className="alert-box alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div className="alert-box alert-success">
            <CheckCircle size={18} style={{ flexShrink: 0 }} />
            <div>{success}</div>
          </div>
        )}

        <form onSubmit={handleShare} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Recipient Search */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
              Select Recipient (User / Email)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={selectedUser ? `${selectedUser.username} (${selectedUser.email})` : searchQuery}
                onChange={(e) => {
                  setSelectedUser(null);
                  setSearchQuery(e.target.value);
                }}
                placeholder="Search registered users by username or email..."
                style={{ width: '100%', paddingLeft: '36px' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>

            {/* Selected User Display with Avatar */}
            {selectedUser && (
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--accent-blue)',
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {selectedUser.profile_pic ? (
                    <img
                      src={selectedUser.profile_pic}
                      alt={selectedUser.username}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-blue)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}>
                      {selectedUser.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{selectedUser.username}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedUser.email}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
                  title="Remove selection"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Dropdown search suggestions with Profile Picture */}
            {matchingUsers.length > 0 && !selectedUser && (
              <div style={{
                marginTop: '6px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-input)',
                maxHeight: '180px',
                overflowY: 'auto'
              }}>
                {matchingUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setSearchQuery('');
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-color)',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {u.profile_pic ? (
                        <img
                          src={u.profile_pic}
                          alt={u.username}
                          style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--accent-blue)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.78rem'
                        }}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <strong>{u.username}</strong>
                        <span style={{ color: 'var(--text-dim)', marginLeft: '8px', fontSize: '0.8rem' }}>{u.email}</span>
                      </div>
                    </div>
                    {u.has_encryption_key ? (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Key Ready</span>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>No Key</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Granular Permissions */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '8px' }}>
              Granular Zero Trust Permissions
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={canRead}
                  onChange={(e) => setCanRead(e.target.checked)}
                />
                <span><strong>Can Read</strong> — View file details & metadata</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={canDownload}
                  onChange={(e) => setCanDownload(e.target.checked)}
                />
                <span><strong>Can Download</strong> — Decrypt and download file content</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={canShare}
                  onChange={(e) => setCanShare(e.target.checked)}
                />
                <span><strong>Can Re-share</strong> — Grant rights to other users</span>
              </label>

              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                fontSize: '0.88rem',
                cursor: 'pointer',
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '6px',
                backgroundColor: isOneTime ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                border: isOneTime ? '1px solid #ef4444' : '1px dashed var(--border-color)'
              }}>
                <input
                  type="checkbox"
                  checked={isOneTime}
                  onChange={(e) => setIsOneTime(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <span style={{ fontWeight: 600, color: isOneTime ? '#f87171' : 'var(--text-main)' }}>
                    🔥 Burn on Read (One-Time Access)
                  </span>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Access automatically self-destructs immediately after the recipient downloads or views the file once.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Owner Private Key for Wrapping */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
              Your Private Encryption Key (for wrapping recipient's AES key)
            </label>
            <textarea
              rows={3}
              required
              value={ownerKey}
              onChange={(e) => setOwnerKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----"
              className="mono"
              style={{ width: '100%', fontSize: '0.75rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !selectedUser}>
              {loading ? 'Wrapping Key & Provisioning...' : 'Grant & Share'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
