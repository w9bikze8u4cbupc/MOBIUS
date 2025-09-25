# MOBIUS dhash Release Notes Templates

## Short Release Notes Template

```markdown
# Release {{ RELEASE_TAG }}

**Released:** {{ RELEASE_DATE }}  
**Deploy Lead:** {{ DEPLOY_LEAD }}  
**Environment:** Production

## 🚀 What's New

{{ NEW_FEATURES }}

## 🔧 Improvements

{{ IMPROVEMENTS }}

## 🐛 Bug Fixes

{{ BUG_FIXES }}

## 🛡️ Security Updates

{{ SECURITY_UPDATES }}

## 📊 Deployment

- **Status:** ✅ Successful
- **Duration:** {{ DEPLOY_DURATION }}
- **Rollback Available:** ✅ Backup created
- **Monitoring:** {{ MONITORING_STATUS }}

## 🔗 Links

- **[Deployment Guide](./DEPLOYMENT_CHEAT_SHEET.md)**
- **[Full Changelog](#extended-changelog)**
```

---

## Extended Release Notes Template  

```markdown
# MOBIUS dhash Release {{ RELEASE_TAG }} - Complete Changelog

**Release Information**
- **Version:** {{ RELEASE_TAG }}
- **Release Date:** {{ RELEASE_DATE }}
- **Deploy Lead:** {{ DEPLOY_LEAD }}
- **Environment:** Production
- **Previous Version:** {{ PREVIOUS_RELEASE_TAG }}

---

## 🎯 Release Summary

{{ RELEASE_SUMMARY }}

### Key Highlights
{{ KEY_HIGHLIGHTS }}

---

## 📋 Detailed Changes

### 🚀 New Features
{{ NEW_FEATURES_DETAILED }}

### 🔧 Improvements  
{{ IMPROVEMENTS_DETAILED }}

### 🐛 Bug Fixes
{{ BUG_FIXES_DETAILED }}

### 🛡️ Security Updates
{{ SECURITY_UPDATES_DETAILED }}

### 📚 Documentation Updates
{{ DOCUMENTATION_UPDATES }}

### 🧪 Testing Enhancements
{{ TESTING_ENHANCEMENTS }}

---

## 🔄 Deployment Information

### Pre-Deployment Validation
- **CI/CD Status:** ✅ Passed on all platforms (Ubuntu, macOS, Windows)
- **Quality Gates:** ✅ All thresholds met
- **Security Scan:** ✅ No vulnerabilities detected
- **Golden Tests:** ✅ All video generation tests passed
- **Backup Created:** ✅ `{{ BACKUP_FILE }}`

### Deployment Execution
- **Start Time:** {{ DEPLOY_START_TIME }}
- **Completion Time:** {{ DEPLOY_END_TIME }}  
- **Duration:** {{ DEPLOY_DURATION }}
- **Status:** ✅ Successful
- **Rollback Plan:** ✅ Tested and ready
- **Deploy Operator:** {{ DEPLOY_LEAD }}

### Post-Deployment Monitoring
- **Monitoring Duration:** {{ MONITORING_DURATION }}
- **Health Checks:** ✅ All passing
- **Performance Metrics:** ✅ Within thresholds
- **Error Rate:** {{ ERROR_RATE }}% (threshold: 5%)
- **Response Time P95:** {{ RESPONSE_TIME_P95 }}ms (threshold: 2000ms)
- **Alerts:** {{ ALERT_COUNT }} ({{ CRITICAL_ALERT_COUNT }} critical)

---

## 🧪 Quality Assurance

### Testing Coverage
- **Unit Tests:** {{ UNIT_TEST_COUNT }} tests, {{ UNIT_TEST_COVERAGE }}% coverage
- **Integration Tests:** {{ INTEGRATION_TEST_COUNT }} tests
- **Golden Tests:** {{ GOLDEN_TEST_COUNT }} video generation tests
- **Platform Testing:** Ubuntu, macOS, Windows
- **Performance Testing:** ✅ Load testing completed

### Quality Gates Validation
- **Build Success Rate:** {{ BUILD_SUCCESS_RATE }}%
- **Test Pass Rate:** {{ TEST_PASS_RATE }}%
- **Code Quality Score:** {{ CODE_QUALITY_SCORE }}/10
- **Security Score:** ✅ No critical or high vulnerabilities
- **Dependencies:** {{ DEPENDENCY_COUNT }} dependencies, {{ VULNERABLE_DEPS }} vulnerable

---

## 🚨 Breaking Changes

{{ BREAKING_CHANGES }}

### Migration Guide
{{ MIGRATION_GUIDE }}

---

## 🔧 Technical Details

### System Requirements
- **Node.js:** {{ NODE_VERSION }}+
- **FFmpeg:** {{ FFMPEG_VERSION }}+
- **Python:** {{ PYTHON_VERSION }}+
- **Memory:** {{ MIN_MEMORY_GB }}GB minimum
- **Disk Space:** {{ MIN_DISK_GB }}GB minimum

### Performance Improvements
{{ PERFORMANCE_IMPROVEMENTS }}

### Infrastructure Changes
{{ INFRASTRUCTURE_CHANGES }}

---

## 📊 Metrics & Analytics

### Deployment Metrics
- **Build Time:** {{ BUILD_TIME }}
- **Test Execution Time:** {{ TEST_TIME }}
- **Deployment Time:** {{ DEPLOY_TIME }}
- **Artifact Size:** {{ ARTIFACT_SIZE }}

### Runtime Metrics
- **Startup Time:** {{ STARTUP_TIME }}
- **Memory Usage:** {{ MEMORY_USAGE }}MB average
- **CPU Usage:** {{ CPU_USAGE }}% average
- **Throughput:** {{ THROUGHPUT }} requests/second

---

## 🤝 Contributors

{{ CONTRIBUTORS_LIST }}

### Special Thanks
{{ SPECIAL_THANKS }}

---

## 🔗 Resources & Documentation

### Documentation
- **[Deployment Cheat Sheet](./DEPLOYMENT_CHEAT_SHEET.md)**
- **[Operations Guide](./DEPLOYMENT_OPERATIONS_GUIDE.md)**
- **[Notification Templates](./NOTIFICATION_TEMPLATES.md)**
- **[Quality Gates Config](./quality-gates-config.json)**

### Links
- **[GitHub Repository](https://github.com/w9bikze8u4cbupc/MOBIUS)**
- **[Deployment Dashboard]({{ DASHBOARD_URL }})**
- **[Monitoring]({{ MONITORING_URL }})**
- **[Issue Tracker](https://github.com/w9bikze8u4cbupc/MOBIUS/issues)**

### Support
- **Slack:** #mobius-support
- **Email:** support@mobius.example.com
- **Emergency:** {{ EMERGENCY_CONTACT }}

---

## 📅 Upcoming Releases

### Next Release ({{ NEXT_RELEASE_TAG }})
- **Planned Features:** {{ PLANNED_FEATURES }}
- **Target Date:** {{ NEXT_RELEASE_DATE }}
- **Status:** {{ NEXT_RELEASE_STATUS }}

---

**Full diff:** [{{ PREVIOUS_RELEASE_TAG }}...{{ RELEASE_TAG }}](https://github.com/w9bikze8u4cbupc/MOBIUS/compare/{{ PREVIOUS_RELEASE_TAG }}...{{ RELEASE_TAG }})

---

*Release notes generated automatically by MOBIUS deployment system*  
*Last updated: {{ GENERATION_TIMESTAMP }}*
```

