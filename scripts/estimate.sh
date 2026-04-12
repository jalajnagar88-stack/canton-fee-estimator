#!/bin/bash
#
# Canton Fee Estimator
#
# This script inspects a Daml DAR file, starts a local Canton sandbox,
# creates one instance of each template with dummy data, and measures the
# resulting transaction size to estimate traffic fees.
#
# Usage:
#   ./scripts/estimate.sh <path-to-your-project.dar>
#
# Dependencies:
#   - dpm (Canton/Daml Package Manager)
#   - jq (JSON processor)
#

# --- PREAMBLE: UTILITIES & CONFIG ---

set -euo pipefail

# Enable for verbose debugging output
DEBUG=${DEBUG:-0}

# Color codes for terminal output
C_RESET='\033[0m'
C_RED='\033[0;31m'
C_GREEN='\033[0;32m'
C_YELLOW='\033[0;33m'
C_BLUE='\033[0;34m'
C_BOLD='\033[1m'

log_info() {
    echo -e "${C_BLUE}INFO: $1${C_RESET}"
}

log_warn() {
    echo -e "${C_YELLOW}WARN: $1${C_RESET}"
}

log_error() {
    echo -e "${C_RED}ERROR: $1${C_RESET}" >&2
}

log_debug() {
    if [[ "$DEBUG" -ne 0 ]]; then
        echo -e "${C_YELLOW}DEBUG: $1${C_RESET}"
    fi
}

# --- FEE MODEL CONFIGURATION ---
# Based on a simplified model. Refer to official Canton documentation for production figures.
# See: docs/FEE_MODEL.md

# Free monthly traffic allowance in bytes
FREE_TIER_BYTES=5000000 # 5 MB

# Cost per megabyte (1,048,576 bytes) over the free tier, in USD
COST_PER_MB_USD=10.0

# --- DEPENDENCY CHECKS ---

if ! command -v dpm &> /dev/null; then
    log_error "dpm could not be found."
    log_error "Please install the Daml SDK with DPM: curl https://get.digitalasset.com/install/install.sh | sh"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    log_error "jq could not be found."
    log_error "Please install jq. (e.g., 'sudo apt-get install jq' or 'brew install jq')"
    exit 1
fi


# --- ARGUMENT VALIDATION ---

if [ "$#" -ne 1 ]; then
    log_error "Usage: $0 <path-to-dar-file.dar>"
    exit 1
fi

DAR_FILE=$1

if [ ! -f "$DAR_FILE" ]; then
    log_error "File not found: $DAR_FILE"
    exit 1
fi

if [[ "$DAR_FILE" != *.dar ]]; then
    log_warn "File does not have a .dar extension. Attempting to proceed anyway."
fi

# --- SANDBOX MANAGEMENT ---

SANDBOX_LOG="sandbox-estimator.log"
SANDBOX_PID_FILE="sandbox-estimator.pid"
JSON_API_URL="http://localhost:7575"
# Sandbox uses a dummy JWT for auth by default
JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJodHRwczovL2RhbWwuY29tL2xlZGdlci1hcGkiOnsibGVkZ2VySWQiOiJzYW5kYm94IiwiYXBwbGljYXRpb25JZCI6ImZvb2JhciIsImFjdEFzIjpbIlVzZXIifV19.mQxJ99-V2nB4zS2z2oTe0yo22Z85IaS0jP96iWzZkI8"
PARTICIPANT_LOG=".dpm/sandbox/participant.log"

cleanup() {
    log_info "Cleaning up sandbox..."
    if [ -f "$SANDBOX_PID_FILE" ]; then
        PID=$(cat "$SANDBOX_PID_FILE")
        # Kill the process group to ensure all child processes are terminated
        kill -9 "-$PID" 2>/dev/null || kill -9 "$PID" 2>/dev/null
        rm -f "$SANDBOX_PID_FILE"
    fi
    rm -f "$SANDBOX_LOG"
    log_info "Cleanup complete."
}

