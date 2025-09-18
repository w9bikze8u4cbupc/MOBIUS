# Pester test for PowerShell script
Describe "PowerShell Script Dry Run Tests" {
    It "Param block contains canonical flags" {
        $scriptPath = Join-Path $PSScriptRoot "..\mobius_golden_path.ps1"
        $scriptContent = Get-Content $scriptPath -Raw
        
        # Check that key parameters are present
        $scriptContent | Should -Match "\[string\]\`$Server"
        $scriptContent | Should -Match "\[string\]\`$Frontend"
        $scriptContent | Should -Match "\[string\]\`$Profile"
        $scriptContent | Should -Match "\[switch\]\`$DryRun"
    }
    
    It "Dry run prints intended checks for smoke profile" {
        $output = & ".\mobius_golden_path.ps1" -Profile "smoke" -DryRun 2>&1
        $output | Should -Match "Dry run mode - would execute the following checks:"
        $output | Should -Match "All checks for profile: smoke"
    }
    
    It "Dry run prints intended checks for full profile" {
        $output = & ".\mobius_golden_path.ps1" -Profile "full" -DryRun 2>&1
        $output | Should -Match "Dry run mode - would execute the following checks:"
        $output | Should -Match "All checks for profile: full"
    }
}