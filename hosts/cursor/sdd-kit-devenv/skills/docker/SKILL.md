---
name: docker
description: Docker and Compose for application containers. Not for DDEV projects (use the ddev skill). Use for Dockerfiles, compose setup, and container configuration outside DDEV.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
metadata:
  last_verified: "2026-10-22"
  next_review: "2027-01-22"
  targets: "Docker Engine 27; Compose v2"
---

# Docker Configuration

Patterns for Docker and Compose configuration. Not for DDEV projects: DDEV manages its own containers (see the `ddev` skill).

## When to Load References

| Task | Load |
|------|------|
| Production compose, nginx, PHP config | `references/production-setup.md` |
| Dockerfiles for the Laravel and Next.js starting set | `references/dockerfile-examples.md` |

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