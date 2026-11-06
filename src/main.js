import { SUITS, tileSuit, tileRank, tileName, discardHints } from './rules.js?v=21';
import { newMatch, applyAction, getLegalActions, visibleTileCounts, getAiView } from './engine.js?v=21';
import { chooseAiAction } from './ai.js?v=21';
import { audioSettings, startMusic, selectMusic, setAudioVolume, playTileSound, playRoleSound } from './audio.js?v=39';

const app = document.querySelector('#app');
const roleNames = ['吉伊', '小八', '乌萨奇', '小飞鼠'];
const modes = { normal: '普通模式', battle: '血战到底', river: '血流成河' };
const modeNotes = { normal: '首位玩家胡牌后，本副立即结算。', battle: '胡牌者离场；三家胡牌或牌墙耗尽后结算。', river: '胡牌者继续摸打，可再次胡牌；牌墙耗尽后结算。' };
const modeArt = { normal: '吉伊', battle: '小八', river: '乌萨奇' };
const difficulties = { easy: '简单', medium: '中等', hard: '困难' };
const prefs = { mode: 'normal', exchange: true, role: '乌萨奇', difficulty: 'medium', speed: 'normal', autoRiver: false, initialScore: 100, maxHuScore: 32 };
const saveKey = 'grass-mahjong-save-v1';
const guideKey = 'grass-mahjong-guide-v1';
let state = null;
let setupStep = 'mode';
let seats = [];
let selectedExchange = [];
let selectedDiscard = null;
let autoTimer = null;
let effectTimer = null;
let effect = null;
let effectNode = null;
let mountedEffect = null;
let errorText = '';
let guideSeen = false;
let savedGame = null;
let settingsOpen = false;
let rulesOpen = false;
let historyOpen = false;
let exchangeReveal = null;
let revealTimer = null;
let ignoreTileClickUntil = 0;
let hintExpanded = false;
let drawCue = null;
let drawTimer = null;
let riverZoomSeat = null;
let riverZoomIndex = null;
let moveEnter = false;
let moveTimer = null;
let eventToast = null;
let eventTimer = null;
let dragStart = null;
let dragGhost = null;
let aiPauseUntil = 0;
let promptKey = '';
let promptEntering = false;
let ignoredKongPromptKey = '';
let countsOpen = false;
let countsSuit = 0;
let wallNotice = false;
let wallTimer = null;
let wallNoticeShown = false;
let roundEnding = false;
let resultTimer = null;
let resultVoiceTimer = null;
let resultPageIndex = 0;
let resultPageMotion = '';
let resultAutoplay = true;
let resultScoreKey = '';
let resultScoreStartedAt = 0;
let resultScoreTimer = null;
let resultScoreFrame = null;
let scoreEffects = [];
let scoreTimer = null;
let scoreFrame = null;
let turnReminderKey = '';
let turnReminderTimer = null;
let turnReminderVisible = false;
let tingReminderKey = '';
let tingReminderTimer = null;
let tingReminderVisible = false;

try {
  guideSeen = localStorage.getItem(guideKey) === 'seen';
  const saved = JSON.parse(localStorage.getItem(saveKey) || 'null');
  if ([1, 2, 3].includes(saved?.version) && saved.state?.players?.length === 4 && saved.seats?.length === 4) {
    if (saved.version === 1) {
      saved.state.players.forEach(player => { player.score += 100; });
      if (saved.state.roundResult?.scores) saved.state.roundResult.scores = saved.state.roundResult.scores.map(score => score + 100);
      saved.version = 2;
    }
    saved.state.initialScore ??= saved.state.players.reduce((sum, player) => sum + player.score, 0) / 4;
    if (!('maxHuScore' in saved.state)) saved.state.maxHuScore = 32;
    saved.prefs ||= {};
    saved.prefs.initialScore ??= saved.state.initialScore;
    if (!('maxHuScore' in saved.prefs)) saved.prefs.maxHuScore = saved.state.maxHuScore;
    if (saved.state.players[0].name.startsWith('你 · ')) saved.state.players[0].name = saved.seats[0];
    savedGame = saved;
  }
} catch { /* 浏览器禁用本机存储时仍可单机游玩 */ }

function saveGame() {
  if (!state) return;
  savedGame = { version: 3, state, seats, prefs: { ...prefs }, selectedExchange, selectedDiscard };
  try { localStorage.setItem(saveKey, JSON.stringify(savedGame)); } catch { /* 存储不可用时继续当前对局 */ }
}

function clearSavedGame() {
  savedGame = null;
  try { localStorage.removeItem(saveKey); } catch { /* 同上 */ }
}

function markGuideSeen() {
  guideSeen = true;
  try { localStorage.setItem(guideKey, 'seen'); } catch { /* 同上 */ }
}

const avatar = role => `./assets/${role}.png`;
const victoryArt = role => `./assets/victory-${({ '吉伊': 'chiikawa', '小八': 'hachiware', '乌萨奇': 'usagi', '小飞鼠': 'momonga' })[role]}-v36.webp`;
const victoryPreloads = [];
function preloadVictoryArt() {
  for (const role of ['吉伊', '小八', '乌萨奇', '小飞鼠']) {
    const image = new Image();
    image.src = victoryArt(role);
    image.decode?.().catch(() => {});
    victoryPreloads.push(image);
  }
}
const decoration = (role, part) => `./assets/${role}-${part}透明图.png`;
function tileHtml(tile, { mini = false, index = null, selected = false, available = false, drawn = false, restricted = false, latest = false, lack = false, entering = false } = {}) {
  const suit = tileSuit(tile);
  const x = 40 + tileRank(tile) * 205 - 205;
  const y = [62, 312, 551][suit];
  const height = [239, 226, 228][suit];
  return `<div class="tile ${mini ? 'mini' : ''} ${selected ? 'selected' : ''} ${available ? 'available' : ''} ${drawn ? 'drawn' : ''} ${restricted ? 'restricted' : ''} ${latest ? 'latest' : ''} ${lack ? 'lack-tile' : ''} ${entering ? 'entering' : ''}" ${index === null ? '' : `data-tile-index="${index}"`} aria-label="${tileName(tile)}${lack ? '，定缺牌，先打掉' : ''}" title="${tileName(tile)}${lack ? ' · 定缺牌，先打掉' : ''}"><svg viewBox="${x} ${y} 195 ${height}" preserveAspectRatio="none" aria-hidden="true"><image href="./assets/tile-atlas.png" width="1915" height="821"/></svg>${lack ? '<span class="lack-mark">缺</span>' : ''}</div>`;
}

function setupHtml() {
  if (rulesOpen) return `<div class="app-shell"><section class="screen-card rules-screen">${rulesContent()}<button class="primary" data-action="close-rules">返回对局设置</button></section></div>`;
  if (savedGame) return `<div class="app-shell"><header class="topbar"><span class="pill">单机 · 四人 · 四副一场</span></header>
    <section class="screen-card resume-card"><h1>继续上一场？</h1><p class="intro">${modes[savedGame.state.mode]} · 第 ${savedGame.state.round}/4 副 · ${savedGame.state.players[0].score} 分</p>
    <div class="choices"><button class="primary" data-action="resume">继续本局</button><button class="choice" data-action="new-game">重新开局</button></div></section></div>`;
  if (setupStep === 'mode') return `<div class="app-shell"><header class="topbar"><span class="pill">单机 · 四人 · 四副一场</span></header>
    <section class="screen-card mode-screen"><span class="setup-step">第 1 步 / 共 2 步</span><h1>先选择牌局模式</h1><p class="intro">三种玩法，选好后再设置积分、角色与电脑难度。</p><div class="mode-grid">${Object.entries(modes).map(([key, name]) => `<button class="mode-card mode-${key}" data-config-mode="${key}"><span class="mode-art"><img src="${avatar(modeArt[key])}" alt=""></span><strong>${name}</strong><small>${modeNotes[key]}</small><span class="mode-enter">选择模式 →</span></button>`).join('')}</div></section></div>`;
  return `<div class="app-shell"><header class="topbar"><span class="pill">单机 · 四人 · 四副一场</span></header>
    <section class="screen-card"><span class="setup-step">第 2 步 / 共 2 步</span><h1>设置这一场</h1><p class="intro">已选 ${modes[prefs.mode]}。设置好其他选项后开始游戏。</p><button class="choice mode-back" data-action="back-to-modes">← 更换牌局模式</button>
    <p class="mode-note">${modeNotes[prefs.mode]}</p>
    <h3>换三张</h3><div class="choices"><button class="choice ${prefs.exchange ? 'active' : ''}" data-config-exchange="true">开启</button><button class="choice ${!prefs.exchange ? 'active' : ''}" data-config-exchange="false">关闭</button></div>
    <h3>初始积分</h3><div class="setup-score"><input type="number" min="0" step="1" inputmode="numeric" data-config-score aria-label="每家初始积分" value="${prefs.initialScore}"><span>每家相同，默认 100 分</span></div>
    <h3>胡牌得分封顶</h3><div class="choices cap-choices">${[8, 16, 32, 64, null].map(cap => `<button class="choice ${prefs.maxHuScore === cap ? 'active' : ''}" data-config-cap="${cap ?? 'unlimited'}">${cap === null ? '无限' : `${cap} 分`}</button>`).join('')}</div><p class="mode-note">总番数照常计算；封顶只限制单笔胡牌支付，杠分另算。</p>
    <h3>选择你的角色</h3><div class="choices">${roleNames.map(role => `<button class="choice role-choice ${prefs.role === role ? 'active' : ''}" data-config-role="${role}"><img src="${avatar(role)}" alt="">${role}</button>`).join('')}</div>
    <h3>电脑难度</h3><div class="choices">${Object.entries(difficulties).map(([key, value]) => `<button class="choice ${prefs.difficulty === key ? 'active' : ''}" data-config-difficulty="${key}">${value}</button>`).join('')}</div>
    <div class="setup-start-row"><button class="setup-start" data-action="start">开始游戏 <span aria-hidden="true">➜</span></button></div><div class="setup-help-row"><button class="choice" data-action="rules">玩法与番数</button></div><p class="rules-note">单机试玩 · 牌面采用已选定的 27 种标准纹样</p></section></div>`;
}

