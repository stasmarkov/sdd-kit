#!/usr/bin/env bash
# =============================================================================
# review-setup.sh — Preflight check for review.sh v5 (multi-framework)
# Run once before the overnight review to catch config problems early.
# Supports: Laravel, Drupal, Symfony, Django, Rails, Node, generic
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${SCRIPT_DIR}/review.config.sh"

# Resolve PROJECT_ROOT (scripts may live in scripts/review/ or at project root)
is_project_root() {
  local d="$1"
  [[ -d "${d}/.git" ]] || [[ -f "${d}/CLAUDE.md" ]] || \
  [[ -f "${d}/composer.json" ]] || [[ -f "${d}/package.json" ]] || \
  [[ -f "${d}/pyproject.toml" ]] || [[ -f "${d}/Gemfile" ]] || \
  [[ -f "${d}/go.mod" ]] || [[ -f "${d}/Cargo.toml" ]] || \
  [[ -f "${d}/manage.py" ]]
}
PROJECT_ROOT="$SCRIPT_DIR"
for candidate in "${SCRIPT_DIR}/../.." "${SCRIPT_DIR}/.." "${SCRIPT_DIR}"; do
  if is_project_root "$candidate"; then
    PROJECT_ROOT="$(cd "$candidate" && pwd)"
    break
  fi
done

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; BOLD=$'\033[1m'; NC=$'\033[0m'

FAILS=0; WARNS=0
ok()   { printf '  %s %s\n' "${GREEN}✓${NC}" "$*"; }
fail() { printf '  %s %s\n' "${RED}✗${NC}" "$*"; ((FAILS++)); }
warn() { printf '  %s %s\n' "${YELLOW}⚠${NC}" "$*"; ((WARNS++)); }
info() { printf '  %s %s\n' "${BLUE}→${NC}" "$*"; }

echo ""; printf '%s\n' "${BOLD}Review Pipeline v5 — Preflight Check (multi-framework)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}1. Config file${NC}"
if [[ ! -f "$CONFIG" ]]; then
  fail "review.config.sh not found at ${SCRIPT_DIR}"
  echo "  Copy review.config.sh alongside review.sh and edit PROJECT_NAME."
  echo "  Then: ./review.sh discover"
  exit 1
fi
ok "review.config.sh found"
source "$CONFIG"

# Backwards compatibility
[[ -z "${STATIC_ANALYSIS_CMD:-}" ]] && [[ -n "${PHPSTAN_CMD:-}" ]] && STATIC_ANALYSIS_CMD="$PHPSTAN_CMD"

[[ -z "${PROJECT_NAME:-}" ]] && \
  warn "PROJECT_NAME not set — edit review.config.sh" || \
  ok "PROJECT_NAME: ${PROJECT_NAME}"

[[ -z "${PROJECT_DESCRIPTION:-}" ]] && \
  warn "PROJECT_DESCRIPTION not set — affects quality of BRAIN docs" || \
  ok "PROJECT_DESCRIPTION set"

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}2. Framework detection${NC}"
info "Project root: ${PROJECT_ROOT}"

# Auto-detect framework if not set
if [[ -z "${BACKEND_FRAMEWORK:-}" ]]; then
  if [[ -f "${PROJECT_ROOT}/artisan" ]]; then
    BACKEND_FRAMEWORK="laravel"
  elif [[ -d "${PROJECT_ROOT}/web/core" ]] && [[ -f "${PROJECT_ROOT}/web/core/lib/Drupal.php" ]]; then
    BACKEND_FRAMEWORK="drupal"
  elif [[ -f "${PROJECT_ROOT}/symfony.lock" ]] || [[ -f "${PROJECT_ROOT}/config/bundles.php" ]]; then
    BACKEND_FRAMEWORK="symfony"
  elif [[ -f "${PROJECT_ROOT}/manage.py" ]] && grep -q "django" "${PROJECT_ROOT}/manage.py" 2>/dev/null; then
    BACKEND_FRAMEWORK="django"
  elif [[ -f "${PROJECT_ROOT}/Gemfile" ]] && grep -q "rails" "${PROJECT_ROOT}/Gemfile" 2>/dev/null; then
    BACKEND_FRAMEWORK="rails"
  elif [[ -f "${PROJECT_ROOT}/package.json" ]]; then
    BACKEND_FRAMEWORK="node"
  else
    BACKEND_FRAMEWORK="generic"
  fi
  ok "Auto-detected framework: ${BOLD}${BACKEND_FRAMEWORK}${NC}"
