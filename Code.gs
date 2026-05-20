// Code.gs — Entry point for the Newsy web app
// Handles doGet(), HTML include helpers, and public server-callable functions.

// ── Web app entry point ────────────────────────────────────────────────────

function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('index');
    template.setupComplete = SetupService.isSetupComplete();
    template.appVersion    = CONFIG.VERSION;
    template.appName       = CONFIG.APP_NAME;

    return template.evaluate()
      .setTitle(CONFIG.APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return HtmlService.createHtmlOutput('<p>Error loading app: ' + err.message + '</p>');
  }
}

// ── Template include helper ────────────────────────────────────────────────
// Usage in .html files:  <?!= include('ui/_styles') ?>

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── Server functions exposed to the client via google.script.run ───────────
// All return { success: boolean, data?: any, error?: string }

function getInitialState() {
  return _ok({
    setupComplete: SetupService.isSetupComplete(),
    userEmail:     _safeGetEmail(),
    version:       CONFIG.VERSION,
  });
}

function getSetupStatus() {
  return _ok(SetupService.getSetupStatus());
}

function getGmailLabels() {
  return _try(() => GmailService.listLabels());
}

function saveSetupStep(step, data) {
  return _try(() => SetupService.saveStep(step, JSON.parse(data)));
}

function completeSetup(finalDataJson) {
  return _try(() => SetupService.completeSetup(JSON.parse(finalDataJson)));
}

function resetSetup() {
  return _try(() => SetupService.resetSetup());
}

// Dashboard
function getDashboardData() {
  return _try(() => ({
    stats:          IndexService.getStats(),
    recentNews:     IndexService.getRecent(10),
    backfillState:  BackfillService.getState(),
    providerStatus: ProviderService.getAllStatuses(),
    triggers:       TriggerService.getActiveTriggers(),
    lastScanTime:   ScanService.getLastScanTime(),
  }));
}

// Archive / Search
function getNewsletters(filtersJson) {
  const filters = filtersJson ? JSON.parse(filtersJson) : {};
  return _try(() => IndexService.search(filters));
}

function getNewsletterById(messageId) {
  return _try(() => IndexService.findByMessageId(messageId));
}

// Sources list for filters
function getSources() {
  return _try(() => IndexService.getSources());
}

// Backfill control
function startBackfill(configJson) {
  return _try(() => BackfillService.initBackfill(JSON.parse(configJson)));
}

function getBackfillState() {
  return _ok(BackfillService.getState());
}

function pauseBackfill() {
  return _try(() => BackfillService.pause());
}

function resumeBackfill() {
  return _try(() => BackfillService.resume());
}

function estimateBackfill(configJson) {
  return _try(() => BackfillService.estimate(JSON.parse(configJson)));
}

// Settings / Secrets
function saveApiKey(provider, key) {
  return _try(() => SecretService.store(provider, key));
}

function removeApiKey(provider) {
  return _try(() => SecretService.remove(provider));
}

function getProviderStatuses() {
  return _ok(ProviderService.getAllStatuses());
}

function testProviderConnection(provider) {
  return _try(() => ProviderService.testConnection(provider));
}

function getUserPrefs() {
  return _ok(SetupService.getUserPrefs());
}

function saveUserPrefs(prefsJson) {
  return _try(() => SetupService.saveUserPrefs(JSON.parse(prefsJson)));
}

// Trigger management
function setupScanTrigger() {
  return _try(() => TriggerService.setupScanTrigger());
}

function removeScanTrigger() {
  return _try(() => TriggerService.removeScanTrigger());
}

// Manual scan (for settings/testing)
function runScanNow() {
  return _try(() => ScanService.scan());
}

// ── Trigger handler functions (called by GAS scheduler) ───────────────────

function triggerScan() {
  try {
    ScanService.scan();
  } catch (err) {
    Logger.log('triggerScan error: ' + err.message);
  }
}

function triggerBackfillBatch() {
  try {
    BackfillService.processBackfillBatch();
  } catch (err) {
    Logger.log('triggerBackfillBatch error: ' + err.message);
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

function _ok(data) {
  return { success: true, data: data };
}

function _try(fn) {
  try {
    return { success: true, data: fn() };
  } catch (err) {
    Logger.log('Server error: ' + err.message + '\n' + err.stack);
    return { success: false, error: err.message };
  }
}

function _safeGetEmail() {
  try { return Session.getActiveUser().getEmail(); } catch (_) { return ''; }
}
