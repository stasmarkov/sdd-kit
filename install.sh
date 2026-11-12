#!/bin/bash
#
# SDD Kit — file-copy installer
#
# Usage:
#   ./install.sh                               # interactive
#   ./install.sh --project [--minimal|--full]  # install into ./.claude
#   ./install.sh --user    [--minimal|--full]  # install into ~/.claude
#   ./install.sh --project --stack=laravel     # choose stack add-ons (default: the detected stack, else laravel,nextjs; none = core only)
#   ./install.sh --project --with=ops,ios      # add optional add-ons (derived from src/plugins/*/.claude-plugin/plugin.json; none = skip devenv)
#   ./install.sh --project --prune             # on an upgrade, remove installed add-ons that are not selected
#   ./install.sh --project --dry-run           # show what would change, write nothing
#   ./install.sh --host codex --project        # install for another host (claude is the default)
#   ./install.sh --host codex --project --uninstall
#   ./install.sh --help
#
# Installs merge into the target: files the framework does not own are never
# touched. A manifest (.framework-manifest) records what was installed, so a
# later run updates changed files, removes files the framework no longer ships,
# and backs up anything it overwrites or removes (the five newest backups are kept).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=$(tr -d '[:space:]' < "$SCRIPT_DIR/VERSION" 2>/dev/null || true)
VERSION="${VERSION:-0.0.0}"

# Source roots. The workshop keeps everything under src/; the dist tree splits
# it into plugins/sdd-kit (agents, skills, commands, workflows, output styles,
# hook scripts), share/ (templates, settings, docs, installer scripts) and
# plugins/sdd-kit-<addon>.
resolve_sources() {
    if [[ -d "$SCRIPT_DIR/src/agents" ]]; then
        CORE_DIR="$SCRIPT_DIR/src"
        SHARE_DIR="$SCRIPT_DIR/src"
        HOOK_SCRIPTS_DIR="$SCRIPT_DIR/scripts"
        ADDON_ROOT="$SCRIPT_DIR/src/plugins"
        ADDON_PREFIX=""
    elif [[ -f "$SCRIPT_DIR/plugins/sdd-kit/.claude-plugin/plugin.json" && -d "$SCRIPT_DIR/share" ]]; then
        CORE_DIR="$SCRIPT_DIR/plugins/sdd-kit"
        SHARE_DIR="$SCRIPT_DIR/share"
        HOOK_SCRIPTS_DIR="$SCRIPT_DIR/plugins/sdd-kit/scripts"
        ADDON_ROOT="$SCRIPT_DIR/plugins"
        ADDON_PREFIX="sdd-kit-"
    else
        printf 'Error: framework sources not found next to %s.\n  Expected the workshop layout (src/agents/) or the dist layout (plugins/sdd-kit/.claude-plugin/plugin.json and share/).\n  Run install.sh from a clone of the repository or from the dist tree.\n' "$SCRIPT_DIR" >&2
        exit 1
    fi
    ADDONS_AVAILABLE=""; STACK_ADDONS=""; TOOL_ADDONS=""
    local dir name addon
    for dir in "$ADDON_ROOT/${ADDON_PREFIX}"*/; do
        dir="${dir%/}"
        [[ -d "$dir" ]] || continue
        name="$(basename "$dir")"
        if [[ -z "$ADDON_PREFIX" && ! -f "$dir/.claude-plugin/plugin.json" ]]; then
            continue
        fi
        is_preset "$dir" && continue
        addon="${name#"$ADDON_PREFIX"}"
        ADDONS_AVAILABLE+="${ADDONS_AVAILABLE:+ }$addon"
        # A stack add-on ships a stack manifest; every other add-on is a tool add-on.
        if [[ -f "$dir/stack.json" ]]; then
            STACK_ADDONS+="${STACK_ADDONS:+ }$addon"
        else
            TOOL_ADDONS+="${TOOL_ADDONS:+ }$addon"
        fi
    done
}

# A preset only lists dependencies: no component directories of its own.
is_preset() {
    local dir="$1" component
    [[ -f "$dir/.claude-plugin/plugin.json" ]] && grep -q '"dependencies"' "$dir/.claude-plugin/plugin.json" || return 1
    for component in agents skills hooks scripts rules templates mcp-configs stack.json; do
        [[ -e "$dir/$component" ]] && return 1
    done
    return 0
}

addon_dir() { printf '%s/%s%s' "$ADDON_ROOT" "$ADDON_PREFIX" "$1"; }
resolve_sources

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'
BOLD=$'\033[1m'; NC=$'\033[0m'

INSTALL_MODE=""
INSTALL_TYPE=""
ADDONS=""
STACK_GIVEN=false
STACK_NONE=false
STACK_LIST=""
WITH_GIVEN=false
WITH_LIST=""
WITH_NONE=false
PRUNE=false
INTERACTIVE=false
UPGRADE=false
INSTALLED_STACKS=""
INSTALLED_TOOLS=""
KEEPING_ADDONS=""
REMOVING_ADDONS=""
DROPPED_HOOKS=""
DEFAULT_STACKS="laravel nextjs"
DETECTED_STACKS=""
DETECTED_FROM=""
THIRD_PARTY=false
DRY_RUN=false
ASSUME_YES=false
TARGET_DIR=""
MCP_TARGET=""
STAMP=$(date +%Y%m%d_%H%M%S)

