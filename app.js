/* サックス移調くん - メインスクリプト */
(function () {
  'use strict';

  const VF = (window.Vex && window.Vex.Flow) || (window.VexFlow && window.VexFlow.Flow);
  const MU = window.MusicUtils;

  const $ = (id) => document.getElementById(id);
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');
  const previewWrap = $('preview-wrap');
  const previewImg = $('preview-img');
  const retakeBtn = $('retake-btn');
  const analyzeBtn = $('analyze-btn');
  const statusBox = $('status');
  const statusText = $('status-text');
  const errorBox = $('error-box');
  const resultCard = $('result-card');
  const detectInfo = $('detect-info');
  const sourceSelect = $('source-select');
  const targetSelect = $('target-select');
  const doremiCheck = $('doremi-check');
  const scoreInfo = $('score-info');
  const scoreContainer = $('score-container');
  const doremiContainer = $('doremi-container');
  const warningsBox = $('warnings');

  const keyPanel = $('key-panel');
  const keyInput = $('key-input');
  const keySave = $('key-save');
  const keyStatus = $('key-status');
  const keyToggle = $('key-toggle');

  const state = {
    imageBase64: null,
    mediaType: null,
    data: null,
    view: 'transposed',
    busy: false,
    serverHasKey: false,
  };

  const KEY_STORAGE = 'sax_transpose_api_key';

  /* ---------- APIキー設定 ---------- */

  function savedKey() {
    try { return localStorage.getItem(KEY_STORAGE) || null; } catch (_) { return null; }
  }

  async function initKeyPanel() {
    try {
      const res = await fetch('/api/analyze');
      const j = await res.json();
      state.serverHasKey = !!(j && j.keyConfigured && j.keyValid !== false);
    } catch (_) { /* 判定できない場合は保存済みキーに頼る */ }
    if (state.serverHasKey) {
      keyPanel.hidden = true;
      keyToggle.hidden = true;
    } else if (savedKey()) {
      keyPanel.hidden = true;
      keyToggle.hidden = false;
    } else {
      keyPanel.hidden = false;
      keyToggle.hidden = true;
    }
  }

  keyToggle.addEventListener('click', () => {
    keyPanel.hidden = false;
    keyToggle.hidden = true;
    keyInput.focus();
  });

  keySave.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!/^sk-ant-[\w-]{20,}$/.test(key)) {
      setKeyStatus('「sk-ant-」で始まるAPIキーを貼り付けてください。', 'error');
      return;
    }
    keySave.disabled = true;
    setKeyStatus('キーを確認しています…', 'info');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key, validate: true }),
      });
      const j = await res.json().catch(() => null);
      if (j && j.keyValid === false) {
        setKeyStatus('このAPIキーは無効です。コピーミスがないか確認してください。', 'error');
        return;
      }
      try { localStorage.setItem(KEY_STORAGE, key); } catch (_) {}
      keyInput.value = '';
      setKeyStatus('', 'info');
      keyPanel.hidden = true;
      keyToggle.hidden = false;
      hideError();
      showToastOnDrop('✅ APIキーを保存しました。楽譜の写真を送ってください!');
      if (state.imageBase64) analyze();
    } catch (_) {
      // 検証に失敗しても保存はしておく(オフライン等)
      try { localStorage.setItem(KEY_STORAGE, key); } catch (__) {}
      keyPanel.hidden = true;
      keyToggle.hidden = false;
    } finally {
      keySave.disabled = false;
    }
  });

  function setKeyStatus(msg, kind) {
    keyStatus.textContent = msg;
    keyStatus.hidden = !msg;
    keyStatus.className = 'key-status' + (kind === 'error' ? ' error' : '');
  }

  function showToastOnDrop(msg) {
    const el = document.querySelector('.drop-text');
    if (el) el.innerHTML = `<strong>${msg}</strong>`;
  }

  /* ---------- 画像の選択と縮小 ---------- */

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  ['dragover', 'dragenter'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('dragging'); }));
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });
  retakeBtn.addEventListener('click', () => fileInput.click());
  analyzeBtn.addEventListener('click', () => analyze());

  async function handleFile(file) {
    hideError();
    try {
      const { base64, dataUrl } = await shrinkImage(file);
      state.imageBase64 = base64;
      state.mediaType = 'image/jpeg';
      previewImg.src = dataUrl;
      previewWrap.hidden = false;
      dropZone.classList.add('compact');
      analyze();
    } catch (err) {
      showError('画像を読み込めませんでした。JPEGまたはPNGの写真でお試しください。');
    }
  }

  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 2000;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Vercelのリクエスト上限(4.5MB)に収まるまで品質を下げる
        let quality = 0.87;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 3800000 && quality > 0.4) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve({ base64: dataUrl.split(',')[1], dataUrl });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }

  /* ---------- 解析 ---------- */

  async function analyze() {
    if (!state.imageBase64 || state.busy) return;
    state.busy = true;
    hideError();
    resultCard.hidden = true;
    statusBox.hidden = false;
    statusText.textContent = 'AIが楽譜を読み取っています…(30秒〜2分ほどかかります)';

    try {
      const body = { image: state.imageBase64, mediaType: state.mediaType };
      const key = savedKey();
      if (key && !state.serverHasKey) body.apiKey = key;
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let payload = null;
      try { payload = await res.json(); } catch (_) { /* 非JSONレスポンス */ }

      if (!res.ok) {
        if (payload && (payload.error === 'no_api_key' || payload.error === 'bad_api_key')) {
          keyPanel.hidden = false;
          keyToggle.hidden = true;
        }
        const msg = (payload && payload.message) ||
          (res.status === 413 ? '画像が大きすぎます。撮り直すか小さい画像でお試しください。'
            : res.status === 504 ? '解析がタイムアウトしました。楽譜の一部だけを撮影してお試しください。'
            : `サーバーエラーが発生しました (${res.status})。もう一度お試しください。`);
        showError(msg);
        return;
      }
      if (!payload || payload.isSheetMusic === false) {
        showError('楽譜を見つけられませんでした。五線譜がはっきり写るように撮影してください。');
        return;
      }
      if (!Array.isArray(payload.measures) || payload.measures.length === 0) {
        showError('音符を読み取れませんでした。明るい場所で楽譜全体がはっきり写るように撮影してください。');
        return;
      }
      state.data = payload;
      sourceSelect.value = 'auto';
      showResult();
    } catch (err) {
      showError('通信エラーが発生しました。ネットワークを確認してもう一度お試しください。');
    } finally {
      state.busy = false;
      statusBox.hidden = true;
    }
  }

  /* ---------- 結果表示 ---------- */

  sourceSelect.addEventListener('change', renderAll);
  targetSelect.addEventListener('change', renderAll);
  doremiCheck.addEventListener('change', renderAll);
  document.querySelectorAll('.view-tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-tabs .tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.view = btn.dataset.view;
      renderAll();
    });
  });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (!state.data || resultCard.hidden) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderAll, 250);
  });

  function showResult() {
    resultCard.hidden = false;
    const d = state.data;
    const inst = d.detectedInstrument ? escapeHtml(d.detectedInstrument) : '記載なし';
    const transLabel = { C: 'C管', Bb: 'B♭管', Eb: 'E♭管', F: 'F管', unknown: '不明(C管として扱います)' }[d.sourceTransposition] || '不明';
    detectInfo.innerHTML =
      `${d.title ? `<span class="chip">曲名: ${escapeHtml(d.title)}</span>` : ''}` +
      `<span class="chip">検出楽器: ${inst}</span>` +
      `<span class="chip">判定: ${transLabel}</span>`;
    renderAll();
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function effectiveSource() {
    if (sourceSelect.value !== 'auto') return sourceSelect.value;
    const s = state.data.sourceTransposition;
    return s === 'unknown' ? 'C' : s;
  }

  function renderAll() {
    const d = state.data;
    if (!d) return;
    warningsBox.hidden = !d.warnings;
    if (d.warnings) warningsBox.textContent = '⚠️ 読み取りメモ: ' + d.warnings;

    const showDoremi = doremiCheck.checked;
    const source = effectiveSource();
    const target = targetSelect.value;
    const targetLabel = MU.TARGETS[target].label;

    if (state.view === 'original') {
      // 認識結果をそのまま表示(シフト0の"移調"で表記情報を整える)
      const t = MU.transposeScore(d.measures, d.keyFifths, 'C', fakeIdentityTarget());
      scoreInfo.textContent = `元の譜(AIの認識結果) / 調号: ${jpKey(d.keyFifths)}`;
      drawScore(t.measures, d.keyFifths, d.timeSignature, d.clef, showDoremi);
      doremiContainer.hidden = true;
      scoreContainer.hidden = false;
      return;
    }

    const t = MU.transposeScore(d.measures, d.keyFifths, source, target);
    const shiftDesc = describeShift(t.shift, t.octaveAdjust);
    scoreInfo.textContent = `${targetLabel} 用 / 調号: ${jpKey(d.keyFifths)} → ${jpKey(t.fifths)}${shiftDesc ? ' / ' + shiftDesc : ''}`;

    if (state.view === 'doremi') {
      scoreContainer.hidden = true;
      doremiContainer.hidden = false;
      drawDoremiText(t.measures);
    } else {
      doremiContainer.hidden = true;
      scoreContainer.hidden = false;
      drawScore(t.measures, t.fifths, d.timeSignature, d.clef, showDoremi);
    }
  }

  // シフト0でスペルだけ整えるためのダミーターゲット
  function fakeIdentityTarget() {
    if (!MU.TARGETS.__identity) {
      MU.TARGETS.__identity = { label: '元の譜', offset: 0, low: 0, high: 127 };
    }
    return '__identity';
  }

  function describeShift(shift, octaveAdjust) {
    const total = shift + octaveAdjust; // 実際に楽譜へ適用される半音数
    if (total === 0) return '移調なし(音はそのまま)';
    const names = { 0: '', 1: '短2度', 2: '長2度', 3: '短3度', 4: '長3度', 5: '完全4度', 6: '増4度', 7: '完全5度', 8: '短6度', 9: '長6度', 10: '短7度', 11: '長7度' };
    const abs = Math.abs(total);
    const octaves = Math.floor(abs / 12);
    const pc = abs % 12;
    let interval = '';
    if (octaves > 0) interval += `${octaves}オクターブ`;
    if (pc > 0) interval += (interval ? '+' : '') + names[pc];
    const dir = total > 0 ? '上げ' : '下げ';
    return `${interval}${dir} (${total > 0 ? '+' : ''}${total}半音)`;
  }

  function jpKey(fifths) {
    const f = Math.max(-7, Math.min(7, fifths || 0));
    const name = MU.keyName(f).replace('#', '♯').replace('b', '♭');
    const sig = f === 0 ? '♮なし' : f > 0 ? `♯${f}` : `♭${-f}`;
    return `${name}dur (${sig})`;
  }

  /* ---------- VexFlow描画 ---------- */

  function drawScore(measures, fifths, timeSig, clef, showDoremi) {
    scoreContainer.innerHTML = '';
    if (!VF) {
      scoreContainer.textContent = '楽譜描画ライブラリを読み込めませんでした。';
      return;
    }
    const keySig = MU.keyName(Math.max(-7, Math.min(7, fifths || 0)));
    const keyAccMap = keySignatureMap(fifths);
    const containerWidth = Math.max(320, scoreContainer.clientWidth || resultCard.clientWidth || 700);
    const usable = containerWidth - 2;

    // 小節ごとの推定幅 → 行に割り付け
    const FIRST_EXTRA = 90; // 音部記号+調号ぶん
    const est = measures.map((m) => Math.max(120, 55 + m.notes.length * 42));
    const lines = [];
    let line = [], lineW = FIRST_EXTRA;
    measures.forEach((m, i) => {
      const w = est[i];
      if (line.length > 0 && lineW + w > usable) {
        lines.push(line);
        line = []; lineW = FIRST_EXTRA;
      }
      line.push(i);
      lineW += w;
    });
    if (line.length) lines.push(line);

    const lineHeight = showDoremi ? 155 : 125;
    const height = lines.length * lineHeight + 30;

    const renderer = new VF.Renderer(scoreContainer, VF.Renderer.Backends.SVG);
    renderer.resize(containerWidth, height);
    const ctx = renderer.getContext();

    lines.forEach((idxs, li) => {
      // 行の幅いっぱいに広げる
      const sumEst = idxs.reduce((a, i) => a + est[i], 0) + FIRST_EXTRA;
      const factor = Math.min(1.6, usable / sumEst);
      let x = 1;
      const y = li * lineHeight + 8;

      idxs.forEach((mi, pos) => {
        const first = pos === 0;
        let w = Math.floor(est[mi] * factor) + (first ? FIRST_EXTRA : 0);
        if (pos === idxs.length - 1) w = Math.max(w, usable - x); // 端まで伸ばす
        const stave = new VF.Stave(x, y, w);
        if (first) {
          stave.addClef(clef === 'bass' ? 'bass' : 'treble');
          stave.addKeySignature(keySig);
          if (li === 0 && timeSig && timeSig.numerator) {
            stave.addTimeSignature(`${timeSig.numerator}/${timeSig.denominator}`);
          }
        }
        stave.setContext(ctx).draw();

        try {
          const notes = measures[mi].notes.map((n) => makeNote(n, clef, keyAccMap, showDoremi));
          if (notes.length) {
            const beams = VF.Beam.generateBeams(notes);
            VF.Formatter.FormatAndDraw(ctx, stave, notes);
            beams.forEach((b) => b.setContext(ctx).draw());
          }
        } catch (err) {
          // 1小節の失敗で全体を止めない
          console.warn('measure render failed', mi, err);
        }
        x += w;
      });
    });
  }

  function keySignatureMap(fifths) {
    const SHARPS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    const FLATS = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    const map = {};
    const f = Math.max(-7, Math.min(7, fifths || 0));
    if (f > 0) SHARPS.slice(0, f).forEach((l) => { map[l] = '#'; });
    if (f < 0) FLATS.slice(0, -f).forEach((l) => { map[l] = 'b'; });
    return map;
  }

  function makeNote(n, clef, keyAccMap, showDoremi) {
    const isBass = clef === 'bass';
    if (n.rest) {
      const dur = (n.duration || 'q') + (n.dotted ? 'd' : '') + 'r';
      const note = new VF.StaveNote({ keys: [isBass ? 'd/3' : 'b/4'], duration: dur, dots: n.dotted ? 1 : 0, clef: isBass ? 'bass' : 'treble' });
      if (n.dotted) VF.Dot.buildAndAttach([note], { all: true });
      return note;
    }
    const acc = n.acc || '';
    const key = `${n.letter.toLowerCase()}${acc}/${n.octave}`;
    const dur = (n.duration || 'q') + (n.dotted ? 'd' : '');
    const note = new VF.StaveNote({
      keys: [key],
      duration: dur,
      dots: n.dotted ? 1 : 0,
      clef: isBass ? 'bass' : 'treble',
      auto_stem: true,
    });
    const expected = keyAccMap[n.letter] || '';
    if (acc !== expected) {
      note.addModifier(new VF.Accidental(acc === '' ? 'n' : acc), 0);
    }
    if (n.dotted) VF.Dot.buildAndAttach([note], { all: true });
    if (showDoremi && n.doremi) {
      const ann = new VF.Annotation(n.doremi)
        .setFont('sans-serif', 11)
        .setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM);
      note.addModifier(ann, 0);
    }
    return note;
  }

  function drawDoremiText(measures) {
    const parts = measures.map((m) => {
      const inner = m.notes.map((n) => {
        if (n.rest) return '<span class="dm rest">﹣</span>';
        const long = n.duration === 'w' || n.duration === 'h';
        return `<span class="dm${long ? ' long' : ''}">${n.doremi}${n.dotted ? '·' : ''}</span>`;
      }).join('');
      return `<span class="dm-measure">${inner}</span>`;
    });
    doremiContainer.innerHTML = parts.join('<span class="barline">|</span>');
  }

  /* ---------- 共通 ---------- */

  function showError(msg) {
    errorBox.textContent = '⚠️ ' + msg;
    errorBox.hidden = false;
    statusBox.hidden = true;
  }
  function hideError() { errorBox.hidden = true; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // テスト用フック: 解析結果を直接流し込んで描画を確認できる
  window.__setAnalysis = function (data) {
    state.data = data;
    showResult();
  };

  initKeyPanel();
})();
