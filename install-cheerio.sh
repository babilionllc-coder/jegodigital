#!/bin/bash

# Install Cheerio Package Script
echo "🔧 Installing cheerio package..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Make sure you're in the correct directory."
    exit 1
fi

# Install cheerio
echo "📦 Installing cheerio..."
npm install cheerio@1.0.0-rc.12

# Check if installation was successful
if [ $? -eq 0 ]; then
    echo "✅ Cheerio installed successfully!"
    echo "🚀 Ready to run REAL AI analysis system!"
    echo ""
    echo "Next steps:"
    echo "1. Run: node REAL-AI-LEAD-SYSTEM.js"
    echo "2. Continue with: node REAL-AI-LEAD-SYSTEM.js next"
else
    echo "❌ Installation failed. Please check npm and try again."
    exit 1
fi


