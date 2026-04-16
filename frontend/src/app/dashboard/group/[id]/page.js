'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';
import TutorChat from '@/components/TutorChat';
import Link from 'next/link';

// ─── Constants ───
const FILE_ICONS = {
  python: '🐍', javascript: '📜', js: '📜', typescript: '🔷', ts: '🔷',
  json: '📋', html: '🌐', css: '🎨', java: '☕', cpp: '⚙️', c: '⚙️',
  go: '🔵', rust: '🦀', ruby: '💎', php: '🐘', sql: '🗃️',
  markdown: '📝', md: '📝', text: '📄', txt: '📄', xml: '📰', yaml: '⚙️', yml: '⚙️',
  csv: '📊',
};
const LANG_OPTIONS = [
  ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['java', 'Java'], ['cpp', 'C++'], ['c', 'C'], ['go', 'Go'], ['rust', 'Rust'],
  ['html', 'HTML'], ['css', 'CSS'], ['json', 'JSON'], ['sql', 'SQL'],
  ['markdown', 'Markdown'], ['text', 'Plain Text'], ['csv', 'CSV File'],
];

function getLangOptionsForCategory(category) {
  switch (category) {
    case 'frontend':
      return LANG_OPTIONS.filter(l => ['html', 'css', 'javascript', 'typescript', 'json', 'markdown', 'text'].includes(l[0]));
    case 'backend':
      return LANG_OPTIONS.filter(l => ['python', 'java', 'cpp', 'c', 'go', 'rust', 'sql', 'json', 'markdown', 'text'].includes(l[0]));
    case 'db':
      return LANG_OPTIONS.filter(l => ['csv'].includes(l[0]));
    case 'testcases':
      return LANG_OPTIONS;
    default:
      return LANG_OPTIONS;
  }
}
function getFileIcon(lang) { return FILE_ICONS[lang?.toLowerCase()] || '📄'; }
function getBasename(path) { return path.split('/').pop(); }
function getDirname(path) { const parts = path.split('/'); parts.pop(); return parts.join('/'); }

// ─── Build folder tree from flat file list ───
function buildTree(files) {
  const root = { name: '', children: {}, files: [] };
  files.forEach(file => {
    const parts = file.filename.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children[parts[i]]) {
        node.children[parts[i]] = { name: parts[i], children: {}, files: [] };
      }
      node = node.children[parts[i]];
    }
    node.files.push(file);
  });
  return root;
}