# Files earlier versions installed that 2.0 no longer ships. Removed (after
# backup) even when no manifest exists yet, i.e. on upgrades from 1.x, but only
# when the file still matches a version the kit shipped: RETIRED_HASHES lists
# them (regenerate with tools/gen-retired-hashes.sh after editing this list).
RETIRED_HASHES="$SHARE_DIR/scripts/retired-1x.sha256"
# Every file a 1.x installer placed, by content and path. 1.x wrote no manifest,
# so this is how a stale 1.x kit file at a path the kit still ships is told
# apart from a file the user wrote there (same generator).
KIT_1X_HASHES="$SHARE_DIR/scripts/kit-1x.sha256"
RETIRED_PATHS=(
    agents/execution/api-dev.md agents/execution/integration-dev.md agents/execution/database-dev.md
    agents/quality/code-reviewer.md agents/operations/knowledge-graph-manager.md
    agents/operations/learning-extractor.md agents/operations/monitor.md agents/operations/log-analyst.md
    agents/operations/support-analyst.md agents/operations/incident-responder.md
    agents/release/release-manager.md agents/release/deployment-specialist.md
    agents/release/rollback-specialist.md agents/design/ui-ux-advisor.md agents/execution/ios-mobile-dev.md
    agents/all-agents.md skills/all-skills.md commands/all-commands.md commands/_shared/routing-guide.md commands/_shared/verification-gates.md
    commands/_shared/source-verification.md scripts/kg-capture.sh scripts/init-knowledge-graph.js
    hooks/post-change-kg-sync.sh
    # 1.x kept agents in category folders; 2.0 agents are flat.
    agents/design/api-architect.md
    agents/design/database-designer.md
    agents/design/system-architect.md
    agents/discovery/code-explorer.md
    agents/discovery/dependency-analyzer.md
    agents/discovery/pattern-discoverer.md
    agents/discovery/tech-researcher.md
    agents/execution/devops-engineer.md
    agents/execution/laravel-backend-dev.md
    agents/execution/nextjs-frontend-dev.md
    agents/operations/context-fetcher.md
    agents/operations/doc-creator.md
    agents/quality/adversarial-reviewer.md
    agents/quality/code-quality.md
    agents/quality/outcomes-grader.md
    agents/quality/performance-tester.md
    agents/quality/security-auditor.md
    agents/quality/test-runner.md
    agents/quality/test-writer.md
    agents/release/changelog-writer.md
    agents/release/git-workflow.md
    agents/upstream/intake-processor.md
    agents/upstream/requirements-analyst.md
    # 1.x skills and templates removed in 2.0 (vendored, superseded, or duplicated in skill assets).
    skills/obsidian-sync/SKILL.md
    skills/prompt-engineering-patterns/SKILL.md
    skills/prompt-engineering-patterns/references/{agent-prompt-design,pattern-examples}.md
    skills/stripe-best-practices/SKILL.md
    skills/stripe-best-practices/references/{billing,connect,payments,security,treasury}.md
    skills/stripe-projects/SKILL.md skills/upgrade-stripe/SKILL.md
    skills/skill-creator/SKILL.md skills/skill-creator/assets/eval_review.html
    skills/skill-creator/agents/{analyzer,comparator,grader}.md
    skills/skill-creator/eval-viewer/generate_review.py skills/skill-creator/eval-viewer/viewer.html
    skills/skill-creator/references/{patterns,schemas,spec-summary,validation-checklist}.md
    skills/skill-creator/scripts/{aggregate_benchmark,generate_report,improve_description,package_skill,quick_validate,run_eval,run_loop,utils}.py
    skills/skill-creator/scripts/validate-skill.sh
    templates/code/laravel/{controller,dto,repository,service,test}.template.php
    templates/code/laravel/module-scaffolding-guide.md
    templates/code/nextjs/{api-route,hook}.template.ts templates/code/nextjs/{component,page}.template.tsx
    templates/specs/{code-review-checklist,epic,feature-flag-doc,feature,requirements,user-story}.template.md
    templates/specs/execute-task-workflow.md
    templates/context/workflow.template.md
    templates/commands/_templates/command.template.md
    templates/knowledge-graph/README.md
    templates/knowledge-graph/{architecture,cross-project,decisions,domain-layers,incidents,project,team}-schema.json
    # drupal-11 moved to the drupal add-on; --with=drupal stages it again, so it is kept there.
    skills/drupal-11/SKILL.md skills/drupal-11/scripts/scaffold-module.sh
    skills/drupal-11/references/{api,entity,form,theming}-patterns.md
    skills/drupal-11/references/{module-development,plugin-system}.md
    skills/drupal-11/assets/templates/{controller,entity,event-subscriber,form,plugin-block,service}.php.template
    skills/drupal-11/assets/templates/module.{info,routing,services}.yml.template
    skills/drupal-11/assets/templates/module.module.template
)

log_info()    { printf "${BLUE}[INFO]${NC} %s\n" "$1"; }
log_success() { printf "${GREEN}[OK]${NC} %s\n" "$1"; }
log_warning() { printf "${YELLOW}[WARN]${NC} %s\n" "$1"; }
log_error()   { printf "${RED}[ERROR]${NC} %s\n" "$1" >&2; }

print_help() {
    cat <<EOF
${BOLD}SDD Kit v${VERSION}${NC}

${BOLD}USAGE${NC}
  ./install.sh [--project|--user] [--minimal|--full] [options]

${BOLD}OPTIONS${NC}
  --project          Install into ./.claude (this project only)
  --user             Install into ~/.claude (all projects)
  --minimal          Spec-driven core only: /sdd, product-brief, write-spec, execute-task,
                     simple-task, run-tests, deep-review, open-pr, stack-trust, security-audit, the
                     workflows, the core agents they hand off to, hooks, plus the selected stack add-ons
  --full             Everything in core (default)
  --stack=LIST       Stack add-ons to install: ${STACK_ADDONS// /, }, or none (core only).
                     Default on a fresh --project install: the stacks whose markers or composer/npm
                     packages are in the current directory (not its subdirectories) when they go
                     beyond laravel,nextjs, else laravel,nextjs. --user: laravel,nextjs.
                     Upgrade: the installed stacks
  --with=LIST        Add optional add-ons: ${ADDONS_AVAILABLE// /, }
                     A fresh full install adds devenv unless --stack=none or --minimal;
                     --with=none skips it (fresh installs only)
  --prune            On an upgrade, remove installed add-ons that are not selected
                     (user-modified files are kept; everything removed is backed up)
  --third-party      Also install pinned third-party skills (docs/third-party.md)
  --host=NAME        Target host: claude (default), codex or cursor. Other hosts take --project|--user,
                     --stack, --with, --prune, --dry-run, --yes and --uninstall only
  --dry-run          Show added / updated / removed files; change nothing
  --yes, -y          Don't ask for confirmation
  --help, -h         Show this help

${BOLD}AFTER INSTALLING${NC}
  claude             then  /sdd <ticket-id | description>
  /framework-doctor  verifies hooks fire, paths resolve, and settings are valid

Prefer plugin mode for teams: see README (claude --plugin-dir / marketplace).
EOF
}

# Interactive iff no --yes, stdin is a terminal or SDD_KIT_TTY is set, and that
# device opens on fd 3. Every prompt reads fd 3 only, so a piped stdin is never
# consumed; otherwise defaults apply.
detect_interactive() {
    $ASSUME_YES && return 0
    if [[ -t 0 || -n "${SDD_KIT_TTY:-}" ]]; then
        if { exec 3<"${SDD_KIT_TTY:-/dev/tty}"; } 2>/dev/null; then
            INTERACTIVE=true
        fi
    fi
}

# Reads one answer line from fd 3 into $1; end of input aborts before any write.
read_answer() {
    local __var="$1" __line=""
    if ! read -r -u 3 __line && [[ -z "$__line" ]]; then
        printf '\n' >&2
        log_error "No answer on the terminal (end of input); nothing was written. Fix: answer the prompts, or pass --project/--user and --yes."
        exit 1
    fi
    printf -v "$__var" '%s' "$__line"
}

prompt_yes_no() {
    $INTERACTIVE || return 0
    local answer
    printf '%s [Y/n]: ' "$1"
    read_answer answer
    [[ "${answer:-y}" =~ ^[Yy] ]]
}

prompt_choice() {
    local var="$1" question="$2" a="$3" b="$4" choice
    printf "${BOLD}%s${NC}\n  1) %s\n  2) %s\n" "$question" "$a" "$b"
    while true; do
        printf 'Enter choice [1/2]: '
        read_answer choice
        case "$choice" in
            1) printf -v "$var" '%s' "${a%% *}"; break ;;
            2) printf -v "$var" '%s' "${b%% *}"; break ;;
        esac
    done
    printf "\n"
}