function focusedMove() {
  if (state.phase === 'reaction' && state.pending) return state.pending;
  if (!state.lastDiscard) return null;
  return state.players[state.lastDiscard.from].discards.at(-1)?.claimed ? null : state.lastDiscard;
}

function meldsHtml(seat) {
  const p = state.players[seat];
  if (!p.melds.length) return '<div class="melds"></div>';
  return `<div class="melds" aria-label="${p.name}的碰杠牌">${p.melds.map(m => {
    const count = m.kind === 'kong' ? 4 : 3;
    const hidden = m.concealed && seat !== 0;
    return `<div class="meld" title="${hidden ? '暗杠' : `${m.kind === 'kong' ? '杠' : '碰'} ${tileName(m.tile)}`}">${Array.from({ length: count }, (_, index) => `<span class="meld-tile ${!m.concealed && m.source !== undefined && m.source !== seat && index === count - 1 ? 'sideways' : ''}">${hidden ? '<i class="back meld-back"></i>' : tileHtml(m.tile, { mini: true })}</span>`).join('')}</div>`;
  }).join('')}</div>`;
}

function winMarkHtml(seat) {
  if (['roundEnd', 'matchEnd'].includes(state.phase)) return '';
  const win = state.roundWins.findLast(item => item.seat === seat);
  if (!win) return '';
  const source = win.selfDraw ? '自摸' : state.players[win.from].name;
  return `<div class="win-mark" role="status" aria-label="${source}${win.selfDraw ? '' : '点炮'}，胡${tileName(win.tile)}，${win.fan}番" title="${source}${win.selfDraw ? '' : '点炮'} · 胡${tileName(win.tile)} · ${win.fan}番"><span class="win-source">${win.selfDraw ? '自摸' : `<img src="${avatar(seats[win.from])}" alt=""><small>${source}</small>`}</span>${win.selfDraw ? '' : '<i aria-hidden="true">➜</i>'}${tileHtml(win.tile, { mini: true })}<b>胡</b></div>`;
}

function scoreValue(seat) {
  const effect = scoreEffects.find(item => item.seat === seat);
  if (!effect) return state.players[seat].score;
  const progress = Math.min(1, (performance.now() - effect.startedAt) / 1100);
  return Math.round(effect.from + (effect.to - effect.from) * (1 - (1 - progress) ** 3));
}

function scoreEffectHtml(seat) {
  const effect = scoreEffects.find(item => item.seat === seat);
  if (!effect) return '';
  return `<span class="score-float ${effect.delta > 0 ? 'gain' : 'loss'}" style="animation-delay:-${((performance.now() - effect.startedAt) / 1000).toFixed(2)}s" role="status"><small>${effect.from} → ${effect.to}</small><b>${effect.delta > 0 ? '+' : ''}${effect.delta} 分</b></span>`;
}

function clearScoreEffects() {
  if (scoreTimer) clearTimeout(scoreTimer);
  if (scoreFrame !== null) cancelAnimationFrame(scoreFrame);
  scoreTimer = null;
  scoreFrame = null;
  scoreEffects = [];
}

function seatHtml(seat, position) {
  const p = state.players[seat];
  const role = seats[seat];
  const activeClass = [state.phase === 'turn' && state.current === seat ? 'current' : '', state.roundWins.some(win => win.seat === seat) ? 'won' : '', state.mode === 'battle' && p.wins ? 'finished' : '', focusedMove()?.from === seat ? 'last-discarder' : '', moveEnter && focusedMove()?.from === seat ? 'just-discarded' : '', exchangeReveal ? 'exchanging' : ''].join(' ');
  return `<section class="seat ${position} ${activeClass}" data-role="${role}"><div class="seat-identity"><img class="avatar" src="${avatar(role)}" alt="${role}"><div><div class="seat-name">${p.name}</div><div class="seat-score"><span data-score-seat="${seat}">${scoreValue(seat)}</span> 分${scoreEffectHtml(seat)}</div></div></div><div class="seat-rack" title="${p.lack === null ? '待定缺' : `缺${SUITS[p.lack]}`}">${p.lack === null ? '' : `<span class="lack-flag">缺${SUITS[p.lack]}</span>`}<div class="backs-wrap"><div class="backs">${Array(Math.min(p.hand.length, 17)).fill('<span class="back-slot"><i class="back"></i></span>').join('')}</div></div>${meldsHtml(seat)}${winMarkHtml(seat)}</div>${drawCue?.seat === seat ? '<div class="draw-chip"><i class="back"></i><span>摸牌</span></div>' : ''}</section>`;
}

function riverHtml(seat, position) {
  const p = state.players[seat];
  const focus = focusedMove();
  const recent = p.discards.filter(discard => !discard.claimed);
  const capacity = typeof window !== 'undefined' && window.innerWidth >= 1100 && window.innerHeight >= 650 ? 18 : 12;
  const visible = recent.slice(-capacity);
  const rows = Array.from({ length: capacity / 6 }, (_, row) => Array.from({ length: 6 }, (_, column) => {
    const discard = visible[row * 6 + column];
    if (!discard) return '<span class="river-empty" aria-hidden="true"></span>';
    const latest = focus?.kind !== 'robKong' && focus?.from === seat && row * 6 + column === visible.length - 1 && discard.tile === focus.tile;
    return `<div class="river-item ${latest ? 'latest' : ''} ${latest && moveEnter ? 'entering' : ''}">${tileHtml(discard.tile, { mini: true, latest })}${latest && moveEnter ? `<span class="discard-badge"><img src="${avatar(seats[seat])}" alt="">${p.name}</span><span class="discard-bloom" aria-hidden="true">✧</span>` : ''}</div>`;
  }).join(''));
  return `<div class="river-zone river-${position}" data-river-seat="${seat}" role="button" tabindex="0" aria-label="放大查看${p.name}的牌河，共 ${p.discards.length} 张"><div class="river-tiles">${rows.map(row => `<div class="river-row">${row}</div>`).join('')}</div>${recent.length > visible.length ? `<span class="river-overflow">+${recent.length - visible.length}</span>` : ''}</div>`;
}

function drawFlightHtml() {
  return drawCue?.fromWall ? `<div class="wall-flight to-${drawCue.seat}" aria-hidden="true"><i class="wall-tile"></i></div>` : '';
}

function exchangePanel() {
  const direction = { 1: '逆时针', 2: '对家', 3: '顺时针' }[state.exchangeDirection];
  const hand = state.players[0].hand;
  const mine = state.exchangeChoices[0];
  const chosenSuit = selectedExchange.length ? tileSuit(hand[selectedExchange[0]]) : null;
  return `<div class="phase-panel">${!guideSeen ? '<div class="guide-step">第 1 步 · 选同一花色的三张牌</div>' : ''}<h2>换三张 · ${direction}</h2><p>${mine ? '你已选好，等待其他牌手。' : '点选三张同花色的牌，再确认交换。'}</p><div class="hand-row">${hand.map((tile, index) => tileHtml(tile, { index, selected: selectedExchange.includes(index), available: !mine, restricted: chosenSuit !== null && tileSuit(tile) !== chosenSuit })).join('')}</div><p class="selection-count">已选 ${chosenSuit === null ? '花色未定' : SUITS[chosenSuit]} · ${selectedExchange.length}/3 张</p>${errorText ? `<p class="error">${errorText}</p>` : ''}<button class="primary" data-action="confirm-exchange" ${mine || selectedExchange.length !== 3 ? 'disabled' : ''}>确认交换</button></div>`;
}

function lackPanel() {
  const counts = SUITS.map((_, suit) => state.players[0].hand.filter(tile => tileSuit(tile) === suit).length);
  return `<div class="phase-panel">${!guideSeen ? `<div class="guide-step">第 ${state.exchange ? 2 : 1} 步 · 选一门不要的花色</div>` : ''}<h2>选择定缺花色</h2><p>定缺牌必须先打完，手中有缺门牌时不能胡。</p><div class="choices" style="justify-content:center">${SUITS.map((suit, index) => `<button class="choice" data-lack="${index}" ${state.lackChoices[0] !== null ? 'disabled' : ''}>缺${suit} · ${counts[index]} 张</button>`).join('')}</div></div>`;
}

