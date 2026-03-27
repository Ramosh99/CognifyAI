-- =============================================================
-- CognifyAI — Supabase Schema Migration
-- Run this entire script in:
--   Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================

-- 1. Enable the pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Documents table (stores text chunks + their vector embeddings)
CREATE TABLE IF NOT EXISTS documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text        TEXT        NOT NULL,
    topic       VARCHAR(255),
    source      VARCHAR(512),
    embedding   VECTOR(768),          -- BAAI/bge-base-en-v1.5 = 768 dims
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index for fast cosine similarity search on embeddings
CREATE INDEX IF NOT EXISTS documents_embedding_idx
    ON documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- 4. Users table
CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255),
    learner_type VARCHAR(50) DEFAULT 'Textual',  -- Visual | Textual | Practical
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Quiz sessions (one per quiz attempt)
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    topic        VARCHAR(255) NOT NULL,
    learner_type VARCHAR(50),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Individual question attempts within a session
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id        UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question          TEXT NOT NULL,
    selected_answer   TEXT,
    correct_answer    TEXT,
    is_correct        BOOLEAN DEFAULT FALSE,
    misconception_tag VARCHAR(255),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Semantic search function (used by RAG service)
--    Returns top-k most similar chunks using cosine distance.
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR(768),
    match_count     INT     DEFAULT 5,
    filter_topic    VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id      UUID,
    text    TEXT,
    topic   VARCHAR,
    source  VARCHAR,
    score   FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.text,
        d.topic,
        d.source,
        1 - (d.embedding <=> query_embedding) AS score
    FROM documents d
    WHERE
        filter_topic IS NULL OR d.topic = filter_topic
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
