#!/usr/bin/env bash
set -euo pipefail
mkdir -p public
cp index.html public/index.html

# Preserve already-hosted permanent social assets from the current live site.
curl -L --fail 'https://lesi-social-assets.netlify.app/pb-c001.png' -o public/pb-c001.png
curl -L --fail 'https://lesi-social-assets.netlify.app/pb-c004.jpg' -o public/pb-c004.jpg
