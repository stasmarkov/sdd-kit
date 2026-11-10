#!/bin/bash
#
# Run Lighthouse against a URL and gate on configured thresholds.
#
# Usage:
#   bash lighthouse-check.sh <url>
#
# Env:
#   LH_MIN_PERFORMANCE  Min performance score, 0-100 (default 80)
#   LH_MAX_LCP_MS       Max LCP in ms (default 2500)
#   LH_MAX_INP_MS       Max INP / TBT in ms (default 200)
#   LH_MAX_CLS          Max CLS (default 0.10)
#   LH_FORM_FACTOR      mobile | desktop (default mobile)
#

set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" ]]; then
    echo "Usage: $0 <url>" >&2
    exit 1
fi

MIN_PERF="${LH_MIN_PERFORMANCE:-80}"
MAX_LCP="${LH_MAX_LCP_MS:-2500}"
MAX_INP="${LH_MAX_INP_MS:-200}"
MAX_CLS="${LH_MAX_CLS:-0.10}"
FORM="${LH_FORM_FACTOR:-mobile}"

if ! command -v lighthouse >/dev/null 2>&1; then
    echo "lighthouse CLI not installed. Install: npm i -g lighthouse" >&2
    exit 127
fi

OUT=$(mktemp -t lh-XXXXXX.json)
trap 'rm -f "$OUT"' EXIT

echo "Running Lighthouse on $URL (form factor: $FORM)..."
lighthouse "$URL" \
    --quiet \
    --chrome-flags="--headless=new --no-sandbox" \
    --form-factor="$FORM" \
    --only-categories=performance \
    --output=json \
    --output-path="$OUT" >/dev/null

PERF=$(jq -r '.categories.performance.score * 100 | floor' "$OUT")
LCP=$(jq -r '.audits["largest-contentful-paint"].numericValue | floor' "$OUT")
TBT=$(jq -r '.audits["total-blocking-time"].numericValue | floor' "$OUT")
CLS=$(jq -r '.audits["cumulative-layout-shift"].numericValue' "$OUT")
TTFB=$(jq -r '.audits["server-response-time"].numericValue | floor' "$OUT")

echo
echo "Performance score: $PERF (min $MIN_PERF)"
echo "LCP:               ${LCP}ms (max ${MAX_LCP}ms)"
echo "TBT (proxy INP):   ${TBT}ms (max ${MAX_INP}ms)"
echo "CLS:               $CLS (max $MAX_CLS)"
echo "TTFB:              ${TTFB}ms"

FAIL=0
(( PERF >= MIN_PERF ))    || { echo "FAIL: performance $PERF < $MIN_PERF" >&2; FAIL=1; }
(( LCP <= MAX_LCP ))      || { echo "FAIL: LCP $LCP > $MAX_LCP" >&2; FAIL=1; }
(( TBT <= MAX_INP ))      || { echo "FAIL: TBT $TBT > $MAX_INP" >&2; FAIL=1; }
awk -v c="$CLS" -v m="$MAX_CLS" 'BEGIN { exit (c+0 <= m+0) ? 0 : 1 }' \
    || { echo "FAIL: CLS $CLS > $MAX_CLS" >&2; FAIL=1; }

if (( FAIL == 1 )); then
    exit 2
fi
echo "All thresholds passed."
