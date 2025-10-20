# Batch 2 Execution Plan

## Overview
This document outlines the execution plan for Batch 2 validation of the Mobius Tutorial Generator, covering Sections C & D (Rulebook ingestion + Visual assets).

## Objectives
1. Validate rulebook ingestion functionality through the API
2. Test PDF processing and component extraction
3. Verify visual asset workflows including uploads and auto-crop
4. Confirm theme application and layout persistence

## Prerequisites
- ✅ Backend server running on port 5001
- ✅ Frontend server running on port 3000
- ✅ BGG endpoint accessible at `/api/bgg`
- ✅ API validation harness available at [validation/tools/api-validation-harness.js](../tools/api-validation-harness.js)
- ✅ All required API keys present

## Test Scenarios

### Section C: Rulebook Ingestion
1. **C-01**: Upload PDF rulebook via API
   - Use API validation harness to call `/api/ingest` endpoint
   - Verify successful upload and processing
   - Check database for stored components

2. **C-02**: Extract table of contents
   - Verify TOC extraction from processed PDF
   - Confirm structure in database

3. **C-03**: Identify game components
   - Validate component identification algorithms
   - Check component metadata accuracy

4. **C-04**: Extract visual assets
   - Confirm image extraction from PDF
   - Verify asset storage and metadata

5. **C-05**: Process complex layouts
   - Test with multi-column layouts
   - Verify text flow and formatting preservation

### Section D: Visual Assets
1. **D-01**: Upload image assets via API
   - Use API validation harness to call asset upload endpoint
   - Verify successful upload and storage

2. **D-02**: Auto-crop functionality
   - Test auto-crop algorithms on various image types
   - Verify crop accuracy and quality

3. **D-03**: Theme application
   - Apply different themes to projects
   - Verify theme persistence and visual consistency

4. **D-04**: Layout customization
   - Test layout modification APIs
   - Confirm layout persistence

5. **D-05**: Asset organization
   - Verify asset categorization and tagging
   - Test asset search and filtering

## Tools and Resources
- API Validation Harness: [validation/tools/api-validation-harness.js](../tools/api-validation-harness.js)
- Test PDFs: Sample rulebooks in [data/test-samples/](../../data/test-samples/) (if available)
- Database: [data/projects.db](../../data/projects.db)
- Evidence Directory: [validation/batch2/](./)

## Execution Steps

### Phase 1: Setup (15 minutes)
1. Verify all prerequisites are met
2. Prepare test data (sample PDFs, images)
3. Review API validation harness functions
4. Set up evidence capture directories

### Phase 2: Section C Testing (45 minutes)
1. Execute C-01 through C-05 test scenarios
2. Capture API responses and database snapshots
3. Document any issues or anomalies
4. Verify component extraction accuracy

### Phase 3: Section D Testing (45 minutes)
1. Execute D-01 through D-05 test scenarios
2. Capture cropped image outputs and layout data
3. Test theme application across different asset types
4. Verify persistence of visual customizations

### Phase 4: Analysis and Reporting (15 minutes)
1. Compile test results and evidence
2. Identify any failed test cases
3. Document issues in new issue reports if needed
4. Update validation execution tracker

## Evidence Collection
- API responses saved as JSON files in [validation/batch2/logs/](logs/)
- Database snapshots in [validation/batch2/db/](db/) (if applicable)
- Cropped image outputs in [validation/batch2/assets/](assets/) (if applicable)
- Test execution logs in [validation/batch2/logs/](logs/)

## Success Criteria
- All Section C checklist items pass validation
- All Section D checklist items pass validation
- No critical or high-severity issues identified
- All evidence properly captured and documented

## Risk Mitigation
- If API endpoints are inaccessible, verify server status and routing
- If database operations fail, check database connectivity and schema
- If image processing fails, verify external service availability
- If test data is insufficient, generate additional sample data

## Team Roles
- **Lead Validator**: Execute test scenarios and document results
- **Backend Validator**: Monitor server logs and database operations
- **QA Engineer**: Verify test coverage and evidence completeness

## Timeline
- **Start Time**: 2025-10-20 16:30
- **Expected End Time**: 2025-10-20 18:00
- **Total Duration**: 1.5 hours

## Approval
This plan has been reviewed and approved for execution.