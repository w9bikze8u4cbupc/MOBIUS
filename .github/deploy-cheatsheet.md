# MOBIUS Deployment Operator Runbook & Cheat Sheet

## 🚀 Quick Deploy Commands

### Production Deployment
```bash
# Full production deployment
npm run deploy:prod --release={{RELEASE_TAG}}

# Quick status check
npm run status:prod

# Rollback if needed
npm run rollback:prod --to={{PREVIOUS_TAG}}
```

### Staging Deployment
```bash
# Deploy to staging
npm run deploy:staging --branch={{BRANCH_NAME}}

# Test staging deployment
npm run test:staging
```

---

## 📋 Pre-Deployment Checklist

### T-30 Minutes Before Deployment

- [ ] **Verify build status**
  ```bash
  gh run list --repo w9bikze8u4cbupc/MOBIUS --branch main --limit 1
  ```

- [ ] **Check golden tests**
  ```bash
  npm run golden:check
  ```

- [ ] **Review recent commits**
  ```bash
  git log --oneline -10 main
  ```

- [ ] **Validate environment variables**
  ```bash
  ./scripts/validate-env.sh production
  ```

- [ ] **Check database migrations**
  ```bash
  npm run db:check-migrations
  ```

- [ ] **Verify external dependencies**
  ```bash
  curl -s https://api.elevenlabs.io/health || echo "❌ ElevenLabs API down"
  curl -s https://api.openai.com/health || echo "❌ OpenAI API down"
  ```

### T-10 Minutes Before Deployment

- [ ] **Final smoke test**
  ```bash
  npm run smoke-test:staging
  ```

- [ ] **Backup current production**
  ```bash
  npm run backup:production
  ```

- [ ] **Notify team in Slack**
  ```bash
  ./scripts/notify-deployment.sh start --release={{RELEASE_TAG}}
  ```

---

## 🎯 Deployment Steps

### 1. Build and Test
```bash
# Ensure clean state
git fetch origin
git checkout main
git pull origin main

# Install dependencies
npm ci

# Run full test suite
npm run test
npm run golden:check
npm run lint

# Build production artifacts
npm run build:prod
```

### 2. Deploy Backend Services
```bash
# Deploy API server
docker build -t mobius-api:{{RELEASE_TAG}} .
docker tag mobius-api:{{RELEASE_TAG}} mobius-api:latest

# Deploy to container registry
docker push {{REGISTRY_URL}}/mobius-api:{{RELEASE_TAG}}

# Update production service
kubectl set image deployment/mobius-api mobius-api={{REGISTRY_URL}}/mobius-api:{{RELEASE_TAG}}
kubectl rollout status deployment/mobius-api
```

### 3. Deploy Frontend
```bash
# Build client
cd client && npm run build

# Deploy to CDN/static hosting
aws s3 sync build/ s3://{{S3_BUCKET}}/
aws cloudfront create-invalidation --distribution-id {{CLOUDFRONT_ID}} --paths "/*"
```

### 4. Database Migrations (if needed)
```bash
# Run migrations
npm run db:migrate:production

# Verify migration status
npm run db:status:production
```

### 5. Health Check
```bash
# Wait for deployment to be ready
sleep 30

# Check API health
curl -f https://api.mobius-games.com/health

# Check frontend
curl -f https://mobius-games.com

# Run post-deploy tests
npm run test:production:quick
```

---

## 🔧 Environment Configuration

### Production Environment Variables
```bash
# Core API settings
export NODE_ENV=production
export PORT=5001
export API_BASE_URL=https://api.mobius-games.com

# External service keys
export OPENAI_API_KEY={{OPENAI_PROD_KEY}}
export ELEVENLABS_API_KEY={{ELEVENLABS_PROD_KEY}}

# Database
export DATABASE_URL={{PROD_DATABASE_URL}}
export REDIS_URL={{PROD_REDIS_URL}}

# Storage
export AWS_BUCKET={{PROD_S3_BUCKET}}
export AWS_REGION={{AWS_REGION}}

# Security  
export JWT_SECRET={{PROD_JWT_SECRET}}
export CORS_ORIGIN=https://mobius-games.com
```

### Staging Environment Variables
```bash
# Core API settings
export NODE_ENV=staging
export PORT=5001
export API_BASE_URL=https://staging-api.mobius-games.com

# External service keys (staging)
export OPENAI_API_KEY={{OPENAI_STAGING_KEY}}
export ELEVENLABS_API_KEY={{ELEVENLABS_STAGING_KEY}}

# Database (staging)
export DATABASE_URL={{STAGING_DATABASE_URL}}
export REDIS_URL={{STAGING_REDIS_URL}}

# Storage (staging)
export AWS_BUCKET={{STAGING_S3_BUCKET}}
export CORS_ORIGIN=https://staging.mobius-games.com
```

---

## 🚨 Emergency Procedures

### Immediate Rollback
```bash
# Quick rollback to previous version
npm run rollback:immediate

# Or manual rollback
kubectl rollout undo deployment/mobius-api
kubectl rollout status deployment/mobius-api

# Rollback frontend
aws s3 sync s3://{{BACKUP_BUCKET}}/{{PREVIOUS_TAG}}/ s3://{{S3_BUCKET}}/
aws cloudfront create-invalidation --distribution-id {{CLOUDFRONT_ID}} --paths "/*"
```

