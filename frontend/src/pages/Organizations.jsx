import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Building2,
  Users,
  FileText,
  Plus,
  Trash2,
  Download,
  Eye,
  Share2,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  ShieldCheck,
  Upload,
  Calendar,
  Lock,
  UserPlus,
  X,
  Info,
  Shield,
  Layers,
  Activity,
  BarChart2,
  Clock
} from 'lucide-react';
import { filesAPI, organizationsAPI, usersAPI } from '../api/client';
import { getApiErrorMessage } from '../api/errors';
import { useAuth } from '../context/AuthContext';
import ShareModal from '../components/ShareModal';
import SecureViewerModal from '../components/SecureViewerModal';

export default function Organizations({ setActiveTab }) {
  const { user: currentUser, privateKeys } = useAuth();

  // Organization List & Selection
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [activeSection, setActiveSection] = useState('overview'); // 'overview' | 'members' | 'files'

  // Organization Content
  const [members, setMembers] = useState([]);
  const [files, setFiles] = useState([]);

  // Loading & Feedback
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteOrgModal, setShowDeleteOrgModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [sharingFile, setSharingFile] = useState(null);
  const [viewingFile, setViewingFile] = useState(null);

  // Create Organization Form State
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');

  // Add Member Form State
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchError, setMemberSearchError] = useState('');
  const [matchingUsers, setMatchingUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [memberRole, setMemberRole] = useState('member');
  const [canUpload, setCanUpload] = useState(false);

  // Activity Data
  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [expandedFile, setExpandedFile] = useState(null);
  const [fileActivity, setFileActivity] = useState({});

  // File Upload Reference
  const fileInputRef = useRef(null);

  const getOrganizationsError = (err, fallback) => {
    if (err.response?.status === 404) {
      return 'The backend service does not have the requested organization endpoint.';
    }
    return err.response?.data?.detail || fallback;
  };

  // Load all organizations
  const loadOrganizations = useCallback(async (selectId = null) => {
    setLoading(true);
    setError('');
    try {
      const response = await organizationsAPI.list();
      setOrganizations(response.data);
      if (selectId) {
        const found = response.data.find(item => item.id === selectId);
        if (found) setSelectedOrganization(found);
      } else if (selectedOrganization) {
        const updated = response.data.find(item => item.id === selectedOrganization.id);
        if (updated) setSelectedOrganization(updated);
      }
    } catch (err) {
      setError(getOrganizationsError(err, 'Failed to load organizations.'));
    } finally {
      setLoading(false);
    }
  }, [selectedOrganization]);

  // Load details (members, files, fresh org data) for the selected organization
  const loadOrganizationDetails = useCallback(async () => {
    if (!selectedOrganization) {
      setMembers([]);
      setFiles([]);
      return;
    }
    setError('');
    try {
      const [memberResponse, fileResponse, organizationResponse] = await Promise.all([
        organizationsAPI.getMembers(selectedOrganization.id),
        organizationsAPI.getFiles(selectedOrganization.id),
        organizationsAPI.get(selectedOrganization.id)
      ]);
      setMembers(memberResponse.data);
      setFiles(fileResponse.data);
      setSelectedOrganization(organizationResponse.data);
      setOrganizations(current =>
        current.map(item => item.id === organizationResponse.data.id ? organizationResponse.data : item)
      );
    } catch (err) {
      setError(getOrganizationsError(err, 'Failed to load organization details.'));
    }
  }, [selectedOrganization?.id]);

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (selectedOrganization?.id) {
      loadOrganizationDetails();
      setActivityData(null); // reset activity when switching org
    }
  }, [selectedOrganization?.id]);

  // Load org activity data
  const loadActivity = useCallback(async () => {
    if (!selectedOrganization) return;
    setActivityLoading(true);
    try {
      const res = await organizationsAPI.getActivity(selectedOrganization.id, 200);
      setActivityData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load activity data.');
    } finally {
      setActivityLoading(false);
    }
  }, [selectedOrganization?.id]);

  // Load activity when switching to activity tab
  useEffect(() => {
    if (activeSection === 'activity' && selectedOrganization?.id && !activityData) {
      loadActivity();
    }
  }, [activeSection, selectedOrganization?.id]);

  // Live user search for adding members
  useEffect(() => {
    let active = true;
    const search = async () => {
      if (!memberSearch.trim()) {
        setMatchingUsers([]);
        setMemberSearchError('');
        return;
      }
      try {
        const response = await usersAPI.search(memberSearch.trim());
        if (active) {
          setMatchingUsers(response.data);
          setMemberSearchError('');
        }
      } catch (err) {
        if (active) {
          setMatchingUsers([]);
          setMemberSearchError(err.response?.data?.detail || 'User search failed.');
        }
      }
    };
    search();
    return () => { active = false; };
  }, [memberSearch]);

  // ── Handler: Create Organization ──
  const handleCreateOrganization = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      const response = await organizationsAPI.create({
        name: newOrgName.trim(),
        description: newOrgDesc.trim() || undefined
      });
      setNewOrgName('');
      setNewOrgDesc('');
      setShowCreateModal(false);
      setSuccess(`Organization "${response.data.name}" created successfully.`);
      await loadOrganizations(response.data.id);
      setSelectedOrganization(response.data);
      setActiveSection('overview');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create organization.');
    } finally {
      setWorking(false);
    }
  };

  // ── Handler: Delete Organization ──
  const handleDeleteOrganization = async () => {
    if (!selectedOrganization) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      await organizationsAPI.deleteOrganization(selectedOrganization.id);
      const deletedName = selectedOrganization.name;
      setShowDeleteOrgModal(false);
      setSelectedOrganization(null);
      setSuccess(`Organization "${deletedName}" was deleted and its workspace associations cleaned up.`);
      await loadOrganizations();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete organization.');
    } finally {
      setWorking(false);
    }
  };

  // ── Handler: Add Member ──
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedOrganization || !selectedUser) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      await organizationsAPI.addMember(selectedOrganization.id, {
        user_identifier: selectedUser.username,
        role: memberRole,
        can_upload: canUpload
      });
      setSelectedUser(null);
      setMemberSearch('');
      setMemberRole('member');
      setCanUpload(false);
      setSuccess(`Member "${selectedUser.username}" added to organization.`);
      await loadOrganizationDetails();
      await loadOrganizations();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to add organization member.');
    } finally {
      setWorking(false);
    }
  };

  // ── Handler: Remove Member ──
  const handleConfirmRemoveMember = async () => {
    if (!selectedOrganization || !memberToRemove) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      await organizationsAPI.removeMember(selectedOrganization.id, memberToRemove.user_id);
      setSuccess(`${memberToRemove.username} removed; their organization file access was revoked.`);
      setMemberToRemove(null);
      await loadOrganizationDetails();
      await loadOrganizations();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove member.');
    } finally {
      setWorking(false);
    }
  };

  // ── Handler: Upload Multiple Files ──
  const handleUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (!selectedFiles.length || !selectedOrganization) return;
    if (!privateKeys?.signing_private_key) {
      setError('Your private signing key is required for digital signatures. Import your keys first.');
      event.target.value = '';
      return;
    }
    setWorking(true);
    setError('');
    setSuccess('');
    const failures = [];
    let uploadedCount = 0;

    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('signing_private_key', privateKeys.signing_private_key);
      formData.append('organization_id', String(selectedOrganization.id));
      try {
        await filesAPI.upload(formData);
        uploadedCount += 1;
      } catch (err) {
        failures.push(`${file.name}: ${err.response?.data?.detail || 'Upload failed'}`);
      }
    }

    if (uploadedCount > 0) {
      setSuccess(`${uploadedCount} file${uploadedCount === 1 ? '' : 's'} encrypted with AES-256-GCM and uploaded.`);
    }
    if (failures.length > 0) {
      setError(failures.join(' | '));
    }

    await loadOrganizationDetails();
    await loadOrganizations();
    setWorking(false);
    event.target.value = '';
  };

  // ── Handler: Download File ──
  const handleDownload = async (file) => {
    if (!privateKeys?.encryption_private_key) {
      setError('Your private encryption key is required to decrypt this file.');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const response = await filesAPI.download(file.id, privateKeys.encryption_private_key);
      const url = URL.createObjectURL(new Blob([response.data], { type: file.mime_type || 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.original_filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(await getApiErrorMessage(err, 'File download or integrity verification failed. Verify access and your matching encryption key, then retry.'));
    } finally {
      setWorking(false);
    }
  };

  // ── Handler: Delete File ──
  const handleConfirmDeleteFile = async () => {
    if (!selectedOrganization || !fileToDelete) return;
    setWorking(true);
    setError('');
    setSuccess('');
    try {
      await organizationsAPI.deleteFile(selectedOrganization.id, fileToDelete.id);
      setSuccess(`File "${fileToDelete.original_filename}" was permanently deleted.`);
      setFileToDelete(null);
      await loadOrganizationDetails();
      await loadOrganizations();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete file.');
    } finally {
      setWorking(false);
    }
  };

  const isManager = selectedOrganization && ['owner', 'admin'].includes(selectedOrganization.role);
  const isOwner = selectedOrganization?.role === 'owner';

  // ─────────────────────────────────────────────────────────────
  // RENDER: Organizations Card Grid View
  // ─────────────────────────────────────────────────────────────
  if (!selectedOrganization) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={28} style={{ color: 'var(--accent-blue)' }} /> Organizations
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
              Secure workspace environments with role-based access control and Zero Trust file sharing.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => loadOrganizations()}
              className="btn-secondary btn-sm"
              disabled={loading}
              title="Refresh organizations list"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} /> New Organization
            </button>
          </div>
        </div>

        {/* Global Feedback */}
        {error && (
          <div className="alert-box alert-danger">
            <AlertCircle size={18} />
            <div>{error}</div>
          </div>
        )}
        {success && (
          <div className="alert-box alert-success">
            <CheckCircle size={18} />
            <div>{success}</div>
          </div>
        )}

        {/* Loading State */}
        {loading && organizations.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', display: 'block', color: 'var(--accent-blue)' }} />
            Loading organizations...
          </div>
        )}

        {/* Empty State */}
        {!loading && organizations.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
            <Building2 size={48} style={{ color: 'var(--text-dim)', margin: '0 auto 16px', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
              No Organizations Found
            </h3>
            <p style={{ maxWidth: '460px', margin: '0 auto 20px', fontSize: '0.9rem' }}>
              Create an organization to establish a secure shared workspace for your team or organization.
            </p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus size={16} style={{ marginRight: '6px' }} /> Create Your First Organization
            </button>
          </div>
        )}

        {/* Organizations Cards Grid */}
        {!loading && organizations.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px'
          }}>
            {organizations.map((org) => {
              const roleColor =
                org.role === 'owner' ? 'var(--accent-blue)' :
                org.role === 'admin' ? 'var(--accent-purple)' : 'var(--text-muted)';
              const roleBadgeClass =
                org.role === 'owner' ? 'badge-info' :
                org.role === 'admin' ? 'badge-warning' : 'badge-secondary';

              return (
                <div
                  key={org.id}
                  className="card"
                  onClick={() => {
                    setSelectedOrganization(org);
                    setActiveSection('overview');
                  }}
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    border: '1px solid var(--border-color)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-blue)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.35)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Top Bar: Icon, Name, Role Badge */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(59, 130, 246, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--accent-blue)'
                        }}>
                          <Building2 size={20} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                            {org.name}
                          </h3>
                        </div>
                      </div>
                      <span className={`badge ${roleBadgeClass}`} style={{ textTransform: 'capitalize', fontSize: '0.75rem' }}>
                        {org.role}
                      </span>
                    </div>

                    <p style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                      lineHeight: '1.4',
                      minHeight: '38px',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {org.description || 'Secure collaborative workspace.'}
                    </p>
                  </div>

                  {/* Metrics Bar */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    padding: '10px',
                    backgroundColor: 'var(--bg-input)',
                    borderRadius: '8px',
                    fontSize: '0.82rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Users size={16} style={{ color: 'var(--accent-cyan)' }} />
                      <span><strong>{org.member_count ?? 1}</strong> Member{(org.member_count ?? 1) === 1 ? '' : 's'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={16} style={{ color: 'var(--accent-emerald)' }} />
                      <span><strong>{org.file_count ?? 0}</strong> File{(org.file_count ?? 0) === 1 ? '' : 's'}</span>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '10px',
                    fontSize: '0.78rem',
                    color: 'var(--text-dim)'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={13} /> {new Date(org.created_at).toLocaleDateString()}
                    </span>
                    <span style={{ color: 'var(--accent-blue)', fontWeight: 500 }}>
                      Open Workspace &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Modal: Create Organization ── */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => !working && setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Building2 size={20} style={{ color: 'var(--accent-blue)' }} />
                  <h3 className="modal-title">Create New Organization</h3>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="btn-secondary btn-sm" disabled={working}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateOrganization} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                    Organization Name <span style={{ color: 'var(--accent-rose)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    className="form-input"
                    style={{ width: '100%' }}
                    placeholder="e.g. Acme Research Lab"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                    Description <span style={{ color: 'var(--text-dim)' }}>(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    maxLength={500}
                    className="form-input"
                    style={{ width: '100%', resize: 'vertical' }}
                    placeholder="Brief description of this workspace's purpose"
                    value={newOrgDesc}
                    onChange={(e) => setNewOrgDesc(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary" disabled={working}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={working || !newOrgName.trim()}>
                    {working ? 'Creating...' : 'Create Organization'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER: Dedicated Organization Details View
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Navigation & Workspace Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => {
              setSelectedOrganization(null);
              setError('');
              setSuccess('');
            }}
            className="btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Return to Organizations list"
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                {selectedOrganization.name}
              </h1>
              <span className={`badge ${
                selectedOrganization.role === 'owner' ? 'badge-info' :
                selectedOrganization.role === 'admin' ? 'badge-warning' : 'badge-secondary'
              }`} style={{ textTransform: 'capitalize' }}>
                {selectedOrganization.role}
              </span>
              {selectedOrganization.can_upload && (
                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                  Upload Access
                </span>
              )}
            </div>
            {selectedOrganization.description && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                {selectedOrganization.description}
              </p>
            )}
          </div>
        </div>

        {/* Workspace Actions: Refresh & Delete */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={loadOrganizationDetails}
            className="btn-secondary btn-sm"
            disabled={loading}
            title="Refresh workspace data"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>

          {isOwner && (
            <button
              onClick={() => setShowDeleteOrgModal(true)}
              className="btn-danger btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Delete this organization"
            >
              <Trash2 size={14} /> Delete Organization
            </button>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="alert-box alert-danger">
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}
      {success && (
        <div className="alert-box alert-success">
          <CheckCircle size={18} />
          <div>{success}</div>
        </div>
      )}

      {/* Section Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '2px'
      }}>
        <button
          className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveSection('overview')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px 6px 0 0',
            borderBottom: activeSection === 'overview' ? '2px solid var(--accent-blue)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: activeSection === 'overview' ? 600 : 400
          }}
        >
          <Info size={16} /> Overview
        </button>

        <button
          className={`nav-item ${activeSection === 'members' ? 'active' : ''}`}
          onClick={() => setActiveSection('members')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px 6px 0 0',
            borderBottom: activeSection === 'members' ? '2px solid var(--accent-blue)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: activeSection === 'members' ? 600 : 400
          }}
        >
          <Users size={16} /> Members ({members.length})
        </button>

        <button
          className={`nav-item ${activeSection === 'files' ? 'active' : ''}`}
          onClick={() => setActiveSection('files')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px 6px 0 0',
            borderBottom: activeSection === 'files' ? '2px solid var(--accent-blue)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: activeSection === 'files' ? 600 : 400
          }}
        >
          <FileText size={16} /> Files ({files.length})
        </button>

        <button
          className={`nav-item ${activeSection === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveSection('activity')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px 6px 0 0',
            borderBottom: activeSection === 'activity' ? '2px solid var(--accent-blue)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: activeSection === 'activity' ? 600 : 400
          }}
        >
          <Activity size={16} /> Activity
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: OVERVIEW
      ───────────────────────────────────────────────────────────── */}
      {activeSection === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Quick Metrics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px'
          }}>
            <div className="card" onClick={() => setActiveSection('members')} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem' }}>Total Members</span>
                <Users size={18} style={{ color: 'var(--accent-cyan)' }} />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{members.length}</div>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>View member roster &rarr;</span>
            </div>

            <div className="card" onClick={() => setActiveSection('files')} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem' }}>Organization Files</span>
                <FileText size={18} style={{ color: 'var(--accent-emerald)' }} />
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{files.length}</div>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-blue)' }}>Browse shared vault &rarr;</span>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem' }}>Your Role</span>
                <ShieldCheck size={18} style={{ color: 'var(--accent-purple)' }} />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, textTransform: 'capitalize' }}>
                {selectedOrganization.role}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                {isOwner ? 'Full administrative rights' : isManager ? 'Member & delegation rights' : 'Standard member access'}
              </span>
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-muted)', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem' }}>Upload Permission</span>
                <Upload size={18} style={{ color: selectedOrganization.can_upload ? 'var(--accent-emerald)' : 'var(--accent-rose)' }} />
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {selectedOrganization.can_upload ? 'Active' : 'Restricted'}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                {selectedOrganization.can_upload ? 'Can upload & encrypt files' : 'View & download only'}
              </span>
            </div>
          </div>

          {/* Workspace Details Card */}
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={18} style={{ color: 'var(--accent-blue)' }} /> Workspace Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', fontSize: '0.9rem' }}>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', display: 'block' }}>ORGANIZATION NAME</span>
                <strong>{selectedOrganization.name}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', display: 'block' }}>CREATED ON</span>
                <strong>{new Date(selectedOrganization.created_at).toLocaleString()}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.78rem', display: 'block' }}>DESCRIPTION</span>
                <span>{selectedOrganization.description || 'No description provided.'}</span>
              </div>
            </div>

            <div style={{
              marginTop: '18px',
              padding: '12px 14px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              fontSize: '0.83rem',
              color: 'var(--text-muted)'
            }}>
              <Shield size={18} style={{ color: 'var(--accent-blue)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '2px' }}>
                  Zero Trust Architecture Enforced
                </strong>
                Organization membership grants workspace visibility and management. Every file remains encrypted at rest with AES-256-GCM. Decryption keys are unwrapped strictly via recipient RSA key pairs and audited on every access attempt.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: MEMBERS MANAGEMENT
      ───────────────────────────────────────────────────────────── */}
      {activeSection === 'members' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Add Member Card (Managers Only) */}
          {isManager && (
            <div className="card">
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={18} style={{ color: 'var(--accent-blue)' }} /> Add Registered Member
              </h3>

              <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '1 1 240px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    className="form-input"
                    value={selectedUser ? `${selectedUser.username} (${selectedUser.email})` : memberSearch}
                    onChange={(e) => {
                      setSelectedUser(null);
                      setMemberSearch(e.target.value);
                    }}
                    placeholder="Search by registered username or email..."
                    style={{ paddingLeft: '32px', width: '100%' }}
                  />
                  {matchingUsers.length > 0 && !selectedUser && (
                    <div style={{
                      position: 'absolute',
                      zIndex: 10,
                      top: '100%',
                      left: 0,
                      right: 0,
                      maxHeight: '180px',
                      overflowY: 'auto',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      marginTop: '4px',
                      boxShadow: 'var(--shadow-lg)'
                    }}>
                      {matchingUsers.map((candidate) => (
                        <button
                          type="button"
                          key={candidate.id}
                          onClick={() => {
                            setSelectedUser(candidate);
                            setMemberSearch('');
                            setMatchingUsers([]);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            textAlign: 'left',
                            padding: '10px',
                            borderBottom: '1px solid var(--border-color)',
                            color: 'var(--text-main)',
                            fontSize: '0.85rem'
                          }}
                        >
                          <strong>{candidate.username}</strong>{' '}
                          <span style={{ color: 'var(--text-muted)' }}>({candidate.email})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {isOwner && (
                  <select
                    className="form-input"
                    value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value)}
                    style={{ minWidth: '120px' }}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                )}

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={canUpload}
                    onChange={(e) => setCanUpload(e.target.checked)}
                  />
                  Can upload files
                </label>

                <button
                  type="submit"
                  className="btn-primary btn-sm"
                  disabled={!selectedUser || working}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <UserPlus size={14} /> Add Member
                </button>
              </form>
              {memberSearchError && (
                <div style={{ color: 'var(--accent-rose)', fontSize: '0.8rem', marginTop: '6px' }}>
                  {memberSearchError}
                </div>
              )}
            </div>
          )}

          {/* Members List Table */}
          <div className="card">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} style={{ color: 'var(--accent-cyan)' }} /> Organization Roster ({members.length})
            </h3>

            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Upload Capability</th>
                    <th>Joined</th>
                    {isManager && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isMemberOwner = member.role === 'owner';
                    const isMemberAdmin = member.role === 'admin';
                    const canRemove = isManager && !isMemberOwner && (isOwner || !isMemberAdmin);

                    return (
                      <tr key={member.user_id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: 'rgba(59, 130, 246, 0.15)',
                              color: 'var(--accent-blue)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              fontSize: '0.85rem'
                            }}>
                              {member.username[0]?.toUpperCase()}
                            </div>
                            <div>
                              <strong>{member.username}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{member.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${
                            isMemberOwner ? 'badge-info' :
                            isMemberAdmin ? 'badge-warning' : 'badge-secondary'
                          }`} style={{ textTransform: 'capitalize' }}>
                            {member.role}
                          </span>
                        </td>
                        <td>
                          {member.can_upload ? (
                            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>Upload Allowed</span>
                          ) : (
                            <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>Read Only</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {new Date(member.joined_at).toLocaleDateString()}
                        </td>
                        {isManager && (
                          <td style={{ textAlign: 'right' }}>
                            {canRemove && (
                              <button
                                onClick={() => setMemberToRemove(member)}
                                className="btn-danger btn-sm"
                                title="Remove member and revoke grants"
                                disabled={working}
                              >
                                <Trash2 size={13} style={{ marginRight: '4px' }} /> Remove
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 3: SHARED FILES
      ───────────────────────────────────────────────────────────── */}
      {activeSection === 'files' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Files Action Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} style={{ color: 'var(--accent-emerald)' }} /> Organization Shared Files ({files.length})
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
                  All org members can view &amp; download files. New uploads are auto-shared with existing members.
                  {!selectedOrganization.can_upload && (
                    <span style={{ color: 'var(--accent-amber, #f59e0b)', marginLeft: '4px' }}>
                      (Ask an admin to grant you upload permission.)
                    </span>
                  )}
                </p>
              </div>

              {selectedOrganization.can_upload && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={working}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Upload size={16} /> {working ? 'Encrypting & uploading...' : 'Upload Files'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Files Table */}
          <div className="card">
            {files.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '42px 16px', color: 'var(--text-muted)' }}>
                <FileText size={40} style={{ color: 'var(--text-dim)', margin: '0 auto 12px', opacity: 0.6 }} />
                <p style={{ fontSize: '0.95rem', fontWeight: 500, color: 'var(--text-main)', marginBottom: '4px' }}>
                  No files uploaded to this organization yet.
                </p>
                <p style={{ fontSize: '0.82rem' }}>
                  {selectedOrganization.can_upload
                    ? 'Upload multiple files above to share them securely within this workspace.'
                    : 'Ask an organization administrator for upload permissions.'}
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Filename</th>
                      <th>Uploaded By</th>
                      <th>Uploaded Date</th>
                      <th>Access Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => {
                      const canDeleteFile = file.is_owner || isManager;

                      return (
                        <tr key={file.id}>
                          <td>
                            <strong>{file.original_filename}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                              {Math.ceil(file.file_size / 1024)} KB &bull; {file.mime_type || 'binary'}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '0.85rem' }}>{file.uploader_username}</span>
                            </div>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {new Date(file.created_at).toLocaleString()}
                          </td>
                          <td>
                            {file.is_owner ? (
                              <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>Owner</span>
                            ) : (
                              <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                                {file.can_read ? `Read${file.can_download ? ', Download' : ''}${file.can_share ? ', Share' : ''}` : 'Key access required'}
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {/* Secure View */}
                              {file.can_read && !file.is_expired && (
                                <button
                                  className="btn-secondary btn-sm"
                                  onClick={() => setViewingFile(file)}
                                  title="Secure In-Browser Viewer"
                                >
                                  <Eye size={14} />
                                </button>
                              )}

                              {/* Download & Verify */}
                              {file.can_download && !file.is_expired && (
                                <button
                                  className="btn-secondary btn-sm"
                                  onClick={() => handleDownload(file)}
                                  disabled={working}
                                  title="Download & Decrypt AES Key"
                                >
                                  <Download size={14} />
                                </button>
                              )}

                              {/* Re-Share with Org Members */}
                              {file.can_share && !file.is_expired && (
                                <button
                                  className="btn-secondary btn-sm"
                                  onClick={() => setSharingFile(file)}
                                  title="Share with member"
                                >
                                  <Share2 size={14} />
                                </button>
                              )}

                              {/* Delete File */}
                              {canDeleteFile && (
                                <button
                                  className="btn-danger btn-sm"
                                  onClick={() => setFileToDelete(file)}
                                  title="Delete organization file"
                                  disabled={working}
                                >
                                  <Trash2 size={14} />
                                </button>
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
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          SECTION 4: ACTIVITY ANALYTICS
      ───────────────────────────────────────────────────────────── */}
      {activeSection === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header + Refresh */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BarChart2 size={18} style={{ color: 'var(--accent-blue)' }} /> Organization Activity Log
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '4px' }}>
                Track who accessed which files and what actions were performed.
              </p>
            </div>
            <button
              className="btn-secondary btn-sm"
              onClick={() => { setActivityData(null); loadActivity(); }}
              disabled={activityLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} className={activityLoading ? 'spin' : ''} /> Refresh
            </button>
          </div>

          {activityLoading && (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <RefreshCw size={22} className="spin" style={{ margin: '0 auto 10px', display: 'block', color: 'var(--accent-blue)' }} />
              Loading activity data...
            </div>
          )}

          {!activityLoading && activityData && (
            <>
              {/* Summary Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                <div className="card">
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px' }}>TOTAL EVENTS</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{activityData.total_events}</div>
                </div>
                <div className="card">
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px' }}>TRACKED FILES</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{files.length}</div>
                </div>
                <div className="card">
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '6px' }}>ACTIVE MEMBERS</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>
                    {new Set(activityData.activity.map(a => a.username)).size}
                  </div>
                </div>
              </div>

              {/* Member Action Summary Table */}
              {activityData.summary.length > 0 && (
                <div className="card">
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={16} style={{ color: 'var(--accent-cyan)' }} /> Member Activity Summary
                  </h3>
                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Action</th>
                          <th>Count</th>
                          <th>Bar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const maxCount = Math.max(...activityData.summary.map(s => s.count), 1);
                          return activityData.summary.slice(0, 25).map((row, i) => {
                            const pct = Math.round((row.count / maxCount) * 100);
                            const actionColor =
                              row.action.includes('DOWNLOAD') ? 'var(--accent-emerald)' :
                              row.action.includes('UPLOAD') ? 'var(--accent-blue)' :
                              row.action.includes('DENIED') || row.action.includes('FAIL') ? 'var(--accent-rose)' :
                              row.action.includes('VIEW') ? 'var(--accent-cyan)' :
                              'var(--accent-purple)';
                            return (
                              <tr key={i}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{
                                      width: '28px', height: '28px', borderRadius: '50%',
                                      backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontWeight: 700, fontSize: '0.78rem'
                                    }}>
                                      {(row.username || '?')[0].toUpperCase()}
                                    </div>
                                    <strong style={{ fontSize: '0.85rem' }}>{row.username}</strong>
                                  </div>
                                </td>
                                <td>
                                  <span style={{
                                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem',
                                    fontFamily: 'monospace', backgroundColor: 'var(--bg-input)',
                                    color: actionColor
                                  }}>
                                    {row.action}
                                  </span>
                                </td>
                                <td style={{ fontWeight: 600 }}>{row.count}</td>
                                <td style={{ minWidth: '100px' }}>
                                  <div style={{ backgroundColor: 'var(--bg-input)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: actionColor, borderRadius: '4px', transition: 'width 0.4s' }} />
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent Activity Feed */}
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={16} style={{ color: 'var(--accent-emerald)' }} /> Recent Activity ({activityData.activity.length} events)
                </h3>
                {activityData.activity.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    <Activity size={36} style={{ opacity: 0.4, margin: '0 auto 10px', display: 'block' }} />
                    No activity recorded yet. Events appear after files are accessed.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
                    {activityData.activity.map((event) => {
                      const isSuccess = event.status === 'SUCCESS';
                      const isDenied = event.status === 'DENIED' || event.status === 'TAMPERED';
                      const statusColor = isSuccess ? 'var(--accent-emerald)' : isDenied ? 'var(--accent-rose)' : 'var(--accent-amber, #f59e0b)';
                      return (
                        <div key={event.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '12px',
                          padding: '10px 12px', borderRadius: '8px',
                          backgroundColor: 'var(--bg-input)',
                          borderLeft: `3px solid ${statusColor}`
                        }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                            backgroundColor: isSuccess ? 'rgba(16,185,129,0.12)' : isDenied ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                            color: statusColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700
                          }}>
                            {(event.username || '?')[0].toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '0.85rem' }}>{event.username}</strong>
                                <span style={{
                                  padding: '1px 7px', borderRadius: '4px', fontSize: '0.72rem',
                                  fontFamily: 'monospace', backgroundColor: 'var(--bg-card)',
                                  color: statusColor, border: `1px solid ${statusColor}40`
                                }}>
                                  {event.action}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                  on <em>{event.filename}</em>
                                </span>
                              </div>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                                {new Date(event.timestamp).toLocaleString()}
                              </span>
                            </div>
                            {event.details && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px', wordBreak: 'break-word' }}>
                                {event.details}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Per-File Activity Drilldown */}
              {files.length > 0 && (
                <div className="card">
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} style={{ color: 'var(--accent-purple)' }} /> File Access Drilldown
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {files.map((file) => {
                      const fileEvents = activityData.activity.filter(a => a.file_id === file.id);
                      const isExpanded = expandedFile === file.id;
                      return (
                        <div key={file.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                          <button
                            onClick={() => setExpandedFile(isExpanded ? null : file.id)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '10px 14px',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              backgroundColor: isExpanded ? 'rgba(59,130,246,0.08)' : 'var(--bg-input)',
                              color: 'var(--text-main)', cursor: 'pointer', gap: '10px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <FileText size={14} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                              <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{file.original_filename}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>by {file.uploader_username}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                              <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>{fileEvents.length} events</span>
                              <span style={{ color: 'var(--accent-blue)', fontSize: '0.8rem' }}>{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                              {fileEvents.length === 0 ? (
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                                  No events recorded for this file yet.
                                </p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {fileEvents.slice(0, 15).map((ev) => (
                                    <div key={ev.id} style={{
                                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                      padding: '6px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-input)',
                                      fontSize: '0.8rem', gap: '8px', flexWrap: 'wrap'
                                    }}>
                                      <span>
                                        <strong>{ev.username}</strong>
                                        {' · '}
                                        <span style={{
                                          fontFamily: 'monospace', fontSize: '0.72rem',
                                          color: ev.status === 'SUCCESS' ? 'var(--accent-emerald)' : 'var(--accent-rose)'
                                        }}>{ev.action}</span>
                                      </span>
                                      <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', flexShrink: 0 }}>
                                        {new Date(ev.timestamp).toLocaleString()}
                                      </span>
                                    </div>
                                  ))}
                                  {fileEvents.length > 15 && (
                                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                                      +{fileEvents.length - 15} more events in full log
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {!activityLoading && !activityData && (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              <Activity size={36} style={{ opacity: 0.4, margin: '0 auto 12px', display: 'block' }} />
              <p style={{ marginBottom: '12px' }}>Click below to load this organization's activity data.</p>
              <button className="btn-primary" onClick={loadActivity}>Load Activity</button>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODALS & CONFIRMATION DIALOGS
      ───────────────────────────────────────────────────────────── */}

      {/* ── Modal: Delete Organization Confirmation ── */}
      {showDeleteOrgModal && (
        <div className="modal-overlay" onClick={() => !working && setShowDeleteOrgModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trash2 size={20} style={{ color: 'var(--accent-rose)' }} />
                <h3 className="modal-title" style={{ color: 'var(--accent-rose)' }}>Delete Organization</h3>
              </div>
              <button onClick={() => setShowDeleteOrgModal(false)} className="btn-secondary btn-sm" disabled={working}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '12px' }}>
              Are you sure you want to delete <strong>"{selectedOrganization.name}"</strong>?
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              This will remove all memberships and organization workspace associations. Unrelated personal files in the vault will not be affected.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowDeleteOrgModal(false)} className="btn-secondary" disabled={working}>
                Cancel
              </button>
              <button onClick={handleDeleteOrganization} className="btn-danger" disabled={working}>
                {working ? 'Deleting...' : 'Yes, Delete Organization'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Delete File Confirmation ── */}
      {fileToDelete && (
        <div className="modal-overlay" onClick={() => !working && setFileToDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trash2 size={20} style={{ color: 'var(--accent-rose)' }} />
                <h3 className="modal-title" style={{ color: 'var(--accent-rose)' }}>Delete Shared File</h3>
              </div>
              <button onClick={() => setFileToDelete(null)} className="btn-secondary btn-sm" disabled={working}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '12px' }}>
              Are you sure you want to delete <strong>"{fileToDelete.original_filename}"</strong>?
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              This will permanently delete the encrypted file blob from storage and revoke all organization member decryption keys.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setFileToDelete(null)} className="btn-secondary" disabled={working}>
                Cancel
              </button>
              <button onClick={handleConfirmDeleteFile} className="btn-danger" disabled={working}>
                {working ? 'Deleting...' : 'Yes, Delete File'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Remove Member Confirmation ── */}
      {memberToRemove && (
        <div className="modal-overlay" onClick={() => !working && setMemberToRemove(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Trash2 size={20} style={{ color: 'var(--accent-rose)' }} />
                <h3 className="modal-title">Remove Member</h3>
              </div>
              <button onClick={() => setMemberToRemove(null)} className="btn-secondary btn-sm" disabled={working}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '12px' }}>
              Remove <strong>"{memberToRemove.username}"</strong> from <strong>"{selectedOrganization.name}"</strong>?
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.5 }}>
              Their active access to all files shared through this organization will be instantly revoked.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setMemberToRemove(null)} className="btn-secondary" disabled={working}>
                Cancel
              </button>
              <button onClick={handleConfirmRemoveMember} className="btn-danger" disabled={working}>
                {working ? 'Removing...' : 'Yes, Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Share File with Member ── */}
      {sharingFile && (
        <ShareModal
          file={sharingFile}
          onClose={() => setSharingFile(null)}
          onSuccess={loadOrganizationDetails}
        />
      )}

      {/* ── Modal: Secure In-Browser Watermarked Viewer ── */}
      {viewingFile && (
        <SecureViewerModal
          file={viewingFile}
          onClose={() => setViewingFile(null)}
          onAccessConsumed={loadOrganizationDetails}
          onManageKeys={() => { setViewingFile(null); setActiveTab?.('keys'); }}
        />
      )}
    </div>
  );
}