function exchangeRevealPanel() {
  if (!exchangeReveal) return '';
  const transfers = exchangeReveal.transfers.map(({ from, to, tiles }) => {
    const mine = from === 0 || to === 0;
    const label = from === 0 ? `送给${state.players[to].name}` : to === 0 ? `从${state.players[from].name}收到` : '';
    return `<div class="exchange-transfer from-${from} to-${to}" aria-label="${state.players[from].name}换给${state.players[to].name}三张牌">${label ? `<strong>${label}</strong>` : ''}<div class="hand-row">${mine ? tiles.map(tile => tileHtml(tile, { mini: true })).join('') : '<i class="back"></i>'.repeat(3)}</div></div>`;
  }).join('');
  return `<div class="phase-panel exchange-reveal" aria-label="换三张完成，${exchangeReveal.direction}交换"><div class="exchange-summary"><h2>换三张完成 · ${exchangeReveal.direction}</h2><p>${exchangeReveal.fromName} → 你 → ${exchangeReveal.toName}</p></div>${transfers}</div>`;
}

function settingsPanel() {
  return `<div class="phase-panel quick-panel"><h2>对局设置</h2><div class="audio-settings"><strong>背景音乐</strong><div class="music-choices">${[['A', '轻摇'], ['D', '雀跃'], ['E', '晴日'], ['F', '游园']].map(([key, name]) => `<button class="choice ${audioSettings.track === key ? 'selected' : ''}" data-music-track="${key}" aria-pressed="${audioSettings.track === key}">${name}</button>`).join('')}</div>${[['master', '总音量'], ['music', '背景音音量'], ['game', '打牌音量（角色音和动作音）']].map(([key, label]) => `<label class="audio-slider"><span>${label}</span><input type="range" min="0" max="100" value="${audioSettings[key]}" data-audio-volume="${key}"><output>${audioSettings[key]}%</output></label>`).join('')}</div><div class="choices"><button class="choice" data-action="speed">电脑速度：${prefs.speed === 'fast' ? '快速' : '常速'}</button>${state.mode === 'river' ? `<button class="choice" data-action="auto-river">自动摸切：${prefs.autoRiver ? '开' : '关'}</button>` : ''}<button class="choice" data-action="history">查看完整牌河</button><button class="choice" data-action="rules">玩法与番数</button></div><div class="settings-footer"><button class="choice" data-action="exit-game">退出牌局</button><button class="primary" data-action="close-panel">返回牌桌</button></div></div>`;
}

function rulesContent() {
  const cap = state ? state.maxHuScore : prefs.maxHuScore;
  const initial = state ? state.initialScore : prefs.initialScore;
  return `<h2>玩法与番数</h2><div class="rules-scroll">
    <h3>三种模式</h3><p>普通：首位玩家胡牌，本副结束。血战到底：胡牌者离场，三家胡牌或牌墙摸完结束。血流成河：胡牌后继续摸打，可重复胡牌，牌墙摸完结束。三种模式均打四副，开局可选择换三张，随后定缺。</p>
    <h3>基础计分规则</h3><p>总番数＝最高基础番数＋附加番数；胡牌得分＝2 × 2<sup>总番数－1</sup>＝2<sup>总番数</sup>。平胡 0 番为 1 分，每增加 1 番翻倍。基础番型只取最高一项，附加番另计；番数不设上限，杠分单独结算。</p>
    <h3>基础番型</h3><table><thead><tr><th>番型</th><th>简洁含义</th><th>增加番数</th><th>基础积分</th></tr></thead><tbody>
    <tr><td>平胡</td><td>四组顺子或刻子，加一对将牌</td><td>0 番</td><td>1 分</td></tr>
    <tr><td>对对胡（大对子）</td><td>四组刻子或杠子，加一对将牌</td><td>+1 番</td><td>2 分</td></tr>
    <tr><td>清一色</td><td>所有牌均为同一花色</td><td>+2 番</td><td>4 分</td></tr>
    <tr><td>七对</td><td>由七组对子组成，无碰杠</td><td>+2 番</td><td>4 分</td></tr>
    <tr><td>清对</td><td>清一色与对对胡的组合</td><td>+3 番</td><td>8 分</td></tr>
    <tr><td>清七对</td><td>清一色与七对的组合</td><td>+4 番</td><td>16 分</td></tr>
    <tr><td>龙七对</td><td>七对中含四张相同的牌</td><td>+4 番</td><td>16 分</td></tr>
    <tr><td>清龙七对</td><td>清一色与龙七对的组合</td><td>+5 番</td><td>32 分</td></tr></tbody></table>
    <h3>附加番型</h3><table><thead><tr><th>番型</th><th>简洁含义</th><th>增加番数</th></tr></thead><tbody>
    <tr><td>自摸</td><td>玩家自行摸牌胡牌</td><td>+1 番</td></tr>
    <tr><td>根</td><td>手牌及副露中有四张相同的牌</td><td>每根 +1 番</td></tr>
    <tr><td>杠上花</td><td>杠牌后补摸的牌直接胡牌</td><td>+1 番</td></tr>
    <tr><td>杠上炮</td><td>杠牌后打出的牌被其他玩家胡牌</td><td>+1 番</td></tr>
    <tr><td>抢杠胡</td><td>胡其他玩家补杠时使用的牌</td><td>+1 番</td></tr>
    <tr><td>海底捞月</td><td>摸牌阶段最后一张牌自摸胡牌</td><td>+1 番</td></tr>
    <tr><td>海底炮</td><td>牌局最后阶段打出的牌被其他玩家胡牌</td><td>+1 番</td></tr></tbody></table>
    <h3>支付与补充说明</h3><p>本场每家初始 ${initial} 分，单笔胡牌支付封顶为 ${cap === null ? '无限' : `${cap} 分`}。点炮由点炮玩家支付；自摸由其他尚未胡牌的玩家分别支付。龙七对的四张相同牌不重复计根，其他独立的根可额外计番；互斥附加番不可重复计算。不包含带幺九、将对、天胡、地胡等番型。直杠由放杠者付 2 分；暗杠每名在场对手付 2 分；补杠每名在场对手付 1 分。流局按花猪、退杠、查大叫结算。</p></div>`;
}

function rulesPanel() {
  return `<div class="phase-panel rules-panel">${rulesContent()}<button class="primary" data-action="close-rules">返回设置</button></div>`;
}

function historyPanel() {
  return `<div class="phase-panel history-panel"><h2>四家牌河</h2><p>按出牌顺序排列；变淡的牌已被碰或杠。</p>${state.players.map((player, seat) => `<div class="history-seat"><strong>${player.name}</strong><div class="history-tiles">${player.discards.map(discard => `<span class="${discard.claimed ? 'claimed' : ''}">${tileHtml(discard.tile, { mini: true })}</span>`).join('') || '<span>暂无出牌</span>'}</div></div>`).join('')}<button class="primary" data-action="close-panel">返回牌桌</button></div>`;
}

function riverZoomPanel() {
  const player = state.players[riverZoomSeat];
  const selected = player.discards[riverZoomIndex];
  return `<div class="phase-panel river-zoom-panel"><h2>${player.name}的牌河</h2><p>按出牌顺序排列 · 点牌可放大</p><div class="river-zoom-body"><div class="river-zoom-tiles">${player.discards.map((discard, index) => `<button class="river-zoom-tile ${discard.claimed ? 'claimed' : ''} ${index === riverZoomIndex ? 'active' : ''}" data-river-tile="${index}" aria-label="第 ${index + 1} 张，${tileName(discard.tile)}${discard.claimed ? '，已被碰杠' : ''}">${tileHtml(discard.tile, { mini: true })}</button>`).join('') || '<span>暂无出牌</span>'}</div><div class="river-zoom-detail">${selected ? `${tileHtml(selected.tile)}<strong>${tileName(selected.tile)}</strong><span>第 ${riverZoomIndex + 1} 张${selected.claimed ? ' · 已被碰杠' : ''}</span>` : '暂无出牌'}</div></div><button class="primary" data-action="close-river">返回牌桌</button></div>`;
}

function roundEndBanner() {
  return `<div class="round-end-banner" role="status" aria-live="assertive"><span>第 ${state.round}/4 副</span><strong>牌墙尽</strong><small>本副结算中</small></div>`;
}

function fanPoints(name) {
  return { 平胡: 0, 对对胡: 1, 清一色: 2, 七对: 2, 清对: 3, 清七对: 4, 龙七对: 4, 清龙七对: 5 }[name] ?? (name.startsWith('根×') ? Number(name.slice(2)) || 1 : 1);
}

function beginResultPage(index, motion = '', autoplay = true) {
  if (resultTimer) clearTimeout(resultTimer);
  resultTimer = null;
  resultPageIndex = index;
  resultPageMotion = motion;
  resultAutoplay = autoplay;
  resultScoreKey = '';
  render();
  queueResultVoice(index);
  if (autoplay && resultPageIndex + 1 < (state.roundResult?.wins.length || 0)) resultTimer = setTimeout(advanceResultPage, 3800 + state.roundResult.wins[index].names.length * 450);
}

function queueResultVoice(index, delay = 0) {
  if (resultVoiceTimer) clearTimeout(resultVoiceTimer);
  resultVoiceTimer = setTimeout(() => {
    resultVoiceTimer = null;
    const win = state?.roundResult?.wins[index];
    if (win && resultPageIndex === index) playRoleSound(seats[win.seat], 'hu');
  }, delay);
}

function advanceResultPage(manual = false) {
  if (resultTimer) clearTimeout(resultTimer);
  resultTimer = null;
  const next = resultPageIndex + 1;
  if (next < (state.roundResult?.wins.length || 0)) beginResultPage(next, 'next', !manual);
}

function previousResultPage() {
  if (resultPageIndex > 0) beginResultPage(resultPageIndex - 1, 'previous', false);
}

