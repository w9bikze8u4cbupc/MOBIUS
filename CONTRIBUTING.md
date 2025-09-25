# Contributing to MOBIUS

Thank you for contributing to the MOBIUS Game Tutorial Generator! This guide will help you get started and ensure smooth collaboration.

## Development Workflow

### 1. Setup
```bash
# Clone and setup
git clone <repo>
cd MOBIUS
npm ci
cd client && npm ci && cd ..
```

### 2. Development
```bash
# Run tests
npm test
npm run golden:check

# Test pipeline  
npm run test-pipeline
npm run render:proxy
```

### 3. Pull Request Process

**Before creating a PR:**
- Ensure all tests pass locally
- Run golden file validation
- Update documentation if needed

**Before merging a PR:**
Use our comprehensive validation process:
- **Quick reference**: [QUICK_MERGE_CHECKLIST.md](QUICK_MERGE_CHECKLIST.md)
- **Complete validation**: [PR_MERGE_CHECKLIST.md](PR_MERGE_CHECKLIST.md)

## Golden File Testing

Our CI uses "golden files" - reference video/audio outputs that ensure consistency:

- **Video frames**: Must match with SSIM ≥ 0.995
- **Audio levels**: LUFS and True Peak within ± 1.0dB tolerance
- **Multi-platform**: Tests run on Ubuntu, macOS, and Windows

### Updating Golden Files
If your changes legitimately alter video/audio output:

```bash
# Update baselines (run on all platforms)
npm run golden:approve

# Or use the GitHub workflow "Golden Approve"
```

## Code Standards

- **TypeScript**: All code must compile without errors
- **Testing**: Add tests for new functionality
- **Documentation**: Update README and inline docs
- **Golden files**: Validate any changes to video/audio output

## Getting Help

- Check existing issues and discussions
- Review the [PR Merge Checklist](PR_MERGE_CHECKLIST.md) for validation requirements  
- Ask questions in PR comments or team communication channels

## Review Process

1. **Self-review**: Use the quick checklist before requesting review
2. **Peer review**: Technical team member reviews code
3. **CI validation**: All automated tests must pass
4. **Final validation**: Complete merge checklist before merging

By following these guidelines, you help maintain the quality and reliability of the MOBIUS pipeline!