else
  ok "Framework (from config): ${BOLD}${BACKEND_FRAMEWORK}${NC}"
fi

# Framework-specific source info
case "$BACKEND_FRAMEWORK" in
  laravel)
    if [[ -d "${PROJECT_ROOT}/Modules" ]]; then
      local_count=$(ls "${PROJECT_ROOT}/Modules/" 2>/dev/null | wc -l | tr -d ' ')
      ok "Modules/ found (${local_count} top-level modules — modular monolith)"
      total_src=$(find "${PROJECT_ROOT}/Modules" "${PROJECT_ROOT}/app" -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
    elif [[ -d "${PROJECT_ROOT}/app" ]]; then
      ok "app/ found (standard Laravel structure)"
      total_src=$(find "${PROJECT_ROOT}/app" -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
    else
      warn "No app/ or Modules/ directory found"
      total_src=0
    fi
    info "Total PHP source files: ${total_src}"
    ;;
  drupal)
    if [[ -d "${PROJECT_ROOT}/web/modules/custom" ]]; then
      local_count=$(ls "${PROJECT_ROOT}/web/modules/custom/" 2>/dev/null | wc -l | tr -d ' ')
      ok "web/modules/custom/ found (${local_count} custom modules)"
      total_src=$(find "${PROJECT_ROOT}/web/modules/custom" "${PROJECT_ROOT}/web/themes/custom" -name "*.php" -o -name "*.module" 2>/dev/null | wc -l | tr -d ' ')
    else
      warn "No web/modules/custom/ directory found"
      total_src=0
    fi
    info "Total custom PHP files: ${total_src}"
    ;;
  symfony)
    if [[ -d "${PROJECT_ROOT}/src" ]]; then
      ok "src/ found"
      total_src=$(find "${PROJECT_ROOT}/src" -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
    else
      warn "No src/ directory found"
      total_src=0
    fi
    info "Total PHP source files: ${total_src}"
    ;;
  django)
    app_count=$(find "${PROJECT_ROOT}" -maxdepth 2 -name "apps.py" 2>/dev/null | wc -l | tr -d ' ')
    ok "Django detected (${app_count} apps found)"
    total_src=$(find "${PROJECT_ROOT}" -name "*.py" -not -path "*/venv/*" -not -path "*/.venv/*" -not -path "*/migrations/*" 2>/dev/null | wc -l | tr -d ' ')
    info "Total Python source files: ${total_src}"
    ;;
  rails)
    if [[ -d "${PROJECT_ROOT}/app" ]]; then
      ok "app/ found (Rails application)"
      total_src=$(find "${PROJECT_ROOT}/app" "${PROJECT_ROOT}/lib" -name "*.rb" 2>/dev/null | wc -l | tr -d ' ')
    else
      warn "No app/ directory found"
      total_src=0
    fi
    info "Total Ruby source files: ${total_src}"
    ;;
  node)
    for d in src lib app; do
      [[ -d "${PROJECT_ROOT}/${d}" ]] && ok "${d}/ found"
    done
    total_src=$(find "${PROJECT_ROOT}/src" "${PROJECT_ROOT}/lib" "${PROJECT_ROOT}/app" \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" \) 2>/dev/null | wc -l | tr -d ' ')
    info "Total JS/TS source files: ${total_src}"
    ;;
  *)
    info "Generic project — framework detection inconclusive"
    info "Set BACKEND_FRAMEWORK in review.config.sh for better results"
    total_src="?"
    ;;
esac

[[ -f "${PROJECT_ROOT}/CLAUDE.md" ]] && ok "CLAUDE.md found" || \
  warn "CLAUDE.md not found — Phase H will create it"

