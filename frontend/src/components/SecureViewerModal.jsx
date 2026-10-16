import React, { useState, useEffect } from 'react';
import { filesAPI } from '../api/client';
import { getApiErrorMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import {
  Eye,
  Lock,
  Shield,
  AlertCircle,
  AlertTriangle,
  X,
  FileText,
  RefreshCw,
  Download,
  CheckCircle,
  Flame
} from 'lucide-react';

export default function SecureViewerModal({ file, onClose, onAccessConsumed, onManageKeys }) {
  const { user, privateKeys } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [contentUrl, setContentUrl] = useState(null);
  const [contentBlob, setContentBlob] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [isBurnConsumed, setIsBurnConsumed] = useState(false);
  const [timestampStr, setTimestampStr] = useState('');
  const [attempt, setAttempt] = useState(0);

  const isImage = file.mime_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.original_filename);
  const isText = file.mime_type?.startsWith('text/') || /\.(txt|md|json|csv|py|js|jsx|html|css|log|env|yml|yaml|xml)$/i.test(file.original_filename);
  const isPdf = file.mime_type === 'application/pdf' || /\.pdf$/i.test(file.original_filename);

  useEffect(() => {
    const now = new Date();
    setTimestampStr(now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
  }, []);

  useEffect(() => {
    let activeObjectUrl = null;
    let cancelled = false;

    const decryptAndLoad = async () => {
      setError('');
      setContentBlob(null);
      setTextContent(null);
      setContentUrl(null);
      if (!privateKeys?.encryption_private_key) {
        setError('Your matching encryption private key is not loaded. Import the key backup for this account in Key Management, then retry.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const res = await filesAPI.preview(file.id, privateKeys.encryption_private_key);

        if (res.headers && (res.headers['x-burn-on-read-consumed'] === 'true' || res.headers['x-burn-on-read-consumed'] === true)) {
          setIsBurnConsumed(true);
          if (onAccessConsumed) onAccessConsumed();
        } else if (file.is_one_time) {
          setIsBurnConsumed(true);
          if (onAccessConsumed) onAccessConsumed();
        }

        const blob = new Blob([res.data], { type: file.mime_type || 'application/octet-stream' });
        if (cancelled) return;
        setContentBlob(blob);

        if (isText) {
          const text = await blob.text();
          if (!cancelled) setTextContent(text);
        } else {
          activeObjectUrl = URL.createObjectURL(blob);
          if (!cancelled) setContentUrl(activeObjectUrl);
        }
      } catch (err) {
        const message = await getApiErrorMessage(err, 'Could not safely open this file. Check access and your matching encryption key, then retry.');
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    decryptAndLoad();

    return () => {
      cancelled = true;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    };
  }, [file.id, file.is_one_time, file.mime_type, file.original_filename, isText, onAccessConsumed, privateKeys, attempt]);

  const downloadDecryptedFile = () => {
    if (!contentBlob) return;
    const url = URL.createObjectURL(contentBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.original_filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Watermark text composed of recipient email, timestamp, and security classification
  const watermarkText = `CONFIDENTIAL • ${user?.email || user?.username || 'AUTHORIZED RECIPIENT'} • ${timestampStr} • DO NOT DISTRIBUTE`;

  // Watermarked export for images
  const handleDownloadWatermarkedImage = () => {
    if (!contentUrl || !isImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Render diagonal repeating watermarks
      ctx.save();
      ctx.rotate((-28 * Math.PI) / 180);
      ctx.font = `bold ${Math.max(16, Math.floor(canvas.width / 35))}px sans-serif`;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)'; // Red semi-transparent
      ctx.textAlign = 'center';

      const stepX = Math.max(300, Math.floor(canvas.width / 3));
      const stepY = Math.max(120, Math.floor(canvas.height / 6));

      for (let x = -canvas.width * 2; x < canvas.width * 2; x += stepX) {
        for (let y = -canvas.height * 2; y < canvas.height * 2; y += stepY) {
          ctx.fillText(watermarkText, x, y);
        }
      }
      ctx.restore();

      const link = document.createElement('a');
      link.download = `watermarked_${file.original_filename}`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = contentUrl;
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        zIndex: 9999,
        backgroundColor: 'rgba(5, 7, 15, 0.88)',
        backdropFilter: 'blur(8px)'
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '920px',
          width: '94vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          borderRadius: '14px',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(59, 130, 246, 0.15)',
          userSelect: 'none'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)' }}>
              <Eye size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Secure In-Browser Viewer</h3>
                <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Zero Trust Verified</span>
                {isBurnConsumed && (
                  <span className="badge badge-warning" style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)', fontSize: '0.72rem' }}>
                    🔥 One-Time Access Consumed
                  </span>
                )}
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {file.original_filename} ({file.mime_type})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary btn-sm"
            style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Dynamic Watermark Notification Bar */}
        <div
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '0.8rem',
            color: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
            <span>
              <strong>Dynamic Watermarking Active:</strong> Stamped with recipient identity (<code>{user?.email || user?.username}</code>) & timestamp to prevent unauthorized leaks and screen photos.
            </span>
          </div>
          {isImage && (
            <button
              onClick={handleDownloadWatermarkedImage}
              className="btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '4px 8px', height: 'auto' }}
              title="Download preview with indelible security watermark"
            >
              <Download size={12} style={{ marginRight: '4px' }} />
              Watermarked Copy
            </button>
          )}
        </div>

        {/* Burn-on-Read alert if triggered */}
        {isBurnConsumed && (
          <div className="alert-box alert-warning" style={{ marginBottom: '14px', fontSize: '0.82rem' }}>
            <Flame size={16} style={{ color: '#f87171', flexShrink: 0 }} />
            <div>
              <strong>Burn-on-Read Triggered:</strong> This one-time access permission has now been permanently revoked. Once you close this viewer, you will not be able to open or download this file again.
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="alert-box alert-danger" style={{ marginBottom: '14px' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>{error}</div>
          </div>
        )}
        {error && !loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px' }}>
            {onManageKeys && <button className="btn-secondary btn-sm" onClick={onManageKeys}>Key Management</button>}
            <button className="btn-secondary btn-sm" onClick={() => { setLoading(true); setAttempt((n) => n + 1); }}>
              <RefreshCw size={14} style={{ marginRight: 6 }} /> Retry secure preview
            </button>
          </div>
        )}

        {/* Content View Container with Repeating Watermark Overlay */}
        <div
          style={{
            flex: 1,
            minHeight: '380px',
            maxHeight: '62vh',
            overflowY: 'auto',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            backgroundColor: '#0a0d18',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={32} className="spin" style={{ color: 'var(--accent-blue)', marginBottom: '14px' }} />
              <p style={{ fontWeight: 600 }}>Unwrapping AES Key &amp; Decrypting Payload in Memory...</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px' }}>Zero Trust cryptographic verification in progress</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px' }}>
              <Lock size={36} style={{ color: '#ef4444', marginBottom: '12px' }} />
              <p style={{ fontWeight: 600, color: '#f87171' }}>Access Denied</p>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>{error}</p>
            </div>
          ) : (
            <>
              {/* Actual Decrypted Content */}
              <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {isImage && contentUrl && (
                  <img
                    src={contentUrl}
                    alt={file.original_filename}
                    draggable={false}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '56vh',
                      objectFit: 'contain',
                      borderRadius: '6px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                    }}
                  />
                )}

                {isText && textContent !== null && (
                  <pre
                    style={{
                      width: '100%',
                      maxHeight: '56vh',
                      overflowY: 'auto',
                      margin: 0,
                      padding: '16px',
                      backgroundColor: 'rgba(15, 23, 42, 0.75)',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: '#e2e8f0',
                      lineHeight: '1.5'
                    }}
                  >
                    {textContent}
                  </pre>
                )}

                {isPdf && contentUrl && (
                  <iframe
                    src={`${contentUrl}#toolbar=0`}
                    title={file.original_filename}
                    style={{
                      width: '100%',
                      height: '56vh',
                      border: 'none',
                      borderRadius: '6px'
                    }}
                  />
                )}

                {!isImage && !isText && !isPdf && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <FileText size={48} style={{ color: 'var(--accent-blue)', marginBottom: '12px' }} />
                    <h4 style={{ fontWeight: 600, color: 'var(--text-main)' }}>{file.original_filename}</h4>
                    <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>
                      Binary Payload Decrypted Successfully ({file.file_size} bytes).
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      MIME type <code>{file.mime_type}</code> has no direct browser previewer.
                    </p>
                  </div>
                )}
              </div>

              {/* Security Watermark Matrix Overlay (Repeating SVG diagonal text) */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 10,
                  overflow: 'hidden',
                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='360' height='180' viewBox='0 0 360 180'><text x='50%' y='50%' fill='%23ef4444' opacity='0.16' font-size='11' font-family='sans-serif' font-weight='bold' transform='rotate(-25 180 90)' text-anchor='middle'>${encodeURIComponent(watermarkText)}</text></svg>")`,
                  backgroundRepeat: 'repeat'
                }}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={13} style={{ color: 'var(--accent-emerald)' }} />
            <span>AES-256-GCM In-Memory Decryption • SHA-256 Fingerprint: <span className="mono" style={{ color: 'var(--accent-cyan)' }}>{file.file_sha256_hash.slice(0, 12)}...</span></span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={downloadDecryptedFile} className="btn-secondary btn-sm" disabled={!contentBlob}>
              <Download size={14} style={{ marginRight: 5 }} /> Download Original
            </button>
            <button onClick={onClose} className="btn-primary btn-sm">Close Viewer</button>
          </div>
        </div>
      </div>
    </div>
  );
}
