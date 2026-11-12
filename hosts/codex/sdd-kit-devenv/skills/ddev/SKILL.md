---
name: ddev
description: DDEV local development environment for PHP and Node.js projects (Drupal, Laravel, Next.js and others). Use for container management, running Composer, Drush, Artisan or npm inside DDEV, database work, Xdebug and quality gates in a DDEV project.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# DDEV Local Development

DDEV is a Docker-based local development environment for PHP and Node.js applications. Its project type (`drupal11`, `laravel`, `php` and others) decides which framework commands it adds, such as `ddev drush` or `ddev artisan`.

## Quick Reference

| Task | Command |
|------|---------|
| Start project | `ddev start` |
| Stop project | `ddev stop` |
| Restart project | `ddev restart` |
| Project status | `ddev describe` or `ddev st` |
| SSH into container | `ddev ssh` |
| View logs | `ddev logs` |
| Run Composer | `ddev composer <cmd>` |
| Run Artisan (laravel project type) | `ddev artisan <cmd>` or `ddev art` |
| Run Drush (drupal project types) | `ddev drush <cmd>` |
| Run npm | `ddev npm <cmd>` |

## When to Load References

| Task | Load |
|------|------|
| Xdebug setup | `references/debugging.md` |
| Database operations | `references/database.md` |
| MCP server setup | `references/mcp-server.md` |

## MCP Server Integration

DDEV has an MCP server for AI-assisted development. Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "ddev": {
      "command": "ddev-mcp",
      "args": ["--single-project", "your-project-name"]
    }
  }
}
```

**Install:** `npm install -g ddev-mcp`

**Features via MCP:**
- Execute SQL queries directly
- Start/stop/restart projects
- Run Composer commands
- Control Xdebug
- Access logs
- Database backups

## Essential Commands

### Project Lifecycle
```bash
ddev config                    # Initialize new project
ddev start                     # Start containers
ddev stop                      # Stop containers
ddev restart                   # Restart project
ddev delete                    # Remove project (preserves files)
ddev poweroff                  # Stop ALL DDEV projects
```

### Container Access
```bash
ddev ssh                       # Shell into web container
ddev ssh -s db                 # Shell into database container
ddev exec <command>            # Run command in container
ddev logs                      # View web container logs
ddev logs -s db                # View database logs
```

### Development Commands
```bash
# PHP/Laravel
ddev composer install
ddev composer require <pkg>
ddev artisan migrate
ddev artisan tinker
ddev php <script.php>

# Node.js/Next.js
ddev npm install
ddev npm run dev
ddev npm run build
ddev yarn <command>

# PHP/Drupal
ddev composer require drupal/<module>
ddev drush en <module>
ddev drush cr
ddev drush cex -y
ddev drush cim -y
ddev drush updb -y
ddev drush config:status
ddev drush uli
```

`ddev drush` runs the project's `vendor/bin/drush` inside the web container, against the DDEV database. Do not call `drush` on the host in a DDEV project: the host may have no PHP, and it would not reach the container's database.

### Database
```bash
ddev import-db < dump.sql      # Import database
ddev export-db > backup.sql    # Export database
ddev snapshot                  # Create named snapshot
ddev snapshot restore          # Restore latest snapshot
ddev mysql                     # MySQL CLI
```

## Debugging with Xdebug

### Enable/Disable
```bash
ddev xdebug on                 # Enable Xdebug
ddev xdebug off                # Disable (better performance)
ddev xdebug toggle             # Toggle state
ddev xdebug status             # Check current state
```

### IDE Setup (VS Code)

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Listen for Xdebug",
      "type": "php",
      "request": "launch",
      "port": 9003,
      "pathMappings": {
        "/var/www/html": "${workspaceFolder}"
      }
    }
  ]
}
```

### IDE Setup (PhpStorm)
1. Enable "Start Listening for PHP Debug Connections"
2. Set breakpoint
3. Run `ddev xdebug on`
4. Trigger request - PhpStorm auto-detects