[[ -f "${PROJECT_ROOT}/.env" ]] && ok ".env present" || \
  info ".env not found (optional)"

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}3. Chunk registry${NC}"
if [[ ${#CHUNKS_BACKEND[@]} -eq 0 ]]; then
  fail "CHUNKS_BACKEND is empty"
  info "Run: ./review.sh discover"
else
  ok "${#CHUNKS_BACKEND[@]} backend chunks defined"
fi

if [[ ${#CHUNKS_FRONTEND[@]} -eq 0 ]]; then
  if [[ ${#FRONTENDS[@]} -gt 0 ]]; then
    warn "CHUNKS_FRONTEND is empty — run ./review.sh discover to populate"
  else
    info "No frontends configured (CHUNKS_FRONTEND empty)"
  fi
else
  ok "${#CHUNKS_FRONTEND[@]} frontend chunks defined"
fi

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}4. Required tools${NC}"
command -v claude &>/dev/null && \
  ok "claude CLI: $(claude --version 2>/dev/null | head -1 || echo 'found')" || \
  fail "claude CLI not found — install from https://claude.ai/code"

command -v python3 &>/dev/null && ok "python3 (for triage JSON)" || \
  warn "python3 not found — triage risk scoring will be skipped"

command -v git &>/dev/null && ok "git (for hotspot analysis)" || \
  warn "git not available — git hotspot analysis will be skipped"

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}5. Static analysis tools (Phase 0 — free triage)${NC}"

if [[ -n "${STATIC_ANALYSIS_CMD:-}" ]]; then
  # Extract the binary name from the command
  local_bin=$(echo "$STATIC_ANALYSIS_CMD" | awk '{print $1}')
  if [[ "$local_bin" == ddev ]]; then
    command -v ddev &>/dev/null && ok "ddev found (for static analysis)" || \
      warn "ddev not found but STATIC_ANALYSIS_CMD uses ddev"
  elif command -v "$local_bin" &>/dev/null || [[ -f "${PROJECT_ROOT}/${local_bin}" ]]; then
    ok "Static analysis: ${local_bin} found"
  else
    warn "Static analysis binary not found: ${local_bin}"
    info "Ensure ${local_bin} is installed, or set STATIC_ANALYSIS_CMD=\"\" to skip"
  fi
else
  info "Static analysis disabled (STATIC_ANALYSIS_CMD is empty)"
  case "$BACKEND_FRAMEWORK" in
    laravel|drupal|symfony)
      info "  Suggestion: STATIC_ANALYSIS_CMD=\"vendor/bin/phpstan analyse --level=9 --error-format=json\"" ;;
    django)
      info "  Suggestion: STATIC_ANALYSIS_CMD=\"mypy . --no-error-summary\"" ;;
    rails)
      info "  Suggestion: STATIC_ANALYSIS_CMD=\"bundle exec rubocop --format json\"" ;;
    node)
      info "  Suggestion: STATIC_ANALYSIS_CMD=\"npx eslint . --format json\"" ;;
  esac
fi

# Frontend type check
for fe_def in "${FRONTENDS[@]:-}"; do
  [[ -z "$fe_def" ]] && continue
  IFS=':' read -r fe_id fe_type fe_path _ <<< "$fe_def"
  if [[ -d "$fe_path" ]]; then
    # Check for any lockfile
    lockfile_found=false
    for lf in package-lock.json yarn.lock pnpm-lock.yaml bun.lockb; do
      [[ -f "${fe_path}/${lf}" ]] && lockfile_found=true && break
    done
    $lockfile_found && ok "${fe_id}: lockfile found (audit will work)" || \
      warn "${fe_id}: no lockfile found"

    # Check for type checker if configured
    if [[ -n "${FRONTEND_TYPECHECK_CMD:-}" ]]; then
      tc_bin=$(echo "$FRONTEND_TYPECHECK_CMD" | sed 's/npx //' | awk '{print $1}')
      [[ -f "${fe_path}/node_modules/.bin/${tc_bin}" ]] && ok "${fe_id}: ${tc_bin} found" || \
        warn "${fe_id}: ${tc_bin} not found at node_modules — run npm install in ${fe_path}"
    fi
  fi
done

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}6. Frontend repos${NC}"
if [[ ${#FRONTENDS[@]} -eq 0 ]]; then
  info "No frontends configured"
else
  for fe_def in "${FRONTENDS[@]}"; do
    IFS=':' read -r fe_id fe_type fe_path fe_desc <<< "$fe_def"
    if [[ -d "$fe_path" ]]; then
      # Count files based on frontend type
      case "$fe_type" in
        nextjs|react|angular)
          fe_count=$(find "$fe_path" \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" \) -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
          fe_label="TS/TSX/JSX"
          ;;
        nuxt|vue)
          fe_count=$(find "$fe_path" \( -name "*.vue" -o -name "*.ts" \) -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
          fe_label="Vue/TS"
          ;;
        svelte)
          fe_count=$(find "$fe_path" \( -name "*.svelte" -o -name "*.ts" \) -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
          fe_label="Svelte/TS"
          ;;
        *)
          fe_count=$(find "$fe_path" \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \) -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
          fe_label="JS/TS"
          ;;
      esac

      # Detect router/structure
      router=""
      case "$fe_type" in
        nextjs)
          [[ -d "${fe_path}/app" ]] && router="App Router"
          [[ -d "${fe_path}/pages" ]] && router="${router:+${router}+}Pages Router"
          ;;
        nuxt)
          [[ -d "${fe_path}/pages" ]] && router="pages/"
          [[ -d "${fe_path}/layouts" ]] && router="${router:+${router}+}layouts/"
          ;;
        svelte)
          [[ -d "${fe_path}/src/routes" ]] && router="SvelteKit routes"
          ;;
        *)
          [[ -d "${fe_path}/src" ]] && router="src/"
          ;;
      esac

      ok "${fe_id} (${fe_type}): ${fe_count} ${fe_label} files${router:+, ${router}} — ${fe_path}"
      [[ -f "${fe_path}/.env" || -f "${fe_path}/.env.local" ]] && \
        info "  .env found" || \
        warn "  no .env/.env.local — API base URL may not be auto-detected"
    else
      fail "${fe_id}: path not found: ${fe_path}"
      info "  Update FRONTENDS in review.config.sh"
    fi
  done
