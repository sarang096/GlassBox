// Get API URL from environment or default to localhost
let defaultApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// Auto-detect if user is accessing the app from another device on the network (e.g. mobile)
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && defaultApiUrl.includes('localhost')) {
  defaultApiUrl = `${window.location.protocol}//${window.location.hostname}:8000/api`;
}

class ApiClient {
  constructor() {
    this.baseUrl = defaultApiUrl;
  }

  /**
   * Get token from secure storage
   * Using localStorage as fallback (consider httpOnly cookies for production)
   */
  getToken() {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('grouphub_token');
    }
    return null;
  }

  /**
   * Make API request with proper headers and error handling
   */
  async request(endpoint, options = {}) {
    try {
      const token = this.getToken();
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const url = `${this.baseUrl}${endpoint}`;
      
      // Validate URL to prevent injection attacks
      if (!this._isValidUrl(url)) {
        throw new Error('Invalid API URL');
      }

      const response = await fetch(url, { 
        ...options, 
        headers,
        credentials: 'omit',  // Don't send cookies since we're using Bearer tokens
        // Authenticated JSON should never be served from the HTTP cache, and
        // the admin's poll of a member's fork depends on always seeing live data.
        cache: 'no-store'
      });

      // Handle 401 - Unauthorized (token expired or invalid)
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('grouphub_token');
          // Redirect to login if not already there
          if (typeof window !== 'undefined' && !['/login', '/register', '/'].includes(window.location.pathname)) {
            window.location.href = '/login';
          }
        }
      }

      // Handle non-ok responses
      if (!response.ok) {
        let error = { detail: 'An error occurred' };
        try {
          error = await response.json();
        } catch (e) {
          error = { detail: `HTTP ${response.status} error` };
        }
        throw new Error(error.detail || 'Request failed');
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null;
      }

      return response.json();
    } catch (error) {
      // Don't log expected auth failures to avoid noisy console
      if (!error.message?.includes('Could not validate')) {
        console.error('API Error:', error);
      }
      throw error;
    }
  }

  /**
   * Validate URL to prevent injection attacks
   */
  _isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      // Only allow http and https
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate input string (prevent injection attacks)
   */
  _validateInput(input, fieldName = 'input', maxLength = 255) {
    if (typeof input !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }
    if (input.length > maxLength) {
      throw new Error(`${fieldName} exceeds maximum length of ${maxLength}`);
    }
    return input.trim();
  }

  // ─── Auth Endpoints ───

  async register(username, email, password) {
    username = this._validateInput(username, 'Username', 50);
    email = this._validateInput(email, 'Email', 100);
    password = this._validateInput(password, 'Password', 128);

    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(email, password) {
    email = this._validateInput(email, 'Email', 100);
    password = this._validateInput(password, 'Password', 128);

    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // ─── Groups Endpoints ───

  async createGroup(name, description = '', fields = []) {
    name = this._validateInput(name, 'Group name', 100);
    description = this._validateInput(description, 'Description', 500);
    
    if (!Array.isArray(fields)) {
      throw new Error('Fields must be an array');
    }

    return this.request('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, description, fields }),
    });
  }

  async getGroups() {
    return this.request('/groups');
  }

  async joinGroup(groupCode, profileValues = []) {
    groupCode = this._validateInput(groupCode, 'Group code', 20);
    
    if (!Array.isArray(profileValues)) {
      throw new Error('Profile values must be an array');
    }

    return this.request('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ group_code: groupCode, profile_values: profileValues }),
    });
  }

  async lookupGroup(code) {
    code = this._validateInput(code, 'Group code', 20);
    return this.request(`/groups/lookup/${encodeURIComponent(code)}`);
  }

  async getGroup(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid group ID');
    }
    return this.request(`/groups/${id}`);
  }

  async deleteGroup(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid group ID');
    }
    return this.request(`/groups/${id}`, { method: 'DELETE' });
  }

  async leaveGroup(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid group ID');
    }
    return this.request(`/groups/${id}/leave`, { method: 'POST' });
  }

  // ─── Files Endpoints ───

  async createFile(groupId, filename, language = 'text', content = '', isHidden = false, isReadonly = false) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    filename = this._validateInput(filename, 'Filename', 255);
    language = this._validateInput(language, 'Language', 50);
    // Content can be large, but set a reasonable limit (10MB)
    if (typeof content !== 'string' || content.length > 10 * 1024 * 1024) {
      throw new Error('Content too large (max 10MB)');
    }

    return this.request(`/groups/${groupId}/files`, {
      method: 'POST',
      body: JSON.stringify({ filename, language, content, is_hidden: isHidden, is_readonly: isReadonly }),
    });
  }

  async getFiles(groupId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    return this.request(`/groups/${groupId}/files`);
  }

  async getFile(groupId, fileId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }
    return this.request(`/groups/${groupId}/files/${fileId}`);
  }

  async updateFile(groupId, fileId, data) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }

    return this.request(`/groups/${groupId}/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteFile(groupId, fileId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }
    return this.request(`/groups/${groupId}/files/${fileId}`, { method: 'DELETE' });
  }

  // ─── Member File Versions ───

  async getMyVersion(groupId, fileId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }
    return this.request(`/groups/${groupId}/files/${fileId}/my-version`);
  }

  async updateMyVersion(groupId, fileId, content) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }
    if (typeof content !== 'string' || content.length > 10 * 1024 * 1024) {
      throw new Error('Content too large (max 10MB)');
    }

    return this.request(`/groups/${groupId}/files/${fileId}/my-version`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async getAllVersions(groupId, fileId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }
    return this.request(`/groups/${groupId}/files/${fileId}/versions`);
  }

  async getMemberVersion(groupId, fileId, userId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    if (!Number.isInteger(fileId) || fileId <= 0) {
      throw new Error('Invalid file ID');
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('Invalid user ID');
    }
    return this.request(`/groups/${groupId}/files/${fileId}/versions/${userId}`);
  }

  // ─── Code Execution ───

  async runTests(groupId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    // Use a 90s timeout — Docker containers can take up to 60s
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    try {
      return await this.request(`/groups/${groupId}/execute`, {
        method: 'POST',
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Test execution timed out after 90 seconds. The container may be overloaded or hung.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─── RAG index management ───
  // There is no chat method here: the AI tutor is the n8n workflow, reached
  // through the Next.js proxy at /api/chat. FastAPI only owns the vectors.

  async reindexChat(groupId) {
    if (!Number.isInteger(groupId) || groupId <= 0) {
      throw new Error('Invalid group ID');
    }
    return this.request(`/groups/${groupId}/rag/reindex`, {
      method: 'POST',
    });
  }
}

const api = new ApiClient();
export default api;
