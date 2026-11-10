#!/usr/bin/env bash
# =============================================================================
# review.sh — Autonomous Codebase Review + Project Intelligence Builder
# Version 5 | Multi-framework | Laravel, Drupal, Django, Rails, Node, generic
# =============================================================================
#
#  DEFAULT STANCE: Code is BUGGY until proven otherwise.
#  The reviewer's job is to prove correctness — or document the failure.
#
# Usage:
#   ./review.sh discover           Auto-generate chunk config from filesystem
#   ./review.sh run                Full pipeline (run overnight)
#   ./review.sh status             Progress dashboard
#   ./review.sh triage             Phase 0 only — free cost estimate
#   ./review.sh survey             Phase B only — cheap survey
#   ./review.sh phase <0|A-I>      Run one phase
#   ./review.sh chunk <id>         Re-run one review chunk
#   ./review.sh revalidate <id>    Re-run validation for one chunk
#   ./review.sh validate-sign-off  Sign off Phase I checklist after human review
#   ./review.sh reset              Wipe all state
# =============================================================================

set -euo pipefail

# Cleanup background processes on exit/signal
trap 'kill $(jobs -p) 2>/dev/null; exit 1' INT TERM
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# ---------------------------------------------------------------------------
# Nested session guard — AI phases cannot run inside Claude Code
# ---------------------------------------------------------------------------
if [[ -n "${CLAUDECODE:-}" ]]; then
  # Non-AI phases (triage, inventory, status, discover, reset, help) work fine
  # AI phases (survey, review, validate, etc.) need their own claude process
  _INSIDE_CLAUDE_CODE=true
else
  _INSIDE_CLAUDE_CODE=false
fi

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/review.config.sh"
[[ -f "$CONFIG_FILE" ]] || {
  echo "ERROR: review.config.sh not found in ${SCRIPT_DIR}"
  echo "Copy review.config.sh to your project root, fill in PROJECT_NAME and FRONTENDS."
  echo "Then run: ./review.sh discover"
  exit 1
}
source "$CONFIG_FILE"

# Validate required config
[[ -z "${PROJECT_NAME:-}" ]] && { echo "ERROR: PROJECT_NAME not set in review.config.sh"; exit 1; }
[[ -z "${PROJECT_DESCRIPTION:-}" ]] && { echo "ERROR: PROJECT_DESCRIPTION not set in review.config.sh"; exit 1; }

# PROJECT_ROOT is the actual project root, not the script directory.
# If scripts live in scripts/review/, resolve upward. If at project root, use SCRIPT_DIR.

is_project_root() {
  local d="$1"
  [[ -d "${d}/.git" ]] || [[ -f "${d}/CLAUDE.md" ]] || \
  [[ -f "${d}/composer.json" ]] || [[ -f "${d}/package.json" ]] || \
  [[ -f "${d}/pyproject.toml" ]] || [[ -f "${d}/Gemfile" ]] || \
  [[ -f "${d}/go.mod" ]] || [[ -f "${d}/Cargo.toml" ]] || \
  [[ -f "${d}/settings.py" ]] || [[ -f "${d}/manage.py" ]]
}

if is_project_root "${SCRIPT_DIR}/../.."; then
  PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
elif is_project_root "${SCRIPT_DIR}"; then
  PROJECT_ROOT="$SCRIPT_DIR"
else
  # Fallback: check for common project markers going up
  PROJECT_ROOT="$SCRIPT_DIR"
  for candidate in "${SCRIPT_DIR}/../.." "${SCRIPT_DIR}/.."; do
    if is_project_root "$candidate"; then
      PROJECT_ROOT="$(cd "$candidate" && pwd)"
      break
    fi
  done
fi

# Resolve output paths
REVIEW_DIR="${PROJECT_ROOT}/${REVIEW_DIR}"
SPECS_DIR="${PROJECT_ROOT}/${SPECS_DIR}"
DOCS_DIR="${PROJECT_ROOT}/${DOCS_DIR}"
CONTEXT_DIR="${PROJECT_ROOT}/${CONTEXT_DIR}"
CONTEXT_AI_DIR="${PROJECT_ROOT}/${CONTEXT_AI_DIR}"
BRAIN_FILE="${PROJECT_ROOT}/${BRAIN_FILE}"
DEEP_REVIEW_RULES_PATH="${PROJECT_ROOT}/${DEEP_REVIEW_RULES_PATH}"
DEEP_REVIEW_ARCH_PATH="${PROJECT_ROOT}/${DEEP_REVIEW_ARCH_PATH}"

CHUNKS_DIR="$REVIEW_DIR/chunks"
VALIDATED_DIR="$REVIEW_DIR/validated"
MASTER_DIR="$REVIEW_DIR/master"
MANIFESTS_DIR="$REVIEW_DIR/manifests"
TRIAGE_DIR="$REVIEW_DIR/triage"
SURVEY_DIR="$REVIEW_DIR/survey"
VALIDATION_DIR="$REVIEW_DIR/validation"
DONE_DIR="$REVIEW_DIR/.done"
ERROR_LOG="$REVIEW_DIR/errors.log"

# Tool sets granted per headless call. Calls that print their result to stdout
# get the read-only set; only calls whose prompt asks for files get Write.
CLAUDE_TOOLS_READ="Read,Grep,Glob"
CLAUDE_TOOLS_SHELL="Read,Grep,Glob,Bash"
CLAUDE_TOOLS_WRITE="Read,Grep,Glob,Write"
REVIEW_BARE="${REVIEW_BARE:-auto}"
REVIEW_PERMISSION_MODE="${REVIEW_PERMISSION_MODE:-dontAsk}"
REVIEW_MAX_BUDGET_USD="${REVIEW_MAX_BUDGET_USD-3.00}"
COMPLEXITY_THRESHOLD="${COMPLEXITY_THRESHOLD:-15}"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; MAGENTA=$'\033[0;35m'
BOLD=$'\033[1m'; NC=$'\033[0m'

# ---------------------------------------------------------------------------
# Utility: strip whitespace from chunk field values
# ---------------------------------------------------------------------------
strip_ws() { echo "${1}" | tr -d $'\t\n\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'; }

# ---------------------------------------------------------------------------
# Expand glob patterns in a space-separated path list relative to PROJECT_ROOT.
# Outputs one directory per line. Non-matching globs and non-existent paths are skipped.
# Usage: while read -r d; do ... done < <(expand_paths "$BACKEND_ROUTES_PATHS")
# ---------------------------------------------------------------------------
expand_paths() {
  local path_list="$1"
  for pattern in $path_list; do
    # Try as absolute path first
    if [[ "$pattern" = /* ]]; then
      for match in $pattern; do
        [[ -d "$match" ]] && echo "$match"
      done
    else
      # Expand relative to PROJECT_ROOT
      for match in ${PROJECT_ROOT}/${pattern}; do
        [[ -d "$match" ]] && echo "$match"
      done
    fi
  done
}

# ---------------------------------------------------------------------------
# State management (lockfiles — atomic, parallel-safe)
# ---------------------------------------------------------------------------
init_dirs() {
  mkdir -p "$CHUNKS_DIR" "$VALIDATED_DIR" "$MASTER_DIR" "$MANIFESTS_DIR" \
           "$TRIAGE_DIR" "$SURVEY_DIR" "$VALIDATION_DIR" "$DONE_DIR" "$DOCS_DIR" \
           "$CONTEXT_DIR" "$CONTEXT_AI_DIR" \
           "${SPECS_DIR}/rejected" "${MASTER_DIR}/spec-checks" \
           "${PROJECT_ROOT}/.claude"
  touch "$ERROR_LOG"
}

is_done()   { [[ -f "${DONE_DIR}/${1//[\/: ]/_}" ]]; }
mark_done() { touch "${DONE_DIR}/${1//[\/: ]/_}"; }
mark_fail() { echo "$(date +%H:%M:%S) FAIL: ${1}" >> "$ERROR_LOG"; }

# ---------------------------------------------------------------------------
# Rate-limit detection — halts pipeline cleanly, resume with `./review.sh run`
# ---------------------------------------------------------------------------
_RATE_LIMITED=false
RATE_LIMIT_PATTERNS="hit your limit|rate limit|usage limit|resets [0-9]|Too many requests|429"

is_rate_limited() { [[ "$_RATE_LIMITED" == "true" ]]; }

check_rate_limit() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  if grep -qiE "$RATE_LIMIT_PATTERNS" "$file" 2>/dev/null; then
    _RATE_LIMITED=true
    return 0
  fi
  return 1
}

halt_rate_limited() {
  local phase="${1:-}"
  echo ""
  printf '  %s\n' "${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
  printf '  %s\n' "${RED}${BOLD}║  RATE LIMIT HIT — Pipeline paused cleanly                   ║${NC}"
  printf '  %s\n' "${RED}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  printf '  %s\n' "Phase: ${BOLD}${phase}${NC}"
  printf '  %s\n' "No lockfiles were created for failed items — resume picks up where it stopped."
  echo ""
  printf '  %s\n' "${BOLD}Resume after limit resets:${NC}"
  printf '  %s\n' "  ${CYAN}bash scripts/review/review.sh run${NC}"
  echo ""
  # Log it
  echo "$(date +%H:%M:%S) RATE-LIMIT: Pipeline halted at ${phase}" >> "$ERROR_LOG"
  exit 2
}

# Call after any AI operation. If rate-limited, halts pipeline.
# Usage: check_or_halt "Phase F" || return 1
check_or_halt() {
  is_rate_limited && halt_rate_limited "${1:-unknown phase}"
}

acquire() { while [[ $(jobs -rp | wc -l) -ge $MAX_PARALLEL ]]; do sleep 1; done; }
drain()   { wait; }

require_standalone() {
  if [[ "$_INSIDE_CLAUDE_CODE" == "true" ]]; then
    err "AI phases cannot run inside Claude Code (nested claude -p hangs)."
    err ""
    err "Run in a separate terminal:"
    err "  cd ${PROJECT_ROOT} && bash scripts/review/review.sh ${1:-run}"
    err ""
    err "Non-AI phases (triage, inventory, status, discover) work fine here."
    exit 1
  fi
}

# Builds the headless flag set shared by every AI call into the CLAUDE_ARGS array.
#   --bare           skips repo hooks, plugins, MCP auto-discovery and CLAUDE.md, so
#                    an untrusted checkout cannot run code through its settings.
#                    It authenticates only via ANTHROPIC_API_KEY (no OAuth), hence
#                    REVIEW_BARE=auto enables it only when that key is present.
#   --tools          limits which built-in tools exist in the session.
#   --allowedTools   pre-approves exactly those tools; with --permission-mode
#                    dontAsk anything else is denied instead of prompting.
#   --max-budget-usd caps spend per call (REVIEW_MAX_BUDGET_USD, empty = no cap).
build_claude_args() {
  local model="$1" tools="$2"
  CLAUDE_ARGS=(
    --model "$model"
    --tools "$tools"
    --allowedTools "$tools"
    --permission-mode "$REVIEW_PERMISSION_MODE"
    --strict-mcp-config
    --no-session-persistence
  )
  case "$REVIEW_BARE" in
    true|1|yes) CLAUDE_ARGS+=(--bare) ;;
    auto) [[ -n "${ANTHROPIC_API_KEY:-}" ]] && CLAUDE_ARGS+=(--bare) ;;
  esac
  [[ -n "$REVIEW_MAX_BUDGET_USD" ]] && CLAUDE_ARGS+=(--max-budget-usd "$REVIEW_MAX_BUDGET_USD")
  return 0
}

# Usage: run_claude <out-file> <prompt> [model] [tools]
# Prints the exit code (124 = timeout, 99 = rate limited).
run_claude() {
  local out="$1" prompt="$2" model="${3:-$CLAUDE_MODEL}" tools="${4:-$CLAUDE_TOOLS_READ}" code=0
  local -a CLAUDE_ARGS
  build_claude_args "$model" "$tools"

  if command -v timeout &>/dev/null; then
    timeout "$CLAUDE_TIMEOUT" claude -p "$prompt" "${CLAUDE_ARGS[@]}" \
      < /dev/null > "$out" 2>>"$ERROR_LOG" || code=$?
  else
    # macOS: no timeout command — use background process with kill
    claude -p "$prompt" "${CLAUDE_ARGS[@]}" \
      < /dev/null > "$out" 2>>"$ERROR_LOG" &
    local pid=$!
    local elapsed=0
    while kill -0 "$pid" 2>/dev/null; do
      sleep 2
      elapsed=$((elapsed + 2))
      if [[ $elapsed -ge $CLAUDE_TIMEOUT ]]; then
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
        code=124  # same as timeout's exit code
        echo "$code"
        return
      fi
    done
    wait "$pid" 2>/dev/null || code=$?
  fi
  # Detect rate limit in output or stderr
  if [[ -f "$out" ]] && check_rate_limit "$out"; then
    rm -f "$out"  # Remove corrupted output
    echo "99"
    return
  fi
  # Also check if stderr captured a rate limit (last 5 lines of error log)
  if tail -5 "$ERROR_LOG" 2>/dev/null | grep -qiE "$RATE_LIMIT_PATTERNS" 2>/dev/null; then
    _RATE_LIMITED=true
    [[ -f "$out" ]] && rm -f "$out"
    echo "99"
    return
  fi
  echo "$code"
}

has_content() {
  [[ -s "$1" ]] || return 1
  [[ $(wc -l < "$1") -gt "${2:-10}" ]] || return 1
  # Detect rate limit — set global flag and reject output
  if check_rate_limit "$1"; then
    rm -f "$1"
    return 1
  fi
  # Reject files that contain other known error patterns
  if grep -qiE "may not exist or you may not have access|There's an issue with the selected model" "$1" 2>/dev/null; then
    warn "Output contains error message: $(head -1 "$1")"
    return 1
  fi
  return 0
}

log()    { printf '%s\n' "${CYAN}[$(date '+%H:%M:%S')]${NC} $*" >&2; }
ok()     { printf '%s\n' "${GREEN}[$(date '+%H:%M:%S')]${NC} $*" >&2; }
warn()   { printf '%s\n' "${YELLOW}[$(date '+%H:%M:%S')]${NC} $*" >&2; }
err()    { printf '%s\n' "${RED}[$(date '+%H:%M:%S')]${NC} $*" >&2; }
phase()  { printf '\n%s\n\n' "${BOLD}${MAGENTA}--- Phase $* ----------------------------------------${NC}"; }
header() {
  printf '\n%s\n' "${BOLD}${BLUE}=========================================${NC}"
  printf '%s\n' "${BOLD}${BLUE}  $*${NC}"
  printf '%s\n\n' "${BOLD}${BLUE}=========================================${NC}"
}

# ---------------------------------------------------------------------------
# Parse a chunk definition string "id|name|paths|focus" into variables
# ---------------------------------------------------------------------------
parse_chunk() {
  local chunk_def="$1"
  IFS='|' read -r _chunk_id _chunk_name _chunk_paths _chunk_focus <<< "$chunk_def"
  _chunk_id="$(strip_ws "$_chunk_id")"
  _chunk_name="$(strip_ws "$_chunk_name")"
  _chunk_paths="$(strip_ws "$_chunk_paths")"
  _chunk_focus="$(strip_ws "$_chunk_focus")"
}

# ---------------------------------------------------------------------------
# Find source files in configured backend paths
# ---------------------------------------------------------------------------
find_in_src() {
  for p in $BACKEND_SRC_PATHS; do
    local abs="${PROJECT_ROOT}/${p}"
    if [[ -d "$abs" ]]; then
      if [[ $# -gt 0 ]]; then
        find "$abs" "$@" 2>/dev/null
      else
        find "$abs" 2>/dev/null
      fi
    fi
  done
}

# Build find expression for source file extensions
find_source_expr() {
  local expr=""
  for ext in $SOURCE_EXTENSIONS; do
    [[ -n "$expr" ]] && expr+=" -o"
    expr+=" -name \"*.${ext}\""
  done
  echo "$expr"
}

# Build grep extension filter for git hotspots
hotspot_grep_pattern() {
  local parts=()
  for ext in $SOURCE_EXTENSIONS; do
    parts+=("\\.$ext\$")
  done
  local IFS='|'; echo "${parts[*]}"
}

# ===========================================================================
# Framework detection and defaults
# ===========================================================================
detect_framework() {
  [[ -n "${BACKEND_FRAMEWORK:-}" ]] && return 0

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
  elif [[ -f "${PROJECT_ROOT}/package.json" ]] && [[ ! -f "${PROJECT_ROOT}/artisan" ]]; then
    BACKEND_FRAMEWORK="node"
  else
    BACKEND_FRAMEWORK="generic"
  fi

  log "Auto-detected backend framework: ${BOLD}${BACKEND_FRAMEWORK}${NC}"
}

detect_project_type() {
  [[ -n "${PROJECT_TYPE:-}" ]] && return 0
  detect_framework
  if [[ ${#FRONTENDS[@]} -gt 0 ]]; then
    PROJECT_TYPE="${BACKEND_FRAMEWORK}+frontend"
  else
    PROJECT_TYPE="$BACKEND_FRAMEWORK"
  fi
}

apply_framework_defaults() {
  detect_framework

  # Source extensions
  if [[ -z "${SOURCE_EXTENSIONS:-}" ]]; then
    case "$BACKEND_FRAMEWORK" in
      laravel|drupal|symfony) SOURCE_EXTENSIONS="php" ;;
      django)                 SOURCE_EXTENSIONS="py" ;;
      rails)                  SOURCE_EXTENSIONS="rb" ;;
      node)                   SOURCE_EXTENSIONS="js ts" ;;
      *)                      SOURCE_EXTENSIONS="php py rb js ts" ;;
    esac
    # Add frontend extensions if frontends defined
    for fe_def in "${FRONTENDS[@]:-}"; do
      [[ -z "$fe_def" ]] && continue
      IFS=':' read -r _ fe_type _ _ <<< "$fe_def"
      case "$fe_type" in
        nextjs|react|angular) SOURCE_EXTENSIONS+=" ts tsx" ;;
        nuxt|vue)             SOURCE_EXTENSIONS+=" ts vue" ;;
        svelte)               SOURCE_EXTENSIONS+=" ts svelte" ;;
      esac
    done
    # Deduplicate
    SOURCE_EXTENSIONS=$(echo "$SOURCE_EXTENSIONS" | tr ' ' '\n' | sort -u | tr '\n' ' ' | sed 's/ $//')
  fi

  # Backend source paths
  if [[ -z "${BACKEND_SRC_PATHS:-}" ]]; then
    case "$BACKEND_FRAMEWORK" in
      laravel)
        if [[ -d "${PROJECT_ROOT}/Modules" ]]; then
          BACKEND_SRC_PATHS="Modules app"
        else
          BACKEND_SRC_PATHS="app"
        fi
        ;;
      # Note: for Laravel modular monoliths with Modules/*/Core/ substructure,
      # set paths explicitly in review.config.sh (e.g. Modules/*/Core/Infrastructure/Routes)
      drupal)
        BACKEND_SRC_PATHS="web/modules/custom web/themes/custom"
        [[ -d "${PROJECT_ROOT}/web/profiles/custom" ]] && BACKEND_SRC_PATHS+=" web/profiles/custom"
        ;;
      symfony)     BACKEND_SRC_PATHS="src" ;;
      django)      BACKEND_SRC_PATHS=$(find "${PROJECT_ROOT}" -maxdepth 2 -name "apps.py" -exec dirname {} \; 2>/dev/null | sed "s|${PROJECT_ROOT}/||" | tr '\n' ' ') ;;
      rails)       BACKEND_SRC_PATHS="app lib" ;;
      node)        BACKEND_SRC_PATHS="src lib" ;;
      *)           BACKEND_SRC_PATHS="src app lib" ;;
    esac
  fi

  # Routes paths
  if [[ -z "${BACKEND_ROUTES_PATHS:-}" ]]; then
    case "$BACKEND_FRAMEWORK" in
      laravel)
        BACKEND_ROUTES_PATHS="routes"
        if [[ -d "${PROJECT_ROOT}/Modules" ]]; then
          # Check both Modules/*/Infrastructure/Routes and Modules/*/Core/Infrastructure/Routes patterns
          BACKEND_ROUTES_PATHS="Modules/*/Infrastructure/Routes Modules/*/Core/Infrastructure/Routes Modules/*/Routes routes"
        fi
        ;;
      drupal)     BACKEND_ROUTES_PATHS="web/modules/custom" ;;
      symfony)    BACKEND_ROUTES_PATHS="config/routes src" ;;
      django)     BACKEND_ROUTES_PATHS=$(find "${PROJECT_ROOT}" -maxdepth 3 -name "urls.py" 2>/dev/null | sed "s|${PROJECT_ROOT}/||" | tr '\n' ' ') ;;
      rails)      BACKEND_ROUTES_PATHS="config" ;;
      node)       BACKEND_ROUTES_PATHS="src/routes routes" ;;
      *)          BACKEND_ROUTES_PATHS="" ;;
    esac
  fi

  # Jobs/workers paths
  if [[ -z "${BACKEND_JOBS_PATHS:-}" ]]; then
    case "$BACKEND_FRAMEWORK" in
      laravel)    BACKEND_JOBS_PATHS="app/Jobs Modules/*/Jobs Modules/*/Core/Application/Jobs app/Console Modules/*/Console Modules/*/Core/Console" ;;
      drupal)     BACKEND_JOBS_PATHS="web/modules/custom" ;;
      symfony)    BACKEND_JOBS_PATHS="src/MessageHandler src/Command" ;;
      django)     BACKEND_JOBS_PATHS="*/tasks.py */management/commands" ;;
      rails)      BACKEND_JOBS_PATHS="app/jobs app/workers" ;;
      node)       BACKEND_JOBS_PATHS="src/jobs src/workers src/queues" ;;
      *)          BACKEND_JOBS_PATHS="" ;;
    esac
  fi

  # Events paths
  if [[ -z "${BACKEND_EVENTS_PATHS:-}" ]]; then
    case "$BACKEND_FRAMEWORK" in
      laravel)    BACKEND_EVENTS_PATHS="app/Events Modules/*/Events Modules/*/Core/Domain/Events app/Listeners Modules/*/Listeners Modules/*/Core/Application/Listeners" ;;
      drupal)     BACKEND_EVENTS_PATHS="web/modules/custom" ;;
      symfony)    BACKEND_EVENTS_PATHS="src/EventListener src/EventSubscriber" ;;
      django)     BACKEND_EVENTS_PATHS="*/signals.py" ;;
      rails)      BACKEND_EVENTS_PATHS="app/models/concerns" ;;
      *)          BACKEND_EVENTS_PATHS="" ;;
    esac
  fi

  # Mail/notification paths
  if [[ -z "${BACKEND_MAIL_PATHS:-}" ]]; then
    case "$BACKEND_FRAMEWORK" in
      laravel)    BACKEND_MAIL_PATHS="app/Mail app/Notifications Modules/*/Mail Modules/*/Core/Application/Mail Modules/*/Notifications Modules/*/Core/Application/Notifications resources/views/emails" ;;
      drupal)     BACKEND_MAIL_PATHS="web/modules/custom" ;;
      symfony)    BACKEND_MAIL_PATHS="src/Notification templates/email" ;;
      django)     BACKEND_MAIL_PATHS="*/email* templates/email" ;;
      rails)      BACKEND_MAIL_PATHS="app/mailers app/views" ;;
      node)       BACKEND_MAIL_PATHS="src/mail src/email" ;;
      *)          BACKEND_MAIL_PATHS="" ;;
    esac
  fi

  # Migration paths
  if [[ -z "${BACKEND_MIGRATION_PATHS:-}" ]]; then
    case "$BACKEND_FRAMEWORK" in
      laravel)
        BACKEND_MIGRATION_PATHS="database/migrations"
        [[ -d "${PROJECT_ROOT}/Modules" ]] && BACKEND_MIGRATION_PATHS+=" $(find "${PROJECT_ROOT}/Modules" -path "*/Database/Migrations" -type d 2>/dev/null | sed "s|${PROJECT_ROOT}/||" | tr '\n' ' ')"
        ;;
      drupal)     BACKEND_MIGRATION_PATHS="web/modules/custom/*/migrations" ;;
      symfony)    BACKEND_MIGRATION_PATHS="migrations" ;;
      django)     BACKEND_MIGRATION_PATHS="$(find "${PROJECT_ROOT}" -maxdepth 3 -type d -name migrations 2>/dev/null | sed "s|${PROJECT_ROOT}/||" | tr '\n' ' ')" ;;
      rails)      BACKEND_MIGRATION_PATHS="db/migrate" ;;
      node)       BACKEND_MIGRATION_PATHS="migrations src/migrations database/migrations" ;;
      *)          BACKEND_MIGRATION_PATHS="" ;;
    esac
  fi

  # Backwards compatibility: PHPSTAN_CMD -> STATIC_ANALYSIS_CMD
  [[ -z "${STATIC_ANALYSIS_CMD:-}" ]] && [[ -n "${PHPSTAN_CMD:-}" ]] && STATIC_ANALYSIS_CMD="$PHPSTAN_CMD"
  [[ -z "${STATIC_ANALYSIS_ERROR_THRESHOLD:-}" ]] && [[ -n "${PHPSTAN_ERROR_THRESHOLD:-}" ]] && \
    STATIC_ANALYSIS_ERROR_THRESHOLD="$PHPSTAN_ERROR_THRESHOLD"
  STATIC_ANALYSIS_ERROR_THRESHOLD="${STATIC_ANALYSIS_ERROR_THRESHOLD:-10}"
}

