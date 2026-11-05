import { MODES, tileSuit, tileName, tileCounts, nextSeat, evaluateHu, waitingTiles, legalDiscards } from './rules.js?v=21';

const fail = message => { throw Error(message); };
const log = (s, message) => s.events.push(message);
const sortHand = p => p.hand.sort((a, b) => a - b);
const active = (s, seat) => s.mode !== 'battle' || s.players[seat].wins === 0;
const rand = s => ((s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const take = (p, tile, count = 1) => {
  for (let i = 0; i < count; i++) {
    const at = p.hand.indexOf(tile);
    if (at < 0) fail('手牌数量不足');
    p.hand.splice(at, 1);
  }
};
const sameWaits = (a, b) => a.length === b.length && a.every((tile, i) => tile === b[i]);
const waitIds = (hand, melds, lack) => waitingTiles(hand, melds, lack).map(x => x.tile);

function transfer(s, from, to, amount, kind, detail = '', gangOwner = null) {
  if (from === to || amount <= 0) return;
  s.players[from].score -= amount;
  s.players[to].score += amount;
  s.ledger.push({ id: s.ledger.length, from, to, amount, kind, detail, gangOwner, refunded: false });
}

function shuffle(s) {
  const tiles = Array.from({ length: 108 }, (_, index) => Math.floor(index / 4));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

function startRound(s) {
  s.wall = shuffle(s);
  s.players = s.players.map(p => ({ ...p, hand: [], melds: [], discards: [], winTiles: [], lack: null, wins: 0, passFan: -1, lockedWaits: null, drawn: null }));
  for (let n = 0; n < 13; n++) for (let seat = 0; seat < 4; seat++) s.players[seat].hand.push(s.wall.pop());
  s.players[s.dealer].drawn = s.wall.pop();
  s.players[s.dealer].hand.push(s.players[s.dealer].drawn);
  s.players.forEach(sortHand);
  s.current = s.dealer;
  s.phase = s.exchange ? 'exchange' : 'dingque';
  s.exchangeDirection = s.exchange ? [1, 3, 2][Math.floor(rand(s) * 3)] : null;
  s.exchangeChoices = [null, null, null, null];
  s.lackChoices = [null, null, null, null];
  s.pending = null;
  s.lastDiscard = null;
  s.lastDrawWasLast = false;
  s.firstDiscard = false;
  s.firstWinner = null;
  s.nextDealer = s.dealer;
  s.afterKong = null;
  s.lastKong = null;
  s.ledger = [];
  s.roundWins = [];
  s.roundResult = null;
  log(s, `第 ${s.round} 副开始，${s.players[s.dealer].name}坐庄`);
}

export function newMatch({ mode = 'normal', exchange = true, seed = Date.now(), names = ['你', '电脑一', '电脑二', '电脑三'], initialScore = 100, maxHuScore = 32 } = {}) {
  if (!MODES.includes(mode)) fail('未知模式');
  if (!Number.isSafeInteger(initialScore) || initialScore < 0) fail('初始积分须为非负整数');
  if (maxHuScore !== null && ![8, 16, 32, 64].includes(maxHuScore)) fail('未知胡牌封顶分');
  const s = {
    mode, exchange: !!exchange, seed: Number(seed) >>> 0, round: 1, initialScore, maxHuScore,
    players: names.map((name, seat) => ({ seat, name, score: initialScore })), events: [],
  };
  if (s.players.length !== 4) fail('必须四位玩家');
  s.dealer = Math.floor(rand(s) * 4);
  startRound(s);
  return s;
}

function huContext(s, seat, selfDraw, robKong = false) {
  return {
    selfDraw,
    kongDraw: selfDraw && s.afterKong === seat,
    kongDiscard: !selfDraw && !robKong && s.lastKong?.owner === s.lastDiscard?.from && s.lastKong?.pendingDiscard,
    robKong,
    lastTile: s.wall.length === 0 && s.lastDrawWasLast,
  };
}

function huResult(s, seat, tile, selfDraw, robKong = false) {
  const p = s.players[seat];
  if (p.lockedWaits && !p.lockedWaits.includes(tile)) return null;
  const hand = selfDraw ? p.hand : [...p.hand, tile];
  const result = evaluateHu({ hand, melds: p.melds, lack: p.lack, context: huContext(s, seat, selfDraw, robKong) });
  return result && result.fan > p.passFan ? result : null;
}

function kongAllowedWhenLocked(p, kind, tile, meldIndex = -1) {
  if (!p.lockedWaits) return true;
  const hand = p.hand.slice();
  const melds = structuredClone(p.melds);
  if (kind === 'concealed') {
    for (let i = 0; i < 4; i++) hand.splice(hand.indexOf(tile), 1);
    melds.push({ kind: 'kong', tile, source: p.seat, concealed: true });
  } else {
    hand.splice(hand.indexOf(tile), 1);
    melds[meldIndex] = { ...melds[meldIndex], kind: 'kong' };
  }
  return sameWaits(waitIds(hand, melds, p.lack), p.lockedWaits);
}

function turnActions(s, seat) {
  if (s.phase !== 'turn' || seat !== s.current) return [];
  const p = s.players[seat];
  const options = [];
  const winTile = p.drawn;
  if (winTile !== null && huResult(s, seat, winTile, true)) options.push({ type: 'hu' });
  if (options.length && s.wall.length <= 4) return options;
  if (s.wall.length) {
    const counts = tileCounts(p.hand);
    for (let tile = 0; tile < 27; tile++) {
      if (counts[tile] === 4 && tileSuit(tile) !== p.lack && kongAllowedWhenLocked(p, 'concealed', tile)) options.push({ type: 'concealedKong', tile });
    }
    for (let i = 0; i < p.melds.length; i++) {
      const m = p.melds[i];
      if (m.kind === 'pung' && counts[m.tile] && kongAllowedWhenLocked(p, 'add', m.tile, i)) options.push({ type: 'addKong', tile: m.tile, meldIndex: i });
    }
  }
  for (const tile of legalDiscards(p)) options.push({ type: 'discard', tile });
  return options;
}

function reactionActions(s, seat) {
  const pending = s.pending;
  if (s.phase !== 'reaction' || !pending || pending.from === seat || pending.decisions[seat]) return [];
  return pending.options[seat] || [];
}

export function getLegalActions(s, seat) {
  if (seat < 0 || seat >= 4) return [];
  if (s.phase === 'exchange') return s.exchangeChoices[seat] ? [] : [{ type: 'exchange', count: 3 }];
  if (s.phase === 'dingque') return s.lackChoices[seat] === null ? [0, 1, 2].map(suit => ({ type: 'lack', suit })) : [];
  if (s.phase === 'turn') return turnActions(s, seat);
  if (s.phase === 'reaction') return reactionActions(s, seat);
  if (s.phase === 'roundEnd' && seat === 0) return [{ type: 'nextRound' }];
  return [];
}

function advance(s, from) {
  if (s.mode === 'battle' && s.players.filter(p => p.wins).length >= 3) return endRound(s, 'threeWins');
  if (s.wall.length === 0) return endRound(s, 'wall');
  let seat = nextSeat(from);
  while (!active(s, seat)) seat = nextSeat(seat);
  s.current = seat;
  const p = s.players[seat];
  p.drawn = s.wall.pop();
  p.hand.push(p.drawn);
  sortHand(p);
  p.passFan = -1;
  s.afterKong = null;
  s.lastDrawWasLast = s.wall.length === 0;
  s.phase = 'turn';
  log(s, `${p.name}摸牌（牌墙余 ${s.wall.length}）`);
}

function makeReaction(s, kind, from, tile, meldIndex = -1) {
  const options = [null, null, null, null];
  for (let seat = 0; seat < 4; seat++) {
    if (seat === from || !active(s, seat)) continue;
    const p = s.players[seat];
    const actions = [];
    if (huResult(s, seat, tile, false, kind === 'robKong')) actions.push({ type: 'hu' });
    if (actions.length && s.wall.length <= 4) { options[seat] = actions; continue; }
    if (kind === 'discard' && !p.lockedWaits && tileSuit(tile) !== p.lack) {
      const count = p.hand.filter(t => t === tile).length;
      if (count >= 3 && s.wall.length) actions.push({ type: 'directKong' });
      if (count >= 2) actions.push({ type: 'pung' });
    }
    if (actions.length) {
      actions.push({ type: 'pass' });
      options[seat] = actions;
    }
  }
  s.pending = { kind, from, tile, meldIndex, options, decisions: [null, null, null, null] };
  if (options.some(Boolean)) s.phase = 'reaction';
  else resolveReactions(s);
}

function kongPayment(s, owner, kind, from = null) {
  const firstId = s.ledger.length;
  if (kind === 'direct') transfer(s, from, owner, 2, 'gang', '直杠', owner);
  else for (let seat = 0; seat < 4; seat++) if (seat !== owner && active(s, seat)) transfer(s, seat, owner, kind === 'concealed' ? 2 : 1, 'gang', kind === 'concealed' ? '暗杠' : '补杠', owner);
  if (s.lastKong?.owner === owner && s.lastKong.pendingDiscard) s.lastKong.ledgerIds.push(...s.ledger.slice(firstId).map(x => x.id));
  else s.lastKong = { owner, ledgerIds: s.ledger.slice(firstId).map(x => x.id), pendingDiscard: true, shifted: false };
}

function drawSupplement(s, seat) {
  const p = s.players[seat];
  if (!s.wall.length) fail('牌墙已空，不能杠');
  p.drawn = s.wall.pop();
  p.hand.push(p.drawn);
  sortHand(p);
  p.passFan = -1;
  s.current = seat;
  s.afterKong = seat;
  s.lastDrawWasLast = s.wall.length === 0;
  s.phase = 'turn';
  log(s, `${p.name}杠后补牌`);
}

function shiftGangIncome(s, winners, from) {
  const kong = s.lastKong;
  if (!kong || kong.owner !== from || !kong.pendingDiscard || kong.shifted) return;
  const pool = kong.ledgerIds.reduce((sum, id) => sum + s.ledger[id].amount, 0);
  if (!pool) return;
  const share = Math.ceil(pool / winners.length);
  winners.forEach(seat => transfer(s, from, seat, share, 'gangShift', '杠上炮呼叫转移', from));
  kong.shifted = true;
}

function settleHu(s, seat, from, tile, selfDraw, robKong = false) {
  const p = s.players[seat];
  const result = huResult(s, seat, tile, selfDraw, robKong);
  if (!result) fail('当前不能胡牌');
  const scoreBefore = p.score;
  const hand = selfDraw ? p.hand.slice() : [...p.hand, tile];
  const melds = structuredClone(p.melds);
  const paymentStart = s.ledger.length;
  if (s.firstWinner === null) {
    s.firstWinner = seat;
    s.nextDealer = seat;
  }
  const unit = s.maxHuScore == null ? result.score : Math.min(result.score, s.maxHuScore);
  if (selfDraw) {
    for (let other = 0; other < 4; other++) if (other !== seat && !s.players[other].wins) transfer(s, other, seat, unit, 'hu', '自摸');
  } else transfer(s, from, seat, unit, 'hu', robKong ? '抢杠胡' : '点炮');
  p.wins++;
  const payments = s.ledger.slice(paymentStart).filter(entry => entry.kind === 'hu' && entry.to === seat).map(entry => ({ from: entry.from, amount: entry.amount }));
  s.roundWins.push({ seat, from, tile, selfDraw, fan: result.fan, names: result.names, points: unit, robKong, hand, melds, scoreBefore, scoreAfter: p.score, gain: p.score - scoreBefore, payments });
  log(s, `${p.name}${selfDraw ? '自摸' : robKong ? '抢杠胡' : '点炮胡'} ${tileName(tile)} · ${result.fan} 番（${result.names.join('＋')}）`);
  if (s.mode === 'river' && !p.lockedWaits) {
    if (selfDraw) { take(p, tile); p.winTiles.push(tile); }
    p.lockedWaits = waitIds(p.hand, p.melds, p.lack);
    p.drawn = null;
  } else if (s.mode === 'river' && selfDraw) {
    take(p, tile);
    p.winTiles.push(tile);
    p.drawn = null;
  }
}

function resolveReactions(s) {
  const pending = s.pending;
  const { from, tile } = pending;
  const choices = pending.decisions.map((decision, seat) => ({ seat, decision })).filter(x => x.decision);
  const winners = choices.filter(x => x.decision.type === 'hu').map(x => x.seat);
  if (winners.length) {
    const firstHuEvent = s.firstWinner === null;
    if (pending.kind === 'robKong') {
      take(s.players[from], tile);
      s.players[from].drawn = null;
      s.players[from].discards.push({ tile, robbed: true, claimed: false });
      s.lastDiscard = { from, tile, first: false };
    } else {
      if (s.lastKong?.owner === from && s.lastKong.pendingDiscard) shiftGangIncome(s, winners, from);
    }
    winners.forEach(seat => settleHu(s, seat, from, tile, false, pending.kind === 'robKong'));
    if (firstHuEvent && winners.length > 1) s.nextDealer = from;
    if (s.mode === 'normal') endRound(s, 'firstWin');
    else advance(s, from);
  } else if (pending.kind === 'robKong') {
    const p = s.players[from];
    take(p, tile);
    p.melds[pending.meldIndex].kind = 'kong';
    kongPayment(s, from, 'add');
    log(s, `${p.name}补杠 ${tileName(tile)}`);
    drawSupplement(s, from);
  } else {
    const claims = choices.filter(x => ['directKong', 'pung'].includes(x.decision.type));
    claims.sort((a, b) => {
      const rank = type => type === 'directKong' ? 0 : 1;
      return rank(a.decision.type) - rank(b.decision.type) || (a.seat - from + 4) % 4 - (b.seat - from + 4) % 4;
    });
    const choice = claims[0];
    if (choice) {
      const p = s.players[choice.seat];
      const kong = choice.decision.type === 'directKong';
      take(p, tile, kong ? 3 : 2);
      p.melds.push({ kind: kong ? 'kong' : 'pung', tile, source: from, concealed: false });
      const river = s.players[from].discards.at(-1);
      river.claimed = true;
      p.drawn = null;
      s.current = choice.seat;
      log(s, `${p.name}${kong ? '直杠' : '碰'} ${tileName(tile)}`);
      if (kong) { kongPayment(s, choice.seat, 'direct', from); drawSupplement(s, choice.seat); }
      else { s.phase = 'turn'; s.afterKong = null; }
    } else advance(s, from);
  }
  if (s.pending === pending) s.pending = null;
  if (pending.kind === 'discard' && s.lastKong?.owner === from && s.lastKong.pendingDiscard) s.lastKong.pendingDiscard = false;
}

function applyExchange(s) {
  const received = [[], [], [], []];
  for (let seat = 0; seat < 4; seat++) {
    const target = (seat + s.exchangeDirection) % 4;
    received[target] = s.exchangeChoices[seat];
    s.exchangeChoices[seat].forEach(tile => take(s.players[seat], tile));
  }
  for (let seat = 0; seat < 4; seat++) {
    s.players[seat].hand.push(...received[seat]);
    sortHand(s.players[seat]);
  }
  s.phase = 'dingque';
  log(s, `换三张完成（${{ 1: '逆时针', 2: '对家', 3: '顺时针' }[s.exchangeDirection]}）`);
}

function endRound(s, reason) {
  if (s.phase === 'roundEnd' || s.phase === 'matchEnd') return;
  if (reason === 'wall') {
    const checked = s.players.map((p, seat) => {
      if (s.mode === 'battle' && p.wins) return { seat, exempt: true };
      if (s.mode === 'river' && p.wins) return { seat, waits: p.lockedWaits, alreadyWon: true };
      const flower = p.hand.some(tile => tileSuit(tile) === p.lack);
      return { seat, flower, waits: flower ? [] : waitingTiles(p.hand, p.melds, p.lack) };
    });
    const eligible = checked.filter(x => !x.exempt);
    for (const payer of eligible.filter(x => x.flower)) for (const receiver of eligible.filter(x => !x.flower && x.seat !== payer.seat)) transfer(s, payer.seat, receiver.seat, 16, 'flower', '花猪');
    const unready = eligible.filter(x => !x.alreadyWon && !x.waits?.length);
    const unreadySeats = new Set(unready.map(x => x.seat));
    for (const entry of s.ledger.filter(x => x.gangOwner !== null && unreadySeats.has(x.gangOwner) && !x.refunded).slice()) {
      entry.refunded = true;
      transfer(s, entry.to, entry.from, entry.amount, 'refund', '退杠');
    }
    const ready = eligible.filter(x => x.waits?.length && !x.flower);
    for (const payer of unready) for (const receiver of ready) {
      const p = s.players[receiver.seat];
      const highest = receiver.waits.reduce((max, item) => {
        const tile = typeof item === 'number' ? item : item.tile;
        const hu = evaluateHu({ hand: [...p.hand, tile], melds: p.melds, lack: p.lack });
        return Math.max(max, Math.min(hu?.score || 0, s.maxHuScore ?? Infinity));
      }, 0);
      transfer(s, payer.seat, receiver.seat, highest, 'jiao', '查大叫');
    }
    log(s, '牌墙耗尽，已结算花猪、退杠与查大叫');
  }
  s.roundResult = { reason, wins: structuredClone(s.roundWins), ledger: structuredClone(s.ledger), scores: s.players.map(p => p.score), nextDealer: s.nextDealer };
  s.phase = s.round === 4 ? 'matchEnd' : 'roundEnd';
  log(s, `第 ${s.round} 副结束`);
}

export function applyAction(state, seat, action) {
  const s = structuredClone(state);
  const before = s.events.length;
  const allowed = getLegalActions(s, seat);
  if (!allowed.some(option => option.type === action.type && (option.tile === undefined || option.tile === action.tile) && (option.suit === undefined || option.suit === action.suit) && (option.meldIndex === undefined || option.meldIndex === action.meldIndex))) fail('非法操作');
  const p = s.players[seat];
  if (action.type === 'exchange') {
    if (!Array.isArray(action.tiles) || action.tiles.length !== 3 || !action.tiles.every(tile => Number.isInteger(tile) && tileSuit(tile) === tileSuit(action.tiles[0]))) fail('换三张必须选同一门的三张');
    const hand = p.hand.slice();
    for (const tile of action.tiles) { const at = hand.indexOf(tile); if (at < 0) fail('所选换牌不在手中'); hand.splice(at, 1); }
    s.exchangeChoices[seat] = action.tiles.slice();
    if (s.exchangeChoices.every(Boolean)) applyExchange(s);
  } else if (action.type === 'lack') {
    s.lackChoices[seat] = action.suit;
    p.lack = action.suit;
    if (s.lackChoices.every(x => x !== null)) {
      s.phase = 'turn';
      s.current = s.dealer;
      log(s, '四家定缺完成，庄家先出牌');
    }
  } else if (action.type === 'discard') {
    if (p.lockedWaits && action.tile !== p.drawn) fail('血流胡后只能打刚摸的牌');
    take(p, action.tile);
    p.drawn = null;
    p.discards.push({ tile: action.tile, claimed: false });
    const first = !s.firstDiscard;
    s.firstDiscard = true;
    s.lastDiscard = { from: seat, tile: action.tile, first };
    log(s, `${p.name}打出 ${tileName(action.tile)}`);
    makeReaction(s, 'discard', seat, action.tile);
  } else if (action.type === 'hu' && s.phase === 'turn') {
    settleHu(s, seat, null, p.drawn, true);
    if (s.mode === 'normal') endRound(s, 'firstWin');
    else advance(s, seat);
  } else if (action.type === 'concealedKong') {
    take(p, action.tile, 4);
    p.melds.push({ kind: 'kong', tile: action.tile, source: seat, concealed: true });
    kongPayment(s, seat, 'concealed');
    log(s, `${p.name}暗杠 ${tileName(action.tile)}`);
    drawSupplement(s, seat);
  } else if (action.type === 'addKong') {
    makeReaction(s, 'robKong', seat, action.tile, action.meldIndex);
  } else if (['pass', 'pung', 'directKong', 'hu'].includes(action.type) && s.phase === 'reaction') {
    const pending = s.pending;
    if (action.type !== 'hu' && pending.options[seat].some(x => x.type === 'hu')) {
      const score = huResult(s, seat, pending.tile, false, pending.kind === 'robKong');
      p.passFan = Math.max(p.passFan, score?.fan ?? -1);
    }
    pending.decisions[seat] = { type: action.type };
    if (pending.options.every((options, index) => !options || pending.decisions[index])) resolveReactions(s);
  } else if (action.type === 'nextRound') {
    s.round++;
    s.dealer = s.nextDealer;
    startRound(s);
  } else fail('无法执行操作');
  return { state: s, events: s.events.slice(before) };
}

export function visibleTileCounts(s, seat) {
  const visible = Array(27).fill(0);
  for (const p of s.players) {
    for (const d of p.discards) if (!d.claimed) visible[d.tile]++;
    for (const tile of p.winTiles) visible[tile]++;
    for (const m of p.melds) if (!m.concealed || p.seat === seat) visible[m.tile] += m.kind === 'kong' ? 4 : 3;
  }
  return visible;
}

export function getAiView(s, seat) {
  if (seat < 0 || seat >= 4) fail('非法座位');
  return {
    seat,
    round: s.round,
    eventCount: s.events.length,
    phase: s.phase,
    hand: s.players[seat].hand.slice(),
    melds: structuredClone(s.players[seat].melds),
    lack: s.players[seat].lack,
    lockedWaits: s.players[seat].lockedWaits?.slice() || null,
    legalActions: getLegalActions(s, seat),
    visibleCounts: visibleTileCounts(s, seat),
    wallRemaining: s.wall.length,
  };
}

export function auditTiles(s) {
  const tiles = [...s.wall];
  for (const p of s.players) {
    tiles.push(...p.hand);
    tiles.push(...(p.winTiles || []));
    for (const d of p.discards) if (!d.claimed) tiles.push(d.tile);
    for (const m of p.melds) tiles.push(...Array(m.kind === 'kong' ? 4 : 3).fill(m.tile));
  }
  const counts = tileCounts(tiles);
  return { total: tiles.length, complete: tiles.length === 108 && counts.every(n => n === 4), scoreZero: s.players.reduce((sum, p) => sum + p.score, 0) === 4 * (s.initialScore ?? 100) };
}
