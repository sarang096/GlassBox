'use client';

import { useState } from 'react';
import api from '@/lib/api';

export default function JoinGroupModal({ onClose, onJoined }) {
  const [step, setStep] = useState('code'); // 'code' or 'fields'
  const [code, setCode] = useState('');
  const [group, setGroup] = useState(null);
  const [profileValues, setProfileValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLookup(e) {
    e.preventDefault();
    if (!code.trim()) { setError('Enter a workspace code'); return; }

    setLoading(true);
    setError('');
    try {
      const g = await api.lookupGroup(code.trim());
      setGroup(g);
      if (g.fields && g.fields.length > 0) {
        setStep('fields');
      } else {
        // No fields, join directly
        await doJoin([]);
      }
    } catch (err) {
      setError(err.message || 'Workspace not found');
    } finally {
      setLoading(false);
    }
  }

  async function doJoin(values) {
    setLoading(true);
    setError('');
    try {
      const joined = await api.joinGroup(code.trim(), values);
      onJoined(joined);
    } catch (err) {
      setError(err.message || 'Failed to join');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinWithFields(e) {
    e.preventDefault();
    // Validate required fields
    for (const field of group.fields) {
      if (field.required && !profileValues[field.id]?.trim()) {
        setError(`"${field.field_name}" is required`);
        return;
      }
    }
    const values = Object.entries(profileValues).map(([fieldId, value]) => ({
      field_id: parseInt(fieldId),
      value: value,
    }));
    await doJoin(values);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" id="join-group-modal">
        <button className="modal-close" onClick={onClose}>✕</button>

        {step === 'code' ? (
          <>
            <h2>Join a Workspace</h2>
            <p className="modal-subtitle">Enter the invite code shared by the workspace admin</p>

            {error && <div className="auth-alert auth-alert-error">{error}</div>}

            <form onSubmit={handleLookup}>
              <div className="form-group">
                <label className="form-label" htmlFor="group-code">Workspace Code</label>
                <input id="group-code" type="text" className="form-input" placeholder="e.g. AB12CD34"
                  value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} required autoFocus
                  style={{ fontFamily: "'Courier New', monospace", fontSize: '1.2rem', textAlign: 'center', letterSpacing: '4px', fontWeight: 700 }} />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? <span className="spinner"></span> : '🔍 Find Workspace'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Join: {group.name}</h2>
            <p className="modal-subtitle">Fill in the required information to join this workspace</p>

            {error && <div className="auth-alert auth-alert-error">{error}</div>}

            <form onSubmit={handleJoinWithFields}>
              {group.fields.sort((a, b) => a.field_order - b.field_order).map((field) => (
                <div className="form-group" key={field.id}>
                  <label className="form-label">
                    {field.field_name}
                    {field.required && <span style={{ color: 'var(--accent-danger)', marginLeft: 4 }}>*</span>}
                  </label>
                  {field.field_type === 'textarea' ? (
                    <textarea className="form-input" rows={3} placeholder={`Enter ${field.field_name.toLowerCase()}`}
                      value={profileValues[field.id] || ''}
                      onChange={(e) => setProfileValues({ ...profileValues, [field.id]: e.target.value })} />
                  ) : (
                    <input type={field.field_type === 'email' ? 'email' : field.field_type === 'number' ? 'number' : 'text'}
                      className="form-input" placeholder={`Enter ${field.field_name.toLowerCase()}`}
                      value={profileValues[field.id] || ''}
                      onChange={(e) => setProfileValues({ ...profileValues, [field.id]: e.target.value })} />
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setStep('code'); setError(''); }}>
                  ← Back
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading}>
                  {loading ? <span className="spinner"></span> : '🚀 Join Workspace'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
