# MOBIUS Deploy Operator Quick-Run Cheat Sheet

## 🚀 Emergency Deploy Commands

### Quick Status Check
```bash
# Overall system health
curl -f https://api.mobius.games/health || echo "❌ API DOWN"
ffmpeg -version | head -1 || echo "❌ FFmpeg MISSING"
node --version || echo "❌ Node.js MISSING"

# Database connectivity
npm run db:ping || echo "❌ DB CONNECTION FAILED"

# Check running processes
ps aux | grep -E "(node|ffmpeg)" | grep -v grep
```

### Fast Deploy (Production)
```bash
# 1. Backup current state
cp -r /app/current /app/backups/$(date +%Y%m%d_%H%M%S)

# 2. Deploy new version
cd /app/MOBIUS
git fetch origin
git checkout {{RELEASE_TAG}}
npm ci --production
npm run build --if-present

# 3. Database migrations (if needed)
npm run db:migrate

# 4. Restart services
sudo systemctl restart mobius-api
sudo systemctl restart mobius-worker

# 5. Verify deployment
npm run health:comprehensive
```

### Rollback (Emergency)
```bash
# Stop services
sudo systemctl stop mobius-api mobius-worker

# Restore previous version
BACKUP_DIR=$(ls -1t /app/backups/ | head -1)
rm -rf /app/current
cp -r /app/backups/$BACKUP_DIR /app/current
cd /app/current

# Restart with previous version
npm ci --production
sudo systemctl start mobius-api mobius-worker

# Verify rollback
curl -f https://api.mobius.games/health
```

---

## 📊 Monitoring & Diagnostics

### Performance Check
```bash
# API response time
curl -w "@curl-format.txt" -o /dev/null -s https://api.mobius.games/health

# Memory usage
free -h && docker stats --no-stream

# Disk space
df -h | grep -E "(app|tmp|var)"

# Active connections
netstat -an | grep :5001 | wc -l
```

### Log Analysis
```bash
# Recent errors (last 100 lines)
tail -100 /var/log/mobius/error.log | grep -i error

# API access logs
tail -50 /var/log/mobius/access.log

# FFmpeg processing logs
journalctl -u mobius-worker -n 50

# System logs
dmesg | tail -20
```

### Video Pipeline Debug
```bash
# Test video processing
curl -X POST https://api.mobius.games/api/test-render \
  -H "Content-Type: application/json" \
  -d '{"game": "test", "quick": true}'

# Check processing queue
curl https://api.mobius.games/api/queue/status

# Verify golden baselines
npm run golden:check || echo "❌ Golden tests failing"

# Audio compliance test
ffmpeg -f lavfi -i "sine=frequency=1000:duration=5" test.mp4
npm run audio:check test.mp4
```

---

## 🔧 Configuration Files

### Key Paths
```
/app/MOBIUS/                 # Main application
├── .env                     # Environment variables
├── package.json             # Dependencies & scripts
├── src/api/index.js         # Main API server
├── scripts/                 # Utility scripts
└── tests/golden/            # Test baselines

/var/log/mobius/             # Application logs
├── access.log               # API requests
├── error.log                # Error messages
└── worker.log               # Background jobs

/etc/systemd/system/         # Service files
├── mobius-api.service       # API server service
└── mobius-worker.service    # Background worker
```

### Environment Variables (Critical)
```bash
# Check all required env vars
grep -v '^#' .env | grep -v '^$' | sort

# Essential variables
echo "PORT: ${PORT:-5001}"
echo "NODE_ENV: ${NODE_ENV:-development}"
echo "OPENAI_API_KEY: ${OPENAI_API_KEY:+SET}"
echo "DATABASE_URL: ${DATABASE_URL:+SET}"
echo "OUTPUT_DIR: ${OUTPUT_DIR}"
```

---

## 🚨 Troubleshooting

### Common Issues

**API Not Responding**
```bash
# Check if port is bound
lsof -i :5001
# Restart if needed
sudo systemctl restart mobius-api
```

**FFmpeg Errors**
```bash
# Verify installation
which ffmpeg && which ffprobe
# Check permissions
ls -la /tmp/ | grep mobius
# Clear temp files
rm -rf /tmp/mobius-*
```

**High Memory Usage**
```bash
# Find memory hogs
ps aux --sort=-%mem | head -10
# Clear node modules cache
npm cache clean --force
# Restart worker processes
sudo systemctl restart mobius-worker
```

**Database Connection Issues**
```bash
# Test connection
npm run db:test-connection
# Check migrations
npm run db:migrations:status
# Reset if corrupted (DANGER!)
# npm run db:reset (ONLY IN EMERGENCY)
```

### Service Management
```bash
# Service status
sudo systemctl status mobius-api mobius-worker

# View service logs
sudo journalctl -u mobius-api -f
sudo journalctl -u mobius-worker -f

# Restart all services
sudo systemctl restart mobius-api mobius-worker

# Enable auto-restart
sudo systemctl enable mobius-api mobius-worker
```

---

## 📞 Emergency Contacts

- **On-call Engineer**: {{ON_CALL_PHONE}}
- **DevOps Lead**: {{DEVOPS_LEAD_PHONE}}  
- **Incident Slack**: #mobius-incidents
- **Status Page**: https://status.mobius.games

### Escalation Path
1. **Level 1**: Restart services, check logs
2. **Level 2**: Rollback deployment
3. **Level 3**: Contact on-call engineer
4. **Level 4**: Escalate to DevOps lead

---

**Last Updated**: {{TIMESTAMP}} | **Version**: {{CHEAT_SHEET_VERSION}}