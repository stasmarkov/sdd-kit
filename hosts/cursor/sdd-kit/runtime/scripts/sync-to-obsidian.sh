#!/usr/bin/env bash
# =============================================================================
# sync-to-obsidian.sh — Migrate project specs, docs, reviews to Obsidian vault
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
VAULT_PATH="${OBSIDIAN_VAULT:-$HOME/Documents/Obsidian Vault}"
PROJECT_NAME=""
PROJECT_ROOT=""
MODE="full"  # full|specs|reviews|docs
DRY_RUN=false
SYNCED=0

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
CYAN=$'\033[0;36m'; BOLD=$'\033[1m'; NC=$'\033[0m'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: $(basename "$0") [options] <project-root>

Options:
  --project=NAME    Project name (default: from review.config.sh or directory name)
  --vault=PATH      Obsidian vault path (default: ~/Documents/Obsidian Vault)
  --mode=MODE       What to sync: full, specs, reviews, docs (default: full)
  --dry-run         Show what would be synced without writing
  -h, --help        Show this help

Examples:
  $(basename "$0") ~/work/project/be
  $(basename "$0") --project=KnowCrunch --mode=specs ~/work/larafun/knowcrunch-api
  $(basename "$0") --dry-run ~/work/project/be
EOF
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --project=*)  PROJECT_NAME="${arg#*=}" ;;
    --vault=*)    VAULT_PATH="${arg#*=}" ;;
    --mode=*)     MODE="${arg#*=}" ;;
    --dry-run)    DRY_RUN=true ;;
    -h|--help)    usage ;;
    -*)           echo "Unknown option: $arg"; exit 1 ;;
    *)            PROJECT_ROOT="$arg" ;;
  esac
done

[[ -z "$PROJECT_ROOT" ]] && { echo "Error: project root path required"; usage; }
PROJECT_ROOT="$(cd "$PROJECT_ROOT" && pwd)"
[[ -d "$PROJECT_ROOT" ]] || { echo "Error: $PROJECT_ROOT is not a directory"; exit 1; }

# Auto-detect project name from review.config.sh or directory name
if [[ -z "$PROJECT_NAME" ]]; then
  if [[ -f "$PROJECT_ROOT/scripts/review/review.config.sh" ]]; then
    PROJECT_NAME=$(grep '^PROJECT_NAME=' "$PROJECT_ROOT/scripts/review/review.config.sh" | head -1 | cut -d'"' -f2)
  fi
  [[ -z "$PROJECT_NAME" ]] && PROJECT_NAME=$(basename "$PROJECT_ROOT")
fi

VAULT_PROJECT="${VAULT_PATH}/Projects/${PROJECT_NAME}"

log()  { printf '%s\n' "${CYAN}[sync]${NC} $*"; }
ok()   { printf '%s\n' "${GREEN}[sync]${NC} $*"; }
warn() { printf '%s\n' "${YELLOW}[sync]${NC} $*"; }
err()  { printf '%s\n' "${RED}[sync]${NC} $*" >&2; }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Convert kebab-case-filename to Title Case Name
to_title() {
  local name="$1"
  # Remove .md extension
  name="${name%.md}"
  # Remove REVIEW- prefix
  name="${name#REVIEW-}"
  # Remove date stamps (YYYYMMDD or YYYY-MM-DD patterns)
  name=$(echo "$name" | sed -E 's/[0-9]{8}-?//g; s/^-//')
  # Convert hyphens/underscores to spaces
  name=$(echo "$name" | tr '-' ' ' | tr '_' ' ')
  # Title case using awk (macOS compatible)
  echo "$name" | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)}1' | sed 's/  */ /g; s/^ //; s/ $//'
}

# Determine spec priority from filename or path
get_priority() {
  local path="$1"
  if echo "$path" | grep -qiE 'P1|critical|urgent'; then echo "P1-critical"
  elif echo "$path" | grep -qiE 'P2|medium|important'; then echo "P2-medium"
  elif echo "$path" | grep -qiE 'P3|low|nice'; then echo "P3-low"
  else echo "P2-medium"  # default
  fi
}

