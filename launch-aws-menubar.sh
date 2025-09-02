#!/bin/bash

# Kill any existing instances
pkill -f AWSMenuBar

# Launch the app
open AWSMenuBar.app

echo "AWS Menu Bar app launched!"
echo "Look for 'AWS' in your menu bar."