# Terminal 1 — Backend
cd grouphub/backend
python -m uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd grouphub/frontend
npm run dev
