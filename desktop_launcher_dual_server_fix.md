# Desktop Launcher Dual Server Fix

## Issues Resolved
1. **Syntax errors**: French error messages about dashes not being recognized as commands
2. **Connection refused**: Browser was trying to connect to port 3000 but only API server on port 5001 was running
3. **Missing UI server**: The UI development server (Vite) wasn't being started

## Root Cause
The Mobius Tutorial Generator requires two separate services:
- **API Server**: Node.js server running on port 5001 (`npm run server`)
- **UI Development Server**: Vite development server running on port 3000 (`npm run ui`)

The launcher was only starting the API server, causing the browser to show a "Connection Refused" error when trying to access the UI.

## Solution Implemented

### Dual Server Startup
- ✅ Start both API server (port 5001) and UI server (port 3000)
- ✅ Use proper syntax without problematic dashes
- ✅ Provide clear instructions for stopping both servers
- ✅ Extended wait time to ensure both servers initialize properly

### Syntax Fixes
- ✅ Replaced dashes with asterisks in echo statements to avoid Windows batch parsing issues
- ✅ Ensured all commands use proper Windows batch syntax

### Enhanced User Guidance
- ✅ Clear instructions for stopping both servers
- ✅ Better error troubleshooting information
- ✅ Extended wait time for proper server initialization

## Files Modified

1. ✅ [scripts/launch-mobius.bat](scripts/launch-mobius.bat) - Updated to start both servers
2. ✅ Desktop shortcut recreated with updated target

## Verification

The enhanced launcher has been tested and confirmed to:
- ✅ Properly detect if Node.js is installed
- ✅ Start both API and UI servers in the background
- ✅ Wait for proper initialization of both services
- ✅ Open the browser to http://localhost:3000
- ✅ Display clear messages and prompts without syntax errors
- ✅ Not crash during execution

## Usage

Simply double-click the "Mobius Tutorial Generator" shortcut on your desktop. The launcher will:
1. Check if Node.js is installed
2. Start the API server on port 5001 in a minimized terminal window
3. Start the UI development server on port 3000 in a minimized terminal window
4. Wait 10 seconds total for both servers to initialize
5. Open your browser to http://localhost:3000
6. Display clear instructions and wait for you to press a key

## Server Management

- **To stop the servers**:
  - Close the terminal window titled "Mobius Server" (API server)
  - Close the terminal window titled "Mobius UI Server" (UI development server)

## Benefits of Dual Server Approach

1. **Complete Functionality**: Both backend API and frontend UI are available
2. **Development Environment**: Uses the same development setup as during development
3. **Hot Reloading**: UI changes are automatically reflected without restart
4. **Proper Architecture**: Follows the intended application architecture

## Related Documentation
- [DESKTOP_LAUNCHER_SIMPLIFICATION.md](DESKTOP_LAUNCHER_SIMPLIFICATION.md) - Previous simplification
- [DESKTOP_LAUNCHER_FIX.md](DESKTOP_LAUNCHER_FIX.md) - Previous fix attempt
- [DESKTOP_LAUNCHER_ENHANCEMENT.md](DESKTOP_LAUNCHER_ENHANCEMENT.md) - Previous enhancement