# ---------------------------------------------------------------------------
# Framework-specific patterns
# ---------------------------------------------------------------------------
get_security_patterns() {
  case "$BACKEND_FRAMEWORK" in
    laravel|symfony)
      echo 'DB::raw\|->whereRaw\|->selectRaw:Raw SQL (potential injection)'
      echo 'eval(\|exec(\|shell_exec(\|system(:Code execution'
      echo 'unserialize(:Unsafe deserialization'
      echo 'protected \$guarded = \[\]:Mass assignment — empty guarded'
      echo 'dd(\|dump(\|var_dump(:Debug statements'
      ;;
    drupal)
      echo 'db_query\|->query(:Raw SQL (potential injection)'
      echo 'eval(\|exec(\|shell_exec(\|system(:Code execution'
      echo 'unserialize(:Unsafe deserialization'
      echo 'drupal_set_message\|dsm(\|dpm(\|kint(:Debug statements'
      echo '\$_GET\|\$_POST\|\$_REQUEST:Direct superglobal access'
      ;;
    django)
      echo 'cursor\.execute\|\.raw(\|\.extra(:Raw SQL (potential injection)'
      echo 'eval(\|exec(\|os\.system\|subprocess\.call:Code execution'
      echo 'pickle\.loads\|yaml\.load(:Unsafe deserialization'
      echo 'print(\|pdb\|breakpoint():Debug statements'
      echo 'ALLOWED_HOSTS.*\*:Wildcard allowed hosts'
      ;;
    rails)
      echo '\.where.*#\{:SQL interpolation (injection risk)'
      echo 'eval(\|system(\|exec(\|`:Code execution'
      echo 'Marshal\.load\|YAML\.load:Unsafe deserialization'
      echo 'binding\.pry\|byebug\|debugger:Debug statements'
      echo 'attr_accessible:Deprecated mass assignment'
      ;;
    node)
      echo 'eval(\|Function(:Code execution'
      echo 'child_process\|exec(\|execSync:Shell execution'
      echo 'innerHTML\|dangerouslySetInnerHTML:XSS risk'
      echo 'console\.log\|console\.debug:Debug statements'
      echo 'deserialize\|JSON\.parse.*req\.:Unsafe deserialization'
      ;;
    *)
      echo 'eval(\|exec(:Code execution'
      echo 'TODO\|FIXME\|HACK:Code markers'
      echo "password\|secret\|token.*=.*[\"']:Hardcoded secrets"
      ;;
  esac
}

get_route_grep_pattern() {
  case "$BACKEND_FRAMEWORK" in
    laravel)    echo 'Route::(get|post|put|patch|delete|any|resource|apiResource)' ;;
    drupal)     echo '^\s+path:|_menu\|_routing' ;;
    symfony)    echo '#\[Route\|@Route\|path:' ;;
    django)     echo 'path(\|re_path(\|url(' ;;
    rails)      echo 'resources\|get \|post \|put \|patch \|delete \|root ' ;;
    node)       echo 'router\.(get|post|put|patch|delete)\|app\.(get|post|put|patch|delete)' ;;
    *)          echo '(get|post|put|patch|delete|route|path|url)' ;;
  esac
}

get_background_patterns() {
  case "$BACKEND_FRAMEWORK" in
    laravel)
      echo "EVENTS:use Dispatchable|extends Event"
      echo "LISTENERS:Listener|Handler"
      echo "JOBS:implements ShouldQueue"
      echo "OBSERVERS:Observer"
      echo "SCHEDULE:->daily|->hourly|->weekly|->everyMinute|->cron"
      echo "SCHEDULE_FILE:Kernel.php:*/Console/*"
      ;;
    drupal)
      echo "EVENTS:EventSubscriberInterface|getSubscribedEvents"
      echo "HOOKS:function.*_cron|function.*_hook"
      echo "JOBS:QueueWorkerBase|@QueueWorker"
      echo "PLUGINS:@.*Plugin|PluginBase"
      ;;
    symfony)
      echo "EVENTS:EventSubscriberInterface|#\[AsEventListener\]"
      echo "LISTENERS:EventListener|EventSubscriber"
      echo "JOBS:MessageHandlerInterface|#\[AsMessageHandler\]"
      echo "SCHEDULE:#\[AsCronTask\]|schedule:"
      ;;
    django)
      echo "SIGNALS:signal|receiver|post_save|pre_save"
      echo "TASKS:@shared_task|@app.task|celery"
      echo "COMMANDS:BaseCommand|handle"
      echo "MIDDLEWARE:MiddlewareMixin|process_request"
      ;;
    rails)
      echo "JOBS:ApplicationJob|ActiveJob|perform"
      echo "CALLBACKS:before_action|after_action|around_action"
      echo "MAILERS:ApplicationMailer|ActionMailer"
      echo "CHANNELS:ApplicationCable|ActionCable"
      ;;
    node)
      echo "EVENTS:EventEmitter|on\(|emit\("
      echo "JOBS:Bull|Agenda|bee-queue|worker"
      echo "MIDDLEWARE:middleware|use\("
      echo "CRON:cron|schedule|node-cron"
      ;;
    *)
      echo "EVENTS:event|emit|dispatch|publish"
      echo "JOBS:job|task|worker|queue"
      echo "SCHEDULE:cron|schedule|periodic"
      ;;
  esac
}

get_coding_standards_criterion() {
  case "$BACKEND_FRAMEWORK" in
    laravel|symfony)  echo "Code style — PSR-12, strict_types, type hints, return types" ;;
    drupal)           echo "Code style — Drupal coding standards, strict_types, type hints" ;;
    django)           echo "Code style — PEP 8, type annotations, docstrings" ;;
    rails)            echo "Code style — Ruby style guide, RuboCop conventions, YARD docs" ;;
    node)             echo "Code style — ESLint rules, TypeScript strict mode, JSDoc" ;;
    *)                echo "Code style — language conventions, type safety, documentation" ;;
  esac
}

check_strict_mode() {
  case "$BACKEND_FRAMEWORK" in
    laravel|drupal|symfony)
      local no_strict
      no_strict=$(find_in_src -name "*.php" 2>/dev/null | xargs grep -rL "declare(strict_types=1)" 2>/dev/null | wc -l | tr -d ' ' || true); no_strict="${no_strict:-0}"
      echo "## Missing strict_types"
      echo "PHP files without strict_types: **${no_strict}**"
      ;;
    django)
      local no_hints
      no_hints=$(find_in_src -name "*.py" 2>/dev/null | xargs grep -rL "from __future__ import annotations\|-> " 2>/dev/null | wc -l | tr -d ' ' || true); no_hints="${no_hints:-0}"
      echo "## Type Annotations"
      echo "Python files without type annotations: **${no_hints}** (approximate)"
      ;;
    node)
      if [[ -f "${PROJECT_ROOT}/tsconfig.json" ]]; then
        local strict; strict=$(grep '"strict"' "${PROJECT_ROOT}/tsconfig.json" 2>/dev/null || echo "not found")
        echo "## TypeScript Strict Mode"
        echo "tsconfig.json strict: ${strict}"
      fi
      ;;
    *)
      echo "## Type Safety"
      echo "_No framework-specific type safety check available._"
      ;;
  esac
}

# Resolve module/component name from a file path for risk.json grouping
module_from_path() {
  local path="$1"
  local rel="${path#$PROJECT_ROOT/}"
  case "$BACKEND_FRAMEWORK" in
    laravel)
      python3 -c "import re, sys; m=re.search(r'Modules/([^/]+)', sys.argv[1]); print(m.group(1) if m else 'app')" "$rel" 2>/dev/null || echo "app"
      ;;
    drupal)
      python3 -c "import re, sys; m=re.search(r'web/modules/custom/([^/]+)', sys.argv[1]); print(m.group(1) if m else 'core')" "$rel" 2>/dev/null || echo "core"
      ;;
    django)
      python3 -c "import sys; parts=sys.argv[1].split('/'); print(parts[0] if parts else 'app')" "$rel" 2>/dev/null || echo "app"
      ;;
    rails|node|symfony)
      python3 -c "import re, sys; m=re.search(r'src/([^/]+)', sys.argv[1]); p=sys.argv[1].split('/'); print(m.group(1) if m else (p[0] if p else 'app'))" "$rel" 2>/dev/null || echo "app"
      ;;
    *)
      python3 -c "import sys; parts=sys.argv[1].split('/'); print(parts[0] if parts else 'app')" "$rel" 2>/dev/null || echo "app"
      ;;
  esac
}

# ===========================================================================
# DISCOVER — auto-generate chunk registry from filesystem
# ===========================================================================
cmd_discover() {
  local force="${1:-}"
  header "Discover — auto-generating chunk registry for ${PROJECT_NAME}"

  apply_framework_defaults

  if [[ ${#CHUNKS_BACKEND[@]} -gt 0 ]] && [[ "$force" != "--force" ]]; then
    warn "CHUNKS_BACKEND already defined in review.config.sh"
    warn "Run './review.sh discover --force' to overwrite"
    return 0
  fi

  local chunks_backend=()
  local chunks_frontend=()

  log "Scanning backend structure (framework: ${BACKEND_FRAMEWORK})..."

  case "$BACKEND_FRAMEWORK" in
    laravel)
      if [[ -d "${PROJECT_ROOT}/Modules" ]]; then
        log "  Detected: modular monolith (Modules/ directory)"
        while IFS= read -r module_dir; do
          local mod; mod=$(basename "$module_dir")
          local php_count; php_count=$(find "$module_dir" -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
          [[ $php_count -eq 0 ]] && continue

          # Detect Core/ intermediate directory (e.g. Modules/OnePass/Core/Domain)
          local layer_base="$module_dir"
          [[ -d "${module_dir}/Core" ]] && layer_base="${module_dir}/Core"

          if [[ $php_count -gt 40 ]]; then
            for layer in Domain Application Infrastructure; do
              local layer_dir="${layer_base}/${layer}"
              [[ -d "$layer_dir" ]] || continue
              local lcount; lcount=$(find "$layer_dir" -name "*.php" 2>/dev/null | wc -l | tr -d ' ')
              [[ $lcount -eq 0 ]] && continue
              local id; id=$(echo "${mod}-${layer}" | tr '[:upper:]' '[:lower:]' | tr ' /' '-')
              chunks_backend+=("${id}|${mod} — ${layer}|${layer_dir}|${layer} layer of ${mod} module")
            done
          else
            local id; id=$(echo "$mod" | tr '[:upper:]' '[:lower:]' | tr ' /' '-')
            chunks_backend+=("mod-${id}|${mod} Module|${module_dir}|Full module: domain logic, services, controllers, migrations, events")
          fi
        done <<< "$(find "${PROJECT_ROOT}/Modules" -mindepth 1 -maxdepth 1 -type d | sort)"

        chunks_backend+=(
          "cross-module|Cross-Module Communication|${PROJECT_ROOT}/Modules|Events, Listeners, Observers. Map: fired_by -> event -> listener -> effect."
          "infra-routes|Routing & Middleware|${BACKEND_ROUTES_PATHS}|API versioning, route groups, middleware stack, auth guards, rate limiting"
          "infra-jobs|Jobs, Commands & Schedules|${BACKEND_JOBS_PATHS}|Every job: trigger/queue/payload/failure. Every command. Every scheduled task."
          "infra-notifications|Emails & Notifications|${BACKEND_MAIL_PATHS}|Every mailable/notification: trigger, recipient, channels, template, data"
        )

      elif [[ -d "${PROJECT_ROOT}/app" ]]; then
        log "  Detected: standard Laravel app/ structure"
        for subdir in Http/Controllers Services Models Events Jobs Mail Notifications Policies; do
          local d="${PROJECT_ROOT}/app/${subdir}"
          [[ -d "$d" ]] || continue
          local id; id="app-$(echo "$subdir" | tr '/' '-' | tr '[:upper:]' '[:lower:]')"
          chunks_backend+=("${id}|app/${subdir}|${d}|${subdir} layer")
        done
        chunks_backend+=(
          "infra-routes|Routes|${BACKEND_ROUTES_PATHS}|All route definitions, middleware, auth guards"
          "infra-jobs|Jobs & Commands|${BACKEND_JOBS_PATHS}|Queued jobs, Artisan commands, scheduled tasks"
        )
      fi
      ;;

    drupal)
      log "  Detected: Drupal"
      local custom_modules="${PROJECT_ROOT}/web/modules/custom"
      if [[ -d "$custom_modules" ]]; then
        while IFS= read -r module_dir; do
          local mod; mod=$(basename "$module_dir")
          local file_count; file_count=$(find "$module_dir" -name "*.php" -o -name "*.yml" 2>/dev/null | wc -l | tr -d ' ')
          [[ $file_count -eq 0 ]] && continue
          local id; id=$(echo "$mod" | tr '[:upper:]' '[:lower:]' | tr ' /' '-')
          chunks_backend+=("mod-${id}|${mod} Module|${module_dir}|Drupal custom module: hooks, services, plugins, routes, forms")
        done <<< "$(find "$custom_modules" -mindepth 1 -maxdepth 1 -type d | sort)"
      fi
      [[ -d "${PROJECT_ROOT}/web/themes/custom" ]] && \
        chunks_backend+=("themes|Custom Themes|${PROJECT_ROOT}/web/themes/custom|Theme templates, preprocessing, JS")
      chunks_backend+=(
        "infra-config|Config & Install|${PROJECT_ROOT}/web/modules/custom|config/install, config/schema, hook_install"
        "infra-routes|Routes & Access|${BACKEND_ROUTES_PATHS}|routing.yml, access callbacks, controllers"
      )
      ;;

    symfony)
      log "  Detected: Symfony"
      if [[ -d "${PROJECT_ROOT}/src" ]]; then
        for subdir in Controller Service Repository Entity EventListener EventSubscriber Command MessageHandler; do
          local d="${PROJECT_ROOT}/src/${subdir}"
          [[ -d "$d" ]] || continue
          local id; id="src-$(echo "$subdir" | tr '[:upper:]' '[:lower:]')"
          chunks_backend+=("${id}|src/${subdir}|${d}|${subdir} layer")
        done
      fi
      chunks_backend+=(
        "infra-routes|Routes|${BACKEND_ROUTES_PATHS}|Route definitions and controllers"
        "infra-jobs|Message Handlers|${BACKEND_JOBS_PATHS}|Async message handlers and commands"
      )
      ;;

    django)
      log "  Detected: Django"
      while IFS= read -r apps_file; do
        local app_dir; app_dir=$(dirname "$apps_file")
        local app_name; app_name=$(basename "$app_dir")
        local file_count; file_count=$(find "$app_dir" -name "*.py" 2>/dev/null | wc -l | tr -d ' ')
        [[ $file_count -eq 0 ]] && continue
        local id; id=$(echo "$app_name" | tr '[:upper:]' '[:lower:]' | tr ' /' '-')
        chunks_backend+=("app-${id}|${app_name} App|${app_dir}|Django app: models, views, serializers, signals, tasks")
      done <<< "$(find "${PROJECT_ROOT}" -maxdepth 2 -name "apps.py" | sort)"
      chunks_backend+=(
        "infra-routes|URL Patterns|${BACKEND_ROUTES_PATHS}|All urlpatterns, routers, path definitions"
        "infra-jobs|Celery Tasks|${BACKEND_JOBS_PATHS}|Async tasks, periodic tasks, management commands"
      )
      ;;

    rails)
      log "  Detected: Rails"
      for subdir in controllers models services jobs mailers; do
        local d="${PROJECT_ROOT}/app/${subdir}"
        [[ -d "$d" ]] || continue
        local id; id="app-${subdir}"
        chunks_backend+=("${id}|app/${subdir}|${d}|${subdir} layer")
      done
      chunks_backend+=(
        "infra-routes|Routes|${BACKEND_ROUTES_PATHS}|config/routes.rb — all resources and routes"
        "infra-jobs|Jobs & Workers|${BACKEND_JOBS_PATHS}|ActiveJob, Sidekiq workers"
      )
      ;;

    node)
      log "  Detected: Node.js"
      for subdir in routes controllers services models middleware; do
        local d
        for base in src lib app; do
          d="${PROJECT_ROOT}/${base}/${subdir}"
          [[ -d "$d" ]] && break
        done
        [[ -d "$d" ]] || continue
        local id; id="src-${subdir}"
        chunks_backend+=("${id}|${subdir}|${d}|${subdir} layer")
      done
      chunks_backend+=(
        "infra-routes|Routes|${BACKEND_ROUTES_PATHS}|All route definitions and middleware"
        "infra-jobs|Jobs & Workers|${BACKEND_JOBS_PATHS}|Background jobs, queue workers"
      )
      ;;

    *)
      log "  Generic project structure"
      for d in src app lib; do
        [[ -d "${PROJECT_ROOT}/${d}" ]] && \
          chunks_backend+=("src-${d}|${d}/|${PROJECT_ROOT}/${d}|Source files")
      done
      ;;
  esac

  # Database/migrations (framework-aware)
  local mig_paths=""
  for mp in $BACKEND_MIGRATION_PATHS; do
    local abs_mp="${PROJECT_ROOT}/${mp}"
    [[ -d "$abs_mp" ]] && mig_paths="${mig_paths} ${abs_mp}"
    [[ -d "$mp" ]] && mig_paths="${mig_paths} ${mp}"
  done
  mig_paths="${mig_paths# }"
  [[ -n "$mig_paths" ]] && chunks_backend+=("schema|Database Schema & Migrations|${mig_paths}|ERD, foreign keys, indexes, N+1 risks")

  chunks_backend+=(
    "infra-config|Config & Environment|${PROJECT_ROOT}/config ${PROJECT_ROOT}/.env.example|App config, cache, queue, mail, services"
    "infra-deploy|Deploy & Infra|${PROJECT_ROOT}/commands.sh ${PROJECT_ROOT}/.ddev ${PROJECT_ROOT}/docker-compose.yml ${PROJECT_ROOT}/Makefile|Deploy steps, env parity, risks"
  )

  log "Scanning frontends..."
  for fe_def in "${FRONTENDS[@]:-}"; do
    [[ -z "$fe_def" ]] && continue
    IFS=':' read -r fe_id fe_type fe_path fe_desc <<< "$fe_def"
    [[ -d "$fe_path" ]] || { warn "  Frontend path not found: ${fe_path}"; continue; }

    # Count source files based on frontend type
    local src_count
    case "$fe_type" in
      nextjs|react|angular) src_count=$(find "$fe_path" \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | wc -l | tr -d ' ') ;;
      nuxt|vue)             src_count=$(find "$fe_path" \( -name "*.ts" -o -name "*.vue" \) 2>/dev/null | wc -l | tr -d ' ') ;;
      svelte)               src_count=$(find "$fe_path" \( -name "*.ts" -o -name "*.svelte" \) 2>/dev/null | wc -l | tr -d ' ') ;;
      *)                    src_count=$(find "$fe_path" \( -name "*.ts" -o -name "*.js" \) 2>/dev/null | wc -l | tr -d ' ') ;;
    esac
    log "  ${fe_id} (${fe_type}) — ${src_count} source files at ${fe_path}"
    chunks_frontend+=(
      "fe-${fe_id}-pages|${fe_desc} — Pages & Permissions|${fe_path}/app ${fe_path}/pages ${fe_path}/src|Every route/page: path, purpose, auth required, role gates."
      "fe-${fe_id}-api|${fe_desc} — API Consumption|${fe_path}|Every API call: URL, method, payload, response used. Error handling."
      "fe-${fe_id}-state|${fe_desc} — State & Auth|${fe_path}|Auth flow, token storage/refresh, global state, optimistic updates."
    )
  done

  log "Writing chunk registry to review.config.sh..."
  local tmp; tmp=$(mktemp)
  local marker_start="# --- Chunk registry"
  local marker_end="# --- End chunk registry"

  # Remove old chunk registry section (between markers) or old-style arrays
  if grep -q "$marker_start" "$CONFIG_FILE"; then
    sed "/${marker_start}/,/${marker_end}/d" "$CONFIG_FILE" > "$tmp"
  else
    python3 -c "
