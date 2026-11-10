#!/bin/bash
#
# PostToolUse hook (Write|Edit matcher) - Secrets scanner
#
# Scans newly written/edited file for common secret patterns. If found,
# emits an error systemMessage and exits 2 to block the change.
#
# Prefers gitleaks if installed; falls back to regex bank.
#

set -euo pipefail

INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ -z "$FILE" ]] || [[ ! -f "$FILE" ]]; then
    exit 0
fi

# Skip lockfiles, generated assets, and node_modules/vendor
case "$FILE" in
    */node_modules/*|*/vendor/*|*.lock|*.svg|*.png|*.jpg|*.jpeg|*.gif|*.ico|*.woff*|*.ttf|*.otf|*.map)
        exit 0 ;;
esac

emit_block() {
    local pattern="$1"
    echo "Blocked: $FILE contains a likely secret ($pattern). Remove it, rotate the credential, and use env vars or a secret manager." >&2
    exit 2
}

# Prefer gitleaks
if command -v gitleaks >/dev/null 2>&1; then
    if ! gitleaks detect --no-banner --no-git --redact --source="$FILE" >/dev/null 2>&1; then
        emit_block "gitleaks match"
    fi
    exit 0
fi

# Regex fallback
SAMPLE=$(head -c 524288 "$FILE")

# AWS Access Key
if echo "$SAMPLE" | grep -qE '(^|[^A-Z0-9])(AKIA|ASIA)[A-Z0-9]{16}([^A-Z0-9]|$)'; then
    emit_block "AWS access key"
fi

# AWS Secret Key (heuristic: aws_secret_access_key followed by 40-char base64-ish)
if echo "$SAMPLE" | grep -qiE 'aws_secret_access_key[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9/+=]{40}'; then
    emit_block "AWS secret access key"
fi

# GitHub PAT
if echo "$SAMPLE" | grep -qE 'gh[pousr]_[A-Za-z0-9]{36,255}'; then
    emit_block "GitHub token"
fi

# Slack token
if echo "$SAMPLE" | grep -qE 'xox[abprs]-[A-Za-z0-9-]{10,}'; then
    emit_block "Slack token"
fi

# Stripe live secret
if echo "$SAMPLE" | grep -qE 'sk_live_[A-Za-z0-9]{20,}'; then
    emit_block "Stripe live secret key"
fi

# Generic private key
if echo "$SAMPLE" | grep -qE -- '-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----'; then
    emit_block "private key block"
fi

# Google API key
if echo "$SAMPLE" | grep -qE 'AIza[0-9A-Za-z_-]{35}'; then
    emit_block "Google API key"
fi

# Generic high-entropy assignment (40+ hex/base64 chars on a *_KEY or *_TOKEN or *_SECRET line)
if echo "$SAMPLE" | grep -qE '(^|[[:space:]])([A-Z_]+(KEY|TOKEN|SECRET|PASSWORD|PASS))[[:space:]]*=[[:space:]]*["'"'"']?[A-Za-z0-9/+=_-]{32,}'; then
    # Allow obvious placeholders
    if ! echo "$SAMPLE" | grep -qiE '(your[-_]?(key|token|secret)|example|changeme|placeholder|xxxx+|\.\.\.\.+)'; then
        emit_block "high-entropy credential assignment"
    fi
fi

exit 0
