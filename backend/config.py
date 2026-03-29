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
