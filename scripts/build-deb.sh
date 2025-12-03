#!/bin/bash

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔨 Building .deb package for obision-extension-dash${NC}"

# Get version from metadata.json
VERSION=$(jq -r .version metadata.json)
EXTENSION_UUID="obision-extension-dash@obision.com"
PACKAGE_NAME="gnome-shell-extension-obision-dash"
OUTPUT_DIR="builddir"
DEB_FILE="${OUTPUT_DIR}/obision-extension-dash.deb"
BUILD_DIR="deb-build"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Clean build directory
if [ -d "$BUILD_DIR" ]; then
    echo -e "${BLUE}Cleaning build directory${NC}"
    rm -rf "$BUILD_DIR"
fi

# Create directory structure
echo -e "${BLUE}Creating directory structure${NC}"
mkdir -p "$BUILD_DIR/DEBIAN"
mkdir -p "$BUILD_DIR/usr/share/gnome-shell/extensions/$EXTENSION_UUID"

# Build the extension
echo -e "${BLUE}Building extension${NC}"
npm run build

# Extract extension files
echo -e "${BLUE}Extracting extension files${NC}"
unzip -q "${OUTPUT_DIR}/${EXTENSION_UUID}.shell-extension.zip" -d "$BUILD_DIR/usr/share/gnome-shell/extensions/$EXTENSION_UUID/"

# Create DEBIAN/control file
echo -e "${BLUE}Creating control file${NC}"
cat > "$BUILD_DIR/DEBIAN/control" <<EOF
Package: ${PACKAGE_NAME}
Version: ${VERSION}
Section: gnome
Priority: optional
Architecture: all
Depends: gnome-shell (>= 45)
Maintainer: Jose Francisco Gonzalez <jfgs1609@gmail.com>
Description: Obision GNOME Shell Dash Extension
 A customizable dash/taskbar extension for GNOME Shell with
 advanced features including Show Desktop button, panel separator,
 and extensive customization options.
EOF

# Build the .deb package
echo -e "${BLUE}Building .deb package${NC}"
dpkg-deb --build "$BUILD_DIR" "$DEB_FILE"

# Clean up build directory
echo -e "${BLUE}Cleaning up${NC}"
rm -rf "$BUILD_DIR"

# Show result
if [ -f "$DEB_FILE" ]; then
    SIZE=$(du -h "$DEB_FILE" | cut -f1)
    echo -e "${GREEN}✓ Package created successfully!${NC}"
    echo -e "${GREEN}  File: $DEB_FILE${NC}"
    echo -e "${GREEN}  Size: $SIZE${NC}"
    echo ""
    echo -e "To install: ${BLUE}sudo dpkg -i $DEB_FILE${NC}"
else
    echo -e "${RED}✗ Failed to create package${NC}"
    exit 1
fi
