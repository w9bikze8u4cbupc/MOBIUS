# Mobius Tutorial Generator - Validation Team Instructions

## Overview
This document provides step-by-step instructions for the validation team to execute the Local End-to-End Validation Phase of the Mobius Tutorial Generator.

## Pre-Validation Setup

### 1. Environment Preparation
Before starting validation, ensure the following:

1. ✅ Backend server is running on port 5001
   ```bash
   npm run server
   ```

2. ✅ Frontend server is running on port 3000
   ```bash
   npm run ui
   ```

3. ✅ Verify health endpoint is accessible
   ```bash
   curl http://localhost:5001/health
   ```

4. ✅ Confirm all required API keys are present in `.env` file

### 2. Directory Structure
Familiarize yourself with the validation directory structure:
```
validation/
├── Mobius_Tutorial_Generator_Simple_End_to_End_Checklist.md
├── Local_End_to_End_Validation_Plan.md
├── validation_execution_tracker.md
├── issue_template.md
├── batch1/          # Evidence for Sections A & B
├── batch2/          # Evidence for Sections C & D
├── batch3/          # Evidence for Sections E & F
├── batch4/          # Evidence for Sections G & H
└── batch5/          # Evidence for Sections I-K
```

## Validation Execution Process

### Step 1: Review the Checklist
1. Open `validation/Mobius_Tutorial_Generator_Simple_End_to_End_Checklist.md`
2. Review all 130 checklist items across Sections A-K
3. Understand the evidence requirements for each item

### Step 2: Execute Batch 1 (Sections A & B)
1. Focus on Project Setup (Section A) and BGG Metadata Integration (Section B)
2. For each checklist item:
   - Execute the required action
   - Record Pass/Fail status
   - Capture evidence in `validation/batch1/`
   - Use standardized naming: `ITEM-ID_description.ext` (e.g., `B-12_box_art.png`)

### Step 3: Document Results
1. Update `validation/validation_execution_tracker.md`
2. Record execution start/end times
3. Log any issues encountered using `validation/issue_template.md`
4. Link to evidence files in the execution tracker

### Step 4: Proceed Through All Batches
Follow the same process for:
- Batch 2: Sections C & D (Rulebook ingestion + Visual assets)
- Batch 3: Sections E & F (Narration/audio + Subtitles)
- Batch 4: Sections G & H (Rendering + Quality checks)
- Batch 5: Sections I-K (Packaging, CI hooks, delivery)

## Evidence Collection Guidelines

### File Naming Convention
Use the format: `ITEM-ID_description.extension`
Examples:
- `B-12_box_art.png` (Screenshot)
- `C-08_parser.log` (Log file)
- `D-08_paths.txt` (Text file)
- `F-08_export.srt` (SRT file)

### Evidence Types
1. **Screenshots** - For UI validation items
2. **Log Files** - For backend process validation
3. **Text Files** - For path verification, configuration, etc.
4. **SRT Files** - For subtitle export validation
5. **Video Files** - For rendering output validation (when applicable)

### Storage Locations
- Batch 1 evidence: `validation/batch1/`
- Batch 2 evidence: `validation/batch2/`
- Batch 3 evidence: `validation/batch3/`
- Batch 4 evidence: `validation/batch4/`
- Batch 5 evidence: `validation/batch5/`

## Issue Logging Process

### When to Log an Issue
- Any checklist item that fails
- Unexpected behavior or errors
- Performance issues
- Missing functionality

### How to Log an Issue
1. Copy `validation/issue_template.md` to a new file in the same directory
2. Name it with the pattern: `ISSUE-XXX.md` (where XXX is a sequential number)
3. Fill in all required fields
4. Link to the issue from the validation execution tracker

### Required Issue Information
- Issue ID and related checklist item
- Clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Environment details
- Evidence (screenshots, logs, etc.)
- Root cause analysis (initial hypothesis)
- Remediation plan

## Cross-Platform Validation

### Required Platforms
- Windows
- macOS
- Linux

### Validation Requirements
- Repeat critical flows (ingest, render, playback) on all platforms
- Document any platform-specific differences
- Ensure consistent behavior across platforms
- Test environment setup on each platform

## Validation Completion Criteria

### Per-Item Criteria
- [ ] Each checklist item executed
- [ ] Pass/Fail status recorded
- [ ] Evidence captured where required
- [ ] Issues logged for failures

### Per-Batch Criteria
- [ ] All items in the batch executed
- [ ] Evidence files stored in correct directory
- [ ] Execution tracker updated
- [ ] Issues documented

### Overall Criteria
- [ ] All 130 checklist items executed
- [ ] All evidence collected
- [ ] All issues resolved or documented with waivers
- [ ] Final validation report generated
- [ ] System approved for staging promotion

## Useful Commands

### Start Backend Server
```bash
npm run server
```

### Start Frontend Server
```bash
npm run ui
```

### Check Health Status
```bash
curl http://localhost:5001/health
```

### Check Metrics
```bash
curl http://localhost:5001/health/metrics
```

### Run Basic Functionality Test
```bash
node validation/basic_functionality_test.js
```

### Verify Environment (Windows)
```powershell
.\validation\verify_environment.ps1
```

### Verify Environment (macOS/Linux)
```bash
node validation/verify_environment.js
```

## Communication and Reporting

### Daily Status Updates
- Update the validation execution tracker daily
- Report blockers immediately
- Share progress with the team

### Issue Escalation
- Critical issues: Report immediately
- High priority issues: Report within 2 hours
- Medium priority issues: Report daily
- Low priority issues: Report weekly

### Final Reporting
Upon completion of all validation batches:
1. Generate comprehensive validation report
2. Summarize pass/fail status for all items
3. Document any issues and their resolutions
4. Provide recommendation for staging promotion
5. Archive all evidence files

## Support and Resources

### Documentation
- Main checklist: `validation/Mobius_Tutorial_Generator_Simple_End_to_End_Checklist.md`
- Validation plan: `validation/Local_End_to_End_Validation_Plan.md`
- Execution tracker: `validation/validation_execution_tracker.md`

### Team Contacts
- Lead Validator: [To be assigned]
- Backend Specialist: [To be assigned]
- Frontend Specialist: [To be assigned]
- DevOps Specialist: [To be assigned]

### Emergency Procedures
- If servers become unresponsive, restart them
- If data corruption occurs, restore from backups
- If critical issues block progress, escalate immediately