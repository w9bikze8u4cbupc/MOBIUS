# Contributing to MOBIUS

Thank you for your interest in contributing to MOBIUS! This document provides guidelines for contributing to the project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/MOBIUS.git
   cd MOBIUS
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/w9bikze8u4cbupc/MOBIUS.git
   ```
4. **Create a branch** for your feature:
   ```bash
   git checkout -b feature/my-new-feature
   ```

## Development Setup

### Prerequisites

- Node.js 20.14 or higher (20.18+ recommended)
- FFmpeg for video/audio processing
- Docker Desktop (optional, for containerized development)

### Setup Steps

```bash
# Install dependencies
npm ci
cd client && npm ci && cd ..

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Verify your setup
npm run verify-clean-genesis

# Start development servers
npm start  # Backend API (port 5001)
cd client && npm start  # Frontend (port 3000)
```

For detailed platform-specific instructions:
- **Windows**: See [WINDOWS_SETUP.md](./WINDOWS_SETUP.md)
- **Quick Start**: See [QUICKSTART.md](./QUICKSTART.md)

## Code Style

### JavaScript/Node.js

- Use ES6+ features (const/let, arrow functions, async/await)
- Use meaningful variable and function names
- Add comments for complex logic
- Follow existing code patterns in the project

### Code Formatting

```bash
# The project uses standard JavaScript conventions
# Follow the existing style in each file
```

### Commit Messages

Use clear, descriptive commit messages:

```
Add feature: Brief description of what was added

Detailed explanation of the change if needed.
Explains why the change was made and any implications.
```

Good commit message examples:
- `Add health check endpoint to API`
- `Fix: Correct CORS configuration for production`
- `Docs: Update Windows setup instructions`
- `Test: Add golden video verification tests`

## Testing

### Running Tests

```bash
# Run unit tests
npm test

# Run golden video verification
npm run golden:check

# Update golden reference files
npm run golden:approve

# Run verification script
npm run verify-clean-genesis
```

### Writing Tests

- Add tests for new features
- Ensure tests are independent and can run in any order
- Use descriptive test names
- Follow existing test patterns in the project

### Golden Video Testing

For video rendering changes:

1. Generate new video output
2. Update golden reference files:
   ```bash
   npm run golden:approve
   ```
3. Verify differences are expected
4. Commit both code and golden reference updates

## Pull Request Process

1. **Update your branch** with the latest upstream changes:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Test your changes** thoroughly:
   ```bash
   npm run verify-clean-genesis
   npm test
   ```

3. **Push to your fork**:
   ```bash
   git push origin feature/my-new-feature
   ```

4. **Create a Pull Request** on GitHub:
   - Provide a clear title and description
   - Reference any related issues
   - Explain what the PR does and why
   - Include screenshots for UI changes

5. **Address review feedback**:
   - Make requested changes
   - Push additional commits to your branch
   - Respond to comments

6. **Wait for CI checks** to pass:
   - All tests must pass
   - Code must work on all platforms (Linux, macOS, Windows)

## Project Structure

```
MOBIUS/
├── src/
│   ├── api/              # Express backend API
│   │   ├── index.js      # Main API server
│   │   └── prompts.js    # AI prompt templates
│   ├── services/         # Business logic services
│   └── utils/            # Utility functions
│
├── client/               # React frontend
│   ├── src/              # React components and logic
│   ├── public/           # Static assets
│   └── package.json      # Frontend dependencies
│
├── scripts/              # Build and automation scripts
│   ├── ci/               # CI/CD scripts
│   │   └── smoke-tests.sh  # API smoke tests
│   ├── check_golden.js   # Golden video verification
│   ├── generate_golden.js  # Generate golden references
│   └── verify-clean-genesis.js  # Environment verification
│
├── tests/                # Test files and fixtures
│   └── golden/           # Golden reference files
│
├── .github/
│   └── workflows/        # GitHub Actions CI/CD
│       ├── ci.yml        # Main CI workflow
│       ├── golden-approve.yml       # Golden update workflow
│       └── golden-preview-checks.yml  # Golden verification
│
├── Dockerfile.ci         # Docker image for CI/production
├── docker-compose.staging.yml  # Docker Compose configuration
├── .env.example          # Environment variable template
├── package.json          # Backend dependencies and scripts
└── README.md             # Project documentation
```

## Key Components

### Backend API (`src/api/`)

- **Express server** running on port 5001
- Handles BoardGameGeek metadata extraction
- AI-powered rulebook analysis
- Video script generation
- RESTful API endpoints

### Frontend Client (`client/`)

- **React application** running on port 3000
- User interface for game tutorial creation
- Real-time preview and editing
- Integrates with backend API

### Scripts (`scripts/`)

- **CI scripts**: Automated testing and deployment
- **Golden testing**: Video rendering verification
- **Verification**: Environment and dependency checks

## Development Workflow

### Adding a New Feature

1. Create a feature branch
2. Implement the feature with tests
3. Test locally on your platform
4. Create a pull request
5. Address review feedback
6. Wait for CI to pass on all platforms

### Fixing a Bug

1. Create a bug fix branch
2. Write a test that reproduces the bug
3. Fix the bug
4. Verify the test now passes
5. Create a pull request

### Updating Documentation

1. Make documentation changes
2. Verify links and formatting
3. Test any code examples
4. Create a pull request

## CI/CD Pipeline

The project uses GitHub Actions for continuous integration:

- **Multi-platform testing**: Ubuntu, macOS, Windows
- **Golden video verification**: Ensures rendering consistency
- **Audio compliance**: EBU R128 loudness standards
- **Automated artifact uploads**: Test results and generated videos

See [.github/workflows/](./.github/workflows/) for workflow definitions.

## Getting Help

- **Questions**: Open an issue with the "question" label
- **Bugs**: Open an issue with the "bug" label
- **Features**: Open an issue with the "enhancement" label
- **Security**: Email security concerns privately to the maintainers

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what is best for the project
- Show empathy towards other contributors

## License

By contributing to MOBIUS, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to MOBIUS! 🎲🎬
