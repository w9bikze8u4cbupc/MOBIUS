# Preview Worker Troubleshooting Guide

This guide helps diagnose and resolve common issues encountered during Preview Worker deployment and operation.

## 🚨 Pre-Deployment Issues

### 1. Image Tag Replacement Problems

**Problem**: sed/grep commands not found
**Solution**: 
- Install GNU sed: `brew install gnu-sed` (macOS) or `apt-get install sed` (Ubuntu)
- Use Perl alternative: `perl -pi -e "s|old|new|g" file`
- Use the provided cross-platform scripts

**Problem**: Incorrect image tag format
**Solution**:
- Ensure format is `registry/organization/image:tag`
- Verify registry is accessible
- Check image exists in registry

### 2. Test Suite Failures

**Problem**: npm ci fails
**Solution**:
- Check Node.js version (should be 18.x or 20.x)
- Verify package-lock.json consistency
- Clear npm cache: `npm cache clean --force`

**Problem**: Payload validation tests fail
**Solution**:
- Check preview_payload_*.json files for correct structure
- Verify validatePreviewPayload.js logic
- Ensure all required fields are present

**Problem**: Unit tests fail
**Solution**:
- Run individual failing tests to identify specific issues
- Check for missing dependencies
- Verify test environment variables

### 3. Manifest Validation Errors

**Problem**: kubectl apply --dry-run fails
**Solution**:
- Check YAML syntax (indentation, colons, quotes)
- Verify all required fields are present
- Ensure Kubernetes API versions are correct

## 🚨 Deployment Issues

### 1. Pod Creation Failures

**Problem**: Pods stuck in Pending state
**Diagnostic Commands**:
```bash
kubectl -n preview-worker describe pods
kubectl -n preview-worker get events
```
**Solutions**:
- Check resource quotas
- Verify node affinity/anti-affinity rules
- Ensure sufficient cluster resources

**Problem**: Pods stuck in CrashLoopBackOff
**Diagnostic Commands**:
```bash
kubectl -n preview-worker logs -l app=preview-worker --previous
kubectl -n preview-worker describe pods
```
**Solutions**:
- Check application logs for errors
- Verify environment variables
- Ensure ConfigMap and Secret references are correct

### 2. Image Pull Errors

**Problem**: ErrImagePull or ImagePullBackOff
**Diagnostic Commands**:
```bash
kubectl -n preview-worker describe pods
kubectl -n preview-worker get events
```
**Solutions**:
- Verify image tag is correct
- Check registry authentication
- Ensure image exists in registry
- Verify node has network access to registry

### 3. Health Check Failures

**Problem**: Readiness probe failing
**Diagnostic Commands**:
```bash
kubectl -n preview-worker logs -l app=preview-worker
kubectl -n preview-worker describe pods
curl http://localhost:3000/api/preview/worker/health
```
**Solutions**:
- Check application logs for startup errors
- Verify Redis connectivity
- Ensure correct port is exposed
- Check health endpoint implementation

## 🚨 Runtime Issues

### 1. Job Processing Problems

**Problem**: Jobs not being processed
**Diagnostic Commands**:
```bash
kubectl -n preview-worker logs -l app=preview-worker
kubectl -n preview-worker exec -it <pod-name> -- redis-cli -h <redis-host> llen preview-jobs
```
**Solutions**:
- Check Redis connectivity
- Verify queue name matches between worker and client
- Ensure worker has correct concurrency settings

**Problem**: High job failure rate
**Diagnostic Commands**:
```bash
kubectl -n preview-worker logs -l app=preview-worker
curl http://localhost:3000/metrics | grep preview_job_failed
```
**Solutions**:
- Check application logs for error details
- Verify input payload validity
- Ensure sufficient resources (CPU, memory)

### 2. Performance Issues

**Problem**: Slow job processing
**Diagnostic Commands**:
```bash
kubectl -n preview-worker top pods
curl http://localhost:3000/metrics | grep preview_job_duration
```
**Solutions**:
- Increase worker concurrency
- Scale up replica count
- Optimize resource requests/limits
- Check Redis performance

### 3. Resource Constraints

**Problem**: OOMKilled pods
**Diagnostic Commands**:
```bash
kubectl -n preview-worker describe pods
kubectl -n preview-worker top pods
```
**Solutions**:
- Increase memory limits
- Optimize application memory usage
- Scale out rather than up

## 🚨 Monitoring and Observability Issues

### 1. Metrics Not Appearing

**Problem**: Prometheus not scraping metrics
**Diagnostic Commands**:
```bash
kubectl -n preview-worker get servicemonitor
kubectl -n preview-worker port-forward svc/preview-worker 3000:3000
curl http://localhost:3000/metrics
```
**Solutions**:
- Verify ServiceMonitor configuration
- Check Prometheus Operator installation
- Ensure correct port and path in ServiceMonitor

### 2. Alerting Problems

**Problem**: Alerts not firing
**Diagnostic Commands**:
```bash
kubectl -n preview-worker get prometheusrule
curl http://localhost:3000/metrics | grep alert_metric
```
**Solutions**:
- Verify alert rule syntax
- Check Prometheus rule evaluation
- Ensure alert thresholds are appropriate

## 🚨 CI/CD Issues

### 1. GitHub Actions Failures

**Problem**: Build step failing
**Solutions**:
- Check Dockerfile syntax
- Verify build context
- Ensure all dependencies are specified

**Problem**: Push step failing
**Solutions**:
- Verify registry credentials
- Check image name format
- Ensure sufficient permissions

### 2. PR Creation Issues

**Problem**: gh pr create fails
**Solutions**:
- Verify gh CLI installation: `gh --version`
- Check authentication: `gh auth status`
- Use web UI as alternative

## 🛠️ Useful Diagnostic Commands

### General Kubernetes Diagnostics
```bash
# Check all resources
kubectl -n preview-worker get all

# Check pod logs
kubectl -n preview-worker logs -l app=preview-worker --follow

# Check pod details
kubectl -n preview-worker describe pods

# Check events
kubectl -n preview-worker get events --sort-by=.metadata.creationTimestamp

# Port forward for direct access
kubectl -n preview-worker port-forward svc/preview-worker 3000:3000
```

### Application Diagnostics
```bash
# Check health endpoint
curl http://localhost:3000/api/preview/worker/health

# Check metrics
curl http://localhost:3000/metrics

# Check specific metrics
curl http://localhost:3000/metrics | grep preview_job
```

### Resource Monitoring
```bash
# Check pod resource usage
kubectl -n preview-worker top pods

# Check node resource usage
kubectl top nodes

# Check resource quotas
kubectl -n preview-worker describe resourcequota
```

## 📞 Getting Additional Help

If you encounter issues not covered in this guide:

1. **Check logs thoroughly**: Most issues are evident in the application logs
2. **Verify configuration**: Ensure all environment variables and config files are correct
3. **Test connectivity**: Verify network access between components
4. **Check versions**: Ensure compatible versions of all dependencies
5. **Consult documentation**: Review Kubernetes and application documentation

For persistent issues, provide:
- Error messages from logs
- Output of diagnostic commands
- Steps to reproduce the issue
- Environment details (Kubernetes version, OS, etc.)