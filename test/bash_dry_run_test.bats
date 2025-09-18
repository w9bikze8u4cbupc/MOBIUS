#!/usr/bin/env bats

@test "bash dry-run prints expected check IDs for smoke profile" {
  run ./mobius_golden_path.sh --profile smoke --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Dry run mode - would execute the following checks:" ]]
  [[ "$output" =~ "All checks for profile: smoke" ]]
}

@test "bash dry-run prints expected check IDs for full profile" {
  run ./mobius_golden_path.sh --profile full --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" =~ "Dry run mode - would execute the following checks:" ]]
  [[ "$output" =~ "All checks for profile: full" ]]
}