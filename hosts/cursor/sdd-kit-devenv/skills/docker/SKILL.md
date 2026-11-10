---
name: docker
description: Docker for Laravel + Next.js. Use for Dockerfiles, compose setup, and container configuration.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Docker Configuration

Patterns for Docker configuration in Laravel + Next.js applications.

## When to Load References

| Task | Load |
|------|------|
| Production compose, nginx, PHP config | `references/production-setup.md` |

---

## Laravel Dockerfile

### Production Dockerfile
```dockerfile
FROM php:8.4-fpm-alpine AS base

RUN apk add --no-cache \
    libpng-dev libjpeg-turbo-dev libwebp-dev freetype-dev \
    libzip-dev zip unzip git curl oniguruma-dev postgresql-dev

RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql pdo_pgsql mbstring exif pcntl bcmath gd zip opcache

RUN pecl install redis && docker-php-ext-enable redis

COPY docker/php/php.ini /usr/local/etc/php/conf.d/app.ini
COPY docker/php/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
WORKDIR /var/www/html

FROM base AS composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist
COPY . .
RUN composer dump-autoload --optimize

FROM base AS production
COPY --from=composer /var/www/html /var/www/html
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD php artisan health:check || exit 1
USER www-data
CMD ["php-fpm"]
```

---

## Next.js Dockerfile

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
```

---

## Docker Compose (Development)

```yaml
version: '3.8'

services:
  api:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    volumes:
      - ./api:/var/www/html
      - /var/www/html/vendor
    ports: ['9000:9000']
    depends_on: [mysql, redis]
    environment:
      - DB_HOST=mysql
      - REDIS_HOST=redis
    networks: [app-network]

  nginx:
    image: nginx:alpine
    ports: ['8000:80']
    volumes:
      - ./api:/var/www/html
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf
    depends_on: [api]
    networks: [app-network]

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    ports: ['3000:3000']
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on: [nginx]
    networks: [app-network]

  mysql:
    image: mysql:8.0
    ports: ['3306:3306']
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: app
      MYSQL_USER: app
      MYSQL_PASSWORD: secret
    volumes: [mysql-data:/var/lib/mysql]
    networks: [app-network]

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    volumes: [redis-data:/data]
    networks: [app-network]

  queue:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    command: php artisan queue:work --tries=3
    volumes: [./api:/var/www/html]
    depends_on: [mysql, redis]
    environment:
      - DB_HOST=mysql
      - REDIS_HOST=redis
    networks: [app-network]

  scheduler:
    build:
      context: ./api
      dockerfile: Dockerfile.dev
    command: php artisan schedule:work
    volumes: [./api:/var/www/html]
    depends_on: [mysql, redis]
    environment:
      - DB_HOST=mysql
      - REDIS_HOST=redis
    networks: [app-network]

networks:
  app-network:
    driver: bridge

volumes:
  mysql-data:
  redis-data:
```

---

## Docker Commands

```bash
# Development
docker-compose up -d
docker-compose logs -f api
docker-compose exec api php artisan migrate
docker-compose exec api composer install

# Production
docker-compose -f docker-compose.prod.yml up -d

# Build and push
docker build -t api:latest ./api
docker push ${ECR_REGISTRY}/api:latest

# Clean up
docker system prune -a
docker volume prune
```

---