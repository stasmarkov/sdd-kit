# DDEV Database Operations

Complete guide for database management in DDEV.

## Database CLI Access

### MySQL/MariaDB
```bash
ddev mysql                     # Interactive MySQL CLI
ddev mysql -uroot -proot       # As root user
ddev mysql db < script.sql     # Execute SQL file
```

### PostgreSQL
```bash
ddev psql                      # Interactive psql CLI
ddev psql -c "SELECT 1"        # Execute single command
```

## Import/Export

### Import Database
```bash
# From SQL file
ddev import-db < dump.sql
ddev import-db --file=dump.sql.gz  # Compressed

# From specific file
ddev import-db --src=backups/prod-2024-01-01.sql

# Into specific database
ddev import-db --database=other_db < dump.sql
```

### Export Database
```bash
# To stdout (pipe to file)
ddev export-db > backup.sql

# Compressed
ddev export-db --gzip > backup.sql.gz

# Specific database
ddev export-db --database=other_db > other.sql

# With specific tables only
ddev export-db --tables=users,orders > partial.sql
```

## Snapshots

Snapshots are quick database backups stored locally.

### Create Snapshot
```bash
ddev snapshot                  # Auto-named with timestamp
ddev snapshot --name=before-migration
ddev snapshot --name=clean-install
```

### List Snapshots
```bash
ddev snapshot --list
```

### Restore Snapshot
```bash
ddev snapshot restore          # Restore latest
ddev snapshot restore --name=before-migration
ddev snapshot restore --latest # Explicitly latest
```

### Delete Snapshots
```bash
ddev snapshot --cleanup        # Remove all snapshots
ddev snapshot --name=old-snap --cleanup  # Remove specific
```

## Database Configuration

### MySQL (Default)
```yaml
# .ddev/config.yaml
database:
  type: mysql
  version: "8.0"
```

### MariaDB
```yaml
database:
  type: mariadb
  version: "10.11"
```

### PostgreSQL
```yaml
database:
  type: postgres
  version: "16"
```

## Connection Details

After `ddev start`, get connection info:
```bash
ddev describe
```

### Default Credentials
| Setting | Value |
|---------|-------|
| Host (inside container) | `db` |
| Host (from host) | `127.0.0.1` |
| Port (from host) | Run `ddev describe` |
| Database | `db` |
| Username | `db` |
| Password | `db` |
| Root Password | `root` |

### Laravel .env
```env
DB_CONNECTION=mysql
DB_HOST=db
DB_PORT=3306
DB_DATABASE=db
DB_USERNAME=db
DB_PASSWORD=db
```

## External Database Tools

### Connect from Host Machine
```bash
# Get external port
ddev describe | grep -i mysql

# Connect via mysql client
mysql -h 127.0.0.1 -P <port> -u db -pdb db
```

### TablePlus/Sequel Pro/DBeaver
Use connection details from `ddev describe`:
- Host: `127.0.0.1`
- Port: (shown in describe output)
- User: `db`
- Password: `db`
- Database: `db`

### phpMyAdmin
Automatically available at:
```
https://your-project.ddev.site:8037
```

### Adminer
Add as DDEV add-on:
```bash
ddev get ddev/ddev-adminer
ddev restart
# Available at https://your-project.ddev.site:9999
```

## Multiple Databases

### Create Additional Database
```bash
ddev mysql -uroot -proot -e "CREATE DATABASE second_db"
```

### Use in Laravel
```php
// config/database.php
'connections' => [
    'mysql' => [
        'database' => env('DB_DATABASE', 'db'),
    ],
    'secondary' => [
        'driver' => 'mysql',
        'host' => 'db',
        'database' => 'second_db',
        'username' => 'db',
        'password' => 'db',
    ],
],
```

## Troubleshooting

### Database Won't Start
```bash
# Check logs
ddev logs -s db

# Restart database container
ddev restart

# Nuclear option - remove and recreate
ddev delete --omit-snapshot
ddev start
```

### Import Failing
```bash
# Check file encoding
file dump.sql

# Convert if needed
iconv -f ISO-8859-1 -t UTF-8 dump.sql > dump-utf8.sql

# For large files, increase timeout
ddev config --web-timeout=600
ddev import-db < large-dump.sql
```

### Connection Refused
```bash
# Verify database is running
ddev describe

# Check database type matches your app config
cat .ddev/config.yaml | grep database
```

## Performance Tips

### Disable Binary Logging (Dev Only)
Create `.ddev/mysql/no-binlog.cnf`:
```ini
[mysqld]
skip-log-bin
```

### Increase Memory
```yaml
# .ddev/config.yaml
web_extra_daemons:
  - name: "mysql-memory"
    command: "true"
    container_type: db
```

Or use `.ddev/mysql/memory.cnf`:
```ini
[mysqld]
innodb_buffer_pool_size=256M
```
