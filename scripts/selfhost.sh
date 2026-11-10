#!/bin/bash
# FitTrack Pro auf dem Mac betreiben (statt Vercel): Next.js läuft unter launchd, Tailscale Funnel macht es
# von Handy und Mac aus unter einer festen https-Adresse erreichbar. Die Datenbank bleibt in Neon.
#
#   scripts/selfhost.sh install   bauen, Datenbank-Schema angleichen, als Dienst einrichten, Funnel auf Port 443
#   scripts/selfhost.sh update    git pull, bauen, Schema angleichen, Dienst neu starten
#   scripts/selfhost.sh status    läuft der Dienst, antwortet er, was zeigt der Funnel
#   scripts/selfhost.sh stop      Dienst und Funnel abschalten
#   scripts/selfhost.sh log       letzte Zeilen des Logs
#
# Voraussetzung: .env im Projektordner mit DATABASE_URL, DIRECT_DATABASE_URL, AUTH_SECRET, AUTH_URL (die öffentliche
# Adresse, z. B. https://<mac>.<tailnet>.ts.net), AUTH_TRUST_HOST=true, NEXT_PUBLIC_APP_URL; dazu die Schlüssel, die
# auch bei Vercel stehen (z. B. GOOGLE_GENERATIVE_AI_API_KEY). Gleicher AUTH_SECRET wie bei Vercel = Anmeldungen bleiben gültig.

set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${FITTRACK_PORT:-3005}"
LABEL="com.fittrack.web"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/fittrack.log"
DOMAIN="gui/$(id -u)"
TS=""
for c in /Applications/Tailscale.app/Contents/MacOS/Tailscale "$(command -v tailscale 2>/dev/null)"; do
  [[ -n "$c" && -x "$c" ]] && TS="$c" && break
done

die() { echo "✗ $*" >&2; exit 1; }
need_env() {
  [[ -f "$DIR/.env" ]] || die ".env fehlt in $DIR"
  for k in DATABASE_URL AUTH_SECRET AUTH_URL; do
    grep -Eq "^$k=.+" "$DIR/.env" || die "$k fehlt oder ist leer in $DIR/.env"
  done
  grep -Eq '^AUTH_TRUST_HOST=' "$DIR/.env" || echo "ℹ︎ Tipp: AUTH_TRUST_HOST=true in die .env (Anmeldung hinter dem Funnel)."
}
build() {
  cd "$DIR" || exit 1
  npm install --no-audit --no-fund || die "npm install fehlgeschlagen"
  node scripts/db-sync-on-build.mjs || die "Datenbank-Schema konnte nicht angeglichen werden"
  npm run build || die "Build fehlgeschlagen"
}
write_plist() {
  local node_bin; node_bin="$(command -v node)" || die "node nicht gefunden"
  mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$node_bin</string><string>$DIR/node_modules/next/dist/bin/next</string>
    <string>start</string><string>--hostname</string><string>0.0.0.0</string><string>--port</string><string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string><key>NODE_ENV</key><string>production</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string><key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
}
load() { launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null; launchctl bootstrap "$DOMAIN" "$PLIST" || die "launchctl bootstrap fehlgeschlagen"; }
funnel_on() {
  [[ -n "$TS" ]] || die "Tailscale nicht gefunden"
  # Port 443 war bisher „serve“ (nur im Tailnet) für Nexus; Nexus ist unter :10000 per Funnel erreichbar.
  "$TS" serve --https=443 off >/dev/null 2>&1
  "$TS" funnel --bg --https=443 "$PORT" || die "tailscale funnel fehlgeschlagen (Funnel in Tailscale freigeschaltet?)"
}
health() { curl -s -o /dev/null -m 8 -w "%{http_code}" "http://127.0.0.1:$PORT/"; }

case "${1:-}" in
  install)
    need_env; build; write_plist; load
    sleep 4; echo "Lokal: HTTP $(health)"
    funnel_on
    "$TS" funnel status
    echo "✓ FitTrack läuft auf Port $PORT und ist über den Funnel erreichbar. Log: $LOG" ;;
  update)
    cd "$DIR" || exit 1
    git pull || die "git pull fehlgeschlagen"
    need_env; build
    launchctl kickstart -k "$DOMAIN/$LABEL" || { write_plist; load; }
    sleep 4; echo "Lokal: HTTP $(health)" ;;
  status)
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E "state|pid|last exit" || echo "Dienst nicht geladen"
    echo "Lokal: HTTP $(health)"
    [[ -n "$TS" ]] && "$TS" funnel status ;;
  stop)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null; [[ -n "$TS" ]] && "$TS" funnel --https=443 off
    echo "✓ abgeschaltet" ;;
  log) tail -n 40 "$LOG" ;;
  *) sed -n '2,13p' "$0" ;;
esac
