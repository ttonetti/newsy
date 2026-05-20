// services/BackfillService.gs — Safe, incremental historical newsletter import
// Processes 15,000+ messages in quota-safe batches with checkpoint persistence.

const BackfillService = (() => {
  const props = () => PropertiesService.getScriptProperties();

  // State schema stored in PropertiesService:
  // { status, query, pageToken, processed, skipped, failed, totalEstimate,
  //   startDate, endDate, batchNum, startedAt, lastBatchAt, labels }

  // ── Public API ─────────────────────────────────────────────────────────────

  // Initialize a new backfill. config = { startDate, endDate, labels, mode }
  function initBackfill(config) {
    const query = _buildQuery(config);
    const estimate = GmailService.estimateCount(query);

    const state = {
      status:        'running',
      query:         query,
      pageToken:     null,
      processed:     0,
      skipped:       0,
      failed:        0,
      totalEstimate: estimate,
      startDate:     config.startDate || '',
      endDate:       config.endDate   || '',
      labels:        config.labels    || [],
      mode:          config.mode      || 'all',
      batchNum:      0,
      startedAt:     new Date().toISOString(),
      lastBatchAt:   null,
    };

    _saveState(state);
    TriggerService.setupBackfillTrigger();
    return { started: true, estimate, query };
  }

  // Process one batch. Called by the 5-minute trigger.
  function processBackfillBatch() {
    const state = getState();
    if (!state || state.status !== 'running') return;

    const startTime = Date.now();
    state.batchNum++;
    state.lastBatchAt = new Date().toISOString();

    try {
      const messages = _fetchNextBatch(state);

      if (!messages || messages.length === 0) {
        _markComplete(state);
        return;
      }

      let processed = 0, skipped = 0, failed = 0;

      for (const msg of messages) {
        // Abort batch if approaching execution limit
        if ((Date.now() - startTime) / 1000 > CONFIG.LIMITS.MAX_EXEC_SECONDS) {
          Logger.log('BackfillService: approaching time limit, saving checkpoint');
          break;
        }

        try {
          const result = _processMessage(msg, true);
          if      (result === 'processed') processed++;
          else if (result === 'skipped')   skipped++;
        } catch (err) {
          failed++;
          Logger.log('Backfill message error: ' + err.message);
        }
      }

      state.processed += processed;
      state.skipped   += skipped;
      state.failed    += failed;
      _saveState(state);

    } catch (err) {
      state.status = 'error';
      state.errorMessage = err.message;
      _saveState(state);
      Logger.log('BackfillService batch error: ' + err.message);
    }
  }

  function getState() {
    const raw = props().getProperty(CONFIG.PROPS.BACKFILL_STATE);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function pause() {
    const state = getState();
    if (!state) return;
    state.status = 'paused';
    _saveState(state);
    TriggerService.removeBackfillTrigger();
  }

  function resume() {
    const state = getState();
    if (!state || state.status === 'complete') return;
    state.status = 'running';
    _saveState(state);
    TriggerService.setupBackfillTrigger();
  }

  function estimate(config) {
    const query = _buildQuery(config);
    return { estimate: GmailService.estimateCount(query), query };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function _buildQuery(config) {
    const parts = [];

    if (config.labels && config.labels.length > 0) {
      const labelParts = config.labels.map((l) => `label:${l}`).join(' OR ');
      parts.push('(' + labelParts + ')');
    }

    if (config.startDate) parts.push(`after:${_dateToGmailFilter(new Date(config.startDate))}`);
    if (config.endDate)   parts.push(`before:${_dateToGmailFilter(new Date(config.endDate))}`);

    // Basic newsletter signal
    if (config.mode === 'newsletters_only') {
      parts.push('(unsubscribe OR newsletter OR digest)');
    }

    return parts.length > 0 ? parts.join(' ') : 'in:all';
  }

  function _dateToGmailFilter(date) {
    return Utilities.formatDate(date, 'UTC', 'yyyy/MM/dd');
  }

  function _fetchNextBatch(state) {
    // GmailApp.search doesn't support pageToken natively; we simulate pagination
    // by tracking processed count and using date-based chunking.
    // This approach is GAS-compatible (no Gmail REST API required).
    const query    = state.query;
    const skip     = state.processed + state.skipped; // already handled
    const pageSize = CONFIG.LIMITS.BATCH_SIZE;

    // Search returns threads; we skip ones we've already processed via isProcessed check
    const threads = GmailApp.search(query, skip, pageSize * 3); // over-fetch to account for skips
    if (!threads || threads.length === 0) return null;

    const messages = [];
    for (const thread of threads) {
      if (messages.length >= pageSize) break;
      const threadMsgs = thread.getMessages();
      messages.push(...threadMsgs.slice(0, 1)); // take first message per thread
    }
    return messages;
  }

  function _processMessage(message, isBackfill) {
    const messageId = message.getId();

    // Skip if already in index
    if (IndexService.isProcessed(messageId)) return 'skipped';

    const detection = GmailService.detectNewsletter(message);
    if (!detection.isNewsletter) return 'skipped';

    const metadata = GmailService.extractMetadata(message);
    metadata.contentHash  = GmailService.contentHash(message);
    metadata.fromBackfill = isBackfill;
    metadata.processingStatus = 'imported';

    // Save HTML to Drive
    try {
      const body = GmailService.getBody(message);
      const { fileUrl } = DriveArchiveService.saveNewsletter(body, metadata);
      metadata.driveFileUrl  = fileUrl;
      metadata.extractedLinks = GmailService.extractLinks(body);
    } catch (driveErr) {
      Logger.log('Drive save error for ' + messageId + ': ' + driveErr.message);
      metadata.processingStatus = 'drive_error';
    }

    IndexService.addNewsletter(metadata);
    return 'processed';
  }

  function _markComplete(state) {
    state.status = 'complete';
    state.completedAt = new Date().toISOString();
    _saveState(state);
    TriggerService.removeBackfillTrigger();
  }

  function _saveState(state) {
    props().setProperty(CONFIG.PROPS.BACKFILL_STATE, JSON.stringify(state));
  }

  return { initBackfill, processBackfillBatch, getState, pause, resume, estimate };
})();
