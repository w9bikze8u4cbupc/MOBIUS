# YOLOv8 Weights Handling

## Overview
This document describes how YOLOv8 weights are handled in the Mobius Games Tutorial Generator.

## Current Status
No YOLOv8 weights are currently checked into the repository.

## Download-on-Demand Approach
To avoid heavyweight checked-in assets, YOLOv8 weights are handled with a download-on-demand approach:

1. Weights are not included in the repository
2. Documentation provides instructions for downloading weights when needed
3. The system checks for weights at runtime and downloads if missing

## Implementation Plan
When YOLOv8 functionality is needed:
1. Add download script to `scripts/` directory
2. Update documentation with download instructions
3. Implement runtime check for weights existence
4. Automatically download weights if not found

## Benefits
- Reduces repository size
- Avoids licensing issues with pre-trained weights
- Allows users to choose which models to download
- Keeps the repository lightweight and focused