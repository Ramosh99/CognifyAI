"""
Database ORM Models
--------------------
SQLAlchemy models for all CognifyAI tables:
  - Document     : a single chunk stored with its embedding vector
  - User         : a learner profile (learner_type, etc.)
  - QuizSession  : one quiz attempt by a user on a topic
  - QuizAttempt  : one question answered within a session
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Text,
    DateTime, ForeignKey, Boolean
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from app.db.database import Base

VECTOR_DIM = 768  # BAAI/bge-base-en-v1.5


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    text = Column(Text, nullable=False)
    topic = Column(String(255), nullable=True)
    source = Column(String(512), nullable=True)
    embedding = Column(Vector(VECTOR_DIM), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=True)
    learner_type = Column(String(50), default="Textual")  # Visual | Textual | Practical
    created_at = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("QuizSession", back_populates="user")


class QuizSession(Base):
    __tablename__ = "quiz_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    topic = Column(String(255), nullable=False)
    learner_type = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    attempts = relationship("QuizAttempt", back_populates="session")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("quiz_sessions.id"), nullable=False)
    question = Column(Text, nullable=False)
    selected_answer = Column(Text, nullable=True)
    correct_answer = Column(Text, nullable=True)
    is_correct = Column(Boolean, default=False)
    misconception_tag = Column(String(255), nullable=True)  # e.g., "TCP vs UDP confusion"
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("QuizSession", back_populates="attempts")
