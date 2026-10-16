import React, { useState, useEffect, useRef, useCallback } from 'react';
import { filesAPI, usersAPI, permissionsAPI, signaturesAPI, shareLinksAPI, subscriptionAPI } from '../api/client';
import { getApiErrorMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import {
  Upload,
  HardDrive,
  Download,
  Share2,
  Users,
  ShieldCheck,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  FileText,
  Copy,
  Search,
  Clock,
  X,
  Eye,
  Folder,
  FolderPlus,
  FolderOpen,
  Edit3,
  ChevronDown,
  ArrowRight,
  Shield,
  Layers,
  PenTool,
  Link2
} from 'lucide-react';
import VerifyModal from '../components/VerifyModal';
import ShareModal from '../components/ShareModal';
import PermissionsModal from '../components/PermissionsModal';
import SecureViewerModal from '../components/SecureViewerModal';

// ── Expiry Modal ───────────────────────────────────────────────────────────────
function ExpiryModal({ file, onClose, onSuccess }) {
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSet = async () => {
    if (!expiresAt) {
      setError('Select a future date/time.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await filesAPI.setExpiry(file.id, { expires_at: new Date(expiresAt).toISOString() });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to set expiry.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    setError('');
    try {
      await filesAPI.setExpiry(file.id, { clear_expiry: true });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to clear expiry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} style={{ color: 'var(--accent-amber)' }} /> Manage File Expiry
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-dim)' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
          File: <strong>{file.original_filename}</strong>
        </p>
        {file.expires_at && (
          <div className="alert-box alert-danger" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
            <Clock size={14} /> Currently expires: {new Date(file.expires_at).toLocaleString()}
          </div>
        )}
        {error && (
          <div className="alert-box alert-danger" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
          New expiry date &amp; time:
        </label>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="form-input"
          min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
          style={{ width: '100%', marginBottom: '16px' }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleSet} className="btn-primary" disabled={loading} style={{ flex: 1 }}>
            {loading ? 'Saving...' : 'Set Expiry'}
          </button>
          {file.expires_at && (
            <button onClick={handleClear} className="btn-secondary" disabled={loading}>
              Clear Expiry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Move Category Modal ────────────────────────────────────────────────────────
function MoveCategoryModal({ file, categories, onClose, onSuccess }) {
  const [selectedCatId, setSelectedCatId] = useState(
    file.category_id !== null && file.category_id !== undefined ? String(file.category_id) : 'none'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleMove = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const catId = selectedCatId === 'none' ? null : parseInt(selectedCatId, 10);
      await filesAPI.moveFileCategory(file.id, { category_id: catId });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to move file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={18} style={{ color: 'var(--accent-cyan)' }} /> Move File to Folder
          </h3>
          <button onClick={onClose} style={{ color: 'var(--text-dim)' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
          File: <strong>{file.original_filename}</strong>
        </p>

        {error && (
          <div className="alert-box alert-danger" style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <form onSubmit={handleMove}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
            Choose Target Folder:
          </label>
          <select
            className="form-input"
            value={selectedCatId}
            onChange={(e) => setSelectedCatId(e.target.value)}
            style={{ width: '100%', marginBottom: '18px' }}
          >
            <option value="none">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Moving...' : 'Move File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Zero Trust Actions: Unified Self-Contained Modal ──────────────────────────
// activeView: null=menu | 'verify' | 'download' | 'share' | 'access' | 'expiry' | 'move' | 'delete'
function ZeroTrustActionsModal({ file, categories, privateKeys, onClose, onFilesRefresh }) {
  const [activeView, setActiveView] = useState(null);

  // Per-view state
  // -- verify --
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  // -- download --
  const [dlLoading, setDlLoading] = useState(false);
  const [dlSuccess, setDlSuccess] = useState('');
  const [dlError, setDlError] = useState('');
  // -- share --
  const [shareSearch, setShareSearch] = useState('');
  const [shareUsers, setShareUsers] = useState([]);
  const [shareTarget, setShareTarget] = useState(null);
  const [shareCanRead, setShareCanRead] = useState(true);
  const [shareCanDl, setShareCanDl] = useState(true);
  const [shareCanShare, setShareCanShare] = useState(false);
  const [shareOneTime, setShareOneTime] = useState(false);
  const [shareOwnerKey, setShareOwnerKey] = useState(privateKeys?.encryption_private_key || '');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  // -- access/permissions --
  const [perms, setPerms] = useState([]);
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsError, setPermsError] = useState('');
  const [permsNotice, setPermsNotice] = useState('');
  const [permsActionId, setPermsActionId] = useState(null);
  // -- expiry --
  const [expiresAt, setExpiresAt] = useState('');
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryError, setExpiryError] = useState('');
  const [expirySuccess, setExpirySuccess] = useState('');
  // -- move --
  const [moveCatId, setMoveCatId] = useState(
    file.category_id !== null && file.category_id !== undefined ? String(file.category_id) : 'none'
  );
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveError, setMoveError] = useState('');
  const [moveSuccess, setMoveSuccess] = useState('');
  // -- delete --
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  // -- e-sign --
  const [sigList, setSigList] = useState([]);
  const [sigLoading, setSigLoading] = useState(false);
  const [sigKey, setSigKey] = useState(privateKeys?.signing_private_key || '');
  const [sigError, setSigError] = useState('');
  const [sigSuccess, setSigSuccess] = useState('');
  // -- share links --
  const [linkList, setLinkList] = useState([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkKey, setLinkKey] = useState(privateKeys?.encryption_private_key || '');
  const [linkExpHours, setLinkExpHours] = useState(24);
  const [linkMaxUses, setLinkMaxUses] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');
  const [copiedToken, setCopiedToken] = useState(null);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Navigate to a view
  const goTo = (view) => {
    setActiveView(view);
    if (view === 'verify') runVerify();
    if (view === 'access') loadPerms();
    if (view === 'sign') loadSignatures();
    if (view === 'sharelink') loadShareLinks();
  };

  // ── Verify ──
  const runVerify = async () => {
    setVerifyLoading(true);
    setVerifyError('');
    setVerifyResult(null);
    try {
      const res = await filesAPI.verifyIntegrity(file.id);
      setVerifyResult(res.data);
    } catch (err) {
      setVerifyError(err.response?.data?.detail || 'Cryptographic verification failed.');
    } finally {
      setVerifyLoading(false);
    }
  };

  // ── Download ──
  const runDownload = async () => {
    if (!privateKeys?.encryption_private_key) {
      setDlError('Your private encryption key is required to unwrap the AES key.');
      return;
    }
    setDlLoading(true);
    setDlError('');
    setDlSuccess('');
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
      setDlSuccess(`"${file.original_filename}" decrypted and downloaded successfully.`);
    } catch (err) {
      setDlError(await getApiErrorMessage(err, 'Download failed. Verify your access and matching encryption key, then retry.'));
    } finally {
      setDlLoading(false);
    }
  };

  // ── Share: user search ──
  useEffect(() => {
    if (activeView !== 'share') return;
    if (shareSearch.trim().length < 1) { setShareUsers([]); return; }
    usersAPI.search(shareSearch).then(r => setShareUsers(r.data)).catch(() => setShareUsers([]));
  }, [shareSearch, activeView]);

  const runShare = async (e) => {
    e.preventDefault();
    if (!shareTarget) { setShareError('Select a recipient.'); return; }
    const privateKey = shareOwnerKey.trim();
    if (!privateKey) { setShareError('Your private encryption key is required.'); return; }
    if (!/^-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+-----END (?:RSA )?PRIVATE KEY-----$/.test(privateKey)) {
      setShareError('Enter your encryption private key in PEM format. A password, PIN, or login credential cannot unwrap the file key.');
      return;
    }
    setShareLoading(true);
    setShareError('');
    setShareSuccess('');
    try {
      await permissionsAPI.shareFile(
        file.id,
        { recipient_identifier: shareTarget.username, can_read: shareCanRead, can_download: shareCanDl, can_share: shareCanShare, is_one_time: shareOneTime },
        privateKey
      );
      setShareSuccess(`File shared with "${shareTarget.username}" successfully!`);
      if (onFilesRefresh) onFilesRefresh();
    } catch (err) {
      setShareError(err.response?.data?.detail || 'Failed to share. Verify keys and recipient.');
    } finally {
      setShareLoading(false);
    }
  };

  // ── Access / Permissions ──
  const loadPerms = async () => {
    setPermsLoading(true);
    setPermsError('');
    try {
      const res = await permissionsAPI.getPermissions(file.id);
      setPerms(res.data);
    } catch (err) {
      setPermsError(err.response?.data?.detail || 'Failed to load permissions.');
    } finally {
      setPermsLoading(false);
    }
  };

  const revokeAccess = async (recipientId, username) => {
    if (!window.confirm(`Revoke all access for "${username}"? This destroys their active decryption key.`)) return;
    setPermsActionId(recipientId);
    setPermsError('');
    setPermsNotice('');
    try {
      await permissionsAPI.revokePermission(file.id, recipientId);
      setPermsNotice(`Access revoked for "${username}".`);
      await loadPerms();
      if (onFilesRefresh) onFilesRefresh();
    } catch (err) {
      setPermsError(err.response?.data?.detail || 'Failed to revoke.');
    } finally {
      setPermsActionId(null);
    }
  };

  const togglePerm = async (perm, field) => {
    const updated = {
      can_read: field === 'can_read' ? !perm.can_read : perm.can_read,
      can_download: field === 'can_download' ? !perm.can_download : perm.can_download,
      can_share: field === 'can_share' ? !perm.can_share : perm.can_share,
    };
    setPermsActionId(perm.recipient_id);
    setPermsError('');
    setPermsNotice('');
    try {
      await permissionsAPI.updatePermission(file.id, perm.recipient_id, updated);
      setPermsNotice(`Permissions updated for "${perm.recipient_username}".`);
      await loadPerms();
      if (onFilesRefresh) onFilesRefresh();
    } catch (err) {
      setPermsError(err.response?.data?.detail || 'Failed to update permission.');
    } finally {
      setPermsActionId(null);
    }
  };

  // ── Expiry ──
  const setExpiry = async () => {
    if (!expiresAt) { setExpiryError('Select a future date/time.'); return; }
    setExpiryLoading(true);
    setExpiryError('');
    setExpirySuccess('');
    try {
      await filesAPI.setExpiry(file.id, { expires_at: new Date(expiresAt).toISOString() });
      setExpirySuccess('Expiry date set successfully.');
      if (onFilesRefresh) onFilesRefresh();
    } catch (err) {
      setExpiryError(err.response?.data?.detail || 'Failed to set expiry.');
    } finally {
      setExpiryLoading(false);
    }
  };

  const clearExpiry = async () => {
    setExpiryLoading(true);
    setExpiryError('');
    setExpirySuccess('');
    try {
      await filesAPI.setExpiry(file.id, { clear_expiry: true });
      setExpirySuccess('Expiry cleared. File has no expiration.');
      if (onFilesRefresh) onFilesRefresh();
    } catch (err) {
      setExpiryError(err.response?.data?.detail || 'Failed to clear expiry.');
    } finally {
      setExpiryLoading(false);
    }
  };

  // ── Move ──
  const runMove = async (e) => {
    e.preventDefault();
    setMoveLoading(true);
    setMoveError('');
    setMoveSuccess('');
    try {
      const catId = moveCatId === 'none' ? null : parseInt(moveCatId, 10);
      await filesAPI.moveFileCategory(file.id, { category_id: catId });
      setMoveSuccess(`File moved to "${moveCatId === 'none' ? 'Uncategorized' : (categories.find(c => String(c.id) === moveCatId)?.name || 'folder')}".`);
      if (onFilesRefresh) onFilesRefresh();
    } catch (err) {
      setMoveError(err.response?.data?.detail || 'Failed to move file.');
    } finally {
      setMoveLoading(false);
    }
  };

  // ── Delete ──
  const runDelete = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    setDeleteSuccess('');
    try {
      await filesAPI.deleteFile(file.id);
      setDeleteSuccess(`"${file.original_filename}" permanently deleted.`);
      if (onFilesRefresh) onFilesRefresh();
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Failed to delete file.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Shared styles ──
  const panelStyle = {
    display: 'flex', flexDirection: 'column', gap: '12px',
    overflowY: 'auto', maxHeight: '60vh', paddingRight: '2px'
  };

  const actionRowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '11px 14px', borderRadius: '9px', textAlign: 'left',
    background: 'var(--bg-input)', border: '1px solid var(--border-color)', cursor: 'pointer', width: '100%'
  };

  // ── SUB-PANELS ──
  const renderVerify = () => (
    <div style={panelStyle}>
      {verifyLoading && (
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)' }}>
          <RefreshCw size={22} className="spin" style={{ color: 'var(--accent-blue)', marginBottom: '8px' }} />
          <p style={{ fontSize: '0.88rem' }}>Verifying RSA-PSS signatures & ciphertext authenticity...</p>
        </div>
      )}
      {verifyError && (
        <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}>
          <AlertCircle size={15} /> {verifyError}
        </div>
      )}
      {verifyResult && (
        <>
          <div style={{
            padding: '14px', borderRadius: '8px',
            backgroundColor: verifyResult.overall_status === 'VERIFIED_AUTHENTIC' ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
            border: `1px solid ${verifyResult.overall_status === 'VERIFIED_AUTHENTIC' ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}`,
            display: 'flex', alignItems: 'center', gap: '12px'
          }}>
            {verifyResult.overall_status === 'VERIFIED_AUTHENTIC'
              ? <CheckCircle size={26} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
              : <AlertCircle size={26} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />}
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                {verifyResult.overall_status === 'VERIFIED_AUTHENTIC' ? 'Authenticity & Integrity Confirmed' : 'Integrity Alert: Potential Compromise'}
              </div>
              <div style={{ fontSize: '0.8rem', marginTop: '2px', color: 'var(--text-main)' }}>{verifyResult.details}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
            {[
              ['RSA-PSS Digital Signature', verifyResult.signature_valid, 'Valid & Authentic', 'Invalid / Tampered'],
              ['AES-GCM Ciphertext Storage', verifyResult.aes_gcm_authenticated, 'Intact & Available', 'Missing / Corrupted'],
              ['Sender Public Key', verifyResult.sender_public_key_present, 'Verified Registered', 'Missing Key'],
            ].map(([label, ok, yes, no]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-input)' }}>
                <span>{label}</span>
                <span className={`badge ${ok ? 'badge-success' : 'badge-danger'}`}>{ok ? yes : no}</span>
              </div>
            ))}
            <div style={{ padding: '9px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-input)' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>SHA-256 Fingerprint:</span>
              <div className="mono" style={{ fontSize: '0.76rem', marginTop: '4px', wordBreak: 'break-all', color: 'var(--accent-cyan)' }}>{verifyResult.file_sha256_hash}</div>
            </div>
          </div>
        </>
      )}
      <button onClick={() => goTo('verify')} className="btn-secondary btn-sm">Re-run Verification</button>
    </div>
  );

  const renderDownload = () => (
    <div style={panelStyle}>
      {dlError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {dlError}</div>}
      {dlSuccess && <div className="alert-box alert-success" style={{ fontSize: '0.85rem' }}><CheckCircle size={15} /> {dlSuccess}</div>}
      {!dlSuccess && (
        <div style={{ padding: '14px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', fontSize: '0.85rem', lineHeight: 1.6 }}>
          <p style={{ marginBottom: '6px', fontWeight: 600 }}>Secure Download Process:</p>
          <ol style={{ paddingLeft: '18px', color: 'var(--text-muted)', margin: 0 }}>
            <li>Fetch wrapped AES-256-GCM session key from server</li>
            <li>Unwrap key using your RSA-OAEP private key (client-side)</li>
            <li>Decrypt ciphertext in memory and save plaintext to disk</li>
          </ol>
        </div>
      )}
      {file.is_expired && (
        <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> This file has expired and cannot be downloaded.</div>
      )}
      {!dlSuccess && (
        <button
          className="btn-primary"
          disabled={dlLoading || file.is_expired}
          onClick={runDownload}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <Download size={16} />
          {dlLoading ? 'Decrypting & Downloading...' : 'Download & Decrypt'}
        </button>
      )}
      {dlSuccess && (
        <button className="btn-secondary" onClick={() => { setDlSuccess(''); setDlError(''); }}>Download Again</button>
      )}
    </div>
  );

  const renderShare = () => (
    <div style={panelStyle}>
      {shareError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {shareError}</div>}
      {shareSuccess && <div className="alert-box alert-success" style={{ fontSize: '0.85rem' }}><CheckCircle size={15} /> {shareSuccess}</div>}
      <form onSubmit={runShare} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, marginBottom: '5px' }}>Recipient (username or email)</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '34px', width: '100%' }}
              value={shareTarget ? `${shareTarget.username} (${shareTarget.email})` : shareSearch}
              onChange={e => { setShareTarget(null); setShareSearch(e.target.value); }}
              placeholder="Search registered users..."
            />
            <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          </div>
          {shareTarget && (
            <div style={{
              marginTop: '6px',
              padding: '6px 10px',
              borderRadius: '7px',
              border: '1px solid var(--accent-blue)',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {shareTarget.profile_pic ? (
                  <img
                    src={shareTarget.profile_pic}
                    alt={shareTarget.username}
                    style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-blue)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.75rem'
                  }}>
                    {shareTarget.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <strong style={{ fontSize: '0.82rem' }}>{shareTarget.username}</strong>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.74rem', marginLeft: '6px' }}>{shareTarget.email}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShareTarget(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {shareUsers.length > 0 && !shareTarget && (
            <div style={{ marginTop: '5px', border: '1px solid var(--border-color)', borderRadius: '7px', backgroundColor: 'var(--bg-input)', maxHeight: '140px', overflowY: 'auto' }}>
              {shareUsers.map(u => (
                <div key={u.id} onClick={() => { setShareTarget(u); setShareSearch(''); }}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {u.profile_pic ? (
                      <img
                        src={u.profile_pic}
                        alt={u.username}
                        style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--accent-blue)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.72rem'
                      }}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div><strong>{u.username}</strong> <span style={{ color: 'var(--text-dim)', fontSize: '0.76rem' }}>{u.email}</span></div>
                  </div>
                  {u.has_encryption_key
                    ? <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Key Ready</span>
                    : <span className="badge badge-warning" style={{ fontSize: '0.68rem' }}>No Key</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.84rem' }}>
          {[
            ['Can Read', shareCanRead, setShareCanRead],
            ['Can Download', shareCanDl, setShareCanDl],
            ['Can Re-share', shareCanShare, setShareCanShare],
          ].map(([lbl, val, setter]) => (
            <label key={lbl} style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer' }}>
              <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} />
              <span>{lbl}</span>
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', marginTop: '4px', padding: '7px 9px', borderRadius: '6px', backgroundColor: shareOneTime ? 'rgba(239,68,68,0.1)' : 'transparent', border: shareOneTime ? '1px solid #ef4444' : '1px dashed var(--border-color)' }}>
            <input type="checkbox" checked={shareOneTime} onChange={e => setShareOneTime(e.target.checked)} />
            <span style={{ color: shareOneTime ? '#f87171' : 'var(--text-main)', fontWeight: 600 }}>🔥 Burn on Read (One-Time)</span>
          </label>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 500, marginBottom: '5px' }}>Your Private Encryption Key</label>
          <textarea rows={3} required value={shareOwnerKey} onChange={e => setShareOwnerKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY----- ..." className="mono" style={{ width: '100%', fontSize: '0.73rem' }} />
        </div>
        <button type="submit" className="btn-primary" disabled={shareLoading || !shareTarget} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <Share2 size={15} />
          {shareLoading ? 'Wrapping Key & Provisioning...' : 'Grant & Share'}
        </button>
      </form>
    </div>
  );

  const renderAccess = () => (
    <div style={panelStyle}>
      {permsError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {permsError}</div>}
      {permsNotice && <div className="alert-box alert-success" style={{ fontSize: '0.85rem' }}><CheckCircle size={15} /> {permsNotice}</div>}
      {permsLoading ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)' }}>
          <RefreshCw size={22} className="spin" style={{ color: 'var(--accent-blue)', marginBottom: '8px' }} />
          <p style={{ fontSize: '0.87rem' }}>Loading permission grants...</p>
        </div>
      ) : perms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '26px', color: 'var(--text-dim)', fontSize: '0.88rem' }}>
          No recipients currently have access. Use Share to grant access.
        </div>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead><tr><th>Recipient</th><th>Read</th><th>Dl</th><th>Share</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {perms.map(p => (
                <tr key={p.id}>
                  <td><div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{p.recipient_username}</div><div style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>{p.recipient_email}</div></td>
                  <td><input type="checkbox" disabled={p.is_revoked || permsActionId === p.recipient_id} checked={p.can_read} onChange={() => togglePerm(p, 'can_read')} /></td>
                  <td><input type="checkbox" disabled={p.is_revoked || permsActionId === p.recipient_id} checked={p.can_download} onChange={() => togglePerm(p, 'can_download')} /></td>
                  <td><input type="checkbox" disabled={p.is_revoked || permsActionId === p.recipient_id} checked={p.can_share} onChange={() => togglePerm(p, 'can_share')} /></td>
                  <td>{p.is_revoked ? <span className="badge badge-danger">Revoked</span> : p.is_one_time ? <span className="badge badge-warning" style={{ color: '#f87171' }}>🔥 1-Time</span> : <span className="badge badge-success">Active</span>}</td>
                  <td>{!p.is_revoked ? <button onClick={() => revokeAccess(p.recipient_id, p.recipient_username)} disabled={permsActionId === p.recipient_id} className="btn-danger btn-sm"><Users size={12} /> Revoke</button> : <span style={{ fontSize: '0.73rem', color: 'var(--text-dim)' }}>Revoked</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button onClick={loadPerms} className="btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><RefreshCw size={13} /> Refresh</button>
    </div>
  );

  const renderExpiry = () => (
    <div style={panelStyle}>
      {expiryError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {expiryError}</div>}
      {expirySuccess && <div className="alert-box alert-success" style={{ fontSize: '0.85rem' }}><CheckCircle size={15} /> {expirySuccess}</div>}
      {file.expires_at && (
        <div className="alert-box alert-danger" style={{ fontSize: '0.84rem' }}>
          <Clock size={14} /> Currently expires: {new Date(file.expires_at).toLocaleString()}
        </div>
      )}
      <label style={{ fontSize: '0.83rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>New expiry date & time:</label>
      <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="form-input" min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} style={{ width: '100%' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={setExpiry} className="btn-primary" disabled={expiryLoading} style={{ flex: 1 }}>{expiryLoading ? 'Saving...' : 'Set Expiry'}</button>
        {file.expires_at && <button onClick={clearExpiry} className="btn-secondary" disabled={expiryLoading}>Clear Expiry</button>}
      </div>
    </div>
  );

  const renderMove = () => (
    <div style={panelStyle}>
      {moveError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {moveError}</div>}
      {moveSuccess && <div className="alert-box alert-success" style={{ fontSize: '0.85rem' }}><CheckCircle size={15} /> {moveSuccess}</div>}
      <form onSubmit={runMove} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>Choose target folder:</label>
        <select className="form-input" value={moveCatId} onChange={e => setMoveCatId(e.target.value)} style={{ width: '100%' }}>
          <option value="none">Uncategorized</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className="btn-primary" disabled={moveLoading}>{moveLoading ? 'Moving...' : 'Move File'}</button>
      </form>
    </div>
  );

  const renderDelete = () => (
    <div style={panelStyle}>
      {deleteError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {deleteError}</div>}
      {deleteSuccess ? (
        <div className="alert-box alert-success" style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
          <CheckCircle size={15} /> {deleteSuccess}
          <p style={{ fontSize: '0.8rem', marginTop: '6px', color: 'var(--text-muted)' }}>
            The file has been permanently removed. Close this modal to return to your vault.
          </p>
        </div>
      ) : (
        <>
          <div style={{ padding: '14px', backgroundColor: 'rgba(244,63,94,0.06)', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.25)', fontSize: '0.88rem', lineHeight: 1.6 }}>
            <p style={{ fontWeight: 600, color: 'var(--accent-rose)', marginBottom: '6px' }}>⚠ Permanent Deletion</p>
            <p style={{ color: 'var(--text-main)' }}>You are about to permanently delete <strong>"{file.original_filename}"</strong>.</p>
            <p style={{ color: 'var(--text-muted)', marginTop: '6px', fontSize: '0.82rem' }}>This will remove the encrypted ciphertext from storage and revoke all active recipient access grants. This action cannot be undone.</p>
          </div>
          {!deleteConfirmed ? (
            <button onClick={() => setDeleteConfirmed(true)} className="btn-danger" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Trash2 size={15} /> I understand — Delete File
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ fontSize: '0.84rem', color: 'var(--accent-rose)', fontWeight: 600, textAlign: 'center' }}>Are you absolutely sure?</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setDeleteConfirmed(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button onClick={runDelete} disabled={deleteLoading} className="btn-danger" style={{ flex: 1 }}>
                  {deleteLoading ? 'Deleting...' : 'Yes, Delete Permanently'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ── e-Sign Handlers & Renderer ──
  const loadSignatures = async () => {
    setSigLoading(true);
    setSigError('');
    try {
      const res = await signaturesAPI.list(file.id);
      setSigList(res.data);
    } catch (err) {
      setSigError(err.response?.data?.detail || 'Failed to load document signatures.');
    } finally {
      setSigLoading(false);
    }
  };

  const runSign = async (e) => {
    e.preventDefault();
    if (!sigKey.trim()) {
      setSigError('Your signing private key is required.');
      return;
    }
    setSigLoading(true);
    setSigError('');
    setSigSuccess('');
    try {
      const res = await signaturesAPI.sign(file.id, { signing_private_key: sigKey.trim() });
      setSigSuccess(`Document successfully signed using RSA-PSS! Signature ID: ${res.data.id}`);
      await loadSignatures();
    } catch (err) {
      setSigError(err.response?.data?.detail || 'Signing failed.');
    } finally {
      setSigLoading(false);
    }
  };

  const handleVerifySig = async (sigId) => {
    try {
      const res = await signaturesAPI.verify(file.id, sigId);
      if (res.data.valid) {
        alert(`✓ Cryptographically Authentic!\n\nSigner: ${res.data.signer}\nAlgorithm: ${res.data.algorithm}\nTimestamp: ${new Date(res.data.signed_at).toLocaleString()}\n\nStatus: ${res.data.message}`);
      } else {
        alert(`✗ Verification Alert!\n\nSigner: ${res.data.signer}\nMessage: ${res.data.message}`);
      }
    } catch (err) {
      alert(`Verification request failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  const renderSign = () => (
    <div style={panelStyle}>
      {sigError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {sigError}</div>}
      {sigSuccess && <div className="alert-box alert-success" style={{ fontSize: '0.85rem' }}><CheckCircle size={15} /> {sigSuccess}</div>}

      <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', fontSize: '0.83rem', lineHeight: 1.5 }}>
        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>RSA-PSS Document e-Signature</p>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Generates a digital signature over the file's SHA-256 fingerprint using your private signing key. Anyone with access can verify its authenticity against your registered public key.
        </p>
      </div>

      <form onSubmit={runSign} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
            Your Signing Private Key (PEM format)
          </label>
          <textarea
            className="form-input mono"
            rows={4}
            value={sigKey}
            onChange={(e) => setSigKey(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
            style={{ fontSize: '0.74rem', width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="submit"
            className="btn-primary"
            disabled={sigLoading || !sigKey.trim()}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
          >
            <PenTool size={15} />
            <span>{sigLoading ? 'Signing...' : 'Sign Document'}</span>
          </button>
          <button
            type="button"
            onClick={loadSignatures}
            disabled={sigLoading}
            className="btn-secondary"
            title="Refresh signatures"
          >
            <RefreshCw size={15} className={sigLoading ? 'spin' : ''} />
          </button>
        </div>
      </form>

      {/* Existing signatures list */}
      <div style={{ marginTop: '10px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
          Existing Digital Signatures ({sigList.length})
        </div>
        {sigList.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center', padding: '16px', background: 'var(--bg-input)', borderRadius: '8px' }}>
            No digital signatures have been applied to this file yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
            {sigList.map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-input)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.signer_username}</span>
                    <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>{s.algorithm}</span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {new Date(s.signed_at).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleVerifySig(s.id)}
                  className="btn-secondary btn-sm"
                  style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                >
                  Verify
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── Share Links Handlers & Renderer ──
  const loadShareLinks = async () => {
    setLinkLoading(true);
    setLinkError('');
    try {
      const res = await shareLinksAPI.list(file.id);
      setLinkList(res.data);
    } catch (err) {
      setLinkError(err.response?.data?.detail || 'Failed to load share links.');
    } finally {
      setLinkLoading(false);
    }
  };

  const runCreateShareLink = async (e) => {
    e.preventDefault();
    if (!linkKey.trim()) {
      setLinkError('Your private encryption key is required to decrypt the AES key.');
      return;
    }
    setLinkLoading(true);
    setLinkError('');
    setLinkSuccess('');
    try {
      const res = await shareLinksAPI.create(file.id, {
        owner_private_key: linkKey.trim(),
        expires_hours: linkExpHours ? parseInt(linkExpHours, 10) : null,
        max_uses: linkMaxUses ? parseInt(linkMaxUses, 10) : null,
        label: linkLabel.trim() || undefined
      });
      setLinkSuccess('Shareable secure link generated successfully!');
      setLinkLabel('');
      await loadShareLinks();
    } catch (err) {
      setLinkError(err.response?.data?.detail || 'Failed to create share link.');
    } finally {
      setLinkLoading(false);
    }
  };

  const runRevokeShareLink = async (linkId) => {
    setLinkLoading(true);
    try {
      await shareLinksAPI.revoke(file.id, linkId);
      await loadShareLinks();
    } catch (err) {
      setLinkError(err.response?.data?.detail || 'Failed to revoke link.');
    } finally {
      setLinkLoading(false);
    }
  };

  const copyShareUrl = (token) => {
    const url = `${window.location.origin}/?share=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const renderShareLink = () => (
    <div style={panelStyle}>
      {linkError && <div className="alert-box alert-danger" style={{ fontSize: '0.85rem' }}><AlertCircle size={15} /> {linkError}</div>}
      {linkSuccess && <div className="alert-box alert-success" style={{ fontSize: '0.85rem' }}><CheckCircle size={15} /> {linkSuccess}</div>}

      <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-input)', borderRadius: '8px', fontSize: '0.83rem', lineHeight: 1.5 }}>
        <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Public Secure Share Link</p>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Generates a time-limited or use-limited direct download URL. Decryption is securely managed by a derived token key without requiring recipient account login.
        </p>
      </div>

      <form onSubmit={runCreateShareLink} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, marginBottom: '4px' }}>
            Your Private Encryption Key (PEM format)
          </label>
          <textarea
            className="form-input mono"
            rows={3}
            value={linkKey}
            onChange={(e) => setLinkKey(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..."
            style={{ fontSize: '0.74rem', width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, marginBottom: '4px' }}>
              Expires in (Hours)
            </label>
            <input
              type="number"
              min="1"
              max="720"
              className="form-input"
              value={linkExpHours}
              onChange={(e) => setLinkExpHours(e.target.value)}
              placeholder="e.g. 24"
              style={{ width: '100%', fontSize: '0.8rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, marginBottom: '4px' }}>
              Max Downloads (Optional)
            </label>
            <input
              type="number"
              min="1"
              className="form-input"
              value={linkMaxUses}
              onChange={(e) => setLinkMaxUses(e.target.value)}
              placeholder="Unlimited"
              style={{ width: '100%', fontSize: '0.8rem' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, marginBottom: '4px' }}>
            Link Description / Label (Optional)
          </label>
          <input
            type="text"
            className="form-input"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="e.g. Vendor review link"
            style={{ width: '100%', fontSize: '0.8rem' }}
          />
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={linkLoading || !linkKey.trim()}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
        >
          <Link2 size={15} />
          <span>{linkLoading ? 'Generating Link...' : 'Create Secure Link'}</span>
        </button>
      </form>

      {/* Active links list */}
      <div style={{ marginTop: '10px' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
          Active Share Links ({linkList.length})
        </div>
        {linkList.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center', padding: '16px', background: 'var(--bg-input)', borderRadius: '8px' }}>
            No active share links. Create one above to share publicly.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
            {linkList.map((l) => (
              <div
                key={l.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-input)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{l.label || 'Share Link'}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>
                      {l.use_count} {l.max_uses ? `/ ${l.max_uses}` : ''} downloads
                    </span>
                    <button
                      onClick={() => runRevokeShareLink(l.id)}
                      className="btn-danger btn-sm"
                      style={{ padding: '2px 6px', fontSize: '0.7rem' }}
                      title="Revoke Link"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="form-input mono"
                    value={`${window.location.origin}/?share=${l.token}`}
                    style={{ fontSize: '0.72rem', padding: '3px 8px', flex: 1 }}
                  />
                  <button
                    onClick={() => copyShareUrl(l.token)}
                    className="btn-secondary btn-sm"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                  >
                    {copiedToken === l.token ? '✓ Copied' : 'Copy URL'}
                  </button>
                </div>
                {l.expires_at && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    Expires: {new Date(l.expires_at).toLocaleString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── MENU ──
  const menuItems = [
    { id: 'verify',    icon: <ShieldCheck size={18} style={{ color: 'var(--accent-emerald)' }} />, label: 'Verify Integrity',    sub: 'RSA-PSS digital signature & SHA-256 hash check' },
    { id: 'download',  icon: <Download   size={18} style={{ color: 'var(--accent-blue)'    }} />, label: 'Download',            sub: 'Decrypt & save file using your RSA private key', disabled: file.is_expired },
    { id: 'share',     icon: <Share2     size={18} style={{ color: 'var(--accent-cyan)'    }} />, label: 'Share',               sub: 'Securely share with registered recipients', disabled: file.is_expired },
    { id: 'sign',      icon: <PenTool    size={18} style={{ color: 'var(--accent-purple)'  }} />, label: 'RSA-PSS e-Sign',      sub: 'Cryptographically sign document with your private key' },
    { id: 'sharelink', icon: <Link2      size={18} style={{ color: 'var(--accent-cyan)'    }} />, label: 'Secure Share Link',   sub: 'Generate time-limited public access link' },
    { id: 'access',    icon: <Users      size={18} style={{ color: 'var(--accent-purple)'  }} />, label: 'Access',              sub: 'View sharing grants and revoke access' },
    { id: 'expiry',    icon: <Clock      size={18} style={{ color: 'var(--accent-amber)'   }} />, label: 'Expiry',              sub: 'View or manage file expiration date' },
    { id: 'move',      icon: <Folder     size={18} style={{ color: 'var(--accent-cyan)'    }} />, label: 'Move to Folder',      sub: 'Organize into custom folders or Uncategorized' },
    { id: 'delete',    icon: <Trash2     size={18} style={{ color: 'var(--accent-rose)'    }} />, label: 'Delete',              sub: 'Permanently delete with confirmation', danger: true },
  ];

  // View titles for header
  const viewTitles = {
    verify: 'Verify Integrity',
    download: 'Download',
    share: 'Share File',
    sign: 'RSA-PSS e-Signature',
    sharelink: 'Secure Share Links',
    access: 'Access Management',
    expiry: 'Expiry Settings',
    move: 'Move to Folder',
    delete: 'Delete File'
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        backgroundColor: 'rgba(5, 7, 15, 0.80)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
      }}
      onKeyDown={e => e.key === 'Escape' && e.stopPropagation()}
      /* Backdrop click does nothing */
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          width: '100%',
          maxWidth: activeView === 'access' ? '640px' : '500px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)' }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                {activeView ? viewTitles[activeView] : 'Zero Trust Actions'}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {activeView ? `File: ${file.original_filename}` : 'Cryptographic verification and access controls'}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn-secondary btn-sm" style={{ padding: '6px', flexShrink: 0 }} title="Close">
            <X size={16} />
          </button>
        </div>

        {/* ── File Info Banner (always visible) ── */}
        <div style={{
          margin: '14px 20px 0', padding: '9px 12px',
          backgroundColor: 'var(--bg-input)', borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: '0.81rem', flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0 }}>
            <FileText size={15} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.original_filename}</strong>
          </div>
          <span style={{ color: 'var(--text-dim)', flexShrink: 0, marginLeft: '10px' }}>{formatBytes(file.file_size)}</span>
        </div>

        {/* ── Body: Menu or Sub-Panel ── */}
        <div style={{ padding: '14px 20px 20px', overflowY: 'auto', flex: 1 }}>
          {!activeView ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {menuItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(item.id)}
                  disabled={item.disabled}
                  style={{
                    ...actionRowStyle,
                    ...(item.danger ? { border: '1px solid rgba(244,63,94,0.25)', backgroundColor: 'rgba(244,63,94,0.04)' } : {}),
                    opacity: item.disabled ? 0.45 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {item.icon}
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: item.danger ? 'var(--accent-rose)' : 'var(--text-main)' }}>{item.label}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.sub}</div>
                    </div>
                  </div>
                  <ArrowRight size={14} style={{ color: item.danger ? 'var(--accent-rose)' : 'var(--text-dim)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ) : (
            <>
              {activeView === 'verify'    && renderVerify()}
              {activeView === 'download'  && renderDownload()}
              {activeView === 'share'     && renderShare()}
              {activeView === 'sign'      && renderSign()}
              {activeView === 'sharelink' && renderShareLink()}
              {activeView === 'access'    && renderAccess()}
              {activeView === 'expiry'    && renderExpiry()}
              {activeView === 'move'      && renderMove()}
              {activeView === 'delete'    && renderDelete()}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--border-color)',
          display: 'flex', justifyContent: activeView ? 'space-between' : 'flex-end',
          alignItems: 'center', flexShrink: 0, gap: '8px'
        }}>
          {activeView && (
            <button onClick={() => setActiveView(null)} className="btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              ← All Actions
            </button>
          )}
          <button onClick={onClose} className="btn-secondary" style={{ minWidth: '88px' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main MyFiles Component ─────────────────────────────────────────────────────
export default function MyFiles({ setActiveTab }) {
  const { privateKeys } = useAuth();
  const [files, setFiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' | 'uncategorized' | string id
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [subStatus, setSubStatus] = useState(null);

  // ── Unified Zero Trust Actions Modal state ─────────────────────────────────
  const [actionsFile, setActionsFile] = useState(null);

  // Keep SecureViewer separate (it is fullscreen / needs its own overlay)
  const [viewingFile, setViewingFile] = useState(null);

  // Category Management Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [categoryWorking, setCategoryWorking] = useState(false);

  const fileInputRef = useRef(null);

  // Fetch Categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await filesAPI.getCategories();
      setCategories(res.data);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  // Fetch Files
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (sortBy) params.sort_by = sortBy;
      if (selectedCategory && selectedCategory !== 'all') {
        params.category_id = selectedCategory;
      }
      const res = await filesAPI.getMyFiles(params);
      setFiles(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to retrieve your files.');
    } finally {
      setLoading(false);
    }
  }, [search, sortBy, selectedCategory]);

  const fetchSubStatus = useCallback(async () => {
    try {
      const res = await subscriptionAPI.getStatus();
      setSubStatus(res.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchFiles();
    fetchSubStatus();
  }, [fetchFiles, fetchSubStatus]);

  // Handle File Upload
  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!privateKeys?.signing_private_key) {
      setError('Your RSA signing private key is required to sign the file manifest. Please import your keys first.');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('signing_private_key', privateKeys.signing_private_key);

      // If viewing a specific category (not 'all' and not 'uncategorized'), associate the file
      if (selectedCategory && selectedCategory !== 'all' && selectedCategory !== 'uncategorized') {
        formData.append('category_id', selectedCategory);
      }

      const res = await filesAPI.upload(formData);
      setSuccess(`File '${res.data.original_filename}' encrypted with AES-256-GCM and signed with RSA-PSS.`);
      await fetchFiles();
      await fetchCategories();
      await fetchSubStatus();
    } catch (err) {
      setError(err.response?.data?.detail || 'File upload and encryption failed.');
      fetchSubStatus();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Create New Category Folder
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCategoryWorking(true);
    setError('');
    try {
      const res = await filesAPI.createCategory({ name: newFolderName.trim() });
      setNewFolderName('');
      setShowNewFolderModal(false);
      setSuccess(`Folder '${res.data.name}' created.`);
      await fetchCategories();
      setSelectedCategory(String(res.data.id));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create category folder.');
    } finally {
      setCategoryWorking(false);
    }
  };

  // Rename Category Folder
  const handleRenameCategory = async (e) => {
    e.preventDefault();
    if (!editingCategory || !renameValue.trim()) return;
    setCategoryWorking(true);
    setError('');
    try {
      const res = await filesAPI.updateCategory(editingCategory.id, { name: renameValue.trim() });
      setEditingCategory(null);
      setSuccess(`Folder renamed to '${res.data.name}'.`);
      await fetchCategories();
      await fetchFiles();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to rename folder.');
    } finally {
      setCategoryWorking(false);
    }
  };

  // Delete Category Folder
  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    setCategoryWorking(true);
    setError('');
    try {
      await filesAPI.deleteCategory(categoryToDelete.id);
      setSuccess(`Folder '${categoryToDelete.name}' deleted. Files moved to Uncategorized.`);
      setCategoryToDelete(null);
      setSelectedCategory('all');
      await fetchCategories();
      await fetchFiles();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete folder.');
    } finally {
      setCategoryWorking(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const d = new Date(expiresAt);
    const now = new Date();
    const diffHours = (d - now) / 3600000;
    if (diffHours < 0) return { label: 'Expired', cls: 'badge-danger' };
    if (diffHours < 24) return { label: `Expires in ${Math.round(diffHours)}h`, cls: 'badge-warning' };
    return { label: `Expires ${d.toLocaleDateString()}`, cls: 'badge-info' };
  };

  const activeCategoryObj = categories.find((c) => String(c.id) === selectedCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HardDrive size={26} style={{ color: 'var(--accent-blue)' }} /> My Encrypted Vault
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Personal encrypted storage organized into custom folders with Zero Trust client-side security.
          </p>
        </div>
        <div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} className="btn-primary" disabled={uploading}>
            <Upload size={16} />
            <span>{uploading ? 'Encrypting & Uploading...' : 'Upload & Encrypt File'}</span>
          </button>
        </div>
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

      {/* ── Personal Subscription Quota & Upgrade Banner ── */}
      {subStatus && (subStatus.is_limit_reached || (subStatus.subscription_status !== 'ACTIVE' && subStatus.personal_files_count >= 15)) && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '10px',
          border: '1px solid #f59e0b',
          background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, rgba(239, 68, 68, 0.08) 100%)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '50%',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#f59e0b', flexShrink: 0
            }}>
              <AlertCircle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                Free Personal Tier Limit Reached ({subStatus.personal_files_count} / 15 files)
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                You have reached the 15-file limit for Free personal accounts. Upgrade to Pro (₹60/mo or ₹699/yr) to unlock unlimited encrypted file uploads.
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab ? setActiveTab('settings') : (window.location.hash = '#settings')}
            className="btn-primary"
            style={{
              backgroundColor: '#f59e0b',
              borderColor: '#d97706',
              color: '#000',
              fontWeight: 700,
              fontSize: '0.85rem',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <span>Upgrade to Pro</span>
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* ── File Explorer: Categories & Folders Bar ── */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 600 }}>
            <FolderOpen size={18} style={{ color: 'var(--accent-cyan)' }} />
            <span>Folders &amp; Categories</span>
          </div>
          <button
            onClick={() => {
              setNewFolderName('');
              setShowNewFolderModal(true);
            }}
            className="btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FolderPlus size={14} style={{ color: 'var(--accent-blue)' }} />
            <span>+ New Folder</span>
          </button>
        </div>

        {/* Folders List */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* All Files */}
          <button
            onClick={() => setSelectedCategory('all')}
            className={`btn-sm ${selectedCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Layers size={14} />
            <span>All Files</span>
          </button>

          {/* Uncategorized */}
          <button
            onClick={() => setSelectedCategory('uncategorized')}
            className={`btn-sm ${selectedCategory === 'uncategorized' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Folder size={14} style={{ opacity: 0.7 }} />
            <span>Uncategorized</span>
          </button>

          {/* User Categories */}
          {categories.map((cat) => {
            const isSelected = selectedCategory === String(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(String(cat.id))}
                className={`btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Folder size={14} style={{ color: isSelected ? '#ffffff' : 'var(--accent-cyan)' }} />
                <span>{cat.name}</span>
                <span
                  style={{
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-input)',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontSize: '0.72rem'
                  }}
                >
                  {cat.file_count ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Folder Banner & Actions */}
        {activeCategoryObj && (
          <div style={{
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '0.85rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
              <span>Active Folder:</span>
              <strong style={{ color: 'var(--text-main)', fontSize: '0.92rem' }}>{activeCategoryObj.name}</strong>
              <span className="badge badge-info">{activeCategoryObj.file_count} file(s)</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setRenameValue(activeCategoryObj.name);
                  setEditingCategory(activeCategoryObj);
                }}
                className="btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Rename this folder"
              >
                <Edit3 size={13} /> Rename
              </button>

              <button
                onClick={() => setCategoryToDelete(activeCategoryObj)}
                className="btn-danger btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Delete folder and move files to Uncategorized"
              >
                <Trash2 size={13} /> Delete Folder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Files Table Card ── */}
      <div className="card">
        {/* Controls: Search, Sort, Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontWeight: 600, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: 'var(--accent-blue)' }} />
            <span>
              {selectedCategory === 'all'
                ? `All Vault Files (${files.length})`
                : selectedCategory === 'uncategorized'
                ? `Uncategorized Files (${files.length})`
                : `Folder: ${activeCategoryObj?.name || 'Category'} (${files.length})`}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', width: '180px', height: '34px', fontSize: '0.85rem' }}
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="form-input"
              style={{ height: '34px', fontSize: '0.85rem', width: '140px' }}
            >
              <option value="">Sort: Newest</option>
              <option value="name">Sort: Name A-Z</option>
              <option value="size">Sort: Largest</option>
            </select>

            <button onClick={fetchFiles} className="btn-secondary btn-sm" disabled={loading} title="Refresh files">
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Loading / Empty / Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '12px', color: 'var(--accent-blue)' }} />
            <p>Loading files from encrypted vault...</p>
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <Upload size={36} style={{ color: 'var(--text-dim)', marginBottom: '12px', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {search ? 'No files match your search' : 'No files in this folder'}
            </h3>
            <p style={{ fontSize: '0.88rem', marginTop: '4px' }}>
              {search
                ? 'Try a different search term or clear the filter.'
                : 'Upload a file to encrypt it with AES-256-GCM and store it securely.'}
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>File Size</th>
                  <th>Uploaded Date / Expiry Date</th>
                  <th>View</th>
                  <th style={{ textAlign: 'right' }}>Zero Trust Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const expiryInfo = formatExpiry(f.expires_at);

                  return (
                    <tr key={f.id} style={f.is_expired ? { opacity: 0.55 } : {}}>
                      {/* Column 1: File Name */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                          <FileText size={16} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
                          <span>{f.original_filename}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                          <span>{f.mime_type || 'application/octet-stream'}</span>
                          {f.category_name ? (
                            <span className="badge badge-secondary" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                              <Folder size={10} style={{ marginRight: '3px' }} />{f.category_name}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>&bull; Uncategorized</span>
                          )}
                        </div>
                      </td>

                      {/* Column 2: File Size */}
                      <td style={{ fontSize: '0.85rem' }}>{formatBytes(f.file_size)}</td>

                      {/* Column 3: Uploaded Date / Expiry Date */}
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        <div>{new Date(f.created_at).toLocaleString()}</div>
                        {expiryInfo && (
                          <span className={`badge ${expiryInfo.cls}`} style={{ marginTop: '4px', display: 'inline-block', fontSize: '0.72rem' }}>
                            <Clock size={10} style={{ marginRight: '3px' }} />{expiryInfo.label}
                          </span>
                        )}
                      </td>

                      {/* Column 4: View button */}
                      <td>
                        <button
                          onClick={() => setViewingFile(f)}
                          className="btn-secondary btn-sm"
                          disabled={f.is_expired}
                          title="Secure In-Browser Viewer with dynamic security watermarking"
                          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Eye size={14} style={{ color: 'var(--accent-blue)' }} />
                          <span>View</span>
                        </button>
                      </td>

                      {/* Column 5: Zero Trust Actions button */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => setActionsFile(f)}
                          className="btn-primary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          title="Open Zero Trust Security Actions"
                        >
                          <ShieldCheck size={14} />
                          <span>Zero Trust Actions</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Create New Category Folder ── */}
      {showNewFolderModal && (
        <div className="modal-backdrop" onClick={() => !categoryWorking && setShowNewFolderModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus size={18} style={{ color: 'var(--accent-blue)' }} /> Create Custom Folder
              </h3>
              <button onClick={() => setShowNewFolderModal(false)} style={{ color: 'var(--text-dim)' }} disabled={categoryWorking}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCategory}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Folder / Category Name:
              </label>
              <input
                type="text"
                required
                minLength={1}
                maxLength={100}
                className="form-input"
                style={{ width: '100%', marginBottom: '18px' }}
                placeholder="e.g. Invoices, Contracts, Photos..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setShowNewFolderModal(false)} className="btn-secondary" disabled={categoryWorking}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={categoryWorking || !newFolderName.trim()}>
                  {categoryWorking ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Rename Category Folder ── */}
      {editingCategory && (
        <div className="modal-backdrop" onClick={() => !categoryWorking && setEditingCategory(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} style={{ color: 'var(--accent-cyan)' }} /> Rename Folder
              </h3>
              <button onClick={() => setEditingCategory(null)} style={{ color: 'var(--text-dim)' }} disabled={categoryWorking}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRenameCategory}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                New Name for "{editingCategory.name}":
              </label>
              <input
                type="text"
                required
                minLength={1}
                maxLength={100}
                className="form-input"
                style={{ width: '100%', marginBottom: '18px' }}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setEditingCategory(null)} className="btn-secondary" disabled={categoryWorking}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={categoryWorking || !renameValue.trim()}>
                  {categoryWorking ? 'Renaming...' : 'Rename Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Delete Category Folder Confirmation ── */}
      {categoryToDelete && (
        <div className="modal-backdrop" onClick={() => !categoryWorking && setCategoryToDelete(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trash2 size={18} /> Delete Folder
              </h3>
              <button onClick={() => setCategoryToDelete(null)} style={{ color: 'var(--text-dim)' }} disabled={categoryWorking}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '8px' }}>
              Are you sure you want to delete folder <strong>"{categoryToDelete.name}"</strong>?
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '18px', lineHeight: 1.5 }}>
              Files currently inside this folder will <strong>not</strong> be deleted; they will be safely moved to <strong>Uncategorized</strong>.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setCategoryToDelete(null)} className="btn-secondary" disabled={categoryWorking}>
                Cancel
              </button>
              <button onClick={handleDeleteCategory} className="btn-danger" disabled={categoryWorking}>
                {categoryWorking ? 'Deleting...' : 'Delete Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Zero Trust Actions: Unified Modal ── */}
      {actionsFile && (
        <ZeroTrustActionsModal
          file={actionsFile}
          categories={categories}
          privateKeys={privateKeys}
          onClose={() => setActionsFile(null)}
          onFilesRefresh={() => { fetchFiles(); fetchCategories(); }}
        />
      )}

      {/* SecureViewer stays as a separate fullscreen overlay */}
      {viewingFile && <SecureViewerModal file={viewingFile} onClose={() => setViewingFile(null)} onManageKeys={() => { setViewingFile(null); setActiveTab('keys'); }} />}
    </div>
  );
}