has_word() { [[ " $2 " == *" $1 "* ]]; }

# Appends the words of $2.. to the space-separated list in variable $1 once each.
add_words() {
    local __var="$1" __w; shift
    for __w in "$@"; do
        has_word "$__w" "${!__var}" || printf -v "$__var" '%s' "${!__var}${!__var:+ }$__w"
    done
}

join_words() {
    local sep="$1" out="" word; shift
    for word in "$@"; do out+="${out:+$sep}$word"; done
    printf '%s' "$out"
}

# Stack names, default stacks first, then by manifest order: "laravel nextjs drupal ios".
sorted_stacks() {
    local addon rank
    for addon in $STACK_ADDONS; do
        rank=1
        has_word "$addon" "$DEFAULT_STACKS" && rank=0
        printf '%s %s %s\n' "$rank" "$(jq -r '(if type == "array" then .[0].order else .order end) // 99' "$(addon_dir "$addon")/stack.json")" "$addon"
    done | sort -n -k1,1 -k2,2 | awk '{print $3}' | tr '\n' ' ' | sed 's/ $//'
}

valid_stacks_line() {
    local names
    names=$(sorted_stacks)
    printf 'Valid stacks: %s, none.' "$(join_words ',' $names | sed 's/,/, /g')"
}

# The add-on whose manifest declares stack key $1 (nextjs declares nuxt as well).
stack_provider() {
    local addon
    for addon in $STACK_ADDONS; do
        if jq -e --arg k "$1" '(if type == "array" then . else [.] end) | any(.[]; .name == $k)' \
                "$(addon_dir "$addon")/stack.json" >/dev/null; then
            printf '%s' "$addon"
            return 0
        fi
    done
    return 1
}

# Validates a comma or space separated stack list. Sets STACK_LIST (add-on names) and
# STACK_NONE; returns 1 with the message in STACK_ERROR on a bad value.
parse_stack_list() {
    local raw="${1//,/ }" s provider
    STACK_LIST=""; STACK_NONE=false; STACK_ERROR=""
    if [[ -z "${raw// /}" ]]; then
        STACK_ERROR="Missing stack list. Fix: use --stack=<list> or --stack=none. $(valid_stacks_line)"
        return 1
    fi
    for s in $raw; do
        if [[ "$s" == none ]]; then
            STACK_NONE=true
        elif has_word "$s" "$STACK_ADDONS"; then
            add_words STACK_LIST "$s"
        elif has_word "$s" "$TOOL_ADDONS"; then
            STACK_ERROR="'$s' is an add-on, not a stack. Fix: use --with=$s. $(valid_stacks_line)"
            return 1
        elif provider=$(stack_provider "$s"); then
            STACK_ERROR="'$s' is provided by the '$provider' add-on. Fix: use --stack=$provider. $(valid_stacks_line)"
            return 1
        else
            STACK_ERROR="Unknown stack '$s'. $(valid_stacks_line)"
            return 1
        fi
    done
    if $STACK_NONE && [[ -n "$STACK_LIST" ]]; then
        STACK_ERROR="'none' cannot be combined with other stacks. Fix: use --stack=none or --stack=<list>. $(valid_stacks_line)"
        return 1
    fi
    return 0
}

# Hosts other than claude install through their adapter: node <adapters>/<host>/install.mjs.
# The adapters live at src/adapters in a checkout and at adapters in the dist tree.
delegate_host() {
    local host="$1"; shift
    local arg adapters
    case "$host" in
        claude) return 0 ;;
        codex|cursor) ;;
        *) log_error "Unknown host '$host'. Fix: use --host=claude, --host=codex or --host=cursor."; exit 2 ;;
    esac
    for arg in "$@"; do
        case "$arg" in
            --minimal|--full|--third-party)
                log_error "$arg only applies to --host=claude. Fix: drop $arg, or drop --host to install for Claude Code."
                exit 2 ;;
        esac
    done
    if [[ -d "$SCRIPT_DIR/src/adapters" ]]; then adapters="$SCRIPT_DIR/src/adapters"; else adapters="$SCRIPT_DIR/adapters"; fi
    if [[ ! -f "$adapters/$host/install.mjs" ]]; then
        log_error "The $host installer is not available in this tree ($adapters/$host/install.mjs). Fix: run install.sh from a checkout that ships it."
        exit 2
    fi
    command -v node >/dev/null 2>&1 || { log_error "node is required for --host=$host. Install Node.js 20 or newer."; exit 1; }
    exec node "$adapters/$host/install.mjs" "$@"
}

# Splits --host out of the arguments: sets HOST and leaves the rest in HOST_ARGS.
split_host_arg() {
    HOST=claude; HOST_ARGS=()
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --host=*) HOST="${1#*=}" ;;
            --host)
                if [[ $# -lt 2 ]]; then log_error "--host needs a value. Fix: use --host=claude, --host=codex or --host=cursor."; exit 2; fi
                HOST="$2"; shift ;;
            *) HOST_ARGS+=("$1") ;;
        esac
        shift
    done
}

parse_args() {
    local stack_raw=""
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project) INSTALL_MODE=project ;;
            --user) INSTALL_MODE=user ;;
            --minimal) INSTALL_TYPE=minimal ;;
            --full) INSTALL_TYPE=full ;;
            --stack=*) STACK_GIVEN=true; stack_raw="${1#*=}" ;;
            --with=none) WITH_NONE=true; WITH_LIST="" ;;
            --with=*) WITH_GIVEN=true; WITH_LIST="${1#*=}"; WITH_LIST="${WITH_LIST//,/ }" ;;
            --prune) PRUNE=true ;;
            --third-party) THIRD_PARTY=true ;;
            --dry-run) DRY_RUN=true ;;
            --yes|-y) ASSUME_YES=true ;;
            --help|-h) print_help; exit 0 ;;
            *) log_error "Unknown option: $1 (see --help)"; exit 1 ;;
        esac
        shift
    done
    check_requirements
    local addon
    if has_word none "$WITH_LIST" || { $WITH_NONE && $WITH_GIVEN; }; then
        log_error "'none' cannot be combined with other add-ons. Fix: use --with=none to skip the default add-ons, or --with=<list>."
        exit 1
    fi
    for addon in $WITH_LIST; do
        if ! has_word "$addon" "$ADDONS_AVAILABLE"; then
            log_error "Unknown add-on '$addon'. Available: $ADDONS_AVAILABLE"
            exit 1
        fi
    done
    if $STACK_GIVEN; then
        if ! parse_stack_list "$stack_raw"; then
            log_error "$STACK_ERROR"
            exit 1
        fi
        if $STACK_NONE; then
            for addon in $WITH_LIST; do
                if has_word "$addon" "$STACK_ADDONS"; then
                    log_error "--stack=none conflicts with stack add-on '$addon' in --with. Fix: drop --stack=none or move '$addon' to --stack."
                    exit 1
                fi
            done
        fi
    fi
}

