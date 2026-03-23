# CognifyAI

**“Adaptive Truth-Aware Learning System”**

An AI-powered personalized learning platform that uses Retrieval-Augmented Generation (RAG) to adapt content based on learner type, generate concept-aware quizzes, detect misconceptions, and provide truth-validated explanations.

This repository contains the base boilerplate code for both the Next.js frontend and the FastAPI backend.

## Project Structure

- `frontend/`: Next.js 14 application with Tailwind CSS and TypeScript.
- `backend/`: FastAPI application configured with virtual environment, SQLAlchemy, and Pydantic.

## Getting Started

### 1. Running the Backend

The backend is built with FastAPI. It uses Python and requires dependencies defined in `backend/requirements.txt`.

#### Setup & Run (Windows PowerShell)
```powershell
cd backend
# Activate virtual environment
.\venv\Scripts\activate
# Start the FastAPI server
uvicorn app.main:app --reload
```
The API will be available at [http://127.0.0.1:8000](http://127.0.0.1:8000). You can check the health endpoint at [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health). Check API docs at `/docs` or `/redoc`.

### 2. Running the Frontend

The frontend is built with Next.js and uses npm for package management.

#### Setup & Run
```powershell
cd frontend
# Install dependencies
npm install
# Start the development server
npm run dev
```
The dashboard will be available at [http://localhost:3000](http://localhost:3000).

## Next Steps
To continue the 7-day execution plan from the initial `to_do.md`, we will focus on:
1. Designing the database schemas (PostgreSQL / Supabase pgvector)
2. Implementing the RAG core utilities
3. Building the Misconception Detection Engine
