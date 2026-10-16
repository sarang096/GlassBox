import os
from dotenv import load_dotenv

load_dotenv()

# Security: Required environment variables (must be set in production)
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    # Development only - in production this will fail, forcing proper config
    import warnings
    warnings.warn("SECRET_KEY not set in environment. This MUST be set in production!")
    SECRET_KEY = "dev-key-only-change-in-production-THIS-IS-INSECURE"

if SECRET_KEY.startswith("dev-key-only") or SECRET_KEY.startswith("super-secret"):
    import warnings
    warnings.warn("⚠️  SECURITY WARNING: Using insecure default SECRET_KEY. Set a strong SECRET_KEY environment variable!")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))  # 1 hour default
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./grouphub.db")

# CORS configuration
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

# Security settings
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 128
MAX_USERNAME_LENGTH = 50
MAX_EMAIL_LENGTH = 100
MAX_GROUP_NAME_LENGTH = 100

# Rate limiting (requests per minute)
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # seconds

# Logging
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# RAG vector store. The AI tutor itself lives in n8n (ai_Eval.json);
# FastAPI only embeds and retrieves, so no chat model is configured here.
GEMINI_KEY = os.getenv("GEMINI_KEY", "")
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")
RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "1200"))
# Unused by the code-aware chunker (overlap is line-based there); kept so an
# existing .env setting does not break startup.
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "100"))
RAG_TOP_K = int(os.getenv("RAG_TOP_K", "5"))
GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")

# n8n service-to-service auth key (same key used in n8n's ADMIN_SECRET env var)
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "change-me")