check_requirements() {
    if ! command -v jq >/dev/null 2>&1; then
        log_error "jq is required (installer and hook scripts use it). Install it: brew install jq / apt-get install jq"
        exit 1
    fi
}

# -------------------------------------------------------------- selection ---

# Paths an add-on stages that identify it in a .framework-manifest: its agents
# (under agents/<addon>/ and, from 2.x, flat), its skills and its stack manifest.
addon_marker_paths() {
    local root f
    root=$(addon_dir "$1")
    for f in "$root/agents/"*.md; do
        [[ -f "$f" ]] || continue
        printf 'agents/%s/%s\nagents/%s\n' "$1" "$(basename "$f")" "$(basename "$f")"
    done
    for f in "$root/skills/"*/SKILL.md; do
        [[ -f "$f" ]] || continue
        printf 'skills/%s/SKILL.md\n' "$(basename "$(dirname "$f")")"
    done
    [[ -f "$root/stack.json" ]] && printf 'stacks/%s.json\n' "$1"
    return 0
}

addon_installed() {
    grep -qxFf <(addon_marker_paths "$1") <(awk '{print $2}' "$TARGET_DIR/.framework-manifest")
}

# An install is an upgrade iff a manifest exists; an add-on counts as installed when
# the manifest lists any path it stages. Sets UPGRADE, INSTALLED_STACKS, INSTALLED_TOOLS.
detect_installed() {
    local addon
    [[ -f "$TARGET_DIR/.framework-manifest" ]] || return 0
    UPGRADE=true
    for addon in $STACK_ADDONS; do
        ! addon_installed "$addon" || add_words INSTALLED_STACKS "$addon"
    done
    for addon in $TOOL_ADDONS; do
        ! addon_installed "$addon" || add_words INSTALLED_TOOLS "$addon"
    done
}

