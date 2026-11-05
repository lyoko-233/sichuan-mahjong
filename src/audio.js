const storageKey = 'grass-mahjong-audio-v1';
const tracks = { A: 'music-a.mp3', D: 'music-d.mp3', E: 'music-e.mp3', F: 'music-f.mp3' };
const sounds = { draw: 'draw.mp3', discard: 'discard.mp3', pung: 'pung.mp3', kong: 'kong.mp3' };
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
music.preload = 'metadata';
const effects = Object.fromEntries(Object.entries(sounds).map(([key, file]) => {
  const sound = new Audio(`./audio/${file}`);
  sound.preload = 'auto';
  return [key, sound];
}));
const voices = Object.fromEntries(Object.entries(roleSounds).map(([role, clips]) => [role,
  Object.fromEntries(Object.entries(clips).map(([key, file]) => {
    const sound = new Audio(`./audio/${file}`);
    sound.preload = 'auto';
    return [key, sound];
  }))
]));
let playing = false;

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(audioSettings)); } catch { /* 同上 */ }
}

function syncVolume() {
  music.volume = audioSettings.master * audioSettings.music / 10000;
  Object.values(effects).forEach(sound => { sound.volume = audioSettings.master * audioSettings.game / 10000; });
  Object.entries(voices).forEach(([role, clips]) => Object.entries(clips).forEach(([key, sound]) => {
    sound.volume = Math.min(1, audioSettings.master * audioSettings.game / 10000 * (role === '吉伊' && key === 'meld' ? 1.5 : 1));
  }));
}

syncVolume();

export function startMusic() {
  playing = true;
  if (!document.hidden) music.play().catch(() => {});
}

export function selectMusic(track) {
  if (!tracks[track] || track === audioSettings.track) return;
  audioSettings.track = track;
  music.pause();
  music.src = `./audio/${tracks[track]}`;
  music.load();
  syncVolume();
  save();
  if (playing && !document.hidden) music.play().catch(() => {});
}

export function setAudioVolume(key, value) {
  if (!['master', 'music', 'game'].includes(key)) return;
  audioSettings[key] = Math.max(0, Math.min(100, Number(value) || 0));
  syncVolume();
  save();
}

export function playTileSound(key) {
  const sound = effects[key];
  if (!sound || !playing || document.hidden) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

export function playRoleSound(role, key) {
  const sound = voices[role]?.[key];
  if (!sound || !playing || document.hidden) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) music.pause();
  else if (playing) music.play().catch(() => {});
});

startMusic();
function unlockMusic() {
  startMusic();
  document.removeEventListener('pointerdown', unlockMusic);
  document.removeEventListener('keydown', unlockMusic);
}
document.addEventListener('pointerdown', unlockMusic);
document.addEventListener('keydown', unlockMusic);
