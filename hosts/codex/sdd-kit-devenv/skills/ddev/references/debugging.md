# DDEV Debugging Guide

Comprehensive guide for debugging PHP applications with DDEV and Xdebug.

## Xdebug Basics

DDEV automatically installs and configures Xdebug. It's disabled by default for performance.

### Enable/Disable
```bash
ddev xdebug on       # Enable
ddev xdebug off      # Disable
ddev xdebug toggle   # Toggle
ddev xdebug status   # Check state
```

### Performance Note
Xdebug significantly impacts performance. Always disable when not actively debugging:
```bash
# After debugging session
ddev xdebug off
```

## VS Code Setup

### 1. Install Extension
Install "PHP Debug" by Xdebug (felixfbecker.php-debug)

### 2. Create Launch Configuration
Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Listen for Xdebug (DDEV)",
      "type": "php",
      "request": "launch",
      "port": 9003,
      "pathMappings": {
        "/var/www/html": "${workspaceFolder}"
      },
      "hostname": "0.0.0.0",
      "log": true
    },
    {
      "name": "Listen for Xdebug (DDEV API)",
      "type": "php",
      "request": "launch",
      "port": 9003,
      "pathMappings": {
        "/var/www/html/api": "${workspaceFolder}/api"
      },
      "hostname": "0.0.0.0"
    }
  ]
}
```

### 3. Debug Workflow
1. Start debugger (F5 or Run > Start Debugging)
2. Set breakpoints in code
3. Enable Xdebug: `ddev xdebug on`
4. Trigger request (browser, curl, test)
5. VS Code pauses at breakpoint

## PhpStorm Setup

### Zero-Configuration (Recommended)
1. Click "Start Listening for PHP Debug Connections" (phone icon)
2. Set breakpoint
3. Run `ddev xdebug on`
4. Trigger request
5. PhpStorm auto-creates server mapping on first connection

### Manual Configuration
1. **Settings > PHP > Servers**
   - Name: `my-project.ddev.site`
   - Host: `my-project.ddev.site`
   - Port: `443`
   - Debugger: Xdebug
   - Use path mappings: `/var/www/html` → project root

2. **Run > Edit Configurations**
   - Add PHP Remote Debug
   - Server: select created server
   - IDE key: `PHPSTORM`

## CLI Debugging

Debug Artisan commands, Composer scripts, or PHPUnit:

```bash
# Enable Xdebug first
ddev xdebug on

# Run command - Xdebug will connect to IDE
ddev artisan migrate
ddev exec phpunit
ddev composer test
```

## Debugging Tests

### PHPUnit/Pest with Xdebug
```bash
ddev xdebug on
ddev exec ./vendor/bin/pest --filter="test name"
```

### VS Code Test Debugging
Add to `launch.json`:
```json
{
  "name": "Debug Pest Tests",
  "type": "php",
  "request": "launch",
  "port": 9003,
  "pathMappings": {
    "/var/www/html": "${workspaceFolder}"
  },
  "program": "${workspaceFolder}/vendor/bin/pest",
  "args": ["--filter=${input:testFilter}"],
  "cwd": "${workspaceFolder}"
}
```

## Profiling

### Enable Profiler
```bash
# Set in .ddev/config.yaml or environment
ddev config --xdebug-mode=profile

# Or temporarily
ddev exec "XDEBUG_MODE=profile php script.php"
```

### View Profiles
Cachegrind files saved to `/tmp`. View with:
- **KCachegrind** (Linux)
- **QCachegrind** (macOS: `brew install qcachegrind`)
- **Webgrind** (web-based)

## Troubleshooting

### Connection Issues

**Check IDE is listening:**
```bash
# From inside container
ddev ssh
telnet host.docker.internal 9003
# Should connect if IDE is listening
```

**Check firewall:**
- Ensure port 9003 is open
- macOS: System Preferences > Security > Firewall > Allow incoming

**Check Xdebug status:**
```bash
ddev xdebug status
ddev exec php -v  # Should show Xdebug version
```

### Common Problems

| Issue | Solution |
|-------|----------|
| IDE doesn't stop at breakpoints | Check path mappings match |
| "Connection refused" | IDE not listening, check port 9003 |
| Slow even with Xdebug off | Run `ddev restart` |
| WSL2 connection issues | Set `xdebug_ide_location` in config |

### WSL2 Configuration
```yaml
# .ddev/config.yaml
xdebug_ide_location: WSL2
```

### Docker Desktop (Mac/Windows)
```yaml
# Usually auto-detected, but if needed:
xdebug_ide_location: docker-for-desktop
```

## Advanced Configuration

### Custom Xdebug Settings
Create `.ddev/php/xdebug.ini`:
```ini
[xdebug]
xdebug.max_nesting_level=512
xdebug.var_display_max_depth=10
xdebug.var_display_max_data=2048
```

### Multiple IDE Support
```yaml
# .ddev/config.yaml
web_environment:
  - XDEBUG_SESSION=PHPSTORM  # or VSCODE
```

## Browser Extensions

For triggering Xdebug from browser:

- **Xdebug Helper** (Chrome/Firefox)
  - Set IDE key to match your IDE
  - Click to enable/disable debugging per request

Without extension, add to URL:
```
?XDEBUG_SESSION_START=PHPSTORM
```