import re
with open('${CONFIG_FILE}') as f: content = f.read()
content = re.sub(r'\n# --- Chunk registry.*', '', content, flags=re.DOTALL)
content = re.sub(r'\ndeclare -a CHUNKS_BACKEND=\(.*?\)\n', '\n', content, flags=re.DOTALL)
content = re.sub(r'\ndeclare -a CHUNKS_FRONTEND=\(.*?\)\n', '\n', content, flags=re.DOTALL)
with open('${tmp}', 'w') as f: f.write(content.rstrip() + '\n')
" 2>/dev/null || cp "$CONFIG_FILE" "$tmp"
  fi

  {
    echo ""
    echo "${marker_start} (generated $(date '+%Y-%m-%d') by ./review.sh discover) ---"
    echo "declare -a CHUNKS_BACKEND=("
    for c in "${chunks_backend[@]}"; do
      echo "  \"${c}\""
    done
    echo ")"
    echo ""
    echo "declare -a CHUNKS_FRONTEND=("
    for c in "${chunks_frontend[@]}"; do
      echo "  \"${c}\""
    done
    echo ")"
    echo "${marker_end} ---"
  } >> "$tmp"

  cp "$tmp" "$CONFIG_FILE"
  rm "$tmp"

  local total=$(( ${#chunks_backend[@]} + ${#chunks_frontend[@]} ))
  ok "Chunk registry written: ${#chunks_backend[@]} backend + ${#chunks_frontend[@]} frontend = ${total} total"
  echo ""
  printf '  Review and edit: %s\n' "${CYAN}review.config.sh${NC}"
  printf '  Then run:        %s\n' "${BLUE}./review.sh run${NC}"
}

# ===========================================================================
# PHASE 0 — TRIAGE  (non-AI, free, produces risk scores)
# ===========================================================================
phase_0_triage() {
  phase "0 — TRIAGE  (non-AI, free)"
  is_done "phase-0" && { log "[0] skip (done)"; return 0; }

  apply_framework_defaults

  local report="${TRIAGE_DIR}/triage-report.md"
  local risk_json="${TRIAGE_DIR}/risk.json"
  : > "$report"; echo "{}" > "$risk_json"

  {
    echo "# Triage Report — ${PROJECT_NAME}"
    echo "_Generated: $(date '+%Y-%m-%d %H:%M') | Non-AI static analysis | Framework: ${BACKEND_FRAMEWORK}_"
    echo ""

    # 0.1 Static analysis
    if [[ -n "${STATIC_ANALYSIS_CMD:-}" ]]; then
      echo "## Static Analysis"
      log "[0.1] Running static analysis..."
      local sa_out="${TRIAGE_DIR}/static-analysis.json"
      local sa_err="${TRIAGE_DIR}/static-analysis-stderr.txt"
      (cd "${PROJECT_ROOT}" && eval "${STATIC_ANALYSIS_CMD}") \
        > "$sa_out" 2>"$sa_err" || true
      local error_count
      error_count=$(python3 -c "
import json, sys
try:
    d = json.load(open('${sa_out}'))
    # PHPStan JSON format
    if 'totals' in d:
        print(d['totals'].get('errors', d['totals'].get('file_errors', 0)))
    # Generic: count errors key
    elif 'errors' in d:
        e = d['errors']
        print(len(e) if isinstance(e, list) else e)
    else:
        print('?')
except:
    # If JSON parse fails, check if file has content at all
    import os
    if os.path.getsize('${sa_out}') == 0:
        print('(no output — check ${sa_err})')
    else:
        print('?')
" 2>/dev/null || echo "?")
      echo "Total errors: **${error_count}**"
      ok "[0.1] Static analysis done — ${error_count} errors"
    else
      echo "## Static Analysis: skipped (STATIC_ANALYSIS_CMD not configured)"
    fi

    # 0.2 TypeScript check
    echo ""; echo "## TypeScript Type Check"
    for fe_def in "${FRONTENDS[@]:-}"; do
      [[ -z "$fe_def" ]] && continue
      IFS=':' read -r fe_id _ fe_path _ <<< "$fe_def"
      [[ -d "$fe_path" ]] || continue
      log "[0.2] TypeScript check: ${fe_id}..."
      local ts_out="${TRIAGE_DIR}/tsc-${fe_id}.txt"
      (cd "$fe_path" && eval "${FRONTEND_TYPECHECK_CMD}" > "$ts_out" 2>&1) || true
      local ts_errors; ts_errors=$(grep -c "error TS" "$ts_out" 2>/dev/null | tr -d ' \n' || true); ts_errors="${ts_errors:-0}"
      echo "### ${fe_id}: ${ts_errors} type errors"
      [[ $ts_errors -gt 0 ]] && head -30 "$ts_out" | sed 's/^/  /' || true
    done
    ok "[0.2] TypeScript checks done"

    # 0.3 Security audit
    echo ""; echo "## Dependency Audit"
    if [[ -f "${PROJECT_ROOT}/composer.json" ]]; then
      log "[0.3] composer audit..."
      local comp_out="${TRIAGE_DIR}/composer-audit.txt"
      (cd "${PROJECT_ROOT}" && composer audit 2>&1) > "$comp_out" || true
      echo "### Composer: $(grep -c 'Found' "$comp_out" 2>/dev/null || echo 0) vulnerabilities"
    fi
    if [[ -f "${PROJECT_ROOT}/Gemfile.lock" ]]; then
      log "[0.3] bundle audit..."
      local gem_out="${TRIAGE_DIR}/bundle-audit.txt"
      (cd "${PROJECT_ROOT}" && bundle audit check --update 2>&1) > "$gem_out" || true
      echo "### Gems: $(grep -c 'Vulnerability' "$gem_out" 2>/dev/null || echo 0) vulnerabilities"
    fi
    if [[ -f "${PROJECT_ROOT}/pyproject.toml" ]] || [[ -f "${PROJECT_ROOT}/requirements.txt" ]]; then
      log "[0.3] pip audit..."
      local pip_out="${TRIAGE_DIR}/pip-audit.txt"
      (cd "${PROJECT_ROOT}" && pip-audit 2>&1) > "$pip_out" || true
      echo "### Python: checked (see ${pip_out})"
    fi
    for fe_def in "${FRONTENDS[@]:-}"; do
      [[ -z "$fe_def" ]] && continue
      IFS=':' read -r fe_id _ fe_path _ <<< "$fe_def"
      [[ -f "${fe_path}/package.json" ]] || continue
      log "[0.3] npm audit: ${fe_id}..."
      local npm_out="${TRIAGE_DIR}/npm-audit-${fe_id}.txt"
      (cd "$fe_path" && npm audit --json 2>/dev/null || npm audit 2>&1) > "$npm_out" || true
      echo "### ${fe_id} npm: checked"
    done
    ok "[0.3] Dependency audit done"

    # 0.4 Git hotspots
    echo ""; echo "## Git Hotspots (most-changed files in 90 days)"
    log "[0.4] Git hotspot analysis..."
    local hotspot_out="${TRIAGE_DIR}/hotspots.txt"
    git -C "${PROJECT_ROOT}" log --since="90 days ago" --name-only --pretty=format: 2>/dev/null | \
      grep -E "$(hotspot_grep_pattern)" | sort | uniq -c | sort -rn | head -30 > "$hotspot_out" || true
    echo '```'
    head -25 "$hotspot_out" | awk '{printf "  %3d changes  %s\n", $1, $2}' || echo "  (git log not available)"
    echo '```'
    ok "[0.4] Git hotspots done"

    # 0.5 Complexity grep
    echo ""; echo "## Complexity Indicators"
    log "[0.5] Complexity grep..."
    local complexity_out="${TRIAGE_DIR}/complexity.txt"
    {
      echo "### Files with high branch count"
      case "$BACKEND_FRAMEWORK" in
        laravel|drupal|symfony)
          find_in_src -name "*.php" 2>/dev/null | while read -r f; do
            local count; count=$(grep -cE "^\s+(if|else|elseif|case|for|foreach|while|catch)\b" "$f" 2>/dev/null | tr -d ' \n' || true); count="${count:-0}"
            [[ $count -gt $COMPLEXITY_THRESHOLD ]] && echo "  ${count}  ${f#$PROJECT_ROOT/}" || true
          done | sort -rn | head -20
          ;;
        django)
          find_in_src -name "*.py" 2>/dev/null | while read -r f; do
            local count; count=$(grep -cE "^\s+(if|elif|else|for|while|except|with)\b" "$f" 2>/dev/null | tr -d ' \n' || true); count="${count:-0}"
            [[ $count -gt $COMPLEXITY_THRESHOLD ]] && echo "  ${count}  ${f#$PROJECT_ROOT/}" || true
          done | sort -rn | head -20
          ;;
        rails)
          find_in_src -name "*.rb" 2>/dev/null | while read -r f; do
            local count; count=$(grep -cE "^\s+(if|elsif|else|case|when|rescue|for|while|until)\b" "$f" 2>/dev/null | tr -d ' \n' || true); count="${count:-0}"
            [[ $count -gt $COMPLEXITY_THRESHOLD ]] && echo "  ${count}  ${f#$PROJECT_ROOT/}" || true
          done | sort -rn | head -20
          ;;
        node)
          find_in_src \( -name "*.ts" -o -name "*.js" \) 2>/dev/null | while read -r f; do
            local count; count=$(grep -cE "^\s+(if|else|switch|case|for|while|catch)\b" "$f" 2>/dev/null | tr -d ' \n' || true); count="${count:-0}"
            [[ $count -gt $COMPLEXITY_THRESHOLD ]] && echo "  ${count}  ${f#$PROJECT_ROOT/}" || true
          done | sort -rn | head -20
          ;;
        *)
          find_in_src 2>/dev/null | while read -r f; do
            local count; count=$(grep -cE "^\s+(if|else|case|for|while|catch|except)\b" "$f" 2>/dev/null | tr -d ' \n' || true); count="${count:-0}"
            [[ $count -gt $COMPLEXITY_THRESHOLD ]] && echo "  ${count}  ${f#$PROJECT_ROOT/}" || true
          done | sort -rn | head -20
          ;;
      esac
      echo ""
      echo "### Large source files (>150 lines)"
      # Build extension filter: only source code files, not .md/.json/.txt etc.
      local ext_pattern; ext_pattern=$(hotspot_grep_pattern)
      find_in_src 2>/dev/null | grep -E "$ext_pattern" | while read -r f; do
        local size; size=$(wc -l < "$f" 2>/dev/null | tr -d ' \n' || true); size="${size:-0}"
        [[ $size -gt 150 ]] && echo "  ${size}L  ${f#$PROJECT_ROOT/}" || true
      done | sort -rn | head -15
    } > "$complexity_out"
    cat "$complexity_out" | sed 's/^/  /'
    ok "[0.5] Complexity analysis done"

    # 0.6 Security pattern scan
    echo ""; echo "## Security Pattern Scan"
    log "[0.6] Security patterns..."
    local sec_out="${TRIAGE_DIR}/security-patterns.txt"
    {
      local src_dirs=""
      for p in $BACKEND_SRC_PATHS; do
        [[ -d "${PROJECT_ROOT}/${p}" ]] && src_dirs="${src_dirs} ${PROJECT_ROOT}/${p}"
      done

      # Build --include flags from SOURCE_EXTENSIONS (only scan source code, not .md/.json/etc.)
      local include_flags=""
      for ext in $SOURCE_EXTENSIONS; do
        include_flags="${include_flags} --include=*.${ext}"
      done

      while IFS= read -r pattern_label; do
        [[ -z "$pattern_label" ]] && continue
        local pattern="${pattern_label%%:*}"
        local label="${pattern_label#*:}"
        local hits
        hits=$(grep -rn $include_flags "$pattern" $src_dirs \
          2>/dev/null | grep -v "_test\|Test\|Spec\|\.blade\." | head -10 || true)
        if [[ -n "$hits" ]]; then
          echo "### ${label}"
          echo "$hits" | while read -r line; do echo "  ${line#$PROJECT_ROOT/}"; done
        fi
      done <<< "$(get_security_patterns)"
    } > "$sec_out"
    [[ -s "$sec_out" ]] && cat "$sec_out" || echo "  No critical patterns found."
    ok "[0.6] Security scan done"

    # 0.7 Type safety / strict mode check
    echo ""
    check_strict_mode

    echo ""
    echo "---"
    echo "## Risk Summary"
    echo "_Used by Phase B (survey) to prioritize what to review deeply_"

  } > "$report"

  # Write risk.json for survey
  python3 - <<PYEOF 2>/dev/null || true
import json, os, re

risk = {}
framework = "${BACKEND_FRAMEWORK}"

sa_f = "${TRIAGE_DIR}/static-analysis.json"
if os.path.exists(sa_f):
    try:
        d = json.load(open(sa_f))
        for path, v in d.get("files", {}).items():
            errors = len(v.get("messages", []))
            if errors > 0:
                if framework == "laravel":
                    m = re.search(r"Modules/([^/]+)", path)
                    mod = m.group(1) if m else "app"
                elif framework == "drupal":
                    m = re.search(r"web/modules/custom/([^/]+)", path)
                    mod = m.group(1) if m else "core"
                elif framework in ("rails", "node", "symfony"):
                    m = re.search(r"src/([^/]+)", path)
                    parts = path.split("/")
                    mod = m.group(1) if m else (parts[0] if parts else "app")
                else:
                    parts = path.split("/")
                    mod = parts[0] if parts else "app"
                risk.setdefault(mod, {"static_analysis": 0, "hotspots": 0, "security": 0})
                risk[mod]["static_analysis"] += errors
    except: pass

hotspot_f = "${TRIAGE_DIR}/hotspots.txt"
if os.path.exists(hotspot_f):
    for line in open(hotspot_f):
        parts = line.strip().split()
        if len(parts) >= 2:
            count, path = parts[0], parts[1]
            if framework == "laravel":
                m = re.search(r"Modules/([^/]+)", path)
                mod = m.group(1) if m else "app"
            elif framework == "drupal":
                m = re.search(r"web/modules/custom/([^/]+)", path)
                mod = m.group(1) if m else "core"
            else:
                path_parts = path.split("/")
                mod = path_parts[0] if path_parts else "app"
            risk.setdefault(mod, {"static_analysis": 0, "hotspots": 0, "security": 0})
            risk[mod]["hotspots"] += int(count)

sec_f = "${TRIAGE_DIR}/security-patterns.txt"
if os.path.exists(sec_f):
    for line in open(sec_f):
        if framework == "laravel":
            m = re.search(r"Modules/([^/]+)", line)
        elif framework == "drupal":
            m = re.search(r"web/modules/custom/([^/]+)", line)
        else:
            m = None
        if m:
            mod = m.group(1)
            risk.setdefault(mod, {"static_analysis": 0, "hotspots": 0, "security": 0})
            risk[mod]["security"] += 1

threshold = ${STATIC_ANALYSIS_ERROR_THRESHOLD}
result = {}
for mod, scores in risk.items():
    total = scores["static_analysis"] * 3 + scores["hotspots"] + scores["security"] * 5
    if scores["static_analysis"] > threshold or scores["security"] > 0 or total > 30:
        level = "RED"
    elif total > 10:
        level = "YELLOW"
    else:
        level = "GREEN"
    result[mod] = {"level": level, "scores": scores, "total": total}

json.dump(result, open("${risk_json}", "w"), indent=2)
PYEOF

  mark_done "phase-0"
  ok "[0] Triage complete -> ${report}"

  if [[ -f "$risk_json" ]]; then
    printf '  %s\n' "${BOLD}Module risk scores:${NC}"
    python3 -c "
import json
d = json.load(open('${risk_json}'))
for mod, v in sorted(d.items(), key=lambda x: -x[1]['total']):
    lvl = v['level']
    col = '\033[0;31m' if lvl == 'RED' else ('\033[1;33m' if lvl == 'YELLOW' else '\033[0;32m')
    sa = v['scores'].get('static_analysis', v['scores'].get('phpstan', 0))
    print(f'  {col}{lvl}\033[0m  {mod}  (static_analysis={sa}, hotspots={v[\"scores\"][\"hotspots\"]}, security={v[\"scores\"][\"security\"]})')
" 2>/dev/null || cat "$risk_json"
  fi
}

