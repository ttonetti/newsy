// services/IndexService.gs — Google Sheets metadata index
// Single spreadsheet with multiple sheets; all newsletter metadata lives here.

const IndexService = (() => {
  const props = () => PropertiesService.getScriptProperties();

  // ── Provisioning ───────────────────────────────────────────────────────────

  // Creates the index spreadsheet if it doesn't exist. Returns spreadsheet ID.
  function provisionSpreadsheet() {
    const existing = props().getProperty(CONFIG.PROPS.SPREADSHEET_ID);
    if (existing) {
      try { SpreadsheetApp.openById(existing); return existing; } catch (_) {}
    }
    const ss = SpreadsheetApp.create('Newsy Index');
    _ensureSheets(ss);
    return ss.getId();
  }

  // ── Index CRUD ─────────────────────────────────────────────────────────────

  // Adds a newsletter to the index. Returns the row number added.
  function addNewsletter(meta) {
    const sheet = _getIndexSheet();
    const row   = _buildRow(meta);
    sheet.appendRow(row);
    CacheManager.removePrefix('dashboard');
    CacheManager.removePrefix('search');
    return sheet.getLastRow();
  }

  // Updates fields on an existing row. Only modifies specified columns.
  function updateNewsletter(messageId, updates) {
    const sheet = _getIndexSheet();
    const rowNum = _findRowNum(sheet, messageId);
    if (!rowNum) return false;

    const C = CONFIG.COL;
    Object.keys(updates).forEach((field) => {
      const colIdx = C[field.toUpperCase()];
      if (colIdx !== undefined) {
        sheet.getRange(rowNum, colIdx + 1).setValue(updates[field]);
      }
    });
    CacheManager.removePrefix('dashboard');
    return true;
  }

  // Returns newsletter object by messageId, or null.
  function findByMessageId(messageId) {
    const sheet = _getIndexSheet();
    const rowNum = _findRowNum(sheet, messageId);
    if (!rowNum) return null;
    return _rowToObject(sheet.getRange(rowNum, 1, 1, CONFIG.COL._COUNT).getValues()[0]);
  }

  // Returns true if messageId already exists in the index.
  function isProcessed(messageId) {
    return !!_findRowNum(_getIndexSheet(), messageId);
  }

  // ── Querying ───────────────────────────────────────────────────────────────

  // Returns { items: [], total: int, page: int, pageSize: int }
  function search(filters) {
    const cacheKey = 'search_' + JSON.stringify(filters);
    return CacheManager.getOrCompute(cacheKey, () => _search(filters), CONFIG.CACHE.SEARCH_RESULTS);
  }

  // Returns the N most-recently-imported newsletters.
  function getRecent(limit) {
    return CacheManager.getOrCompute('recent_' + limit, () => {
      const sheet = _getIndexSheet();
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return [];
      const count  = Math.min(limit, lastRow - 1);
      const start  = Math.max(2, lastRow - count + 1);
      const values = sheet.getRange(start, 1, lastRow - start + 1, CONFIG.COL._COUNT).getValues();
      return values.map(_rowToObject).reverse();
    }, CONFIG.CACHE.RECENT_NEWS);
  }

  // Returns aggregated stats for the dashboard.
  function getStats() {
    return CacheManager.getOrCompute('dashboard_stats', () => {
      const sheet   = _getIndexSheet();
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return _emptyStats();

      const values = sheet.getRange(2, 1, lastRow - 1, CONFIG.COL._COUNT).getValues();
      const today  = new Date();
      today.setHours(0, 0, 0, 0);

      let todayCount = 0, backfillCount = 0, failedCount = 0;
      const sources  = new Set();
      const topics   = {};

      values.forEach((row) => {
        const date = row[CONFIG.COL.DATE] ? new Date(row[CONFIG.COL.DATE]) : null;
        if (date && date >= today) todayCount++;
        if (row[CONFIG.COL.FROM_BACKFILL] === true || row[CONFIG.COL.FROM_BACKFILL] === 'TRUE') backfillCount++;
        if (row[CONFIG.COL.PROCESSING_STATUS] === 'error') failedCount++;
        const src = row[CONFIG.COL.SOURCE_NAME];
        if (src) sources.add(src);

        const rawTopics = row[CONFIG.COL.TOPICS];
        if (rawTopics) {
          try {
            JSON.parse(rawTopics).forEach((t) => { topics[t] = (topics[t] || 0) + 1; });
          } catch (_) {}
        }
      });

      const topTopics = Object.entries(topics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([topic, count]) => ({ topic, count }));

      return {
        total:        lastRow - 1,
        todayCount,
        backfillCount,
        failedCount,
        uniqueSources:sources.size,
        topTopics,
      };
    }, CONFIG.CACHE.DASHBOARD_STATS);
  }

  // Returns distinct source names (for search filter dropdowns).
  function getSources() {
    return CacheManager.getOrCompute('sources_list', () => {
      const sheet   = _getIndexSheet();
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return [];
      const col    = sheet.getRange(2, CONFIG.COL.SOURCE_NAME + 1, lastRow - 1, 1).getValues();
      const unique = [...new Set(col.map((r) => r[0]).filter(Boolean))].sort();
      return unique;
    }, CONFIG.CACHE.SOURCE_LIST);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function _getSpreadsheet() {
    const id = props().getProperty(CONFIG.PROPS.SPREADSHEET_ID);
    if (!id) throw new Error('Index spreadsheet not provisioned. Run setup first.');
    return SpreadsheetApp.openById(id);
  }

  function _getIndexSheet() {
    return _getSpreadsheet().getSheetByName(CONFIG.SHEETS.INDEX);
  }

  function _ensureSheets(ss) {
    // Rename default sheet to Index
    const defaultSheet = ss.getSheets()[0];
    defaultSheet.setName(CONFIG.SHEETS.INDEX);
    _ensureIndexHeaders(defaultSheet);

    // Create other sheets
    [CONFIG.SHEETS.SOURCES, CONFIG.SHEETS.TOPICS, CONFIG.SHEETS.STATS,
     CONFIG.SHEETS.QUEUE, CONFIG.SHEETS.CHECKPOINTS, CONFIG.SHEETS.ERROR_LOG
    ].forEach((name) => {
      if (!ss.getSheetByName(name)) ss.insertSheet(name);
    });
  }

  function _ensureIndexHeaders(sheet) {
    if (sheet.getLastRow() > 0) return; // headers already set
    const C = CONFIG.COL;
    const headers = new Array(C._COUNT);
    Object.keys(C).forEach((k) => {
      if (k !== '_COUNT') headers[C[k]] = k.toLowerCase().replace(/_/g, '');
    });
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, C._COUNT).setFontWeight('bold').setBackground('#1D1D1F').setFontColor('#F5F5F7');
    sheet.setFrozenRows(1);
  }

  function _buildRow(meta) {
    const C = CONFIG.COL;
    const row = new Array(C._COUNT).fill('');
    row[C.MESSAGE_ID]         = meta.messageId    || '';
    row[C.THREAD_ID]          = meta.threadId     || '';
    row[C.SUBJECT]            = meta.subject      || '';
    row[C.SENDER]             = meta.sender       || '';
    row[C.SENDER_EMAIL]       = meta.senderEmail  || '';
    row[C.DATE]               = meta.date         || '';
    row[C.LABELS]             = JSON.stringify(meta.labels || []);
    row[C.SOURCE_NAME]        = meta.sourceName   || '';
    row[C.TOPICS]             = JSON.stringify(meta.topics || []);
    row[C.ENTITIES]           = JSON.stringify(meta.entities || []);
    row[C.SUMMARY_STATUS]     = meta.summaryStatus|| 'pending';
    row[C.IMPORTED_AT]        = new Date().toISOString();
    row[C.FROM_BACKFILL]      = !!meta.fromBackfill;
    row[C.DRIVE_FILE_URL]     = meta.driveFileUrl || '';
    row[C.EXTRACTED_LINKS]    = JSON.stringify((meta.extractedLinks || []).slice(0, 20));
    row[C.CONTENT_HASH]       = meta.contentHash  || '';
    row[C.NEWSPAPER_IDS]      = JSON.stringify([]);
    row[C.PROCESSING_STATUS]  = meta.processingStatus || 'imported';
    row[C.LAST_SEEN_AT]       = new Date().toISOString();
    return row;
  }

  function _rowToObject(row) {
    const C   = CONFIG.COL;
    const obj = {};
    const fieldNames = ['messageId','threadId','subject','sender','senderEmail','date',
                        'labels','sourceName','topics','entities','summaryStatus','importedAt',
                        'fromBackfill','driveFileUrl','extractedLinks','contentHash',
                        'newspaperIds','processingStatus','lastSeenAt'];
    fieldNames.forEach((f, i) => {
      let val = row[i];
      // Parse JSON arrays
      if (['labels','topics','entities','extractedLinks','newspaperIds'].includes(f)) {
        try { val = JSON.parse(val) || []; } catch (_) { val = []; }
      }
      obj[f] = val;
    });
    return obj;
  }

  // Returns 1-based row number of the row matching messageId, or 0 if not found.
  function _findRowNum(sheet, messageId) {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;
    const col = sheet.getRange(2, CONFIG.COL.MESSAGE_ID + 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (col[i][0] === messageId) return i + 2;
    }
    return 0;
  }

  function _search(filters) {
    const sheet   = _getIndexSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { items: [], total: 0, page: 1, pageSize: 50 };

    const page     = parseInt(filters.page     || 1);
    const pageSize = parseInt(filters.pageSize || 50);
    const scanMax  = Math.min(lastRow - 1, CONFIG.LIMITS.INDEX_SEARCH_MAX);
    const startRow = Math.max(2, lastRow - scanMax + 1); // search most-recent rows first
    const values   = sheet.getRange(startRow, 1, lastRow - startRow + 1, CONFIG.COL._COUNT).getValues().reverse();
    const C        = CONFIG.COL;

    const filtered = values.filter((row) => {
      if (filters.source    && row[C.SOURCE_NAME]  !== filters.source)  return false;
      if (filters.status    && row[C.PROCESSING_STATUS] !== filters.status) return false;
      if (filters.fromDate  && new Date(row[C.DATE]) < new Date(filters.fromDate)) return false;
      if (filters.toDate    && new Date(row[C.DATE]) > new Date(filters.toDate)) return false;
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        const inSubject = (row[C.SUBJECT] || '').toLowerCase().includes(kw);
        const inSender  = (row[C.SENDER]  || '').toLowerCase().includes(kw);
        const inTopics  = (row[C.TOPICS]  || '').toLowerCase().includes(kw);
        if (!inSubject && !inSender && !inTopics) return false;
      }
      return true;
    });

    const total  = filtered.length;
    const paged  = filtered.slice((page - 1) * pageSize, page * pageSize);
    return { items: paged.map(_rowToObject), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  function _emptyStats() {
    return { total: 0, todayCount: 0, backfillCount: 0, failedCount: 0, uniqueSources: 0, topTopics: [] };
  }

  return {
    provisionSpreadsheet,
    addNewsletter,
    updateNewsletter,
    findByMessageId,
    isProcessed,
    search,
    getRecent,
    getStats,
    getSources,
  };
})();
