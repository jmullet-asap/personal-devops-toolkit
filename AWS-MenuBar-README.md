# AWS Menu Bar App

A native macOS menu bar application that provides one-click access to AWS authentication and terminal launching for your development workflow.

## Features

**🎯 One-Click AWS Authentication**
- DTMI Production & Non-Production
- ASAP Fork (TRMI/TRIC) environments
- Integrates with your existing MCP aws-login tool

**🖥️ Smart Terminal Integration**
- Sign In Only: Just authenticate to AWS
- Open iTerm2: Authenticate + launch new terminal window
- Open iTerm2 + Hub: Authenticate + terminal + automatically run `hub` command

**⚡ Built Entirely from CLI**
- No Xcode required
- Pure Swift with command-line compilation
- Native macOS app bundle

## Quick Start

```bash
# Test the app (temporary)
./launch-aws-menubar.sh

# Install permanently to Applications folder
./install-aws-menubar.sh
```

## Usage

1. Click the "AWS" icon in your menu bar
2. Select your target environment (DTMI Prod, DTMI Non-Prod, ASAP Fork)
3. Choose your action:
   - **Sign In Only**: Authenticates and sets AWS_PROFILE
   - **Open iTerm2**: Authentication + new terminal window with AWS credentials
   - **Open iTerm2 + Hub**: Authentication + terminal + automatically launches `hub` command

## How It Works

- **Authentication**: Calls your existing `tools/aws-login.js` script
- **Terminal Launch**: Uses AppleScript to create new iTerm2 windows
- **Environment Setup**: Properly sets AWS_PROFILE and working directory
- **Notifications**: macOS notifications for success/failure feedback

## Files

- `AWSMenuBarApp.swift` - Main application source code
- `AWSMenuBar.app/` - Complete macOS app bundle
- `launch-aws-menubar.sh` - Development launcher
- `install-aws-menubar.sh` - Permanent installation script

## Development

```bash
# Recompile after changes
swiftc -o AWSMenuBar AWSMenuBarApp.swift
cp AWSMenuBar AWSMenuBar.app/Contents/MacOS/

# Test changes
./launch-aws-menubar.sh
```

## Uninstall

```bash
rm -rf /Applications/AWSMenuBar.app
```

## Technical Details

- **Language**: Swift
- **UI Framework**: AppKit (NSStatusBar, NSMenu)
- **Shell Integration**: Process class for command execution
- **AppleScript**: iTerm2 automation
- **Bundle Type**: LSUIElement (menu bar only, no dock icon)
- **Compilation**: Command-line with `swiftc` (no Xcode required)