### Troubleshooting Xdebug
```bash
# Check if Xdebug can reach IDE
ddev ssh
telnet host.docker.internal 9003

# View Xdebug logs
ddev logs | grep -i xdebug
```

## Configuration

### Project Config (`.ddev/config.yaml`)
```yaml
name: my-project
type: laravel
docroot: public
php_version: "8.4"
database:
  type: mysql
  version: "8.0"
nodejs_version: "20"
webserver_type: nginx-fpm

# Performance
disable_settings_management: false
omit_containers: []

# Hooks
hooks:
  post-start:
    - exec: composer install
```

### Drupal Project Config (`.ddev/config.yaml`)
```yaml
name: my-site
type: drupal11            # or drupal10
docroot: web
php_version: "8.3"
database:
  type: mariadb
  version: "10.11"

hooks:
  post-start:
    - exec: composer install
```

### Common Settings
```bash
ddev config --project-type=laravel
ddev config --project-type=drupal11 --docroot=web
ddev config --php-version=8.4
ddev config --nodejs-version=20
ddev config --database=mysql:8.0
```

## Laravel + Next.js Setup

```yaml
# .ddev/config.yaml
name: my-app
type: laravel
docroot: api/public
php_version: "8.4"
nodejs_version: "20"
database:
  type: mysql
  version: "8.0"

# Additional hostnames for Next.js
additional_hostnames:
  - frontend

hooks:
  post-start:
    - exec: cd /var/www/html/api && composer install
    - exec: cd /var/www/html/frontend && npm install
```

## Drupal Setup

For an existing Drupal site:

```bash
ddev config --project-type=drupal11 --docroot=web
ddev start
ddev composer install
ddev import-db --file=<dump.sql.gz>
ddev drush cim -y
ddev drush uli
```

Fresh install only; wipes the database: `ddev drush site:install`. Never run it on an existing site unless the task asks for it.

For PHPCS, PHPStan and PHPUnit in a Drupal project, follow the `drupal-11` skill's Gate setup section.

## Useful URLs

After `ddev start`:
- **Web:** https://my-project.ddev.site
- **Mailpit:** https://my-project.ddev.site:8026
- **phpMyAdmin:** https://my-project.ddev.site:8037

---

**Sources:**
- [DDEV Documentation](https://docs.ddev.com)
- [DDEV MCP Server](https://github.com/AkibaAT/ddev-mcp)

## Quality gates in a DDEV project

When a repo has `.ddev/config.yaml`, the Laravel and Drupal stack manifests declare an `execWrapper`, so the workflow gates (for example Pint, PHPCS, PHPStan, tests) run as `ddev exec <gate command>` and the gate details name the wrapper. If the running check fails, each wrapped gate is reported as `not run (ddev not running)` instead of failing; start the project with `ddev start` and re-run. Laravel and Drupal both check with `ddev describe -j` and require `raw.status` to equal `running`, so a gate never starts a stopped project. Repos without the marker keep their plain gate commands.

A Drupal repo may sit below the DDEV project root (for example `<root>/.ddev` with the site in `<root>/drupal`), whether Claude is opened at `<root>` or inside `<root>/drupal`. Its gates then run as `ddev exec --dir /var/www/html/drupal <gate command>`, and container paths in their output come back relative to the repo (`/var/www/html/drupal/web/...` as `web/...`, `/var/www/html/vendor/...` as `../vendor/...`). If the gate planner reports that `ddev exec --dir` cannot enter that directory, check the project's `docroot` and mounts in `.ddev/config.yaml`. A Laravel repo needs `.ddev/config.yaml` in the repo itself.

**HTTPS and URLs.** For trusted `https://<project>.ddev.site` URLs, run `mkcert -install` once, then `ddev restart`; `ddev utility tls-diagnose` reports what is wrong when the browser still warns. Workflows accept `*.ddev.site` as a dev URL. A custom `project_tld` is not accepted: pass the `http://127.0.0.1:<port>` URL that `ddev describe` lists.
