import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from database import engine, Base
from routes.auth_routes import router as auth_router
from routes.group_routes import router as group_router
from routes.file_routes import router as file_router
from routes.execution_routes import router as execution_router
from config import CORS_ORIGINS, LOG_LEVEL

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="GroupHub API",
    description="Workspace-based hiring & testing platform API",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Middleware: Trusted Host
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1", "host.docker.internal", "*.grouphub.local"]
)

# Middleware: CORS with environment-based configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Register routers
app.include_router(auth_router)
app.include_router(group_router)
app.include_router(file_router)
app.include_router(execution_router)


@app.get("/")
def root():
    return {
        "message": "GroupHub API v2 is running",
        "docs": "/docs",
        "version": "2.0.0"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for security"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return {
        "detail": "An error occurred",
        "status_code": 500
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=False  # Disable reload in production
    )
# reload
