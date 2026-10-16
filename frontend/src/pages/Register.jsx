import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, User, Mail, Lock, Key, CheckCircle, AlertCircle, Download } from 'lucide-react';

export default function Register({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registeredKeys, setRegisteredKeys] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await register({ username, email, password });
      if (res.generated_keypairs) {
        setRegisteredKeys(res.generated_keypairs);
      } else {
        onSwitchToLogin();
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Registration failed. Please check your inputs.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const downloadKeysBackup = () => {
    if (!registeredKeys) return;
    const blob = new Blob([JSON.stringify(registeredKeys, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${username}_zerotrust_keys.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (registeredKeys) {
    return (
      <div className="auth-page" style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px'
      }}>
        <div className="card auth-card">
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <CheckCircle size={48} style={{ color: 'var(--accent-emerald)', marginBottom: '12px' }} />
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>Account Provisioned Successfully!</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px' }}>
              Your RSA-2048 Dual Cryptographic Keypairs (Encryption & Signing) have been generated.
            </p>
          </div>

          <div className="alert-box alert-info">
            <Key size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Critical Security Notice:</strong>
              <div style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                Your private keys are securely saved in your local browser storage for this session. Please download your key backup file now. If you lose your private keys, encrypted files cannot be recovered.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button
              onClick={downloadKeysBackup}
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Download size={16} />
              <span>Download Key Backup (.json)</span>
            </button>

            <button
              onClick={onSwitchToLogin}
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <span>Continue to Login</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page" style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '28px'
    }}>
      <div className="card auth-card">
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            padding: '12px',
            borderRadius: '16px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            marginBottom: '16px'
          }}>
            <Shield size={36} style={{ color: 'var(--accent-blue)' }} />
          </div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 700 }}>Create Vault Account</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: '6px' }}>
            Automatic Zero Trust Key Generation & Strict Access Isolation
          </p>
        </div>

        {error && (
          <div className="alert-box alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                style={{ width: '100%', paddingLeft: '38px' }}
              />
              <User size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                style={{ width: '100%', paddingLeft: '38px' }}
              />
              <Mail size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
              Password (Min 8 Characters)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                style={{ width: '100%', paddingLeft: '38px' }}
              />
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-dim)' }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '8px', padding: '12px' }}
          >
            {loading ? 'Provisioning Keys & Registering...' : 'Register & Generate Cryptographic Keys'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            style={{ color: 'var(--accent-blue)', fontWeight: 600 }}
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}
