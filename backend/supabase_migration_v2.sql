-- =============================================================
-- CognifyAI — Adaptive Learning Schema Migration (v2)
-- Run this entire script AFTER supabase_migration.sql
-- Supabase Dashboard → SQL Editor → New Query → Run
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Learner Profile — dynamic, continuously updated model
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learner_profiles (
    user_id             UUID PRIMARY KEY,   -- maps to Supabase auth.users.id
    -- Modality preferences (0.0 = never preferred, 1.0 = always preferred)
    visual_pref         FLOAT DEFAULT 0.5,
    text_pref           FLOAT DEFAULT 0.5,
    example_pref        FLOAT DEFAULT 0.5,
    analogy_pref        FLOAT DEFAULT 0.5,
    auditory_pref       FLOAT DEFAULT 0.5,
    code_pref           FLOAT DEFAULT 0.5,
    -- Skill & difficulty
    current_skill       FLOAT DEFAULT 0.3,  -- 0=beginner 1=expert
    preferred_diff      FLOAT DEFAULT 0.5,  -- 0=easy 1=hard
    needs_repetition    FLOAT DEFAULT 0.5,  -- 0=one-shot 1=needs many repetitions
    -- Pace
    learning_pace       VARCHAR(10) DEFAULT 'medium' CHECK (learning_pace IN ('slow','medium','fast')),
    -- Meta
    onboarding_done     BOOLEAN DEFAULT FALSE,
    total_sessions      INT DEFAULT 0,
    last_topic          VARCHAR(255),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 2. Learning Sessions — one row per lesson/topic attempt
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    topic               VARCHAR(255) NOT NULL,
    -- What mix of content was delivered (snapshot of learner profile at time of lesson)
    modality_mix        JSONB DEFAULT '{}',
    -- Outcome metrics (filled in when session is completed)
    quiz_score          FLOAT,              -- 0.0–1.0, fraction correct
    avg_response_ms     INT,               -- average ms to answer each question
    total_attempts      INT DEFAULT 0,     -- total quiz questions attempted
    correct_attempts    INT DEFAULT 0,
    -- Timestamps
    started_at          TIMESTAMPTZ DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    -- Dominant modality this session used
    dominant_modality   VARCHAR(20)         -- text | diagram | example | analogy | auditory | code
);

-- Index for efficient user-scoped queries
CREATE INDEX IF NOT EXISTS learning_sessions_user_idx ON learning_sessions (user_id);
CREATE INDEX IF NOT EXISTS learning_sessions_topic_idx ON learning_sessions (user_id, topic);

-- ──────────────────────────────────────────────────────────────
-- 3. Content Events — per-content-block engagement signals
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL,
    -- What content block was shown
    content_type    VARCHAR(20) NOT NULL CHECK (content_type IN ('text','diagram','example','analogy','auditory','code','quiz')),
    -- Engagement signals
    time_spent_ms   INT,
    quiz_correct    BOOLEAN,    -- NULL if not a quiz event
    attempts        INT DEFAULT 1,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS content_events_session_idx ON content_events (session_id);
CREATE INDEX IF NOT EXISTS content_events_user_idx ON content_events (user_id);

-- ──────────────────────────────────────────────────────────────
-- 4. Diagnostic Assessment Sessions — for onboarding
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    topic           VARCHAR(255),
    concepts        JSONB DEFAULT '[]',
    signals         JSONB DEFAULT '{}',
    computed_profile JSONB DEFAULT '{}',
    completed       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS diagnostic_sessions_user_idx ON diagnostic_sessions (user_id);

-- ──────────────────────────────────────────────────────────────
-- 5. Helper: upsert learner profile (called from backend)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_learner_profile(
    p_user_id           UUID,
    p_visual_pref       FLOAT DEFAULT NULL,
    p_text_pref         FLOAT DEFAULT NULL,
    p_example_pref      FLOAT DEFAULT NULL,
    p_analogy_pref      FLOAT DEFAULT NULL,
    p_auditory_pref     FLOAT DEFAULT NULL,
    p_code_pref         FLOAT DEFAULT NULL,
    p_current_skill     FLOAT DEFAULT NULL,
    p_preferred_diff    FLOAT DEFAULT NULL,
    p_needs_repetition  FLOAT DEFAULT NULL,
    p_learning_pace     VARCHAR DEFAULT NULL,
    p_onboarding_done   BOOLEAN DEFAULT NULL,
    p_last_topic        VARCHAR DEFAULT NULL
)
RETURNS SETOF learner_profiles
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO learner_profiles (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE learner_profiles SET
        visual_pref       = COALESCE(p_visual_pref,      visual_pref),
        text_pref         = COALESCE(p_text_pref,        text_pref),
        example_pref      = COALESCE(p_example_pref,     example_pref),
        analogy_pref      = COALESCE(p_analogy_pref,     analogy_pref),
        auditory_pref     = COALESCE(p_auditory_pref,    auditory_pref),
        code_pref         = COALESCE(p_code_pref,        code_pref),
        current_skill     = COALESCE(p_current_skill,    current_skill),
        preferred_diff    = COALESCE(p_preferred_diff,   preferred_diff),
        needs_repetition  = COALESCE(p_needs_repetition, needs_repetition),
        learning_pace     = COALESCE(p_learning_pace,    learning_pace),
        onboarding_done   = COALESCE(p_onboarding_done,  onboarding_done),
        last_topic        = COALESCE(p_last_topic,       last_topic),
        updated_at        = NOW()
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT * FROM learner_profiles WHERE user_id = p_user_id;
END;
$$;

