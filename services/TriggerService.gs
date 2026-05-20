// services/TriggerService.gs — GAS time-based trigger management

const TriggerService = (() => {
  const props = () => PropertiesService.getScriptProperties();

  // ── Scan trigger ───────────────────────────────────────────────────────────

  function setupScanTrigger() {
    removeScanTrigger(); // remove existing before creating

    const trigger = ScriptApp.newTrigger('triggerScan')
      .timeBased()
      .everyMinutes(CONFIG.LIMITS.SCAN_INTERVAL_MINUTES)
      .create();

    props().setProperty(CONFIG.PROPS.SCAN_TRIGGER_ID, trigger.getUniqueId());
    return { triggerId: trigger.getUniqueId() };
  }

  function removeScanTrigger() {
    _removeTriggerByPropKey(CONFIG.PROPS.SCAN_TRIGGER_ID);
  }

  // ── Backfill trigger ───────────────────────────────────────────────────────

  function setupBackfillTrigger() {
    removeBackfillTrigger(); // ensure only one

    const trigger = ScriptApp.newTrigger('triggerBackfillBatch')
      .timeBased()
      .everyMinutes(5)
      .create();

    props().setProperty(CONFIG.PROPS.BACKFILL_TRIGGER_ID, trigger.getUniqueId());
    return { triggerId: trigger.getUniqueId() };
  }

  function removeBackfillTrigger() {
    _removeTriggerByPropKey(CONFIG.PROPS.BACKFILL_TRIGGER_ID);
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  function removeAllTriggers() {
    ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
    props().deleteProperty(CONFIG.PROPS.SCAN_TRIGGER_ID);
    props().deleteProperty(CONFIG.PROPS.BACKFILL_TRIGGER_ID);
  }

  function getActiveTriggers() {
    const scanId     = props().getProperty(CONFIG.PROPS.SCAN_TRIGGER_ID);
    const backfillId = props().getProperty(CONFIG.PROPS.BACKFILL_TRIGGER_ID);
    const all        = ScriptApp.getProjectTriggers();

    return {
      scan: {
        active: all.some((t) => t.getUniqueId() === scanId),
        id:     scanId,
      },
      backfill: {
        active: all.some((t) => t.getUniqueId() === backfillId),
        id:     backfillId,
      },
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  function _removeTriggerByPropKey(propKey) {
    const id = props().getProperty(propKey);
    if (!id) return;
    ScriptApp.getProjectTriggers().forEach((t) => {
      if (t.getUniqueId() === id) ScriptApp.deleteTrigger(t);
    });
    props().deleteProperty(propKey);
  }

  return {
    setupScanTrigger,
    removeScanTrigger,
    setupBackfillTrigger,
    removeBackfillTrigger,
    removeAllTriggers,
    getActiveTriggers,
  };
})();
