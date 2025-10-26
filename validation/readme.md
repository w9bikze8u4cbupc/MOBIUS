# Mobius Tutorial Generator - Validation Directory

## Overview
This directory contains all artifacts related to the Local End-to-End Validation Phase of the Mobius Tutorial Generator. The validation process is designed to verify that all components of the system are functioning correctly before promotion to staging.

## Directory Structure
- `Mobius_Tutorial_Generator_Simple_End_to_End_Checklist.md` - The main validation checklist with all items to be verified
- `Local_End_to_End_Validation_Plan.md` - The detailed validation plan following the directive
- `validation_execution_tracker.md` - Tracks the execution progress of the validation
- `issue_template.md` - Template for logging validation issues
- `verify_environment.js` - JavaScript script to verify the environment setup
- `verify_environment.ps1` - PowerShell script to verify the environment setup
- `batch1/` - Evidence directory for Batch 1 validation (Sections A & B)
- `batch2/` - Evidence directory for Batch 2 validation (Sections C & D)
- `batch3/` - Evidence directory for Batch 3 validation (Sections E & F)
- `batch4/` - Evidence directory for Batch 4 validation (Sections G & H)
- `batch5/` - Evidence directory for Batch 5 validation (Sections I-K)

## Validation Process
1. Execute the environment verification scripts to ensure the system is ready
2. Follow the validation plan in sequence through Batches 1-5
3. For each checklist item, record pass/fail status with evidence
4. Log any issues using the issue template
5. Update the execution tracker as progress is made
6. Generate a final validation report upon completion

## Evidence Collection
All evidence should be stored in the appropriate batch directory with standardized naming:
- Screenshots: `ITEM-ID_description.png` (e.g., `B-12_box_art.png`)
- Log files: `ITEM-ID_description.log` (e.g., `C-08_parser.log`)
- Text files: `ITEM-ID_description.txt` (e.g., `D-08_paths.txt`)
- SRT files: `ITEM-ID_description.srt` (e.g., `F-08_export.srt`)

## Cross-Platform Validation
Critical flows (ingest, render, playback) must be tested on:
- Windows
- macOS
- Linux

Document any platform-specific differences in the execution tracker.

## Completion Criteria
Validation is considered complete when:
1. All checklist items have been executed
2. All issues have been resolved or documented with waivers
3. A final validation report has been generated
4. The system is approved for staging promotion