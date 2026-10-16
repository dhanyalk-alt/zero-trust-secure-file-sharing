import React, { useState, useEffect } from 'react';
import { analyticsAPI } from '../api/client';
import {
  BarChart2,
  TrendingUp,
  Download,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Users,
  Activity,
  Shield,
  Clock
} from 'lucide-react';

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [fileDetail, setFileDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await analyticsAPI.getSummary();
      setSummary(res.data);
    } catch (err) {
      console.error('Failed to load analytics summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleSelectFile = async (fileId) => {
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
      setFileDetail(null);
      return;
    }
    setSelectedFileId(fileId);
    setLoadingDetail(true);
    try {
      const res = await analyticsAPI.getFileAnalytics(fileId);
      setFileDetail(res.data);
    } catch (err) {
      console.error('Failed to load file analytics:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const maxEvents = summary?.files?.length
    ? Math.max(...summary.files.map((f) => f.total_events), 1)
    : 1;

  const maxDailyCount = fileDetail?.daily_activity?.length
    ? Math.max(...fileDetail.daily_activity.map((d) => d.count), 1)
    : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BarChart2 size={28} style={{ color: 'var(--accent-blue)' }} />
            <span>File Analytics Dashboard</span>
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Real-time telemetry, access velocity, download frequency, and cryptographic activity auditing.
          </p>
        </div>

        <button onClick={fetchSummary} className="btn-secondary" disabled={loading}>
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)' }}>
            <FileText size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Managed Files</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{summary?.total_files || 0}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-emerald)' }}>
            <Activity size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Security Events</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{summary?.total_events || 0}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
            <Download size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Decryption & Downloads</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{summary?.total_downloads || 0}</div>
          </div>
        </div>
      </div>

      {/* Main Files Analytics Table */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>File Access & Velocity Breakdown</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Click any file to inspect detailed trends</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px', color: 'var(--accent-blue)' }} />
            <p>Aggregating security analytics...</p>
          </div>
        ) : summary?.files?.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <FileText size={36} style={{ color: 'var(--text-dim)', marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>No files to analyze</h3>
            <p style={{ fontSize: '0.88rem', marginTop: '4px' }}>Upload files to start logging cryptographic access telemetry.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '30px' }}></th>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Activity Relative Volume</th>
                  <th>Total Events</th>
                  <th>Downloads</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary?.files?.map((f) => {
                  const isSelected = selectedFileId === f.file_id;
                  const relativePct = Math.round((f.total_events / maxEvents) * 100);

                  return (
                    <React.Fragment key={f.file_id}>
                      <tr
                        style={{ cursor: 'pointer', background: isSelected ? 'rgba(59, 130, 246, 0.05)' : '' }}
                        onClick={() => handleSelectFile(f.file_id)}
                      >
                        <td>
                          {isSelected ? (
                            <ChevronDown size={16} style={{ color: 'var(--accent-blue)' }} />
                          ) : (
                            <ChevronRight size={16} style={{ color: 'var(--text-dim)' }} />
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.filename}</div>
                          <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                            {f.file_id}
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {formatBytes(f.file_size)}
                        </td>
                        <td style={{ minWidth: '160px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.max(relativePct, 4)}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, var(--accent-blue), var(--accent-cyan))',
                                  borderRadius: '3px'
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', width: '32px' }}>{relativePct}%</span>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-info">{f.total_events} events</span>
                        </td>
                        <td>
                          <span className="badge badge-success">{f.download_count} dl</span>
                        </td>
                        <td>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectFile(f.file_id);
                            }}
                            className="btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                          >
                            {isSelected ? 'Collapse' : 'Inspect'}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Drilldown Panel */}
                      {isSelected && (
                        <tr>
                          <td colSpan="7" style={{ padding: '20px 24px', background: 'rgba(0, 0, 0, 0.2)' }}>
                            {loadingDetail ? (
                              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                                <RefreshCw size={20} className="spin" style={{ marginBottom: '8px', color: 'var(--accent-blue)' }} />
                                <div>Loading file telemetry...</div>
                              </div>
                            ) : fileDetail ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                                    Detailed Audit & Access Telemetry: {fileDetail.filename}
                                  </div>
                                  <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                    Past 14 Days Telemetry Window
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                                  {/* Daily Activity Chart (CSS Bar Chart) */}
                                  <div className="card" style={{ padding: '16px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <TrendingUp size={16} style={{ color: 'var(--accent-emerald)' }} />
                                      <span>Daily Access Activity (Last 14 Days)</span>
                                    </div>
                                    {fileDetail.daily_activity?.length === 0 ? (
                                      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', textAlign: 'center', padding: '24px 0' }}>
                                        No activity logged in the past 14 days.
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '140px', paddingTop: '20px' }}>
                                        {fileDetail.daily_activity.map((d) => {
                                          const heightPct = Math.round((d.count / maxDailyCount) * 100);
                                          return (
                                            <div
                                              key={d.date}
                                              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '6px' }}
                                              title={`${d.date}: ${d.count} events`}
                                            >
                                              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{d.count}</span>
                                              <div
                                                style={{
                                                  width: '100%',
                                                  maxwidth: '28px',
                                                  height: `${Math.max(heightPct, 8)}%`,
                                                  background: 'linear-gradient(180deg, var(--accent-blue), rgba(59, 130, 246, 0.4))',
                                                  borderRadius: '4px 4px 0 0'
                                                }}
                                              />
                                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {d.date.slice(5)}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {/* By Action Breakdown */}
                                  <div className="card" style={{ padding: '16px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <Activity size={16} style={{ color: 'var(--accent-purple)' }} />
                                      <span>Operations by Action Type</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                      {fileDetail.by_action?.map((a) => (
                                        <div key={a.action} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                                          <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{a.action}</span>
                                          <span className="badge badge-info">{a.count}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  {/* Top Accessors */}
                                  <div className="card" style={{ padding: '16px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <Users size={16} style={{ color: 'var(--accent-cyan)' }} />
                                      <span>Top Accessors</span>
                                    </div>
                                    {fileDetail.top_accessors?.length === 0 ? (
                                      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', textAlign: 'center', padding: '16px 0' }}>
                                        No accessors recorded yet.
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {fileDetail.top_accessors.map((acc, idx) => (
                                          <div
                                            key={acc.username || idx}
                                            style={{
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              padding: '6px 10px',
                                              background: 'rgba(255, 255, 255, 0.03)',
                                              borderRadius: '6px'
                                            }}
                                          >
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{acc.username}</span>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{acc.count} operations</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
