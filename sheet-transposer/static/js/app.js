'use strict';

// ===== DOM refs =====
const dropZone    = document.getElementById('dropZone');
const dropContent = document.getElementById('dropContent');
const fileInput   = document.getElementById('fileInput');
const previewWrap = document.getElementById('previewWrap');
const previewImg  = document.getElementById('previewImg');
const transposeBtn = document.getElementById('transposeBtn');
const clearBtn    = document.getElementById('clearBtn');
const resultCard  = document.getElementById('resultCard');
const loadingBox  = document.getElementById('loadingBox');
const resultContent = document.getElementById('resultContent');
const sheetMusic  = document.getElementById('sheetMusic');
const abcText     = document.getElementById('abcText');
const copyBtn     = document.getElementById('copyBtn');
const downloadSvgBtn = document.getElementById('downloadSvgBtn');
const retryBtn    = document.getElementById('retryBtn');

let currentFile = null;
let currentAbc  = '';

// ===== File input =====
fileInput.addEventListener('change', (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

// ===== Drag & drop =====
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleFile(file);
});

function handleFile(file) {
  currentFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    dropContent.hidden = true;
    previewWrap.hidden = false;
    resultCard.hidden = true;
  };
  reader.readAsDataURL(file);
}

// ===== Clear =====
function reset() {
  currentFile = null;
  currentAbc  = '';
  fileInput.value = '';
  dropContent.hidden = false;
  previewWrap.hidden = true;
  resultCard.hidden = true;
  sheetMusic.innerHTML = '';
  abcText.textContent = '';
}

clearBtn.addEventListener('click', reset);
retryBtn.addEventListener('click', reset);

// ===== Transpose =====
transposeBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  resultCard.hidden = false;
  loadingBox.hidden = false;
  resultContent.hidden = true;
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const formData = new FormData();
  formData.append('image', currentFile);

  try {
    const res = await fetch('/api/transpose', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    currentAbc = data.abc;
    renderResult(data.abc);
  } catch (err) {
    loadingBox.hidden = true;
    showError(err.message);
  }
});

function renderResult(abc) {
  loadingBox.hidden = true;
  resultContent.hidden = false;

  // ABC text display
  abcText.textContent = abc;

  // Render with abcjs
  sheetMusic.innerHTML = '';
  try {
    ABCJS.renderAbc('sheetMusic', abc, {
      responsive: 'resize',
      add_classes: true,
      staffwidth: 760,
      paddingright: 0,
      paddingleft: 0,
      scale: 1.2,
    });
  } catch {
    sheetMusic.innerHTML =
      '<p style="color:#c53030;padding:12px;">楽譜の描画中にエラーが発生しました。ABC記譜法テキストをご確認ください。</p>';
  }
}

function showError(msg) {
  resultContent.hidden = false;
  sheetMusic.innerHTML =
    `<div style="background:#fff5f5;border:1px solid #fed7d7;border-radius:8px;padding:16px;color:#c53030;">
      <strong>エラー:</strong> ${escHtml(msg)}
    </div>`;
  abcText.textContent = '';
}

// ===== Copy ABC =====
copyBtn.addEventListener('click', () => {
  if (!currentAbc) return;
  navigator.clipboard.writeText(currentAbc).then(() => {
    copyBtn.textContent = '✓ コピーしました';
    setTimeout(() => { copyBtn.textContent = '📋 コピー'; }, 2000);
  });
});

// ===== Download SVG =====
downloadSvgBtn.addEventListener('click', () => {
  const svgEl = sheetMusic.querySelector('svg');
  if (!svgEl) { alert('ダウンロードする楽譜がありません'); return; }
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'alto_saxophone_sheet.svg';
  a.click();
  URL.revokeObjectURL(url);
});

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