# First package listed under packages.$2 (composer or npm) in stack manifest $1 that project
# file $3 declares in one of the dependency objects named by $4.. Prints "<file>: <package>".
package_match() {
    local manifest="$1" manager="$2" file="$3"; shift 3
    [[ -f "$file" ]] || return 0
    jq -r --arg m "$manager" --slurpfile p "$file" '
        ($p[0] | objects | [.[$ARGS.positional[]] | objects | keys[]]) as $have
        | [(if type == "array" then . else [.] end)[] | (.packages[$m] // [])[] | select(. as $n | $have | index($n))][0]
        // empty' --args "$@" <"$manifest" 2>/dev/null | sed "1s|^|$file: |;1q" || true
}

# Stack add-ons this project looks like: a manifest marker glob matches in the current directory,
# or composer.json / package.json there requires one of the manifest's packages. Only the current
# directory is read, so a project nested below it is not seen. Sets DETECTED_STACKS (add-on names)
# and DETECTED_FROM ("<add-on> (<matched path or file: package>)", comma separated).
detect_project_stacks() {
    local addon manifest marker from
    DETECTED_STACKS=""; DETECTED_FROM=""
    for addon in $STACK_ADDONS; do
        manifest="$(addon_dir "$addon")/stack.json"
        from=""
        while IFS= read -r marker; do
            [[ -n "$marker" ]] || continue
            from=$(compgen -G "$marker" 2>/dev/null | head -n 1) || true
            [[ -z "$from" ]] || break
        done < <(jq -r '(if type == "array" then . else [.] end)[] | (.markers // [])[]' "$manifest")
        [[ -n "$from" ]] || from=$(package_match "$manifest" composer composer.json require require-dev)
        [[ -n "$from" ]] || from=$(package_match "$manifest" npm package.json dependencies devDependencies)
        [[ -n "$from" ]] || continue
        add_words DETECTED_STACKS "$addon"
        DETECTED_FROM+="${DETECTED_FROM:+, }$addon ($from)"
    done
}

# Detection picks the default only when it found a stack outside DEFAULT_STACKS, so a tree that
# looks like a default stack, or like nothing, keeps the default pair.
detection_decides() {
    local addon
    for addon in $DETECTED_STACKS; do
        has_word "$addon" "$DEFAULT_STACKS" || return 0
    done
    return 1
}

# Default stacks of a fresh install: the detected stacks when detection decides, otherwise
# DEFAULT_STACKS limited to the add-ons this tree ships.
default_stacks() {
    local addon out=""
    if detection_decides; then
        printf '%s' "$DETECTED_STACKS"
        return 0
    fi
    for addon in $DEFAULT_STACKS; do
        ! has_word "$addon" "$STACK_ADDONS" || add_words out "$addon"
    done
    printf '%s' "$out"
}

# The dev-environment add-on joins every fresh full install, unless --with=none.
default_tools() {
    if [[ "$INSTALL_TYPE" != minimal ]] && ! $WITH_NONE && has_word devenv "$TOOL_ADDONS"; then
        printf 'devenv'
    fi
}

# Asks which stacks to install; sets PROMPT_STACKS (add-on names, possibly empty).
prompt_stacks() {
    local default extras shown answer
    if $UPGRADE; then
        default="$INSTALLED_STACKS"; extras="$INSTALLED_TOOLS"
    else
        default=$(default_stacks); extras=$(default_tools)
        if detection_decides; then printf 'Detected %s.\n' "$DETECTED_FROM"; fi
    fi
    shown="$(join_words , $default)"
    printf 'Stacks [%s]%s: ' "${shown:-none}" "${extras:+ (+ $(join_words ', ' $extras))}"
    while true; do
        read_answer answer
        if [[ -z "${answer// /}" ]]; then
            PROMPT_STACKS="$default"
            return 0
        fi
        if parse_stack_list "$answer"; then
            PROMPT_STACKS="$STACK_LIST"
            return 0
        fi
        printf '%s\nStacks: ' "$STACK_ERROR"
    done
}

# Two axes (stacks, tool add-ons). Fresh install: stacks from --stack, the prompt or
# the default (detected from the project for --project); tool add-ons are --with plus
# the dev-environment add-on, which only --stack=none, --minimal and --with=none leave
# out. Upgrade: selections only add to the installed set; --prune makes the installed
# set exactly the selection. Sets ADDONS, KEEPING_ADDONS and REMOVING_ADDONS.
select_addons() {
    local addon sel_stacks="" sel_tools="" with_stacks="" with_tools="" stacks_chosen=false
    PROMPT_STACKS=""
    if $WITH_NONE && $UPGRADE; then
        log_error "--with=none applies to a fresh install only; nothing was written. Fix: to remove add-ons from an installed project use --prune --with=<list>."
        exit 1
    fi
    if [[ "$INSTALL_MODE" == project ]] && ! $UPGRADE && ! $STACK_GIVEN; then
        detect_project_stacks
    fi
    for addon in $WITH_LIST; do
        if has_word "$addon" "$STACK_ADDONS"; then add_words with_stacks "$addon"; else add_words with_tools "$addon"; fi
    done

    if $STACK_GIVEN; then
        sel_stacks="$STACK_LIST"; stacks_chosen=true
    elif $INTERACTIVE; then
        prompt_stacks
        sel_stacks="$PROMPT_STACKS"; stacks_chosen=true
    elif $UPGRADE; then
        sel_stacks="$INSTALLED_STACKS"
    else
        sel_stacks=$(default_stacks)
    fi
    add_words sel_stacks $with_stacks

    if $UPGRADE; then
        if $PRUNE && ! $WITH_GIVEN; then sel_tools="$INSTALLED_TOOLS"; else sel_tools="$with_tools"; fi
    else
        sel_tools="$with_tools"
        { $STACK_GIVEN && $STACK_NONE; } || add_words sel_tools $(default_tools)
    fi

    local final_stacks="$sel_stacks" final_tools="$sel_tools"
    if $UPGRADE && ! $PRUNE; then
        final_stacks=""; final_tools=""
        add_words final_stacks $INSTALLED_STACKS $sel_stacks
        add_words final_tools $INSTALLED_TOOLS $sel_tools
    fi

    KEEPING_ADDONS=""; REMOVING_ADDONS=""
    if $UPGRADE; then
        for addon in $INSTALLED_STACKS; do
            has_word "$addon" "$final_stacks" && has_word "$addon" "$sel_stacks" && continue
            if $PRUNE; then add_words REMOVING_ADDONS "$addon"
            elif $stacks_chosen; then add_words KEEPING_ADDONS "$addon"; fi
        done
        for addon in $INSTALLED_TOOLS; do
            has_word "$addon" "$final_tools" && has_word "$addon" "$sel_tools" && continue
            if $PRUNE; then add_words REMOVING_ADDONS "$addon"
            elif $WITH_GIVEN; then add_words KEEPING_ADDONS "$addon"; fi
        done
    fi

    ADDONS=""
    add_words ADDONS $final_stacks $final_tools
    DROPPED_HOOKS=""
    for addon in $REMOVING_ADDONS; do
        [[ -f "$(addon_dir "$addon")/hooks/hooks.json" ]] && DROPPED_HOOKS+="${DROPPED_HOOKS:+ }$(addon_dir "$addon")/hooks/hooks.json"
    done
    if ! $UPGRADE && ! $STACK_GIVEN && ! $INTERACTIVE; then
        local done_word=Installed
        $DRY_RUN && done_word=Selected
        if detection_decides; then
            printf 'Detected %s; selected stacks %s%s. Choose others with --stack=<list> or --stack=none.\n' \
                "$DETECTED_FROM" "$(join_words , $sel_stacks)" "${final_tools:+ (+ $(join_words ', ' $final_tools))}"
        else
            printf '%s default stacks %s%s. Choose others with --stack=<list> or --stack=none.\n' \
                "$done_word" "$(join_words , $sel_stacks)" "${final_tools:+ (+ $(join_words ', ' $final_tools))}"
        fi
    fi
    return 0
}

# ---------------------------------------------------------------- staging ---
# Builds the exact file tree to install under $STAGE, laid out like .claude/.

stage_skill_dirs() {
    # Skills must be one level deep (skills/<name>/SKILL.md) for discovery.
    local root="$1"; shift
    local filter="${*:-}" dir name skill
    while IFS= read -r skill; do
        dir=$(dirname "$skill"); name=$(basename "$dir")
        if [[ -n "$filter" && " $filter " != *" $name "* ]]; then
            continue
        fi
        mkdir -p "$STAGE/skills"
        cp -R "$dir" "$STAGE/skills/$name"
        # Skill self-tests and their fixtures are development-only; they never ship.
        rm -rf "$STAGE/skills/$name/test"
    done < <(find "$root" -mindepth 2 -name SKILL.md -not -path '*/_templates/*')
}

stage_hook_scripts() {
    mkdir -p "$STAGE/scripts"
    cp "$HOOK_SCRIPTS_DIR/"*.sh "$STAGE/scripts/"
    if [[ -d "$HOOK_SCRIPTS_DIR/review" ]]; then
        mkdir -p "$STAGE/scripts/review"
        cp "$HOOK_SCRIPTS_DIR/review/"*.sh "$HOOK_SCRIPTS_DIR/review/"*.md "$STAGE/scripts/review/" 2>/dev/null || true
    fi
}

stage_core() {
    mkdir -p "$STAGE"
    if [[ "$INSTALL_TYPE" == minimal ]]; then
        # Everything the /sdd main path hands off to: product-brief and write-spec spawn
        # requirements-analyst, execute-task delegates to test-writer and code-quality
        # (and to the stack developers the selected add-ons bring), and ends with
        # deep-review (adversarial-reviewer, security-auditor) and open-pr; the security-audit
        # workflow, always copied, runs its hunters and verifiers as security-hunter.
        mkdir -p "$STAGE/agents" "$STAGE/templates"
        local agent
        for agent in code-explorer test-writer code-quality \
            requirements-analyst adversarial-reviewer security-auditor security-hunter; do
            cp "$CORE_DIR/agents/$agent.md" "$STAGE/agents/"
        done
        stage_skill_dirs "$CORE_DIR/skills" sdd product-brief write-spec execute-task simple-task \
            run-tests deep-review open-pr verification-gates source-verification framework-doctor \
            api-design api-security stack-trust security-audit
        cp -R "$SHARE_DIR/templates/context" "$SHARE_DIR/templates/specs" "$STAGE/templates/"
    else
        cp -R "$CORE_DIR/agents" "$STAGE/agents"
        stage_skill_dirs "$CORE_DIR/skills"
        cp -R "$CORE_DIR/commands" "$STAGE/commands"
        cp -R "$SHARE_DIR/templates" "$STAGE/templates"
        cp -R "$SHARE_DIR/hooks" "$STAGE/hooks"
        cp -R "$SHARE_DIR/docs" "$STAGE/docs"
    fi
    cp -R "$CORE_DIR/workflows" "$STAGE/workflows"
    cp -R "$SHARE_DIR/settings" "$STAGE/settings"
    cp -R "$SHARE_DIR/mcp-configs" "$STAGE/mcp-configs"
    cp -R "$CORE_DIR/output-styles" "$STAGE/output-styles"
    stage_hook_scripts
}

stage_addons() {
    local addon root
    for addon in $ADDONS; do
        root=$(addon_dir "$addon")
        if [[ -f "$root/stack.json" ]]; then
            mkdir -p "$STAGE/stacks"
            # The staged copy sits next to the installed workflows, so the editor-only
            # $schema pointer is rewritten to resolve there.
            jq 'def fix: if type == "object" and has("$schema") then .["$schema"] = "../workflows/lib/stack.schema.json" else . end;
                if type == "array" then map(fix) else fix end' "$root/stack.json" > "$STAGE/stacks/$addon.json"
        fi
        if [[ -d "$root/agents" ]]; then
            mkdir -p "$STAGE/agents/$addon"
            cp "$root/agents/"*.md "$STAGE/agents/$addon/"
        fi
        if [[ -d "$root/skills" ]]; then
            stage_skill_dirs "$root/skills"
        fi
        if compgen -G "$root/scripts/*.sh" >/dev/null; then
            mkdir -p "$STAGE/scripts"
            cp "$root/scripts/"*.sh "$STAGE/scripts/"
        fi
        if [[ "$INSTALL_TYPE" != minimal && -d "$root/hooks" ]]; then
            local fragments
            for fragments in "$root/hooks/"*.d; do
                [[ -d "$fragments" ]] || continue
                mkdir -p "$STAGE/hooks/$(basename "$fragments")"
                cp "$fragments/"*.sh "$STAGE/hooks/$(basename "$fragments")/"
            done
        fi
        if [[ -d "$root/templates" ]]; then
            mkdir -p "$STAGE/templates/$addon"
            cp -R "$root/templates/." "$STAGE/templates/$addon/"
        fi
        if [[ -d "$root/mcp-configs" ]]; then
            mkdir -p "$STAGE/mcp-configs/$addon"
            cp "$root/mcp-configs/"*.json "$STAGE/mcp-configs/$addon/"
        fi
    done
}

# Merges the core third-party manifest with the optional third-party.json
# fragment of every selected add-on (plugin entries such as language servers).
merge_third_party_manifest() {
    local addon fragment
    local fragments=()
    THIRD_PARTY_MANIFEST="$STAGE/third-party.json"
    for addon in $ADDONS; do
        fragment="$ADDON_ROOT/${ADDON_PREFIX}$addon/third-party.json"
        [[ -f "$fragment" ]] && fragments+=("$fragment")
    done
    if (( ${#fragments[@]} == 0 )); then
        THIRD_PARTY_MANIFEST="$SHARE_DIR/settings/third-party.json"
        return 0
    fi
    jq -s '.[0] as $core | reduce .[1:][] as $f ($core; .plugins += ($f.plugins // []) | .skills += ($f.skills // []))' \
        "$SHARE_DIR/settings/third-party.json" "${fragments[@]}" > "$THIRD_PARTY_MANIFEST"
}

rewrite_paths_for_user_install() {
    [[ "$INSTALL_MODE" == user ]] || return 0
    find "$STAGE" -name '*.md' -exec perl -pi -e 's{(?<![~/\w])\.claude/}{~/.claude/}g' {} +
}

# ------------------------------------------------------------------ apply ---

file_hash() { shasum -a 256 "$1" | awk '{print $1}'; }

# A previously installed path is ours to remove or replace only when its content
# is still what the kit shipped: the manifest hash for files a 2.x or later
# install recorded, a known 1.x hash for RETIRED_PATHS, or, when there is no
# manifest (a 1.x install), any version a 1.x installer placed at that path.
# Edited files and third-party skills placed at a kit path (upstream Stripe or
# skill-creator copies) are kept.
is_kit_copy() {
    local rel="$1" current recorded skill_dir
    if [[ "$rel" == skills/*/* ]]; then
        skill_dir="$TARGET_DIR/skills/$(cut -d/ -f2 <<<"$rel")"
        if [[ -f "$skill_dir/.source" ]] || compgen -G "$skill_dir/LICENSE*" >/dev/null; then
            return 1
        fi
    fi
    current=$(file_hash "$TARGET_DIR/$rel")
    if [[ -f "$TARGET_DIR/.framework-manifest" ]]; then
        recorded=$(awk -v p="$rel" '$2 == p { print $1; exit }' "$TARGET_DIR/.framework-manifest")
        if [[ -n "$recorded" ]]; then
            [[ "$current" == "$recorded" ]]
            return
        fi
    fi
    [[ -f "$RETIRED_HASHES" ]] && grep -qxF "$current  $rel" "$RETIRED_HASHES" && return 0
    [[ ! -f "$TARGET_DIR/.framework-manifest" && -f "$KIT_1X_HASHES" ]] \
        && grep -qxF "$current  $rel" "$KIT_1X_HASHES"
}

plan_changes() {
    ADDED=(); UPDATED=(); REMOVED=(); KEPT=("${UNOWNED[@]-}")
    [[ -n "${KEPT[0]}" ]] || KEPT=()
    local rel
    while IFS= read -r rel; do
        if [[ ! -e "$TARGET_DIR/$rel" ]]; then
            ADDED+=("$rel")
        elif ! cmp -s "$STAGE/$rel" "$TARGET_DIR/$rel"; then
            UPDATED+=("$rel")
        fi
    done < <(cd "$STAGE" && find . -type f | sed 's|^\./||' | sort)

    local previous=("${RETIRED_PATHS[@]}")
    if [[ -f "$TARGET_DIR/.framework-manifest" ]]; then
        while IFS= read -r rel; do previous+=("$rel"); done < <(awk '{print $2}' "$TARGET_DIR/.framework-manifest")
    fi
    for rel in "${previous[@]}"; do
        if [[ -f "$TARGET_DIR/$rel" && ! -f "$STAGE/$rel" \
                && " ${REMOVED[*]-} " != *" $rel "* && " ${KEPT[*]-} " != *" $rel "* ]]; then
            if is_kit_copy "$rel"; then
                REMOVED+=("$rel")
            else
                KEPT+=("$rel")
            fi
        fi
    done
}

# A file at a staged path that the manifest does not list and that is not a
# known kit copy belongs to the user: it is kept and the kit copy is not staged.
guard_unowned_files() {
    local rel recorded
    UNOWNED=()
    for rel in "${UPDATED[@]-}"; do
        [[ -n "$rel" ]] || continue
        recorded=""
        if [[ -f "$TARGET_DIR/.framework-manifest" ]]; then
            recorded=$(awk -v p="$rel" '$2 == p { print $1; exit }' "$TARGET_DIR/.framework-manifest")
        fi
        [[ -n "$recorded" ]] && continue
        is_kit_copy "$rel" && continue
        UNOWNED+=("$rel")
        rm -f "$STAGE/$rel"
        log_warning "Kept your .claude/$rel; the kit copy was not installed because the file is not one the kit installed. Fix: move your file aside and re-run install.sh to get the kit copy, or keep yours."
    done
    if [[ ${#UNOWNED[@]} -gt 0 ]]; then plan_changes; fi
}

# Never leave two agents with one name: Claude Code loads one of them by read order.
# A staged agents/<addon>/<name>.md is dropped when agents/<name>.md stays in place
# (a user-edited kit file, or an agent the user wrote under that name).
guard_same_name_agents() {
    local rel name addon dropped=false
    while IFS= read -r rel; do
        name=$(basename "$rel"); addon=$(basename "$(dirname "$rel")")
        [[ -f "$TARGET_DIR/agents/$name" ]] || continue
        [[ " ${REMOVED[*]-} " == *" agents/$name "* ]] && continue
        rm -f "$STAGE/$rel"
        dropped=true
        log_warning "Kept your .claude/agents/$name; the 3.0 copy was not installed at .claude/agents/$addon/$name because two agents with one name load unpredictably. Fix: merge your edits into the add-on copy ($(addon_dir "$addon")/agents/$name), delete .claude/agents/$name, then re-run install.sh."
    done < <(cd "$STAGE" && find agents -mindepth 2 -maxdepth 2 -name '*.md' 2>/dev/null | sort)
    if $dropped; then plan_changes; fi
}

print_plan() {
    printf "\n${BOLD}Changes in %s${NC}\n" "$TARGET_DIR"
    printf "  added: %d   updated: %d   removed: %d\n" "${#ADDED[@]}" "${#UPDATED[@]}" "${#REMOVED[@]}"
    local rel addon
    for addon in $KEEPING_ADDONS; do
        printf "  Keeping installed add-on '%s' (not selected). Fix: pass --prune to remove it.\n" "$addon"
    done
    for addon in $REMOVING_ADDONS; do
        printf "  Removing add-on '%s' (--prune). Fix: drop --prune or add --with=%s to keep it.\n" "$addon" "$addon"
    done
    for rel in "${UPDATED[@]-}"; do [[ -n "$rel" ]] && printf "  ${YELLOW}~${NC} %s\n" "$rel"; done
    for rel in "${REMOVED[@]-}"; do [[ -n "$rel" ]] && printf "  ${RED}-${NC} %s\n" "$rel"; done
    if [[ ${#KEPT[@]} -gt 0 ]]; then
        printf "  kept (modified or not from the kit): %d — review and delete by hand if unused\n" "${#KEPT[@]}"
        for rel in "${KEPT[@]}"; do printf "  ${BLUE}=${NC} %s\n" "$rel"; done
    fi
    if [[ ${#ADDED[@]} -gt 0 && ${#ADDED[@]} -le 40 ]]; then
        for rel in "${ADDED[@]}"; do printf "  ${GREEN}+${NC} %s\n" "$rel"; done
    fi
    printf "\n"
}

# Keeps the <keep> newest <stamp> entries of a backups directory and deletes the
# rest. Only entries named like a stamp (YYYYMMDD_HHMMSS) directly inside the
# directory are candidates; a symlink is removed as a link and never followed,
# and nothing is deleted when the directory itself is a symlink or an entry
# resolves outside it.
prune_backups() {
    local root="$1" keep="$2" real_root entry real_parent
    [[ -d "$root" ]] || return 0
    if [[ -L "$root" ]]; then
        log_warning "Did not prune $root: it is a symlink. Fix: replace it with a real directory, or prune old backups by hand."
        return 0
    fi
    real_root=$(cd -P "$root" && pwd -P) || return 0
    find "$root" -mindepth 1 -maxdepth 1 \( -type d -o -type l \) \
            -name '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]' 2>/dev/null \
        | sort -r | tail -n +"$((keep + 1))" | while IFS= read -r entry; do
            if [[ -L "$entry" ]]; then
                rm -f -- "$entry"
                continue
            fi
            real_parent=$(cd -P "$(dirname "$entry")" && pwd -P) || continue
            [[ "$real_parent" == "$real_root" && -d "$entry" ]] || continue
            rm -rf -- "$entry"
        done
}

apply_changes() {
    local backup="$TARGET_DIR/.framework-backups/$STAMP" rel dir
    if [[ ${#UPDATED[@]} -gt 0 || ${#REMOVED[@]} -gt 0 ]]; then
        # A symlinked backups folder would put the copies of overwritten files outside the install target.
        if [[ -L "$TARGET_DIR/.framework-backups" || -L "$backup" ]]; then
            log_error "Did not install: $TARGET_DIR/.framework-backups is a symlink, so the backup of replaced files would land outside $TARGET_DIR. Nothing was changed. Fix: move the link aside (mv \"$TARGET_DIR/.framework-backups\" \"$TARGET_DIR/.framework-backups.link\") and re-run."
            exit 1
        fi
        for rel in "${UPDATED[@]-}" "${REMOVED[@]-}"; do
            [[ -n "$rel" ]] || continue
            mkdir -p "$backup/$(dirname "$rel")"
            cp -p "$TARGET_DIR/$rel" "$backup/$rel"
        done
        prune_backups "$TARGET_DIR/.framework-backups" 5
        log_info "Backed up overwritten/removed files to $backup (the five newest backups are kept)"
    fi
    for rel in "${REMOVED[@]-}"; do
        [[ -n "$rel" ]] || continue
        rm -f "$TARGET_DIR/$rel"
        # Drop directories the removal left empty, e.g. agents/<addon>/.
        dir=$(dirname "$rel")
        while [[ "$dir" != . ]] && rmdir "$TARGET_DIR/$dir" 2>/dev/null; do dir=$(dirname "$dir"); done
    done
    mkdir -p "$TARGET_DIR"
    (cd "$STAGE" && find . -type f | sed 's|^\./||') | while IFS= read -r rel; do
        mkdir -p "$TARGET_DIR/$(dirname "$rel")"
        cp "$STAGE/$rel" "$TARGET_DIR/$rel"
    done
    chmod +x "$TARGET_DIR/scripts/"*.sh 2>/dev/null || true
    chmod +x "$TARGET_DIR/scripts/review/"*.sh "$TARGET_DIR/hooks/"*.sh "$TARGET_DIR/hooks/"*.d/*.sh 2>/dev/null || true
    find "$TARGET_DIR/skills" -name '*.py' -exec chmod +x {} + 2>/dev/null || true
    (cd "$STAGE" && find . -type f | sed 's|^\./||' | sort | while IFS= read -r rel; do
        printf '%s  %s\n' "$(file_hash "$rel")" "$rel"
    done) > "$TARGET_DIR/.framework-manifest"
    echo "$VERSION" > "$TARGET_DIR/.framework-version"
    log_success "Framework files installed (${#ADDED[@]} added, ${#UPDATED[@]} updated, ${#REMOVED[@]} removed)"

    local legacy
    legacy=$(find "$TARGET_DIR" -maxdepth 1 -name '*.backup.*' 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$legacy" -gt 0 ]]; then
        log_warning "$legacy legacy '*.backup.*' entries from 1.x installs remain in $TARGET_DIR; delete them once you no longer need them."
    fi
}

install_hooks() {
    local result addon addon_hooks=()
    for addon in $ADDONS; do
        [[ -f "$(addon_dir "$addon")/hooks/hooks.json" ]] \
            && addon_hooks+=("$(addon_dir "$addon")/hooks/hooks.json")
    done
    if result=$(SDD_KIT_DROPPED_HOOKS="$DROPPED_HOOKS" "$SHARE_DIR/scripts/install-hooks.sh" "$SHARE_DIR/settings/settings.template.json" \
            "$TARGET_DIR/settings.json" "$INSTALL_MODE" "${addon_hooks[@]+"${addon_hooks[@]}"}"); then
        log_success "Hooks installed into $TARGET_DIR/settings.json ($result)"
    else
        log_error "Hooks were NOT installed. Fix the issue above, then re-run the installer."
    fi
}

install_statusline() {
    # Shows the active spec and task; only set when the user has no status line.
    local settings="$TARGET_DIR/settings.json" cmd tmp
    if [[ "$INSTALL_MODE" == user ]]; then
        cmd="\"\$HOME\"/.claude/scripts/statusline.sh"
    else
        cmd="\"\$CLAUDE_PROJECT_DIR\"/.claude/scripts/statusline.sh"
    fi
    [[ -f "$settings" ]] && jq empty "$settings" 2>/dev/null || return 0
    if jq -e 'has("statusLine")' "$settings" >/dev/null; then
        log_info "Existing statusLine kept (spec-aware alternative: $cmd)"
        return 0
    fi
    tmp=$(mktemp)
    jq --arg c "$cmd" '.statusLine = {type: "command", command: $c}' "$settings" > "$tmp"
    cat "$tmp" > "$settings"; rm -f "$tmp"
    log_success "Status line set (active spec · task · model)"
}

create_mcp_config() {
    if [[ "$INSTALL_MODE" == user ]]; then
        log_info "User-scope MCP servers are managed by the CLI. Recommended defaults:"
        log_info "  claude mcp add --scope user context7 -- npx -y @upstash/context7-mcp"
        log_info "  claude mcp add --scope user playwright -- npx -y @playwright/mcp@0.0.83 --headless --isolated"
        return
    fi
    local defaults='{"mcpServers":{"context7":{"command":"npx","args":["-y","@upstash/context7-mcp"]},"playwright":{"command":"npx","args":["-y","@playwright/mcp@0.0.83","--headless","--isolated"]}}}' tmp
    if [[ ! -f "$MCP_TARGET" ]]; then
        jq . <<<"$defaults" > "$MCP_TARGET"
        log_success "Created $MCP_TARGET (context7, playwright)"
    elif jq empty "$MCP_TARGET" 2>/dev/null; then
        tmp=$(mktemp)
        jq --argjson d "$defaults" '.mcpServers = ($d.mcpServers + (.mcpServers // {}))' "$MCP_TARGET" > "$tmp"
        cat "$tmp" > "$MCP_TARGET"; rm -f "$tmp"
        log_success "Merged default MCP servers into $MCP_TARGET (existing servers untouched)"
    else
        log_warning "$MCP_TARGET is not valid JSON; left untouched."
    fi
    log_info "Optional servers (PhpStorm, Serena, GitHub): $TARGET_DIR/mcp-configs/development.json; add-ons list theirs under $TARGET_DIR/mcp-configs/<add-on>/"
}

copy_claude_template() {
    [[ "$INSTALL_MODE" == project ]] || return 0
    if [[ -f "$(pwd)/CLAUDE.md" ]]; then
        log_info "CLAUDE.md exists; left untouched (template: $SHARE_DIR/CLAUDE.template.md)"
    else
        cp "$SHARE_DIR/CLAUDE.template.md" "$(pwd)/CLAUDE.md"
        log_success "Created CLAUDE.md from template — fill in the project sections"
    fi
    # CLAUDE.md imports @AGENTS.md (commands, red lines, standards shared with other AI tools).
    if [[ ! -f "$(pwd)/AGENTS.md" ]]; then
        cp "$SHARE_DIR/templates/AGENTS.template.md" "$(pwd)/AGENTS.md"
        log_success "Created AGENTS.md from template — CLAUDE.md imports it"
    fi
    if [[ -d "$SHARE_DIR/templates/rules" && ! -d "$(pwd)/.claude/rules" ]]; then
        mkdir -p "$(pwd)/.claude/rules"
        cp "$SHARE_DIR/templates/rules/"*.md "$(pwd)/.claude/rules/"
        log_success "Created .claude/rules/ (path-scoped conventions) from templates"
    fi
    copy_addon_rules
}

# Add-on rules are project-owned: copied per file, only when absent.
copy_addon_rules() {
    local addon rule dest
    for addon in $ADDONS; do
        for rule in "$ADDON_ROOT/${ADDON_PREFIX}$addon/rules/"*.md; do
            [[ -f "$rule" ]] || continue
            dest="$(pwd)/.claude/rules/$(basename "$rule")"
            if [[ ! -e "$dest" ]]; then
                mkdir -p "$(dirname "$dest")"
                cp "$rule" "$dest"
                log_success "Added rule .claude/rules/$(basename "$rule") from the $addon add-on"
            fi
        done
    done
}

print_success() {
    cat <<EOF

${GREEN}${BOLD}Installed v${VERSION}${NC} → $TARGET_DIR (${INSTALL_TYPE}${ADDONS:+, add-ons: $ADDONS})

  1. Start Claude Code:   claude
  2. Verify the install:  /framework-doctor
  3. Start any work:      /sdd <ticket-id | description>

  Re-run this installer any time to update; it shows what changes before writing.
EOF
}

main() {
    split_host_arg "$@"
    if [[ "$HOST" != claude ]]; then
        delegate_host "$HOST" ${HOST_ARGS[@]+"${HOST_ARGS[@]}"}
    fi
    parse_args ${HOST_ARGS[@]+"${HOST_ARGS[@]}"}
    printf "${BOLD}SDD Kit v%s${NC}\n\n" "$VERSION"
    detect_interactive

    if [[ -z "$INSTALL_MODE" ]]; then
        if ! $INTERACTIVE; then
            log_error "No install location. Fix: pass --project or --user."
            exit 1
        fi
        prompt_choice INSTALL_MODE "Install where?" \
            "project — ./.claude, this project only" "user — ~/.claude, all projects"
    fi
    INSTALL_TYPE="${INSTALL_TYPE:-full}"

    if [[ "$INSTALL_MODE" == user ]]; then
        TARGET_DIR="$HOME/.claude"
    else
        TARGET_DIR="$(pwd)/.claude"; MCP_TARGET="$(pwd)/.mcp.json"
    fi
    detect_installed
    select_addons

    STAGE=$(mktemp -d)
    trap 'rm -rf "$STAGE"' EXIT
    stage_core
    stage_addons
    rewrite_paths_for_user_install
    UNOWNED=()
    plan_changes
    guard_unowned_files
    guard_same_name_agents
    print_plan

    if $DRY_RUN; then
        log_info "Dry run: nothing written."
        exit 0
    fi
    prompt_yes_no "Apply these changes?" || { printf "Cancelled.\n"; exit 0; }

    apply_changes
    install_hooks
    install_statusline
    create_mcp_config
    copy_claude_template
    if $THIRD_PARTY; then
        merge_third_party_manifest
        "$SHARE_DIR/scripts/install-third-party.sh" "$THIRD_PARTY_MANIFEST" "$TARGET_DIR/skills" \
            || log_error "Third-party skill install failed; the framework install is unaffected."
    fi
    print_success
}

main "$@"
