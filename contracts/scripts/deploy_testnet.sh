#!/bin/bash
# =============================================
# STEALTHAP — Deploy All Programs to Aleo Testnet
# =============================================
# Prerequisites:
#   - Leo CLI installed (leo --version)
#   - Aleo account with testnet credits
#   - Set PRIVATE_KEY environment variable
#
# Usage: ./deploy_testnet.sh
# =============================================

set -e

NETWORK="testnet"
ENDPOINT="https://api.explorer.provable.com/v1"

echo "╔══════════════════════════════════════════╗"
echo "║  StealthAP — Deploy 5 Programs to Testnet ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check prerequisites
if ! command -v leo &> /dev/null; then
    echo "ERROR: Leo CLI not found. Install from https://developer.aleo.org/"
    exit 1
fi

if [ -z "$PRIVATE_KEY" ]; then
    echo "ERROR: PRIVATE_KEY not set. Export your Aleo private key."
    exit 1
fi

echo "Network: $NETWORK"
echo "Endpoint: $ENDPOINT"
echo ""

# Deploy order matters — dependencies first
PROGRAMS=(
    "stealthap_invoice"
    "stealthap_payment"
    "stealthap_workflow"
    "stealthap_audit"
    "stealthap_batch"
)

for PROGRAM in "${PROGRAMS[@]}"; do
    echo "────────────────────────────────────────"
    echo "Deploying: ${PROGRAM}.aleo"
    echo "────────────────────────────────────────"

    cd "$(dirname "$0")/../${PROGRAM}"

    # Build
    echo "Building..."
    leo build

    # Deploy
    echo "Deploying to ${NETWORK}..."
    leo deploy --network "$NETWORK" --endpoint "$ENDPOINT" --private-key "$PRIVATE_KEY"

    echo "✓ ${PROGRAM}.aleo deployed successfully"
    echo ""

    cd ..
done

echo "╔══════════════════════════════════════════╗"
echo "║   All 5 programs deployed successfully!   ║"
echo "╚══════════════════════════════════════════╝"
