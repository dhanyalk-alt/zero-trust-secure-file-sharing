import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';
import { verifyEncryptionPrivateKey } from '../crypto/keyProof';
import { KeyRound, Download, Upload, Copy, CheckCircle, AlertCircle, Shield, Eye, EyeOff } from 'lucide-react';

export default function KeyManagement() {
  const { user, privateKeys, savePrivateKeys } = useAuth();
  const [encPrivKey, setEncPrivKey] = useState(privateKeys?.encryption_private_key || '');
  const [sigPrivKey, setSigPrivKey] = useState(privateKeys?.signing_private_key || '');
  const [showEncPriv, setShowEncPriv] = useState(false);
  const [showSigPriv, setShowSigPriv] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const handleSaveLocalKeys = async (e) => {
    e.preventDefault();
    if (!encPrivKey.trim() || !sigPrivKey.trim()) {
      setError('Both Encryption and Signing private keys are required.');
      return;
    }

    setError('');
    try {
      await verifyEncryptionPrivateKey(encPrivKey.trim());
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Encryption private key verification failed.');
      return;
    }

    savePrivateKeys({
      encryption_private_key: encPrivKey.trim(),
      signing_private_key: sigPrivKey.trim()
    });

    setNotice('Private keys successfully updated in local session storage.');
    setError('');
  };

  const handleDownloadBackup = () => {
    if (!privateKeys) {
      setError('No private keys currently loaded to export.');
      return;
    }
    const blob = new Blob([JSON.stringify(privateKeys, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${user?.username || 'user'}_vault_keys.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Cryptographic key backup downloaded.');
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (parsed.encryption_private_key && parsed.signing_private_key) {
          await verifyEncryptionPrivateKey(parsed.encryption_private_key.trim());
          setEncPrivKey(parsed.encryption_private_key);
          setSigPrivKey(parsed.signing_private_key);
          savePrivateKeys(parsed);
          setNotice('Private keys imported and saved successfully.');
          setError('');
        } else {
          setError('Invalid key backup file format. Expected encryption_private_key and signing_private_key.');
        }
      } catch (err) {
        setError(err.response?.data?.detail || err.message || 'Failed to parse JSON key file.');
      }
    };
    reader.readAsText(file);
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Cryptographic Key Management</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
          Zero Trust client-side key lifecycle. Your private keys never leave your device in plaintext.
        </p>
      </div>

      {notice && (
        <div className="alert-box alert-success">
          <CheckCircle size={18} style={{ flexShrink: 0 }} />
          <div>{notice}</div>
        </div>
      )}

      {error && (
        <div className="alert-box alert-danger">
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>{error}</div>
        </div>
      )}

      {/* Backup and Import Toolbar */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>Key Backup & Import</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Store your cryptographic identity safely offline or restore across sessions.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <label className="btn-secondary" style={{ cursor: 'pointer' }}>
            <Upload size={16} />
            <span>Import Key Backup (.json)</span>
            <input type="file" accept=".json" onChange={handleImportFile} style={{ display: 'none' }} />
          </label>

          <button onClick={handleDownloadBackup} className="btn-primary" disabled={!privateKeys}>
            <Download size={16} />
            <span>Download Key Backup</span>
          </button>
        </div>
      </div>

      {/* Private Keys in Local Session */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <KeyRound size={20} style={{ color: 'var(--accent-amber)' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Active Session Private Keys</h2>
        </div>

        <form onSubmit={handleSaveLocalKeys} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Encryption Private Key */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                RSA-2048 Encryption Private Key (Used for unwrapping AES keys)
              </label>
              <button
                type="button"
                onClick={() => setShowEncPriv(!showEncPriv)}
                style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {showEncPriv ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showEncPriv ? 'Mask Key' : 'Reveal Key'}</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={showEncPriv ? encPrivKey : encPrivKey ? '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••' : ''}
              onChange={(e) => setEncPrivKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----"
              className="mono"
              style={{ width: '100%', fontSize: '0.78rem' }}
            />
          </div>

          {/* Signing Private Key */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '0.88rem', fontWeight: 500 }}>
                RSA-2048 Signing Private Key (Used for digital signatures)
              </label>
              <button
                type="button"
                onClick={() => setShowSigPriv(!showSigPriv)}
                style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                {showSigPriv ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{showSigPriv ? 'Mask Key' : 'Reveal Key'}</span>
              </button>
            </div>
            <textarea
              rows={4}
              value={showSigPriv ? sigPrivKey : sigPrivKey ? '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••' : ''}
              onChange={(e) => setSigPrivKey(e.target.value)}
              placeholder="-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----"
              className="mono"
              style={{ width: '100%', fontSize: '0.78rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary">
              Save Active Keys in Session
            </button>
          </div>
        </form>
      </div>

      {/* Registered Public Keys */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Shield size={20} style={{ color: 'var(--accent-emerald)' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Public Identity Registered on Server</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.88rem' }}>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>RSA-2048 Public Encryption Key</strong>
              <span className={`badge ${user?.has_encryption_key ? 'badge-success' : 'badge-danger'}`}>
                {user?.has_encryption_key ? 'Registered' : 'Not Set'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Used by file uploaders to wrap AES keys so only you can decrypt shared files.
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-input)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>RSA-2048 Public Signing Key</strong>
              <span className={`badge ${user?.has_signing_key ? 'badge-success' : 'badge-danger'}`}>
                {user?.has_signing_key ? 'Registered' : 'Not Set'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Used by recipients to verify digital signatures on your uploaded file manifests.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