start_sandbox() {
    log_info "Starting Canton sandbox in the background..."
    # Use setsid to create a new session, making it easier to kill the process group
    (setsid dpm sandbox --log-level-root=info > "$SANDBOX_LOG" 2>&1 & echo $! > "$SANDBOX_PID_FILE")

    log_info "Waiting for JSON API to be available..."
    local count=0
    until curl -s -f -o /dev/null "$JSON_API_URL/v1/health"; do
        sleep 1
        count=$((count+1))
        if [ $count -gt 30 ]; then
            log_error "Sandbox failed to start. Check logs in $SANDBOX_LOG"
            exit 1
        fi
        echo -n "."
    done
    echo ""
    log_info "Sandbox is running."
}

# --- MAIN LOGIC ---

# Register the cleanup function to be called on script exit
trap cleanup EXIT

start_sandbox

log_info "Inspecting DAR file: $DAR_FILE"
INSPECT_JSON=$(dpm damlc inspect-dar --json "$DAR_FILE")
MAIN_PKG_ID=$(echo "$INSPECT_JSON" | jq -r '.main_package_id')

log_info "Allocating a test party..."
PARTY_ID=$(curl -s -X POST \
    -H "Authorization: Bearer $JWT" \
    -d '{"displayName":"Estimator"}' \
    "$JSON_API_URL/v2/parties/allocate" | jq -r '.identifier')
log_info "Allocated party: $PARTY_ID"

# Print report header
printf "\n${C_BOLD}%-60s %-15s %-20s %-20s${C_RESET}\n" "Template" "Tx Size (est)" "Cost/Tx (USD)" "Monthly Cost (10k tx)"
echo "----------------------------------------------------------------------------------------------------------------------------"

TOTAL_TEMPLATES=0
TOTAL_BYTES=0

