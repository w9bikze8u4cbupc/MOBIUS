# MOBIUS Operations Notes

## Running Batch Validation
Before running the validation harness (`validation/harness/index.js`), execute the migration scripts to ensure the SQLite schema is up to date:

```bash
scripts/run_migrations.sh
# or on Windows
scripts/run_migrations.ps1
```

Once migrations complete successfully, run the harness to produce the evidence bundle and validation artifacts.
