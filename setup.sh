#!/bin/bash
# Focus App — One-command setup
# Generates SSL certs, creates .env, installs systemd service

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ⚡ Focus App Setup"
echo "  ==================="
echo ""

# 1. Create directories
mkdir -p data audio certs

# 2. Generate self-signed SSL cert (required for mic on iOS)
if [ ! -f certs/server.key ]; then
  echo "  🔐 Generating self-signed SSL certificate (10-year validity)..."
  IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
  openssl req -x509 -newkey rsa:2048 -keyout certs/server.key -out certs/server.crt \
    -days 3650 -nodes -subj "/CN=focus-app" \
    -addext "subjectAltName=IP:${IP},IP:127.0.0.1,DNS:localhost" 2>/dev/null
  echo "  ✅ Certificate generated at certs/server.{key,crt}"
  echo ""
  echo "  📱 To trust on iPad:"
  echo "     1. Open https://${IP}:3142 in Safari"
  echo "     2. Tap 'Advanced' → 'Visit this website'"
  echo "     3. Go to Settings → General → About → Certificate Trust Settings"
  echo "     4. Enable trust for 'focus-app'"
  echo ""
else
  echo "  ✅ SSL certificate already exists"
fi

# 3. Create .env from example if not exists
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "  📝 Created .env from .env.example"
    echo "     Edit .env to add your API keys (optional)"
  fi
else
  echo "  ✅ .env already exists"
fi

# 4. Create silence.mp3 for iOS audio blessing
if [ ! -f audio/silence.mp3 ]; then
  # Generate 0.1s of silence as mp3 (base64-encoded minimal mp3)
  echo "//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVV" | base64 -d > audio/silence.mp3 2>/dev/null || true
  echo "  ✅ Created silence.mp3 for iOS audio"
fi

# 5. Systemd service (optional)
echo ""
read -p "  Install as systemd service (auto-start on boot)? [y/N] " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  SERVICE_FILE="/etc/systemd/system/focus-app.service"
  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Focus App (HTTP + WebSocket)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$(which node) server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable focus-app
  sudo systemctl restart focus-app
  echo "  ✅ Installed and started focus-app.service"
  echo "  📋 Commands: sudo systemctl {start|stop|restart|status} focus-app"
else
  echo "  ⏭  Skipped systemd install"
  echo "  Run manually: node server.js"
fi

# 6. Summary
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo ""
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup complete!"
echo ""
echo "  HTTP:  http://${IP}:3141"
echo "  HTTPS: https://${IP}:3142  (for tablet mic access)"
echo ""
echo "  Next steps:"
echo "  1. Edit config.json with your schedule"
echo "  2. Edit .env with API keys (optional, for voice)"
echo "  3. Open https://${IP}:3142 on your tablet"
echo "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
