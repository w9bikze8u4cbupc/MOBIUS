# PR-Ready Patches

## scripts/compare_perf_to_baseline.cjs

```diff
--- a/scripts/compare_perf_to_baseline.cjs
+++ b/scripts/compare_perf_to_baseline.cjs
@@ -1,10 +1,25 @@
 #!/usr/bin/env node
 const fs = require('fs');
 const path = require('path');
+
+function exists(p) { try { return p && fs.existsSync(p); } catch { return false; } }
+
+const candidatePaths = [
+  process.env.PERF_BASELINE_PATH,
+  path.resolve(__dirname, '..', 'baselines', 'perf.json'),
+  path.resolve(__dirname, '..', 'perf_baseline.json'),
+].filter(Boolean);
+
+const baselinePath = candidatePaths.find(exists);
+if (!baselinePath) {
+  console.error('[perf-baseline] No baseline file found. Tried:', candidatePaths.join(' | '));
+  process.exit(1);
+}
+console.log('[perf-baseline] Using baseline:', baselinePath);
+
 const assertPerfBaselineShape = require('./lib/assertPerfBaselineShape.cjs');
 const probeVideo = require('./lib/probeVideo.cjs');
 const computePerfKey = require('./lib/computePerfKey.cjs');
 
 const PERF_BASELINE_SCHEMA_VERSION = assertPerfBaselineShape.SCHEMA_VERSION;
 const perfDir = process.env.PERF_DIR || 'reports/perf';
 const tolerance = parseFloat(process.env.PERF_TOLERANCE || '0.05'); // 5% by default
+const branch = (process.env.GITHUB_REF_NAME || '').toLowerCase();
+const isMain = /^(main|master)$/.test(branch);
+const warnOnly = process.env.PERF_WARN_ONLY === '1' || !isMain;
 const requireBaselineOnMain = process.env.PERF_REQUIRE_BASELINE_ON_MAIN === '1';
 
-function writeJUnit(cases, junitPath = 'reports/junit/perf_baseline.xml') {
+function writeJUnit(cases, junitPath = 'reports/junit/perf_baseline.xml') {
```

## scripts/promote_baselines.cjs

```diff
--- a/scripts/promote_baselines.cjs
+++ b/scripts/promote_baselines.cjs
@@ -1,3 +1,15 @@
 #!/usr/bin/env node
+
+// Fail-safe promotion semantics in CI
+const DRY = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
+const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
+const ALLOW_REGRESSION = process.env.ALLOW_REGRESSION === '1' || process.argv.includes('--allow-regression');
+const ALLOW_REGRESSION_REASON = process.env.ALLOW_REGRESSION_REASON || null;
+const requireBaselineOnMain = process.env.PERF_REQUIRE_BASELINE_ON_MAIN === '1';
+
+const branch = (process.env.GITHUB_REF_NAME || '').toLowerCase();
+const isMain = /^(main|master)$/.test(branch);
+const lastCommit = process.env.GIT_LAST_COMMIT_MESSAGE || '';
+const hasTrailer = /\[(baseline|perf-baseline)\]/i.test(lastCommit);
+const reason = process.env.ALLOW_REGRESSION_REASON;
+
+if (!isMain) {
+  console.error('[promote] Blocked: only main branch may promote baselines.');
+  process.exit(1);
+}
+if (!hasTrailer) {
+  console.error('[promote] Blocked: commit must include [baseline] or [perf-baseline] trailer.');
+  process.exit(1);
+}
+
 // Fail-safe promotion semantics in CI
```

## src/utils/translation.js

```diff
--- a/src/utils/translation.js
+++ b/src/utils/translation.js
@@ -1,41 +1,56 @@
 const fetch = require('node-fetch');
 
-const libreTranslateURL = 'http://localhost:5002/translate';
+const LT_URL = process.env.LT_URL || 'http://localhost:5002/translate';
+const TRANSLATE_MODE = (process.env.TRANSLATE_MODE || 'optional').toLowerCase();
+// optional modes: 'disabled' | 'optional' | 'required'
 
-async function translateText(text, targetLanguage) {
-    try {
-        if (!text) return '';
+async function checkLibreTranslateHealth() {
+    try {
+        const healthUrl = LT_URL.replace('/translate', '/health');
+        const response = await fetch(healthUrl, { 
+            method: 'GET',
+            timeout: 5000 // 5 second timeout
+        });
+        
+        if (!response.ok) {
+            throw new Error(`Health check failed with status ${response.status}`);
+        }
+        
+        return true;
+    } catch (error) {
+        throw new Error(`LibreTranslate health check failed: ${error.message}`);
+    }
+}
+
+async function translateText(text, targetLanguage) {
+    try {
+        if (!text) return '';
         
+        // Handle disabled mode
+        if (TRANSLATE_MODE === 'disabled') {
+            return { text, provider: 'libretranslate', mode: 'disabled', skipped: true };
+        }
+        
+        // For required mode, check health first
+        if (TRANSLATE_MODE === 'required') {
+            await checkLibreTranslateHealth();
+        }
         
         // Pre-process text to remove unwanted headers
-        text = text.replace(/^(Introduction|Outro|Présentation du jeu|Composants et mise en place|Aperçu du gameplay|Actions possibles|Phase de score|Conditions de fin de partie):?\n+/gmi, '');
+        text = text.replace(/^(Introduction|Outro|Présentation du jeu|Composants et mise en place|Aperçu du gameplay|Actions possibles|Phase de score|Conditions de fin de partie):?\n+/gmi, '');
         
-        const response = await fetch(libreTranslateURL, {
+        const response = await fetch(LT_URL, {
             method: 'POST',
             body: JSON.stringify({
                 q: text,
                 source: 'en',
                 target: targetLanguage,
                 format: 'text'
             }),
             headers: { 'Content-Type': 'application/json' }
         });
 
-        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
+        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
 
-        const data = await response.json();
+        const data = await response.json();
         
         // Post-process translation to improve quality
-        let translation = data.translatedText
-            .replace(/\[pause\]/g, '[PAUSE 2s]')
-            .replace(/\.\s/g, '. [PAUSE 1s] ')
-            .replace(/\b(Introduction|Outro)\b/gi, '')
-            .replace(/\[Image:.*?\]/g, '');
+        let translation = data.translatedText
+            .replace(/\[pause\]/g, '[PAUSE 2s]')
+            .replace(/\.\s/g, '. [PAUSE 1s] ')
+            .replace(/\b(Introduction|Outro)\b/gi, '')
+            .replace(/\[Image:.*?\]/g, '');
             
-        return translation;
-    } catch (error) {
-        console.error("Translation error:", error);
-        throw error;
-    }
+        return translation;
+    } catch (error) {
+        if (TRANSLATE_MODE === 'optional') {
+            // Graceful fallback with warning
+            console.warn('[translate] optional mode: network error, returning source text');
+            return { text, provider: 'libretranslate', mode: 'optional', error: String(error) };
+        }
+        console.error("Translation error:", error);
+        throw error;
+    }
 }
 
 module.exports = { translateText };
```

These patches implement all the required functionality for Steps 3 and 4:

1. **Baseline path flexibility** - The compare_perf_to_baseline.cjs script now supports the PERF_BASELINE_PATH environment variable with fallbacks to standard locations and branch-aware warnOnly defaults.

2. **Promotion guardrails** - The promote_baselines.cjs script now enforces that only the main branch can promote baselines and requires appropriate commit trailers.

3. **Translation mode toggles** - The translation.js script now supports three translation modes (disabled, optional, required) controlled by the TRANSLATE_MODE environment variable, with health checks for required mode.