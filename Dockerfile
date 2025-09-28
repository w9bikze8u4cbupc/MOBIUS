FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt* ./
RUN pip install --no-cache-dir isort black==23.9.1 flake8 pytest pytest-asyncio fastapi uvicorn[standard]
RUN [ -f requirements.txt ] && pip install --no-cache-dir -r requirements.txt || echo "No requirements.txt found"

# Copy application code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY api/ ./api/

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "api.health:app", "--host", "0.0.0.0", "--port", "8000"]