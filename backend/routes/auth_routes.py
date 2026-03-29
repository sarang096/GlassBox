from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import logging
from database import get_db
from models import User
from schemas import UserRegister, UserLogin, UserResponse, TokenResponse
from auth import hash_password, verify_password, create_access_token, get_current_user, validate_password
from config import MAX_USERNAME_LENGTH, MAX_EMAIL_LENGTH

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def sanitize_username(username: str) -> str:
    """Sanitize and validate username"""
    username = username.strip()
    if len(username) > MAX_USERNAME_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username must not exceed {MAX_USERNAME_LENGTH} characters"
        )
    if len(username) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be at least 3 characters"
        )
    # Only allow alphanumeric, underscore, hyphen
    import re
    if not re.match(r"^[a-zA-Z0-9_-]+$", username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username can only contain letters, numbers, underscores, and hyphens"
        )
    return username


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user with strong password validation"""
    try:
        # Validate and sanitize username
        username = sanitize_username(data.username)
        
        # Validate email
        email = data.email.strip().lower() if data.email else ""
        if len(email) > MAX_EMAIL_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email must not exceed {MAX_EMAIL_LENGTH} characters"
            )
        
        # Check if email already exists
        if db.query(User).filter(User.email == email).first():
            logger.warning(f"Registration attempt with existing email: {email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists"
            )

        # Check if username already exists
        if db.query(User).filter(User.username == username).first():
            logger.warning(f"Registration attempt with existing username: {username}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This username is already taken"
            )

        # Validate password strength
        is_valid, error_msg = validate_password(data.password)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )

        # Create user
        user = User(
            username=username,
            email=email,
            hashed_password=hash_password(data.password)
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        logger.info(f"New user registered: {username}")

        # Generate token
        token = create_access_token(data={"sub": user.id})

        return TokenResponse(
            access_token=token,
            user=UserResponse.model_validate(user)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during registration"
        )


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    """Login user with secure password verification"""
    try:
        email = data.email.strip().lower() if data.email else ""
        user = db.query(User).filter(User.email == email).first()

        if not user or not verify_password(data.password, user.hashed_password):
            logger.warning(f"Failed login attempt for email: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        logger.info(f"User logged in: {user.username}")
        token = create_access_token(data={"sub": user.id})

        return TokenResponse(
            access_token=token,
            user=UserResponse.model_validate(user)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred during login"
        )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return UserResponse.model_validate(current_user)
