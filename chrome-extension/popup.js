'use strict';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const COPY_SUFFIX = 'のコピー';

// 「のコピー」をすべて削除する
function removeCopySuffix(name) {
  return name.split(COPY_SUFFIX).join('');
}

function showStatus(msg, type = 'info') {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = `status ${type}`;
  el.classList.remove('hidden');
}

function hideStatus() {
  document.getElementById('status').classList.add('hidden');
}

function setProgress(done, total) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('progress-text').textContent = `${done} / ${total}`;
}

// OAuth トークン取得
function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

// Drive API: 全ファイルを取得（ページング対応）
async function fetchAllFiles(token) {
  const files = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({
      fields: 'nextPageToken,files(id,name)',
      pageSize: '1000',
      q: `name contains '${COPY_SUFFIX}' and trashed = false`,
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${DRIVE_API}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return files;
}

// Drive API: ファイル名を更新
async function renameFile(token, fileId, newName) {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: newName }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `rename error ${res.status}`);
  }
}

// ---- UI state ----
let previewFiles = [];   // [{ id, name, newName }]
let token = null;
let running = false;

async function doPreview() {
  const btn = document.getElementById('preview-btn');
  btn.disabled = true;
  document.getElementById('preview-section').classList.add('hidden');
  document.getElementById('run-btn').classList.add('hidden');
  document.getElementById('cancel-btn').classList.add('hidden');
  document.getElementById('result-section').classList.add('hidden');
  hideStatus();

  try {
    showStatus('Googleアカウントに接続中…');
    token = await getAuthToken(true);

    showStatus('Drive内のファイルを検索中…');
    const files = await fetchAllFiles(token);

    previewFiles = files
      .map((f) => ({ id: f.id, name: f.name, newName: removeCopySuffix(f.name) }))
      .filter((f) => f.name !== f.newName);

    hideStatus();

    if (previewFiles.length === 0) {
      showStatus('「のコピー」を含むファイルは見つかりませんでした。', 'info');
      btn.disabled = false;
      return;
    }

    // プレビュー描画
    const countEl = document.getElementById('preview-count');
    countEl.textContent = previewFiles.length;

    const list = document.getElementById('preview-list');
    list.innerHTML = '';
    for (const f of previewFiles) {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML =
        `<span class="preview-before">${escapeHtml(f.name)}</span>` +
        `<span class="preview-arrow">→</span>` +
        `<span class="preview-after">${escapeHtml(f.newName)}</span>`;
      list.appendChild(item);
    }

    document.getElementById('preview-section').classList.remove('hidden');
    document.getElementById('run-btn').classList.remove('hidden');
    document.getElementById('cancel-btn').classList.remove('hidden');
  } catch (e) {
    showStatus(`エラー: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function doRename() {
  if (running || previewFiles.length === 0) return;
  running = true;

  const runBtn = document.getElementById('run-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const previewBtn = document.getElementById('preview-btn');
  runBtn.disabled = true;
  previewBtn.disabled = true;
  cancelBtn.disabled = true;

  document.getElementById('progress-section').classList.remove('hidden');
  setProgress(0, previewFiles.length);
  hideStatus();

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < previewFiles.length; i++) {
    const f = previewFiles[i];
    try {
      await renameFile(token, f.id, f.newName);
      successCount++;
    } catch (e) {
      console.error(`Failed to rename "${f.name}":`, e);
      failCount++;
    }
    setProgress(i + 1, previewFiles.length);
  }

  running = false;
  document.getElementById('progress-section').classList.add('hidden');
  document.getElementById('preview-section').classList.add('hidden');
  runBtn.classList.add('hidden');
  cancelBtn.classList.add('hidden');
  previewBtn.disabled = false;

  const resultEl = document.getElementById('result-section');
  const textEl = document.getElementById('result-text');

  if (failCount === 0) {
    textEl.textContent = `完了！${successCount} 件のファイルをリネームしました。`;
    showStatus(`${successCount} 件リネーム完了`, 'success');
  } else {
    textEl.textContent = `完了（成功: ${successCount} 件、失敗: ${failCount} 件）`;
    showStatus(`${failCount} 件のリネームに失敗しました`, 'error');
  }
  resultEl.classList.remove('hidden');
}

function doCancel() {
  previewFiles = [];
  document.getElementById('preview-section').classList.add('hidden');
  document.getElementById('run-btn').classList.add('hidden');
  document.getElementById('cancel-btn').classList.add('hidden');
  hideStatus();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.getElementById('preview-btn').addEventListener('click', doPreview);
document.getElementById('run-btn').addEventListener('click', doRename);
document.getElementById('cancel-btn').addEventListener('click', doCancel);
