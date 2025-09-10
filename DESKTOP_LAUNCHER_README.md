# Mobius Games Tutorial Generator - Desktop Launcher

This package includes improved scripts to easily launch the Mobius Games Tutorial Generator application without using the command line.

## Files Included

1. **launch-app.bat** - Windows batch file that can be double-clicked to launch the application
2. **launch-app.ps1** - PowerShell script that provides a more detailed launch experience
3. **create-desktop-shortcut.ps1** - Script to create a desktop shortcut for easy access
4. **stop-servers.bat** - Windows batch file to stop the running servers
5. **stop-servers.ps1** - PowerShell script to stop the running servers

## How to Use

### Option 1: Double-click Launch (Easiest)
1. Simply double-click on `launch-app.bat`
2. The script will automatically check for dependencies and install them if needed
3. The application will start and be available at http://localhost:3000
4. Your browser will automatically open to the application when it's ready
5. The server console will be minimized to reduce visual clutter

### Option 2: Desktop Shortcut
1. Right-click on `create-desktop-shortcut.ps1`
2. Select "Run with PowerShell"
3. A shortcut will be created on your desktop
4. Double-click the shortcut to launch the application

### Option 3: PowerShell Script
1. Right-click on `launch-app.ps1`
2. Select "Run with PowerShell"
3. The application will start and be available at http://localhost:3000
4. Your browser will automatically open to the application when it's ready
5. The server console will be minimized to reduce visual clutter

## Default Landing Page

The application now defaults to the **Classic Builder** interface rather than the A→Z Tutorial Generator. You can switch between interfaces using the tabs at the top of the application.

## Stopping the Application

When you're done using the application, you can stop the servers using:

### Option 1: Using Task Manager
- Simply close the command window where the application is running

### Option 2: Stop Scripts
1. Double-click on `stop-servers.bat` to stop the servers
2. Or right-click on `stop-servers.ps1` and select "Run with PowerShell"

## Requirements
- Node.js (version 18 or higher)
- npm (comes with Node.js)

## First-time Setup
On first run, the scripts will automatically:
1. Check for required dependencies
2. Install server dependencies (if not already installed)
3. Install client dependencies (if not already installed)
4. Start both the backend and frontend servers
5. Open your browser when the application is ready

## Troubleshooting
If you encounter any issues:
1. Make sure all requirements are installed
2. Check that Node.js and npm are added to your system PATH
3. Run the scripts as Administrator if you encounter permission issues
4. Check the console output for specific error messages

## Manual Launch (Alternative)
If you prefer to launch manually, you can still use the traditional method:
```
npm run dev
```

This will start both the backend (port 5001) and frontend (port 3000) servers.