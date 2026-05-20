// services/ProviderService.gs — AI provider abstraction layer
// Routes AI calls to Claude, OpenAI, or Gemini; handles fallback and status.

const ProviderService = (() => {

  // ── Status ─────────────────────────────────────────────────────────────────

  function getAllStatuses() {
    return {
      claude: _getStatus(CONFIG.PROVIDERS.CLAUDE),
      openai: _getStatus(CONFIG.PROVIDERS.OPENAI),
      gemini: _getStatus(CONFIG.PROVIDERS.GEMINI),
    };
  }

  function _getStatus(provider) {
    return {
      status: SecretService.getStatus(provider),
      masked: SecretService.getMasked(provider),
    };
  }

  // Test a provider's API key with a minimal request.
  function testConnection(provider) {
    const key = SecretService.retrieve(provider);
    if (!key) return { ok: false, error: 'No API key configured' };

    try {
      switch (provider) {
        case CONFIG.PROVIDERS.CLAUDE: return _testClaude(key);
        case CONFIG.PROVIDERS.OPENAI: return _testOpenAI(key);
        case CONFIG.PROVIDERS.GEMINI: return _testGemini(key);
        default: return { ok: false, error: 'Unknown provider' };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Main call interface ────────────────────────────────────────────────────

  // options: { provider?, model?, maxTokens?, temperature?, systemPrompt? }
  function call(prompt, options) {
    const prefs    = SetupService.getUserPrefs();
    const primary  = options.provider || prefs.preferredProvider  || CONFIG.PROVIDERS.CLAUDE;
    const fallback = prefs.fallbackProvider || CONFIG.PROVIDERS.GEMINI;

    try {
      return _dispatch(primary, prompt, options);
    } catch (primaryErr) {
      Logger.log(`Provider ${primary} failed: ${primaryErr.message}, trying fallback ${fallback}`);
      try {
        return _dispatch(fallback, prompt, options);
      } catch (fallbackErr) {
        throw new Error(`All providers failed. Last error: ${fallbackErr.message}`);
      }
    }
  }

  function _dispatch(provider, prompt, options) {
    const key = SecretService.retrieve(provider);
    if (!key) throw new Error(`No API key for ${provider}`);

    switch (provider) {
      case CONFIG.PROVIDERS.CLAUDE: return _callClaude(key, prompt, options);
      case CONFIG.PROVIDERS.OPENAI: return _callOpenAI(key, prompt, options);
      case CONFIG.PROVIDERS.GEMINI: return _callGemini(key, prompt, options);
      default: throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // ── Claude ─────────────────────────────────────────────────────────────────

  function _callClaude(key, prompt, options) {
    const body = {
      model:      options.model      || 'claude-sonnet-4-6',
      max_tokens: options.maxTokens  || 1024,
      messages:   [{ role: 'user', content: prompt }],
    };
    if (options.systemPrompt) body.system = options.systemPrompt;

    const resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method:  'post',
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      payload:            JSON.stringify(body),
      muteHttpExceptions: true,
    });

    const json = JSON.parse(resp.getContentText());
    if (resp.getResponseCode() !== 200) throw new Error(json.error?.message || 'Claude API error');
    return json.content[0].text;
  }

  function _testClaude(key) {
    try {
      _callClaude(key, 'Reply with one word: ready', { maxTokens: 10 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── OpenAI ─────────────────────────────────────────────────────────────────

  function _callOpenAI(key, prompt, options) {
    const messages = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const body = {
      model:      options.model     || 'gpt-4o-mini',
      max_tokens: options.maxTokens || 1024,
      messages,
    };

    const resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method:  'post',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });

    const json = JSON.parse(resp.getContentText());
    if (resp.getResponseCode() !== 200) throw new Error(json.error?.message || 'OpenAI API error');
    return json.choices[0].message.content;
  }

  function _testOpenAI(key) {
    try {
      _callOpenAI(key, 'Reply with one word: ready', { maxTokens: 10 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ── Gemini ─────────────────────────────────────────────────────────────────

  function _callGemini(key, prompt, options) {
    const model = options.model || 'gemini-1.5-flash';
    const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: options.maxTokens || 1024 },
    };
    if (options.systemPrompt) {
      body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }

    const resp = UrlFetchApp.fetch(url, {
      method:  'post',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });

    const json = JSON.parse(resp.getContentText());
    if (resp.getResponseCode() !== 200) throw new Error(json.error?.message || 'Gemini API error');
    return json.candidates[0].content.parts[0].text;
  }

  function _testGemini(key) {
    try {
      _callGemini(key, 'Reply with one word: ready', { maxTokens: 10 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  return { getAllStatuses, testConnection, call };
})();
