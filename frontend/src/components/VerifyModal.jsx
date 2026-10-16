import React, { useState, useEffect } from 'react';
import { filesAPI } from '../api/client';
import { Shield, CheckCircle, AlertTriangle, X, RefreshCw } from 'lucide-react';

export default function VerifyModal({ file, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const runVerification = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await filesAPI.verifyIntegrity(file.id);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Cryptographic verification check failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (file) {
      runVerification();
    }
  }, [file]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <Shield size={20} style={{ color: 'var(--accent-blue)' }} />
            <span>Zero Trust Cryptographic Verification</span>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Target File:</div>
          <div style={{ fontWeight: 600, fontSize: '1rem', marginTop: '2px' }}>{file?.original_filename}</div>
          <div className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            ID: {file?.id}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px', color: 'var(--accent-blue)' }} />
            <p style={{ fontSize: '0.9rem' }}>Verifying RSA-PSS signatures & ciphertext authenticity...</p>
          </div>
        ) : error ? (
          <div className="alert-box alert-danger">
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        ) : result ? (
          <div>
            {/* Overall Status Banner */}
            <div style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: result.overall_status === 'VERIFIED_AUTHENTIC' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
              border: `1px solid ${result.overall_status === 'VERIFIED_AUTHENTIC' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              {result.overall_status === 'VERIFIED_AUTHENTIC' ? (
                <CheckCircle size={28} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
              ) : (
                <AlertTriangle size={28} style={{ color: 'var(--accent-rose)', flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {result.overall_status === 'VERIFIED_AUTHENTIC' ? 'Authenticity & Integrity Confirmed' : 'Integrity Alert: Potential Compromise'}
                </div>
                <div style={{ fontSize: '0.82rem', marginTop: '2px', color: 'var(--text-main)' }}>
                  {result.details}
                </div>
              </div>
            </div>

            {/* Checklist items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-input)' }}>
                <span>RSA-PSS Manifest Digital Signature</span>
                <span className={`badge ${result.signature_valid ? 'badge-success' : 'badge-danger'}`}>
                  {result.signature_valid ? 'Valid & Authentic' : 'Invalid / Tampered'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-input)' }}>
                <span>AES-GCM Ciphertext Storage</span>
                <span className={`badge ${result.aes_gcm_authenticated ? 'badge-success' : 'badge-danger'}`}>
                  {result.aes_gcm_authenticated ? 'Intact & Available' : 'Missing / Corrupted'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-input)' }}>
                <span>Sender Public Key Registration</span>
                <span className={`badge ${result.sender_public_key_present ? 'badge-success' : 'badge-danger'}`}>
                  {result.sender_public_key_present ? 'Verified Registered' : 'Missing Key'}
                </span>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-input)', marginTop: '4px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Original SHA-256 Fingerprint:</span>
                <div className="mono" style={{ fontSize: '0.78rem', marginTop: '4px', wordBreak: 'break-all', color: 'var(--accent-cyan)' }}>
                  {result.file_sha256_hash}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
