# Pull Request Checklist

## Description
<!-- Provide a brief description of the changes made in this PR -->

## Type of Change
<!-- Mark the appropriate option with an 'x' -->
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🔧 Configuration change
- [ ] 🏗️ Infrastructure/build change
- [ ] 🧪 Test update
- [ ] 🔄 Refactoring (no functional changes)

## Testing
<!-- Describe the tests you ran to verify your changes -->
- [ ] Unit tests pass (`npm test`)
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Golden tests pass (`npm run golden:check`)
- [ ] Video generation pipeline tested (if applicable)

## Game Tutorial Pipeline
<!-- Check if applicable -->
- [ ] Tested with sample game rules
- [ ] Audio generation works correctly
- [ ] Video rendering pipeline functional
- [ ] Metadata extraction validated
- [ ] Multi-language support tested (if changed)

## Security
- [ ] No sensitive data exposed in logs or outputs
- [ ] API keys and credentials properly handled
- [ ] Input validation implemented for new endpoints
- [ ] No security vulnerabilities introduced (confirmed by CodeQL)

## Performance
- [ ] No significant performance regression
- [ ] Memory usage optimized (if applicable)
- [ ] API response times acceptable
- [ ] Video processing times reasonable

## Documentation
- [ ] Code is self-documenting or includes comments
- [ ] README updated (if applicable)
- [ ] API documentation updated (if applicable)
- [ ] Deployment guide updated (if applicable)

## Dependencies
- [ ] No unnecessary dependencies added
- [ ] Package versions pinned appropriately
- [ ] Dependency security scan passed
- [ ] License compatibility verified

## Deployment
- [ ] Ready for production deployment
- [ ] Environment variables documented
- [ ] Database migrations included (if applicable)
- [ ] Rollback plan considered

## Review Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Requested specific reviewers if needed
- [ ] Linked related issues or tickets

## Additional Notes
<!-- Add any additional information, screenshots, or context here -->

## Related Issues
<!-- Link to related issues, e.g., "Closes #123" or "Relates to #456" -->

---
**Reviewer Guidelines:**
- Verify that all applicable checklist items are completed
- Test the changes locally when possible
- Check for security implications
- Ensure documentation is updated
- Consider performance and scalability impacts