# ===========================================================================
# PHASE A — INVENTORY  (non-AI, ~30s)
# ===========================================================================
phase_a_inventory() {
  phase "A — INVENTORY  (non-AI)"
  is_done "phase-a" && { log "[A] skip (done)"; return 0; }

  apply_framework_defaults

  local route_pattern; route_pattern=$(get_route_grep_pattern)

  # Routes
  log "[A] Routes..."
  {
    echo "# Route Manifest — ${PROJECT_NAME} — $(date '+%Y-%m-%d')"
    while read -r abs_p; do
      find "${abs_p}" -type f 2>/dev/null | sort | while read -r f; do
        if grep -qE "$route_pattern" "$f" 2>/dev/null; then
          echo "## ${f#$PROJECT_ROOT/}"
          grep -E "$route_pattern" "$f" 2>/dev/null | head -100 || true
          echo ""
        fi
      done || true
    done < <(expand_paths "$BACKEND_ROUTES_PATHS")
  } > "${MANIFESTS_DIR}/routes.txt"

  # Background systems
  log "[A] Background systems..."
  {
    echo "# Background Systems — ${PROJECT_NAME} — $(date '+%Y-%m-%d')"
    echo "# Framework: ${BACKEND_FRAMEWORK}"
    echo ""

    while IFS= read -r bg_line; do
      [[ -z "$bg_line" ]] && continue
      local section="${bg_line%%:*}"
      local pattern="${bg_line#*:}"

      echo "## ${section}"
      if [[ "$section" == "SCHEDULE_FILE" ]]; then
        # Special case: search for specific filenames
        local fname="${pattern%%:*}"
        local fglob="${pattern#*:}"
        find "${PROJECT_ROOT}" -name "$fname" -path "$fglob" 2>/dev/null | while read -r f; do
          grep -E "->daily|->hourly|->weekly|->everyMinute|->cron" "$f" 2>/dev/null | sed 's/^/  /' || true
        done
      else
        local ext_filter; ext_filter=$(hotspot_grep_pattern)
        find_in_src 2>/dev/null | grep -E "$ext_filter" | xargs grep -lE "$pattern" 2>/dev/null | sort | \
          while read -r f; do echo "  - ${f#$PROJECT_ROOT/}"; done || true
      fi
      echo ""
    done <<< "$(get_background_patterns)"
  } > "${MANIFESTS_DIR}/background.txt"

  # Notifications (only for frameworks with mail concepts)
  case "$BACKEND_FRAMEWORK" in
    laravel|drupal|symfony|django|rails|node)
      log "[A] Notifications..."
      {
        echo "# Emails & Notifications — ${PROJECT_NAME} — $(date '+%Y-%m-%d')"
        case "$BACKEND_FRAMEWORK" in
          laravel)
            echo "## Mailables"
            {
              while read -r abs_mp; do
                find "$abs_mp" -name "*.php" 2>/dev/null
              done < <(expand_paths "$BACKEND_MAIL_PATHS")
              # Also search all source paths for Mailables not in mail-specific dirs
              find_in_src 2>/dev/null | grep -E '\.php$'
            } | sort -u | xargs grep -l "extends Mailable" 2>/dev/null | sort -u | while read -r f; do
              echo "  - ${f#$PROJECT_ROOT/}"
            done || true
            echo "## Notifications"
            {
              while read -r abs_mp; do
                find "$abs_mp" -name "*.php" 2>/dev/null
              done < <(expand_paths "$BACKEND_MAIL_PATHS")
              # Also search all source paths for Notifications not in mail-specific dirs
              find_in_src 2>/dev/null | grep -E '\.php$'
            } | sort -u | xargs grep -l "extends Notification" 2>/dev/null | sort -u | while read -r f; do
              echo "  - ${f#$PROJECT_ROOT/}"
            done || true
            ;;
          drupal)
            echo "## Mail Hooks"
            find_in_src -name "*.module" -o -name "*.php" 2>/dev/null | \
              xargs grep -l "hook_mail\b\|->mail(" 2>/dev/null | sort | while read -r f; do
                echo "  - ${f#$PROJECT_ROOT/}"
              done || true
            ;;
          symfony)
            echo "## Mailers & Notifications"
            find_in_src -name "*.php" 2>/dev/null | \
              xargs grep -l "TemplatedEmail\|NotificationInterface\|Mailer" 2>/dev/null | sort | while read -r f; do
                echo "  - ${f#$PROJECT_ROOT/}"
              done || true
            ;;
          django)
            echo "## Email calls"
            find_in_src -name "*.py" 2>/dev/null | \
              xargs grep -l "send_mail\|EmailMessage\|send_templated_mail" 2>/dev/null | sort | while read -r f; do
                echo "  - ${f#$PROJECT_ROOT/}"
              done || true
            ;;
          rails)
            echo "## Mailers"
            find "${PROJECT_ROOT}/app/mailers" -name "*.rb" 2>/dev/null | sort | while read -r f; do
              echo "  - ${f#$PROJECT_ROOT/}"
            done || true
            ;;
          node)
            echo "## Mail modules"
            find_in_src 2>/dev/null | xargs grep -l "nodemailer\|sendgrid\|ses\|smtp" 2>/dev/null | sort | while read -r f; do
              echo "  - ${f#$PROJECT_ROOT/}"
            done || true
            ;;
        esac
      } > "${MANIFESTS_DIR}/notifications.txt"
      ;;
  esac

  # Frontend API patterns
  log "[A] Frontend patterns..."
  {
    echo "# Frontend API Patterns — ${PROJECT_NAME} — $(date '+%Y-%m-%d')"
    for fe_def in "${FRONTENDS[@]:-}"; do
      [[ -z "$fe_def" ]] && continue
      IFS=':' read -r fe_id fe_type fe_path _ <<< "$fe_def"
      echo "## ${fe_id} (${fe_path})"
      [[ -d "$fe_path" ]] || { echo "  WARNING: path not found"; continue; }
      echo "### API client candidates"
      # Build find expression for this frontend type
      local fe_find_args=()
      case "$fe_type" in
        nextjs|react|angular) fe_find_args=(-name "*.ts" -o -name "*.tsx") ;;
        nuxt|vue)             fe_find_args=(-name "*.ts" -o -name "*.vue") ;;
        svelte)               fe_find_args=(-name "*.ts" -o -name "*.svelte") ;;
        *)                    fe_find_args=(-name "*.ts" -o -name "*.js") ;;
      esac
      find "$fe_path" \( "${fe_find_args[@]}" \) 2>/dev/null | \
        xargs grep -l "axios\|fetch(\|useSWR\|useQuery\|createApi" 2>/dev/null | \
        grep -i "api\|client\|http\|service" 2>/dev/null | head -10 | \
        while read -r f; do echo "  - ${f#$fe_path/}"; done || true
    done
  } > "${MANIFESTS_DIR}/frontend-patterns.txt"

  mark_done "phase-a"
  ok "[A] Inventory complete"
}