### Service Recovery
```bash
# Restart API service
kubectl restart deployment/mobius-api

# Scale up if needed
kubectl scale deployment/mobius-api --replicas=3

# Check logs
kubectl logs -l app=mobius-api --tail=100 -f
```

### Database Issues
```bash
# Check database connectivity
npm run db:ping

# Restore from backup (DANGER - staging only)
npm run db:restore --backup={{BACKUP_ID}} --environment=staging

# Check migration status
npm run db:migrations:status
```

---

## 📊 Monitoring & Alerting

### Key Metrics to Monitor
```bash
# API Response Time
curl -w "@curl-format.txt" -s -o /dev/null https://api.mobius-games.com/health

# Error Rates
kubectl logs -l app=mobius-api | grep ERROR | wc -l

# Resource Usage
kubectl top pods -l app=mobius-api

# Database Performance  
npm run db:stats
```

### Alerting Thresholds
- API response time > 2s
- Error rate > 5%
- Memory usage > 80%
- CPU usage > 70%
- Disk space < 20%

---

## 🎮 Game Pipeline Specific

### Video Generation Health Check
```bash
# Test video generation pipeline
curl -X POST https://api.mobius-games.com/api/test-pipeline \
  -H "Content-Type: application/json" \
  -d '{"game": "test", "quick": true}'

# Check FFmpeg availability
ffmpeg -version

# Test audio generation
curl -X POST https://api.mobius-games.com/api/test-audio \
  -H "Content-Type: application/json" \
  -d '{"text": "test", "voice": "english"}'
```

### Golden Test Validation
```bash
# Run golden tests against production
npm run golden:check:production

# Update golden files if needed (staging only)
npm run golden:update:staging
```

---

## 🔍 Troubleshooting Guide

### Common Issues

#### API Not Responding
```bash
# Check service status
kubectl get pods -l app=mobius-api

# Check logs
kubectl logs -l app=mobius-api --tail=50

# Check service endpoints
kubectl get svc mobius-api
```

#### Video Generation Failing
```bash
# Check FFmpeg installation
ffmpeg -version

# Check disk space
df -h /tmp

# Test with minimal input
curl -X POST localhost:5001/api/generate \
  -F "file=@test-rules.pdf" \
  -F "gameName=Test"
```

#### Database Connection Issues
```bash
# Test connection
npm run db:test-connection

# Check connection pool
npm run db:pool-status

# Restart database (if using Docker)
docker restart mobius-db
```

### Performance Issues

#### High Memory Usage
```bash
# Check Node.js memory
node --max-old-space-size=4096 src/api/index.js

# Monitor memory usage
top -p $(pgrep node)

# Restart service if needed
kubectl restart deployment/mobius-api
```

#### Slow Response Times
```bash
# Check API endpoints
npm run perf:test

# Analyze slow queries
npm run db:slow-queries

# Check external service latency
curl -w "@curl-format.txt" -s https://api.openai.com/v1/models
```

---

## 📞 Escalation Contacts

### On-Call Schedule
- **Primary:** {{PRIMARY_ONCALL}} (Slack: @{{PRIMARY_SLACK}})
- **Secondary:** {{SECONDARY_ONCALL}} (Slack: @{{SECONDARY_SLACK}})
- **Manager:** {{MANAGER_ONCALL}} (Slack: @{{MANAGER_SLACK}})

### Emergency Contacts
- **Infrastructure:** {{INFRA_TEAM_SLACK}}
- **Database:** {{DB_TEAM_SLACK}}  
- **Security:** {{SECURITY_TEAM_SLACK}}

---

## 📚 Additional Resources

### Documentation
- [API Documentation]({{API_DOCS_URL}})
- [Architecture Overview]({{ARCH_DOCS_URL}})
- [Database Schema]({{DB_DOCS_URL}})
- [Monitoring Dashboard]({{MONITORING_URL}})

### Useful Commands Reference
```bash
# View deployment history
kubectl rollout history deployment/mobius-api

# Check resource usage
kubectl top nodes
kubectl top pods

# Access production logs  
kubectl logs -l app=mobius-api -f --since=1h

# Database backup
npm run db:backup --env=production

# Security scan
npm audit --audit-level=high
```

---

## 🔐 Security Considerations

### Pre-Deployment Security Checks
- [ ] No hardcoded secrets in code
- [ ] Environment variables properly configured
- [ ] SSL certificates valid
- [ ] Security headers configured
- [ ] Rate limiting enabled
- [ ] Input validation in place

### Post-Deployment Security Validation
```bash
# SSL check
curl -I https://api.mobius-games.com

# Security headers check
curl -I https://mobius-games.com | grep -E "(X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security)"

# API security test
npm run security:test:production
```

---

*Last Updated: {{CURRENT_DATE}}*  
*Version: {{RUNBOOK_VERSION}}*  
*Next Review: {{NEXT_REVIEW_DATE}}*