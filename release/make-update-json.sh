#!/usr/bin/env bash
# UmayTerm güncelleme manifest üretici.
# Kullanım: VERSION=0.20.0 NOTES="Açıklama" ./release/make-update-json.sh
# Ön koşul: npm run tauri build (imzalı) çalıştırılmış olmalı.
set -euo pipefail

VERSION="${VERSION:?VERSION değişkeni gerekli (örn. 0.20.0)}"
NOTES="${NOTES:-UmayTerm güncellemesi}"
BASE_URL="${BASE_URL:-https://updates.umayterm.app}"
KEY="${KEY:-/home/opade/.tauri/umayterm.key}"
KEY_PASS="${KEY_PASS:-umayterm-sign-key}"

APP_IMG="src-tauri/target/release/bundle/appimage/UmayTerm_${VERSION}_amd64.AppImage"
DEB="src-tauri/target/release/bundle/deb/UmayTerm_${VERSION}_amd64.deb"

SIG_APP=$(npx tauri signer sign -f "$KEY" -p "$KEY_PASS" "$APP_IMG" 2>/dev/null)
SIG_DEB=$(npx tauri signer sign -f "$KEY" -p "$KEY_PASS" "$DEB" 2>/dev/null)

PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

python3 - "$VERSION" "$NOTES" "$PUB_DATE" "$BASE_URL" "$SIG_APP" "$SIG_DEB" <<'EOF'
import json, sys
version, notes, pub_date, base, sig_app, sig_deb = sys.argv[1:7]
manifest = {
  "version": version,
  "notes": notes,
  "pub_date": pub_date,
  "platforms": {
    "linux-x86_64": {
      "signature": sig_app,
      "url": f"{base}/UmayTerm_{version}_amd64.AppImage"
    },
    "linux-x86_64-deb": {
      "signature": sig_deb,
      "url": f"{base}/UmayTerm_{version}_amd64.deb"
    }
  }
}
with open("release/update.json", "w") as f:
    json.dump(manifest, f, indent=2)
print("release/update.json yazıldı")
EOF