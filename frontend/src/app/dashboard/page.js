'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import CreateGroupModal from '@/components/CreateGroupModal';
import JoinGroupModal from '@/components/JoinGroupModal';
import EditGroupModal from '@/components/EditGroupModal';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadGroups();
    }
  }, [user, authLoading, router]);

  async function loadGroups() {
    try {
      const data = await api.getGroups();
      setGroups(data);
    } catch (err) {
      console.error('Failed to load groups:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleGroupCreated(group) {
    setGroups([group, ...groups]);
    setShowCreate(false);
  }

  function handleGroupJoined(group) {
    setGroups([group, ...groups]);
    setShowJoin(false);
  }

  function handleGroupUpdated(updatedGroup) {
    setGroups(groups.map(g => g.id === updatedGroup.id ? updatedGroup : g));
    setShowEdit(false);
    setEditingGroup(null);
  }

  async function handleDeleteGroup(groupId) {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      return;
    }
    try {
      await api.deleteGroup(groupId);
      setGroups(groups.filter(g => g.id !== groupId));
    } catch (err) {
      alert('Failed to delete group: ' + err.message);
    }
  }

  function copyToClipboard(text, groupId) {
    navigator.clipboard.writeText(text);
    setCopiedCode(groupId);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  if (authLoading || !user) {
    return (
      <>
        <Navbar />
        <div className="page-wrapper">
          <div className="page-loader">
            <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="page-wrapper">
        <div className="container">
          <div className="dashboard" id="dashboard">
            {/* Header */}
            <div className="dashboard-header">
              <div>
                <h1>👋 Hey, {user.username}!</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 4, fontSize: '0.95rem' }}>
                  Manage your groups and collaborations
                </p>
              </div>
              <div className="dashboard-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowJoin(true)}
                  id="join-group-btn"
                >
                  🔗 Join Group
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowCreate(true)}
                  id="create-group-btn"
                >
                  ✦ Create Group
                </button>
              </div>
            </div>

            {/* Groups */}
            {loading ? (
              <div className="page-loader">
                <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }}></div>
              </div>
            ) : groups.length === 0 ? (
              <div className="empty-state" id="empty-state">
                <div className="empty-state-icon">⬡</div>
                <h3>No groups yet</h3>
                <p>Create your first group or join one using a group code</p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    ✦ Create Your First Group
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowJoin(true)}>
                    🔗 Join with Code
                  </button>
                </div>
              </div>
            ) : (
              <div className="groups-grid" id="groups-grid">
                {groups.map((group, index) => (
                  <div
                    key={group.id}
                    className="group-card"
                    style={{ animationDelay: `${index * 0.05}s`, position: 'relative' }}
                    id={`group-card-${group.id}`}
                  >
                    {/* Card Actions */}
                    {group.admin_id === user.id && (
                      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4, zIndex: 2 }}>
                        <button
                          onClick={(e) => { e.preventDefault(); setEditingGroup(group); setShowEdit(true); }}
                          className="btn btn-ghost btn-sm" title="Edit"
                          style={{ padding: '5px 8px', fontSize: '0.9rem' }}
                        >✏️</button>
                        <button
                          onClick={(e) => { e.preventDefault(); handleDeleteGroup(group.id); }}
                          className="btn btn-ghost btn-sm" title="Delete"
                          style={{ padding: '5px 8px', fontSize: '0.9rem', color: 'var(--accent-danger)' }}
                        >🗑️</button>
                      </div>
                    )}

                    <Link
                      href={`/dashboard/group/${group.id}`}
                      style={{ textDecoration: 'none', cursor: 'pointer', display: 'block' }}
                    >
                      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 'var(--radius-md)', flexShrink: 0,
                          background: group.admin_id === user.id ? 'var(--accent-gradient)' : 'linear-gradient(135deg, #00d4ff, #6c63ff)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.3rem', color: 'white'
                        }}>
                          {group.admin_id === user.id ? '⬡' : '◇'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{group.name}</h3>
                            <span className={`group-card-badge ${group.admin_id === user.id ? 'badge-admin' : 'badge-member'}`}>
                              {group.admin_id === user.id ? 'Admin' : 'Member'}
                            </span>
                          </div>
                          {group.description && (
                            <p className="group-card-desc" style={{ marginBottom: 0 }}>{group.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="group-card-footer">
                        <div className="group-card-meta">
                          👥 {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
                        </div>
                        <div
                          className="group-card-code"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyToClipboard(group.group_code, group.id); }}
                          title="Click to copy invite code"
                          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          {copiedCode === group.id ? '✓ Copied!' : group.group_code}
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={handleGroupCreated}
        />
      )}
      {showJoin && (
        <JoinGroupModal
          onClose={() => setShowJoin(false)}
          onJoined={handleGroupJoined}
        />
      )}
      {showEdit && editingGroup && (
        <EditGroupModal
          group={editingGroup}
          onClose={() => {
            setShowEdit(false);
            setEditingGroup(null);
          }}
          onUpdated={handleGroupUpdated}
        />
      )}
    </>
  );
}