function winnerResultPanel() {
  const wins = state.roundResult?.wins || [];
  const win = wins[resultPageIndex];
  const player = state.players[win.seat];
  const hand = (win.hand || [...player.hand, ...(!win.selfDraw ? [win.tile] : [])]).slice().sort((a, b) => a - b);
  const highlighted = hand.lastIndexOf(win.tile);
  const melds = (win.melds || player.melds).map(meld => `<div class="winner-meld"><strong>${meld.kind === 'kong' ? '杠' : '碰'}</strong><span>${Array.from({ length: meld.kind === 'kong' ? 4 : 3 }, () => tileHtml(meld.tile, { mini: true })).join('')}</span></div>`).join('');
  const fanRows = win.names.map((name, index) => `<div class="winner-fan" style="--fan-order:${index};--fan-delay:${.45 + index * .45}s"><span>${name}</span><b>+${fanPoints(name)} 番</b></div>`).join('');
  const totalDelay = 0.6 + win.names.length * 0.45;
  const before = win.scoreBefore ?? player.score - (win.gain ?? win.points);
  const after = win.scoreAfter ?? player.score;
  const gain = win.gain ?? after - before;
  const big = win.points >= 16;
  const payments = win.payments || (win.selfDraw ? [] : [{ from: win.from, amount: win.points }]);
  const paymentText = win.selfDraw ? `自摸 · ${payments.length ? payments.map(payment => `${state.players[payment.from].name}付${payment.amount}分`).join(' · ') : '其余未胡玩家分别付款'}` : `点炮：${state.players[win.from].name}付${win.points}分`;
  const last = resultPageIndex + 1 === wins.length;
  const nextAction = last ? state.phase === 'matchEnd' ? 'reset' : 'next-round' : 'result-next';
  const nextLabel = last ? state.phase === 'matchEnd' ? '再开一场' : '下一副' : '下一位';
  const payer = !win.selfDraw && Number.isInteger(win.from) ? `<div class="winner-payer" title="${paymentText}" aria-label="${state.players[win.from].name}点炮，扣${win.points}分"><img src="${avatar(seats[win.from])}" alt=""><strong>−${win.points} 分</strong></div>` : `<small title="${paymentText}">${paymentText}</small>`;
  return `<div class="winner-result finished settling ${resultPageMotion ? 'turn-' + resultPageMotion : ''}" role="dialog" aria-label="${player.name}胡牌结算" style="--total-delay:${totalDelay}s;--points-delay:${totalDelay + .6}s;--gain-delay:${totalDelay + 1.25}s"><div class="winner-sheet"><header class="winner-heading"><span>第 ${resultPageIndex + 1} / ${wins.length} 位胡牌</span>${payer}</header><section class="winner-content"><div class="winner-profile"><div class="winner-celebration"><img src="${victoryArt(seats[win.seat])}" alt="${player.name}举起奖杯庆祝胡牌"></div></div><div class="winner-fans ${win.names.length > 4 ? 'dense' : ''}">${fanRows}</div><div class="winner-fan-total">合计 <b>${win.fan}</b> 番</div><div class="winner-points ${big ? 'burst' : ''}"><small>${win.points < 2 ** win.fan ? '封顶胡牌分' : '单家胡牌分'}</small><strong>${win.points}<em>分</em></strong></div><div class="winner-score"><strong class="winner-score-value" data-from="${before}" data-to="${after}" data-delay="${totalDelay + 1.25}" aria-label="积分由 ${before} 分变为 ${after} 分">${before}</strong><span class="winner-score-unit">分</span><strong class="winner-gain">${gain >= 0 ? '+' : ''}${gain} 分</strong></div></section><section class="winner-tiles"><div class="winner-tiles-title">胡牌</div><div class="winner-tile-line">${melds ? `<div class="winner-melds">${melds}</div>` : ''}<div class="winner-hand">${hand.map((tile, index) => `<span class="${index === highlighted ? 'winner-winning-tile' : ''}" title="${index === highlighted ? `胡${tileName(tile)}` : tileName(tile)}">${tileHtml(tile, { mini: true })}</span>`).join('')}</div></div></section><footer class="winner-controls"><div class="winner-nav">${resultPageIndex > 0 ? '<button data-action="result-previous">上一位</button>' : ''}<span class="winner-auto">${last ? '最后一位胡牌' : resultAutoplay ? '动画结束后自动下一位' : '手动查看'}</span></div><button class="primary" data-action="${nextAction}">${nextLabel}</button></footer></div></div>`;
}

function resultPanel() {
  if (state.roundResult?.wins.length) return winnerResultPanel();
  const final = state.phase === 'matchEnd';
  return `<div class="winner-result finished" role="dialog" aria-label="本副流局"><div class="winner-sheet winner-draw"><header class="winner-heading"><span>第 ${state.round}/4 副 · 牌墙尽</span></header><div class="winner-draw-body"><strong>本副流局</strong><p>无人胡牌，流局积分已结算。</p></div><footer class="winner-controls"><span></span><button class="primary" data-action="${final ? 'reset' : 'next-round'}">${final ? '再开一场' : '下一副'}</button></footer></div></div>`;
}

function countsPanel() {
  const seen = visibleTileCounts(state, 0);
  state.players[0].hand.forEach(tile => { seen[tile]++; });
  return `<div class="phase-panel counts-panel"><h2>余牌上限</h2><div class="count-suits">${SUITS.map((suit, index) => `<button class="choice ${index === countsSuit ? 'active' : ''}" data-count-suit="${index}">${suit}</button>`).join('')}</div><div class="count-tiles">${Array.from({ length: 9 }, (_, index) => { const tile = countsSuit * 9 + index; return `<div class="count-tile">${tileHtml(tile, { mini: true })}<b>${Math.max(0, 4 - seen[tile])}</b></div>`; }).join('')}</div><p>含三家暗牌，实际可摸张数可能更少</p><button class="primary" data-action="close-counts">返回牌桌</button></div>`;
}

function actionBar() {
  const actions = getLegalActions(state, 0);
  if (state.phase === 'turn' && state.current === 0) {
    const kongKey = `${state.round}:${state.events.length}`;
    const available = actions.filter(a => a.type !== 'discard' && (ignoredKongPromptKey !== kongKey || !['concealedKong', 'addKong'].includes(a.type)));
    const hasKong = available.some(a => ['concealedKong', 'addKong'].includes(a.type));
    return available.map(a => {
      if (a.type === 'hu') return '<button class="hu" data-play="hu">胡</button>';
      if (a.type === 'concealedKong') return `<button class="gang" data-play="concealedKong" data-tile="${a.tile}">暗杠 ${tileName(a.tile)}</button>`;
      return `<button class="gang" data-play="addKong" data-tile="${a.tile}" data-meld-index="${a.meldIndex}">补杠 ${tileName(a.tile)}</button>`;
    }).join('') + (hasKong ? '<button class="pass" data-action="ignore-kong">忽略</button>' : '');
  }
  if (state.phase === 'reaction') return actions.map(a => {
    const cls = { hu: 'hu', pung: 'peng', directKong: 'gang', pass: 'pass' }[a.type];
    const text = { hu: '胡', pung: '碰', directKong: `杠 ${tileName(state.pending.tile)}`, pass: '忽略' }[a.type];
    return `<button class="${cls}" data-play="${a.type}">${text}</button>`;
  }).join('');
  return '';
}

function hintHtml(tile) {
  if (!state || state.phase !== 'turn' || state.current !== 0 || tile === null) return '';
  const hint = discardHints(state.players[0], visibleTileCounts(state, 0)).find(x => x.discard === tile);
  if (!hint) return '';
  const selected = selectedDiscard !== null && state.players[0].hand[selectedDiscard] === tile;
  const waits = selected && hintExpanded ? hint.waits : hint.waits.slice(0, 3);
  return `<strong class="hint-title">听牌 · ${hint.waits.length} 种</strong><div class="hint-list">${waits.map(wait => `<span class="hint-item">${tileHtml(wait.tile, { mini: true })}<span>余 ${wait.remaining}<br>${wait.fan} 番</span></span>`).join('')}</div>${hint.waits.length > 3 ? selected ? `<button class="hint-more" data-action="hint-more">${hintExpanded ? '收起' : `展开其余 ${hint.waits.length - 3} 种`}</button>` : '<span class="small">点选此牌查看全部</span>' : ''}`;
}

function effectHtml() {
  if (!effect) return '';
  const bursts = { 吉伊: '✿　♡　✿', 小八: '✦　♫　✦', 乌萨奇: '✦　兔　✦', 小飞鼠: '✧　☁　✧' };
  return `<div class="fx-layer ${effect.kind}" data-role="${effect.role}" aria-live="polite"><div class="fx-burst">${bursts[effect.role]}</div><img src="${avatar(effect.role)}" alt=""><strong>${effect.text}</strong><span>${effect.detail}</span></div>`;
}

