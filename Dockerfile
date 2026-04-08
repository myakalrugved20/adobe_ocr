# Stage 1: Build frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
ENV VITE_API_BASE_URL=""
RUN npm run build

# Stage 2: Python backend + serve frontend
FROM python:3.11-slim
WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ backend/

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Create projects dir
RUN mkdir -p /data/projects

ENV PROJECTS_DIR=/data/projects
ENV PYTHONUNBUFFERED=1

# Write GCP credentials from HF secret to file at startup
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-credentials.json

# Hugging Face Spaces requires port 7860
EXPOSE 7860
CMD ["sh", "-c", "echo \"$GOOGLE_CREDENTIALS_JSON\" > $GOOGLE_APPLICATION_CREDENTIALS && uvicorn backend.main:app --host 0.0.0.0 --port 7860"]