// ─── AddFileModal ───
function AddFileModal({ onClose, onCreated, groupId, isAdmin }) {
  const [filename, setFilename] = useState('');
  const [language, setLanguage] = useState('python');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('backend');
  const [isHidden, setIsHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!filename.trim()) { setError('Filename is required'); return; }
    setLoading(true); setError('');
    try {
      const finalPath = `${category}/${filename.trim().replace(/^\/+/, '')}`;
      const file = await api.createFile(groupId, finalPath, language, content, isHidden);
      onCreated(file);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const availableLangs = getLangOptionsForCategory(category);
  useEffect(() => {
    if (!availableLangs.find(l => l[0] === language)) {
      setLanguage(availableLangs[0][0]);
    }
  }, [category, language, availableLangs]);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal new-file-modal" id="add-file-modal">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2>New File</h2>
        <p className="modal-subtitle">Create a file in this workspace</p>
        {error && <div className="auth-alert auth-alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div className="form-group" style={{ width: 150, marginBottom: 0 }}>
              <label className="form-label">Category</label>
              <select className="form-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="frontend">Frontend</option>
                <option value="backend">Backend</option>
                <option value="db">DB (Read Only)</option>
                <option value="testcases">Test Cases</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label className="form-label">File name</label>
              <input type="text" className="form-input" placeholder="main.py"
                value={filename} onChange={(e) => setFilename(e.target.value)} required autoFocus />
            </div>
            <div className="form-group" style={{ width: 140, marginBottom: 0 }}>
              <label className="form-label">Language</label>
              <select className="form-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {availableLangs.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Initial content</label>
            <textarea className="form-input" rows={8} placeholder="// Write template code..."
              value={content} onChange={(e) => setContent(e.target.value)}
              style={{ fontFamily: "'Courier New', monospace", fontSize: '0.82rem', lineHeight: 1.6 }} />
          </div>
          {isAdmin && (
            <label className="hidden-toggle" style={{ marginBottom: 20 }}>
              <input type="checkbox" checked={isHidden} onChange={(e) => setIsHidden(e.target.checked)} />
              <div className="hidden-toggle-label">
                <strong>🔒 Hidden file</strong>
                <span>Only visible to you (admin). Clients will not see this file.</span>
              </div>
            </label>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="spinner"></span> : '📁 Create File'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── AI Mode Constants ───
const N8N_WEBHOOK_BASE = 'http://localhost:5678/webhook/ai-path';
function getN8nWebhookUrl(groupId) {
  return `${N8N_WEBHOOK_BASE}`;
}

const AI_BACKEND_LANGS = [
  ['python', 'Python'],
  ['java', 'Java'],
  ['c', 'C'],
];
const AI_FRONTEND_LANGS = [
  ['react', 'React'],
  ['nextjs', 'Next.js'],
];
const AI_DB_STYLES = [
  ['csv', 'CSV File'],
];

// Detect language from file extension
function detectLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const extMap = {
    py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    java: 'java', c: 'c', cpp: 'cpp', h: 'c', go: 'go', rs: 'rust', rb: 'ruby',
    html: 'html', css: 'css', json: 'json', sql: 'sql', csv: 'csv',
    md: 'markdown', txt: 'text', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  };
  return extMap[ext] || 'text';
}

// ─── AiModeModal ───
function AiModeModal({ onClose, onFilesGenerated, groupId, groupCode }) {
  const [description, setDescription] = useState('');
  const [frontendLang, setFrontendLang] = useState('react');
  const [backendLang, setBackendLang] = useState('python');
  const [dbStyle, setDbStyle] = useState('csv');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [step, setStep] = useState('form'); // 'form' | 'generating' | 'creating' | 'done'

  async function handleGenerate(e) {
    e.preventDefault();
    if (!description.trim()) { setError('Please describe your codebase'); return; }
    setLoading(true);
    setError('');
    setStep('generating');
    setProgress('Sending request to AI...');

    try {
      const payload = {
        group_id: groupId,
        group_code: groupCode,
        description: description.trim(),
        frontend_language: frontendLang,
        backend_language: backendLang,
        db_style: dbStyle,
      };

      const response = await fetch(getN8nWebhookUrl(groupId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }

      let data = await response.json();

      // If N8N already pushed directly to the backend (/ai-import), skip manual creation
      if (data && data.success && data.backend_response && data.backend_response.files) {
        setGeneratedFiles(data.files_generated || []);
        setStep('done');
        setProgress(`✓ Successfully generated and imported ${data.backend_response.files_created} files!`);

        // n8n stores the codebase in Supabase directly — no extra call needed
        onFilesGenerated(data.backend_response.files);
        return;
      }

      // Handle wrapped response (legacy mode): { files: [...] }
      if (data && !Array.isArray(data) && data.files) {
        data = data.files;
      }
      if (!Array.isArray(data)) {
        throw new Error('Invalid response from AI service. Expected an array of files.');
      }

      setGeneratedFiles(data);
      setStep('creating');
      setProgress(`Creating ${data.length} files...`);

      // Create files one by one using N8N response format:
      // { category, fileName, code, permission, visibility }
      const createdFiles = [];
      for (let i = 0; i < data.length; i++) {
        const item = data[i];

        // Map N8N fields (with fallbacks for old format)
        const category = (item.category || item.type || 'backend').toLowerCase();
        const fileName = item.fileName || item.filename || `file_${i}`;
        const filePath = `${category}/${fileName}`;
        const language = detectLanguage(fileName);
        const content = item.code || item.content || '';

        // Permission: "read" → readonly, "read-write" → editable. DB is always readonly.
        const isReadonly = category === 'db' || item.permission === 'read';

        // Visibility: "hidden" → hidden. Test files are always hidden.
        const isHidden = category === 'test' || category === 'testing' || item.visibility === 'hidden';

        setProgress(`Creating file ${i + 1}/${data.length}: ${filePath}`);

        try {
          const created = await api.createFile(groupId, filePath, language, content, isHidden, isReadonly);
          createdFiles.push(created);
        } catch (err) {
          console.error(`Failed to create ${filePath}:`, err);
        }
      }

      setStep('done');
      setProgress(`✓ Successfully created ${createdFiles.length} files!`);

      // n8n stores the codebase in Supabase directly — no extra call needed
      console.log('[AI Mode] Files created:', createdFiles.length, '— codebase stored by n8n');
      onFilesGenerated(createdFiles);
    } catch (err) {
      setError(err.message);
      setStep('form');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !loading && onClose()}>
      <div className="modal ai-mode-modal" id="ai-mode-modal">
        {!loading && <button className="modal-close" onClick={onClose}>✕</button>}

        <div className="ai-modal-header">
          <div className="ai-modal-icon">✦</div>
          <h2>AI Workspace Generator</h2>
          <p className="modal-subtitle">Describe your project and AI will scaffold the entire codebase</p>
        </div>

        {error && <div className="auth-alert auth-alert-error">{error}</div>}

        {step === 'form' && (
          <form onSubmit={handleGenerate}>
            <div className="form-group">
              <label className="form-label">Codebase Description</label>
              <textarea
                className="form-input"
                rows={4}
                placeholder="e.g. A student management system with CRUD operations, authentication, and a dashboard..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                autoFocus
                style={{ resize: 'vertical' }}
              />
            </div>

            <div className="ai-options-grid">
              <div className="form-group">
                <label className="form-label">Backend Language</label>
                <select className="form-input" value={backendLang} onChange={(e) => setBackendLang(e.target.value)}>
                  {AI_BACKEND_LANGS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Frontend Framework</label>
                <select className="form-input" value={frontendLang} onChange={(e) => setFrontendLang(e.target.value)}>
                  {AI_FRONTEND_LANGS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Database Style</label>
                <select className="form-input" value={dbStyle} onChange={(e) => setDbStyle(e.target.value)}>
                  {AI_DB_STYLES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </div>
            </div>

            <div className="ai-info-box">
              <div className="ai-info-row"><span className="ai-info-dot green"></span> Frontend & Backend files → editable by clients</div>
              <div className="ai-info-row"><span className="ai-info-dot amber"></span> DB files → read-only for clients</div>
              <div className="ai-info-row"><span className="ai-info-dot red"></span> Test cases → hidden from clients (admin only)</div>
            </div>

            <button type="submit" className="btn btn-primary ai-generate-btn" disabled={loading}>
              ✦ Generate Workspace
            </button>
          </form>
        )}

        {(step === 'generating' || step === 'creating') && (
          <div className="ai-progress-section">
            <div className="ai-progress-spinner">
              <div className="spinner" style={{ width: 48, height: 48, borderWidth: 3 }}></div>
            </div>
            <div className="ai-progress-text">{progress}</div>
            <div className="ai-progress-bar-track">
              <div className="ai-progress-bar-fill" style={{
                width: step === 'generating' ? '40%' : '80%',
                transition: 'width 1s ease'
              }}></div>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="ai-done-section">
            <div className="ai-done-icon">✓</div>
            <h3>{progress}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              All files have been created and organized into their categories.
            </p>
            <div className="ai-done-summary">
              {generatedFiles.map((f, i) => {
                const type = (f.type || 'backend').toLowerCase();
                return (
                  <div key={i} className={`ai-done-file ${type}`}>
                    <span className="ai-done-file-type">{type}</span>
                    <span className="ai-done-file-name">{f.filename}</span>
                    {type === 'testing' && <span className="ai-done-tag hidden-tag">hidden</span>}
                    {type === 'db' && <span className="ai-done-tag readonly-tag">read-only</span>}
                    {f.hidden && type !== 'testing' && <span className="ai-done-tag hidden-tag">hidden</span>}
                  </div>
                );
              })}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={onClose}>
              Done — Open Workspace
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FolderTree recursive renderer ───
function FolderTree({ node, depth = 0, selectedFileId, onSelectFile, onDeleteFile, isAdmin, collapsedFolders, toggleFolder, parentPath = '' }) {
  const folders = Object.keys(node.children).sort();
  const ownFiles = [...node.files].sort((a, b) => getBasename(a.filename).localeCompare(getBasename(b.filename)));

  return (
    <>
      {folders.map(folderName => {
        const fullPath = parentPath ? `${parentPath}/${folderName}` : folderName;
        const isOpen = !collapsedFolders.has(fullPath);
        return (
          <div key={fullPath}>
            <div className="ide-tree-item folder"
              style={{ paddingLeft: 8 + depth * 16 }}
              onClick={() => toggleFolder(fullPath)}>
              <span className={`ide-tree-chevron ${isOpen ? 'open' : ''}`}>▶</span>
              <span className="ide-tree-icon">📁</span>
              <span className="ide-tree-label">{folderName}</span>
            </div>
            {isOpen && (
              <FolderTree node={node.children[folderName]} depth={depth + 1}
                selectedFileId={selectedFileId} onSelectFile={onSelectFile}
                onDeleteFile={onDeleteFile} isAdmin={isAdmin}
                collapsedFolders={collapsedFolders} toggleFolder={toggleFolder}
                parentPath={fullPath} />
            )}
          </div>
        );
      })}
      {ownFiles.map(file => (
        <div key={file.id}
          className={`ide-tree-item ${selectedFileId === file.id ? 'active' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => onSelectFile(file)}>
          <span className="ide-tree-chevron" style={{ visibility: 'hidden' }}>▶</span>
          <span className="ide-tree-icon">{getFileIcon(file.language)}</span>
          <span className="ide-tree-label">
            {getBasename(file.filename)}
            {file.is_hidden && <span style={{ fontSize: '0.8em', paddingLeft: 6, opacity: 0.6 }} title="Hidden / Protected File">🔒</span>}
          </span>
          {isAdmin && (
            <span className="ide-tree-actions">
              <button onClick={(e) => { e.stopPropagation(); onDeleteFile(file.id); }} title="Delete">🗑</button>
            </span>
          )}
        </div>
      ))}
    </>
  );
}

// ─── Main Page ───
export default function GroupDetailPage({ params }) {
  const { id } = use(params);
  const groupId = parseInt(id);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // IDE state
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [openTabs, setOpenTabs] = useState([]);
  const [editorContent, setEditorContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved');
  const [showAddFile, setShowAddFile] = useState(false);
  const [showAiMode, setShowAiMode] = useState(false);
  const [activePanel, setActivePanel] = useState('explorer');
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());

  // Admin: member viewing
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [viewMode, setViewMode] = useState('template'); // 'template' | 'member'
  const [memberVersion, setMemberVersion] = useState(null);
  const [copied, setCopied] = useState(false);
  const [clientScores, setClientScores] = useState({});

  // Hidden files
  const [showHidden, setShowHidden] = useState(true);

  // Test execution
  const [testRunning, setTestRunning] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState('full');

  // AI Tutor chat panel
  const [showTutorChat, setShowTutorChat] = useState(false);

  const editorRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const saveTimerRef = useRef(null);
  const terminalRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) { router.push('/login'); return; }
    if (user && id) { loadData(); }
  }, [user, authLoading, id]);

  async function loadData() {
    try {
      const [groupData, filesData] = await Promise.all([
        api.getGroup(groupId), api.getFiles(groupId),
      ]);
      setGroup(groupData);
      setFiles(filesData);
      if (filesData.length > 0 && !selectedFileId) {
        const firstVisible = filesData.find(f => !f.is_hidden) || filesData[0];
        openFile(firstVisible, groupData);
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const isAdmin = group?.admin_id === user?.id;
  const members = group?.members?.filter(m => m.role !== 'admin') || [];
  const selectedFile = files.find(f => f.id === selectedFileId);
  const selectedMember = members.find(m => m.id === selectedMemberId);

  const visibleTree = buildTree(files); // unified tree
  const lineCount = editorContent.split('\n').length;
  const isDbFile = selectedFile?.filename?.startsWith('db/');
  const canEdit = (isAdmin && viewMode === 'template') || (!isAdmin && !isDbFile && !selectedFile?.is_readonly && !selectedFile?.is_hidden);
  const visibleFiles = files.filter(f => !f.is_hidden);

  function toggleFolder(path) {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  function openFile(file, groupOverride) {
    const g = groupOverride || group;
    setSelectedFileId(file.id);
    setSaveStatus('saved');
    setMemberVersion(null);
    setSelectedMemberId(null);
    setViewMode('template');

    // Add to open tabs if not there
    setOpenTabs(prev => {
      if (prev.find(t => t.id === file.id)) return prev;
      return [...prev, { id: file.id, filename: file.filename, language: file.language, is_hidden: file.is_hidden }];
    });

    if (g?.admin_id === user?.id) {
      setEditorContent(file.content);
    } else {
      api.getMyVersion(groupId, file.id)
        .then(v => setEditorContent(v.content))
        .catch(() => setEditorContent(file.content));
    }
  }

  function closeTab(fileId, e) {
    if (e) e.stopPropagation();
    setOpenTabs(prev => {
      const next = prev.filter(t => t.id !== fileId);
      if (selectedFileId === fileId) {
        if (next.length > 0) {
          const fallback = files.find(f => f.id === next[next.length - 1].id);
          if (fallback) openFile(fallback);
        } else {
          setSelectedFileId(null);
          setEditorContent('');
        }
      }
      return next;
    });
  }

  async function selectMember(member) {
    setSelectedMemberId(member.id);
    setViewMode('client_overview');
    setSelectedFileId(null);
    setMemberVersion(null);
    setEditorContent('');

    // Fetch scores from n8n through our API proxy — use group_code as the stable unique key
    if (!clientScores[member.id]) {
      try {
        const res = await fetch(`/api/scores?group_id=${encodeURIComponent(group.group_code)}&candidate_name=${encodeURIComponent(member.username)}`);
        const data = await res.json();
        setClientScores(prev => ({ ...prev, [member.id]: data }));
      } catch (err) {
        console.error("Failed to fetch scores:", err);
        setClientScores(prev => ({ ...prev, [member.id]: { found: false, error: err.message } }));
      }
    }
  }

  async function openMemberFile(member, file) {
    setSelectedMemberId(member.id);
    setSelectedFileId(file.id);
    setViewMode('member');

    setOpenTabs(prev => {
      if (prev.find(t => t.id === file.id)) return prev;
      return [...prev, { id: file.id, filename: file.filename, language: file.language, is_hidden: file.is_hidden }];
    });

    try {
      const version = await api.getMemberVersion(groupId, file.id, member.id);
      setMemberVersion(version);
      setEditorContent(version.content);
    } catch {
      setMemberVersion(null);
      setEditorContent(file?.content || '// No version yet');
    }
  }

  function switchToTemplate() {
    setViewMode('template');
    setSelectedMemberId(null);
    setMemberVersion(null);
    const file = files.find(f => f.id === selectedFileId);
    if (file) setEditorContent(file.content);
  }

  const handleEditorChange = useCallback((newContent) => {
    setEditorContent(newContent);
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        if (isAdmin && viewMode === 'template') {
          await api.updateFile(groupId, selectedFileId, { content: newContent });
          setFiles(prev => prev.map(f => f.id === selectedFileId ? { ...f, content: newContent } : f));
        } else if (!isAdmin) {
          await api.updateMyVersion(groupId, selectedFileId, newContent);
        }
        setSaveStatus('saved');
      } catch { setSaveStatus('unsaved'); }
    }, 1000);
  }, [groupId, selectedFileId, isAdmin, viewMode]);

  function handleEditorScroll() {
    if (lineNumbersRef.current && editorRef.current) {
      lineNumbersRef.current.scrollTop = editorRef.current.scrollTop;
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const nc = editorContent.substring(0, start) + '  ' + editorContent.substring(end);
      setEditorContent(nc);
      handleEditorChange(nc);
      setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = start + 2; }, 0);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('saving');
      (async () => {
        try {
          if (isAdmin && viewMode === 'template') {
            await api.updateFile(groupId, selectedFileId, { content: editorContent });
            setFiles(prev => prev.map(f => f.id === selectedFileId ? { ...f, content: editorContent } : f));
          } else if (!isAdmin) {
            await api.updateMyVersion(groupId, selectedFileId, editorContent);
          }
          setSaveStatus('saved');
        } catch { setSaveStatus('unsaved'); }
      })();
    }
  }

  async function deleteFile(fileId) {
    if (!confirm('Delete this file? All member versions will be lost.')) return;
    try {
      await api.deleteFile(groupId, fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      closeTab(fileId);
    } catch (err) { alert(err.message); }
  }

  function handleFileCreated(file) {
    setFiles(prev => [...prev, file]);
    setShowAddFile(false);
    openFile(file);
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(group.group_code); } catch { }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyFileTree() {
    let text = `${group.name} Workspace:\n\n`;
    const sorted = [...files].sort((a, b) => a.filename.localeCompare(b.filename));
    sorted.forEach(f => {
      text += `- ${f.filename}${f.is_hidden ? ' (hidden)' : ''}\n`;
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { }
  }

  async function runTests() {
    if (testRunning) return;
    setTestRunning(true);
    setShowTerminal(true);
    setTestResults(null);
    setActiveTerminalTab('full');
    try {
      const res = await api.runTests(groupId);
      setTestResults(res.results);
    } catch (err) {
      setTestResults({
        full_output: `❌ Error: ${err.message}`,
        duration: 0,
        backend_tests: { output: err.message, status: 'error', duration: 0 },
        frontend_tests: { output: '', status: 'skipped', duration: 0 },
      });
    } finally {
      setTestRunning(false);
    }
  }

  // ─── Loading / Error states ───
  if (authLoading || loading) {
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

  if (error || !group) {
    return (
      <>
        <Navbar />
        <div className="page-wrapper">
          <div className="container">
            <div className="empty-state">
              <div className="empty-state-icon">⚠️</div>
              <h3>{error || 'Group not found'}</h3>
              <Link href="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── Breadcrumb ───
  const breadcrumbParts = selectedFile ? selectedFile.filename.split('/') : [];

  // ─── Render IDE ───
  return (
    <>
      <Navbar />
      <div className="page-wrapper" style={{ paddingTop: 90 }}>
        {/* Workspace header */}
        <div className="workspace-header" style={{ padding: '8px 16px' }}>
          <div className="workspace-header-left">
            <Link href="/dashboard" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: '0.82rem' }}>← Back</Link>
            <h1 style={{ fontSize: '1.2rem' }}>{group.name}</h1>
            <span className={`group-card-badge ${isAdmin ? 'badge-admin' : 'badge-member'}`}>
              {isAdmin ? 'Admin' : 'Member'}
            </span>
          </div>
          <div className="workspace-header-right">
            {isAdmin && (
              <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copyCode} style={{ fontSize: '0.78rem' }}>
                {copied ? '✓ Copied' : `📋 ${group.group_code}`}
              </button>
            )}
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              👥 {group.members?.length || 0} members
            </span>
          </div>
        </div>

        {/* IDE Layout */}
        <div className="ide-layout" id="ide-layout" style={{ height: 'calc(100vh - 160px)', margin: '0 20px 20px' }}>
          {/* Activity Bar */}
          <div className="ide-activity-bar">
            <button className={`ide-activity-btn ${activePanel === 'explorer' ? 'active' : ''}`}
              onClick={() => setActivePanel('explorer')} title="Explorer">📁</button>
            {isAdmin && (
              <>
                <button className={`ide-activity-btn ${activePanel === 'members' ? 'active' : ''}`}
                  onClick={() => setActivePanel('members')} title="Members">
                  👥
                  {members.length > 0 && <span className="activity-badge">{members.length}</span>}
                </button>
              </>
            )}
            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!isAdmin && (
                <button
                  className={`ide-activity-btn ${showTutorChat ? 'active' : ''}`}
                  onClick={() => setShowTutorChat(prev => !prev)}
                  title="AI Socratic Tutor"
                  style={{
                    background: showTutorChat ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.25), rgba(0, 212, 255, 0.25))' : undefined,
                    borderLeftColor: showTutorChat ? '#6c63ff' : undefined,
                  }}
                >
                  🤖
                </button>
              )}
              {isAdmin && (
                <button className={`ide-activity-btn ${activePanel === 'scores' ? 'active' : ''}`}
                  onClick={() => setActivePanel('scores')} title="Candidate Scores">
                  📊
                </button>
              )}
              {isAdmin && (
                <button className="ide-activity-btn ai-mode-activity-btn"
                  onClick={() => setShowAiMode(true)} title="AI Mode">
                  ✦
                </button>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="ide-sidebar-v2">
            {activePanel === 'explorer' && (
              <>
                <div className="ide-panel-title">
                  <span>Explorer</span>
                  <div className="ide-panel-title-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={copyFileTree} title="Copy File Tree" style={{ fontSize: '0.8rem', padding: '0 6px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      📋 Tree
                    </button>
                    {isAdmin && (
                      <button onClick={() => setShowAddFile(true)} title="New File" id="add-file-btn">＋</button>
                    )}
                  </div>
                </div>
                <div className="ide-tree">
                  {files.length === 0 ? (
                    <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
                      {isAdmin ? 'No files yet. Click + to add.' : 'No files shared yet.'}
                    </div>
                  ) : (
                    <FolderTree node={visibleTree} selectedFileId={selectedFileId}
                      onSelectFile={openFile} onDeleteFile={deleteFile}
                      isAdmin={isAdmin} collapsedFolders={collapsedFolders}
                      toggleFolder={toggleFolder} />
                  )}
                </div>

                {/* Inline members list for admin (compact) */}
                {isAdmin && members.length > 0 && (
                  <div className="ide-members-section">
                    <div className="ide-panel-title">
                      <span>👥 Clients ({members.length})</span>
                    </div>
                    <div className="ide-members-list">
                      {members.map(member => (
                        <div key={member.id}
                          className={`ide-member-row ${selectedMemberId === member.id ? 'active' : ''}`}
                          onClick={() => selectMember(member)}>
                          <div className="ide-member-dot">{member.username.charAt(0).toUpperCase()}</div>
                          <div className="ide-member-detail">
                            <div className="ide-member-username">{member.username}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {activePanel === 'members' && isAdmin && (
              <>
                <div className="ide-panel-title">
                  <span>Clients</span>
                </div>
                <div className="ide-members-list" style={{ flex: 1 }}>
                  <div className="ide-member-row" style={{ borderLeft: viewMode === 'template' ? '2px solid var(--accent-primary)' : '2px solid transparent', background: viewMode === 'template' ? 'rgba(108,99,255,0.06)' : 'transparent' }}
                    onClick={switchToTemplate}>
                    <div className="ide-member-dot" style={{ background: 'var(--accent-primary)' }}>T</div>
                    <div className="ide-member-detail">
                      <div className="ide-member-username" style={{ color: viewMode === 'template' ? '#f0f0ff' : undefined }}>Template (Original)</div>
                      <div className="ide-member-status">Admin&apos;s master copy</div>
                    </div>
                  </div>
                  {members.map(member => (
                    <div key={member.id}
                      className={`ide-member-row ${selectedMemberId === member.id ? 'active' : ''}`}
                      onClick={() => selectMember(member)}>
                      <div className="ide-member-dot">{member.username.charAt(0).toUpperCase()}</div>
                      <div className="ide-member-detail">
                        <div className="ide-member-username">{member.username}</div>
                        <div className="ide-member-status">{member.email}</div>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
                      No clients have joined yet.
                    </div>
                  )}
                </div>
              </>
            )}

            {activePanel === 'scores' && isAdmin && (
              <>
                <div className="ide-panel-title">
                  <span>Candidate Scores</span>
                </div>
                <div className="ide-members-list" style={{ flex: 1, padding: 0 }}>
                  <div style={{ padding: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Select a candidate to view their AI Tutor evaluation scores.
                  </div>
                  {members.map(member => (
                    <div key={member.id}
                      className={`ide-member-row ${selectedMemberId === member.id ? 'active' : ''}`}
                      onClick={() => selectMember(member)}>
                      <div className="ide-member-dot" style={{ background: 'var(--accent-magenta)' }}>📊</div>
                      <div className="ide-member-detail">
                        <div className="ide-member-username">{member.username}</div>
                        <div className="ide-member-status">Click to fetch scores</div>
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && (
                    <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center' }}>
                      No clients have joined yet.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Editor + Chat Wrapper */}
          <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>

            {/* Editor Area */}
            <div className="ide-editor-area" style={{ flex: showTutorChat ? 7 : 1 }}>
              {/* Tabs */}
              {openTabs.length > 0 && (
                <div className="ide-tabs-v2">
                  {openTabs.map(tab => (
                    <div key={tab.id}
                      className={`ide-tab-v2 ${selectedFileId === tab.id ? 'active' : ''}`}
                      onClick={() => {
                        const file = files.find(f => f.id === tab.id);
                        if (file) openFile(file);
                      }}>
                      <span className="tab-icon">{getFileIcon(tab.language)}</span>
                      <span>{getBasename(tab.filename)}</span>
                      {tab.is_hidden && <span className="tab-badge tab-badge-hidden">hidden</span>}
                      {viewMode === 'member' && selectedMemberId && selectedFileId === tab.id && (
                        <span className="tab-badge tab-badge-member">{selectedMember?.username}</span>
                      )}
                      <button className="tab-close" onClick={(e) => closeTab(tab.id, e)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {viewMode === 'client_overview' && selectedMember ? (
                <div className="client-overview">
                  <div className="client-overview-header">
                    <div className="client-overview-avatar">
                      {selectedMember.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="client-overview-info">
                      <h2>{selectedMember.username}</h2>
                      <p>{selectedMember.email}</p>
                    </div>
                  </div>

                  <div className="client-profile-grid">
                    <div className="client-profile-card">
                      <div className="label">Role</div>
                      <div className="value">Candidate / Client</div>
                    </div>
                    <div className="client-profile-card">
                      <div className="label">Status</div>
                      <div className="value" style={{ color: 'var(--accent-green)' }}>● Active in Workspace</div>
                    </div>
                    <div className="client-profile-card">
                      <div className="label">Joined</div>
                      <div className="value">{new Date(selectedMember.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* AI Tutor Scores Section */}
                  <div className="client-files-section" style={{ marginBottom: 40 }}>
                    <h3>🤖 AI Socratic Tutor Evaluation</h3>
                    {clientScores[selectedMember.id] ? (
                      clientScores[selectedMember.id].found ? (
                        <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 24, animation: 'fadeUp 0.6s ease-out' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 16, borderBottom: '1px dashed var(--border-subtle)' }}>
                            <div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Interactions</span>
                              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{clientScores[selectedMember.id].turn_count} turns</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Last Updated</span>
                              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                {new Date(clientScores[selectedMember.id].updated_at).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
                            {Object.entries(clientScores[selectedMember.id].current_ema_scores || {}).map(([metric, score]) => (
                              <div key={metric} style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>{metric.replace('_ema', '')}</div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                                  <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-bright)', lineHeight: 1 }}>{score}</span>
                                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', paddingBottom: 4 }}>/ 10</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)' }}>
                          No interaction data found for this candidate yet.
                        </div>
                      )
                    ) : (
                      <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2, marginRight: 8, display: 'inline-block', verticalAlign: 'middle' }}></span>
                        Fetching evaluation scores...
                      </div>
                    )}
                  </div>

                  <div className="client-files-section">
                    <h3>📁 Client Workspace Files</h3>
                    <div className="client-files-grid">
                      {visibleFiles.map(file => (
                        <button key={file.id} className="client-file-btn" onClick={() => openMemberFile(selectedMember, file)}>
                          <div className="client-file-icon">{getFileIcon(file.language)}</div>
                          <div className="client-file-meta">
                            <span className="client-file-name">{getBasename(file.filename)}</span>
                            <span className="client-file-lang">{file.language}</span>
                          </div>
                        </button>
                      ))}
                      {visibleFiles.length === 0 && (
                        <p style={{ color: 'var(--text-muted)' }}>No files available in this group workspace yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : selectedFile ? (
                <>
                  {/* Breadcrumb */}
                  <div className="ide-breadcrumb">
                    <span>{group.name}</span>
                    {breadcrumbParts.map((part, i) => (
                      <span key={i}>
                        <span className="separator"> › </span>
                        <span>{part}</span>
                      </span>
                    ))}
                    {viewMode === 'member' && selectedMember && (
                      <>
                        <span className="separator"> — </span>
                        <span style={{ color: 'var(--accent-green)' }}>👤 {selectedMember.username}&apos;s version</span>
                      </>
                    )}
                  </div>

                  {/* Toolbar */}
                  <div className="ide-toolbar-v2">
                    <div className="ide-toolbar-left">
                      {viewMode === 'member' && selectedMember && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '2px 8px', fontSize: '0.75rem', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}
                          onClick={() => {
                            setViewMode('client_overview');
                            setSelectedFileId(null);
                            setEditorContent('');
                          }}
                        >
                          ← Back to Overview
                        </button>
                      )}
                      <span className="ide-lang-badge">{selectedFile.language}</span>

                      {isAdmin && viewMode === 'template' && (
                        <button
                          className={`ide-activity-btn ${selectedFile.is_readonly ? 'active' : ''}`}
                          onClick={async () => {
                            try {
                              await api.updateFile(groupId, selectedFile.id, { is_readonly: !selectedFile.is_readonly });
                              setFiles(files.map(f => f.id === selectedFile.id ? { ...f, is_readonly: !selectedFile.is_readonly } : f));
                            } catch (e) {
                              console.error(e);
                            }
                          }}
                          title="Toggle Read-Only for Clients"
                          style={{ padding: '2px 6px', fontSize: '0.9rem', height: 'auto', border: selectedFile.is_readonly ? '1px solid var(--accent-warning)' : '1px solid rgba(255,255,255,0.1)' }}
                        >
                          {selectedFile.is_readonly ? '🔒 Locked' : '🔓 Unlocked'}
                        </button>
                      )}

                      {selectedFile.is_hidden && <span className="ide-readonly-badge">🔒 Hidden</span>}
                      {!isAdmin && selectedFile.is_readonly && <span className="ide-readonly-badge">🔒 Locked</span>}
                      {(viewMode === 'member' || (!isAdmin && (selectedFile.is_readonly || selectedFile.filename?.startsWith('db/')))) && <span className="ide-readonly-badge">👁 Read-only</span>}
                    </div>
                    <div className="ide-toolbar-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        className="ide-run-btn"
                        onClick={runTests}
                        disabled={testRunning}
                        title="Run Tests in Docker Container"
                        style={{
                          padding: '3px 12px', fontSize: '0.8rem', fontWeight: 600,
                          border: '1px solid rgba(76,175,80,0.4)', borderRadius: '4px',
                          background: testRunning ? 'rgba(255,193,7,0.15)' : 'rgba(76,175,80,0.12)',
                          color: testRunning ? '#ffc107' : '#4caf50',
                          cursor: testRunning ? 'wait' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.2s',
                        }}
                      >
                        {testRunning ? (
                          <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Running...</>
                        ) : (
                          <>▶ Run Tests</>
                        )}
                      </button>
                      {showTerminal && (
                        <button
                          onClick={() => setShowTerminal(false)}
                          title="Hide Terminal"
                          style={{
                            padding: '3px 8px', fontSize: '0.75rem',
                            border: '1px solid var(--border-subtle)', borderRadius: '4px',
                            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                          }}
                        >
                          ✕ Terminal
                        </button>
                      )}
                      {canEdit && viewMode === 'template' && (
                        <div className={`ide-save-dot ${saveStatus}`}>
                          {saveStatus === 'saved' && '✓ Saved'}
                          {saveStatus === 'saving' && '⏳ Saving...'}
                          {saveStatus === 'unsaved' && '● Unsaved'}
                        </div>
                      )}
                      {!isAdmin && (
                        <div className={`ide-save-dot ${saveStatus}`}>
                          {saveStatus === 'saved' && '✓ Saved'}
                          {saveStatus === 'saving' && '⏳ Saving...'}
                          {saveStatus === 'unsaved' && '● Unsaved'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Editor */}
                  <div className="ide-editor-wrap">
                    <div className="ide-line-numbers" ref={lineNumbersRef}>
                      {Array.from({ length: lineCount }, (_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    {canEdit && viewMode !== 'member' ? (
                      <textarea ref={editorRef} className="ide-textarea"
                        value={editorContent}
                        onChange={(e) => handleEditorChange(e.target.value)}
                        onScroll={handleEditorScroll}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        placeholder="// Start writing code..."
                        id="code-editor" />
                    ) : (
                      <div className="ide-code-display" ref={editorRef} onScroll={handleEditorScroll}>
                        {editorContent || '// Empty file'}
                      </div>
                    )}
                  </div>

                  {/* Terminal Output Panel */}
                  {showTerminal && (
                    <div className="ide-terminal-panel" style={{
                      borderTop: '2px solid var(--border-subtle)',
                      background: '#0d1117',
                      minHeight: '180px',
                      maxHeight: '320px',
                      display: 'flex',
                      flexDirection: 'column',
                      flexShrink: 0,
                    }}>
                      {/* Test Results Summary */}
                      {testResults && (
                        <div style={{
                          background: '#161b22',
                          padding: '10px 12px',
                          borderBottom: '1px solid rgba(255,255,255,0.08)',
                          fontSize: '0.8rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexShrink: 0,
                        }}>
                          <div style={{ display: 'flex', gap: '16px' }}>
                            <span>
                              {testResults?.backend_tests?.status === 'passed' ? '✅' : testResults?.backend_tests?.status === 'failed' ? '❌' : '⚙️'} Backend {testResults?.backend_tests?.status}
                            </span>
                            <span>
                              {testResults?.frontend_tests?.status === 'passed' ? '✅' : testResults?.frontend_tests?.status === 'failed' ? '❌' : '📜'} Frontend {testResults?.frontend_tests?.status}
                            </span>
                          </div>
                          <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>
                            ⏱ {testResults.duration}s
                          </span>
                        </div>
                      )}
                      
                      {/* Terminal tabs */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '0',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        background: '#161b22',
                        padding: '0 8px',
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Terminal</span>
                        {['full', 'backend', 'frontend'].map(tab => (
                          <button key={tab}
                            onClick={() => setActiveTerminalTab(tab)}
                            style={{
                              padding: '6px 14px', fontSize: '0.75rem', fontWeight: 500,
                              border: 'none', borderBottom: activeTerminalTab === tab ? '2px solid #58a6ff' : '2px solid transparent',
                              background: 'transparent', cursor: 'pointer',
                              color: activeTerminalTab === tab ? '#e6edf3' : '#8b949e',
                              transition: 'all 0.15s',
                            }}
                          >
                            {tab === 'full' && '📺 Full Output'}
                            {tab === 'backend' && (
                              <span>
                                {testResults?.backend_tests?.status === 'passed' ? '✅' : testResults?.backend_tests?.status === 'failed' ? '❌' : '🐍'} Backend
                              </span>
                            )}
                            {tab === 'frontend' && (
                              <span>
                                {testResults?.frontend_tests?.status === 'passed' ? '✅' : testResults?.frontend_tests?.status === 'failed' ? '❌' : '📜'} Frontend
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Terminal content */}
                      <div ref={terminalRef} style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '12px 16px',
                        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace',
                        fontSize: '0.78rem',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        color: '#c9d1d9',
                      }}>
                        {testRunning && (
                          <div style={{ color: '#ffc107' }}>
                            ⟳ Spinning up Docker container and running tests...
                            <br />This may take 20-60 seconds for the first run.
                            <div style={{ marginTop: '12px' }}>
                              <div className="terminal-progress-bar" style={{
                                height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden',
                              }}>
                                <div style={{
                                  height: '100%', background: 'linear-gradient(90deg, #ffc107, #ff9800, #ffc107)',
                                  animation: 'terminalProgress 2s ease-in-out infinite',
                                  width: '40%',
                                }} />
                              </div>
                            </div>
                          </div>
                        )}
                        {!testRunning && !testResults && (
                          <div style={{ color: '#8b949e' }}>
                            Click "▶ Run Tests" to execute your test suites in an isolated Docker container.
                            <br />Your backend (pytest) and frontend (Jest) tests will run automatically.
                          </div>
                        )}
                        {testResults && !testRunning && (
                          <>
                            {activeTerminalTab === 'full' && (testResults.full_output || 'No output.')}
                            {activeTerminalTab === 'backend' && (
                              <>
                                <div style={{ marginBottom: '8px', fontWeight: 600, color: testResults.backend_tests.status === 'passed' ? '#4caf50' : testResults.backend_tests.status === 'failed' ? '#f44336' : '#ffc107' }}>
                                  Status: {testResults.backend_tests.status.toUpperCase()}
                                </div>
                                {testResults.backend_tests.output || 'No backend test output.'}
                              </>
                            )}
                            {activeTerminalTab === 'frontend' && (
                              <>
                                <div style={{ marginBottom: '8px', fontWeight: 600, color: testResults.frontend_tests.status === 'passed' ? '#4caf50' : testResults.frontend_tests.status === 'failed' ? '#f44336' : '#ffc107' }}>
                                  Status: {testResults.frontend_tests.status.toUpperCase()}
                                </div>
                                {testResults.frontend_tests.output || 'No frontend test output.'}
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status bar */}
                  <div className="ide-statusbar-v2">
                    <div>
                      <span className="status-item">⬡ GroupHub</span>
                      <span className="status-item">Ln {lineCount}, Col 1</span>
                    </div>
                    <div>
                      <span className="status-item">{selectedFile.language}</span>
                      <span className="status-item">UTF-8</span>
                      <span className="status-item">Spaces: 2</span>
                      {viewMode === 'member' && selectedMember && (
                        <span className="status-item" style={{ color: 'rgba(255,255,255,0.7)' }}>
                          Viewing: {selectedMember.username}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* Welcome screen */
                <div className="ide-welcome">
                  <div className="ide-welcome-logo">⬡</div>
                  <h3>GroupHub Workspace</h3>
                  <p>{isAdmin
                    ? 'Select a file from the explorer or create a new one to get started.'
                    : 'Select a file from the explorer to start working on your copy.'
                  }</p>
                  <div className="ide-welcome-shortcuts">
                    {isAdmin && (
                      <div className="ide-welcome-shortcut">
                        <kbd>＋</kbd> <span>New file</span>
                      </div>
                    )}
                    <div className="ide-welcome-shortcut">
                      <kbd>Ctrl+S</kbd> <span>Save file</span>
                    </div>
                    <div className="ide-welcome-shortcut">
                      <kbd>Tab</kbd> <span>Indent</span>
                    </div>
                  </div>
                  {isAdmin && files.length === 0 && (
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 20 }}
                      onClick={() => setShowAddFile(true)}>
                      ＋ Create First File
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* AI Tutor Chat Panel */}
            {showTutorChat && (
              <div style={{ flex: 3, minWidth: 320, borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%', minHeight: 0 }}>
                <TutorChat
                  groupId={group.group_code}
                  candidateName={user?.username || 'Anonymous'}
                />
              </div>
            )}

          </div>{/* End Editor + Chat Wrapper */}
        </div>
      </div>

      {showAddFile && (
        <AddFileModal groupId={groupId} isAdmin={isAdmin}
          onClose={() => setShowAddFile(false)}
          onCreated={handleFileCreated} />
      )}

      {showAiMode && (
        <AiModeModal
          groupId={groupId}
          groupCode={group.group_code}
          onClose={() => setShowAiMode(false)}
          onFilesGenerated={(createdFiles) => {
            setFiles(prev => [...prev, ...createdFiles]);
          }}
        />
      )}
    </>
  );
}