function syncEffect() {
  if (!effect) {
    effectNode?.remove();
    effectNode = null;
    mountedEffect = null;
    return;
  }
  if (mountedEffect !== effect) {
    effectNode?.remove();
    const container = document.createElement('div');
    container.innerHTML = effectHtml();
    effectNode = container.firstElementChild;
    document.body.append(effectNode);
    mountedEffect = effect;
  }
  const board = app.querySelector('.board')?.getBoundingClientRect();
  const seat = app.querySelector(`.seat.${['bottom', 'right', 'top', 'left'][effect.seat]}`)?.getBoundingClientRect();
  if (!board || !seat) return;
  const centerX = board.left + board.width / 2;
  const centerY = board.top + board.height / 2;
  const positions = [
    [centerX, seat.top - 42],
    [seat.left - 75, centerY],
    [centerX, seat.bottom + 42],
    [seat.right + 75, centerY]
  ];
  effectNode.style.left = `${positions[effect.seat][0]}px`;
  effectNode.style.top = `${positions[effect.seat][1]}px`;
}

function boardHtml() {
  const player = state.players[0];
  const actions = getLegalActions(state, 0);
  const myTurn = state.phase === 'turn' && state.current === 0;
  const discards = new Set(actions.filter(a => a.type === 'discard').map(a => a.tile));
  const handOrder = (exchangeReveal?.oldHand || player.hand).map((tile, index) => ({ tile, index }));
  const drawnIndex = player.drawn === null ? -1 : handOrder.findLastIndex(item => item.tile === player.drawn);
  const drawnLack = drawnIndex >= 0 && player.lack !== null && tileSuit(handOrder[drawnIndex].tile) === player.lack;
  handOrder.sort((a, b) => Number(tileSuit(a.tile) === player.lack) - Number(tileSuit(b.tile) === player.lack) || a.tile - b.tile);
  if (drawnIndex >= 0) {
    const drawn = handOrder.splice(handOrder.findIndex(item => item.index === drawnIndex), 1)[0];
    const firstLack = handOrder.findIndex(item => tileSuit(item.tile) === player.lack);
    handOrder.splice(drawnLack || firstLack < 0 ? handOrder.length : firstLack, 0, drawn);
  }
  const tingTiles = new Set(tingReminderVisible && myTurn ? discardHints(player).map(hint => hint.discard) : []);
  const hand = handOrder.map(({ tile, index }) => tileHtml(tile, { index, selected: selectedDiscard === index, available: state.phase === 'turn' && state.current === 0 && discards.has(tile), drawn: index === drawnIndex, lack: player.lack !== null && tileSuit(tile) === player.lack, entering: drawCue?.seat === 0 && index === drawnIndex }).replace('class="tile ', `class="tile ${tingTiles.has(tile) ? 'ting-glow ' : ''}`)).join('');
  const phasePanel = riverZoomSeat !== null ? riverZoomPanel() : rulesOpen ? rulesPanel() : settingsOpen ? settingsPanel() : historyOpen ? historyPanel() : countsOpen ? countsPanel() : exchangeReveal ? exchangeRevealPanel() : state.phase === 'exchange' ? exchangePanel() : state.phase === 'dingque' ? lackPanel() : ['roundEnd', 'matchEnd'].includes(state.phase) ? roundEnding ? roundEndBanner() : resultPanel() : '';
  const handNotice = errorText === '先把缺牌出完' ? '' : errorText;
  const reactionTypes = state.phase === 'reaction' ? actions.filter(action => ['hu', 'pung', 'directKong'].includes(action.type)).map(action => ({ hu: '胡', pung: '碰', directKong: '杠' })[action.type]) : [];
  const ownTypes = state.phase === 'turn' && myTurn ? actions.filter(action => action.type === 'hu' || (ignoredKongPromptKey !== `${state.round}:${state.events.length}` && ['concealedKong', 'addKong'].includes(action.type))).map(action => action.type === 'hu' ? '胡' : '杠') : [];
  const promptTypes = [...new Set([...reactionTypes, ...ownTypes])];
  const actingSeat = state.phase === 'turn' ? state.current : state.phase === 'reaction' ? state.pending?.from : null;
  const actingName = actingSeat === null || actingSeat === undefined ? '等待出牌' : `${actingSeat === 0 ? '你' : state.players[actingSeat].name}出牌`;
  const turnDirection = actingSeat === null || actingSeat === undefined ? '' : ['south', 'east', 'north', 'west'][actingSeat];
  return `<div class="app-shell"><header class="topbar"><button class="pill count-trigger" data-action="counts" aria-label="查看余牌统计">◉ 记牌</button><div class="top-meta"><button class="pill settings-trigger" data-action="settings" aria-label="对局设置">⚙ 设置</button></div></header>
    <div class="board ${myTurn ? 'my-turn' : ''}"><span class="board-flower flower-nw" aria-hidden="true">✿</span><span class="board-flower flower-ne" aria-hidden="true">✿</span><span class="board-flower flower-sw" aria-hidden="true">✿</span><span class="board-flower flower-se" aria-hidden="true">✿</span><span class="board-sprig sprig-n" aria-hidden="true">☁ ♧</span><span class="board-sprig sprig-w" aria-hidden="true">✿</span><span class="board-sprig sprig-e" aria-hidden="true">☁</span>${seatHtml(2, 'top')}${seatHtml(3, 'left')}<section class="center-area">${drawFlightHtml()}${riverHtml(2, 'north')}${riverHtml(3, 'west')}<div class="center-hub"><div class="table-status ${state.wall.length <= 10 ? 'wall-low' : ''}" aria-label="${actingName}" aria-live="polite"><span class="table-wind north${turnDirection === 'north' ? ' active' : ''}">北</span><span class="table-wind east${turnDirection === 'east' ? ' active' : ''}">东</span><span class="table-wind south${turnDirection === 'south' ? ' active' : ''}">南</span><span class="table-wind west${turnDirection === 'west' ? ' active' : ''}">西</span><span class="table-round">第 ${state.round}/4 副</span><strong class="table-remaining">余 ${state.wall.length} 张</strong>${turnDirection ? `<span class="turn-light ${turnDirection}" aria-hidden="true"></span>` : ''}</div></div>${riverHtml(1, 'east')}${riverHtml(0, 'south')}</section>${seatHtml(1, 'right')}${eventToast ? `<div class="event-toast" aria-live="polite">${eventToast}</div>` : ''}
    <section data-role="${seats[0]}" class="seat bottom ${myTurn ? 'current' : ''} ${state.roundWins.some(win => win.seat === 0) ? 'won' : ''} ${exchangeReveal ? 'exchanging' : ''}"><img class="hand-frame" src="${decoration(seats[0], '手牌外框')}" alt=""><div class="hand-mascot"><img class="mascot-open" src="${decoration(seats[0], '睁眼角色')}" alt=""><img class="mascot-blink" src="${decoration(seats[0], '眨眼角色')}" alt=""></div><div class="hand-top"><span>${seats[0]}　<strong class="seat-score"><span data-score-seat="0">${scoreValue(0)}</span> 分${scoreEffectHtml(0)}</strong>${handNotice ? `<span class="hand-notice">${handNotice}</span>` : ''}</span>${promptTypes.length ? `<div class="reaction-dock from-${state.phase === 'reaction' ? state.pending?.from : 0} ${promptEntering ? 'arriving' : ''}"><div class="actionbar">${actionBar()}</div></div>` : ''}</div><div class="bottom-main">${player.lack === null ? '' : `<span class="lack-flag">缺${SUITS[player.lack]}</span>`}<div class="hand-holder"><div class="hand-row">${hand}</div></div>${meldsHtml(0)}${winMarkHtml(0)}</div></section>${phasePanel}<div class="hint-card board-hint" id="hint">${hintHtml(selectedDiscard === null ? null : player.hand[selectedDiscard])}</div></div></div>`;
}

function animateResultScore() {
  if (resultScoreTimer) clearTimeout(resultScoreTimer);
  if (resultScoreFrame) cancelAnimationFrame(resultScoreFrame);
  resultScoreTimer = resultScoreFrame = null;
  const number = app.querySelector('.winner-score-value');
  if (!number) { resultScoreKey = ''; return; }
  const key = `${state.round}:${resultPageIndex}:${state.events.length}`;
  if (key !== resultScoreKey) { resultScoreKey = key; resultScoreStartedAt = performance.now(); }
  const from = Number(number.dataset.from);
  const to = Number(number.dataset.to);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { number.textContent = String(to); return; }
  const start = resultScoreStartedAt + Number(number.dataset.delay) * 1000;
  const tick = () => {
    if (!number.isConnected) return;
    const progress = Math.max(0, Math.min(1, (performance.now() - start) / 900));
    number.textContent = String(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));
    resultScoreFrame = progress < 1 ? requestAnimationFrame(tick) : null;
  };
  const wait = start - performance.now();
  resultScoreTimer = wait > 0 ? setTimeout(() => { resultScoreTimer = null; tick(); }, wait) : null;
  if (wait <= 0) tick();
}