fi

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}7. Output directories${NC}"
dirs=(
  ".ai/review/chunks" ".ai/review/validated" ".ai/review/master" ".ai/review/manifests"
  ".ai/review/triage" ".ai/review/survey" ".ai/review/.done" ".ai/review/master/spec-checks"
  ".ai/specs" ".ai/specs/rejected"
  "docs/architecture" "docs/context" "docs/context-for-ai" ".claude"
)
for dir in "${dirs[@]}"; do
  mkdir -p "${PROJECT_ROOT}/${dir}" && ok "${dir}/"
done

cat > "${PROJECT_ROOT}/.ai/review/.gitignore" <<'GITIGNORE'
# Auto-generated review data — intermediate files
chunks/
validated/
survey/
triage/
.done/
errors.log
GITIGNORE
ok ".ai/review/.gitignore written"

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}8. Claude auth check${NC}"
# Uses the same headless flags as review.sh so a bare-mode auth problem
# (no ANTHROPIC_API_KEY) surfaces here rather than mid-run.
_run_claude_check() {
  local -a args=(--model "${SURVEY_MODEL:-haiku}" --tools "" \
    --permission-mode "${REVIEW_PERMISSION_MODE:-dontAsk}" \
    --strict-mcp-config --no-session-persistence --max-budget-usd 0.05)
  case "${REVIEW_BARE:-auto}" in
    true|1|yes) args+=(--bare) ;;
    auto) [[ -n "${ANTHROPIC_API_KEY:-}" ]] && args+=(--bare) ;;
  esac
  env -u CLAUDECODE -u CLAUDE_CODE_SSE_PORT -u CLAUDE_CODE_ENTRYPOINT \
      -u CLAUDE_CODE_SESSION_ACCESS_TOKEN \
    claude -p "respond with READY only" "${args[@]}" < /dev/null > /dev/null 2>&1 &
  local pid=$!
  local i=0
  while kill -0 "$pid" 2>/dev/null && [[ $i -lt 30 ]]; do sleep 1; i=$((i+1)); done
  if kill -0 "$pid" 2>/dev/null; then kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; return 1; fi
  wait "$pid" 2>/dev/null
}
if _run_claude_check; then
  ok "claude -p is working (tested with ${SURVEY_MODEL:-haiku})"
else
  warn "claude -p check timed out or failed — log in with 'claude login', or for bare mode export ANTHROPIC_API_KEY (or set REVIEW_BARE=false)"
