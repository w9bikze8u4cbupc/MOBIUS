FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    git curl ca-certificates build-essential python3-pip python3-venv \
    nodejs npm \
    poppler-utils tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Optional: pin Node via n
RUN npm -g install npm@latest pnpm@9 yarn@1

WORKDIR /workspace