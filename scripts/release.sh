#!/bin/bash

# Script to create a new release: bump version, commit, tag, and push

set -e  # Exit on error

# Get current version from metadata.json
CURRENT_VERSION=$(jq -r '.version' metadata.json)

# Ask for new version
echo "🚀 Creating new release"
echo "Current version: $CURRENT_VERSION"
echo ""
read -p "Enter new version number: " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo "❌ Error: Version number cannot be empty"
    exit 1
fi

echo ""
echo "📝 Updating version to: $NEW_VERSION"
echo ""

# Update metadata.json
echo "📝 Updating metadata.json..."
jq --arg version "$NEW_VERSION" '.version = ($version | tonumber)' metadata.json > metadata.json.tmp
mv metadata.json.tmp metadata.json

# Update package.json
echo "📝 Updating package.json..."
npm version $NEW_VERSION --no-git-tag-version

# Update debian/changelog
echo "📝 Updating debian/changelog..."
CURRENT_DATE=$(date -R)
AUTHOR_NAME="Jose Francisco Gonzalez"
AUTHOR_EMAIL="jfgs1609@gmail.com"

cat > debian/changelog.tmp << EOF
obision-extension-dash ($NEW_VERSION-1) unstable; urgency=medium

  * Release version $NEW_VERSION

 -- $AUTHOR_NAME <$AUTHOR_EMAIL>  $CURRENT_DATE

EOF

cat debian/changelog >> debian/changelog.tmp
mv debian/changelog.tmp debian/changelog

# Commit changes
echo "💾 Committing changes..."
git add metadata.json package.json debian/changelog package-lock.json
git commit -m "Release version $NEW_VERSION"

# Create tag
echo "🏷️  Creating tag v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "Release version $NEW_VERSION"

# Push to repository
echo "⬆️  Pushing to repository..."
git push origin master
git push origin "v$NEW_VERSION"

echo ""
echo "✅ Release $NEW_VERSION created successfully!"
echo ""
echo "GitHub Actions will now:"
echo "  1. Build the extension"
echo "  2. Generate the .deb package"
echo "  3. Create a GitHub release"
echo "  4. Attach the .deb file to the release"
echo ""
echo "Check progress at: https://github.com/nirlob/obision-extension-dash/actions"
