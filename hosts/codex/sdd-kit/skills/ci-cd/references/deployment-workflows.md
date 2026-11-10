# Deployment Workflows

## Staging Deployment

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [develop]

concurrency:
  group: staging
  cancel-in-progress: true

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push API image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          <container build command> -t $ECR_REGISTRY/api:$IMAGE_TAG -t $ECR_REGISTRY/api:staging ./api
          <container push command> $ECR_REGISTRY/api:$IMAGE_TAG
          <container push command> $ECR_REGISTRY/api:staging

      - name: Build and push Frontend image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          <container build command> -t $ECR_REGISTRY/frontend:$IMAGE_TAG -t $ECR_REGISTRY/frontend:staging ./frontend
          <container push command> $ECR_REGISTRY/frontend:$IMAGE_TAG
          <container push command> $ECR_REGISTRY/frontend:staging

      - name: Deploy to ECS
        run: |
          aws ecs update-service --cluster staging --service api --force-new-deployment
          aws ecs update-service --cluster staging --service frontend --force-new-deployment

      - name: Wait for deployment
        run: aws ecs wait services-stable --cluster staging --services api frontend

      - name: Run migrations
        run: |
          aws ecs run-task \
            --cluster staging \
            --task-definition api-migrate \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ secrets.SUBNET_IDS }}],securityGroups=[${{ secrets.SECURITY_GROUP_ID }}]}"

      - name: Notify Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          fields: repo,message,commit,author,action,eventName,ref,workflow
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

## Production Deployment

```yaml
# .github/workflows/deploy-prod.yml
name: Deploy to Production

on:
  release:
    types: [published]

concurrency:
  group: production
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    environment: production

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Pull staging images and retag for production
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          VERSION: ${{ github.event.release.tag_name }}
        run: |
          <container pull command> $ECR_REGISTRY/api:staging
          <container tag command> $ECR_REGISTRY/api:staging $ECR_REGISTRY/api:$VERSION
          <container tag command> $ECR_REGISTRY/api:staging $ECR_REGISTRY/api:latest
          <container push command> $ECR_REGISTRY/api:$VERSION
          <container push command> $ECR_REGISTRY/api:latest

          <container pull command> $ECR_REGISTRY/frontend:staging
          <container tag command> $ECR_REGISTRY/frontend:staging $ECR_REGISTRY/frontend:$VERSION
          <container tag command> $ECR_REGISTRY/frontend:staging $ECR_REGISTRY/frontend:latest
          <container push command> $ECR_REGISTRY/frontend:$VERSION
          <container push command> $ECR_REGISTRY/frontend:latest

      - name: Create database backup
        run: |
          aws rds create-db-snapshot \
            --db-instance-identifier production-db \
            --db-snapshot-identifier pre-deploy-${{ github.event.release.tag_name }}

      - name: Deploy to ECS
        run: |
          aws ecs update-service --cluster production --service api --force-new-deployment
          aws ecs update-service --cluster production --service frontend --force-new-deployment

      - name: Wait for deployment
        run: aws ecs wait services-stable --cluster production --services api frontend

      - name: Health check
        run: |
          sleep 30
          curl --fail https://api.example.com/health
          curl --fail https://app.example.com
```