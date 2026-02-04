#!/bin/bash

# Start server and test voucher system
echo "🚀 Starting AJC PisoWiFi with Voucher System..."

# Kill any existing processes
pkill -f "node server.js" 2>/dev/null || true

# Start server in background
echo "Starting server on port 3000..."
PORT=3000 node server.js &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start..."
sleep 5

# Test the API
echo "Testing voucher API..."
node test-voucher-api.js

echo ""
echo "🌍 Server is running at: http://localhost:3000"
echo "📊 Admin panel: http://localhost:3000 → Admin Login → Vouchers"
echo "🎫 Test vouchers available: AJC12345, AJC67890, AJCTEST1"
echo ""
echo "Press Ctrl+C to stop the server"

# Wait for user to stop
wait $SERVER_PID