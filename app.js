'use strict';

const currentTimeEl = document.getElementById('current-time');
const currentDateEl = document.getElementById('current-date');
const alarmTimeInput = document.getElementById('alarm-time');
const alarmLabelInput = document.getElementById('alarm-label');
const addBtn = document.getElementById('add-btn');
const alarmsList = document.getElementById('alarms');
const emptyState = document.getElementById('empty-state');

let alarms = loadAlarms();
let audioCtx = null;
let ringIntervals = {};

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

function pad(n) { return String(n).padStart(2, '0'); }

function tickClock() {
  const now = new Date();
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  currentTimeEl.textContent = `${hh}:${mm}:${ss}`;

  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const d = now.getDate();
  const day = DAYS[now.getDay()];
  currentDateEl.textContent = `${y}年${mo}月${d}日（${day}）`;

  checkAlarms(now);
}

setInterval(tickClock, 1000);
tickClock();

function checkAlarms(now) {
  const currentHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  alarms.forEach((alarm) => {
    if (!alarm.enabled || ringIntervals[alarm.id]) return;
    if (alarm.time === currentHHMM) startRinging(alarm.id);
  });
}

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playBeep() {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}

function startRinging(id) {
  playBeep();
  ringIntervals[id] = setInterval(playBeep, 900);
  renderAlarms();
  if ('Notification' in window && Notification.permission === 'granted') {
    const alarm = alarms.find((a) => a.id === id);
    new Notification('⏰ アラーム！', { body: alarm?.label || '設定時刻になりました' });
  }
}

function stopRinging(id) {
  clearInterval(ringIntervals[id]);
  delete ringIntervals[id];
  renderAlarms();
}

function addAlarm() {
  const time = alarmTimeInput.value;
  if (!time) { alarmTimeInput.focus(); return; }
  const label = alarmLabelInput.value.trim();
  alarms.push({ id: Date.now(), time, label, enabled: true });
  alarms.sort((a, b) => a.time.localeCompare(b.time));
  saveAlarms();
  renderAlarms();
  alarmLabelInput.value = '';
}

function deleteAlarm(id) {
  stopRinging(id);
  alarms = alarms.filter((a) => a.id !== id);
  saveAlarms();
  renderAlarms();
}

function toggleAlarm(id) {
  const alarm = alarms.find((a) => a.id === id);
  if (!alarm) return;
  alarm.enabled = !alarm.enabled;
  if (!alarm.enabled) stopRinging(id);
  saveAlarms();
  renderAlarms();
}

function renderAlarms() {
  alarmsList.innerHTML = '';
  emptyState.style.display = alarms.length ? 'none' : 'block';

  alarms.forEach((alarm) => {
    const isRinging = !!ringIntervals[alarm.id];
    const li = document.createElement('li');
    li.className = 'alarm-item' +
      (isRinging ? ' ringing' : '') +
      (!alarm.enabled ? ' disabled-item' : '');

    li.innerHTML = `
      <div class="alarm-info">
        <span class="alarm-time-text">${alarm.time}</span>
        ${alarm.label ? `<span class="alarm-label-text">${escHtml(alarm.label)}</span>` : ''}
      </div>
      <div class="alarm-actions">
        ${isRinging ? `<button class="dismiss-btn" data-id="${alarm.id}">止める 🔕</button>` : ''}
        <label class="toggle-switch">
          <input type="checkbox" ${alarm.enabled ? 'checked' : ''} data-id="${alarm.id}" class="toggle-input" />
          <span class="slider"></span>
        </label>
        <button class="delete-btn" data-id="${alarm.id}" title="削除">✕</button>
      </div>`;

    alarmsList.appendChild(li);
  });

  alarmsList.querySelectorAll('.dismiss-btn').forEach((btn) =>
    btn.addEventListener('click', () => stopRinging(Number(btn.dataset.id))));
  alarmsList.querySelectorAll('.toggle-input').forEach((chk) =>
    chk.addEventListener('change', () => toggleAlarm(Number(chk.dataset.id))));
  alarmsList.querySelectorAll('.delete-btn').forEach((btn) =>
    btn.addEventListener('click', () => deleteAlarm(Number(btn.dataset.id))));
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function saveAlarms() { localStorage.setItem('simple-alarms', JSON.stringify(alarms)); }
function loadAlarms() {
  try { return JSON.parse(localStorage.getItem('simple-alarms')) || []; }
  catch { return []; }
}

addBtn.addEventListener('click', addAlarm);
alarmTimeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addAlarm(); });
if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();

renderAlarms();
