const storageKey = 'grass-mahjong-audio-v1';
const tracks = { A: 'music-a.mp3', D: 'music-d.mp3', E: 'music-e.mp3', F: 'music-f.mp3' };
const sounds = { draw: 'draw.mp3', discard: 'discard.mp3', pung: 'pung.mp3', kong: 'kong.mp3', arrange: 'arrange-flip.mp3' };
const roleSounds = {
  '吉伊': { hu: 'chiikawa-hu.mp3', meld: 'chiikawa-meld.mp3' },
  '小八': { hu: 'hachiware-hu.mp3', meld: 'hachiware-meld.mp3' },
  '乌萨奇': { hu: 'usagi-hu.mp3', meld: 'usagi-meld.mp3' },
  '小飞鼠': { hu: 'momonga-hu.mp3', meld: 'momonga-meld.mp3' },
};
export const audioSettings = { track: 'D', master: 70, music: 45, game: 80 };

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (tracks[saved?.track]) audioSettings.track = saved.track;
  for (const key of ['master', 'music', 'game']) {
    if (Number.isFinite(saved?.[key])) audioSettings[key] = Math.max(0, Math.min(100, saved[key]));
  }
} catch { /* 本机存储不可用时使用默认音量 */ }

const music = new Audio(`./audio/${tracks[audioSettings.track]}`);
music.loop = true;
music.preload = 'auto';
let playing = false;
let context = null;
const buffers = new Map();
const loads = new Map();
const fallback = new Map();
const clipFiles = [...new Set([...Object.values(sounds), ...Object.values(roleSounds).flatMap(clips => Object.values(clips))])];

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(audioSettings)); } catch { /* 同上 */ }
}

function syncVolume() {
  music.volume = audioSettings.master * audioSettings.music / 10000;
}

function tryMusic() {
  if (playing && !document.hidden && music.paused) music.play().catch(() => {});
}

function loadClip(file) {
  if (!context) return Promise.resolve(null);
  if (buffers.has(file)) return Promise.resolve(buffers.get(file));
  if (!loads.has(file)) {
    loads.set(file, fetch(`./audio/${file}`)
      .then(response => { if (!response.ok) throw new Error(`Audio ${response.status}`); return response.arrayBuffer(); })
      .then(bytes => context.decodeAudioData(bytes))
      .then(buffer => { buffers.set(file, buffer); return buffer; })
      .catch(() => null));
  }
  return loads.get(file);
}

function unlockAudio() {
  if (!context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      context = new AudioContextClass();
      clipFiles.forEach(loadClip);
    }
  }
  if (context?.state === 'suspended') context.resume().catch(() => {});
  tryMusic();
}

function playClip(file, boost = 1) {
  if (!file || !playing || document.hidden || !audioSettings.master || !audioSettings.game) return;
  if (!context) unlockAudio();
  if (context) {
    if (context.state === 'suspended') context.resume().catch(() => {});
    loadClip(file).then(buffer => {
      if (!buffer || context.state !== 'running' || document.hidden) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = Math.min(1, audioSettings.master * audioSettings.game / 10000 * boost);
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      source.start();
    });
    return;
  }
  if (!fallback.has(file)) fallback.set(file, new Audio(`./audio/${file}`));
  const sound = fallback.get(file);
  sound.volume = Math.min(1, audioSettings.master * audioSettings.game / 10000 * boost);
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

syncVolume();

export function startMusic() {
  playing = true;
  tryMusic();
}

export function selectMusic(track) {
  if (!tracks[track] || track === audioSettings.track) return;
  audioSettings.track = track;
  music.pause();
  music.src = `./audio/${tracks[track]}`;
  music.load();
  syncVolume();
  save();
  tryMusic();
}

export function setAudioVolume(key, value) {
  if (!['master', 'music', 'game'].includes(key)) return;
  audioSettings[key] = Math.max(0, Math.min(100, Number(value) || 0));
  syncVolume();
  save();
  tryMusic();
}

export function playTileSound(key) {
  playClip(sounds[key]);
}

export function playRoleSound(role, key) {
  playClip(roleSounds[role]?.[key], role === '吉伊' && key === 'meld' ? 1.9 : 1.5);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) music.pause();
  else { tryMusic(); if (context?.state === 'suspended') context.resume().catch(() => {}); }
});
window.addEventListener('pageshow', tryMusic);
window.addEventListener('focus', tryMusic);
document.addEventListener('pointerdown', unlockAudio);
document.addEventListener('touchend', unlockAudio);
document.addEventListener('click', unlockAudio);
document.addEventListener('keydown', unlockAudio);
startMusic();
