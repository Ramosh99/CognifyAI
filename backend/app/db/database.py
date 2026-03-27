"""
Database Engine
---------------
Creates a SQLAlchemy synchronous engine connected to Supabase (PostgreSQL).
Provides a session factory and a dependency for FastAPI route injection.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings


engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,       # Detect stale connections
    pool_size=5,
    max_overflow=10,
    connect_args={
        # Required for Supabase's pgBouncer pooler —
        # it does not support server-side prepared statements.
        "options": "-c statement_timeout=30000"
    }
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: yields a DB session and ensures it closes after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