# ===========================================================================
# PHASE B — SURVEY  (cheap model, reads triage + file list, not full code)
# ===========================================================================
build_survey_prompt() {
  local chunk_def="$1"
  parse_chunk "$chunk_def"
  local id="$_chunk_id" name="$_chunk_name" paths="$_chunk_paths"

  # Determine extensions: frontend chunks need JS/TS, backend uses SOURCE_EXTENSIONS
  local extensions="$SOURCE_EXTENSIONS"
  if [[ "$id" == fe-* ]]; then
    extensions="ts tsx js jsx vue svelte"
  fi

  # Build find expression dynamically
  local file_list
  file_list=$(for p in $paths; do
    if [[ -d "$p" ]]; then
      for ext in $extensions; do
        find "$p" -name "*.${ext}" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null | \
          sed "s|${PROJECT_ROOT}/||"
      done
    fi
  done | sort -u | head -80)

  local risk_data=""
  [[ -f "${TRIAGE_DIR}/risk.json" ]] && \
    risk_data=$(python3 -c "
import json
d = json.load(open('${TRIAGE_DIR}/risk.json'))
matches = {k: v for k, v in d.items() if any(k.lower() in p.lower() for p in '${paths}'.split())}
if matches:
    for m, v in matches.items():
        sa = v['scores'].get('static_analysis', v['scores'].get('phpstan', 0))
        print(f'{m}: {v[\"level\"]} (static_analysis={sa}, hotspots={v[\"scores\"][\"hotspots\"]})')
" 2>/dev/null || echo "")

  cat <<PROMPT
You are doing a QUICK TRIAGE SURVEY. 3 minutes max. Do NOT read full file contents.
Use LS and Glob to see file names and sizes only.

## Chunk: ${name} (${id})
## Paths: ${paths}

## File list (from filesystem scan):
${file_list}

## Triage data (static analysis results):
${risk_data:-"No triage data for this chunk."}

## Your task
Based on the file list and triage data above:
1. Assign a risk level: RED / YELLOW / GREEN
2. Explain why in 2-3 sentences
3. List specific files/classes that MUST be reviewed deeply in Phase C
4. List any files you think are probably fine (can skip or skim)
5. Suggest 2-3 specific questions the deep reviewer should investigate

## Output format (ONLY this, nothing else):

RISK: RED|YELLOW|GREEN
REASON: [2-3 sentences]
FOCUS: [comma-separated file paths or class names]
SKIP: [comma-separated — probably fine]
INVESTIGATE: [question 1 | question 2 | question 3]
PROMPT
}

run_survey_chunk() {
  local chunk_def="$1"
  parse_chunk "$chunk_def"
  local id="$_chunk_id" name="$_chunk_name"
  local key="survey:${id}"
  is_done "$key" && { log "  [B] skip: ${name}"; return 0; }

  log "  [B] surveying: ${BOLD}${name}${NC}"
  local out="${SURVEY_DIR}/${id}.txt"
  local code; code=$(run_claude "$out" "$(build_survey_prompt "$chunk_def")" "$SURVEY_MODEL")

  if [[ $code -eq 0 ]] && [[ -s "$out" ]]; then
    mark_done "$key"
    local risk; risk=$(grep "^RISK:" "$out" 2>/dev/null | head -1 | cut -d: -f2 | tr -d ' ' || echo "?")
    local color="${YELLOW}"
    [[ "$risk" == "RED" ]] && color="${RED}"
    [[ "$risk" == "GREEN" ]] && color="${GREEN}"
    ok "  [B] ${name}: ${color}${risk}${NC}"
  else
    mark_fail "$key"
    echo "RISK: YELLOW" > "$out"
    echo "REASON: Survey failed — defaulting to YELLOW" >> "$out"
    warn "  [B] survey failed for ${name} — defaulting YELLOW"
  fi
}

phase_b_survey() {
  require_standalone "survey"
  phase "B — SURVEY  (${SURVEY_MODEL}, parallel, file-list only)"
  local all_chunks=("${CHUNKS_BACKEND[@]:-}" "${CHUNKS_FRONTEND[@]:-}")
  local fail=0
  for chunk_def in "${all_chunks[@]}"; do
    [[ -z "$chunk_def" ]] && continue
    acquire
    run_survey_chunk "$chunk_def" || ((fail++)) || true &
    sleep 0.3
  done
  drain
  check_or_halt "Phase B — Survey"

  echo ""
  printf '  %s\n' "${BOLD}Survey results:${NC}"
  local red=0 yellow=0 green=0
  for f in "${SURVEY_DIR}"/*.txt; do
    [[ -f "$f" ]] || continue
    local risk; risk=$(grep "^RISK:" "$f" | cut -d: -f2 | tr -d ' ')
    case "$risk" in
      RED)    ((red++)) || true ;;
      YELLOW) ((yellow++)) || true ;;
      GREEN)  ((green++)) || true ;;
    esac
  done
  printf '  %s: %s chunks\n' "${RED}RED (deep review)${NC}" "$red"
  printf '  %s: %s chunks\n' "${YELLOW}YELLOW (review)${NC}" "$yellow"
  printf '  %s: %s chunks\n' "${GREEN}GREEN (skip)${NC}" "$green"
  echo ""
  printf '  AI review cost reduced by ~%s chunks vs reviewing everything\n' "$green"
  ok "[B] Survey complete"
}

# ===========================================================================
# PHASE C — REVIEW  (full model, targeted, assume buggy stance)
# ===========================================================================
should_deep_review() {
  local id="$1"
  local survey_file="${SURVEY_DIR}/${id}.txt"
  [[ ! -f "$survey_file" ]] && echo "true" && return
  local risk; risk=$(grep "^RISK:" "$survey_file" | cut -d: -f2 | tr -d ' ' || echo "YELLOW")
  [[ "$risk" == "GREEN" ]] && echo "false" || echo "true"
}

build_review_prompt() {
  local id="$1" name="$2" paths="$3" focus="$4" is_fe="${5:-false}"

  local survey_focus="" survey_questions=""
  local survey_file="${SURVEY_DIR}/${id}.txt"
  if [[ -f "$survey_file" ]]; then
    survey_focus=$(grep "^FOCUS:" "$survey_file" | cut -d: -f2- || true)
    survey_questions=$(grep "^INVESTIGATE:" "$survey_file" | cut -d: -f2- || true)
  fi

  local manifests=""
  [[ -f "${MANIFESTS_DIR}/routes.txt" ]] && manifests="## Routes\n$(cat "${MANIFESTS_DIR}/routes.txt")\n"
  [[ "$is_fe" == "true" ]] && manifests+="## Frontend patterns\n$(cat "${MANIFESTS_DIR}/frontend-patterns.txt" 2>/dev/null)\n"

  local triage=""
  [[ -f "${TRIAGE_DIR}/triage-report.md" ]] && triage=$(head -80 "${TRIAGE_DIR}/triage-report.md")

  local coding_standards; coding_standards=$(get_coding_standards_criterion)

  cat <<PROMPT
You are performing a deep adversarial code review of ${PROJECT_NAME} — ${PROJECT_DESCRIPTION}

## YOUR DEFAULT STANCE
This code is BUGGY until you prove otherwise.
Do not write "this looks correct" — prove it by tracing every code path.
Your job: find actual bugs with evidence, OR demonstrate correctness with evidence.

## Chunk: ${name} (id: ${id})
## Paths: ${paths}
## Focus: ${focus}

${survey_questions:+"## Questions from survey (investigate these)\n${survey_questions}\n"}
${survey_focus:+"## Files flagged as high-risk\n${survey_focus}\n"}

${manifests}

## Triage context
${triage}

## Critical rules
1. Read EVERY file in paths. Do not skip any.
2. EVERY finding requires: exact file path + line number + code snippet.
3. Trace actual code paths — don't assume happy path is the only path.
4. Null/zero/empty/concurrent — test these against every method.
5. Check: what happens if called twice? Out of order? After failure?

## The 13 adversarial review criteria
1.  Security — SQL injection, mass assignment, auth bypass, exposed secrets
2.  Architecture — module boundary violations, wrong layer dependencies
3.  Overengineering — unnecessary complexity
4.  Practice violations — anti-patterns
5.  ${coding_standards}
6.  Business logic — does the code match domain requirements?
7.  Bugs — race conditions, off-by-one, null dereference, wrong comparisons
8.  Better approaches — simpler/safer way to do the same thing
9.  Coding standards — naming, structure, consistency
10. SOLID — are responsibilities correctly separated?
11. Design patterns — right patterns applied correctly?
12. Test coverage — are edge cases tested?
13. Technical debt — what causes pain in 6 months?

## Output format (start with # Review)

# Review: ${name}
_id: ${id} | date: $(date '+%Y-%m-%d %H:%M') | stance: assume-buggy_

## 1. Correctness Verdict
## 2. Structure Overview
## 3. Business Logic Found
## 4. Bugs Found
## 5. Security Issues
## 6. Performance Issues
## 7. Architecture Violations
## 8. Improvements
$(if [[ "$is_fe" == "true" ]]; then echo "## 9. API Consumption Map
## 10. Permission Gates"; fi)
## Key Findings Summary
PROMPT
}

run_review_chunk() {
  local chunk_def="$1"
  parse_chunk "$chunk_def"
  local id="$_chunk_id" name="$_chunk_name" paths="$_chunk_paths" focus="$_chunk_focus"
  local key="review:${id}"

  is_done "$key" && { log "  [C] skip (done): ${name}"; return 0; }

  local should_review; should_review=$(should_deep_review "$id")
  if [[ "$should_review" == "false" ]]; then
    log "  [C] skip (GREEN): ${name}"
    echo "# Review: ${name}" > "${CHUNKS_DIR}/${id}.md"
    echo "_Survey verdict: GREEN — skipped deep review_" >> "${CHUNKS_DIR}/${id}.md"
    mark_done "$key"
    return 0
  fi

  local is_fe="false"; [[ "$id" == fe-* ]] && is_fe="true"

  log "  [C] reviewing: ${BOLD}${name}${NC}"
  local out="${CHUNKS_DIR}/${id}.md"
  local code; code=$(run_claude "$out" "$(build_review_prompt "$id" "$name" "$paths" "$focus" "$is_fe")")

  if [[ $code -eq 0 ]] && has_content "$out" 20; then
    mark_done "$key"; ok "  [C] done: ${name} ($(wc -l < "$out")L)"
  elif [[ $code -eq 124 ]] && has_content "$out" 40; then
    mark_done "$key"; warn "  [C] timeout partial ok: ${name}"
  else
    mark_fail "$key"; err "  [C] failed (exit ${code}): ${name}"; return 1
  fi
}

phase_c_review() {
  phase "C — DEEP REVIEW  (assume buggy, parallel, ${MAX_PARALLEL} concurrent)"
  local all_chunks=("${CHUNKS_BACKEND[@]:-}" "${CHUNKS_FRONTEND[@]:-}")
  local fail=0
  for chunk_def in "${all_chunks[@]}"; do
    [[ -z "$chunk_def" ]] && continue
    acquire
    run_review_chunk "$chunk_def" || ((fail++)) || true &
    sleep 0.5
  done
  drain
  check_or_halt "Phase C — Deep Review"
  local reviewed; reviewed=$(ls "${CHUNKS_DIR}"/*.md 2>/dev/null | wc -l || echo 0)
  ok "[C] Review done. ${reviewed} chunks reviewed. Failures: ${fail}"
}

# ===========================================================================
# PHASE D — VALIDATE  (semi-blind adversarial, parallel)
# ===========================================================================
build_validate_prompt() {
  local id="$1" name="$2" chunk_file="$3"

  local refs; refs=$(grep -oE '`[A-Za-z0-9/_.-]+\.(php|tsx?|jsx?|py|rb|go|rs|vue|svelte):[0-9]+`' "$chunk_file" 2>/dev/null | \
    tr -d '`' | sort -u | head -50 || echo "(see report for references)")

  cat <<PROMPT
You are the SECOND AI reviewer — adversarial validation of an AI-generated report.
Your job: catch what the first reviewer missed, and reject what it got wrong.

## DEFAULT STANCE
Assume the original reviewer was overconfident and saw bugs that aren't there.
Assume the original reviewer was also blind to bugs that ARE there.

## Step 1 — Read the CODE (before reading the report)
These file:line locations were referenced. Read each one NOW.
${refs}

## Step 2 — Read the report
File: ${chunk_file}

## Step 3 — Apply 13 criteria independently

## Output format

# Validation: ${name}
_id: ${id} | validated: $(date '+%Y-%m-%d %H:%M')_

## Summary
| CONFIRMED | UNCONFIRMED | REJECTED | New findings |
|---|---|---|---|

## Chunk Verdict
**BLOCKED** / **CHANGES_REQUIRED** / **APPROVED**

---
### [finding-id]: [title]
**verdict**: CONFIRMED / UNCONFIRMED / REJECTED
**severity**: CRITICAL / MAJOR / MINOR / OBSERVATION
**verification**: [what you found reading the actual code]

## New Findings
## Clarifications Required
PROMPT
}

run_validate_chunk() {
  local chunk_def="$1"
  parse_chunk "$chunk_def"
  local id="$_chunk_id" name="$_chunk_name"
  local key="validate:${id}"
  local src="${CHUNKS_DIR}/${id}.md"

  is_done "$key" && { log "  [D] skip: ${name}"; return 0; }
  [[ ! -f "$src" ]] && { warn "  [D] no review for ${id}"; return 0; }

  grep -q "Survey verdict: GREEN" "$src" 2>/dev/null && {
    log "  [D] skip (GREEN stub): ${name}"
    cp "$src" "${VALIDATED_DIR}/${id}.md"
    mark_done "$key"; return 0
  }

  log "  [D] validating: ${BOLD}${name}${NC}"
  local out="${VALIDATED_DIR}/${id}.md"
  local code; code=$(run_claude "$out" "$(build_validate_prompt "$id" "$name" "$src")")

  if [[ $code -eq 0 ]] && has_content "$out" 15; then
    mark_done "$key"
    local c r u v
    c=$(grep -c "CONFIRMED" "$out" 2>/dev/null || echo 0)
    r=$(grep -c "REJECTED" "$out" 2>/dev/null || echo 0)
    u=$(grep -c "UNCONFIRMED" "$out" 2>/dev/null || echo 0)
    v=$(grep -oE '(BLOCKED|CHANGES_REQUIRED|APPROVED)' "$out" | head -1 || echo "?")
    ok "  [D] ${name}: ${c} confirmed, ${r} rejected, ${u} unconfirmed -> ${v}"
  elif [[ $code -eq 124 ]] && has_content "$out" 25; then
    mark_done "$key"; warn "  [D] timeout partial: ${name}"
  else
    mark_fail "$key"; err "  [D] failed (exit ${code}): ${name}"; return 1
  fi
}

phase_d_validate() {
  phase "D — VALIDATE  (semi-blind adversarial, parallel)"
  local all_chunks=("${CHUNKS_BACKEND[@]:-}" "${CHUNKS_FRONTEND[@]:-}")
  local fail=0
  for chunk_def in "${all_chunks[@]}"; do
    [[ -z "$chunk_def" ]] && continue
    acquire
    run_validate_chunk "$chunk_def" || ((fail++)) || true &
    sleep 0.5
  done
  drain
  check_or_halt "Phase D — Validation"
  local blocked; blocked=$(grep -l "BLOCKED" "${VALIDATED_DIR}"/*.md 2>/dev/null | wc -l || echo 0)
  ok "[D] Validation done. Blocked chunks: ${blocked}. Failures: ${fail}"
}

# ===========================================================================
# PHASE E — AGGREGATE  (5 separate calls)
# ===========================================================================
all_validated() {
  cat "${VALIDATED_DIR}"/*.md 2>/dev/null | head -n "${1:-8000}"
}

phase_e1_architecture() {
  is_done "e1-arch" && { log "[E1] skip"; return 0; }
  log "[E1] architecture.md..."
  local out="${DOCS_DIR}/architecture.md"
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Write the architecture reference for ${PROJECT_NAME} (${PROJECT_DESCRIPTION}).
CONFIRMED findings -> definitive statements. UNCONFIRMED -> flag. REJECTED -> omit.

## Source
$(all_validated 3000)

## Output format
# Architecture Reference — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d')_
## Tech Stack
## Module Hierarchy
## Per-Module Details
## Key Data Flows
## Frontend Architecture
## Authentication & Authorization
## API Structure
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  has_content "$out" 40 && { mark_done "e1-arch"; ok "[E1] architecture.md"; } || { err "[E1] failed"; return 1; }
}

phase_e2_business_logic() {
  is_done "e2-bl" && { log "[E2] skip"; return 0; }
  log "[E2] business-logic.md..."
  local out="${DOCS_DIR}/business-logic.md"
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Write the business logic reference for ${PROJECT_NAME}. Ground truth for AI agents.
CONFIRMED only in main doc. UNCONFIRMED -> appendix.

## Source
$(all_validated 6000)

## Output format
# Business Logic Reference — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d')_
Per business rule: trigger, conditions, fields set, side effects, edge cases, verdict.
## Edge Cases Register
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  has_content "$out" 50 && { mark_done "e2-bl"; ok "[E2] business-logic.md"; } || { err "[E2] failed"; return 1; }
}

phase_e3_api_contracts() {
  is_done "e3-api" && { log "[E3] skip"; return 0; }
  log "[E3] api-contracts.md..."
  local out="${DOCS_DIR}/api-contracts.md"
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Write the API contracts for ${PROJECT_NAME}. Every endpoint + callers.

## Source
$(all_validated 5000)
## Route manifest
$(cat "${MANIFESTS_DIR}/routes.txt" 2>/dev/null)

## Output format
# API Contracts — ${PROJECT_NAME}
Per endpoint: Auth, Request, Response, Errors, Called by, Events fired, Side effects.
## Gaps (backend not called / frontend calling nonexistent)
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  has_content "$out" 30 && { mark_done "e3-api"; ok "[E3] api-contracts.md"; } || { err "[E3] failed"; return 1; }
}

phase_e4_background() {
  is_done "e4-bg" && { log "[E4] skip"; return 0; }
  log "[E4] background-systems.md..."
  local out="${DOCS_DIR}/background-systems.md"
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Write the background systems reference for ${PROJECT_NAME}.

## Source
$(all_validated 4000)
## Background manifest
$(cat "${MANIFESTS_DIR}/background.txt" 2>/dev/null)
## Notifications manifest
$(cat "${MANIFESTS_DIR}/notifications.txt" 2>/dev/null)

## Output format
# Background Systems — ${PROJECT_NAME}
## Event System  ## Queued Jobs  ## Observers  ## Scheduled Tasks  ## Emails & Notifications
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  has_content "$out" 30 && { mark_done "e4-bg"; ok "[E4] background-systems.md"; } || { err "[E4] failed"; return 1; }
}

phase_e5_bugs_and_specs() {
  is_done "e5-specs" && { log "[E5] skip"; return 0; }

  log "[E5a] bugs register..."
  local bugs_out="${MASTER_DIR}/bugs-and-risks.md"
  local code
  code=$(run_claude "$bugs_out" "$(cat <<PROMPT
Compile bugs register for ${PROJECT_NAME}. CONFIRMED only -> main register. UNCONFIRMED -> appendix. REJECTED -> omit.
## Source
$(all_validated 8000)

## Output format
# Bugs & Risks Register — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d')_
Sorted: Critical -> High -> Medium -> Low
### BUG-[n]: [title]
- Severity: / Type: / Module: / File: / Description: / Evidence: / Impact: / Fix hint:
---
## Appendix: Unconfirmed Risks
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  has_content "$bugs_out" 20 && ok "[E5a] bugs register" || { warn "[E5a] bugs register appears empty — check ${bugs_out}"; }

  log "[E5b] improvement backlog..."
  local bl_out="${MASTER_DIR}/improvement-backlog.md"
  code=$(run_claude "$bl_out" "$(cat <<PROMPT
Compile improvement backlog for ${PROJECT_NAME} from validated review output. CONFIRMED only.
## Source
$(all_validated 5000)

## Output format
# Improvement Backlog — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d')_
## Quick Wins (S effort) ## Refactoring (M effort) ## Architecture (L effort)
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  has_content "$bl_out" 10 && ok "[E5b] backlog" || { warn "[E5b] backlog appears empty — check ${bl_out}"; }

  log "[E5c] generating specs..."
  local spec_log="${MASTER_DIR}/spec-gen.log"
  code=$(run_claude "$spec_log" "$(cat <<PROMPT
Generate spec files for every CONFIRMED actionable item.
## Bugs
$(cat "$bugs_out" 2>/dev/null)
## Backlog
$(cat "$bl_out" 2>/dev/null)
## Priority: P1=Critical/High+Security, P2=Medium+QuickWin, P3=Refactor/Low

For each item: create ${SPECS_DIR}/REVIEW-P{n}-$(date +%Y%m%d)-{slug}/ with:
- spec-lite.md (overview, context, acceptance criteria, risk, dependencies, Post-Implementation Gate with /deep-review)
- tasks.md (pre-impl checklist, T1-T4, T_FINAL deep-review gate)

Every spec-lite.md MUST end with:
## Post-Implementation Gate (MANDATORY)
/deep-review --spec={folder-name}

Every tasks.md MUST have T_FINAL calling deep-review.
Create all specs now. Use the Write tool to create the spec files.
PROMPT
)" "$CLAUDE_MODEL" "$CLAUDE_TOOLS_WRITE")
  ok "[E5c] specs generated"

  log "[E5d] master index..."
  local idx="${MASTER_DIR}/INDEX.md"
  code=$(run_claude "$idx" "$(cat <<PROMPT
Write master index for ${PROJECT_NAME} review.
## Bugs
$(head -200 "$bugs_out" 2>/dev/null || echo "(bugs register empty)")
## Specs created
$(ls -d "${SPECS_DIR}"/REVIEW-* 2>/dev/null || echo "none")

## Output format
# Review Master Index — ${PROJECT_NAME}
> Generated: $(date '+%Y-%m-%d')
## Statistics ## Top 10 Critical Findings ## Document Map ## Spec Execution Order ## Spec Detail Summaries
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  has_content "$idx" 30 && ok "[E5d] master index" || { warn "[E5d] master index appears empty"; }

  mark_done "e5-specs"
  ok "[E5] aggregate complete"
}

phase_e_aggregate() {
  phase "E — AGGREGATE  (5 sequential calls)"
  phase_e1_architecture;     check_or_halt "Phase E1 — Architecture"
  phase_e2_business_logic;   check_or_halt "Phase E2 — Business Logic"
  phase_e3_api_contracts;    check_or_halt "Phase E3 — API Contracts"
  phase_e4_background;       check_or_halt "Phase E4 — Background Systems"
  phase_e5_bugs_and_specs;   check_or_halt "Phase E5 — Bugs & Specs"
  ok "[E] Aggregation done"
}

# ===========================================================================
# PHASE I — VALIDATE & RECONCILE  (cross-reference existing docs, human gate)
# ===========================================================================

phase_i1_inventory_existing_docs() {
  is_done "i1-inventory" && { log "  [I1] skip (done)"; return 0; }
  log "  [I1] Scanning for existing documentation..."

  local inventory="${VALIDATION_DIR}/existing-docs-inventory.md"
  local count=0
  {
    echo "# Existing Documentation Inventory — ${PROJECT_NAME}"
    echo "_Generated: $(date '+%Y-%m-%d %H:%M') | Phase I1 — auto-scan_"
    echo ""
    for pattern in $EXISTING_DOCS_PATHS; do
      if [[ "$pattern" = /* ]]; then
        local base_path="$pattern"
      else
        local base_path="${PROJECT_ROOT}/${pattern}"
      fi
      for match in $base_path; do
        if [[ -f "$match" ]]; then
          local lines; lines=$(wc -l < "$match" | tr -d ' ')
          echo "- \`${match#$PROJECT_ROOT/}\` (${lines} lines)"
          ((count++)) || true
        elif [[ -d "$match" ]]; then
          while IFS= read -r f; do
            local flines; flines=$(wc -l < "$f" | tr -d ' ')
            echo "- \`${f#$PROJECT_ROOT/}\` (${flines} lines)"
            ((count++)) || true
          done < <(find "$match" \( -name "*.md" -o -name "*.txt" -o -name "*.rst" \
            -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" \) -not -path "*/node_modules/*" \
            -not -path "*/.git/*" -not -name "package-lock.json" -not -name "composer.lock" 2>/dev/null | sort)
        fi
      done
    done
    echo ""
    echo "**Total: ${count} documents found**"
  } > "$inventory"

  mark_done "i1-inventory"
  ok "  [I1] Found ${count} docs -> ${inventory#$PROJECT_ROOT/}"
}

phase_i2_cross_reference() {
  is_done "i2-crossref" && { log "  [I2] skip (done)"; return 0; }
  log "  [I2] Cross-referencing generated rules against existing docs..."

  local inventory="${VALIDATION_DIR}/existing-docs-inventory.md"
  [[ -f "$inventory" ]] || { err "  [I2] No inventory — run I1 first"; return 1; }

  # Collect existing doc contents (capped to fit context)
  local existing_docs_content=""
  local doc_count=0
  for pattern in $EXISTING_DOCS_PATHS; do
    if [[ "$pattern" = /* ]]; then
      local base_path="$pattern"
    else
      local base_path="${PROJECT_ROOT}/${pattern}"
    fi
    for match in $base_path; do
      local files_to_read=()
      if [[ -f "$match" ]]; then
        files_to_read+=("$match")
      elif [[ -d "$match" ]]; then
        while IFS= read -r f; do
          files_to_read+=("$f")
        done < <(find "$match" \( -name "*.md" -o -name "*.txt" -o -name "*.rst" \) \
          -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | sort)
      fi
      for f in "${files_to_read[@]}"; do
        existing_docs_content+="
=== ${f#$PROJECT_ROOT/} ===
$(head -200 "$f")
"
        ((doc_count++)) || true
        [[ $doc_count -ge 30 ]] && break 2
      done
    done
  done

  [[ $doc_count -eq 0 ]] && { warn "  [I2] No existing docs found — skipping cross-reference"; mark_done "i2-crossref"; return 0; }

  local bl_content="" br_content=""
  [[ -f "${DOCS_DIR}/business-logic.md" ]] && bl_content=$(head -400 "${DOCS_DIR}/business-logic.md")
  [[ -f "${CONTEXT_DIR}/business-rules.md" ]] && br_content=$(head -400 "${CONTEXT_DIR}/business-rules.md")
  [[ -z "$br_content" ]] && [[ -f "${DEEP_REVIEW_RULES_PATH}" ]] && br_content=$(head -400 "${DEEP_REVIEW_RULES_PATH}")

  local out="${VALIDATION_DIR}/cross-reference.md"
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
You are cross-referencing AI-generated business rules and logic against the existing
project documentation. Your job: find CONTRADICTIONS, GAPS, and CONFIRMATIONS.

## AI-Generated Business Logic (from code review)
${bl_content}

## AI-Generated Business Rules (from code review)
${br_content}

## Existing Project Documentation (written by humans — ${doc_count} docs)
${existing_docs_content}

## Your task
For EVERY business rule or logic statement in the AI-generated docs:
1. Search the existing docs for corroboration or contradiction
2. Flag rules that CONTRADICT existing specs (exact quotes from both sides)
3. Flag rules that have NO MENTION in existing docs (potential hallucination or undocumented)
4. Confirm rules that MATCH existing docs (with source reference)
5. Flag things EXISTING docs describe that AI-generated docs MISSED

## Output format (ONLY this markdown, nothing else)

# Cross-Reference Report — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d') | Phase I2_

## Contradictions
### CR-[n]: [rule summary]
- **AI says**: [what the generated doc claims]
- **Existing doc says**: [what the human-written doc says]
- **Source**: [file path and relevant quote]
- **Impact**: [what breaks if wrong]

## Confirmations
### CF-[n]: [rule summary]
- **AI says**: [what the generated doc claims]
- **Confirmed by**: [file path and relevant quote]

## Gaps (existing docs describe things AI missed)
### GAP-[n]: [topic]
- **Existing doc describes**: [what the human doc says]
- **AI-generated docs**: silent / incomplete
- **Source**: [file path]

## Unverifiable (no existing doc covers this)
### UV-[n]: [rule summary]
- **AI says**: [claim]
- **Status**: No existing documentation found to confirm or deny

## Summary Statistics
- Contradictions: X
- Confirmations: X
- Gaps: X
- Unverifiable: X
PROMPT
)" "$VALIDATION_MODEL")

  has_content "$out" 20 && { mark_done "i2-crossref"; ok "  [I2] Cross-reference done -> ${out#$PROJECT_ROOT/}"; } || { err "  [I2] failed"; mark_fail "validate:cross-reference"; return 1; }
}

phase_i3_produce_checklist() {
  is_done "i3-checklist" && { log "  [I3] skip (done)"; return 0; }
  log "  [I3] Producing validation checklist..."

  local crossref="${VALIDATION_DIR}/cross-reference.md"
  [[ -f "$crossref" ]] || { err "  [I3] No cross-reference — run I2 first"; return 1; }

  local out="${VALIDATION_DIR}/VALIDATION-CHECKLIST.md"
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Convert this cross-reference report into a human-actionable validation checklist.
Every business rule becomes a row the human reviewer will mark.

## Cross-Reference Report
$(cat "$crossref")

## Output format (ONLY this markdown, nothing else)

# Validation Checklist — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d') | Phase I — requires human sign-off_
_Status: PENDING-HUMAN_

## Instructions
Review each rule below. For each, mark ONE status:
- \`[x] CONFIRMED\` — Rule is correct, matches your understanding
- \`[x] WRONG\` — Rule is incorrect, add correction in Notes
- \`[x] MISSING CONTEXT\` — Rule may be correct but needs clarification

When done, run: \`bash scripts/review/review.sh validate-sign-off\`

---

## Contradictions (REVIEW FIRST — highest priority)
| # | Rule | AI Says | Existing Doc Says | Source | Status | Notes |
|---|------|---------|-------------------|--------|--------|-------|
| CR-1 | ... | ... | ... | ... | [ ] CONFIRMED / [ ] WRONG / [ ] MISSING CONTEXT | |

## Gaps (existing docs describe things AI missed)
| # | Topic | Existing Doc Says | Source | Status | Notes |
|---|-------|-------------------|--------|--------|-------|
| GAP-1 | ... | ... | ... | [ ] CONFIRMED / [ ] WRONG / [ ] MISSING CONTEXT | |

## Unverifiable (AI found in code, no existing docs cover this)
| # | Rule | AI Says | Status | Notes |
|---|------|---------|--------|-------|
| UV-1 | ... | ... | [ ] CONFIRMED / [ ] WRONG / [ ] MISSING CONTEXT | |

## Confirmations (lowest priority — spot-check a few)
| # | Rule | Source | Status |
|---|------|--------|--------|
| CF-1 | ... | ... | [x] CONFIRMED |

---
_Total rules: X | Contradictions: X | Gaps: X | Unverifiable: X | Confirmations: X_
PROMPT
)" "$VALIDATION_MODEL")

  has_content "$out" 15 && { mark_done "i3-checklist"; ok "  [I3] Checklist -> ${out#$PROJECT_ROOT/}"; } || { err "  [I3] failed"; mark_fail "validate:checklist"; return 1; }
}

phase_i4_block_pipeline() {
  is_done "phase-i" && { log "  [I4] skip (already signed off)"; return 0; }

  echo "pending-human:$(date '+%Y-%m-%d %H:%M:%S')" > "${DONE_DIR}/phase-i-pending"

  echo ""
  printf '  %s\n' "${BOLD}${YELLOW}═══════════════════════════════════════════════${NC}"
  printf '  %s\n' "${BOLD}${YELLOW}  PIPELINE BLOCKED — Human sign-off required${NC}"
  printf '  %s\n' "${BOLD}${YELLOW}═══════════════════════════════════════════════${NC}"
  echo ""
  printf '  Review:   %s\n' "${CYAN}${VALIDATION_DIR#$PROJECT_ROOT/}/VALIDATION-CHECKLIST.md${NC}"
  printf '  Sign off: %s\n' "${CYAN}bash scripts/review/review.sh validate-sign-off${NC}"
  printf '  Resume:   %s\n' "${CYAN}bash scripts/review/review.sh run${NC}"
  echo ""
  warn "[I] Pipeline paused. Edit the checklist, then run: ./review.sh validate-sign-off"
}

phase_i_validate_reconcile() {
  phase "I — VALIDATE & RECONCILE  (cross-reference existing docs)"

  if [[ -z "${EXISTING_DOCS_PATHS:-}" ]]; then
    log "[I] EXISTING_DOCS_PATHS is empty — skipping Phase I"
    return 0
  fi

  phase_i1_inventory_existing_docs
  phase_i2_cross_reference
  phase_i3_produce_checklist
  phase_i4_block_pipeline

  ok "[I] Validate & Reconcile complete — awaiting human sign-off"
}

cmd_validate_sign_off() {
  init_dirs
  local checklist="${VALIDATION_DIR}/VALIDATION-CHECKLIST.md"

  [[ -f "$checklist" ]] || { err "No checklist found at ${checklist#$PROJECT_ROOT/}. Run Phase I first."; exit 1; }

  # Count review marks — use case-insensitive [x] or [X] matching
  # Each row has 3 options; count rows where a specific option has [x]/[X]
  local confirmed wrong missing unmarked
  confirmed=$(grep -ciE '\[x\] CONFIRMED' "$checklist" 2>/dev/null || echo 0)
  wrong=$(grep -ciE '\[x\] WRONG' "$checklist" 2>/dev/null || echo 0)
  missing=$(grep -ciE '\[x\] MISSING CONTEXT' "$checklist" 2>/dev/null || echo 0)
  # Unmarked = rows with CR-/GAP-/UV-/CF- that have no [x] at all
  unmarked=$(grep -E '\| (CR|GAP|UV|CF)-' "$checklist" 2>/dev/null | grep -cviE '\[x\]' 2>/dev/null || echo 0)

  local reviewed=$((confirmed + wrong + missing))

  echo ""
  printf '  Checklist status:\n'
  printf '    %s%s%s CONFIRMED\n' "$GREEN" "$confirmed" "$NC"
  printf '    %s%s%s WRONG\n' "$RED" "$wrong" "$NC"
  printf '    %s%s%s MISSING CONTEXT\n' "$YELLOW" "$missing" "$NC"
  printf '    %s unmarked\n' "$unmarked"
  echo ""

  # Require all contradictions to be addressed
  # A row is "unmarked" if it contains CR- but has NO [x] anywhere (all options are [ ])
  local in_contradictions=false cr_unmarked=0
  while IFS= read -r line; do
    if [[ "$line" =~ ^##\ Contradictions ]]; then in_contradictions=true; continue; fi
    if [[ "$line" =~ ^##\  ]] && [[ "$in_contradictions" == true ]]; then break; fi
    if [[ "$in_contradictions" == true ]] && echo "$line" | grep -q '| CR-' 2>/dev/null; then
      if ! echo "$line" | grep -qi '\[x\]' 2>/dev/null; then
        ((cr_unmarked++)) || true
      fi
    fi
  done < "$checklist"

  if [[ $cr_unmarked -gt 0 ]]; then
    err "Cannot sign off: ${cr_unmarked} contradictions still unmarked."
    err "Review all contradictions first, then re-run."
    exit 1
  fi

  if [[ $reviewed -eq 0 ]]; then
    err "Checklist appears unedited. Mark at least the contradictions before signing off."
    exit 1
  fi

  log "Sign-off accepted (${confirmed} confirmed, ${wrong} wrong, ${missing} needs context). Finalizing..."

  require_standalone "validate-sign-off"

  # Produce validated rules
  local out="${VALIDATION_DIR}/validated-rules.md"
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Finalize validated business rules for ${PROJECT_NAME}.

## Original AI-generated business logic
$(head -500 "${DOCS_DIR}/business-logic.md" 2>/dev/null || echo "(not available)")

## Human validation checklist (with decisions)
$(cat "$checklist")

## Your task
1. KEEP rules marked CONFIRMED — they are ground truth
2. REMOVE rules marked WRONG — replace with the correction from the Notes column if provided
3. FLAG rules marked MISSING CONTEXT — keep in a separate "Needs Clarification" appendix
4. KEEP Unverifiable rules marked CONFIRMED
5. ADD any GAP items that were CONFIRMED (things the AI missed but exist in specs)

## Output format (ONLY this markdown)
# Validated Business Rules — ${PROJECT_NAME}
_Validated: $(date '+%Y-%m-%d') | Human sign-off: complete_
_Stats: ${confirmed} confirmed | ${wrong} corrected | ${missing} needs clarification_

## Confirmed Rules
[Only rules that passed human validation]

## Corrected Rules
[Rules that were WRONG, with human-provided corrections]

## Needs Clarification
[MISSING CONTEXT items — flagged for follow-up]

## Additions from Existing Docs
[GAP items confirmed by human — rules the AI missed]
PROMPT
)" "$VALIDATION_MODEL")

  if has_content "$out" 15; then
    # Update checklist status
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' 's/_Status: PENDING-HUMAN_/_Status: SIGNED-OFF ('"$(date '+%Y-%m-%d %H:%M')"')_/' "$checklist"
    else
      sed -i 's/_Status: PENDING-HUMAN_/_Status: SIGNED-OFF ('"$(date '+%Y-%m-%d %H:%M')"')_/' "$checklist"
    fi

    # Remove pending sentinel and mark phase done
    rm -f "${DONE_DIR}/phase-i-pending"
    mark_done "phase-i"
    ok "Phase I signed off. Validated rules -> ${out#$PROJECT_ROOT/}"
    echo ""
    printf '  Pipeline unblocked. Continue with: %s\n' "${CYAN}bash scripts/review/review.sh run${NC}"
  else
    err "Failed to produce validated rules. Re-run: ./review.sh validate-sign-off"
    return 1
  fi
}

# ===========================================================================
# PHASE F — SPEC CHECK  (parallel)
# ===========================================================================
run_spec_check() {
  local spec_dir="$1"
  local slug; slug=$(basename "$spec_dir")
  local key="speccheck:${slug}"
  is_done "$key" && { log "  [F] skip: ${slug}"; return 0; }
  [[ -f "${spec_dir}/spec-lite.md" ]] || { warn "  [F] no spec-lite.md: ${slug}"; return 0; }

  log "  [F] checking: ${BOLD}${slug}${NC}"
  local out="${MASTER_DIR}/spec-checks/${slug}.md"
  local spec_content tasks_content
  spec_content=$(cat "${spec_dir}/spec-lite.md" 2>/dev/null || echo "(missing)")
  tasks_content=$(cat "${spec_dir}/tasks.md" 2>/dev/null || echo "(missing)")
  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Validate this spec adversarially. For each referenced file, verify the problem still exists in the current code.

## spec-lite.md
${spec_content}

## tasks.md
${tasks_content}

## Your task
1. Read the specific files referenced in the spec (file paths and line numbers mentioned above)
2. Verify: does the problem described actually exist in the current code?
3. Are the acceptance criteria correct and testable?
4. Any hidden dependencies or risks not mentioned?

## Output format
# Spec Check: ${slug}

## Verdict: APPROVED / APPROVED WITH CHANGES / REJECTED
## Evidence: [what you found in the code]
## Issues: [any problems with the spec, or "none"]
PROMPT
)")

  if [[ $code -eq 0 ]] && has_content "$out" 5; then
    mark_done "$key"
    local v; v=$(grep -oE '(APPROVED WITH CHANGES|APPROVED|REJECTED)' "$out" | head -1 || echo "UNKNOWN")
    case "$v" in
      "APPROVED")
        ok "  [F] ${slug}: APPROVED"
        printf '\n---\n_Spec check: APPROVED — %s_\n' "$(date '+%Y-%m-%d')" >> "${spec_dir}/spec-lite.md"
        ;;
      "APPROVED WITH CHANGES")
        warn "  [F] ${slug}: APPROVED WITH CHANGES"
        ;;
      "REJECTED")
        err "  [F] ${slug}: REJECTED"
        mv "$spec_dir" "${SPECS_DIR}/rejected/"
        ;;
    esac
  else
    mark_fail "$key"; err "  [F] failed: ${slug}"; return 1
  fi
}

phase_f_spec_check() {
  phase "F — SPEC CHECK  (parallel)"
  local specs=()
  while IFS= read -r s; do
    [[ -n "$s" ]] && specs+=("$s")
  done <<< "$(ls -d "${SPECS_DIR}"/REVIEW-* 2>/dev/null || true)"
  [[ ${#specs[@]} -eq 0 ]] && { warn "[F] No specs to check"; return 0; }
  log "[F] Checking ${#specs[@]} specs..."
  local fail=0
  for s in "${specs[@]}"; do
    acquire
    run_spec_check "$s" || ((fail++)) || true &
    sleep 0.3
  done
  drain
  check_or_halt "Phase F — Spec Check"
  ok "[F] Spec check done"
}

# ===========================================================================
# PHASE J — VALIDATE EXISTING DOCS  (verify claims against code)
# ===========================================================================
VALDOCS_DIR="${REVIEW_DIR}/doc-validation"

valdoc_slug() {
  local path="${1#$PROJECT_ROOT/}"
  echo "${path//[\/.]/_}" | sed 's/_md$//'
}

# Find all existing docs to validate
discover_existing_docs() {
  for pattern in $EXISTING_DOCS_PATHS; do
    if [[ "$pattern" = /* ]]; then local base="$pattern"; else local base="${PROJECT_ROOT}/${pattern}"; fi
    for match in $base; do
      if [[ -f "$match" ]] && [[ "$match" == *.md ]]; then
        echo "$match"
      elif [[ -d "$match" ]]; then
        find "$match" \( -name "*.md" -o -name "*.json" \) \
          -not -path "*/node_modules/*" -not -path "*/.git/*" \
          -not -name "package-lock.json" -not -name "composer.lock" \
          2>/dev/null | sort
      fi
    done
  done
}

valdoc_extract() {
  local doc_path="$1"
  local slug; slug=$(valdoc_slug "$doc_path")
  local key="jextract:${slug}"
  local out_dir="${VALDOCS_DIR}/${slug}"
  local out="${out_dir}/claims.json"

  is_done "$key" && { log "  [J1] skip: $(basename "$doc_path")"; return 0; }
  mkdir -p "$out_dir"

  local rel="${doc_path#$PROJECT_ROOT/}"
  # Persist source path for Phase L (slug encoding is lossy)
  echo "$rel" > "${out_dir}/source-path.txt"
  log "  [J1] extracting: ${rel}"
  local doc_content; doc_content=$(head -500 "$doc_path")

  local code; code=$(run_claude "$out" "$(cat <<PROMPT
You are a documentation auditor for ${PROJECT_NAME}. Extract every TESTABLE claim from this document.

A testable claim can be verified by reading source code:
- "Function X does Y" / "Table X has column Y" / "When X happens, Y is triggered"
- "Enum X has values [a, b, c]" / "Route /api/X returns Y"

Do NOT extract: opinions, style guidance, future plans, vague statements.
Cap at 50 most critical claims.

## Document: ${rel}
---
${doc_content}
---

CRITICAL: Output ONLY the JSON. No Write tool. No preamble. No markdown fences. Start with {.
{
  "document": "${rel}",
  "claims": [
    { "id": "C001", "text": "claim text", "category": "function|table|event|enum|route|behavior", "references": ["ClassName"] }
  ]
}
PROMPT
)")

  if [[ -s "$out" ]]; then
    python3 -c "
import json, re, sys
with open('${out}') as f: text = f.read()
try:
    json.loads(text); sys.exit(0)
except (ValueError, json.JSONDecodeError): pass
m = re.search(r'\{[\s\S]*\}', text)
if m:
    try:
        obj = json.loads(m.group()); open('${out}','w').write(json.dumps(obj,indent=2)); sys.exit(0)
    except (ValueError, json.JSONDecodeError): pass
sys.exit(1)
" 2>/dev/null && { mark_done "$key"; ok "  [J1] done: $(basename "$doc_path")"; } \
              || { mark_fail "jextract:${slug}"; warn "  [J1] bad JSON: $(basename "$doc_path")"; }
  else
    mark_fail "jextract:${slug}"; warn "  [J1] empty: $(basename "$doc_path")"
  fi
}

valdoc_verify() {
  local doc_path="$1"
  local slug; slug=$(valdoc_slug "$doc_path")
  local key="jverify:${slug}"
  local claims="${VALDOCS_DIR}/${slug}/claims.json"
  local out="${VALDOCS_DIR}/${slug}/verification.json"

  is_done "$key" && { log "  [J2] skip: $(basename "$doc_path")"; return 0; }
  [[ -f "$claims" ]] || { return 0; }

  local count; count=$(python3 -c "import json; print(len(json.load(open('${claims}')).get('claims',[])))" 2>/dev/null || echo "0")
  [[ "$count" == "0" ]] && { mark_done "$key"; return 0; }

  local rel="${doc_path#$PROJECT_ROOT/}"
  log "  [J2] verifying ${count} claims: $(basename "$doc_path")"

  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Verify documentation claims against ACTUAL source code for ${PROJECT_NAME}.
Project root: ${PROJECT_ROOT}

## Claims from: ${rel}
$(cat "$claims")

For EACH claim: Read the referenced files. Compare doc vs code.
Verdicts: VALID (matches), OUTDATED (changed), INVALID (wrong), CANNOT_VERIFY (not found).
IMPORTANT: Actually READ the code. Do not guess.

CRITICAL: Output ONLY JSON. No Write tool. No preamble. Start with {.
{
  "document": "${rel}",
  "results": [
    { "claim_id": "C001", "verdict": "VALID|OUTDATED|INVALID|CANNOT_VERIFY", "evidence": "file:line", "current_state": "what code does now" }
  ],
  "summary": { "valid": 0, "outdated": 0, "invalid": 0, "cannot_verify": 0, "total": 0 }
}
PROMPT
)")

  if [[ -s "$out" ]]; then
    python3 -c "
import json, re, sys
with open('${out}') as f: text = f.read()
try:
    json.loads(text); sys.exit(0)
except (ValueError, json.JSONDecodeError): pass
m = re.search(r'\{[\s\S]*\}', text)
if m:
    try:
        obj = json.loads(m.group()); open('${out}','w').write(json.dumps(obj,indent=2)); sys.exit(0)
    except (ValueError, json.JSONDecodeError): pass
sys.exit(1)
" 2>/dev/null && { mark_done "$key"; ok "  [J2] done: $(basename "$doc_path") (${count} claims)"; } \
              || { mark_fail "jverify:${slug}"; warn "  [J2] bad JSON: $(basename "$doc_path")"; }
  else
    mark_fail "jverify:${slug}"; warn "  [J2] empty: $(basename "$doc_path")"
  fi
}

valdoc_clean() {
  local doc_path="$1"
  local slug; slug=$(valdoc_slug "$doc_path")
  local key="jclean:${slug}"
  local verification="${VALDOCS_DIR}/${slug}/verification.json"
  local out="${VALDOCS_DIR}/${slug}/cleaned.md"

  is_done "$key" && { log "  [J3] skip: $(basename "$doc_path")"; return 0; }
  [[ -f "$verification" ]] || { return 0; }

  # Skip if 100% valid
  local has_issues; has_issues=$(python3 -c "
import json
d = json.load(open('${verification}'))
s = d.get('summary',{})
print(s.get('outdated',0) + s.get('invalid',0))
" 2>/dev/null || echo "0")
  [[ "$has_issues" == "0" ]] && { log "  [J3] 100% valid: $(basename "$doc_path")"; mark_done "$key"; return 0; }

  local rel="${doc_path#$PROJECT_ROOT/}"
  log "  [J3] cleaning: $(basename "$doc_path") (${has_issues} issues)"

  local code; code=$(run_claude "$out" "$(cat <<PROMPT
Rewrite this documentation to fix outdated and invalid claims.

## Original document: ${rel}
$(cat "$doc_path")

## Verification results:
$(cat "$verification")

Rules: Fix ONLY OUTDATED/INVALID claims. Keep structure/tone. No markers. No commentary.
CRITICAL: Output the ENTIRE corrected document. No Write tool. No preamble. Start with first line of doc.
PROMPT
)" "$CLAUDE_MODEL" "$CLAUDE_TOOLS_READ")

  has_content "$out" 10 && { mark_done "$key"; ok "  [J3] done: $(basename "$doc_path")"; } \
    || { mark_fail "jclean:${slug}"; warn "  [J3] failed: $(basename "$doc_path")"; }
}

phase_j_validate_docs() {
  phase "J — VALIDATE EXISTING DOCS  (extract claims, verify against code, clean)"

  if [[ -z "${EXISTING_DOCS_PATHS:-}" ]]; then
    log "[J] EXISTING_DOCS_PATHS is empty — skipping"
    return 0
  fi

  mkdir -p "$VALDOCS_DIR" "${VALDOCS_DIR}/.done-j"

  local doc_count=0
  while IFS= read -r doc; do
    [[ -n "$doc" ]] && ((doc_count++)) || true
  done < <(discover_existing_docs)
  log "[J] Found ${doc_count} docs to validate"

  # J1: Extract claims
  log "[J1] Extracting testable claims..."
  while IFS= read -r doc; do
    [[ -n "$doc" ]] || continue
    [[ "$doc" == *.md ]] || continue
    valdoc_extract "$doc"
    check_or_halt "Phase J1 — Extract Claims"
  done < <(discover_existing_docs)

  # J2: Verify against code
  log "[J2] Verifying claims against source code..."
  while IFS= read -r doc; do
    [[ -n "$doc" ]] || continue
    [[ "$doc" == *.md ]] || continue
    valdoc_verify "$doc"
    check_or_halt "Phase J2 — Verify Claims"
  done < <(discover_existing_docs)

  # J3: Produce cleaned docs
  log "[J3] Producing corrected docs..."
  while IFS= read -r doc; do
    [[ -n "$doc" ]] || continue
    [[ "$doc" == *.md ]] || continue
    valdoc_clean "$doc"
    check_or_halt "Phase J3 — Clean Docs"
  done < <(discover_existing_docs)

  # J4: Summary
  local summary="${VALDOCS_DIR}/SUMMARY.md"
  {
    echo "# Doc Validation Summary — ${PROJECT_NAME}"
    echo "_Generated: $(date '+%Y-%m-%d %H:%M')_"
    echo ""
    echo "| Document | Claims | Valid | Outdated | Invalid | Health |"
    echo "|----------|--------|-------|----------|---------|--------|"
    local tv=0 to=0 ti=0 tc=0
    while IFS= read -r doc; do
      [[ -n "$doc" ]] || continue
      local slug; slug=$(valdoc_slug "$doc")
      local ver="${VALDOCS_DIR}/${slug}/verification.json"
      [[ -f "$ver" ]] || continue
      local stats; stats=$(python3 -c "
import json
d=json.load(open('${ver}')); s=d.get('summary',{})
v=s.get('valid',0);o=s.get('outdated',0);i=s.get('invalid',0);t=v+o+i+s.get('cannot_verify',0)
h=int(v*100/t) if t>0 else 0
print(f'{t}|{v}|{o}|{i}|{h}')
" 2>/dev/null || echo "?|?|?|?|?")
      IFS='|' read -r t v o i h <<< "$stats"
      printf '| `%s` | %s | %s | %s | %s | %s%% |\n' "${doc#$PROJECT_ROOT/}" "$t" "$v" "$o" "$i" "$h"
      [[ "$v" != "?" ]] && { tv=$((tv+v)); to=$((to+o)); ti=$((ti+i)); tc=$((tc+t)); } || true
    done < <(discover_existing_docs)
    echo ""
    local th=0; [[ $tc -gt 0 ]] && th=$((tv*100/tc))
    echo "**Totals**: ${tc} claims | ${tv} valid | ${to} outdated | ${ti} invalid | **${th}% healthy**"
  } > "$summary"
  ok "[J] Doc validation complete -> ${summary#$PROJECT_ROOT/}"
}

# ===========================================================================
# PHASE K — GENERATE MISSING DOCS  (identify gaps, create new docs)
# ===========================================================================
phase_k_generate_docs() {
  phase "K — GENERATE MISSING DOCS  (fill documentation gaps)"
  is_done "phase-k" && { log "[K] skip"; return 0; }

  # Collect all validated knowledge for context
  local all_knowledge=""
  # From review chunks (confirmed findings)
  for f in "${VALIDATED_DIR}"/*.md; do
    [[ -f "$f" ]] && all_knowledge+="$(head -50 "$f")\n"
  done
  # From validated rules
  [[ -f "${VALIDATION_DIR}/validated-rules.md" ]] && all_knowledge+="$(head -200 "${VALIDATION_DIR}/validated-rules.md")\n"
  # From cleaned docs
  for f in "${VALDOCS_DIR}"/*/cleaned.md; do
    [[ -f "$f" ]] && all_knowledge+="$(head -30 "$f")\n"
  done
  # From existing docs summaries
  for f in "${DOCS_DIR}"/*.md "${PROJECT_ROOT}/docs/business-rules"/*.md; do
    [[ -f "$f" ]] && all_knowledge+="=== $(basename "$f") ===\n$(head -20 "$f")\n"
  done
  all_knowledge=$(echo -e "$all_knowledge" | head -5000)

  # K1: Gap analysis — what docs are missing?
  if ! is_done "k1-gaps"; then
    log "[K1] Analyzing documentation gaps..."
    local gaps_out="${VALDOCS_DIR}/gap-analysis.md"
    local code; code=$(run_claude "$gaps_out" "$(cat <<PROMPT
Analyze documentation completeness for ${PROJECT_NAME} (${PROJECT_DESCRIPTION}).
Project root: ${PROJECT_ROOT}

## Existing documentation topics covered:
$(find "${PROJECT_ROOT}/docs" -name "*.md" 2>/dev/null | sed "s|${PROJECT_ROOT}/||" | sort)

## Knowledge from code review:
${all_knowledge}

## Your task:
1. Use Glob/Grep to scan the codebase for major subsystems, modules, and patterns
2. Compare against existing docs — what topics have NO documentation?
3. For each gap, describe what doc should exist and what it should cover

Focus on:
- Business rules with no doc (check each Module for undocumented rules)
- API endpoints with no documentation
- Edge cases and error handling flows
- Integration points (Stripe, Brevo, external APIs)
- Database schema and relationships
- Frontend-backend contracts

CRITICAL: Output ONLY markdown. No Write tool. Start with # title.

# Documentation Gap Analysis — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d')_

## Missing Business Rules Docs
### [module] — [topic]
- What should be documented: ...
- Key files to reference: ...

## Missing Architecture Docs
...

## Missing API Docs
...

## Missing Integration Docs
...

## Priority Order (generate these first)
1. ...
PROMPT
)")
    has_content "$gaps_out" 20 && { mark_done "k1-gaps"; ok "[K1] Gap analysis done"; } || { warn "[K1] Gap analysis failed"; }
    check_or_halt "Phase K1 — Gap Analysis"
  fi

  # K2: Generate business rules for undocumented modules
  if ! is_done "k2-business-rules"; then
    log "[K2] Generating missing business rules docs..."
    local br_out="${VALDOCS_DIR}/generated-business-rules.log"
    local code; code=$(run_claude "$br_out" "$(cat <<PROMPT
Generate missing business rules documentation for ${PROJECT_NAME}.
Project root: ${PROJECT_ROOT}

## Gap analysis:
$(cat "${VALDOCS_DIR}/gap-analysis.md" 2>/dev/null | head -300)

## Existing business rules docs:
$(ls "${PROJECT_ROOT}/docs/business-rules/" 2>/dev/null | sed 's/^/- /')

## Task:
For each MISSING business rules topic identified in the gap analysis:
1. Read the actual code (models, services, controllers, events)
2. Extract the real business rules from code behavior
3. Write a complete business rules doc

Write each doc to: ${PROJECT_ROOT}/docs/business-rules/{topic}.md

Format each doc like:
# {Topic} Business Rules
_Generated: $(date '+%Y-%m-%d') | Source: code review | Status: NEEDS-VALIDATION_

## Overview
## Key Rules
### BR-[n]: [rule name]
- **Rule**: ...
- **Implementation**: file:line
- **Edge cases**: ...
## Related Modules
## Known Issues

Write ALL missing docs. Confirm each file written.
PROMPT
)" "$CLAUDE_MODEL" "$CLAUDE_TOOLS_WRITE")
    [[ $code -eq 0 ]] && { mark_done "k2-business-rules"; ok "[K2] Business rules generated"; } || { warn "[K2] failed"; }
    check_or_halt "Phase K2 — Business Rules Generation"
  fi

  # K3: Generate edge cases doc
  if ! is_done "k3-edge-cases"; then
    log "[K3] Generating edge cases documentation..."
    local edge_out="${PROJECT_ROOT}/docs/context-for-ai/edge-cases.md"
    local code; code=$(run_claude "$edge_out" "$(cat <<PROMPT
Generate a comprehensive edge cases document for ${PROJECT_NAME}.
Project root: ${PROJECT_ROOT}

## Source material:
$(cat "${MASTER_DIR}/bugs-and-risks.md" 2>/dev/null | head -200)
$(cat "${VALDOCS_DIR}/gap-analysis.md" 2>/dev/null | head -200)
$(for f in "${VALIDATED_DIR}"/*.md; do [[ -f "$f" ]] && head -30 "$f"; done | head -2000)

## Task:
Read the actual code and identify ALL edge cases across the platform:
1. Null/empty inputs that cause crashes
2. Race conditions in concurrent operations
3. Boundary conditions (zero amounts, max values, date edges)
4. State machine violations (invalid transitions)
5. Cross-module side effects
6. External API failure scenarios (Stripe down, Brevo timeout)
7. Data integrity risks (orphaned records, cascading deletes)

CRITICAL: Output ONLY markdown. No Write tool. Start with # title.

# Edge Cases — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d') | Status: NEEDS-VALIDATION_

## Payment Edge Cases
### EC-[n]: [description]
- **Trigger**: ...
- **Current behavior**: ...
- **Expected behavior**: ...
- **Files**: ...

## Enrollment Edge Cases
## Exam Edge Cases
## Subscription Edge Cases
## Notification Edge Cases
## Frontend Edge Cases
PROMPT
)" "$CLAUDE_MODEL" "$CLAUDE_TOOLS_SHELL")
    has_content "$edge_out" 30 && { mark_done "k3-edge-cases"; ok "[K3] Edge cases doc generated"; } || { warn "[K3] failed"; }
    check_or_halt "Phase K3 — Edge Cases"
  fi

  # K4: Generate API contracts doc (if missing)
  if ! is_done "k4-api-contracts" && [[ ! -s "${DOCS_DIR}/api-contracts.md" || $(wc -l < "${DOCS_DIR}/api-contracts.md" 2>/dev/null || echo 0) -lt 50 ]]; then
    log "[K4] Generating API contracts documentation..."
    local api_out="${DOCS_DIR}/api-contracts.md"
    local code; code=$(run_claude "$api_out" "$(cat <<PROMPT
Generate comprehensive API contracts documentation for ${PROJECT_NAME}.
Project root: ${PROJECT_ROOT}

## Route manifests:
$(cat "${MANIFESTS_DIR}/routes.md" 2>/dev/null | head -500)

## Task:
1. Read all route files to find every API endpoint
2. For each endpoint: method, URL, middleware, controller, request validation rules, response format
3. Group by module/domain
4. Note which endpoints the frontend calls (search frontend code for API URLs)

CRITICAL: Output ONLY markdown. No Write tool. Start with # title.

# API Contracts — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d') | Status: NEEDS-VALIDATION_

## Authentication
### POST /api/v1/auth/login
- **Controller**: ...
- **Request**: ...
- **Response**: ...
- **Frontend caller**: ...

[Continue for ALL endpoints]
PROMPT
)" "$CLAUDE_MODEL" "$CLAUDE_TOOLS_SHELL")
    has_content "$api_out" 50 && { mark_done "k4-api-contracts"; ok "[K4] API contracts generated"; } || { warn "[K4] failed"; }
    check_or_halt "Phase K4 — API Contracts"
  else
    mark_done "k4-api-contracts"
  fi

  mark_done "phase-k"
  ok "[K] Missing docs generation complete"
}

# ===========================================================================
# PHASE G — CONTEXT  (writes docs deep-review loads)
# ===========================================================================
phase_g_context() {
  phase "G — CONTEXT FOR AI  (writes ground truth docs)"
  is_done "phase-g" && { log "[G] skip"; return 0; }

  local prior; prior=$(for f in "${DOCS_DIR}"/*.md "${MASTER_DIR}"/*.md; do
    [[ -f "$f" ]] && { echo "=== $(basename "$f") ==="; head -100 "$f"; echo ""; }
  done)

  # Include all validated/generated knowledge as authoritative sources
  local validated_rules=""
  if [[ -f "${VALIDATION_DIR}/validated-rules.md" ]]; then
    validated_rules="
## Human-Validated Business Rules (Phase I — authoritative)
$(head -300 "${VALIDATION_DIR}/validated-rules.md")"
  fi

  # Include Phase J cleaned docs summaries
  local cleaned_docs_context=""
  if [[ -d "${VALDOCS_DIR}" ]]; then
    for f in "${VALDOCS_DIR}"/*/cleaned.md; do
      [[ -f "$f" ]] && cleaned_docs_context+="
=== $(basename "$(dirname "$f")") (validated) ===
$(head -50 "$f")
"
    done
    cleaned_docs_context=$(printf '%s\n' "$cleaned_docs_context" | head -2000 || true)
    [[ -n "$cleaned_docs_context" ]] && cleaned_docs_context="
## Validated Existing Docs (Phase J — code-verified)
${cleaned_docs_context}"
  fi

  # Include Phase K gap analysis
  local gap_context=""
  if [[ -f "${VALDOCS_DIR}/gap-analysis.md" ]]; then
    gap_context="
## Documentation Gaps Identified (Phase K)
$(head -100 "${VALDOCS_DIR}/gap-analysis.md")"
  fi

  # Include edge cases if generated
  local edge_context=""
  if [[ -f "${CONTEXT_AI_DIR}/edge-cases.md" ]]; then
    edge_context="
## Edge Cases (Phase K — generated from code)
$(head -100 "${CONTEXT_AI_DIR}/edge-cases.md")"
  fi

  local code; code=$(run_claude "${MASTER_DIR}/context-gen.log" "$(cat <<PROMPT
Write the context documentation for ${PROJECT_NAME}. Critical output.
/deep-review loads these in Phase 1. AI agents read these before every task.

## Prior review output
${prior}
${validated_rules}
${cleaned_docs_context}
${gap_context}
${edge_context}

## Write these 8 files:
1. ${DEEP_REVIEW_RULES_PATH} — Business rules ground truth
2. ${DEEP_REVIEW_ARCH_PATH} — Architecture ground truth
3. ${CONTEXT_AI_DIR}/invariants.md — INV-[n]: things that must always be true (15-30)
4. ${CONTEXT_AI_DIR}/common-patterns.md — PATTERN: how THIS codebase solves problems
5. ${CONTEXT_AI_DIR}/change-impact-map.md — Change X -> must also check Y (min 20 rows)
6. ${CONTEXT_AI_DIR}/known-gotchas.md — GOTCHA-[n]: non-obvious traps
7. ${CONTEXT_AI_DIR}/user-stories.md — US-[n]: every user-facing flow
8. ${CONTEXT_AI_DIR}/admin-capabilities.md — AC-[n]: every admin action

Write all 8 files. Confirm each path as written.
PROMPT
)" "$CLAUDE_MODEL" "$CLAUDE_TOOLS_WRITE")
  check_or_halt "Phase G — Context Docs"
  [[ $code -eq 0 ]] && { mark_done "phase-g"; ok "[G] Context docs written"; } || { err "[G] failed"; return 1; }
}

# ===========================================================================
# PHASE H — PROJECT BRAIN  (the session primer)
# ===========================================================================
phase_h_brain() {
  phase "H — PROJECT BRAIN  (makes AI framework permanently aware)"
  is_done "phase-h" && { log "[H] skip"; return 0; }

  # H1. PROJECT-BRAIN.md
  log "[H1] Writing PROJECT-BRAIN.md..."
  local code; code=$(run_claude "$BRAIN_FILE" "$(cat <<PROMPT
Write the PROJECT BRAIN for ${PROJECT_NAME}. Loaded at the start of EVERY AI agent session.
Single source of truth. Comprehensive, precise, navigable.

## All prior review output
$(for f in "${DOCS_DIR}"/*.md "${CONTEXT_DIR}"/*.md "${CONTEXT_AI_DIR}"/*.md "${MASTER_DIR}"/*.md; do
    [[ -f "$f" ]] && { echo "=== $(basename "$f") ==="; head -80 "$f"; echo ""; }
  done)

## Output format
# Project Brain — ${PROJECT_NAME}
_Generated: $(date '+%Y-%m-%d') | Source: adversarial review pipeline v5_
_Load this file at the start of every AI agent session. It is the single source of truth._

## 1. What This Project Is
## 2. Architecture in 5 Minutes
## 3. Most Important Business Rules
## 4. Known Bugs (Confirmed)
## 5. Known Limitations & Constraints
## 6. User Flows
## 7. Admin Capabilities
## 8. Background Systems
## 9. External Integrations
## 10. Things That Will Trip You Up
## 11. Before You Start Any Task (checklist)
## 12. Document Map
Dense and factual, not verbose.
Write ONLY the markdown. Do NOT use the Write tool — output directly.
PROMPT
)")
  check_or_halt "Phase H1 — PROJECT-BRAIN"
  has_content "$BRAIN_FILE" 50 && ok "[H1] PROJECT-BRAIN.md" || { err "[H1] failed"; return 1; }

  # H2. Patch CLAUDE.md
  log "[H2] Patching CLAUDE.md..."
  local claude_md="${PROJECT_ROOT}/CLAUDE.md"
  local brain_section
  brain_section=$(cat <<SECTION

## ═══ Project Intelligence (Auto-generated by review pipeline) ═══
> Read the following BEFORE starting any task.

### Always load at session start:
- **\`${BRAIN_FILE#$PROJECT_ROOT/}\`** — Full project context
- **\`${DEEP_REVIEW_RULES_PATH#$PROJECT_ROOT/}\`** — Business rules ground truth
- **\`${DEEP_REVIEW_ARCH_PATH#$PROJECT_ROOT/}\`** — Architecture ground truth

### Before implementing:
- \`docs/context-for-ai/change-impact-map.md\` — What else breaks
- \`docs/context-for-ai/known-gotchas.md\` — Traps that cause bugs

### Current known issues:
$(grep "^### BUG-" "${MASTER_DIR}/bugs-and-risks.md" 2>/dev/null | head -5 | sed 's/^/- /' || echo "- See .ai/review/master/bugs-and-risks.md")

### Active specs (work queue):
$(ls -d "${SPECS_DIR}"/REVIEW-P* 2>/dev/null | head -5 | sed "s|${PROJECT_ROOT}/||;s/^/- /" || echo "- See .ai/specs/")

### Post-implementation gate:
Every spec MUST pass: \`/deep-review --spec=SPEC-NAME\` -> APPROVED

_Last review: $(date '+%Y-%m-%d') | Re-run: \`./review.sh run\`_
## ════════════════════════════════════════════════════════

SECTION
)

  if [[ -f "$claude_md" ]] && grep -q "Project Intelligence (Auto-generated by review pipeline)" "$claude_md" 2>/dev/null; then
    python3 - <<PYEOF 2>/dev/null || warn "[H2] Could not auto-update CLAUDE.md — update manually"
import re
with open('${claude_md}', 'r') as f:
    content = f.read()
content = re.sub(
    r'\n## ═══ Project Intelligence.*?## ════════════════════════════════════════════════════════\n',
    '', content, flags=re.DOTALL)
with open('${claude_md}', 'w') as f:
    f.write(content)
PYEOF
    echo "$brain_section" >> "$claude_md"
    ok "[H2] CLAUDE.md section replaced"
  elif [[ -f "$claude_md" ]]; then
    echo "$brain_section" >> "$claude_md"
    ok "[H2] CLAUDE.md patched"
  else
    echo "$brain_section" > "$claude_md"
    ok "[H2] CLAUDE.md created"
  fi

  # H3. .claude/project-context.md
  log "[H3] Writing .claude/project-context.md..."
  local pc_file="${PROJECT_ROOT}/.claude/project-context.md"
  cat > "$pc_file" <<PCEOF
# Project Context — ${PROJECT_NAME}
_Auto-generated: $(date '+%Y-%m-%d') | Source: review pipeline v5_

## Quick Reference
- **Project**: ${PROJECT_NAME} — ${PROJECT_DESCRIPTION}
- **Type**: ${PROJECT_TYPE:-${BACKEND_FRAMEWORK}}
- **Framework**: ${BACKEND_FRAMEWORK}
- **Architecture**: See docs/context/architecture.md
- **Business rules**: See docs/context/business-rules.md
- **Full context**: See docs/context/PROJECT-BRAIN.md

## Current State
- Review completed: $(date '+%Y-%m-%d')
- Confirmed bugs: $(grep -c "^### BUG-" "${MASTER_DIR}/bugs-and-risks.md" 2>/dev/null || echo "?")
- Active specs: $(ls -d "${SPECS_DIR}"/REVIEW-P* 2>/dev/null | wc -l | tr -d ' ' || echo "0")

## Active Work Queue (execute in order)
$(ls -d "${SPECS_DIR}"/REVIEW-P1-* 2>/dev/null | sed "s|${PROJECT_ROOT}/||" | head -5 | while read -r s; do
    title=$(grep "^# REVIEW" "${PROJECT_ROOT}/${s}/spec-lite.md" 2>/dev/null | head -1 || echo "$s")
    echo "- **P1** ${title}"
done)

## Key Constraints
$(head -20 "${CONTEXT_AI_DIR}/invariants.md" 2>/dev/null | grep "^\\*\\*INV" | head -5 || \
  echo "_See docs/context-for-ai/invariants.md_")
PCEOF
  ok "[H3] .claude/project-context.md written"

  # H4. Knowledge graph entities
  log "[H4] Generating knowledge graph entities..."
  local kg_out="${MASTER_DIR}/knowledge-graph-entities.js"
  code=$(run_claude "$kg_out" "$(cat <<PROMPT
Generate knowledge graph entity creation JS for ${PROJECT_NAME}.
## Source
$(head -100 "$BRAIN_FILE" 2>/dev/null)
$(head -80 "${DOCS_DIR}/architecture.md" 2>/dev/null)

Output ONLY valid JavaScript code — no preamble, no explanation, no markdown fences.
Use create_entities([...]) and create_relations([...]).
One entity per module, plus PROJECT and ARCH entities.
Do NOT use the Write tool — output directly.
PROMPT
)")
  # Strip any conversational preamble before the first JS code
  if [[ -f "$kg_out" ]] && ! head -1 "$kg_out" | grep -qE "^(create_|const |let |var |//)"; then
    local first_js_line; first_js_line=$(grep -n "^create_entities\|^create_relations\|^const \|^let " "$kg_out" | head -1 | cut -d: -f1 || true)
    if [[ -n "$first_js_line" ]] && [[ "$first_js_line" -gt 1 ]]; then
      tail -n +"$first_js_line" "$kg_out" > "${kg_out}.tmp" && mv "${kg_out}.tmp" "$kg_out"
    fi
  fi
  ok "[H4] Knowledge graph entities written"

  mark_done "phase-h"
  ok "[H] Project brain complete"
}

# ===========================================================================
# PHASE L — CLEANUP & ORGANIZE  (archive intermediates, apply cleaned docs)
# ===========================================================================
phase_l_cleanup() {
  phase "L — CLEANUP & ORGANIZE  (archive intermediates, create manifest)"
  is_done "phase-l" && { log "[L] skip"; return 0; }

  local archive_dir="${REVIEW_DIR}/archive"
  local timestamp; timestamp=$(date '+%Y%m%d-%H%M')
  mkdir -p "$archive_dir"

  # L1: Apply cleaned docs to originals
  log "[L1] Applying validated doc corrections..."
  local applied=0
  if [[ -d "$VALDOCS_DIR" ]]; then
    for slug_dir in "$VALDOCS_DIR"/*/; do
      [[ -d "$slug_dir" ]] || continue
      local cleaned="${slug_dir}cleaned.md"
      [[ -f "$cleaned" ]] || continue

      # Reject files where model asked for permissions instead of outputting
      if grep -qiE "write permissions|grant permission|allow.*edit|approval" "$cleaned" 2>/dev/null; then
        warn "  [L1] skip (broken output): $(basename "$slug_dir")"
        continue
      fi

      # Recover original path (slug encoding is lossy)
      local slug; slug=$(basename "$slug_dir")
      local original=""
      if [[ -f "${slug_dir}source-path.txt" ]]; then
        original=$(cat "${slug_dir}source-path.txt")
      elif [[ -f "${slug_dir}claims.json" ]]; then
        original=$(python3 -c "import json; print(json.load(open('${slug_dir}claims.json')).get('document',''))" 2>/dev/null)
      elif [[ -f "${slug_dir}verification.json" ]]; then
        original=$(python3 -c "import json; print(json.load(open('${slug_dir}verification.json')).get('document',''))" 2>/dev/null)
      fi
      [[ -z "$original" ]] && { warn "  [L1] skip (no source path): ${slug}"; continue; }
      original="${PROJECT_ROOT}/${original}"

      if [[ -f "$original" ]]; then
        local orig_lines; orig_lines=$(wc -l < "$original" | tr -d ' ')
        local clean_lines; clean_lines=$(wc -l < "$cleaned" | tr -d ' ')
        # Sanity check: cleaned doc should be at least 30% of original size
        if [[ $clean_lines -gt $((orig_lines * 30 / 100)) ]]; then
          cp "$original" "${archive_dir}/$(basename "$original").${timestamp}.bak"
          cp "$cleaned" "$original"
          ((applied++)) || true
          ok "  [L1] applied: ${original#$PROJECT_ROOT/}"
        else
          warn "  [L1] skip (too small): $(basename "$slug_dir") (${clean_lines}L vs ${orig_lines}L)"
        fi
      fi
    done
  fi
  log "[L1] Applied ${applied} doc corrections (originals backed up in ${archive_dir#$PROJECT_ROOT/}/)"

  # L2: Archive intermediate files
  log "[L2] Archiving intermediate files..."
  local archive_file="${archive_dir}/intermediates-${timestamp}.tar.gz"
  local to_archive=()

  # Survey data (consumed by Phase C)
  [[ -d "$SURVEY_DIR" ]] && [[ "$(ls -A "$SURVEY_DIR" 2>/dev/null)" ]] && to_archive+=("$SURVEY_DIR")
  # Raw review chunks (consumed by Phase D)
  [[ -d "$CHUNKS_DIR" ]] && [[ "$(ls -A "$CHUNKS_DIR" 2>/dev/null)" ]] && to_archive+=("$CHUNKS_DIR")
  # Validated findings (consumed by Phase E)
  [[ -d "$VALIDATED_DIR" ]] && [[ "$(ls -A "$VALIDATED_DIR" 2>/dev/null)" ]] && to_archive+=("$VALIDATED_DIR")
  # Manifests (consumed by Phase C)
  [[ -d "$MANIFESTS_DIR" ]] && [[ "$(ls -A "$MANIFESTS_DIR" 2>/dev/null)" ]] && to_archive+=("$MANIFESTS_DIR")
  # Doc validation intermediates (claims.json, verification.json)
  if [[ -d "$VALDOCS_DIR" ]]; then
    for f in "$VALDOCS_DIR"/*/claims.json "$VALDOCS_DIR"/*/verification.json; do
      [[ -f "$f" ]] && to_archive+=("$f")
    done
  fi
  # Spec check details
  [[ -d "${MASTER_DIR}/spec-checks" ]] && to_archive+=("${MASTER_DIR}/spec-checks")
  # Log files
  for f in "${MASTER_DIR}/context-gen.log" "${MASTER_DIR}/spec-gen.log" "${REVIEW_DIR}/doc-validation/generated-business-rules.log"; do
    [[ -f "$f" ]] && to_archive+=("$f")
  done

  if [[ ${#to_archive[@]} -gt 0 ]]; then
    # Create archive relative to review dir
    (cd "$PROJECT_ROOT" && tar -czf "$archive_file" "${to_archive[@]/#$PROJECT_ROOT\//}" 2>/dev/null) || true
    local archive_size; archive_size=$(du -sh "$archive_file" 2>/dev/null | cut -f1)
    ok "[L2] Archived ${#to_archive[@]} items -> ${archive_file#$PROJECT_ROOT/} (${archive_size})"

    # Remove archived intermediates
    [[ -d "$SURVEY_DIR" ]] && rm -rf "$SURVEY_DIR" && mkdir -p "$SURVEY_DIR"
    [[ -d "$CHUNKS_DIR" ]] && rm -rf "$CHUNKS_DIR" && mkdir -p "$CHUNKS_DIR"
    [[ -d "$VALIDATED_DIR" ]] && rm -rf "$VALIDATED_DIR" && mkdir -p "$VALIDATED_DIR"
    [[ -d "$MANIFESTS_DIR" ]] && rm -rf "$MANIFESTS_DIR" && mkdir -p "$MANIFESTS_DIR"
    [[ -d "${MASTER_DIR}/spec-checks" ]] && rm -rf "${MASTER_DIR}/spec-checks"
    for f in "$VALDOCS_DIR"/*/claims.json "$VALDOCS_DIR"/*/verification.json; do
      [[ -f "$f" ]] && rm -f "$f"
    done
    rm -f "${MASTER_DIR}/context-gen.log" "${MASTER_DIR}/spec-gen.log"
  fi

  # L3: Create final manifest
  log "[L3] Writing manifest..."
  cat > "${REVIEW_DIR}/README.md" <<MANIFEST
# Review Pipeline Output — ${PROJECT_NAME}
_Last run: $(date '+%Y-%m-%d %H:%M') | Model: ${CLAUDE_MODEL}_

## How this works

The review pipeline analyzed your codebase and documentation, then produced
validated, corrected documentation and actionable specs. Here is what each
directory contains and how to use it.

## Final Output (use these)

| File | What | How to use |
|------|------|------------|
| \`docs/context/PROJECT-BRAIN.md\` | Complete project intelligence | Read before any task |
| \`docs/context/business-rules.md\` | Business rules ground truth | Loaded by /deep-review |
| \`docs/context/architecture.md\` | Architecture ground truth | Loaded by /deep-review |
| \`docs/business-rules/*.md\` | Validated business rules per domain | Source of truth — code must match these |
| \`docs/architecture/*.md\` | Architecture docs (cleaned) | Reference for structural decisions |
| \`docs/context-for-ai/*.md\` | AI context (invariants, gotchas, patterns) | Auto-loaded by AI agents |
| \`.claude/project-context.md\` | Session primer | Auto-loaded at every Claude session start |
| \`.ai/specs/REVIEW-P[1-3]-*\` | Actionable fix/improvement specs | Execute with /execute-task |

## Review Data (reference)

| File | What |
|------|------|
| \`master/bugs-and-risks.md\` | Confirmed bugs by severity |
| \`master/improvement-backlog.md\` | Quick wins + refactoring ideas |
| \`master/INDEX.md\` | Prioritized work queue |
| \`master/knowledge-graph-entities.js\` | Import into knowledge graph |
| \`validation/VALIDATION-CHECKLIST.md\` | Human sign-off record |
| \`validation/validated-rules.md\` | Human-approved business rules |
| \`doc-validation/SUMMARY.md\` | Doc health scores |
| \`doc-validation/*/report.md\` | Per-doc validation reports |
| \`doc-validation/gap-analysis.md\` | Missing documentation analysis |
| \`triage/triage-report.md\` | Static analysis + hotspots |

## Archived (recoverable)

Intermediate files (raw review chunks, survey data, claim extractions) are
archived in \`archive/intermediates-*.tar.gz\`. To restore:

\`\`\`bash
cd ${PROJECT_ROOT}
tar -xzf .ai/review/archive/intermediates-TIMESTAMP.tar.gz
\`\`\`

## Re-running

The pipeline is resumable. Each completed step has a lockfile in \`.done/\`.

\`\`\`bash
# Re-run everything (skips completed steps)
bash scripts/review/review.sh run

# Re-run a specific phase
bash scripts/review/review.sh phase G

# Force re-run a phase (delete its lockfile first)
rm -f .ai/review/.done/phase-g
bash scripts/review/review.sh phase G

# Re-run doc validation on specific docs
rm -f .ai/review/.done/jextract_* .ai/review/.done/jverify_* .ai/review/.done/jclean_*
bash scripts/review/review.sh phase J

# Full reset (wipes everything)
bash scripts/review/review.sh reset
\`\`\`

## Pipeline Phases

\`\`\`
0  Triage      Free    Static analysis, hotspots, security scan
A  Inventory   Free    Route/job/event/email manifests
B  Survey      Cheap   RED/YELLOW/GREEN per chunk
C  Review      AI      Adversarial 13-criteria review
D  Validate    AI      Semi-blind adversarial confirmation
E  Aggregate   AI      Architecture, business-logic, bugs, specs
I  Reconcile   Human   Cross-ref AI rules vs existing docs, sign-off gate
F  Spec Check  AI      Validate each spec against code
J  Doc Verify  AI      Verify existing doc claims against code
K  Doc Gen     AI      Generate missing docs (gaps, edge cases, API)
G  Context     AI      Write context docs from all validated knowledge
H  Brain       AI      PROJECT-BRAIN + CLAUDE.md patch + session primer
L  Cleanup     Local   Archive intermediates, apply corrections, manifest
\`\`\`
MANIFEST

  # L4: Clean up empty directories
  find "$REVIEW_DIR" -type d -empty -not -name ".done" -delete 2>/dev/null || true

  # Remove cleaned.md files from doc-validation (already applied in L1)
  for f in "$VALDOCS_DIR"/*/cleaned.md; do
    [[ -f "$f" ]] && rm -f "$f"
  done

  mark_done "phase-l"
  ok "[L] Cleanup complete"

  echo ""
  printf '  %s\n' "${BOLD}Final output:${NC}"
  printf '  %s   Project intelligence\n' "${CYAN}docs/context/PROJECT-BRAIN.md${NC}"
  printf '  %s     Validated business rules\n' "${CYAN}docs/business-rules/*.md${NC}"
  printf '  %s       Actionable specs\n' "${CYAN}.ai/specs/REVIEW-P*${NC}"
  printf '  %s        How everything fits\n' "${CYAN}.ai/review/README.md${NC}"
  echo ""
}

# ===========================================================================
# COMMANDS
# ===========================================================================
cmd_run() {
  require_standalone "run"
  header "${PROJECT_NAME} — Autonomous Review + Project Intelligence v5"

  [[ ${#CHUNKS_BACKEND[@]} -eq 0 ]] && {
    err "CHUNKS_BACKEND is empty. Run: ./review.sh discover"
    exit 1
  }

  apply_framework_defaults
  init_dirs
  local be_count=${#CHUNKS_BACKEND[@]:-0}
  local fe_count=${#CHUNKS_FRONTEND[@]:-0}
  log "Framework: ${BACKEND_FRAMEWORK} | Backend chunks: ${be_count} | Frontend chunks: ${fe_count}"
  log "Model: ${CLAUDE_MODEL} | Survey: ${SURVEY_MODEL} | Timeout: ${CLAUDE_TIMEOUT}s | Parallel: ${MAX_PARALLEL}"

  phase_0_triage
  phase_a_inventory
  phase_b_survey
  phase_c_review
  phase_d_validate
  phase_e_aggregate

  # Phase I — validate AI-generated rules against existing docs (human gate)
  if [[ -n "${EXISTING_DOCS_PATHS:-}" ]]; then
    if [[ -f "${DONE_DIR}/phase-i-pending" ]] && ! is_done "phase-i"; then
      local checklist="${VALIDATION_DIR}/VALIDATION-CHECKLIST.md"
      echo ""
      printf '  %s\n' "${RED}${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
      printf '  %s\n' "${RED}${BOLD}║  PIPELINE BLOCKED — Human sign-off required (Phase I)       ║${NC}"
      printf '  %s\n' "${RED}${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
      echo ""
      if [[ -f "$checklist" ]]; then
        local cr_total cr_done gap_total gap_done uv_total uv_done
        cr_total=$(grep -c '| CR-' "$checklist" 2>/dev/null || echo 0)
        cr_done=$(grep '| CR-' "$checklist" 2>/dev/null | grep -ci '\[x\]' || echo 0)
        gap_total=$(grep -c '| GAP-' "$checklist" 2>/dev/null || echo 0)
        gap_done=$(grep '| GAP-' "$checklist" 2>/dev/null | grep -ci '\[x\]' || echo 0)
        uv_total=$(grep -c '| UV-' "$checklist" 2>/dev/null || echo 0)
        uv_done=$(grep '| UV-' "$checklist" 2>/dev/null | grep -ci '\[x\]' || echo 0)
        printf '  %s\n' "${BOLD}Checklist progress:${NC}"
        printf '    Contradictions: %s/%s  %s\n' "$cr_done" "$cr_total" "$( [[ $cr_done -lt $cr_total ]] && echo "${RED}← must complete${NC}" || echo "${GREEN}done${NC}" )"
        printf '    Gaps:           %s/%s\n' "$gap_done" "$gap_total"
        printf '    Unverifiable:   %s/%s\n' "$uv_done" "$uv_total"
        echo ""
        # Show unsigned contradictions (most critical)
        if [[ $cr_done -lt $cr_total ]]; then
          printf '  %s\n' "${YELLOW}Unsigned contradictions:${NC}"
          grep '| CR-' "$checklist" 2>/dev/null | grep -vi '\[x\]' | while IFS='|' read -r _ id rule _rest; do
            printf '    %s %s\n' "$(echo "$id" | tr -d ' ')" "$(echo "$rule" | tr -d ' ' | cut -c1-60)"
          done
          echo ""
        fi
      fi
      printf '  %s\n' "${BOLD}Steps:${NC}"
      printf '  1. Edit:     %s\n' "${CYAN}${checklist#$PROJECT_ROOT/}${NC}"
      printf '  2. Sign off: %s\n' "${CYAN}bash scripts/review/review.sh validate-sign-off${NC}"
      printf '  3. Resume:   %s\n' "${CYAN}bash scripts/review/review.sh run${NC}"
      echo ""
      exit 1
    fi
    phase_i_validate_reconcile
    # Check if we just got blocked
    if [[ -f "${DONE_DIR}/phase-i-pending" ]] && ! is_done "phase-i"; then
      exit 1
    fi
  fi

  phase_f_spec_check
  phase_j_validate_docs
  phase_k_generate_docs
  phase_g_context
  phase_h_brain
  phase_l_cleanup

  header "Pipeline Complete — ${PROJECT_NAME}"
  printf '  %s\n' "${BOLD}Next:${NC}"
  printf '  %s   Full project intelligence\n' "${CYAN}cat docs/context/PROJECT-BRAIN.md${NC}"
  printf '  %s      Spec execution order\n' "${CYAN}cat .ai/review/master/INDEX.md${NC}"
  printf '  %s          Auto-loaded next session\n' "${CYAN}.claude/project-context.md${NC}"
}

cmd_phase() {
  local p="${1:-}"; init_dirs
  apply_framework_defaults
  p=$(echo "$p" | tr '[:lower:]' '[:upper:]')
  # AI phases need standalone terminal
  case "$p" in B|C|D|E|F|G|H|I|J|K) require_standalone "phase $p" ;; esac
  case "$p" in
    0)       phase_0_triage ;;
    A)       phase_a_inventory ;;
    B)       phase_b_survey ;;
    C)       phase_c_review ;;
    D)       phase_d_validate ;;
    E)       phase_e_aggregate ;;
    I)       phase_i_validate_reconcile ;;
    F)       phase_f_spec_check ;;
    J)       phase_j_validate_docs ;;
    K)       phase_k_generate_docs ;;
    G)       phase_g_context ;;
    H)       phase_h_brain ;;
    L)       phase_l_cleanup ;;
    *) err "Unknown phase: ${p}. Use 0, A-L."; exit 1 ;;
  esac
}

count_files() { local n=0; for f in "$@"; do [[ -e "$f" ]] && { ((n++)) || true; }; done; echo "$n"; }

cmd_status() {
  init_dirs
  header "Review Status — ${PROJECT_NAME}"
  local all_chunks=("${CHUNKS_BACKEND[@]:-}" "${CHUNKS_FRONTEND[@]:-}")
  local total="${#all_chunks[@]}"

  local n_survey n_review n_validate n_speccheck
  n_survey=$(count_files "${DONE_DIR}"/survey_*)
  n_review=$(count_files "${DONE_DIR}"/review_*)
  n_validate=$(count_files "${DONE_DIR}"/validate_*)
  n_speccheck=$(count_files "${DONE_DIR}"/speccheck_*)

  printf "  %-34s %s\n" "0 Triage (non-AI):" "$(is_done 'phase-0' && echo 'done' || echo 'pending')"
  printf "  %-34s %s\n" "A Inventory (non-AI):" "$(is_done 'phase-a' && echo 'done' || echo 'pending')"
  printf "  %-34s %s/%s\n" "B Survey (cheap):" "$n_survey" "$total"
  printf "  %-34s %s/%s\n" "C Review:" "$n_review" "$total"
  printf "  %-34s %s/%s\n" "D Validate:" "$n_validate" "$total"
  for sub in "e1-arch:E1 architecture" "e2-bl:E2 business-logic" "e3-api:E3 api-contracts" "e4-bg:E4 background" "e5-specs:E5 specs"; do
    printf "  %-34s %s\n" "  ${sub#*:}:" "$(is_done "${sub%%:*}" && echo 'done' || echo 'pending')"
  done
  if [[ -n "${EXISTING_DOCS_PATHS:-}" ]]; then
    for sub in "i1-inventory:I1 doc-inventory" "i2-crossref:I2 cross-reference" "i3-checklist:I3 checklist"; do
      printf "  %-34s %s\n" "  ${sub#*:}:" "$(is_done "${sub%%:*}" && echo 'done' || echo 'pending')"
    done
    if [[ -f "${DONE_DIR}/phase-i-pending" ]] && ! is_done "phase-i"; then
      printf "  %-34s ${YELLOW}%s${NC}\n" "I Validate & Reconcile:" "PENDING-HUMAN"
    elif is_done "phase-i"; then
      printf "  %-34s %s\n" "I Validate & Reconcile:" "done (signed off)"
    else
      printf "  %-34s %s\n" "I Validate & Reconcile:" "pending"
    fi
  fi
  printf "  %-34s %s specs\n" "F Spec Check:" "$n_speccheck"
  if [[ -n "${EXISTING_DOCS_PATHS:-}" ]]; then
    local jdocs=0 jdone=0
    while IFS= read -r doc; do
      [[ -n "$doc" ]] && [[ "$doc" == *.md ]] && { ((jdocs++)) || true; is_done "jverify:$(valdoc_slug "$doc")" && ((jdone++)) || true; }
    done < <(discover_existing_docs 2>/dev/null)
    printf "  %-34s %s/%s docs\n" "J Validate Existing Docs:" "$jdone" "$jdocs"
  fi
  printf "  %-34s %s\n" "K Generate Missing Docs:" "$(is_done 'phase-k' && echo 'done' || echo 'pending')"
  printf "  %-34s %s\n" "G Context:" "$(is_done 'phase-g' && echo 'done' || echo 'pending')"
  printf "  %-34s %s\n" "H Project Brain:" "$(is_done 'phase-h' && echo 'done' || echo 'pending')"
  printf "  %-34s %s\n" "L Cleanup & Organize:" "$(is_done 'phase-l' && echo 'done' || echo 'pending')"

  echo ""
  local r=0 y=0 g=0
  for f in "${SURVEY_DIR}"/*.txt; do
    [[ -f "$f" ]] || continue
    local risk; risk=$(grep "^RISK:" "$f" | cut -d: -f2 | tr -d ' ' || echo "")
    case "$risk" in RED) ((r++)) || true ;; YELLOW) ((y++)) || true ;; GREEN) ((g++)) || true ;; esac
  done
  printf '  Survey: %s=%s  %s=%s  %s=%s\n' "${RED}RED${NC}" "$r" "${YELLOW}YELLOW${NC}" "$y" "${GREEN}GREEN${NC}" "$g"

  local total_specs rejected
  total_specs=$(count_files "${SPECS_DIR}"/REVIEW-*)
  rejected=$(count_files "${SPECS_DIR}/rejected"/REVIEW-*)
  printf '  Specs: %s total | %s rejected\n' "$total_specs" "$rejected"

  # Check for failed/bad outputs
  local bad_reviews=0 bad_validates=0
  for f in "${CHUNKS_DIR}"/*.md; do
    [[ -f "$f" ]] || continue
    if grep -qiE "hit your limit|may not exist|issue with the selected model" "$f" 2>/dev/null; then
      ((bad_reviews++)) || true
    fi
  done
  for f in "${VALIDATED_DIR}"/*.md; do
    [[ -f "$f" ]] || continue
    if grep -qiE "hit your limit|may not exist|issue with the selected model" "$f" 2>/dev/null; then
      ((bad_validates++)) || true
    fi
  done
  [[ $bad_reviews -gt 0 ]] && warn "  ${bad_reviews} review files contain error messages (re-run: ./review.sh chunk <id>)"
  [[ $bad_validates -gt 0 ]] && warn "  ${bad_validates} validated files contain error messages (re-run: ./review.sh revalidate <id>)"

  # Check for empty master files
  for mf in bugs-and-risks.md improvement-backlog.md INDEX.md; do
    local mpath="${MASTER_DIR}/${mf}"
    [[ -f "$mpath" ]] && [[ $(wc -l < "$mpath") -le 2 ]] && warn "  ${mf} appears empty — re-run: ./review.sh phase E"
  done

  echo ""
  [[ -f "$BRAIN_FILE" ]] && ok "PROJECT-BRAIN.md exists ($(wc -l < "$BRAIN_FILE" | tr -d ' ')L)" || true
  [[ -f "${PROJECT_ROOT}/.claude/project-context.md" ]] && ok ".claude/project-context.md exists" || true
  [[ -s "$ERROR_LOG" ]] && { echo ""; warn "Recent errors:"; tail -5 "$ERROR_LOG" | sed 's/^/    /'; } || true
}

cmd_chunk() {
  require_standalone "chunk"
  local target="${1:-}"; [[ -z "$target" ]] && { err "Usage: ./review.sh chunk <id>"; exit 1; }
  init_dirs
  rm -f "${DONE_DIR}/review_${target//[\/: ]/_}" 2>/dev/null || true
  local all_chunks=("${CHUNKS_BACKEND[@]:-}" "${CHUNKS_FRONTEND[@]:-}")
  for c in "${all_chunks[@]}"; do
    parse_chunk "$c"
    if [[ "$_chunk_id" == "$target" ]]; then run_review_chunk "$c"; return 0; fi
  done
  err "Unknown chunk: ${target}"
  exit 1
}

cmd_revalidate() {
  require_standalone "revalidate"
  local target="${1:-}"; [[ -z "$target" ]] && { err "Usage: ./review.sh revalidate <id>"; exit 1; }
  init_dirs
  rm -f "${DONE_DIR}/validate_${target//[\/: ]/_}" 2>/dev/null || true
  local all_chunks=("${CHUNKS_BACKEND[@]:-}" "${CHUNKS_FRONTEND[@]:-}")
  for c in "${all_chunks[@]}"; do
    parse_chunk "$c"
    [[ "$_chunk_id" == "$target" ]] && { run_validate_chunk "$c"; return 0; }
  done
  err "Unknown chunk: ${target}"; exit 1
}

cmd_triage()  { init_dirs; phase_0_triage; }
cmd_survey()  { require_standalone "survey"; init_dirs; phase_b_survey; }

cmd_reset() {
  printf '%s\n' "${RED}${BOLD}Wipes ALL review state, docs, specs, BRAIN, CLAUDE.md patch, project-context.md.${NC}"
  read -rp "Type 'yes' to confirm: " c
  if [[ "$c" == "yes" ]]; then
    rm -rf "$REVIEW_DIR" "$VALIDATION_DIR" CLARIFICATIONS.md NEXT-STEPS.md
    find "$SPECS_DIR" -maxdepth 1 -name 'REVIEW-*' -exec rm -rf {} + 2>/dev/null || true
    rm -rf "${SPECS_DIR}/rejected" "${PROJECT_ROOT}/.claude/project-context.md"
    # Clean Phase E/G/H generated docs
    rm -f "${DOCS_DIR}/architecture.md" "${DOCS_DIR}/business-logic.md" \
          "${DOCS_DIR}/api-contracts.md" "${DOCS_DIR}/background-systems.md"
    rm -f "${CONTEXT_DIR}/business-rules.md" "${CONTEXT_DIR}/architecture.md" \
          "$BRAIN_FILE"
    rm -f "${CONTEXT_AI_DIR}/invariants.md" "${CONTEXT_AI_DIR}/common-patterns.md" \
          "${CONTEXT_AI_DIR}/change-impact-map.md" "${CONTEXT_AI_DIR}/known-gotchas.md" \
          "${CONTEXT_AI_DIR}/user-stories.md" "${CONTEXT_AI_DIR}/admin-capabilities.md"
    # Remove CLAUDE.md patch section
    if [[ -f "${PROJECT_ROOT}/CLAUDE.md" ]] && grep -q "Project Intelligence (Auto-generated by review pipeline)" "${PROJECT_ROOT}/CLAUDE.md" 2>/dev/null; then
      python3 -c "
import re
with open('${PROJECT_ROOT}/CLAUDE.md', 'r') as f: content = f.read()
content = re.sub(r'\n## ═══ Project Intelligence.*?## ════════════════════════════════════════════════════════\n', '', content, flags=re.DOTALL)
with open('${PROJECT_ROOT}/CLAUDE.md', 'w') as f: f.write(content)
" 2>/dev/null || warn "Could not remove CLAUDE.md patch — remove manually"
    fi
    warn "Reset complete."
  else log "Cancelled."; fi
}

# ===========================================================================
# ENTRYPOINT
# ===========================================================================
main() {
  local cmd="${1:-run}"
  case "$cmd" in
    run)         cmd_run ;;
    discover)    cmd_discover "${2:-}" ;;
    phase)       cmd_phase "${2:-}" ;;
    status)      cmd_status ;;
    triage)      cmd_triage ;;
    inventory)   init_dirs; apply_framework_defaults; phase_a_inventory ;;
    survey)      cmd_survey ;;
    chunk)       cmd_chunk "${2:-}" ;;
    revalidate)  cmd_revalidate "${2:-}" ;;
    validate-sign-off) cmd_validate_sign_off ;;
    reset)       cmd_reset ;;
    help|--help|-h) cat <<HELP

Usage: ./review.sh <command> [args]

First time:
  discover [--force]    Auto-generate chunk registry from filesystem

Pipeline:
  run                   Full pipeline (overnight)
  triage                Phase 0 only — free, no AI, shows risk
  inventory             Phase A only — route/job/email manifests
  survey                Phase B only — cheap survey pass
  phase <0|A-L>         Run one phase
  chunk <id>            Re-run review for one chunk
  revalidate <id>       Re-run validation for one chunk
  validate-sign-off     Sign off Phase I checklist after human review

Utility:
  status                Progress dashboard
  reset                 Wipe all state

Phases:
  0  Triage     — Static analysis, npm/composer audit, git hotspots, security scan (free)
  A  Inventory  — routes, jobs, events, emails manifests (free)
  B  Survey     — cheap model, file-list only, RED/YELLOW/GREEN per chunk
  C  Review     — full model, assume-buggy stance, 13-criteria checklist
  D  Validate   — semi-blind adversarial, CONFIRMED/REJECTED per finding
  E  Aggregate  — 5 separate doc-writing calls
  I  Validate   — cross-reference AI rules against existing docs; human sign-off gate
  F  Spec Check — validate each spec before it's actionable
  J  Doc Verify — validate existing docs claims against actual code; produce cleaned versions
  K  Doc Gen    — identify doc gaps; generate missing business rules, edge cases, API contracts
  G  Context    — write docs that /deep-review loads (uses all validated + generated docs)
  H  Brain      — PROJECT-BRAIN.md + CLAUDE.md patch + .claude/project-context.md
  L  Cleanup    — archive intermediates, apply cleaned docs, create manifest

Supported frameworks (auto-detected):
  laravel, drupal, symfony, django, rails, node, generic

Config variables (review.config.sh):
  BACKEND_FRAMEWORK         Override auto-detection (laravel|drupal|symfony|django|rails|node|generic)
  STATIC_ANALYSIS_CMD       Static analysis command (replaces PHPSTAN_CMD)
  STATIC_ANALYSIS_ERROR_THRESHOLD  Error count threshold for RED risk (default: 10)
  SOURCE_EXTENSIONS         Space-separated list of file extensions to scan
  BACKEND_SRC_PATHS         Space-separated source paths (relative to project root)
  EXISTING_DOCS_PATHS       Paths to existing docs for Phase I (empty = skip Phase I)
  VALIDATION_MODEL          Model for Phase I (default: same as CLAUDE_MODEL)

Env:
  CLAUDE_MODEL    (default: sonnet)
  SURVEY_MODEL    (default: haiku)
  CLAUDE_TIMEOUT  (default: 720)
  MAX_PARALLEL    (default: 5)
  REVIEW_BARE             auto|true|false (default: auto = --bare when ANTHROPIC_API_KEY is set)
  REVIEW_PERMISSION_MODE  (default: dontAsk — unlisted tools are denied, never prompted)
  REVIEW_MAX_BUDGET_USD   per-call cap (default: 3.00; empty = no cap)

HELP
      ;;
    *) err "Unknown command: ${cmd}. Run './review.sh help'"; exit 1 ;;
  esac
}

main "$@"