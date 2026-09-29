#!/bin/bash
set -e

echo "🚀 Deploying DwellMart to dwellmart.in..."

# 1. Navigate to project root directory
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$PROJECT_DIR" || cd /var/www/DwellMart || cd ~/dwellmart

echo "📥 Pulling latest changes from main..."
git fetch origin main
git reset --hard origin/main

# Re-read PROJECT_DIR after git reset
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$PROJECT_DIR"

# 2. FRONTEND BUILD
echo "📦 Building Frontend..."
cd "$PROJECT_DIR/frontend"
npm install --silent

# Increase Node memory limit for Vite bundling
export NODE_OPTIONS="--max-old-space-size=2048"
npm run build

if [ -f "dist/index.html" ]; then
    echo "🚚 Deploying Frontend files to /var/www/dwellmart..."
    sudo mkdir -p /var/www/dwellmart
    sudo rm -rf /var/www/dwellmart/*
    sudo cp -r dist/* /var/www/dwellmart/
    sudo chown -R www-data:www-data /var/www/dwellmart
    sudo chmod -R 755 /var/www/dwellmart
else
    echo "❌ Frontend build failed! dist/index.html not found. Aborting to protect live site."
    exit 1
fi

# 3. BACKEND RESTART
echo "⚙️ Updating & Restarting Backend..."
cd "$PROJECT_DIR/backend"
npm install --silent
pm2 restart dwellmart-backend || pm2 start src/server.js --name dwellmart-backend
pm2 save

# 4. STORAGE PERMISSIONS SAFETY NET
echo "🔒 Verifying storage permissions..."
if [ -d "/var/storage" ]; then
    sudo chown -R ubuntu:www-data /var/storage
    sudo chmod -R 775 /var/storage
    sudo chmod -R g+s /var/storage
fi

# 5. NGINX CONFIGURATION & RELOAD
echo "🌐 Updating Nginx Configuration..."
sudo cp "$PROJECT_DIR/nginx/dwellmart.conf" /etc/nginx/sites-available/dwellmart.conf
sudo ln -sf /etc/nginx/sites-available/dwellmart.conf /etc/nginx/sites-enabled/dwellmart.conf
sudo nginx -t && sudo systemctl reload nginx

echo "✅ Deploy finished successfully!"
