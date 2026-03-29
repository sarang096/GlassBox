'use client';

import { useState } from 'react';

export default function CreateGroupModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addField() {
    setFields([...fields, { field_name: '', field_type: 'text', required: true, field_order: fields.length }]);
  }

  function updateField(index, key, value) {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    setFields(updated);
  }

  function removeField(index) {
    setFields(fields.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Workspace name is required'); return; }

    // Validate fields
    const validFields = fields.filter(f => f.field_name.trim());

    setLoading(true);
    setError('');
    try {
      const api = (await import('@/lib/api')).default;
      const group = await api.createGroup(name.trim(), description.trim(), validFields);
      onCreated(group);
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" id="create-group-modal" style={{ maxWidth: 540 }}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <h2>Create Workspace</h2>
        <p className="modal-subtitle">Set up your hiring workspace with optional join fields for candidates</p>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="group-name">Workspace Name</label>
            <input id="group-name" type="text" className="form-input" placeholder="e.g. Frontend Developer Test"
              value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="group-desc">Description</label>
            <input id="group-desc" type="text" className="form-input" placeholder="What is this workspace for?"
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Join Fields */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Join Fields (candidates fill these)</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addField} style={{ fontSize: '0.8rem' }}>
                + Add Field
              </button>
            </div>

            {fields.length === 0 && (
              <div style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                No fields yet. Add fields like &quot;Full Name&quot;, &quot;Phone&quot;, &quot;Experience&quot; etc.
              </div>
            )}

            {fields.map((field, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input
                  type="text" className="form-input" placeholder="Field name" style={{ flex: 1 }}
                  value={field.field_name} onChange={(e) => updateField(i, 'field_name', e.target.value)}
                />
                <select className="form-input" style={{ width: 110 }}
                  value={field.field_type} onChange={(e) => updateField(i, 'field_type', e.target.value)}>
                  <option value="text">Text</option>
                  <option value="email">Email</option>
                  <option value="number">Number</option>
                  <option value="textarea">Long Text</option>
                </select>
                <button type="button" onClick={() => removeField(i)}
                  style={{ padding: '8px 12px', background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.2)', borderRadius: 'var(--radius-sm)', color: 'var(--accent-danger)', cursor: 'pointer', fontSize: '0.9rem' }}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="spinner"></span> : '🏢 Create Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
}
