// services/ScanService.gs — Incremental Gmail scanning (runs every 30 min via trigger)

const ScanService = (() => {
  const props = () => PropertiesService.getScriptProperties();

  // ── Main scan entry point ──────────────────────────────────────────────────

  function scan() {
    const prefs     = SetupService.getUserPrefs();
    const lastScan  = getLastScanTime();
    const startTime = Date.now();
    const query     = _buildQuery(prefs, lastScan);

    Logger.log(`ScanService: scanning with query: ${query}`);

    let processed = 0, skipped = 0, failed = 0;
    const messages = GmailService.searchMessages(query, CONFIG.LIMITS.BATCH_SIZE * 2);

    for (const msg of messages) {
      if ((Date.now() - startTime) / 1000 > CONFIG.LIMITS.MAX_EXEC_SECONDS) {
        Logger.log('ScanService: time limit approaching, stopping early');
        break;
      }

      try {
        const result = _processMessage(msg);
        if      (result === 'processed') processed++;
        else if (result === 'skipped')   skipped++;
      } catch (err) {
        failed++;
        Logger.log('ScanService message error: ' + err.message);
      }
    }

    // Always update last scan time, even if we processed nothing
    setLastScanTime(new Date().toISOString());
    CacheManager.removePrefix('dashboard');

    Logger.log(`ScanService done: processed=${processed} skipped=${skipped} failed=${failed}`);
    return { processed, skipped, failed };
  }

  // ── Time tracking ──────────────────────────────────────────────────────────

  function getLastScanTime() {
    return props().getProperty(CONFIG.PROPS.LAST_SCAN_TIME) || null;
  }

  function setLastScanTime(isoString) {
    props().setProperty(CONFIG.PROPS.LAST_SCAN_TIME, isoString);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function _buildQuery(prefs, lastScan) {
    const parts = [];

    // Include configured newsletter labels
    const labels = prefs.newsletterLabels || [];
    if (labels.length > 0) {
      const labelPart = labels.map((l) => `label:${l}`).join(' OR ');
      parts.push('(' + labelPart + ')');
    }

    // Fallback: look for newsletters in inbox and broad signals
    if (labels.length === 0) {
      parts.push('(unsubscribe OR "view in browser" OR "manage subscription")');
    }

    // Only look at messages since last scan
    if (lastScan) {
      const d = new Date(lastScan);
      // Subtract a small overlap to avoid missing messages at boundary
      d.setMinutes(d.getMinutes() - 5);
      const formatted = Utilities.formatDate(d, 'UTC', 'yyyy/MM/dd');
      parts.push(`after:${formatted}`);
    }

    return parts.join(' ');
  }

  function _processMessage(message) {
    const messageId = message.getId();
    if (IndexService.isProcessed(messageId)) return 'skipped';

    const detection = GmailService.detectNewsletter(message);
    if (!detection.isNewsletter) return 'skipped';

    const metadata = GmailService.extractMetadata(message);
    metadata.contentHash     = GmailService.contentHash(message);
    metadata.fromBackfill    = false;
    metadata.processingStatus= 'imported';

    try {
      const body = GmailService.getBody(message);
      const { fileUrl } = DriveArchiveService.saveNewsletter(body, metadata);
      metadata.driveFileUrl   = fileUrl;
      metadata.extractedLinks = GmailService.extractLinks(body);
    } catch (driveErr) {
      Logger.log('ScanService drive error: ' + driveErr.message);
      metadata.processingStatus = 'drive_error';
    }

    IndexService.addNewsletter(metadata);
    return 'processed';
  }

  return { scan, getLastScanTime, setLastScanTime };
})();
