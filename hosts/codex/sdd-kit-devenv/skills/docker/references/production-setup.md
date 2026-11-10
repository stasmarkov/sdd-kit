# Docker Production Setup

## Production Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  api:
    image: ${ECR_REGISTRY}/api:${IMAGE_TAG:-latest}
    restart: always
    depends_on:
      - redis
    environment:
      - APP_ENV=production
      - APP_DEBUG=false
      - DB_HOST=${DB_HOST}
      - DB_PASSWORD=${DB_PASSWORD}
      - REDIS_HOST=redis
    healthcheck:
      test: ["CMD", "php", "artisan", "health:check"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - app-network

  frontend:
    image: ${ECR_REGISTRY}/frontend:${IMAGE_TAG:-latest}
    restart: always
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis-data:/data
    networks:
      - app-network

  queue:
    image: ${ECR_REGISTRY}/api:${IMAGE_TAG:-latest}
    restart: always
    command: php artisan queue:work --tries=3 --timeout=90
    depends_on:
      - redis
    environment:
      - APP_ENV=production
      - DB_HOST=${DB_HOST}
      - REDIS_HOST=redis
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  redis-data:
```

## Nginx Configuration

```nginx
# docker/nginx/default.conf
server {
    listen 80;
    server_name localhost;
    root /var/www/html/public;
    index index.php;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass api:9000;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }

    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

## PHP Configuration

### php.ini
```ini
memory_limit = 256M
upload_max_filesize = 64M
post_max_size = 64M
max_execution_time = 60
max_input_time = 60
display_errors = Off
log_errors = On
error_log = /var/log/php/error.log
session.cookie_httponly = On
session.cookie_secure = On
session.cookie_samesite = Strict
```

### opcache.ini
```ini
opcache.enable=1
opcache.memory_consumption=256
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=10000
opcache.validate_timestamps=0
opcache.revalidate_freq=0
opcache.fast_shutdown=1
```