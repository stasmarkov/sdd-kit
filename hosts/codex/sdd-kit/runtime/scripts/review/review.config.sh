#!/usr/bin/env bash
# =============================================================================
# review.config.sh — Project-specific config for the review pipeline
#
# FIRST TIME:
#   1. Fill in PROJECT_* below (or let auto-detect handle it)
#   2. ./review.sh discover   → auto-generates CHUNKS_BACKEND / CHUNKS_FRONTEND
#   3. Edit chunks if needed, then: ./review.sh run
#
# SUPPORTED FRAMEWORKS:
#   laravel, laravel+nextjs, drupal, symfony, django, rails, node, generic
# =============================================================================

# --- Project identity --------------------------------------------------------
PROJECT_NAME=""                      # REQUIRED: your project name
PROJECT_TYPE=""                      # auto-detected if empty: laravel|laravel+nextjs|drupal|symfony|django|rails|node|generic
PROJECT_DESCRIPTION=""               # REQUIRED: what the project does and who uses it

# --- Backend -----------------------------------------------------------------
BACKEND_FRAMEWORK=""                 # auto-detected if empty: laravel|drupal|symfony|django|rails|node|generic

# Source file extensions for this project (space-separated, no dots)
# Auto-populated by framework detection if empty
SOURCE_EXTENSIONS=""
# Examples:
#   Laravel/Drupal/Symfony: "php"
#   Django:                 "py"
#   Rails:                  "rb"
#   Node:                   "js ts"
#   Laravel+Next.js:        "php ts tsx"

# Paths to scan for different subsystems (space-separated, relative to project root)
# Auto-populated by discover if empty. Set to "" to skip a category.
BACKEND_SRC_PATHS=""                 # Main source code directories
BACKEND_ROUTES_PATHS=""              # Route/URL definitions
BACKEND_JOBS_PATHS=""                # Background jobs, tasks, workers
BACKEND_EVENTS_PATHS=""              # Event system
BACKEND_MAIL_PATHS=""                # Email/notification templates
BACKEND_MIGRATION_PATHS=""           # Database migrations

# --- Static analysis (leave empty to skip) -----------------------------------
STATIC_ANALYSIS_CMD=""               # Runs in Phase 0. Must output to stdout.
TEST_CMD=""                          # Not used by pipeline yet, but documented.
# Examples per framework:
#   Laravel:  STATIC_ANALYSIS_CMD="vendor/bin/phpstan analyse --level=9 --error-format=json"
#   Laravel (DDEV): STATIC_ANALYSIS_CMD="ddev php vendor/bin/phpstan analyse --level=9 --error-format=json"
#   Drupal:   STATIC_ANALYSIS_CMD="vendor/bin/phpstan analyse --level=6 --error-format=json web/modules/custom"
#   Django:   STATIC_ANALYSIS_CMD="mypy . --no-error-summary"
#   Rails:    STATIC_ANALYSIS_CMD="bundle exec rubocop --format json"
#   Node:     STATIC_ANALYSIS_CMD="npx eslint . --format json"
#   Symfony:  STATIC_ANALYSIS_CMD="vendor/bin/phpstan analyse --level=8 --error-format=json src"

# --- Frontend(s) -------------------------------------------------------------
# Format: "id:type:path:description"
# Types: nextjs, nuxt, react, vue, svelte, angular, generic
declare -a FRONTENDS=(
  # "ap:nextjs:/path/to/admin-panel:Admin panel for internal users"
  # "eus:nextjs:/path/to/end-user-site:Public-facing end user site"
  # "fe:nuxt:/path/to/frontend:Main frontend application"
  # "fe:react:/path/to/frontend:Single page application"
)
FRONTEND_TYPECHECK_CMD=""            # Leave empty to skip. Examples: "npx tsc --noEmit", "npx vue-tsc --noEmit"
FRONTEND_LINT_CMD=""                 # Leave empty to skip. Examples: "npx eslint . --ext .ts,.tsx"

# --- AI settings -------------------------------------------------------------
CLAUDE_MODEL="${CLAUDE_MODEL:-sonnet}"
SURVEY_MODEL="${SURVEY_MODEL:-haiku}"  # cheap model for Phase B
CLAUDE_TIMEOUT="${CLAUDE_TIMEOUT:-720}"
MAX_PARALLEL="${MAX_PARALLEL:-5}"

# --- Headless safety (every claude -p call) ----------------------------------
# REVIEW_BARE: --bare skips repo hooks, plugins, MCP auto-discovery and CLAUDE.md,
#   so reviewing an untrusted checkout cannot execute code through its settings.
#   Bare mode authenticates only with ANTHROPIC_API_KEY (no OAuth / claude login).
#   auto = bare when ANTHROPIC_API_KEY is set | true | false
REVIEW_BARE="${REVIEW_BARE:-auto}"
# Tools outside each call's --allowedTools list are denied, never prompted.
REVIEW_PERMISSION_MODE="${REVIEW_PERMISSION_MODE:-dontAsk}"
# Per-call spend cap in USD (--max-budget-usd). Empty string disables the cap.
REVIEW_MAX_BUDGET_USD="${REVIEW_MAX_BUDGET_USD-3.00}"

# --- Existing docs for validation (Phase I) ---------------------------------
# Space-separated paths (relative to project root) for pre-existing documentation,
# specs, API docs, READMEs. Phase I cross-references these against AI-generated rules.
# Leave empty to skip Phase I entirely.
EXISTING_DOCS_PATHS=""
# Examples:
#   "docs specs .ai/specs README.md"
#   "docs/*.md Modules/*/README.md requirements/"
#   "docs/ wiki/ specs/ *.md"
VALIDATION_MODEL="${VALIDATION_MODEL:-$CLAUDE_MODEL}"

# --- Output paths (relative to project root) ---------------------------------
REVIEW_DIR=".ai/review"
SPECS_DIR=".ai/specs"
DOCS_DIR="docs/architecture"
CONTEXT_DIR="docs/context"
CONTEXT_AI_DIR="docs/context-for-ai"
BRAIN_FILE="docs/context/PROJECT-BRAIN.md"

# Paths /deep-review loads as ground truth in its Phase 1
DEEP_REVIEW_RULES_PATH="docs/context/business-rules.md"
DEEP_REVIEW_ARCH_PATH="docs/context/architecture.md"

# --- Risk thresholds (Phase 0 triage) ----------------------------------------
COMPLEXITY_THRESHOLD=10    # branches per file above this = flagged
STATIC_ANALYSIS_ERROR_THRESHOLD=0   # any error = module RED
GIT_HOTSPOT_THRESHOLD=5    # commits in 90 days above = hotspot

# --- Chunk registry (edit manually or regenerate: ./review.sh discover --force) ---
# Format: "id|display_name|paths|focus_areas"
declare -a CHUNKS_BACKEND=(
  # Run ./review.sh discover to populate this
)
declare -a CHUNKS_FRONTEND=(
  # Run ./review.sh discover to populate this
)
# --- End chunk registry ---