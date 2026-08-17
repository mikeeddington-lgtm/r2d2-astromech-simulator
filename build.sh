#!/bin/bash
# Regenerates dev.html and R2D2-Simulator.html from src/manifest.json, and
# pca-studio/PCA-Studio.html from pca-studio/manifest.json.
# You only need this after adding, removing or reordering a module, or after
# editing the markup — editing an existing module just needs a browser refresh
# on dev.html.
set -e
cd "$(dirname "$0")"
node tools/build.js
node tools/build-studio.js