# Add frontmatter to content
add_frontmatter() {
  local project="$1" type="$2" source_path="$3" content="$4"
  local tags="$type"
  local date; date=$(date '+%Y-%m-%d')

  # Extract module tags from content
  for mod in lms cms commerce crm payments wallet shared notifications statistics legal; do
    if echo "$content" | grep -qiE "\b${mod}\b"; then
      tags="${tags}, ${mod}"
    fi
  done

  # Check if content already has frontmatter
  if echo "$content" | head -1 | grep -q '^---$'; then
    # Update existing frontmatter — add project and sync-date
    echo "$content" | sed "2i\\
project: \"${project}\"\\
synced: \"${date}\"\\
source-path: \"${source_path}\""
  else
    cat <<FM
---
project: "${project}"
type: ${type}
synced: "${date}"
source-path: "${source_path}"
tags: [${tags}]
---

${content}
FM
  fi
}

# Sync a single file
sync_file() {
  local src="$1" dest="$2" type="$3"
  local source_path="${src#"$PROJECT_ROOT"/}"

  if [[ "$DRY_RUN" == true ]]; then
    log "  [dry-run] ${source_path} -> ${dest#"$VAULT_PATH"/}"
    ((SYNCED++)) || true
    return
  fi

  mkdir -p "$(dirname "$dest")"
  local content; content=$(cat "$src")
  add_frontmatter "$PROJECT_NAME" "$type" "$source_path" "$content" > "$dest"
  ((SYNCED++)) || true
}

# ---------------------------------------------------------------------------
# Sync functions
# ---------------------------------------------------------------------------

