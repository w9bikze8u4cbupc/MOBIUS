# 🚀 MOBIUS Deploy Operator Cheat Sheet

## 🏁 Quick Deploy Commands

### Production Release
```bash
# Full production deployment
npm run golden:check                    # Verify golden tests pass
npm run build                          # Build production artifacts
npm run deploy:prod                    # Deploy to production
npm run verify:prod                    # Verify deployment health
```

### Staging Deployment
```bash
# Deploy to staging environment
npm run deploy:staging
npm run verify:staging
```

### Rollback Commands
```bash
# Emergency rollback to previous version
npm run rollback:prod                  # Rollback production
npm run rollback:staging               # Rollback staging

# Rollback to specific version
npm run deploy:prod -- --version=v1.2.3
```

## 📁 Key File Paths

### Configuration Files
```
config/
├── production.json          # Production config
├── staging.json            # Staging config
├── database.json           # DB connection strings
└── api-keys.json          # API key references (encrypted)
```

### Deployment Artifacts
```
out/
├── preview_with_audio.mp4  # Generated video preview
├── components/             # Extracted game components
├── metadata/              # Game metadata JSON
└── artifacts/            # Build artifacts and reports
```

### Critical Scripts
```
scripts/
├── deploy-prod.sh         # Production deployment
├── deploy-staging.sh      # Staging deployment
├── health-check.sh        # Post-deploy verification
├── rollback.sh           # Emergency rollback
└── backup-db.sh          # Database backup
```

## 🎬 Video Processing Pipeline

### Generate Tutorial Video
```bash
# Complete pipeline from rulebook to video
node src/api/index.js --input="rules/sushi-go.pdf" --game="Sushi Go"

# With specific voice and language
node src/api/index.js --input="rules/game.pdf" --voice="alloy" --lang="english"
```

### Quality Checks
```bash
# Audio compliance check (EBUR-128)
ffmpeg -i out/preview_with_audio.mp4 -filter_complex ebur128 -f null - 2> audio_report.txt

# Video quality validation
npm run golden:check:sushi             # Check Sushi Go output
npm run golden:check:loveletter        # Check Love Letter output
npm run golden:check                   # Check all games
```

### Manual Override Commands
```bash
# Force regenerate golden artifacts
npm run golden:approve

# Update specific game golden tests
npm run golden:update:sushi
npm run golden:update:loveletter

# Check with custom tolerances
node scripts/check_golden.js --ssim "0.99" --lufs_tol "0.5" --tp_tol "0.5"
```

## 🔧 Infrastructure Commands

### Database Operations
```bash
# Backup before deployment
./scripts/backup-db.sh production

# Migrate database schema
npm run db:migrate:prod
npm run db:migrate:staging

# Restore from backup
./scripts/restore-db.sh production backup_20240101_120000.sql
```

### Service Management
```bash
# Restart services
sudo systemctl restart mobius-api
sudo systemctl restart mobius-worker
sudo systemctl restart nginx

# Check service status
sudo systemctl status mobius-api
sudo systemctl status mobius-worker

# View logs
sudo journalctl -u mobius-api -f
tail -f /var/log/mobius/error.log
```

### Health Checks
```bash
# API health check
curl -f http://localhost:5001/health || echo "API DOWN"

# Database connectivity
npm run db:ping

# FFmpeg availability
ffmpeg -version | head -1

# Python dependencies
python3 -c "import cv2, numpy; print('Video processing OK')"
```

## 🚨 Emergency Procedures

### Complete System Failure
```bash
# 1. Stop all services
sudo systemctl stop mobius-api mobius-worker

# 2. Rollback to last known good state
./scripts/rollback.sh --emergency --version=LAST_KNOWN_GOOD

# 3. Restart services
sudo systemctl start mobius-api mobius-worker

# 4. Verify health
./scripts/health-check.sh --full
```

### Database Corruption
```bash
# 1. Stop API services
sudo systemctl stop mobius-api

# 2. Restore from latest backup
./scripts/restore-db.sh production LATEST

# 3. Restart services
sudo systemctl start mobius-api

# 4. Verify data integrity
npm run db:verify
```

### Disk Space Critical
```bash
# Clean temporary files
rm -rf /tmp/mobius_*
rm -rf out/temp_*

# Clean old artifacts (keep last 5)
find out/ -name "*.mp4" -mtime +7 -delete

# Archive old logs
tar -czf logs_archive_$(date +%Y%m%d).tar.gz /var/log/mobius/
find /var/log/mobius/ -name "*.log" -mtime +30 -delete
```

## 📊 Monitoring & Metrics

### Performance Monitoring
```bash
# Check CPU and memory usage
htop

# Monitor disk I/O
iotop -ao

# Monitor network
nethogs

# Application-specific metrics
curl http://localhost:5001/metrics
```

### Log Analysis
```bash
# Recent errors
grep -i error /var/log/mobius/error.log | tail -20

# API response times
grep "response_time" /var/log/mobius/access.log | tail -50

# Failed video generations
grep "video_generation_failed" /var/log/mobius/application.log
```

## 🔐 Security Checklist

### Pre-Deploy Security
- [ ] All secrets rotated and encrypted
- [ ] API keys updated in secure storage
- [ ] SSL certificates valid and not expiring soon
- [ ] Firewall rules configured correctly
- [ ] Database access restricted to application servers only

### Post-Deploy Verification
- [ ] HTTPS redirects working
- [ ] API rate limiting active
- [ ] No sensitive data in logs
- [ ] File upload restrictions in place
- [ ] CORS headers properly configured

## 📞 Emergency Contacts

```
Production Issues: #ops-alerts Slack channel
Database Issues: DBA on-call rotation
Security Issues: security@company.com
API Issues: backend-team@company.com
```

## 🔗 Quick Links

- [Deployment Dashboard](https://dashboard.company.com/mobius)
- [Error Tracking](https://errors.company.com/mobius)
- [Performance Metrics](https://metrics.company.com/mobius)
- [API Documentation](https://api.company.com/mobius/docs)