# Preview Worker Rollout Plan

## Pre-Deployment Checklist
- [ ] Redis server is installed and running
- [ ] Redis connection settings are configured in environment variables
- [ ] Data directory permissions are set correctly
- [ ] Monitoring and alerting systems are configured
- [ ] CI/CD pipeline is updated with worker tests
- [ ] Documentation is updated with worker usage instructions

## Deployment Steps

### 1. Staging Environment
1. Deploy worker service to staging environment
2. Configure environment variables:
   - `REDIS_URL` - Redis connection string
   - `PREVIEW_QUEUE_NAME` - Name of the preview job queue
   - `PREVIEW_WORKER_CONCURRENCY` - Number of concurrent jobs (default: 2)
   - `DATA_DIR` - Directory for storing preview artifacts
3. Start the worker service
4. Verify service is running and connected to Redis
5. Test job submission and processing through API
6. Monitor metrics and logs for errors

### 2. Production Environment
1. Deploy worker service to production environment
2. Configure environment variables (same as staging)
3. Start the worker service
4. Monitor for successful job processing
5. Verify metrics collection is working
6. Set up alerts for failure conditions

## Monitoring & Alerting

### Key Metrics to Monitor
1. **Job Processing Rate**: Track how many jobs are processed per minute
2. **Job Success Rate**: Percentage of jobs that complete successfully
3. **Job Failure Rate**: Percentage of jobs that fail
4. **Average Job Processing Time**: Time taken to process jobs
5. **Queue Depth**: Number of jobs waiting in the queue
6. **Worker Health**: Status of the worker service

### Alerting Rules
1. **High Failure Rate**: Alert when job failure rate exceeds 5% for 5 minutes
2. **Queue Backlog**: Alert when queue depth exceeds 100 jobs for 10 minutes
3. **Worker Down**: Alert when worker service is not reporting health checks
4. **High Processing Time**: Alert when average job processing time exceeds 60 seconds
5. **Redis Connectivity**: Alert when worker cannot connect to Redis

### Monitoring Endpoints
- `/api/preview/worker/health` - Health check endpoint
- `/api/preview/queue/metrics` - Queue metrics endpoint
- `/metrics` - Prometheus metrics endpoint (if configured)

## Rollback Procedure
1. If issues are detected, stop the worker service immediately
2. Review logs and metrics to identify the cause
3. If necessary, rollback to the previous version
4. Notify team of the issue and resolution plan
5. Investigate and fix the root cause
6. Re-deploy the fixed version after verification

## Post-Deployment Verification
- [ ] Worker service is running and processing jobs
- [ ] Jobs are completing successfully
- [ ] Metrics are being collected and reported
- [ ] Monitoring and alerting systems are working
- [ ] Logs are being written and rotated properly
- [ ] Performance is within expected parameters