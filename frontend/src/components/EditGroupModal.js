'use client';

import { useState } from 'react';

export default function EditGroupModal({ group, onClose, onUpdated }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('grouphub_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/groups/${group.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          fields: [], // Keep existing fields
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to update group');
      }

      const updated = await response.json();
      setSuccess('Group updated successfully!');
      setTimeout(() => {
        onUpdated(updated);
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to update group');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" id="edit-group-modal" style={{ maxWidth: 480 }}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <h2>Edit Group</h2>
        <p className="modal-subtitle">Update your group information</p>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        {success && <div className="auth-alert" style={{ background: 'rgba(76, 175, 80, 0.1)', color: 'var(--success-color)', borderColor: 'var(--success-color)' }}>{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="group-name">Group Name</label>
            <input
              id="group-name"
              type="text"
              className="form-input"
              placeholder="e.g. Frontend Developer Test"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="group-desc">Description</label>
            <textarea
              id="group-desc"
              className="form-input"
              placeholder="Describe what this group is for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows="4"
            />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner"></span> : '✓ Save Changes'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <p>💡 <strong>Note:</strong> Group code and members cannot be changed. To change membership, members must join with the group code.</p>
        </div>
      </div>
    </div>
  );
}
