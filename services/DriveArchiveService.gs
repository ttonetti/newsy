// services/DriveArchiveService.gs — Google Drive newsletter archive management

const DriveArchiveService = (() => {
  const props = () => PropertiesService.getScriptProperties();

  // ── Provisioning ───────────────────────────────────────────────────────────

  // Creates (or retrieves existing) root archive folder. Returns folder ID.
  function provisionRootFolder(customName) {
    const name = customName || CONFIG.DRIVE.ROOT;
    const folder = _getOrCreateRootFolder(name);

    // Pre-create standard sub-folders
    _getOrCreateFolder(folder, CONFIG.DRIVE.BY_SOURCE);
    _getOrCreateFolder(folder, CONFIG.DRIVE.BY_YEAR);
    _getOrCreateFolder(folder, CONFIG.DRIVE.NEWSPAPERS);
    _getOrCreateFolder(folder, CONFIG.DRIVE.SUMMARIES);
    _getOrCreateFolder(folder, CONFIG.DRIVE.TRENDS);

    return folder.getId();
  }

  // ── Newsletter archiving ───────────────────────────────────────────────────

  // Saves a newsletter HTML to Drive. Returns { fileId, fileUrl }.
  function saveNewsletter(htmlBody, metadata) {
    const root = _getRootFolder();

    // Save under /By Year/YYYY/MM-MonthName/
    const dateFolder  = _getDateFolder(root, new Date(metadata.date));
    const filename    = _safeFilename(metadata) + '.html';
    const wrapped     = _wrapHtml(htmlBody, metadata);
    const file        = dateFolder.createFile(filename, wrapped, MimeType.HTML);
    file.setDescription(`Newsletter: ${metadata.subject} | ${metadata.sender}`);

    // Also save under /By Source/SourceName/
    const sourceFolder = _getSourceFolder(root, metadata.sourceName);
    sourceFolder.createShortcut(file.getId());

    return {
      fileId:  file.getId(),
      fileUrl: `https://drive.google.com/file/d/${file.getId()}/view`,
    };
  }

  // ── Folder helpers ─────────────────────────────────────────────────────────

  function _getRootFolder() {
    const storedId = props().getProperty(CONFIG.PROPS.ARCHIVE_FOLDER_ID);
    if (storedId) {
      try { return DriveApp.getFolderById(storedId); } catch (_) {}
    }
    return _getOrCreateRootFolder(CONFIG.DRIVE.ROOT);
  }

  function _getOrCreateRootFolder(name) {
    const existing = DriveApp.getFoldersByName(name);
    if (existing.hasNext()) return existing.next();
    return DriveApp.createFolder(name);
  }

  function _getOrCreateFolder(parent, name) {
    const existing = parent.getFoldersByName(name);
    if (existing.hasNext()) return existing.next();
    return parent.createFolder(name);
  }

  function _getDateFolder(root, date) {
    const yearStr  = date.getFullYear().toString();
    const monthNum = String(date.getMonth() + 1).padStart(2, '0');
    const monthName= date.toLocaleString('en-US', { month: 'long' });
    const monthStr = `${monthNum}-${monthName}`;

    const byYear   = _getOrCreateFolder(root, CONFIG.DRIVE.BY_YEAR);
    const yearDir  = _getOrCreateFolder(byYear, yearStr);
    return _getOrCreateFolder(yearDir, monthStr);
  }

  function _getSourceFolder(root, sourceName) {
    const bySource = _getOrCreateFolder(root, CONFIG.DRIVE.BY_SOURCE);
    return _getOrCreateFolder(bySource, _safeFolderName(sourceName));
  }

  // ── Filename helpers ───────────────────────────────────────────────────────

  function _safeFilename(metadata) {
    const date = new Date(metadata.date);
    const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const subject = (metadata.subject || 'no-subject').replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().slice(0, 60);
    return `${dateStr}_${subject.replace(/\s+/g, '-')}`;
  }

  function _safeFolderName(name) {
    return (name || 'Unknown').replace(/[\/\\:*?"<>|]/g, '-').trim().slice(0, 100);
  }

  // ── HTML wrapper ───────────────────────────────────────────────────────────

  // Wraps raw email HTML with metadata header for archive readability.
  function _wrapHtml(body, metadata) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${_esc(metadata.subject)}</title>
<style>
  .newsy-header{font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
    background:#1D1D1F;color:#F5F5F7;padding:16px 24px;font-size:13px;line-height:1.6}
  .newsy-header strong{display:block;font-size:15px;margin-bottom:4px}
  .newsy-header a{color:#6AC4F5;text-decoration:none}
  .newsy-body{max-width:800px;margin:0 auto;padding:16px}
</style>
</head>
<body>
<div class="newsy-header">
  <strong>📰 ${_esc(metadata.subject)}</strong>
  From: ${_esc(metadata.sender)} &nbsp;·&nbsp;
  Date: ${_esc(new Date(metadata.date).toLocaleString())} &nbsp;·&nbsp;
  Source: ${_esc(metadata.sourceName)}<br>
  Archived by Newsy · messageId: ${_esc(metadata.messageId)}
</div>
<div class="newsy-body">
${body}
</div>
</body>
</html>`;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { provisionRootFolder, saveNewsletter };
})();