---

## Variable Reference

### Standard Variables
- `{{ RELEASE_TAG }}` - Release version (e.g., v1.2.3)
- `{{ RELEASE_DATE }}` - Release date (YYYY-MM-DD)  
- `{{ DEPLOY_LEAD }}` - Deploy lead/operator
- `{{ PREVIOUS_RELEASE_TAG }}` - Previous version tag

### Deployment Variables
- `{{ DEPLOY_START_TIME }}` - Deployment start timestamp
- `{{ DEPLOY_END_TIME }}` - Deployment completion timestamp
- `{{ DEPLOY_DURATION }}` - Total deployment time
- `{{ BACKUP_FILE }}` - Backup file path
- `{{ DEPLOY_LEAD }}` - Deploy operator name

### Content Variables  
- `{{ NEW_FEATURES }}` - List of new features
- `{{ IMPROVEMENTS }}` - List of improvements
- `{{ BUG_FIXES }}` - List of bug fixes
- `{{ SECURITY_UPDATES }}` - Security-related changes
- `{{ BREAKING_CHANGES }}` - Breaking changes description

### Metrics Variables
- `{{ ERROR_RATE }}` - Current error rate percentage
- `{{ RESPONSE_TIME_P95 }}` - 95th percentile response time
- `{{ MONITORING_DURATION }}` - Post-deployment monitoring time
- `{{ ALERT_COUNT }}` - Number of alerts during monitoring
- `{{ BUILD_SUCCESS_RATE }}` - CI build success percentage

### Technical Variables
- `{{ NODE_VERSION }}` - Required Node.js version
- `{{ FFMPEG_VERSION }}` - Required FFmpeg version  
- `{{ UNIT_TEST_COUNT }}` - Number of unit tests
- `{{ UNIT_TEST_COVERAGE }}` - Test coverage percentage

## Usage Examples

### Generate Short Release Notes
```bash
# Using environment variables
export RELEASE_TAG="v1.2.3"
export RELEASE_DATE="2024-01-01"
export DEPLOY_LEAD="@ops"

# Process template (example with sed)
sed "s/{{ RELEASE_TAG }}/$RELEASE_TAG/g" release-notes-short.md
```

### Generate from Git Log
```bash
# Get features from commits
git log --oneline --grep="feat:" v1.2.2..v1.2.3

# Get bug fixes from commits  
git log --oneline --grep="fix:" v1.2.2..v1.2.3

# Get all changes
git log --oneline v1.2.2..v1.2.3
```

### Integration with Deployment Script
```bash
# In deploy_dhash.sh, generate release notes
if [[ -f "release-notes-template.md" ]]; then
    sed -e "s/{{ RELEASE_TAG }}/$TAG/g" \
        -e "s/{{ DEPLOY_LEAD }}/$DEPLOY_LEAD/g" \
        -e "s/{{ RELEASE_DATE }}/$(date +%Y-%m-%d)/g" \
        release-notes-template.md > "release-notes-$TAG.md"
fi
```