function render() {
  document.body.classList.toggle('game-active', !!state);
  const nextTurnKey = state?.phase === 'turn' && state.current === 0 ? `${state.round}:${state.events.length}` : '';
  if (nextTurnKey !== turnReminderKey) {
    if (turnReminderTimer) clearTimeout(turnReminderTimer);
    turnReminderKey = nextTurnKey;
    turnReminderVisible = false;
    turnReminderTimer = nextTurnKey ? setTimeout(() => {
      turnReminderTimer = null;
      if (turnReminderKey === nextTurnKey) { turnReminderVisible = true; render(); }
    }, 8000) : null;
  }
  if (nextTurnKey !== tingReminderKey) {
    if (tingReminderTimer) clearTimeout(tingReminderTimer);
    tingReminderKey = nextTurnKey;
    tingReminderVisible = false;
    tingReminderTimer = nextTurnKey ? setTimeout(() => {
      tingReminderTimer = null;
      if (tingReminderKey === nextTurnKey) { tingReminderVisible = true; render(); }
    }, 3000) : null;
  }
  const promptActions = state ? getLegalActions(state, 0).filter(action => ['hu', 'pung', 'directKong', 'concealedKong', 'addKong'].includes(action.type)) : [];
  const visiblePromptActions = promptActions.filter(action => state.phase !== 'turn' || ignoredKongPromptKey !== `${state.round}:${state.events.length}` || !['concealedKong', 'addKong'].includes(action.type));
  const nextPromptKey = visiblePromptActions.length ? `${state.round}/${state.phase}/${state.wall.length}/${state.pending?.from ?? ''}/${state.pending?.tile ?? ''}/${visiblePromptActions.map(action => `${action.type}:${action.tile ?? ''}`).join(',')}` : '';
  promptEntering = !!nextPromptKey && nextPromptKey !== promptKey;
  promptKey = nextPromptKey;
  app.innerHTML = state ? boardHtml() : setupHtml();
  document.getElementById('wall-notice-overlay').hidden = !wallNotice;
  animateResultScore();
  if (errorText === '先把缺牌出完') {
    const seat = app.querySelector('.seat.bottom');
    const tile = seat?.querySelector('.tile.lack-tile');
    if (tile) {
      const warning = document.createElement('div');
      warning.className = 'lack-warning';
      warning.setAttribute('role', 'status');
      warning.textContent = errorText;
      seat.append(warning);
      const seatRect = seat.getBoundingClientRect();
      const tileRect = tile.getBoundingClientRect();
      warning.style.left = `${Math.max(8, Math.min(seat.clientWidth - warning.offsetWidth - 8, tileRect.left - seatRect.left - 4))}px`;
      warning.style.top = `${Math.max(4, tileRect.top - seatRect.top - warning.offsetHeight - 7)}px`;
    }
  }
  if (turnReminderVisible && nextTurnKey) {
    const reminder = document.createElement('div');
    reminder.className = 'turn-reminder';
    reminder.setAttribute('role', 'status');
    reminder.textContent = '轮到你出牌啦 ✦';
    app.querySelector('.seat.bottom')?.append(reminder);
  }
  if (scoreFrame !== null) cancelAnimationFrame(scoreFrame);
  scoreFrame = null;
  if (scoreEffects.length) {
    const tick = () => {
      scoreEffects.forEach(effect => {
        const number = app.querySelector(`[data-score-seat="${effect.seat}"]`);
        if (number) number.textContent = scoreValue(effect.seat);
      });
      scoreFrame = scoreEffects.some(effect => performance.now() - effect.startedAt < 1100) ? requestAnimationFrame(tick) : null;
    };
    scoreFrame = requestAnimationFrame(tick);
  }
  syncEffect();
  moveEnter = false;
  if (state && state.phase === 'turn' && state.current === 0) {
    const positionHint = element => {
      const hint = app.querySelector('#hint');
      const board = app.querySelector('.board');
      if (!hint || !board || !element?.getBoundingClientRect) return;
      const tileRect = element.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const hintRect = hint.getBoundingClientRect();
      hint.style.left = `${Math.max(hintRect.width / 2 + 5, Math.min(tileRect.left - boardRect.left + tileRect.width / 2, boardRect.width - hintRect.width / 2 - 5))}px`;
      hint.style.top = `${Math.max(5, tileRect.top - boardRect.top - hintRect.height - 10)}px`;
      hint.style.bottom = 'auto';
    };
    app.querySelectorAll('.seat.bottom .tile[data-tile-index]').forEach(element => {
      element.addEventListener('mouseenter', () => { const hint = app.querySelector('#hint'); if (hint) { hint.innerHTML = hintHtml(state.players[0].hand[Number(element.dataset.tileIndex)]); positionHint(element); } });
      element.addEventListener('mouseleave', () => { const hint = app.querySelector('#hint'); if (hint) { hint.innerHTML = hintHtml(selectedDiscard === null ? null : state.players[0].hand[selectedDiscard]); positionHint(app.querySelector(`.seat.bottom .tile[data-tile-index="${selectedDiscard}"]`)); } });
    });
    if (selectedDiscard !== null) positionHint(app.querySelector(`.seat.bottom .tile[data-tile-index="${selectedDiscard}"]`));
  }
}

function showEffect(previous, events) {
  const wins = state.roundWins.slice(previous.roundWins.length);
  const win = wins.sort((a, b) => b.fan - a.fan)[0];
  if (win) {
    effect = { kind: win.fan >= 5 ? 'big' : 'hu', role: seats[win.seat], seat: win.seat, text: win.fan >= 5 ? `大胡 · ${win.fan} 番` : '胡', detail: win.names.join('＋') };
  } else {
    const event = events.find(item => /暗杠|补杠|直杠|碰/.test(item));
    if (!event) return;
    const seat = state.players.findIndex(player => event.startsWith(player.name));
    effect = { kind: event.includes('碰') ? 'peng' : 'gang', role: seats[seat < 0 ? 0 : seat], seat: seat < 0 ? 0 : seat, text: event.includes('碰') ? '碰' : '杠', detail: event };
  }
  if (effectTimer) clearTimeout(effectTimer);
  effectTimer = setTimeout(() => { effect = null; effectTimer = null; render(); }, effect.kind === 'big' ? 2300 : effect.kind === 'hu' ? 850 : 1400);
}

function commit(seat, action) {
  try {
    if (seat === 0 && action.type === 'discard') clearDrag();
    const previous = state;
    const sent = previous.phase === 'exchange' && selectedExchange.length === 3 ? selectedExchange.map(index => previous.players[0].hand[index]) : null;
    const result = applyAction(state, seat, action);
    state = result.state;
    if (action.type === 'discard') playTileSound('discard');
    result.events.filter(item => /暗杠|补杠|直杠|碰/.test(item)).forEach(item => {
      const meldSeat = state.players.findIndex(player => item.startsWith(player.name));
      if (meldSeat < 0) return;
      playTileSound(item.includes('杠') ? 'kong' : 'pung');
      playRoleSound(seats[meldSeat], 'meld');
    });
    if (state.mode !== 'normal' || !['roundEnd', 'matchEnd'].includes(state.phase)) {
      state.roundWins.slice(previous.roundWins.length).forEach(win => playRoleSound(seats[win.seat], 'hu'));
    }
    const scoreChanges = state.players.map((player, index) => ({ seat: index, from: previous.players[index].score, to: player.score, delta: player.score - previous.players[index].score })).filter(item => item.delta);
    if (['roundEnd', 'matchEnd'].includes(state.phase) || state.round !== previous.round) clearScoreEffects();
    else if (scoreChanges.length) {
      if (scoreTimer) clearTimeout(scoreTimer);
      const startedAt = performance.now();
      scoreEffects = scoreChanges.map(change => ({ ...change, startedAt }));
      scoreTimer = setTimeout(() => { clearScoreEffects(); render(); }, 1800);
    }
    if (!['roundEnd', 'matchEnd'].includes(previous.phase) && ['roundEnd', 'matchEnd'].includes(state.phase)) {
      roundEnding = state.roundResult?.reason === 'wall';
      resultPageIndex = 0;
      resultPageMotion = '';
      resultAutoplay = true;
      effect = null;
      if (effectTimer) clearTimeout(effectTimer);
      if (moveTimer) clearTimeout(moveTimer);
      if (drawTimer) clearTimeout(drawTimer);
      if (eventTimer) clearTimeout(eventTimer);
      moveTimer = null; drawTimer = null; eventTimer = null;
      moveEnter = false; drawCue = null; eventToast = null;
      if (resultTimer) clearTimeout(resultTimer);
      resultTimer = roundEnding ? setTimeout(() => { roundEnding = false; resultTimer = null; if (state.roundResult?.wins.length) beginResultPage(0); else render(); }, 900) : state.roundResult?.wins.length > 1 ? setTimeout(advanceResultPage, 3800 + state.roundResult.wins[0].names.length * 450) : null;
      if (!roundEnding && state.roundResult?.wins.length) queueResultVoice(0, 1000);
    }
    if (state.round !== previous.round) {
      roundEnding = false;
      wallNoticeShown = false;
      resultPageIndex = 0;
      if (resultTimer) clearTimeout(resultTimer);
      resultTimer = null;
      if (resultVoiceTimer) clearTimeout(resultVoiceTimer);
      resultVoiceTimer = null;
    }
    if (!wallNoticeShown && previous.wall.length > 10 && state.wall.length <= 10 && !['roundEnd', 'matchEnd'].includes(state.phase)) {
      wallNoticeShown = true;
      wallNotice = true;
      if (wallTimer) clearTimeout(wallTimer);
      wallTimer = setTimeout(() => { wallNotice = false; wallTimer = null; render(); }, 2000);
    }
    if (state.round !== previous.round || ['roundEnd', 'matchEnd'].includes(state.phase)) {
      wallNotice = false;
      if (wallTimer) clearTimeout(wallTimer);
      wallTimer = null;
    }
    const aiTurn = state.phase === 'turn' && state.current > 0 ? state.current : -1;
    if (aiTurn > 0) {
      const before = previous.players[aiTurn].melds;
      const after = state.players[aiTurn].melds;
      if (after.length > before.length || after.some((meld, index) => meld.kind === 'kong' && before[index]?.kind !== 'kong')) aiPauseUntil = Date.now() + (prefs.speed === 'fast' ? 1350 : 2800);
    }
    if (action.type === 'discard' && !['roundEnd', 'matchEnd'].includes(state.phase)) {
      moveEnter = true;
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => { moveTimer = null; moveEnter = false; render(); }, 1500);
    }
    const drawEvent = result.events.find(item => item.includes('摸牌') || item.includes('补牌'));
    if (drawEvent) setTimeout(() => playTileSound('draw'), action.type === 'discard' ? 180 : 0);
    const drawSeat = drawEvent ? state.players.findIndex(player => drawEvent.startsWith(player.name)) : previous.phase === 'dingque' && state.phase === 'turn' ? state.dealer : -1;
    if (drawSeat >= 0) {
      drawCue = { seat: drawSeat, fromWall: !!drawEvent };
      if (drawTimer) clearTimeout(drawTimer);
      drawTimer = setTimeout(() => { drawTimer = null; drawCue = null; render(); }, 560);
    }
    if (sent && previous.phase === 'exchange' && state.phase === 'dingque') {
      const oldCounts = Array(27).fill(0);
      previous.players[0].hand.forEach(tile => oldCounts[tile]++);
      sent.forEach(tile => oldCounts[tile]--);
      const received = state.players[0].hand.filter(tile => oldCounts[tile]-- <= 0);
      const fromSeat = (4 - state.exchangeDirection) % 4;
      exchangeReveal = { sent, received, oldHand: previous.players[0].hand.slice(), direction: { 1: '逆时针', 2: '对家', 3: '顺时针' }[state.exchangeDirection], fromSeat, toSeat: state.exchangeDirection, fromName: state.players[fromSeat].name, toName: state.players[state.exchangeDirection].name, transfers: state.exchangeChoices.map((tiles, from) => ({ from, to: (from + state.exchangeDirection) % 4, tiles: from === fromSeat ? received : tiles })) };
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => { revealTimer = null; exchangeReveal = null; render(); scheduleAi(); }, 3200);
    }
    if (!['roundEnd', 'matchEnd'].includes(state.phase)) showEffect(previous, result.events);
    const importantEvent = result.events.findLast(item => /换三张|定缺/.test(item));
    if (importantEvent && !exchangeReveal) {
      eventToast = importantEvent;
      if (eventTimer) clearTimeout(eventTimer);
      eventTimer = setTimeout(() => { eventTimer = null; eventToast = null; render(); }, 1400);
    }
    if (seat === 0 || previous.players[0].hand.join(',') !== state.players[0].hand.join(',')) {
      errorText = '';
      selectedDiscard = null;
      hintExpanded = false;
    }
    if (seat === 0) {
      settingsOpen = false;
      rulesOpen = false;
      historyOpen = false;
      countsOpen = false;
      riverZoomSeat = null;
      riverZoomIndex = null;
    }
    if (state.phase !== 'exchange') selectedExchange = [];
    if (seat === 0 && action.type === 'discard' && !guideSeen) markGuideSeen();
    saveGame();
    render();
    scheduleAi();
  } catch (error) {
    errorText = error.message;
    render();
  }
}

