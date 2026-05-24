#!/usr/bin/env bash
set -euo pipefail

# WebSpeedTest CLI - one-click deployment script
# This script installs dependencies, runs typecheck, runs tests,
# and optionally links the CLI globally for easy access.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\e[0;31m'
GREEN='\e[0;32m'
BLUE='\e[0;34m'
NC='\e[0m'

log() {
  echo -e "$1"
}

err() {
  log "${RED}[ERROR] $1${NC}"
}

ok() {
  log "${GREEN}[SUCCESS] $1${NC}"
}

usage() {
  echo ""
  echo "Usage: ./deploy.sh [--global-link]";
  echo "  --global-link, -g   optionally run 'npm link' to expose the CLI globally";
  echo ""
}

verify_node_version() {
  if ! command -v node >/dev/null 2>&1; then
    err "Node.js is not installed. Please install Node.js (>= 18.0.0)."
    exit 2
  fi

  # Read engines.node from package.json to determine required version
  if [[ -f "$ROOT_DIR/package.json" ]]; then
    eng_line=$(grep -m1 '"node"' "$ROOT_DIR/package.json" | sed -E 's/.*"node":\s*"([^"]+)".*/\1/')
  else
    eng_line=""
  fi

  ver="0.0.0"
  if [[ -n "$eng_line" ]]; then
    ver=$(echo "$eng_line" | grep -oE '[0-9]+(\.[0-9]+){0,2}' | head -n1)
  fi

  if [[ -z "$ver" || "$ver" == "0.0.0" ]]; then
    ver="18.0.0"
  fi

  IFS='.' read -r maj min patch <<< "$ver"
  maj=${maj:-0}
  min=${min:-0}
  patch=${patch:-0}

  if (( maj < 18 )); then
    err "Detected engines.node=$ver. Node.js >= 18.0.0 is required by package.json."
    exit 2
  fi

  # Check system node version as well if possible
  sys_ver=$(node -v 2>/dev/null | sed 's/v//')
  if [[ -n "$sys_ver" ]]; then
    IFS='.' read -r smaj smin spatch <<< "$sys_ver"
    smaj=${smaj:-0}
    if (( smaj < 18 )); then
      err "System Node.js version $sys_ver is too old. Please upgrade to >=18."
      exit 2
    fi
  fi

  log "${BLUE}Node.js engines check passed: engines.node=$ver, system node=${sys_ver:-unknown}${NC}"
}

choose_install_cmd() {
  if [[ -f "$ROOT_DIR/package-lock.json" ]]; then
    echo "npm ci"
  else
    echo "npm install"
  fi
}

run_cmd() {
  local cmd="$1"
  local desc="$2"
  log "${BLUE}> ${desc}${NC}"
  if bash -lc "$cmd"; then
    ok "$desc completed"
  else
    err "$desc failed"
    exit 3
  fi
}

main() {
  if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  echo ""
  log "${BLUE}WebSpeedTest Deployment: one-click setup${NC}"
  echo

  verify_node_version

  INSTALL_CMD=$(choose_install_cmd)
  run_cmd "$INSTALL_CMD" "$INSTALL_CMD with project dependencies"

  run_cmd "npm run typecheck" "Type-check (tsc --noEmit)"
  run_cmd "npm test" "Tests (vitest)"

  # Optional global link
  if [[ "${1:-}" == "-g" || "${1:-}" == "--global-link" ]]; then
    run_cmd "npm link" "Global CLI linking (npm link)"
  fi

  ok "All steps completed successfully. WebSpeedTest CLI is ready."
  echo
  echo "Example: ./deploy.sh --global-link"
  echo "This will expose the 'ws-test' CLI globally if configured by package.json."
}

main "$@"
