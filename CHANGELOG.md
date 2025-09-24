# Changelog

All notable changes to the MOBIUS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-24

### 🎉 Major Release: DHash Image Similarity Pipeline

This release introduces production-ready DHash (Difference Hash) functionality for duplicate image detection and similarity matching in the MOBIUS video processing pipeline.

### Added

#### Core DHash Functionality
- **DHash processor library** (`src/dhash.js`) with cross-platform image similarity detection
- **64-bit difference hash generation** using FFmpeg for consistent results across platforms
- **Hamming distance comparison** for quantifying image similarity
- **Configurable similarity thresholds** for duplicate detection

#### Migration System
- **Migration script** (`scripts/migrate_dhash.js`) for adding DHash fingerprints to existing libraries
- **Dry-run capability** for safe pre-migration validation
- **Batch processing** with configurable batch sizes and parallel processing
- **Automatic backup creation** with integrity verification and checksum validation
- **Rollback system** (`scripts/migrate_rollback.js`) for safe migration reversal
- **Progress reporting** and detailed migration statistics

#### Low-Confidence Match Management  
- **LCM export/import system** (`scripts/lcm_manager.js`) for manual review workflows
- **HTML review interface** for visual duplicate validation
- **CSV and JSON export formats** for integration with external review tools
- **Configurable confidence thresholds** (distance 8-15 default for low-confidence)

#### Production Deployment
- **Automated deployment script** (`scripts/deploy_dhash.sh`) with comprehensive safety checks
- **Health check integration** and post-deployment verification
- **Atomic deployment** with pre-deployment backups
- **Signal handling** and automatic rollback on failure

#### Documentation and Operations
- **Migration runbook** (`docs/MIGRATION_RUNBOOK.md`) with step-by-step deployment procedures  
- **PR merge checklist** (`docs/PR_CHECKLIST.md`) for safe production rollouts
- **Monitoring guidelines** for DHash performance metrics
- **Troubleshooting guide** for common deployment issues

#### Cross-Platform Support
- **Windows compatibility** with Chocolatey FFmpeg support
- **macOS support** with Homebrew FFmpeg integration
- **Linux support** with apt-get FFmpeg packages
- **Platform-specific CI testing** across Ubuntu/macOS/Windows matrix

### Changed

#### Package Configuration
- **Updated package.json** with new migration scripts:
  - `npm run migrate:dhash` - Run full migration
  - `npm run migrate:dry-run` - Preview migration changes
  - `npm run migrate:rollback` - Rollback migration
  - `npm run lcm:export` - Export low-confidence matches
  - `npm run lcm:import` - Import reviewed matches

#### CI/CD Pipeline
- **Enhanced golden file testing** to support DHash validation
- **Cross-platform matrix testing** for DHash functionality
- **Automated backup verification** in CI workflows

### Technical Specifications

#### Performance Targets
- **Hash generation**: < 50ms average, < 200ms 95th percentile
- **Memory usage**: Efficient batch processing with configurable limits
- **Error tolerance**: < 1% failure rate for image processing
- **Similarity detection**: 10 Hamming distance default threshold

#### Security Features  
- **Backup encryption support** for sensitive image libraries
- **Checksum validation** for all backup operations
- **File permission verification** during migration
- **Temporary file cleanup** to prevent information leakage

#### Monitoring Integration
- **Prometheus-compatible metrics**:
  - `avg_hash_time` - Average hash generation time
  - `p95_hash_time` - 95th percentile response time  
  - `extraction_failures_rate` - Processing error rate
  - `low_confidence_queue_length` - Manual review queue size

### Migration Notes

#### For Existing Installations
1. **Backup your library**: Always create backups before migration
2. **Run dry-run first**: Validate migration with `npm run migrate:dry-run`
3. **Monitor disk space**: Ensure sufficient space for backups and processing
4. **Review duplicates**: Check low-confidence queue for manual validation

#### Breaking Changes
- **Library schema extended**: New `dhash`, `dhash_generated_at` fields added to images
- **Migration metadata**: New top-level fields `dhash_migration`, `dhash_duplicates`, `dhash_errors`

#### Compatibility
- **Node.js**: Requires 18+ (recommended 20+)
- **FFmpeg**: Any modern version with PNG support
- **Storage**: Additional ~10% storage overhead for DHash metadata

### Testing Coverage

#### Unit Tests
- DHash generation and comparison algorithms
- Migration script validation logic
- Low-confidence match detection
- Rollback functionality

#### Integration Tests  
- Cross-platform FFmpeg compatibility
- End-to-end migration workflows
- Backup and restore procedures
- HTML review interface generation

#### Production Validation
- **Sandbox testing** with timeout and edge case scenarios
- **Golden file regression testing** for video pipeline compatibility  
- **Performance benchmarking** across different image types and sizes

### Known Issues

#### Limitations
- **FFmpeg dependency**: Requires FFmpeg installation on target systems
- **Memory usage**: Large batch sizes may require increased memory allocation
- **Processing time**: Migration time scales linearly with image count

#### Workarounds
- **Missing FFmpeg**: Automated installation instructions in runbook
- **Memory constraints**: Configurable batch size reduction
- **Network images**: Local caching recommended for remote image libraries

### Future Roadmap

#### Planned Enhancements
- **pHash integration** for enhanced similarity detection
- **Machine learning similarity** for advanced duplicate detection  
- **Distributed processing** for large-scale migrations
- **Real-time duplicate detection** for incoming images

#### API Extensions
- **REST endpoints** for programmatic DHash operations
- **Webhook integration** for migration status notifications
- **GraphQL queries** for similarity search operations

### Contributors

This release represents extensive collaboration across the development team to deliver production-ready image similarity detection capabilities.

### Support and Feedback

- **Documentation**: See `docs/MIGRATION_RUNBOOK.md` for deployment procedures
- **Issues**: Report problems via GitHub Issues with DHash label
- **Performance**: Monitor metrics and report anomalies to operations team

---

## [0.9.x] - Previous Releases

### [0.9.0] - 2024-12-01
- Golden file testing infrastructure
- Cross-platform CI/CD pipeline  
- FFmpeg video processing pipeline
- Basic image extraction capabilities

---

*For older release notes, see the Git history or GitHub releases page.*