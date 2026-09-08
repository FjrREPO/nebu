#!/usr/bin/env bash
# Points a domain at the nebu agent marketplace running on 127.0.0.1:3031.
#
#   ./point-domain.sh nebu.ifajar.dev      # reuse the existing vhost + cert
#   ./point-domain.sh agents.ifajar.dev    # new vhost, issues a cert
#
# Needs sudo for the nginx write and reload; nothing else here does.
set -euo pipefail
DOMAIN="${1:?usage: point-domain.sh <domain>}"
PORT=3031
IP=103.150.190.91
VHOST="/etc/nginx/sites-enabled/$DOMAIN"

got=$(dig +short A "$DOMAIN" @1.1.1.1 | tail -1)
[ "$got" = "$IP" ] || { echo "NOT-READY $DOMAIN -> ${got:-none} (need $IP)"; exit 2; }

if [ -f "$VHOST" ]; then
  # Already served here: just move the upstream port, keeping the cert as is.
  sudo cp "$VHOST" "$VHOST.bak.$(date +%s)"
  sudo sed -i -E "s#proxy_pass http://127\.0\.0\.1:[0-9]+#proxy_pass http://127.0.0.1:$PORT#" "$VHOST"
  echo "repointed $DOMAIN -> :$PORT (backup kept alongside)"
else
  sudo tee "$VHOST" >/dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /home/cuyvps/le/webroot; }
    location / { return 301 https://\$host\$request_uri; }
}
NGINX
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot --nginx --non-interactive --agree-tos --redirect --keep-until-expiring -d "$DOMAIN"
  sudo sed -i -E "s#(location / \{)#\1\n        proxy_pass http://127.0.0.1:$PORT;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade \$http_upgrade;\n        proxy_set_header Connection \"upgrade\";\n        proxy_set_header Host \$host;\n        proxy_set_header X-Forwarded-Proto \$scheme;#" "$VHOST"
  echo "created $DOMAIN -> :$PORT"
fi

sudo nginx -t && sudo systemctl reload nginx
curl -s -o /dev/null -w "%{http_code}\n" "https://$DOMAIN/agents"
