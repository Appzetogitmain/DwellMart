#!/bin/bash
echo "🚀 Deploying DwellMart to dwellmart.in..."

# Navigate to project directory
cd ~/dwellmart || cd ~/DwellMart
git pull origin main

# FRONTEND
echo "📦 Building Frontend..."
cd frontend
npm install
npm run build
sudo mkdir -p /var/www/dwellmart
sudo rm -rf /var/www/dwellmart/*
sudo cp -r dist/* /var/www/dwellmart/

# BACKEND
echo "⚙️ Updating & Restarting Backend..."
cd ../backend
npm install
pm2 restart dwellmart-backend || pm2 start src/server.js --name dwellmart-backend
pm2 save

echo "✅ Deploy finished successfully!"
