# DDEV MCP Server

Enable AI assistants to interact with your DDEV development environment.

## Overview

The DDEV MCP Server provides Model Context Protocol access to:
- Execute SQL queries
- Manage DDEV projects
- Run development commands
- Control Xdebug
- Access logs

**Source:** [github.com/AkibaAT/ddev-mcp](https://github.com/AkibaAT/ddev-mcp)

## Installation

### From npm (Recommended)
```bash
npm install -g ddev-mcp

# Verify installation
ddev-mcp --help
```

### Requirements
- Node.js 20+
- DDEV installed and in PATH
- Configured DDEV project(s)

## Configuration

### Single Project Mode (Recommended for Security)
```json
{
  "mcpServers": {
    "ddev": {
      "command": "ddev-mcp",
      "args": ["--single-project", "my-project"]
    }
  }
}
```

### Multi-Project Mode
```json
{
  "mcpServers": {
    "ddev": {
      "command": "ddev-mcp"
    }
  }
}
```

### With Write Operations (Use Carefully)
```json
{
  "mcpServers": {
    "ddev": {
      "command": "ddev-mcp",
      "args": ["--single-project", "my-project", "--allow-write"]
    }
  }
}
```

## Available Tools

### Project Management
| Tool | Description |
|------|-------------|
| `ddev_start` | Start DDEV project |
| `ddev_stop` | Stop DDEV project |
| `ddev_restart` | Restart DDEV project |
| `ddev_describe` | Get project status and info |
| `ddev_list_projects` | List all projects (multi-project mode) |

### Database Operations
| Tool | Description |
|------|-------------|
| `ddev_mysql_query` | Execute SQL queries (MySQL/MariaDB) |
| `ddev_psql_query` | Execute SQL queries (PostgreSQL) |
| `ddev_list_tables` | List database tables |
| `ddev_describe_table` | Show table structure |
| `ddev_list_databases` | List available databases |
| `ddev_snapshot` | Create database snapshot |
| `ddev_snapshot_restore` | Restore database snapshot |

### Development Commands
| Tool | Description |
|------|-------------|
| `ddev_composer` | Run Composer commands |
| `ddev_exec` | Execute shell commands |
| `ddev_logs` | View container logs |
| `ddev_xdebug` | Control Xdebug (on/off/status) |
| `ddev_share` | Create ngrok tunnel |
| `ddev_mailpit` | Access Mailpit URL |

## Security Model

### Whitelist by Default
Only read-only operations are allowed by default:
- SELECT queries
- SHOW/DESCRIBE commands
- Project status checks
- Log viewing

### Blocked by Default
- INSERT, UPDATE, DELETE queries
- DROP DATABASE/TABLE
- File system access
- Destructive commands

### Enable Write Operations
Use `--allow-write` flag only when necessary:
```json
{
  "args": ["--single-project", "my-project", "--allow-write"]
}
```

## Usage Examples

### Query Database
```
Ask Claude: "Show me all users in the database"
→ Uses ddev_mysql_query with SELECT * FROM users
```

### Check Project Status
```
Ask Claude: "What's the status of my DDEV project?"
→ Uses ddev_describe to show project info
```

### Run Migrations
```
Ask Claude: "Run the Laravel migrations"
→ Uses ddev_exec with "php artisan migrate"
```

### Debug Setup
```
Ask Claude: "Enable Xdebug for debugging"
→ Uses ddev_xdebug with "on" argument
```

## Multiple Environments

### Development + Staging Servers
```json
{
  "mcpServers": {
    "ddev-dev": {
      "command": "ddev-mcp",
      "args": ["--single-project", "my-app-dev", "--allow-write"]
    },
    "ddev-staging": {
      "command": "ddev-mcp",
      "args": ["--single-project", "my-app-staging"]
    }
  }
}
```

## Integration with Framework

Add to your project's `.mcp.json`:
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "ddev": {
      "command": "ddev-mcp",
      "args": ["--single-project", "your-project-name"]
    }
  }
}
```

## Troubleshooting

### Server Not Starting
```bash
# Check Node.js version
node --version  # Must be 20+

# Check DDEV is available
ddev version

# Test server directly
ddev-mcp --single-project my-project
```

### Project Not Found
```bash
# List available projects
ddev list

# Ensure project is started
ddev start
```

### Permission Errors
- Single project mode restricts to one project
- Write operations require `--allow-write`
- SQL queries must match whitelist patterns

### Database Type Detection
The server auto-detects database type from `.ddev/config.yaml`:
- MySQL/MariaDB: Uses `mysql` commands
- PostgreSQL: Uses `psql` commands

## Best Practices

1. **Use Single Project Mode** - Limits scope and improves security
2. **Avoid --allow-write in Production** - Only enable when necessary
3. **Review AI Queries** - Check generated SQL before execution
4. **Keep DDEV Updated** - Ensures compatibility with MCP server
5. **Separate Dev/Staging** - Use different server configs per environment