fi

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}9. deep-review integration${NC}"
dr_found=false
for search_path in \
  "${PROJECT_ROOT}/.claude/commands" \
  "${HOME}/.claude/commands" \
  "${PROJECT_ROOT}/.claude/commands/quality"; do
  if ls "$search_path"/*deep-review* 2>/dev/null | head -1 &>/dev/null; then
    ok "deep-review command found at ${search_path}"
    dr_found=true; break
  fi
done
$dr_found || warn "deep-review command not found — specs will reference it but you must ensure it's installed"

info "deep-review Phase 1 will load these files (written by Phase G):"
info "  ${DEEP_REVIEW_RULES_PATH:-docs/context/business-rules.md}"
info "  ${DEEP_REVIEW_ARCH_PATH:-docs/context/architecture.md}"

# ---------------------------------------------------------------------------
echo ""; printf '%s\n' "${BOLD}10. Scope estimate${NC}"
total_chunks=$(( ${#CHUNKS_BACKEND[@]} + ${#CHUNKS_FRONTEND[@]} ))
info "Framework: ${BACKEND_FRAMEWORK} | Source files: ~${total_src:-?}"
info "Total chunks: ${total_chunks} (${#CHUNKS_BACKEND[@]} backend + ${#CHUNKS_FRONTEND[@]} frontend)"
info ""
info "  Phase 0 (triage): free — static tools only"
info "  Phase A (inventory): free — bash only"
info "  Phase B (survey): ${SURVEY_MODEL:-haiku} x ${total_chunks} calls — cheap"
info "  Phase C (review): ${CLAUDE_MODEL:-sonnet} x (RED+YELLOW chunks from survey)"
info "  Phase D (validate): ${CLAUDE_MODEL:-sonnet} x reviewed chunks"
info "  Phase E-H: ~10 sequential calls"
info ""
info "  Estimated wall time: 4-8 hours (MAX_PARALLEL=${MAX_PARALLEL:-5})"
info "  Survey will skip ~20-40% of chunks (GREEN), reducing Phase C cost"

# ---------------------------------------------------------------------------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $FAILS -eq 0 ]]; then
  if [[ $WARNS -gt 0 ]]; then
    printf '%s\n' "${YELLOW}${BOLD}Warning: ${WARNS} warning(s) — review above, but can proceed.${NC}"
  else
    printf '%s\n' "${GREEN}${BOLD}All checks passed.${NC}"
  fi
  echo ""
  if [[ ${#CHUNKS_BACKEND[@]} -eq 0 ]]; then
    printf '%s\n' "  ${BOLD}First: generate chunk registry${NC}"
    printf '%s\n' "  ${BLUE}./review.sh discover${NC}"
    echo ""
  fi
  printf '%s\n' "  ${BOLD}Quick cost estimate (no AI, ~30s):${NC}"
  printf '%s\n' "  ${BLUE}./review.sh triage${NC}"
  echo ""
  printf '%s\n' "  ${BOLD}Start overnight run (from a plain terminal, NOT inside Claude Code):${NC}"
  printf '%s\n' "  ${BLUE}bash scripts/review/review.sh run > .ai/review/run.log 2>&1 & disown${NC}"
  printf '%s\n' "  ${BLUE}echo \"PID: \$!\" | tee .ai/review/pid.txt${NC}"
  printf '%s\n' "  ${BLUE}tail -f .ai/review/run.log${NC}"
  echo ""
  printf '%s\n' "  ${BOLD}Monitor progress:${NC}"
  printf '%s\n' "  ${BLUE}bash scripts/review/review.sh status${NC}"
  echo ""
  printf '%s\n' "  ${BOLD}Morning:${NC}"
  printf '%s\n' "  ${BLUE}./review.sh status${NC}"
  printf '%s\n' "  ${BLUE}cat NEXT-STEPS.md${NC}              <- start here"
  printf '%s\n' "  ${BLUE}cat docs/context/PROJECT-BRAIN.md${NC} <- full project intelligence"
  printf '%s\n' "  ${BLUE}cat CLARIFICATIONS.md${NC}          <- answer blocking questions"
else
  printf '%s\n' "${RED}${BOLD}${FAILS} error(s) must be fixed before running.${NC}"
fi
echo ""