# GroupHub Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites
- Python 3.10+ installed
- Node.js 18+ installed
- Git installed

---

## Backend Setup (Terminal 1)

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Run the backend server
uvicorn main:app --reload --port 8000
```

✅ Backend running at: http://localhost:8000
📚 API Docs at: http://localhost:8000/docs

---

## Frontend Setup (Terminal 2)

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local

# Start development server
npm run dev
```

✅ Frontend running at: http://localhost:3000

---

## 🧪 Test the Application

### Register
1. Go to http://localhost:3000/register
2. Fill in the form with:
   - **Username**: testuser
   - **Email**: test@example.com
   - **Password**: TestPass123! (must include upper, lower, digit, special char)
3. Click "Get Started"

### Create a Group
1. Navigate to Dashboard
2. Click "Create Group"
3. Enter group name and click create

### Join a Group
1. From another account, go to join group
2. Enter the group code shown in the group details
3. Click join

### Share Files
1. In group, click "Add File"
2. Enter filename and code
3. Members can view and edit their copies

---

## 🔐 Security By Default

✅ **Passwords**: Required to be strong (10+ chars with uppercase, lowercase, digit, special char)
✅ **Tokens**: Expire after 1 hour of inactivity
✅ **Database**: Parameterized queries prevent SQL injection
✅ **Input**: All inputs validated server-side
✅ **CORS**: Restricted to localhost:3000 in development

---

## 📚 Available Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Groups
- `POST /api/groups` - Create group
- `GET /api/groups` - List user groups
- `POST /api/groups/join` - Join group
- `GET /api/groups/lookup/{code}` - Lookup group by code
- `GET /api/groups/{id}` - Get group details
- `DELETE /api/groups/{id}` - Delete group (admin only)

### Files
- `POST /api/groups/{id}/files` - Create file (admin only)
- `GET /api/groups/{id}/files` - List files
- `PUT /api/groups/{id}/files/{file_id}` - Update file (admin only)
- `DELETE /api/groups/{id}/files/{file_id}` - Delete file (admin only)

### Member File Versions
- `GET /api/groups/{id}/files/{file_id}/my-version` - Get your file copy
- `PUT /api/groups/{id}/files/{file_id}/my-version` - Update your file copy
- `GET /api/groups/{id}/files/{file_id}/versions` - Get all versions (admin)

---

## 🛠️ Useful Commands

### Backend
```bash
# Format code
pip install black
black .

# Check types
pip install mypy
mypy .

# Run tests
pip install pytest
pytest

# View database (SQLite)
sqlite3 grouphub.db
```

### Frontend
```bash
# Format code
npm run lint -- --fix

# Build for production
npm run build

# Start production server
npm start
```

---

## 🐛 Common Issues & Solutions

### Backend won't start
```bash
# Check if port 8000 is in use
lsof -i :8000

# Try different port
uvicorn main:app --reload --port 8001
```

### Frontend won't start
```bash
# Clear cache
rm -rf .next

# Try different port
npm run dev -- -p 3001
```

### "Connection refused" error
- Make sure backend is running on http://localhost:8000
- Make sure frontend is running on http://localhost:3000
- Check .env files are configured correctly

### Password validation error
- Min 10 characters
- Must have uppercase letter
- Must have lowercase letter
- Must have a digit (0-9)
- Must have special character (!@#$%^&*)

Example: `SecurePass123!`

---

## 📖 Next Steps

1. Read [SECURITY.md](./SECURITY.md) to understand security features
2. Read [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
3. Check API docs at http://localhost:8000/docs
4. Explore codebase structure:
   - `/backend` - FastAPI backend
   - `/frontend` - Next.js frontend

---

## 💡 Tips

- Use API docs at `/docs` to test endpoints in browser
- Frontend shows helpful error messages for all issues
- Passwords must be strong for security
- Tokens expire automatically (login again)
- Files are limited to 10MB for performance

---

## ❓ Need Help?

1. Check documentation in repo
2. Review error messages carefully
3. Check backend logs for server errors
4. Check browser console for frontend errors
5. See SECURITY.md for security questions

---

**Happy coding! 🎉**

