#!/bin/bash
# Test the generator manually in the App Service container
# Usage: bash /app/test-generator.sh

DIR=/tmp/test-gen-$$
mkdir -p "$DIR"

# Copy test data from bundled Spector routes test
cp /app/test-data/tspCodeModel.json "$DIR/"
cp /app/test-data/Configuration.json "$DIR/"

echo "Running generator in $DIR..."
dotnet --roll-forward Major /app/generator/Microsoft.TypeSpec.Generator.dll "$DIR" -g ScmCodeModelGenerator --new-project
EXIT=$?

echo "Exit code: $EXIT"
if [ $EXIT -eq 0 ]; then
  echo "Generated files:"
  find "$DIR" -type f | head -20
  rm -rf "$DIR"
else
  echo "FAILED - temp dir preserved at $DIR"
fi
