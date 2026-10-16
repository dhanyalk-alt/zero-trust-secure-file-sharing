import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI, subscriptionAPI } from '../api/client';
import {
  User,
  Mail,
  Lock,
  Shield,
  CreditCard,
  LogOut,
  Camera,
  Trash2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Check,
  Building2,
  KeyRound,
  Clock,
  ArrowRight
} from 'lucide-react';

export default function Settings() {
  const { user, updateUser, logout } = useAuth();

  // Profile state
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profilePic, setProfilePic] = useState(user?.profile_pic || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const fileInputRef = useRef(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Subscription state
  const [subscriptionPlan, setSubscriptionPlan] = useState(user?.subscription_plan || 'Free Tier');
  const [subStatusInfo, setSubStatusInfo] = useState(null);
  const [subLoading, setSubLoading] = useState(false);
  const [subSuccess, setSubSuccess] = useState('');
  const [subError, setSubError] = useState('');

  // Handle Profile Picture File Selection
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Profile picture must be smaller than 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePic(reader.result);
      setProfileError('');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setProfilePic('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Submit Profile Changes
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const res = await authAPI.updateProfile({
        username: username.trim(),
        email: email.trim(),
        profile_pic: profilePic
      });
      updateUser(res.data);
      setProfileSuccess('Profile details updated successfully.');
    } catch (err) {
      setProfileError(err.response?.data?.detail || 'Failed to update profile.');
    } finally {
      setProfileLoading(false);
    }
  };

  // Submit Password Change
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await authAPI.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      setPasswordSuccess(res.data?.message || 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.response?.data?.detail || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setEmail(user.email || '');
      setProfilePic(user.profile_pic || '');
      setSubscriptionPlan(user.subscription_plan || 'Free Tier');
    }
    loadSubscription();
  }, [user]);

  const loadSubscription = async () => {
    try {
      const res = await subscriptionAPI.getStatus();
      setSubStatusInfo(res.data);
      if (res.data.current_plan) {
        setSubscriptionPlan(res.data.current_plan);
      }
    } catch (err) {
      console.error('Failed to load subscription status:', err);
    }
  };

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleSubscribe = async (planType) => {
    setSubLoading(true);
    setSubError('');
    setSubSuccess('');

    try {
      const orderRes = await subscriptionAPI.createOrder({ plan_type: planType });
      const order = orderRes.data;

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        setSubError('Unable to load Razorpay payment SDK. Please check your internet connection.');
        setSubLoading(false);
        return;
      }

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'Zero Trust Vault',
        description: `${order.plan_name} Subscription`,
        order_id: order.order_id,
        handler: async function (response) {
          try {
            const verifyRes = await subscriptionAPI.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            setSubSuccess(verifyRes.data.message);
            await loadSubscription();
            const meRes = await authAPI.getMe();
            updateUser(meRes.data);
          } catch (verErr) {
            setSubError(verErr.response?.data?.detail || 'Payment verification failed.');
          } finally {
            setSubLoading(false);
          }
        },
        prefill: {
          name: user?.username || '',
          email: user?.email || '',
        },
        theme: {
          color: '#3b82f6'
        },
        modal: {
          ondismiss: function () {
            setSubLoading(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setSubError(`Payment failed: ${resp.error?.description || 'Transaction unsuccessful'}`);
        setSubLoading(false);
      });
      rzp.open();
    } catch (err) {
      setSubError(err.response?.data?.detail || 'Failed to initiate payment.');
      setSubLoading(false);
    }
  };

  const plans = [
    {
      id: 'MONTHLY',
      name: 'Pro Monthly',
      price: '₹60',
      period: 'month',
      popular: false,
      description: 'Ideal for short-term projects and flexible personal workflows.',
      features: [
        'Unlimited encrypted file uploads',
        'AES-256-GCM client encryption',
        'Zero Trust Integrity & RSA verification',
        'Blockchain audit log verification',
        'Temporal access windows & e-Signatures',
        '1 month duration (auto-reverts to Free)'
      ]
    },
    {
      id: 'YEARLY',
      name: 'Pro Yearly',
      price: '₹699',
      period: 'year',
      popular: true,
      savings: 'Save with Annual',
      description: 'Year-round end-to-end Zero Trust security at the best rate.',
      features: [
        'Unlimited encrypted file uploads',
        'AES-256-GCM client encryption',
        'Zero Trust Integrity & RSA verification',
        'Blockchain audit log verification',
        'Temporal access windows & e-Signatures',
        '1 full year of uninterrupted access',
        'Priority encryption & key handling'
      ]
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Account &amp; Security Settings</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
          Manage your personal profile, authentication credentials, and vault subscription.
        </p>
      </div>

      {/* ── Section 1: Profile Information ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <User size={20} style={{ color: 'var(--accent-blue)' }} />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Profile Details</h2>
        </div>

        {profileError && (
          <div className="alert-box alert-danger" style={{ marginBottom: '16px' }}>
            <AlertCircle size={18} />
            <div>{profileError}</div>
          </div>
        )}

        {profileSuccess && (
          <div className="alert-box alert-success" style={{ marginBottom: '16px' }}>
            <CheckCircle size={18} />
            <div>{profileSuccess}</div>
          </div>
        )}

        <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Profile Picture Upload & Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              {profilePic ? (
                <img
                  src={profilePic}
                  alt="Profile"
                  style={{
                    width: '84px',
                    height: '84px',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid var(--accent-blue)',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                  }}
                />
              ) : (
                <div style={{
                  width: '84px',
                  height: '84px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-blue)',
                  fontSize: '1.8rem',
                  fontWeight: 700,
                  border: '2px dashed var(--border-color)'
                }}>
                  {username ? username[0].toUpperCase() : 'U'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Profile Picture</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary btn-sm"
                >
                  <Camera size={14} style={{ marginRight: '4px' }} /> Upload Photo
                </button>
                {profilePic && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="btn-danger btn-sm"
                    title="Remove photo"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Supports JPG, PNG, GIF, or WebP up to 2 MB.
              </span>
            </div>
          </div>

          {/* Name & Email inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                Username / Display Name
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '34px' }}
                  minLength={3}
                  maxLength={50}
                />
                <User size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                Gmail / Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', paddingLeft: '34px' }}
                />
                <Mail size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button type="submit" className="btn-primary" disabled={profileLoading}>
              {profileLoading ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Section 2: Password Setting ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <Lock size={20} style={{ color: 'var(--accent-purple)' }} />
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Password &amp; Security Credentials</h2>
        </div>

        {passwordError && (
          <div className="alert-box alert-danger" style={{ marginBottom: '16px' }}>
            <AlertCircle size={18} />
            <div>{passwordError}</div>
          </div>
        )}

        {passwordSuccess && (
          <div className="alert-box alert-success" style={{ marginBottom: '16px' }}>
            <CheckCircle size={18} />
            <div>{passwordSuccess}</div>
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="form-input"
              style={{ width: '100%' }}
              placeholder="Enter your existing account password"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
                placeholder="Minimum 8 characters"
                minLength={8}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
                placeholder="Re-enter new password"
                minLength={8}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button type="submit" className="btn-primary" disabled={passwordLoading}>
              {passwordLoading ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Section 3: Subscription Plans ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CreditCard size={20} style={{ color: 'var(--accent-emerald)' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Vault Subscription &amp; Storage Quota</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Status:</span>
            {subStatusInfo?.subscription_status === 'ACTIVE' ? (
              <span className="badge badge-success" style={{ fontSize: '0.82rem' }}>
                <CheckCircle size={12} style={{ marginRight: '4px' }} /> Active Pro
              </span>
            ) : subStatusInfo?.subscription_status === 'EXPIRED' ? (
              <span className="badge badge-danger" style={{ fontSize: '0.82rem' }}>
                <AlertCircle size={12} style={{ marginRight: '4px' }} /> Subscription Expired
              </span>
            ) : (
              <span className="badge badge-info" style={{ fontSize: '0.82rem' }}>
                <Sparkles size={12} style={{ marginRight: '4px' }} /> Free Tier
              </span>
            )}
          </div>
        </div>

        {subSuccess && (
          <div className="alert-box alert-success" style={{ marginBottom: '16px' }}>
            <CheckCircle size={18} />
            <div>{subSuccess}</div>
          </div>
        )}

        {subError && (
          <div className="alert-box alert-danger" style={{ marginBottom: '16px' }}>
            <AlertCircle size={18} />
            <div>{subError}</div>
          </div>
        )}

        {/* ── Personal File Quota Bar ── */}
        <div style={{
          padding: '16px',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-input)',
          border: '1px solid var(--border-color)',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Personal Upload Quota: </span>
              {subStatusInfo?.subscription_status === 'ACTIVE' ? (
                <span style={{ color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '0.9rem' }}>
                  Unlimited ({subStatusInfo?.personal_files_count || 0} personal files stored)
                </span>
              ) : (
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: (subStatusInfo?.personal_files_count || 0) >= 15 ? '#ef4444' : 'var(--text-main)' }}>
                  {subStatusInfo?.personal_files_count || 0} / 15 files used
                </span>
              )}
            </div>
            {subStatusInfo?.subscription_expires_at && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={14} />
                <span>
                  {subStatusInfo.subscription_status === 'ACTIVE' ? 'Renews / Expires:' : 'Expired on:'}{' '}
                  <strong>{new Date(subStatusInfo.subscription_expires_at).toLocaleDateString()}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {subStatusInfo?.subscription_status !== 'ACTIVE' && (
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, ((subStatusInfo?.personal_files_count || 0) / 15) * 100)}%`,
                  backgroundColor: (subStatusInfo?.personal_files_count || 0) >= 15 ? '#ef4444' : (subStatusInfo?.personal_files_count || 0) >= 10 ? '#f59e0b' : 'var(--accent-blue)',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          )}

          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: '8px 0 0' }}>
            ℹ️ Free personal accounts can store up to 15 encrypted files. Organization workspace files are completely exempt from this limit.
          </p>
        </div>

        {/* Razorpay Gateway Config Status Notice if not configured */}
        {subStatusInfo && !subStatusInfo.razorpay_configured && (
          <div className="alert-box alert-warning" style={{ marginBottom: '18px', fontSize: '0.85rem' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Payment Gateway Notice:</strong> Razorpay integration credentials (<code>RAZORPAY_KEY_ID</code> &amp; <code>RAZORPAY_KEY_SECRET</code>) must be configured in <code>backend/.env</code> for live checkout.
            </div>
          </div>
        )}

        {/* ── Plans Grid (₹60/mo & ₹699/yr) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {plans.map((plan) => {
            const isActivePlan = subStatusInfo?.subscription_status === 'ACTIVE' &&
              ((plan.id === 'MONTHLY' && subscriptionPlan.includes('Monthly')) ||
               (plan.id === 'YEARLY' && subscriptionPlan.includes('Yearly')));

            return (
              <div
                key={plan.id}
                style={{
                  borderRadius: '10px',
                  border: isActivePlan ? '2px solid var(--accent-emerald)' : '1px solid var(--border-color)',
                  backgroundColor: isActivePlan ? 'rgba(16, 185, 129, 0.05)' : 'var(--bg-input)',
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative'
                }}
              >
                {plan.popular && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-10px',
                      right: '16px',
                      backgroundColor: 'var(--accent-blue)',
                      color: '#ffffff',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      textTransform: 'uppercase'
                    }}
                  >
                    {plan.savings || 'Best Value'}
                  </span>
                )}

                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{plan.name}</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '6px 0 14px' }}>{plan.description}</p>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800 }}>{plan.price}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>/ {plan.period}</span>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {plan.features.map((feat, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                      <Check size={14} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={isActivePlan || subLoading}
                  className={isActivePlan ? 'btn-secondary' : 'btn-primary'}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isActivePlan ? (
                    <>
                      <CheckCircle size={15} style={{ color: 'var(--accent-emerald)' }} />
                      <span>Current Active Plan</span>
                    </>
                  ) : (
                    <>
                      <span>{subLoading ? 'Initiating Checkout...' : `Upgrade for ${plan.price}`}</span>
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 4: Account Actions & Logout ── */}
      <div className="card" style={{ border: '1px solid rgba(239, 68, 68, 0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#f87171' }}>Sign Out &amp; Session Termination</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '2px' }}>
              Terminates your current JWT token session and clears private keys from local storage.
            </p>
          </div>
          <button
            onClick={logout}
            className="btn-danger"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
