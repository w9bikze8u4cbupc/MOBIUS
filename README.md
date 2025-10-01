# MOBIUS - Board Game Tutorial Video Generator

A pipeline for generating high-quality board game tutorial videos from structured game rules using AI and automated video rendering.

## Overview

MOBIUS helps content creators produce engaging board game tutorial videos by:
- Extracting metadata from BoardGameGeek
- Analyzing rulebook PDFs with AI
- Generating tutorial scripts
- Rendering professional videos with synchronized audio

## 🚀 Quick Start

See [QUICKSTART.md](./QUICKSTART.md) for a condensed setup guide to get running in minutes.

For detailed Windows setup instructions, see [WINDOWS_SETUP.md](./WINDOWS_SETUP.md).

## Prerequisites

- **Node.js** 20.14 or higher (20.18+ recommended)
- **FFmpeg** for video/audio processing
- **Python** 3.10+ (for some utilities)
- **Docker Desktop** (optional, for containerized development)

## Installation

```bash
# Clone the repository
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS

# Install backend dependencies
npm ci

# Install frontend dependencies
cd client
npm ci
cd ..
```

### Running the Application

#### Backend API (Port 5001)
```bash
# In the root directory
npm start  # or node src/api/index.js
```

#### Frontend Client (Port 3000)
```bash
# In the client directory
cd client
npm start
```

Visit `http://localhost:3000` to access the web interface.

## Development

### Running Tests

```bash
# Run Jest tests
npm test

# Run golden video verification tests
npm run golden:check
```

### Project Structure

```
MOBIUS/
├── src/
│   ├── api/          # Express backend API
│   ├── services/     # Business logic services
│   └── utils/        # Utility functions
├── client/           # React frontend
├── scripts/          # Build and test scripts
│   ├── check_golden.js
│   └── generate_golden.js
├── tests/            # Test files and golden reference data
└── .github/
    └── workflows/    # CI/CD workflows
```

## Platform-Specific Setup

### Windows Users

For the best development experience on Windows, we recommend using **WSL2 (Windows Subsystem for Linux)** with Docker Desktop.

📖 **See [WINDOWS_SETUP.md](./WINDOWS_SETUP.md) for detailed Windows setup instructions**, including:
- WSL2 + Docker Desktop setup (recommended)
- Windows-native PowerShell alternative
- Troubleshooting common issues
- Performance optimization tips

### macOS Users

```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
nvm install 20.18.1
nvm use 20.18.1

# Install FFmpeg via Homebrew
brew install ffmpeg

# Install dependencies and run
npm ci
npm start
```

### Linux Users

```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
nvm install 20.18.1
nvm use 20.18.1

# Install FFmpeg
sudo apt-get update
sudo apt-get install -y ffmpeg

# Install dependencies and run
npm ci
npm start
```

## Environment Variables

Create a `.env` file in the root directory:

```env
# OpenAI API Key (required for AI features)
OPENAI_API_KEY=your_openai_api_key_here

# Image Extractor API Key (optional)
IMAGE_EXTRACTOR_API_KEY=your_image_extractor_key

# Server Port (default: 5001)
PORT=5001

# Output Directory (default: src/api/uploads/MobiusGames)
OUTPUT_DIR=./src/api/uploads/MobiusGames
```

## CI/CD

The project uses GitHub Actions for continuous integration:
- **Multi-platform testing** (Ubuntu, macOS, Windows)
- **Golden video verification** to ensure rendering consistency
- **Audio compliance checks** (EBU R128 loudness standards)
- **Automated artifact uploads**

See [.github/workflows/](./.github/workflows/) for workflow definitions.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/w9bikze8u4cbupc/MOBIUS/issues)
- **Documentation**: See `/docs` folder for detailed guides
- **Windows Setup**: See [WINDOWS_SETUP.md](./WINDOWS_SETUP.md)