# Loop through each template found in the DAR
echo "$INSPECT_JSON" | jq -c '.main_package.modules[] | . as $module | .templates[] | {moduleName: $module.name, template: .}' | while read -r line; do
    
    MODULE_NAME=$(echo "$line" | jq -r '.moduleName')
    TEMPLATE_NAME=$(echo "$line" | jq -r '.template.name')
    TEMPLATE_JSON=$(echo "$line" | jq -c '.template')
    FULL_TEMPLATE_ID="$MAIN_PKG_ID:$MODULE_NAME:$TEMPLATE_NAME"
    
    log_debug "Processing template: $FULL_TEMPLATE_ID"

    # Generate a dummy JSON payload for the template
    payload="{"
    first_field=true
    echo "$TEMPLATE_JSON" | jq -c '.fields[]' | while read -r field_json; do
        if [ "$first_field" = false ]; then
            payload="$payload,"
        fi
        first_field=false

        field_name=$(echo "$field_json" | jq -r '.name')
        # This handles both simple types (`"type": "Party"`) and complex ones (`"type": {"name": "List", ...}`)
        type_name=$(echo "$field_json" | jq -r '.type | if type == "string" then . else .name end')

        case "$type_name" in
            Party)        field_value="\"$PARTY_ID\"" ;;
            Text)         field_value="\"dummy-text-for-estimation-purposes\"" ;;
            Decimal)      field_value="\"1234567890.1234567890\"" ;;
            Int64)        field_value="\"9876543210\"" ;;
            Bool)         field_value="true" ;;
            Date)         field_value="\"2024-01-01\"" ;;
            Time)         field_value="\"2024-01-01T12:00:00.000Z\"" ;;
            Unit)         field_value="{}" ;;
            List)         field_value="[]" ;;
            Optional)     field_value="null" ;;
            *)            field_value="null"; log_debug "Using 'null' for unhandled type '$type_name' in field '$field_name'" ;;
        esac
        payload="$payload \"$field_name\":$field_value"
    done
    payload="$payload}"
    
    log_debug "Generated payload: $payload"

    # Clear participant log to isolate the next transaction's log entry
    if [ -f "$PARTICIPANT_LOG" ]; then
        : > "$PARTICIPANT_LOG"
    fi

    # Submit the create command
    create_payload="{\"templateId\": \"$FULL_TEMPLATE_ID\", \"payload\": $payload}"
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer $JWT" \
        -H "Content-Type: application/json" \
        -d "$create_payload" \
        "$JSON_API_URL/v1/create")
    
    http_code=$(echo "$response" | tail -n1)
    response_body=$(echo "$response" | sed '$d')

    if [ "$http_code" -ne 200 ]; then
        log_warn "Failed to create contract for '$TEMPLATE_NAME'. HTTP $http_code. Skipping."
        log_warn "Response: $response_body"
        printf "%-60s %-15s %-20s %-20s\n" "$MODULE_NAME:$TEMPLATE_NAME" "ERROR" "N/A" "N/A"
        continue
    fi
    
    # Wait for log to flush
    sleep 0.5

    # Extract transaction size from the participant log
    tx_size_bytes=$(grep 'traffic-cost-of-request' "$PARTICIPANT_LOG" | tail -n 1 | sed -n 's/.*size=\([0-9]*\)B.*/\1/p')

    if [ -z "$tx_size_bytes" ]; then
        log_warn "Could not determine transaction size for '$TEMPLATE_NAME'. Skipping."
        log_warn "Check for contract errors in $SANDBOX_LOG or $PARTICIPANT_LOG"
        printf "%-60s %-15s %-20s %-20s\n" "$MODULE_NAME:$TEMPLATE_NAME" "UNKNOWN" "N/A" "N/A"
        continue
    fi

    # Calculate costs using bc for floating point math
    tx_cost_usd=$(echo "scale=8; $tx_size_bytes / 1048576 * $COST_PER_MB_USD" | bc)
    monthly_bytes=$(echo "10000 * $tx_size_bytes" | bc)
    monthly_cost_usd=$(echo "scale=2; if ($monthly_bytes > $FREE_TIER_BYTES) (($monthly_bytes - $FREE_TIER_BYTES) / 1048576 * $COST_PER_MB_USD) else 0" | bc)

    # Print results for this template
    printf "%-60s %-15s %-20s %-20s\n" "$MODULE_NAME:$TEMPLATE_NAME" "${tx_size_bytes} B" "\$${tx_cost_usd}" "\$${monthly_cost_usd}"

    TOTAL_TEMPLATES=$((TOTAL_TEMPLATES + 1))
    TOTAL_BYTES=$((TOTAL_BYTES + tx_size_bytes))
done

echo "----------------------------------------------------------------------------------------------------------------------------"

# --- SUMMARY ---

if [ "$TOTAL_TEMPLATES" -gt 0 ]; then
    AVG_BYTES=$((TOTAL_BYTES / TOTAL_TEMPLATES))
    AVG_COST_USD=$(echo "scale=8; $AVG_BYTES / 1048576 * $COST_PER_MB_USD" | bc)

    log_info "Estimation Summary:"
    echo -e " - Analyzed ${C_BOLD}$TOTAL_TEMPLATES${C_RESET} templates."
    echo -e " - Average transaction size (create): ${C_BOLD}$AVG_BYTES bytes${C_RESET}."
    echo -e " - Average cost per transaction: ${C_BOLD}\$${AVG_COST_USD}${C_RESET}."
    echo ""
    log_info "The estimates above are for contract ${C_BOLD}creations${C_RESET} only."
    log_info "Exercising choices, especially archiving contracts, will have different (often smaller) costs."
    log_info "For detailed optimization strategies, see ${C_BOLD}docs/OPTIMISATION.md${C_RESET}."
else
    log_warn "No templates were found or analyzed in the provided DAR file."
fi

# The 'trap' will handle cleanup automatically on exit
exit 0