function nextAiSeat() {
  if (state.phase === 'exchange') return state.exchangeChoices.findIndex((x, seat) => seat > 0 && !x);
  if (state.phase === 'dingque') return state.lackChoices.findIndex((x, seat) => seat > 0 && x === null);
  if (state.phase === 'turn') return state.current > 0 ? state.current : -1;
  if (state.phase === 'reaction') return state.pending.options.findIndex((x, seat) => seat > 0 && x && !state.pending.decisions[seat]);
  return -1;
}

function scheduleAi() {
  if (autoTimer) clearTimeout(autoTimer);
  if (!state || exchangeReveal) return;
  if (prefs.autoRiver && state.mode === 'river' && state.phase === 'turn' && state.current === 0 && state.players[0].lockedWaits) {
    const actions = getLegalActions(state, 0);
    if (actions.length === 1 && actions[0].type === 'discard') {
      autoTimer = setTimeout(() => { autoTimer = null; commit(0, actions[0]); }, prefs.speed === 'fast' ? 250 : 950);
      return;
    }
  }
  const seat = nextAiSeat();
  if (seat < 0) return;
  autoTimer = setTimeout(() => {
    autoTimer = null;
    const action = chooseAiAction(getAiView(state, seat), prefs.difficulty);
    if (action) commit(seat, action);
  }, Math.max(prefs.speed === 'fast' ? (state.phase === 'turn' ? 550 : 180) : (state.phase === 'turn' ? 1900 : state.phase === 'reaction' ? 850 : 220), effect?.kind === 'big' ? 2300 : effect ? 900 : 0, aiPauseUntil - Date.now()));
}

function clearDrag() {
  dragGhost?.remove();
  dragGhost = null;
  dragStart = null;
  app.querySelector('.board')?.classList.remove('dragging-discard', 'drop-ready');
}

function validDiscardDrop(x, y, fallback) {
  const hit = document.elementFromPoint?.(x, y) || fallback;
  if (!hit?.closest || hit.closest('.phase-panel, button, .seat.bottom, .topbar, .hint-card')) return false;
  if (hit.closest('.center-area')) return true;
  const board = hit.closest('.board');
  const hand = app.querySelector('.seat.bottom');
  return !!board && (!hand?.getBoundingClientRect || y < hand.getBoundingClientRect().top);
}

app.addEventListener('pointerdown', event => {
  if (state?.phase !== 'turn' || state.current !== 0) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const tile = event.target.closest('.seat.bottom .tile[data-tile-index]');
  if (!tile) return;
  const index = Number(tile.dataset.tileIndex);
  if (!getLegalActions(state, 0).some(action => action.type === 'discard' && action.tile === state.players[0].hand[index])) return;
  dragStart = { index, x: event.clientX, y: event.clientY, time: Date.now(), pointerId: event.pointerId, pointerType: event.pointerType, element: tile, moved: false };
});

app.addEventListener('pointermove', event => {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return;
  if (!dragStart.moved && Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y) > 9) {
    dragStart.moved = true;
    app.querySelector('.board')?.classList.add('dragging-discard');
    if (dragStart.element.cloneNode && document.body) {
      dragGhost = dragStart.element.cloneNode(true);
      dragGhost.classList.add('drag-ghost');
      dragGhost.removeAttribute('data-tile-index');
      document.body.appendChild(dragGhost);
    }
  }
  if (dragStart.moved) {
    event.preventDefault?.();
    if (dragGhost) { dragGhost.style.left = `${event.clientX}px`; dragGhost.style.top = `${event.clientY}px`; }
    app.querySelector('.board')?.classList.toggle('drop-ready', validDiscardDrop(event.clientX, event.clientY, event.target));
  }
});

app.addEventListener('pointerup', event => {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return;
  const start = dragStart;
  const moved = start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9;
  const inRiver = validDiscardDrop(event.clientX, event.clientY, event.target);
  const swiped = start.pointerType === 'touch' && start.y - event.clientY >= 48 && Math.abs(start.x - event.clientX) <= 70 && Date.now() - start.time <= 1100;
  clearDrag();
  if (!moved) return;
  ignoreTileClickUntil = Date.now() + 650;
  if (!inRiver && !swiped) return;
  const tile = state?.players[0].hand[start.index];
  if (state.phase !== 'turn' || state.current !== 0 || !getLegalActions(state, 0).some(action => action.type === 'discard' && action.tile === tile)) return;
  event.preventDefault();
  commit(0, { type: 'discard', tile });
});

app.addEventListener('pointercancel', clearDrag);

app.addEventListener('dblclick', event => {
  const tileElement = event.target.closest('.seat.bottom .tile[data-tile-index]');
  if (!tileElement || state?.phase !== 'turn' || state.current !== 0) return;
  const tile = state.players[0].hand[Number(tileElement.dataset.tileIndex)];
  if (!getLegalActions(state, 0).some(action => action.type === 'discard' && action.tile === tile)) {
    if (tileSuit(tile) !== state.players[0].lack && state.players[0].hand.some(item => tileSuit(item) === state.players[0].lack)) {
      selectedDiscard = Number(tileElement.dataset.tileIndex);
      errorText = '先把缺牌出完';
      render();
    }
    return;
  }
  event.preventDefault();
  commit(0, { type: 'discard', tile });
});

app.addEventListener('keydown', event => {
  if (event.key === 'Escape' && riverZoomSeat !== null) { riverZoomSeat = null; riverZoomIndex = null; render(); scheduleAi(); }
  if (!['Enter', ' '].includes(event.key) || event.target.dataset.riverSeat === undefined) return;
  event.preventDefault();
  riverZoomSeat = Number(event.target.dataset.riverSeat);
  riverZoomIndex = state.players[riverZoomSeat].discards.length - 1;
  render(); scheduleAi();
});

app.addEventListener('change', event => {
  if (!event.target.matches('[data-config-score]')) return;
  const score = Number(event.target.value);
  if (Number.isSafeInteger(score) && score >= 0 && event.target.value.trim() !== '') prefs.initialScore = score;
  else event.target.value = prefs.initialScore;
});

app.addEventListener('input', event => {
  const key = event.target.dataset.audioVolume;
  if (!key) return;
  setAudioVolume(key, event.target.value);
  event.target.nextElementSibling.textContent = `${audioSettings[key]}%`;
});

