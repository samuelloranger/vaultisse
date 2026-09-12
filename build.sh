#!/usr/bin/env bash
set -e

# --- Paths ---
ROOT_DIR="$(pwd)"
DIST_DIR="$ROOT_DIR/dist"

# --- Clean old dist ---
echo "Cleaning old dist folder..."
rm -rf "$DIST_DIR"
mkdir "$DIST_DIR"

# --- Build CLIENT ---
echo ""
echo ""
echo ""
echo "============================================="
echo "Building client..."
cd "$ROOT_DIR/client-react"
bun install --frozen-lockfile
bun run build

# Move client build to root/dist/client
mv "$ROOT_DIR/client-react/dist" "$DIST_DIR/client"

# --- Build SERVER ---
echo ""
echo ""
echo ""
echo "============================================="
echo "Building server..."
cd "$ROOT_DIR/server"
bun install --frozen-lockfile

# No compile step: Bun executes TypeScript directly, so the sources ship as
# they are. server/src sits at the same depth server/dist did, which keeps
# every __dirname lookup resolving the same way - including the assets
# directory, which no longer needs copying alongside the output.
mkdir "$DIST_DIR/server"
cp -r "$ROOT_DIR/server/src" "$DIST_DIR/server/src"
cp "$ROOT_DIR/server/package.json" "$DIST_DIR/server/"
cp "$ROOT_DIR/server/tsconfig.json" "$DIST_DIR/server/"
cp "$ROOT_DIR/server/bun.lock" "$DIST_DIR/server/" || true

# (Optional) copy .env if you need it
# cp "$ROOT_DIR/server/.env" "$DIST_DIR/server/" || true

# Install server dependencies in dist
echo "Installing server dependencies in dist..."
cd "$DIST_DIR/server"
bun install --frozen-lockfile --production

echo ""
echo ""
echo ""
echo ""
echo ""
echo "============================================="

# --- Create zip of the dist folder ---
ZIP_FILE="$ROOT_DIR/dist.zip"
echo "Creating zip file $ZIP_FILE..."
cd "$ROOT_DIR"
zip -r "$ZIP_FILE" dist

echo "Zip file created successfully!"


echo "Build complete! Final structure:"
