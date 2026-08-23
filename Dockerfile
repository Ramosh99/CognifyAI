# Use the official Python base image
FROM python:3.11-slim

# HF Spaces requires a non-root user
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Set the working directory inside the container
WORKDIR /app

# Copy backend requirements first to leverage Docker layer cache
COPY --chown=user backend/requirements.backend.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.backend.txt

# Copy the backend source code
COPY --chown=user backend/ .

# Expose port 7860 — required by Hugging Face Spaces
EXPOSE 7860

# Start the FastAPI application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
