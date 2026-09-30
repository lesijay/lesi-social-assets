#!/usr/bin/env bash
set -euo pipefail
mkdir -p public
cp index.html public/index.html

# Preserve the previously hosted PB-C001 asset from the current live site.
curl -L --fail 'https://lesi-social-assets.netlify.app/pb-c001.png' -o public/pb-c001.png

# PB-C004 — permanent publishing asset source for this deploy.
curl -L --fail 'https://temp.4d4f16c61d89ec64e760039c4ec50717.r2.cloudflarestorage.com/1591912/googledrive/GOOGLEDRIVE_DOWNLOAD_FILE/response/f0b25ab399b47ed9e586fb66188b8ba7?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=7685aa30fee07632b83ea58979a398d0%2F20260930%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260930T171244Z&X-Amz-Expires=3600&X-Amz-Signature=c6125d7506bb8662cbc47d1e86ace085e6d24d7e5c8bfaf654a77618b54df3c8&X-Amz-SignedHeaders=host' -o public/pb-c004.jpg
