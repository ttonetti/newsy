// services/SetupService.gs — Setup wizard state machine and initialization

const SetupService = (() => {
  const props = () => PropertiesService.getScriptProperties();

  // ── Public API ─────────────────────────────────────────────────────────────

  function isSetupComplete() {
    return props().getProperty(CONFIG.PROPS.SETUP_COMPLETE) === 'true';
  }

  function getSetupStatus() {
    return {
      complete: isSetupComplete(),
      data:     _getSetupData(),
      providers: {
        claude: SecretService.getStatus(CONFIG.PROVIDERS.CLAUDE),
        openai: SecretService.getStatus(CONFIG.PROVIDERS.OPENAI),
        gemini: SecretService.getStatus(CONFIG.PROVIDERS.GEMINI),
      },
    };
  }

  // Save a single wizard step. `step` is a string key, `data` is a plain object.
  function saveStep(step, data) {
    const current = _getSetupData();
    current[step] = data;
    _saveSetupData(current);
    return { saved: true, step };
  }

  // Called when the user completes the wizard.
  // Creates the Spreadsheet, Drive folders, and scan trigger.
  function completeSetup(finalData) {
    const current = _getSetupData();
    const merged  = Object.assign({}, current, finalData);
    _saveSetupData(merged);

    // Provision the spreadsheet index
    const ssId = IndexService.provisionSpreadsheet();
    props().setProperty(CONFIG.PROPS.SPREADSHEET_ID, ssId);

    // Provision the Drive archive folders
    const folderId = DriveArchiveService.provisionRootFolder();
    props().setProperty(CONFIG.PROPS.ARCHIVE_FOLDER_ID, folderId);

    // Save user preferences
    if (merged.preferences) {
      saveUserPrefs(merged.preferences);
    }

    // Handle API keys submitted in wizard
    const keys = merged.apiKeys || {};
    Object.keys(CONFIG.PROVIDERS).forEach((pConst) => {
      const p = CONFIG.PROVIDERS[pConst];
      if (keys[p]) SecretService.store(p, keys[p]);
    });

    // Set up the recurring scan trigger
    TriggerService.setupScanTrigger();

    // If user requested backfill, queue it
    if (merged.backfill && merged.backfill.enabled) {
      BackfillService.initBackfill(merged.backfill);
    }

    props().setProperty(CONFIG.PROPS.SETUP_COMPLETE, 'true');
    return { success: true };
  }

  function resetSetup() {
    TriggerService.removeAllTriggers();
    props().deleteProperty(CONFIG.PROPS.SETUP_COMPLETE);
    props().deleteProperty(CONFIG.PROPS.SETUP_DATA);
    props().deleteProperty(CONFIG.PROPS.BACKFILL_STATE);
    props().deleteProperty(CONFIG.PROPS.LAST_SCAN_TIME);
    props().deleteProperty(CONFIG.PROPS.SPREADSHEET_ID);
    props().deleteProperty(CONFIG.PROPS.ARCHIVE_FOLDER_ID);
    props().deleteProperty(CONFIG.PROPS.USER_PREFS);
    CacheManager.removePrefix('dashboard');
    CacheManager.removePrefix('search');
    return { reset: true };
  }

  function getUserPrefs() {
    const raw = props().getProperty(CONFIG.PROPS.USER_PREFS);
    if (!raw) return _defaultPrefs();
    try { return JSON.parse(raw); } catch (_) { return _defaultPrefs(); }
  }

  function saveUserPrefs(prefs) {
    const merged = Object.assign({}, _defaultPrefs(), prefs);
    props().setProperty(CONFIG.PROPS.USER_PREFS, JSON.stringify(merged));
    CacheManager.remove('user_prefs');
    return merged;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  function _getSetupData() {
    const raw = props().getProperty(CONFIG.PROPS.SETUP_DATA);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (_) { return {}; }
  }

  function _saveSetupData(data) {
    // PropertiesService values max 9KB; wizard data is small, but guard anyway.
    const json = JSON.stringify(data);
    if (json.length > 9000) {
      throw new Error('Setup data too large. Please reduce the number of saved items.');
    }
    props().setProperty(CONFIG.PROPS.SETUP_DATA, json);
  }

  function _defaultPrefs() {
    return {
      topics:             CONFIG.DEFAULT_TOPICS,
      favoriteNewsletters:[],
      newsletterLabels:   [],
      priorityLabels:     [],
      scanEnabled:        true,
      scanIntervalMinutes:CONFIG.LIMITS.SCAN_INTERVAL_MINUTES,
      preferredProvider:  CONFIG.PROVIDERS.CLAUDE,
      fallbackProvider:   CONFIG.PROVIDERS.GEMINI,
      driveFolderName:    CONFIG.DRIVE.ROOT,
    };
  }

  return {
    isSetupComplete,
    getSetupStatus,
    saveStep,
    completeSetup,
    resetSetup,
    getUserPrefs,
    saveUserPrefs,
  };
})();
