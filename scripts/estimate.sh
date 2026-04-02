#!/usr/bin/env bash
# scripts/estimate.sh
#
# One-command fee estimation for a Canton/Daml project.
#
# Usage:
#   ./scripts/estimate.sh [OPTIONS]
#
# Options:
#   -c, --config <path>      Path to the estimator config JSON  (default: ./config.json)
#   -o, --output <path>      Write JSON report to this file     (default: stdout only)
#   -f, --format <fmt>       Output format: table|json|sarif    (default: table)
#   -e, --endpoint <url>     Canton JSON API endpoint           (default: http://localhost:7575)
#   -p, --participant <id>   Participant ID to use              (default: Participant1)
#   -d, --dar <path>         Path to compiled .dar file         (default: auto-detected)
#   -v, --verbose            Enable verbose debug output
#   -h, --help               Show this help message and exit
#
# Examples:
#   # Quick estimate using defaults (expects a running local Canton DevNet):
#   ./scripts/estimate.sh
#
#   # Estimate with a custom config, write JSON report to file:
#   ./scripts/estimate.sh --config my-project/config.json --output report.json
#
#   # Point at a remote TestNet participant:
#   ./scripts/estimate.sh --endpoint https://canton-testnet.example.com --participant Alice
#
# Requirements:
#   - Node.js >= 16  (https://nodejs.org/)
#   - npm            (bundled with Node.js)
#   - ts-node        (installed automatically if absent)

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
CONFIG="./config.json"
OUTPUT=""
FORMAT="table"
ENDPOINT="http://localhost:7575"
PARTICIPANT="Participant1"
DAR=""
VERBOSE=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[canton-fee-estimator]${RESET} $*"; }
success() { echo -e "${GREEN}[canton-fee-estimator]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[canton-fee-estimator] WARN:${RESET} $*"; }
error()   { echo -e "${RED}[canton-fee-estimator] ERROR:${RESET} $*" >&2; exit 1; }
debug()   { $VERBOSE && echo -e "${BOLD}[DEBUG]${RESET} $*" || true; }

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--config)      CONFIG="$2";      shift 2 ;;
    -o|--output)      OUTPUT="$2";      shift 2 ;;
    -f|--format)      FORMAT="$2";      shift 2 ;;
    -e|--endpoint)    ENDPOINT="$2";    shift 2 ;;
    -p|--participant) PARTICIPANT="$2"; shift 2 ;;
    -d|--dar)         DAR="$2";         shift 2 ;;
    -v|--verbose)     VERBOSE=true;     shift   ;;
    -h|--help)
      sed -n '/^# Usage:/,/^# Requirements:/p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      exit 0
      ;;
    *) error "Unknown option: $1. Run with --help for usage." ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       Canton Fee Estimator  v0.3.0       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${RESET}"

info "Running pre-flight checks..."

# Node.js
if ! command -v node &>/dev/null; then
  error "Node.js is not installed. Install it from https://nodejs.org/ (>= 16 required)."
fi
NODE_VER=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 16 ]]; then
  error "Node.js >= 16 required, found v${NODE_VER}."
fi
debug "Node.js v${NODE_VER} OK"

# npm
if ! command -v npm &>/dev/null; then
  error "npm is not found. It should be bundled with Node.js."
fi
debug "npm $(npm --version) OK"

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------
cd "${REPO_ROOT}"

if [[ ! -d "node_modules" ]]; then
  info "node_modules not found — running npm install..."
  npm install --prefer-offline --no-audit --no-fund
  success "Dependencies installed."
else
  debug "node_modules present — skipping npm install"
fi

# Ensure ts-node is available (local or global)
if ! npx --no-install ts-node --version &>/dev/null 2>&1; then
  warn "ts-node not found locally — installing as dev dependency..."
  npm install --save-dev ts-node typescript @types/node --no-audit --no-fund
  success "ts-node installed."
fi

# ---------------------------------------------------------------------------
# Auto-detect DAR if not provided
# ---------------------------------------------------------------------------
if [[ -z "$DAR" ]]; then
  DETECTED_DAR=$(find "${REPO_ROOT}" -name "*.dar" -not -path "*/node_modules/*" 2>/dev/null | head -1 || true)
  if [[ -n "$DETECTED_DAR" ]]; then
    DAR="$DETECTED_DAR"
    info "Auto-detected DAR: ${DAR}"
  else
    warn "No .dar file found. Estimation will use static analysis only (no simulation)."
  fi
fi

# ---------------------------------------------------------------------------
# Validate config
# ---------------------------------------------------------------------------
if [[ ! -f "$CONFIG" ]]; then
  warn "Config not found at '${CONFIG}'. Generating a sample config..."

  cat > "${CONFIG}" <<EOF
{
  "_comment": "Auto-generated by scripts/estimate.sh — edit before running in production",
  "cantonEndpoint": "${ENDPOINT}",
  "participantId": "${PARTICIPANT}",
  "darPath": "${DAR}",
  "simulationDuration": 30,
  "transactionPatterns": [
    {
      "contractName": "MyModule:MyContract",
      "choiceName": "MyChoice",
      "frequencyPerMinute": 60,
      "payload": {}
    }
  ],
  "feeRates": {
    "baseTransactionFee": 0.0001,
    "feePerKb": 0.00005,
    "feePerParticipant": 0.00002,
    "feePerObserverDistribution": 0.000015
  }
}
EOF
  info "Sample config written to ${CONFIG} — update it with your contract details and re-run."
fi

debug "Using config: ${CONFIG}"
debug "Endpoint:     ${ENDPOINT}"
debug "Participant:  ${PARTICIPANT}"
debug "DAR:          ${DAR:-<none>}"
debug "Format:       ${FORMAT}"

# ---------------------------------------------------------------------------
# Build CLI args
# ---------------------------------------------------------------------------
CLI_ARGS=("--config" "$CONFIG" "--format" "$FORMAT" "--endpoint" "$ENDPOINT" "--participant" "$PARTICIPANT")
[[ -n "$OUTPUT" ]]  && CLI_ARGS+=("--output" "$OUTPUT")
[[ -n "$DAR" ]]     && CLI_ARGS+=("--dar" "$DAR")
$VERBOSE             && CLI_ARGS+=("--verbose")

# ---------------------------------------------------------------------------
# Run estimator
# ---------------------------------------------------------------------------
info "Starting Canton Fee Estimator..."
echo ""

if npx ts-node "${REPO_ROOT}/cli/main.ts" "${CLI_ARGS[@]}"; then
  echo ""
  success "Estimation complete."
  [[ -n "$OUTPUT" ]] && success "Report written to: ${OUTPUT}"
else
  EXIT_CODE=$?
  echo ""
  error "Estimator exited with code ${EXIT_CODE}. Run with --verbose for details."
fi
