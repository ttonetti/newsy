// services/GmailService.gs — Gmail access: detection, metadata extraction, body retrieval

const GmailService = (() => {

  // ── Label discovery ────────────────────────────────────────────────────────

  function listLabels() {
    return CacheManager.getOrCompute('gmail_labels', () => {
      return GmailApp.getUserLabels().map((l) => ({
        id:   l.getId ? l.getId() : l.getName(),
        name: l.getName(),
      }));
    }, CONFIG.CACHE.LABEL_LIST);
  }

  // ── Message retrieval ──────────────────────────────────────────────────────

  // Returns up to maxResults GmailMessage objects matching query.
  function searchMessages(query, maxResults) {
    const limit   = Math.min(maxResults || CONFIG.LIMITS.GMAIL_SEARCH_MAX, CONFIG.LIMITS.GMAIL_SEARCH_MAX);
    const threads = GmailApp.search(query, 0, Math.ceil(limit / 1));
    const messages = [];
    for (const thread of threads) {
      const msgs = thread.getMessages();
      for (const msg of msgs) {
        messages.push(msg);
        if (messages.length >= limit) return messages;
      }
    }
    return messages;
  }

  // Returns count estimate (GmailApp doesn't provide true counts; we cap search).
  function estimateCount(query) {
    const threads = GmailApp.search(query, 0, 500);
    return threads.length; // undercount for large sets, but safe
  }

  // ── Newsletter detection ───────────────────────────────────────────────────

  // Returns { isNewsletter: bool, score: int, signals: string[] }
  function detectNewsletter(message) {
    const signals = [];
    let score = 0;

    // ── Headers (most reliable signals) ─────────────────────────────────────
    // GmailMessage.getHeader(name) is the correct GAS method
    const listUnsub = message.getHeader('List-Unsubscribe');
    if (listUnsub) {
      signals.push('header:list-unsubscribe');
      score += 3; // strongest signal — almost exclusively newsletters
    }

    const listId = message.getHeader('List-ID') || message.getHeader('List-Id');
    if (listId) {
      signals.push('header:list-id');
      score += 3;
    }

    const listPost = message.getHeader('List-Post');
    if (listPost) { signals.push('header:list-post'); score += 1; }

    const precedence = message.getHeader('Precedence');
    if (precedence && CONFIG.DETECTION.PRECEDENCE_BULK.some((v) => precedence.toLowerCase().includes(v))) {
      signals.push('precedence:bulk');
      score += 2;
    }

    // ── Subject patterns ─────────────────────────────────────────────────────
    const subject = message.getSubject() || '';
    CONFIG.DETECTION.SUBJECT_PATTERNS.forEach((re) => {
      if (re.test(subject)) { signals.push('subject:' + re.source); score += 1; }
    });

    // ── Sender patterns ──────────────────────────────────────────────────────
    const from = message.getFrom() || '';
    CONFIG.DETECTION.SENDER_PATTERNS.forEach((re) => {
      if (re.test(from)) { signals.push('sender:' + re.source); score += 1; }
    });

    // ── Body signals (unsubscribe link in body) ───────────────────────────────
    // Only check body if score is still 0, to avoid quota waste
    if (score === 0) {
      try {
        const plain = message.getPlainBody() || '';
        const bodyLower = plain.slice(0, 3000).toLowerCase(); // only check start
        if (bodyLower.includes('unsubscribe') || bodyLower.includes('manage preferences') ||
            bodyLower.includes('view in browser') || bodyLower.includes('view online')) {
          signals.push('body:unsubscribe-link');
          score += 2;
        }
      } catch (_) {}
    }

    return {
      isNewsletter: score >= CONFIG.DETECTION.MIN_SCORE_THRESHOLD,
      score,
      signals,
    };
  }

  // ── Metadata extraction ────────────────────────────────────────────────────

  function extractMetadata(message) {
    const rawHeaders = _getRawHeaders(message);
    const from       = message.getFrom() || '';
    const senderEmail= _parseEmail(from);
    const sourceName = _parseDisplayName(from) || senderEmail.split('@')[1] || from;

    return {
      messageId:   message.getId(),
      threadId:    message.getThread().getId(),
      subject:     message.getSubject() || '(no subject)',
      sender:      from,
      senderEmail: senderEmail,
      sourceName:  sourceName,
      date:        message.getDate().toISOString(),
      labels:      message.getThread().getLabels().map((l) => l.getName()),
      listId:      _getHeader(rawHeaders, 'list-id') || '',
    };
  }

  // Returns the HTML body; falls back to plain text wrapped in <pre>.
  function getBody(message) {
    let body = '';
    try {
      body = message.getBody(); // HTML
    } catch (_) {}

    if (!body) {
      const plain = message.getPlainBody() || '';
      body = '<pre style="white-space:pre-wrap">' + _escapeHtml(plain) + '</pre>';
    }
    return body;
  }

  // Returns a content hash for deduplication.
  function contentHash(message) {
    const text = (message.getSubject() || '') + (message.getFrom() || '') +
                 message.getDate().toISOString();
    return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text)
      .map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
      .join('');
  }

  // Extract <a href> links from HTML body (up to 50).
  function extractLinks(htmlBody) {
    const links = [];
    const re = /<a[^>]+href=["']([^"']+)["']/gi;
    let match;
    while ((match = re.exec(htmlBody)) !== null && links.length < 50) {
      const url = match[1];
      if (url.startsWith('http')) links.push(url);
    }
    return links;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  // Parse email address from "Display Name <email@domain.com>"
  function _parseEmail(from) {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from.trim();
  }

  // Parse display name from "Display Name <email>"
  function _parseDisplayName(from) {
    const match = from.match(/^([^<]+)</);
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  }

  function _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    listLabels,
    searchMessages,
    estimateCount,
    detectNewsletter,
    extractMetadata,
    getBody,
    contentHash,
    extractLinks,
  };
})();
