---
name: ddev
description: DDEV local development environment. Use for container management, debugging, and Laravel/Next.js development.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# DDEV Local Development

DDEV is a Docker-based local development environment for PHP/Node.js applications.

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
| Run Artisan | `ddev artisan <cmd>` or `ddev art` |
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
```

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

### Common Settings
```bash
ddev config --project-type=laravel
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

When a repo has `.ddev/config.yaml`, the Laravel stack manifest declares an `execWrapper`, so the workflow gates (Pint, PHPStan, tests) run as `ddev exec <gate command>` and the gate details name the wrapper. If `ddev describe` fails, each wrapped gate is reported as `not run (ddev not running)` instead of failing; start the project with `ddev start` and re-run. Repos without the marker keep their plain gate commands.