sync_specs() {
  log "Syncing specs..."
  local specs_dir="$PROJECT_ROOT/.ai/specs"
  [[ -d "$specs_dir" ]] || { warn "No .ai/specs/ directory"; return; }

  # Active specs (directories only — contain spec-lite.md + tasks.md)
  for spec_dir in "$specs_dir"/*/; do
    [[ -d "$spec_dir" ]] || continue
    local slug; slug=$(basename "$spec_dir")
    [[ "$slug" == "rejected" || "$slug" == "archive" ]] && continue

    local priority; priority=$(get_priority "$slug")
    local title; title=$(to_title "$slug")
    local dest_dir="${VAULT_PROJECT}/Specs/${priority}"

    # Merge spec-lite.md and tasks.md into one note
    local content=""
    [[ -f "$spec_dir/spec-lite.md" ]] && content=$(cat "$spec_dir/spec-lite.md")
    if [[ -f "$spec_dir/tasks.md" ]]; then
      content="${content}

---
## Tasks
$(cat "$spec_dir/tasks.md")"
    fi

    if [[ -n "$content" ]]; then
      local dest="${dest_dir}/${title}.md"
      if [[ "$DRY_RUN" == true ]]; then
        log "  [dry-run] ${spec_dir#"$PROJECT_ROOT"/} -> ${dest#"$VAULT_PATH"/}"
        ((SYNCED++)) || true
      else
        mkdir -p "$dest_dir"
        add_frontmatter "$PROJECT_NAME" "spec" "${spec_dir#"$PROJECT_ROOT"/}" "$content" > "$dest"
        ((SYNCED++)) || true
      fi
    fi
  done

  # Archived specs — each subdirectory becomes one merged note
  if [[ -d "$specs_dir/archive" ]]; then
    for arch_dir in "$specs_dir/archive"/*/; do
      [[ -d "$arch_dir" ]] || continue
      local arch_slug; arch_slug=$(basename "$arch_dir")
      local arch_title; arch_title=$(to_title "$arch_slug")
      local arch_content=""

      # Merge all .md files in the spec dir into one note
      for f in "$arch_dir"/*.md; do
        [[ -f "$f" ]] || continue
        local fname; fname=$(basename "$f" .md)
        arch_content="${arch_content}
## ${fname}
$(cat "$f")

---
"
      done

      if [[ -n "$arch_content" ]]; then
        local dest="${VAULT_PROJECT}/Specs/Archive/${arch_title}.md"
        if [[ "$DRY_RUN" == true ]]; then
          log "  [dry-run] ${arch_dir#"$PROJECT_ROOT"/} -> ${dest#"$VAULT_PATH"/}"
          ((SYNCED++)) || true
        else
          mkdir -p "${VAULT_PROJECT}/Specs/Archive"
          add_frontmatter "$PROJECT_NAME" "spec" "${arch_dir#"$PROJECT_ROOT"/}" "$arch_content" > "$dest"
          ((SYNCED++)) || true
        fi
      fi
    done
    # Also sync any loose .md files directly in archive/
    for f in "$specs_dir/archive"/*.md; do
      [[ -f "$f" ]] || continue
      local title; title=$(to_title "$(basename "$f")")
      sync_file "$f" "${VAULT_PROJECT}/Specs/Archive/${title}.md" "spec"
    done
  fi

  # Rejected specs
  if [[ -d "$specs_dir/rejected" ]]; then
    for spec_dir in "$specs_dir/rejected"/REVIEW-*; do
      [[ -d "$spec_dir" ]] || continue
      local slug; slug=$(basename "$spec_dir")
      local title; title=$(to_title "$slug")
      [[ -f "$spec_dir/spec-lite.md" ]] && \
        sync_file "$spec_dir/spec-lite.md" "${VAULT_PROJECT}/Specs/Rejected/${title}.md" "spec"
    done
  fi
}

sync_reviews() {
  log "Syncing review output..."
  local review_dir="$PROJECT_ROOT/.ai/review"
  [[ -d "$review_dir" ]] || { warn "No .ai/review/ directory"; return; }

  # Review chunks
  for f in "$review_dir/chunks"/*.md; do
    [[ -f "$f" ]] || continue
    local title; title=$(to_title "$(basename "$f")")
    sync_file "$f" "${VAULT_PROJECT}/Reviews/Chunks/${title}.md" "review"
  done

  # Validated findings
  for f in "$review_dir/validated"/*.md; do
    [[ -f "$f" ]] || continue
    local title; title=$(to_title "$(basename "$f")")
    sync_file "$f" "${VAULT_PROJECT}/Reviews/Validated/${title}.md" "review"
  done

  # Master docs (bugs, backlog, index)
  for f in "$review_dir/master"/*.md; do
    [[ -f "$f" ]] || continue
    local title; title=$(to_title "$(basename "$f")")
    sync_file "$f" "${VAULT_PROJECT}/Reviews/${title}.md" "review"
  done

  # Validation checklist
  if [[ -f "$review_dir/validation/VALIDATION-CHECKLIST.md" ]]; then
    sync_file "$review_dir/validation/VALIDATION-CHECKLIST.md" \
      "${VAULT_PROJECT}/Reviews/Validation Checklist.md" "review"
  fi
  if [[ -f "$review_dir/validation/cross-reference.md" ]]; then
    sync_file "$review_dir/validation/cross-reference.md" \
      "${VAULT_PROJECT}/Reviews/Cross Reference.md" "review"
  fi
  if [[ -f "$review_dir/validation/validated-rules.md" ]]; then
    sync_file "$review_dir/validation/validated-rules.md" \
      "${VAULT_PROJECT}/Reviews/Validated Rules.md" "review"
  fi

  # Manual reviews (.ai/reviews/)
  if [[ -d "$PROJECT_ROOT/.ai/reviews" ]]; then
    for f in "$PROJECT_ROOT/.ai/reviews"/*.md; do
      [[ -f "$f" ]] || continue
      local title; title=$(to_title "$(basename "$f")")
      sync_file "$f" "${VAULT_PROJECT}/Reviews/Manual/${title}.md" "review"
    done
  fi
}

sync_docs() {
  log "Syncing documentation (verified only)..."

  # AI-GENERATED docs (Phase E/G/H) are NOT synced until Phase I validates them.
  # Only sync: human-written docs, validated rules, and templates.

  # Phase I validated rules (human-approved) — the only AI output we trust
  local validated="${PROJECT_ROOT}/.ai/review/validation/validated-rules.md"
  if [[ -f "$validated" ]]; then
    sync_file "$validated" "${VAULT_PROJECT}/Business Rules/Validated Rules.md" "business-rules"
  fi

  # Human-written architecture guides (not AI-generated Phase E output)
  # These have no "Generated:" frontmatter — they were written by humans
  if [[ -d "$PROJECT_ROOT/docs/architecture" ]]; then
    for f in "$PROJECT_ROOT/docs/architecture"/*.md; do
      [[ -f "$f" ]] || continue
      # Skip AI-generated files (Phase E output has specific names)
      local bname; bname=$(basename "$f")
      case "$bname" in
        architecture.md|business-logic.md|api-contracts.md|background-systems.md)
          # These are AI-generated by Phase E — skip unless Phase I signed off
          if [[ -f "${PROJECT_ROOT}/.ai/review/.done/phase-i" ]]; then
            local title; title=$(to_title "$bname")
            sync_file "$f" "${VAULT_PROJECT}/Architecture/${title}.md" "architecture"
          else
            log "  [skip] ${bname} (AI-generated, Phase I not signed off)"
          fi
          ;;
        *)
          # Human-written doc — always sync
          local title; title=$(to_title "$bname")
          sync_file "$f" "${VAULT_PROJECT}/Architecture/${title}.md" "architecture"
          ;;
      esac
    done
  fi

  # Context docs — only sync after Phase I validation
  if [[ -f "${PROJECT_ROOT}/.ai/review/.done/phase-i" ]]; then
    if [[ -d "$PROJECT_ROOT/docs/context" ]]; then
      for f in "$PROJECT_ROOT/docs/context"/*.md; do
        [[ -f "$f" ]] || continue
        local title; title=$(to_title "$(basename "$f")")
        sync_file "$f" "${VAULT_PROJECT}/Context/${title}.md" "context"
      done
    fi
    if [[ -d "$PROJECT_ROOT/docs/context-for-ai" ]]; then
      for f in "$PROJECT_ROOT/docs/context-for-ai"/*.md; do
        [[ -f "$f" ]] || continue
        local title; title=$(to_title "$(basename "$f")")
        sync_file "$f" "${VAULT_PROJECT}/Context/AI/${title}.md" "context"
      done
    fi
  else
    log "  [skip] Context docs (AI-generated, Phase I not signed off)"
  fi

  # Standalone human-written docs in docs/
  for f in "$PROJECT_ROOT/docs"/*.md; do
    [[ -f "$f" ]] || continue
    local title; title=$(to_title "$(basename "$f")")
    sync_file "$f" "${VAULT_PROJECT}/${title}.md" "docs"
  done

  # Business rules (human-written domain knowledge)
  if [[ -d "$PROJECT_ROOT/docs/business-rules" ]]; then
    for f in "$PROJECT_ROOT/docs/business-rules"/*.md; do
      [[ -f "$f" ]] || continue
      local title; title=$(to_title "$(basename "$f")")
      sync_file "$f" "${VAULT_PROJECT}/Business Rules/${title}.md" "business-rules"
    done
  fi

  # Guides (human-written how-tos and analysis)
  for subdir in guides commerce flows analysis rules; do
    if [[ -d "$PROJECT_ROOT/docs/${subdir}" ]]; then
      find "$PROJECT_ROOT/docs/${subdir}" -name "*.md" -not -path "*/node_modules/*" | sort | while read -r f; do
        local rel="${f#"$PROJECT_ROOT"/docs/"${subdir}"/}"
        local title; title=$(to_title "$(basename "$f")")
        local dest_subdir; dest_subdir=$(dirname "$rel")
        if [[ "$dest_subdir" == "." ]]; then
          sync_file "$f" "${VAULT_PROJECT}/Guides/$(echo "$subdir" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')/${title}.md" "guide"
        else
          local sub_title; sub_title=$(to_title "$dest_subdir")
          sync_file "$f" "${VAULT_PROJECT}/Guides/$(echo "$subdir" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')/${sub_title}/${title}.md" "guide"
        fi
      done
    fi
  done

  # Wiki (project structure documentation)
  if [[ -d "$PROJECT_ROOT/wiki" ]]; then
    find "$PROJECT_ROOT/wiki" -name "*.md" | sort | while read -r f; do
      local title; title=$(to_title "$(basename "$f")")
      sync_file "$f" "${VAULT_PROJECT}/Wiki/${title}.md" "wiki"
    done
  fi

  # Permissions docs
  if [[ -d "$PROJECT_ROOT/docs/architecture/permissions" ]]; then
    for f in "$PROJECT_ROOT/docs/architecture/permissions"/*.md; do
      [[ -f "$f" ]] || continue
      local title; title=$(to_title "$(basename "$f")")
      sync_file "$f" "${VAULT_PROJECT}/Architecture/Permissions/${title}.md" "architecture"
    done
  fi

  # Serena memories (cross-tool knowledge)
  if [[ -d "$PROJECT_ROOT/.serena/memories" ]]; then
    find "$PROJECT_ROOT/.serena/memories" -name "*.md" | sort | while read -r f; do
      local title; title=$(to_title "$(basename "$f")")
      sync_file "$f" "${VAULT_PROJECT}/Context/Serena/${title}.md" "context"
    done
  fi
}

sync_kanban() {
  local kanban="$PROJECT_ROOT/.ai/kanban.json"
  [[ -f "$kanban" ]] || return

  log "Converting kanban.json..."
  if [[ "$DRY_RUN" == true ]]; then
    log "  [dry-run] .ai/kanban.json -> Projects/${PROJECT_NAME}/Kanban.md"
    ((SYNCED++)) || true
    return
  fi

  # Convert JSON kanban to Obsidian kanban-plugin format
  python3 -c "
import json, sys
with open('$kanban') as f:
    data = json.load(f)

print('---')
print('kanban-plugin: basic')
print('project: \"$PROJECT_NAME\"')
print('type: kanban')
print('synced: \"$(date '+%Y-%m-%d')\"')
print('source-path: \".ai/kanban.json\"')
print('tags: [kanban, project]')
print('---')
print()

# Handle structured kanban with columns dict
columns = data.get('columns', data) if isinstance(data, dict) else {}
if isinstance(columns, dict):
    for col_name, items in columns.items():
        if col_name in ('version', 'updated_at'):
            continue
        display = col_name.replace('_', ' ').title()
        print(f'## {display}')
        print()
        if not isinstance(items, list) or not items:
            print()
            continue
        for item in items:
            if isinstance(item, dict):
                title = item.get('title', item.get('name', str(item)))
                priority = item.get('priority', '')
                progress = item.get('progress', {})
                done = progress.get('completed', 0)
                total = progress.get('total', 0)
                spec = item.get('spec_path', '')
                mark = 'x' if done == total and total > 0 else ' '
                extra = f' [{priority}]' if priority else ''
                prog = f' ({done}/{total})' if total > 0 else ''
                link = f' [[{spec.rstrip(\"/\").split(\"/\")[-1]}]]' if spec else ''
                print(f'- [{mark}]{extra} {title}{prog}{link}')
            else:
                print(f'- [ ] {item}')
        print()
elif isinstance(data, list):
    print('## Tasks')
    for item in data:
        title = item.get('title', str(item)) if isinstance(item, dict) else str(item)
        print(f'- [ ] {title}')
" > "${VAULT_PROJECT}/Kanban.md" 2>/dev/null || {
    # Fallback: just copy as-is with frontmatter
    warn "Could not parse kanban.json — copying raw"
    add_frontmatter "$PROJECT_NAME" "kanban" ".ai/kanban.json" "$(cat "$kanban")" \
      > "${VAULT_PROJECT}/Kanban.md"
  }
  ((SYNCED++)) || true
}

create_index() {
  log "Creating project index..."
  if [[ "$DRY_RUN" == true ]]; then
    log "  [dry-run] -> Projects/${PROJECT_NAME}/Index.md"
    return
  fi

  local spec_count=0 review_count=0 doc_count=0
  [[ -d "${VAULT_PROJECT}/Specs" ]] && spec_count=$(find "${VAULT_PROJECT}/Specs" -name "*.md" | wc -l | tr -d ' ')
  [[ -d "${VAULT_PROJECT}/Reviews" ]] && review_count=$(find "${VAULT_PROJECT}/Reviews" -name "*.md" | wc -l | tr -d ' ')
  [[ -d "${VAULT_PROJECT}/Architecture" ]] && doc_count=$(find "${VAULT_PROJECT}/Architecture" -name "*.md" | wc -l | tr -d ' ')

  cat > "${VAULT_PROJECT}/Index.md" <<EOF
---
project: "${PROJECT_NAME}"
type: index
updated: "$(date '+%Y-%m-%d')"
tags: [project, index]
---

# ${PROJECT_NAME}

## Quick Links
- [[Project Brain]]
- [[Business Rules]]
- [[Architecture]]
- [[Kanban]]

## Specs
- [[Specs/P1-critical/]] — Critical fixes
- [[Specs/P2-medium/]] — Improvements
- [[Specs/P3-low/]] — Nice to have
- [[Specs/Archive/]] — Completed/archived

## Reviews
- [[Reviews/Bugs and Risks]]
- [[Reviews/Improvement Backlog]]
- [[Reviews/Validation Checklist]]

## Context (AI)
- [[Context/AI/Invariants]]
- [[Context/AI/Known Gotchas]]
- [[Context/AI/Change Impact Map]]
- [[Context/AI/Common Patterns]]

## Stats
- Specs: ${spec_count}
- Reviews: ${review_count}
- Architecture docs: ${doc_count}
- Last sync: $(date '+%Y-%m-%d %H:%M')
- Source: \`${PROJECT_ROOT}\`
EOF
}

write_sync_state() {
  [[ "$DRY_RUN" == true ]] && return
  cat > "${VAULT_PROJECT}/.sync-state.json" <<EOF
{
  "last_sync": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "project_root": "${PROJECT_ROOT}",
  "files_synced": ${SYNCED},
  "mode": "${MODE}",
  "project_name": "${PROJECT_NAME}"
}
EOF
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo ""
printf '%s\n' "${BOLD}${CYAN}==========================================${NC}"
printf '%s\n' "${BOLD}${CYAN}  Sync to Obsidian — ${PROJECT_NAME}${NC}"
printf '%s\n' "${BOLD}${CYAN}==========================================${NC}"
echo ""
log "Project: ${PROJECT_ROOT}"
log "Vault:   ${VAULT_PATH}"
log "Dest:    Projects/${PROJECT_NAME}/"
log "Mode:    ${MODE}"
[[ "$DRY_RUN" == true ]] && warn "DRY RUN — no files will be written"
echo ""

mkdir -p "$VAULT_PROJECT"

case "$MODE" in
  full)
    sync_specs
    sync_reviews
    sync_docs
    sync_kanban
    ;;
  specs)   sync_specs ;;
  reviews) sync_reviews ;;
  docs)    sync_docs ;;
  *)       err "Unknown mode: $MODE"; exit 1 ;;
esac

create_index
write_sync_state

echo ""
if [[ "$DRY_RUN" == true ]]; then
  ok "Dry run complete: ${SYNCED} files would be synced"
else
  ok "Synced ${SYNCED} files to ${VAULT_PROJECT#"$HOME"/}"
fi
echo ""