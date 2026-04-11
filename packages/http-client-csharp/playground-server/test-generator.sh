#!/bin/bash
# Test the generator manually in the App Service container
# Usage: bash /app/test-generator.sh

set -e

DIR=/tmp/test-gen-$$
mkdir -p "$DIR"

echo '{}' > "$DIR/tspCodeModel.json"
echo '{}' > "$DIR/Configuration.json"

echo "Running generator in $DIR..."
dotnet --roll-forward Major /app/generator/Microsoft.TypeSpec.Generator.dll "$DIR" -g ScmCodeModelGenerator --new-project
EXIT=$?

echo "Exit code: $EXIT"
ls -la "$DIR/"

# Cleanup
rm -rf "$DIR"
