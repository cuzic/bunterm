#!/bin/bash
# Check for direct process.env manipulation in test files.
# Use withEnv/withEnvSync from @/test-helpers/env-scope.js instead.
#
# Usage:
#   scripts/check-env-usage.sh          # check staged files (pre-commit)
#   scripts/check-env-usage.sh --all    # check all test files in src/

set -euo pipefail

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Excluded files (helper implementation + test setup)
EXCLUDE_PATTERN='(test-helpers/env-scope(\.test)?\.ts|test-setup\.ts)$'

if [[ "${1:-}" == "--all" ]]; then
  files=$(find src -name '*.test.ts' | grep -vE "$EXCLUDE_PATTERN" || true)
else
  files=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep '\.test\.ts$' | grep -vE "$EXCLUDE_PATTERN" || true)
fi

if [[ -z "$files" ]]; then
  exit 0
fi

found=0

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  # Pattern 1: delete process.env
  if grep -nP 'delete\s+process\.env' "$file" > /dev/null 2>&1; then
    matches=$(grep -nP 'delete\s+process\.env' "$file")
    while IFS= read -r match; do
      echo -e "${RED}ERROR${NC}: Direct process.env deletion in ${YELLOW}${file}${NC}"
      echo "  $match"
      echo "  Use withEnv() from @/test-helpers/env-scope.js instead."
      echo
      found=$((found + 1))
    done <<< "$matches"
  fi

  # Pattern 2: process.env[...] = ... (assignment, not just read)
  # Matches: process.env['KEY'] = 'val', process.env["KEY"] = "val", process.env[KEY] = val
  if grep -nP 'process\.env\[.+\]\s*=' "$file" > /dev/null 2>&1; then
    matches=$(grep -nP 'process\.env\[.+\]\s*=' "$file")
    while IFS= read -r match; do
      echo -e "${RED}ERROR${NC}: Direct process.env assignment in ${YELLOW}${file}${NC}"
      echo "  $match"
      echo "  Use withEnv() from @/test-helpers/env-scope.js instead."
      echo
      found=$((found + 1))
    done <<< "$matches"
  fi

  # Pattern 3: process.env.KEY = ... (dot-notation assignment)
  if grep -nP 'process\.env\.\w+\s*=' "$file" > /dev/null 2>&1; then
    matches=$(grep -nP 'process\.env\.\w+\s*=' "$file")
    while IFS= read -r match; do
      echo -e "${RED}ERROR${NC}: Direct process.env assignment in ${YELLOW}${file}${NC}"
      echo "  $match"
      echo "  Use withEnv() from @/test-helpers/env-scope.js instead."
      echo
      found=$((found + 1))
    done <<< "$matches"
  fi

done <<< "$files"

if [[ $found -gt 0 ]]; then
  echo -e "${RED}Found $found direct process.env manipulation(s) in test files.${NC}"
  echo "Use withEnv/withEnvSync from @/test-helpers/env-scope.js instead."
  exit 1
fi
