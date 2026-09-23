#!/usr/bin/env bash
set -euo pipefail
mkdir -p public
cp index.html public/index.html
curl -L --fail 'https://sdmntprsouthcentralus.oaiusercontent.com/files/00000000-5d90-81f7-b9f6-ca90eb86b479/raw?se=2026-09-23T14%3A24%3A43Z&sp=r&sv=2026-02-06&sr=b&scid=763d0686-02e4-5a57-9303-730d1eadc20a&skoid=697a5987-0cd9-4222-b5b8-500b90fa271b&sktid=a48cca56-e6da-484e-a814-9c849652bcb3&skt=2026-09-23T05%3A14%3A02Z&ske=2026-09-24T05%3A14%3A02Z&sks=b&skv=2026-02-06&sig=pCVQxRVNOmMoOD%2BVEQM44en7m9Pan/96uToKlbBmMsM%3D' -o public/pb-c001.png
