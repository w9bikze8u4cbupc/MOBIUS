# Mobius Tutorial Generator — Simple End-to-End Checklist

## Overview
This checklist provides a structured approach to validate the Mobius Tutorial Generator across all critical workflows. Each section corresponds to a specific functional area that must be verified during the Local End-to-End Validation Phase.

## Section A: Project Setup
- [ ] A-01: Create new project in UI
- [ ] A-02: Verify project initialization in database
- [ ] A-03: Confirm project directory structure creation
- [ ] A-04: Validate project metadata persistence

## Section B: BGG Metadata Integration
- [⚠️] B-01: Enter valid BGG ID/URL in UI (API endpoint not accessible)
- [✅] B-02: Fetch BGG metadata successfully (Module level test successful)
- [ ] B-03: Display metadata in UI (title, description, year, min/max players)
- [ ] B-04: Store metadata in project database
- [ ] B-05: Save box art to assets directory
- [ ] B-06: Display box art in UI
- [ ] B-07: Handle invalid BGG ID gracefully
- [ ] B-08: Cache BGG metadata for subsequent requests
- [ ] B-09: Verify BGG rate limiting implementation
- [ ] B-10: Test BGG metadata update functionality
- [ ] B-11: Validate BGG metadata fallback when offline
- [ ] B-12: Confirm box art saved in assets directory (e.g., validation/B-12_box_art.png)

## Section C: Rulebook Ingestion
- [✅] C-01: Upload valid PDF rulebook via UI (API tested successfully)
- [✅] C-02: Process PDF through ingestion pipeline (API tested successfully)
- [✅] C-03: Extract text content from PDF (API tested successfully)
- [ ] C-04: Parse chapters/sections from PDF structure
- [ ] C-05: Identify game components and rules
- [ ] C-06: Generate initial storyboard structure
- [✅] C-07: Store ingestion results in database (API tested successfully)
- [ ] C-08: Extract images from PDF (log evidence in validation/C-08_parser.txt)
- [ ] C-09: Save extracted images to project directory (log evidence in validation/C-09_images.txt)
- [ ] C-10: Handle password-protected PDFs gracefully
- [ ] C-11: Handle corrupted PDFs gracefully
- [ ] C-12: Validate file size limits enforcement

## Section D: Visual Assets
- [ ] D-01: Manually add component images via UI
- [ ] D-02: Associate images with game components
- [ ] D-03: Drag and drop images to components
- [ ] D-04: Validate image format support (JPG, PNG, GIF)
- [ ] D-05: Resize/reformat oversized images
- [ ] D-06: Store image-component associations
- [ ] D-07: Confirm image persistence after UI refresh (e.g., validation/D-07_persistence.png)
- [ ] D-08: Verify image paths in project data (e.g., validation/D-08_paths.txt)
- [ ] D-09: Test image removal functionality
- [ ] D-10: Validate thumbnail generation

## Section E: Narration/Audio Generation
- [ ] E-01: Generate tutorial script using /summarize endpoint
- [ ] E-02: Review and edit generated script in UI
- [ ] E-03: Configure voice settings for TTS
- [ ] E-04: Generate audio using /tts endpoint
- [ ] E-05: Play back generated audio in UI
- [ ] E-06: Adjust pronunciation overrides
- [ ] E-07: Handle TTS API errors gracefully
- [ ] E-08: Validate audio quality and clarity
- [ ] E-09: Test different voice options
- [ ] E-10: Verify audio file generation and storage

## Section F: Subtitles
- [ ] F-01: Generate SRT subtitle file from script
- [ ] F-02: Validate subtitle timing synchronization
- [ ] F-03: Review and edit subtitles in UI
- [ ] F-04: Export SRT file for external use
- [ ] F-05: Store SRT file in project directory
- [ ] F-06: Validate subtitle formatting
- [ ] F-07: Test subtitle language options
- [ ] F-08: Confirm SRT export functionality (e.g., validation/F-08_export.srt)
- [ ] F-09: Verify subtitle character encoding
- [ ] F-10: Test subtitle preview functionality

## Section G: Rendering
- [ ] G-01: Initiate video rendering process
- [ ] G-02: Compile shotlist from storyboard
- [ ] G-03: Bind audio, subtitles, and visual assets
- [ ] G-04: Generate preview video segments
- [ ] G-05: Assemble final video output
- [ ] G-06: Apply visual transitions and effects
- [ ] G-07: Overlay subtitles on video
- [ ] G-08: Validate video format and quality
- [ ] G-09: Store rendered video in exports directory
- [ ] G-10: Track render timings and performance (e.g., validation/G-10_timing.log)

## Section H: Quality Checks
- [ ] H-01: Playback complete tutorial video
- [ ] H-02: Verify audio-video synchronization
- [ ] H-03: Check subtitle accuracy and timing
- [ ] H-04: Validate visual asset placement
- [ ] H-05: Review safe-area compliance
- [ ] H-06: Test video on different screen sizes
- [ ] H-07: Verify chapter markers and navigation
- [ ] H-08: Confirm metadata display in video
- [ ] H-09: Validate video accessibility features
- [ ] H-10: Document hardware context for reproducibility

## Section I: Packaging
- [ ] I-01: Package tutorial with all assets
- [ ] I-02: Generate export manifest
- [ ] I-03: Create distributable archive
- [ ] I-04: Validate package integrity
- [ ] I-05: Store package in exports directory
- [ ] I-06: Verify package size and compression
- [ ] I-07: Test package extraction
- [ ] I-08: Document packaging time and resources
- [ ] I-09: Validate cross-platform compatibility
- [ ] I-10: Confirm package metadata accuracy

## Section J: CI Hooks
- [ ] J-01: Validate pre-commit hooks execution
- [ ] J-02: Test linting integration
- [ ] J-03: Verify testing automation
- [ ] J-04: Confirm build process integration
- [ ] J-05: Validate deployment hooks
- [ ] J-06: Test rollback procedures
- [ ] J-07: Verify notification systems
- [ ] J-08: Document CI performance metrics
- [ ] J-09: Validate security scanning integration
- [ ] J-10: Confirm artifact storage integration

## Section K: Delivery
- [ ] K-01: Upload package to delivery platform
- [ ] K-02: Validate delivery URL generation
- [ ] K-03: Test download functionality
- [ ] K-04: Verify delivery analytics tracking
- [ ] K-05: Confirm delivery security measures
- [ ] K-06: Test delivery error handling
- [ ] K-07: Validate delivery notification systems
- [ ] K-08: Document delivery performance
- [ ] K-09: Confirm delivery access controls
- [ ] K-10: Test delivery rollback procedures

## Validation Protocol
- Evidence Capture: For every checklist item, record pass/fail with notes, file paths, and screenshots/log snippets as needed
- Issue Logging: Any failure immediately spawns a ticket with root-cause hypothesis and remedial action
- Regression Guards: Where fixes are applied, augment with unit/integration coverage before re-testing
- Cross-Platform Requirement: Repeat critical flows (ingest, render, playback) on Windows, macOS, and Linux
- Completion Gate: Local validation is considered passed only when every checklist item is green or an exception is explicitly waived with mitigation

## Required Inputs
- Current .env values (redacted except for variable presence) for archival in the validation log
- High-quality rulebook PDF for test coverage
- Board/component imagery for test coverage