#!/bin/bash

echo "🚀 Installing AWS Menu Bar App..."

# Kill any existing instances
pkill -f AWSMenuBar 2>/dev/null

# Copy app to Applications folder
echo "📱 Copying app to Applications folder..."
cp -R AWSMenuBar.app /Applications/

# Make sure the binary is executable
chmod +x /Applications/AWSMenuBar.app/Contents/MacOS/AWSMenuBar

echo "✅ Installation complete!"
echo ""
echo "🎯 To use the app:"
echo "   1. Open Spotlight (Cmd+Space)"
echo "   2. Type 'AWS Menu Bar' and press Enter"
echo "   3. Or launch from Applications folder"
echo "   4. Look for 'AWS' in your menu bar"
echo ""
echo "🔧 To uninstall: rm -rf /Applications/AWSMenuBar.app"
echo ""
echo "💡 The app provides 3 options for each AWS environment:"
echo "   • Sign In Only - Just authenticate"
echo "   • Open iTerm2 - Authenticate + open terminal"
echo "   • Open iTerm2 + Hub - Authenticate + terminal + hub command"