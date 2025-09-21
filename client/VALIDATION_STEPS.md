# Validation Steps

## Step 1: Verify DevTestPage is rendered
1. Open browser to http://localhost:3000
2. Confirm you see the "Dev Test Page" heading
3. Confirm you see the ApiSmokeTest component with three buttons:
   - "Call Health"
   - "Call Oversize (413)"
   - "Call Network Fail"

## Step 2: Test deduplication functionality
1. Click "Call Health" button
   - Expect: Success toast message
   - Expect: DebugChips info panel shows requestId, latency, source
2. Click "Call Oversize (413)" button multiple times rapidly
   - Expect: Only one error toast despite multiple clicks
3. Click "Call Network Fail" button multiple times rapidly
   - Expect: Only one error toast despite internal retries

## Step 3: Verify QA gating
1. Set REACT_APP_QA_LABELS=false in .env
2. Restart dev server
3. Click "Call Health"
   - Expect: Success toast appears
   - Expect: DebugChips info panel does NOT appear

## Step 4: Restore normal app
1. Set REACT_APP_SHOW_DEV_TEST=false in .env
2. Restart dev server
3. Confirm normal App component is rendered