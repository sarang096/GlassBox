# GroupHub Deployment & Setup Guide

## Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL (recommended for production)
- Redis (optional, for rate limiting and caching)

---

## 🚀 Backend Setup

### 1. Clone and Navigate
```bash
cd backend
```

### 2. Create Virtual Environment
```bash
python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment
```bash
# Copy example to .env
cp .env.example .env

# Edit .env with your configuration
# IMPORTANT: Generate a strong SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 5. Initialize Database
```bash
# SQLite (development only)
# Database will auto-create on first run

# PostgreSQL (production)
# Create database: createdb grouphub
# Update DATABASE_URL in .env
```

### 6. Run Backend
```bash
# Development (with auto-reload)
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# Production
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

The API will be available at: http://localhost:8000
- API Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 🎨 Frontend Setup

### 1. Navigate to Frontend
```bash
cd ../frontend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
```bash
# Copy example to .env.local
cp .env.example .env.local

# Edit .env.local with your configuration
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

### 4. Run Development Server
```bash
npm run dev
```

The application will be available at: http://localhost:3000

### 5. Build for Production
```bash
npm run build
npm start
```

---

## 📋 Security Checklist for Production

### Backend
- [ ] Set strong `SECRET_KEY` in environment (not default)
- [ ] Set `CORS_ORIGINS` to your domain(s)
- [ ] Use PostgreSQL (not SQLite)
- [ ] Enable HTTPS / SSL certificates
- [ ] Set `ACCESS_TOKEN_EXPIRE_MINUTES` to appropriate value (default 60)
- [ ] Enable rate limiting (uncomment in main.py)
- [ ] Set `LOG_LEVEL` to INFO or WARNING
- [ ] Keep dependencies updated: `pip install --upgrade -r requirements.txt`

### Frontend
- [ ] Set `NEXT_PUBLIC_API_URL` to HTTPS endpoint
- [ ] Build for production: `npm run build`
- [ ] Use environment variables (not hardcoded values)
- [ ] Keep dependencies updated: `npm update`
- [ ] Enable Content Security Policy headers
- [ ] Set up security headers on web server

### General
- [ ] Enable HTTPS with valid SSL certificate
- [ ] Set up firewall rules (only allow 80, 443, 8000 internally)
- [ ] Regular backups of database
- [ ] Monitor logs for suspicious activity
- [ ] Keep systems updated with security patches

---

## 🐳 Docker Deployment (Optional)

### Backend Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Frontend Dockerfile
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - SECRET_KEY=your-strong-secret-key
      - DATABASE_URL=postgresql://user:password@db:5432/grouphub
      - CORS_ORIGINS=http://frontend:3000,https://yourdomain.com
    depends_on:
      - db
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000/api
    depends_on:
      - backend

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=grouphub
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

---

## 🧪 Testing

### Backend Unit Tests
```bash
cd backend
pip install pytest pytest-cov

# Run tests
pytest

# With coverage
pytest --cov=. --cov-report=html
```

### Frontend Tests
```bash
cd frontend
npm test
```

---

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:8000/health
```

### API Documentation
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Logs
```bash
# Backend logs
tail -f /path/to/logs/backend.log

# Frontend logs (Next.js)
npm run dev 2>&1 | tee frontend.log
```

---

## 🔧 Troubleshooting

### Backend Issues

**Port already in use**
```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>
```

**Database errors**
```bash
# Reset database (development only)
rm grouphub.db

# For PostgreSQL:
dropdb grouphub
createdb grouphub
```

**Import errors**
```bash
# Reinstall dependencies
pip install --upgrade pip
pip install -r requirements.txt --force-reinstall
```

### Frontend Issues

**Node modules issues**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Port already in use**
```bash
npm run dev -- -p 3001
```

---

## 🚨 Emergency Procedures

### Compromised Secret Key
If `SECRET_KEY` is exposed:
1. Stop the application
2. Generate new `SECRET_KEY`
3. All existing tokens become invalid
4. Users must re-login
5. Update environment and restart

### Database Backup
```bash
# PostgreSQL
pg_dump grouphub > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore
psql grouphub < backup_20260328_120000.sql
```

### Emergency Maintenance Mode
```python
# Add to main.py temporarily
@app.get("/")
def root():
    if os.getenv("MAINTENANCE_MODE") == "true":
        return {"error": "System under maintenance"}
    return {"message": "GroupHub API v2"}
```

---

## 📞 Support

For issues or questions:
1. Check documentation
2. Review error logs
3. Check SECURITY.md for security-related issues
4. Create GitHub issue with detailed information

