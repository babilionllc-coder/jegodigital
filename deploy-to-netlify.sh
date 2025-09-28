#!/bin/bash

# JegoDigital Dashboard - Auto Deployment Script
# This script will help you deploy to Netlify automatically

echo "🚀 JegoDigital Dashboard - Auto Deployment Script"
echo "================================================="
echo ""

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "📦 Installing Netlify CLI..."
    npm install -g netlify-cli
    echo "✅ Netlify CLI installed!"
else
    echo "✅ Netlify CLI already installed!"
fi

echo ""
echo "🔐 Please login to Netlify:"
netlify login

echo ""
echo "🚀 Deploying dashboard to Netlify..."
netlify deploy --prod --dir . --open

echo ""
echo "🎉 Dashboard deployed successfully!"
echo "📱 Your dashboard is now live!"
echo ""
echo "🌐 Next steps:"
echo "   1. Add custom domain in Netlify dashboard"
echo "   2. Point jegodigital.com to Netlify"
echo "   3. Access dashboard at: https://jegodigital.com/agents"
echo ""
echo "✅ Done! 🚀"