app.addEventListener('click', event => {
  const target = event.target.closest('button,[data-tile-index],[data-river-seat]');
  if (!target) return;
  if (Date.now() < ignoreTileClickUntil && (target.dataset.tileIndex !== undefined || target.dataset.riverSeat !== undefined)) return;
  if (target.dataset.configMode) { prefs.mode = target.dataset.configMode; setupStep = 'options'; return render(); }
  if (target.dataset.action === 'back-to-modes') { setupStep = 'mode'; return render(); }
  if (target.dataset.configExchange) { prefs.exchange = target.dataset.configExchange === 'true'; return render(); }
  if (target.dataset.configRole) { prefs.role = target.dataset.configRole; return render(); }
  if (target.dataset.configDifficulty) { prefs.difficulty = target.dataset.configDifficulty; return render(); }
  if (target.dataset.configCap !== undefined) { prefs.maxHuScore = target.dataset.configCap === 'unlimited' ? null : Number(target.dataset.configCap); return render(); }
  if (target.dataset.action === 'resume' && savedGame) {
    startMusic();
    ignoredKongPromptKey = '';
    clearScoreEffects();
    Object.assign(prefs, savedGame.prefs);
    state = savedGame.state;
    roundEnding = false;
    resultPageIndex = 0;
    wallNotice = false;
    seats = savedGame.seats;
    selectedExchange = savedGame.selectedExchange || [];
    selectedDiscard = savedGame.selectedDiscard ?? null;
    errorText = '';
    effect = null;
    moveEnter = false;
    eventToast = null;
    settingsOpen = false; rulesOpen = false; historyOpen = false; countsOpen = false; riverZoomSeat = null; riverZoomIndex = null; exchangeReveal = null;
    saveGame();
    if (['roundEnd', 'matchEnd'].includes(state.phase) && state.roundResult?.wins.length) beginResultPage(0);
    else render();
    return scheduleAi();
  }
  if (target.dataset.action === 'new-game') { clearSavedGame(); setupStep = 'mode'; return render(); }
  if (target.dataset.action === 'rules') { rulesOpen = true; settingsOpen = false; render(); return; }
  if (target.dataset.action === 'close-rules') { rulesOpen = false; settingsOpen = !!state; render(); return scheduleAi(); }
  if (target.dataset.action === 'start') {
    startMusic();
    ignoredKongPromptKey = '';
    clearScoreEffects();
    effect = null;
    moveEnter = false;
    eventToast = null;
    settingsOpen = false; rulesOpen = false; historyOpen = false; countsOpen = false; wallNotice = false; roundEnding = false; resultPageIndex = 0; riverZoomSeat = null; riverZoomIndex = null; exchangeReveal = null; aiPauseUntil = 0;
    seats = [prefs.role, ...roleNames.filter(role => role !== prefs.role)];
    state = newMatch({ mode: prefs.mode, exchange: prefs.exchange, names: seats, initialScore: prefs.initialScore, maxHuScore: prefs.maxHuScore });
    selectedExchange = [];
    selectedDiscard = null;
    saveGame();
    render();
    return scheduleAi();
  }
  if (!state) return;
  if (target.dataset.action === 'reset' || target.dataset.action === 'exit-game') {
    clearScoreEffects();
    if (autoTimer) clearTimeout(autoTimer);
    if (effectTimer) clearTimeout(effectTimer);
    if (revealTimer) clearTimeout(revealTimer);
    if (drawTimer) clearTimeout(drawTimer);
    if (moveTimer) clearTimeout(moveTimer);
    if (eventTimer) clearTimeout(eventTimer);
    if (wallTimer) clearTimeout(wallTimer);
    if (resultTimer) clearTimeout(resultTimer);
    if (resultVoiceTimer) clearTimeout(resultVoiceTimer);
    autoTimer = null; effectTimer = null; revealTimer = null; drawTimer = null; moveTimer = null; eventTimer = null; wallTimer = null; resultTimer = null; resultVoiceTimer = null; eventToast = null; wallNotice = false; wallNoticeShown = false; ignoredKongPromptKey = ''; roundEnding = false; resultPageIndex = 0; moveEnter = false; drawCue = null; effect = null; exchangeReveal = null; settingsOpen = false; rulesOpen = false; historyOpen = false; countsOpen = false; riverZoomSeat = null; riverZoomIndex = null; aiPauseUntil = 0; state = null;
    clearSavedGame();
    setupStep = 'mode';
    return render();
  }
  if (target.dataset.action === 'close-river') { riverZoomSeat = null; riverZoomIndex = null; render(); return scheduleAi(); }
  if (target.dataset.riverTile !== undefined && riverZoomSeat !== null) { riverZoomIndex = Number(target.dataset.riverTile); return render(); }
  if (target.dataset.riverSeat !== undefined && riverZoomSeat === null) {
    riverZoomSeat = Number(target.dataset.riverSeat);
    riverZoomIndex = state.players[riverZoomSeat].discards.length - 1;
    render(); return scheduleAi();
  }
  if (riverZoomSeat !== null) return;
  if (target.dataset.action === 'counts') { countsOpen = true; settingsOpen = false; render(); return scheduleAi(); }
  if (target.dataset.action === 'close-counts') { countsOpen = false; render(); return scheduleAi(); }
  if (target.dataset.countSuit !== undefined) { countsSuit = Number(target.dataset.countSuit); return render(); }
  if (target.dataset.action === 'settings') { settingsOpen = !settingsOpen; rulesOpen = false; historyOpen = false; render(); return scheduleAi(); }
  if (target.dataset.musicTrack) { selectMusic(target.dataset.musicTrack); render(); return; }
  if (target.dataset.action === 'history') { settingsOpen = false; historyOpen = true; render(); return scheduleAi(); }
  if (target.dataset.action === 'close-panel') { settingsOpen = false; historyOpen = false; render(); return scheduleAi(); }
  if (target.dataset.action === 'hint-more') { hintExpanded = !hintExpanded; return render(); }
  if (target.dataset.action === 'ignore-kong') { ignoredKongPromptKey = `${state.round}:${state.events.length}`; return render(); }
  if (target.dataset.action === 'speed') {
    prefs.speed = prefs.speed === 'fast' ? 'normal' : 'fast';
    saveGame(); render(); return scheduleAi();
  }
  if (target.dataset.action === 'auto-river') {
    prefs.autoRiver = !prefs.autoRiver;
    saveGame(); render(); return scheduleAi();
  }
  if (target.dataset.action === 'next-round') return commit(0, { type: 'nextRound' });
  if (target.dataset.action === 'result-next') { advanceResultPage(true); return; }
  if (target.dataset.action === 'result-previous') { previousResultPage(); return; }
  if (target.dataset.action === 'confirm-exchange') return commit(0, { type: 'exchange', tiles: selectedExchange.map(index => state.players[0].hand[index]) });
  if (target.dataset.lack !== undefined) return commit(0, { type: 'lack', suit: Number(target.dataset.lack) });
  if (target.dataset.play) {
    const action = { type: target.dataset.play };
    if (target.dataset.tile !== undefined) action.tile = Number(target.dataset.tile);
    if (target.dataset.meldIndex !== undefined) action.meldIndex = Number(target.dataset.meldIndex);
    return commit(0, action);
  }
  if (target.dataset.tileIndex !== undefined && state.phase === 'exchange' && !state.exchangeChoices[0]) {
    const index = Number(target.dataset.tileIndex);
    if (selectedExchange.includes(index)) selectedExchange = selectedExchange.filter(x => x !== index);
    else {
      if (selectedExchange.length && tileSuit(state.players[0].hand[index]) !== tileSuit(state.players[0].hand[selectedExchange[0]])) {
        errorText = `已选${SUITS[tileSuit(state.players[0].hand[selectedExchange[0]])]}牌；请先取消已选牌，再换花色`;
        return render();
      }
      if (selectedExchange.length < 3) selectedExchange.push(index);
    }
    errorText = '';
    saveGame();
    return render();
  }
  if (target.dataset.tileIndex !== undefined && state.phase !== 'exchange') {
    const index = Number(target.dataset.tileIndex);
    const tile = state.players[0].hand[index];
    const canDiscard = state.phase === 'turn' && state.current === 0 && getLegalActions(state, 0).some(action => action.type === 'discard' && action.tile === tile);
    if (!canDiscard) {
      selectedDiscard = index;
      errorText = tileSuit(tile) !== state.players[0].lack && state.players[0].hand.some(item => tileSuit(item) === state.players[0].lack) ? '先把缺牌出完' : '';
      saveGame();
      return render();
    }
    if (selectedDiscard === index) return commit(0, { type: 'discard', tile });
    selectedDiscard = index;
    errorText = '';
    hintExpanded = false;
    saveGame();
    return render();
  }
});

if (typeof window !== 'undefined') window.addEventListener('resize', () => { if (state) render(); });
render();
document.getElementById('landscape-start')?.addEventListener('click', async () => {
  const feedback = document.getElementById('landscape-feedback');
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!screen.orientation?.lock) throw new Error('orientation lock unavailable');
    await screen.orientation.lock('landscape');
  } catch {
    feedback.textContent = '当前浏览器无法自动旋转。请关闭竖屏锁定，并手动横置手机。';
  }
});
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) requestIdleCallback(preloadVictoryArt, { timeout: 1500 });
  else setTimeout(preloadVictoryArt, 300);
}
