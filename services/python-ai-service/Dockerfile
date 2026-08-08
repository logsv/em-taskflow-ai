FROM python:3.11-slim

# Copy uv binary for ultra-fast parallel package installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install system dependencies with APT cache mounting
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libmupdf-dev

# Copy requirements and install dependencies using uv with BuildKit cache mount
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system -r requirements.txt

# Copy source code after dependencies to maximize Docker layer cache hits
COPY . .

EXPOSE 8000 50051

ENV REST_PORT=8000
ENV GRPC_PORT=50051
ENV PYTHONPATH=/app

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "app/main.py"]
