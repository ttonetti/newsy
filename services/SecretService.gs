// services/SecretService.gs — Secure storage for API keys
// Keys are stored in ScriptProperties with a lightweight XOR obfuscation.
// They are NEVER returned to the client; only masked status is exposed.

const SecretService = (() => {
  const props = () => PropertiesService.getScriptProperties();

  // Simple XOR obfuscation with a fixed salt derived from the script ID.
  // Not cryptographic, but prevents accidental plaintext exposure in logs.
  function _obfuscate(text) {
    const salt = ScriptApp.getScriptId().slice(0, 16).padEnd(16, '0');
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += String.fromCharCode(text.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return Utilities.base64Encode(out);
  }

  function _deobfuscate(encoded) {
    const salt = ScriptApp.getScriptId().slice(0, 16).padEnd(16, '0');
    const text = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString();
    let out = '';
    for (let i = 0; i < text.length; i++) {
      out += String.fromCharCode(text.charCodeAt(i) ^ salt.charCodeAt(i % salt.length));
    }
    return out;
  }

  function _propKey(provider) {
    return CONFIG.PROPS.API_KEY_PREFIX + provider;
  }

  // Store an API key for a provider.
  function store(provider, rawKey) {
    if (!rawKey || rawKey.trim() === '') throw new Error('Key cannot be empty');
    props().setProperty(_propKey(provider), _obfuscate(rawKey.trim()));
    CacheManager.remove('provider_status_' + provider);
  }

  // Retrieve raw key (server-side only — never send to client).
  function retrieve(provider) {
    const encoded = props().getProperty(_propKey(provider));
    if (!encoded) return null;
    try { return _deobfuscate(encoded); } catch (_) { return null; }
  }

  // Remove a stored key.
  function remove(provider) {
    props().deleteProperty(_propKey(provider));
    CacheManager.remove('provider_status_' + provider);
  }

  // Returns UI-safe status: 'configured' | 'missing'
  function getStatus(provider) {
    const encoded = props().getProperty(_propKey(provider));
    return encoded ? 'configured' : 'missing';
  }

  // Returns masked display string (never the real key).
  function getMasked(provider) {
    const raw = retrieve(provider);
    if (!raw) return null;
    if (raw.length <= 8) return '••••••••';
    return raw.slice(0, 4) + '••••••••' + raw.slice(-4);
  }

  return { store, retrieve, remove, getStatus, getMasked };
})();
