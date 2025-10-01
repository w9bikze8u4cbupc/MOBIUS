# MOBIUS - Game Tutorial Video Generator

A pipeline for generating game tutorial videos from structured game rules.

## Quick Start

### For Windows Users (Recommended: WSL2)

The fastest way to get started on Windows is using our one-command WSL2 bootstrap:

```bash
# From WSL
curl -fsSL https://raw.githubusercontent.com/w9bikze8u4cbupc/MOBIUS/main/scripts/run_mobius_wsl.sh -o ~/run_mobius_wsl.sh
chmod +x ~/run_mobius_wsl.sh
~/run_mobius_wsl.sh
```

Or from PowerShell:
```powershell
.\scripts\run_mobius_from_ps.ps1
```

See [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md) for detailed setup instructions and troubleshooting.

### For macOS/Linux Users

1. Install Node.js 20.18.1 (recommended: use [nvm](https://github.com/nvm-sh/nvm))
2. Install ffmpeg: `brew install ffmpeg` (macOS) or `sudo apt-get install ffmpeg` (Linux)
3. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
   cd MOBIUS
   npm ci
   ```

## Documentation

- [Windows Setup Guide](docs/WINDOWS_SETUP.md) - Complete WSL2 setup for Windows
- [Windows Setup Checklist](docs/WINDOWS_SETUP_CHECKLIST.md) - Interactive setup checklist
- [Contributing Guide](CONTRIBUTING.md) - Development workflow and guidelines

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, workflow, and guidelines.

## License

MIT
