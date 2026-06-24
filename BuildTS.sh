#!/bin/bash
# ============================================================
#  MegaForm — Build All TypeScript Bundles
#
#  Usage:
#    ./BuildTS.sh              # Build all supported bundles
#    ./BuildTS.sh renderer     # Build 1 module only
#    ./BuildTS.sh config builder renderer  # Build specific
#
#  Yeu cau: Node.js 18+, npm
#  Output:  Assets/js/megaform-*.js + Assets/js/bundles/megaform-*.js
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UI_DIR="$SCRIPT_DIR/MegaForm.UI"
OUT_DIR="$SCRIPT_DIR/Assets/js"

ALL_MODULES=(i18n widgets renderer config builder submissions views presets embed admin-live dashboard theme-designer theme-inspector)

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================================${NC}"
echo -e "${CYAN}  MegaForm — TypeScript Build${NC}"
echo -e "${CYAN}============================================================${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js not found. Install from https://nodejs.org${NC}"
    exit 1
fi
echo -e "  Node.js: $(node -v)"

# npm install
if [ ! -d "$UI_DIR/node_modules" ]; then
    echo ""
    echo -e "${YELLOW}[1/2] Installing dependencies...${NC}"
    cd "$UI_DIR"
    npm install --silent
    echo -e "  ${GREEN}Dependencies installed${NC}"
else
    echo -e "  ${GRAY}Dependencies: cached${NC}"
fi

# Determine modules
if [ $# -gt 0 ]; then
    MODULES=("$@")
else
    MODULES=("${ALL_MODULES[@]}")
fi

# Build
mkdir -p "$OUT_DIR"
cd "$UI_DIR"

echo ""
echo -e "${YELLOW}[2/2] Building ${#MODULES[@]} bundle(s)...${NC}"
echo ""

OK=0
FAIL=0
START=$(date +%s)

for m in "${MODULES[@]}"; do
    printf "  [%-12s] " "$m"
    
    MSTART=$(date +%s%N)
    if MF_ENTRY=$m npx vite build > /dev/null 2>&1; then
        MEND=$(date +%s%N)
        ELAPSED=$(( (MEND - MSTART) / 1000000 ))
        if [ "$m" = "builder" ]; then
            OUTFILE="$SCRIPT_DIR/Assets/js/bundles/megaform-$m.js"
        else
            OUTFILE="$SCRIPT_DIR/Assets/js/megaform-$m.js"
        fi
        if [ -f "$OUTFILE" ]; then
            SIZE=$(du -k "$OUTFILE" | cut -f1)
            echo -e "${GREEN}OK${NC}  ${SIZE} KB  (${ELAPSED}ms)"
        else
            echo -e "${GREEN}OK${NC}  (${ELAPSED}ms)"
        fi
        OK=$((OK + 1))
    else
        echo -e "${RED}FAILED${NC}"
        FAIL=$((FAIL + 1))
    fi
done

END=$(date +%s)
TOTAL=$((END - START))

echo ""
if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}============================================================${NC}"
    echo -e "${GREEN}  Build Complete — $OK OK, $FAIL failed (${TOTAL}s)${NC}"
    echo -e "${GREEN}============================================================${NC}"
else
    echo -e "${YELLOW}============================================================${NC}"
    echo -e "${YELLOW}  Build Complete — $OK OK, $FAIL failed (${TOTAL}s)${NC}"
    echo -e "${YELLOW}============================================================${NC}"
fi

echo ""
echo "  Output: $OUT_DIR"
echo ""
ls -lh "$OUT_DIR"/megaform-*.js 2>/dev/null | awk '{printf "    %-35s %s\n", $NF, $5}'
echo ""
