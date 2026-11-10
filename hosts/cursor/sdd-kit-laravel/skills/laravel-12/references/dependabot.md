# Dependabot Configuration

```yaml
# .github/dependabot.yml
version: 2
updates:
  # PHP dependencies
  - package-ecosystem: "composer"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      laravel:
        patterns:
          - "laravel/*"
      development:
        patterns:
          - "phpstan/*"
          - "pestphp/*"
          - "laravel/pint"
        update-types:
          - "minor"
          - "patch"

  # Node.js dependencies
  - package-ecosystem: "npm"
    directory: "/frontend"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      next:
        patterns:
          - "next"
          - "react*"
      development:
        patterns:
          - "@types/*"
          - "eslint*"
          - "typescript"
        update-types:
          - "minor"
          - "patch"

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

## Environment Secrets

Required secrets per environment:
```
# Shared
CODECOV_TOKEN          # Code coverage
SLACK_WEBHOOK          # Notifications

# AWS
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
SUBNET_IDS
SECURITY_GROUP_ID

# Staging
STAGING_DB_PASSWORD
STAGING_APP_KEY

# Production
PRODUCTION_DB_PASSWORD
PRODUCTION_APP_KEY
```