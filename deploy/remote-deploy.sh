#!/usr/bin/env bash
# Runs on the EC2 host (Amazon Linux 2023) as ec2-user. Usage:
#   PUBLIC_ORIGIN=http://<ip>:3000 bash remote-deploy.sh <release-id> <bundle.tar.gz>
# Optional: WEB_PORT (default 3000), BASIC_AUTH_USER / BASIC_AUTH_PASSWORD.
set -euo pipefail
RELEASE_ID=${1:?release id required}
BUNDLE=${2:?bundle path required}
BASE=/opt/ajin-on
SHARED=$BASE/shared
RELEASE=$BASE/releases/$RELEASE_ID
COMPOSE_VERSION=v2.35.1
: "${PUBLIC_ORIGIN:?PUBLIC_ORIGIN is required}"
WEB_PORT=${WEB_PORT:-3000}

log(){ printf '\n==> %s\n' "$*"; }

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker"
  sudo dnf install -y docker
fi
sudo systemctl enable --now docker
if ! sudo docker compose version >/dev/null 2>&1; then
  log "Installing Docker Compose $COMPOSE_VERSION"
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
    "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-x86_64"
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# t3.small has 2 GiB RAM; a swap file keeps PostgreSQL + JVM from being OOM-killed.
if ! sudo swapon --show | grep -q /swapfile; then
  log "Creating 2 GiB swap"
  [ -f /swapfile ] || { sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; sudo chmod 600 /swapfile; sudo mkswap /swapfile >/dev/null; }
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

log "Preparing $RELEASE"
sudo mkdir -p "$SHARED/storage" "$BASE/releases"
sudo chown "$(id -u):$(id -g)" "$BASE" "$BASE/releases" "$SHARED"
sudo chown 10001:10001 "$SHARED/storage"
rm -rf "$RELEASE"; mkdir -p "$RELEASE"
tar -xzf "$BUNDLE" -C "$RELEASE"
rm -f "$BUNDLE"

# Server-only secrets: generated once, never stored in Git.
ENV_FILE=$SHARED/.env
if [ ! -f "$ENV_FILE" ]; then
  log "Generating database password"
  umask 077
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > "$ENV_FILE"
fi
grep -v -E '^(PUBLIC_ORIGIN|WEB_PORT|AJIN_SHARED)=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
printf 'PUBLIC_ORIGIN=%s\nWEB_PORT=%s\nAJIN_SHARED=%s\n' "$PUBLIC_ORIGIN" "$WEB_PORT" "$SHARED" >> "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"; chmod 600 "$ENV_FILE"

if [ -n "${BASIC_AUTH_USER:-}" ] && [ -n "${BASIC_AUTH_PASSWORD:-}" ]; then
  log "Enabling HTTP Basic auth for $BASIC_AUTH_USER"
  printf '%s:%s\n' "$BASIC_AUTH_USER" "$(openssl passwd -apr1 "$BASIC_AUTH_PASSWORD")" > "$SHARED/htpasswd"
  printf 'auth_basic "AJIN ON";\nauth_basic_user_file /etc/nginx/htpasswd;\n' > "$SHARED/nginx-auth.conf"
else
  : > "$SHARED/htpasswd"; : > "$SHARED/nginx-auth.conf"
fi
chmod 644 "$SHARED/htpasswd" "$SHARED/nginx-auth.conf"

COMPOSE=(sudo docker compose --env-file "$ENV_FILE" -f "$RELEASE/compose.yaml")
log "Starting containers"
"${COMPOSE[@]}" pull --quiet
"${COMPOSE[@]}" up -d --remove-orphans --force-recreate
ln -sfn "$RELEASE" "$BASE/current"

log "Waiting for health"
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:$WEB_PORT/actuator/health" 2>/dev/null | grep -q '"UP"'; then
    "${COMPOSE[@]}" ps
    ls -1dt "$BASE"/releases/* | tail -n +4 | xargs -r rm -rf
    log "AJIN ON is up: $PUBLIC_ORIGIN"
    exit 0
  fi
  sleep 2
done
"${COMPOSE[@]}" ps
"${COMPOSE[@]}" logs --tail 120 api web
echo "Health check failed" >&2
exit 1
