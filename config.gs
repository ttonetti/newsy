// config.gs — Central configuration constants for Newsy
// All tuneable values live here; never scatter magic strings across services.

const CONFIG = {
  APP_NAME: 'Newsy',
  VERSION: '1.0.0',

  // ── Google Sheets sheet names ──────────────────────────────────────────────
  SHEETS: {
    INDEX:        'Index',
    SOURCES:      'Sources',
    TOPICS:       'Topics',
    STATS:        'Stats',
    QUEUE:        'Queue',
    CHECKPOINTS:  'Checkpoints',
    ERROR_LOG:    'Errors',
  },

  // ── Google Drive folder names ──────────────────────────────────────────────
  DRIVE: {
    ROOT:       'Newsy Archive',
    BY_SOURCE:  'By Source',
    BY_YEAR:    'By Year',
    NEWSPAPERS: 'Daily Newspapers',
    SUMMARIES:  'Summaries',
    TRENDS:     'Trend Reports',
  },

  // ── PropertiesService keys ─────────────────────────────────────────────────
  PROPS: {
    SETUP_COMPLETE:        'setup_complete',
    SETUP_DATA:            'setup_data',
    SPREADSHEET_ID:        'spreadsheet_id',
    ARCHIVE_FOLDER_ID:     'archive_folder_id',
    LAST_SCAN_TIME:        'last_scan_time',
    BACKFILL_STATE:        'backfill_state',
    API_KEY_PREFIX:        'ak_',
    SCAN_TRIGGER_ID:       'scan_trigger_id',
    BACKFILL_TRIGGER_ID:   'backfill_trigger_id',
    USER_PREFS:            'user_prefs',
  },

  // ── CacheService TTLs (seconds) ────────────────────────────────────────────
  CACHE: {
    DASHBOARD_STATS:  300,   // 5 min
    SEARCH_RESULTS:    60,   // 1 min
    LABEL_LIST:      3600,   // 1 hr
    SOURCE_LIST:     3600,
    PROVIDER_STATUS:   60,
    RECENT_NEWS:      120,   // 2 min
  },

  // ── Processing & quota limits ──────────────────────────────────────────────
  LIMITS: {
    BATCH_SIZE:              50,   // newsletters per batch execution
    MAX_EXEC_SECONDS:       320,   // 320s gives a 40s safety buffer vs 6-min limit
    SCAN_INTERVAL_MINUTES:   30,
    GMAIL_SEARCH_MAX:       500,   // max GmailApp.search results
    INDEX_SEARCH_MAX:      5000,   // max rows to scan in Sheets for search
    CACHE_VALUE_MAX_BYTES: 90000,  // stay under 100KB CacheService limit
  },

  // ── Newsletter auto-detection signals ─────────────────────────────────────
  DETECTION: {
    HEADERS_POSITIVE: ['list-unsubscribe', 'list-id', 'list-post', 'list-help'],
    PRECEDENCE_BULK:  ['bulk', 'list'],
    SUBJECT_PATTERNS: [
      /newsletter/i, /digest/i, /weekly/i, /daily/i,
      /issue\s*#\d/i, /edition/i, /briefing/i, /roundup/i,
    ],
    SENDER_PATTERNS: [
      /newsletter@/i, /noreply@/i, /no-reply@/i,
      /hello@/i, /hi@/i, /news@/i, /updates@/i,
    ],
    MIN_SCORE_THRESHOLD: 2,   // minimum signal score to classify as newsletter
  },

  // ── AI provider identifiers ────────────────────────────────────────────────
  PROVIDERS: {
    CLAUDE: 'claude',
    OPENAI: 'openai',
    GEMINI: 'gemini',
  },

  // ── Index sheet column positions (0-based) ────────────────────────────────
  // Keep in sync with IndexService.ensureIndexSheet()
  COL: {
    MESSAGE_ID:         0,
    THREAD_ID:          1,
    SUBJECT:            2,
    SENDER:             3,
    SENDER_EMAIL:       4,
    DATE:               5,
    LABELS:             6,
    SOURCE_NAME:        7,
    TOPICS:             8,
    ENTITIES:           9,
    SUMMARY_STATUS:    10,
    IMPORTED_AT:       11,
    FROM_BACKFILL:     12,
    DRIVE_FILE_URL:    13,
    EXTRACTED_LINKS:   14,
    CONTENT_HASH:      15,
    NEWSPAPER_IDS:     16,
    PROCESSING_STATUS: 17,
    LAST_SEEN_AT:      18,
    _COUNT:            19,   // total number of columns
  },

  // ── Default topic seed list (user can expand in onboarding) ───────────────
  DEFAULT_TOPICS: [
    'AI agents', 'OpenAI', 'Claude', 'Gemini', 'robotics', 'local LLMs',
    'coding agents', 'product design', 'AI workplace', 'automation',
    'startups', 'transmedia', 'machine learning', 'GPT', 'multimodal',
    'RAG', 'fine-tuning', 'AI safety', 'open source AI', 'AI regulation',
  ],
};
