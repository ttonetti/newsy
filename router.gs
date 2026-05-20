// router.gs — Action-based request router
// Used internally when a single doGet/doPost dispatch pattern is needed.
// Most client communication goes directly via google.script.run to Code.gs functions.

const Router = (() => {

  const ROUTES = {
    // Setup
    'setup.status':    () => SetupService.getSetupStatus(),
    'setup.labels':    () => GmailService.listLabels(),
    'setup.complete':  (d) => SetupService.completeSetup(d),
    'setup.reset':     () => SetupService.resetSetup(),

    // Dashboard
    'dashboard.data':  () => ({
      stats:          IndexService.getStats(),
      recentNews:     IndexService.getRecent(10),
      backfillState:  BackfillService.getState(),
      providerStatus: ProviderService.getAllStatuses(),
      lastScanTime:   ScanService.getLastScanTime(),
    }),

    // Archive / search
    'newsletters.list':   (d) => IndexService.search(d || {}),
    'newsletters.get':    (d) => IndexService.findByMessageId(d.messageId),
    'newsletters.sources':(d) => IndexService.getSources(),

    // Backfill
    'backfill.start':    (d) => BackfillService.initBackfill(d),
    'backfill.state':    () => BackfillService.getState(),
    'backfill.pause':    () => BackfillService.pause(),
    'backfill.resume':   () => BackfillService.resume(),
    'backfill.estimate': (d) => BackfillService.estimate(d),

    // Secrets / providers
    'provider.statuses':  () => ProviderService.getAllStatuses(),
    'provider.test':      (d) => ProviderService.testConnection(d.provider),

    // Triggers
    'triggers.list':     () => TriggerService.getActiveTriggers(),
    'triggers.scan.on':  () => TriggerService.setupScanTrigger(),
    'triggers.scan.off': () => TriggerService.removeScanTrigger(),

    // Scan
    'scan.run':          () => ScanService.scan(),
  };

  function dispatch(action, data) {
    const handler = ROUTES[action];
    if (!handler) {
      return { success: false, error: `Unknown action: ${action}` };
    }
    try {
      return { success: true, data: handler(data) };
    } catch (err) {
      Logger.log(`Router error [${action}]: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  return { dispatch };
})();
