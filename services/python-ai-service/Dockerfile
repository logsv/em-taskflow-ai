FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libmupdf-dev && \
    rm -rf /var/lib/apt/lists/*

# Install uv and setuptools for fast package installation
RUN pip install --no-cache-dir uv "setuptools<70.0.0"

# Copy requirements and install dependencies using uv
COPY requirements.txt pyproject.toml ./
RUN uv pip install --system -r requirements.txt

# Copy source code after dependencies to maximize Docker layer cache hits
COPY . .

EXPOSE 8000 50051

ENV REST_PORT=8000
ENV GRPC_PORT=50051
ENV PYTHONPATH=/app
ENV PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "app/main.py"]
