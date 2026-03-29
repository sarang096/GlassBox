# GroupHub Security Implementation Guide

## Overview
This document outlines all the security measures implemented in GroupHub to protect user data and system integrity.

---

## 🔐 Authentication & Authorization

### Password Security
- **Minimum length**: 10 characters
- **Maximum length**: 128 characters
- **Required patterns**:
  - At least one uppercase letter (A-Z)
  - At least one lowercase letter (a-z)
  - At least one digit (0-9)
  - At least one special character (!@#$%^&*)

### Token Management
- **Token type**: JWT (JSON Web Tokens)
- **Algorithm**: HS256
- **Default expiration**: 1 hour (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- **Token transmission**: Authorization header with Bearer scheme
- **Storage (Frontend)**: localStorage (consider httpOnly cookies for production)

### Authentication Endpoints
- `/api/auth/register` - User registration with strong validation
- `/api/auth/login` - Secure login with password verification
- `/api/auth/me` - Get current user (requires valid token)

---

## 🛡️ Backend Security

### Database Security
- **ORM**: SQLAlchemy 2.0.35+ (parameterized queries prevent SQL injection)
- **Database types supported**:
  - SQLite (development)
  - PostgreSQL (production recommended)

### Input Validation
All user inputs are validated server-side:

**Username**:
- Length: 3-50 characters
- Pattern: `^[a-zA-Z0-9_-]+$` (alphanumeric, underscore, hyphen only)

**Email**:
- Validated format (RFC compliant)
- Maximum: 100 characters
- Must be unique per user

**Group Name**:
- Maximum: 100 characters
- Required field

**Field Names**:
- Maximum: 100 characters
- Required field

**Description**:
- Maximum: 500 characters

**File Content**:
- Maximum: 10 MB per file
- Language support: Plain text, Python, JavaScript, JSON, etc.

**Passwords**:
- Minimum: 10 characters
- Maximum: 128 characters
- Must include uppercase, lowercase, digit, and special character

### Password Hashing
- **Algorithm**: bcrypt
- **Rounds**: 12 (default from passlib)
- **Never stored in plain text**: Always hashed before database storage

### CORS (Cross-Origin Resource Sharing)
- **Configurable via environment variable**: `CORS_ORIGINS`
- **Default**: `http://localhost:3000` (development only)
- **Methods allowed**: GET, POST, PUT, DELETE
- **Credentials**: Enabled (allows cookies/tokens)
- **Preflight cache**: 10 minutes

### Trusted Host Middleware
- **Protects against**: Host header injection attacks
- **Allowed hosts**: localhost, 127.0.0.1, *.grouphub.local (configurable)

### Error Handling
- **Global exception handler** masks sensitive errors in responses
- **Logging**: All errors logged securely (sensitive data excluded)
- **HTTP status codes**: Proper status codes for error conditions

### Rate Limiting (Optional)
- **Configurable**: `RATE_LIMIT_REQUESTS` per `RATE_LIMIT_WINDOW`
- **Default**: 100 requests per 60 seconds
- **Implementation**: Can use Redis for distributed rate limiting
- **Note**: Currently optional, enable by uncommenting in `main.py`

### Logging
- **Level**: Configurable via `LOG_LEVEL` (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- **Format**: Timestamp, module name, level, message
- **Sensitive data**: Passwords and tokens never logged
- **Audit trail**: User actions logged for security analysis

---

## 🌐 Frontend Security

### API URL Configuration
- **Environment variable**: `NEXT_PUBLIC_API_URL`
- **Default**: `http://localhost:8000/api` (development)
- **Production**: Must be set to your actual API domain (HTTPS)
- **Format validation**: Only HTTP/HTTPS URLs accepted

### Input Validation
All user inputs validated before sending to API:

**URL Validation**:
- Only HTTP/HTTPS protocols allowed
- Invalid URLs rejected before fetch

**String Validation**:
- Type checking: must be string
- Length checking: enforced per field
- Injection prevention: URL parameter encoding

**Number Validation**:
- Integer type checking for IDs
- Positive value enforcement (no zero or negative IDs)

**Array Validation**:
- Type checking for complex data structures
- Element count limits

**Content Validation**:
- Maximum 10 MB per file (same as backend)
- Type validation for all fields

### Authentication State Management
- **Framework**: React Context API
- **Error handling**: User feedback on auth failures
- **Auto-logout**: On token expiration (status 401)
- **Token recovery**: Automatic redirect to login on invalid token

### Token Storage
- **Current method**: localStorage
- **Limitations**: XSS vulnerability potential
- **Production recommendation**: Consider using httpOnly cookies with SameSite attribute
- **Access method**: `getToken()` function handles retrieval safely

### Error Handling
- **User-friendly messages**: Errors presented clearly to users
- **Technical details**: Logged to console for debugging
- **Silent failures**: Some errors handled gracefully (auth check)

---

## 🗄️ Data Security

### User Data
- **Passwords**: Hashed with bcrypt, never stored in plain text
- **Email**: Unique index, validated format
- **Username**: Unique index, alphanumeric validation
- **Created at**: Timestamp for audit trail

### Group Data
- **Access Control**: Only members can access group data
- **Admin-only operations**: 
  - Create files
  - Update files
  - Delete files
  - View all member versions

### File Data
- **Isolation**: Each member has independent file copy
- **Version control**: Track member file edits
- **Content limit**: 10 MB per file prevents DoS

---

## 🔒 Environment Configuration

### Required Environment Variables
```bash
# Backend
SECRET_KEY=<strong-random-string>
CORS_ORIGINS=https://yourdomain.com

# Frontend
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
```

### Example `.env` Files
See `.env.example` files in backend and frontend directories.

---

## 🚀 Production Deployment Checklist

- [ ] Generate strong `SECRET_KEY` (use: `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
- [ ] Set `CORS_ORIGINS` to your production domain(s)
- [ ] Use PostgreSQL instead of SQLite for database
- [ ] Enable HTTPS for both frontend and backend
- [ ] Set `NEXT_PUBLIC_API_URL` to HTTPS endpoint
- [ ] Set `LOG_LEVEL` to INFO or WARNING (not DEBUG)
- [ ] Enable rate limiting (uncomment Redis config)
- [ ] Consider implementing Redis for caching
- [ ] Use httpOnly, Secure cookies for token storage (instead of localStorage)
- [ ] Implement CSRF protection on frontend forms
- [ ] Set up regular backups for database
- [ ] Enable database encryption at rest
- [ ] Implement API versioning (/api/v1/)
- [ ] Set up monitoring and alerting
- [ ] Regular security audits and dependency updates

---

## 🧪 Security Testing

### Password Validation
Test password requirements:
```python
from backend.auth import validate_password

# Should fail: too short
assert not validate_password("Short1!")[0]

# Should fail: no uppercase
assert not validate_password("nouppercase1!")[0]

# Should fail: no digit
assert not validate_password("NoDigit!")[0]

# Should pass
assert validate_password("StrongPass123!")[0]
```

### Input Validation
Test input constraints:
```javascript
// Should fail: username too long
api.register('a'.repeat(51), 'test@example.com', 'Password123!')

// Should fail: invalid email
api.register('user', 'invalid-email', 'Password123!')

// Should pass
api.register('validuser', 'user@example.com', 'StrongPass123!')
```

---

## 🐛 Vulnerability Reporting

Found a security vulnerability? Please report it responsibly:
1. Do NOT create a public GitHub issue
2. Email: [security contact to be added]
3. Include: vulnerability description, reproduction steps, impact assessment

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
- [React Security Best Practices](https://react.dev/learn/security)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-28 | Initial security implementation |

