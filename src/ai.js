import { tileSuit, tileRank, tileCounts, discardHints, waitingTiles } from './rules.js?v=21';

const accuracy = { easy: 0.5, medium: 0.75, hard: 0.95 };

function isolation(tile, counts) {
  const rank = tileRank(tile);
  let support = (counts[tile] - 1) * 3;
  for (const offset of [-2, -1, 1, 2]) {
    const other = tile + offset;
    if (other >= 0 && other < 27 && tileSuit(other) === tileSuit(tile) && rank + offset >= 1 && rank + offset <= 9) support += counts[other] / Math.abs(offset);
  }
  return -support;
}

function roll(view, salt = 0) {
  let hash = (2166136261 ^ (view.seat || 0) ^ ((view.round || 1) << 8) ^ salt) >>> 0;
  for (const tile of view.hand) hash = Math.imul(hash ^ (tile + 1), 16777619) >>> 0;
  hash = Math.imul(hash ^ view.wallRemaining ^ (view.eventCount || 0), 16777619) >>> 0;
  return hash / 4294967296;
}

function choose(scored, view, difficulty) {
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 1 || roll(view) < accuracy[difficulty]) return scored[0].action;
  return scored[1 + Math.floor(roll(view, 91) * Math.min(3, scored.length - 1))].action;
}

function shanten(hand, meldCount) {
  const counts = tileCounts(hand);
  const pairCount = counts.filter(n => n >= 2).length;
  const distinct = counts.filter(Boolean).length;
  let best = meldCount ? 8 : 6 - pairCount + Math.max(0, 7 - distinct);
  const seen = new Set();
  const walk = (melds, shapes, pair) => {
    const index = counts.findIndex(Boolean);
    if (index < 0) {
      best = Math.min(best, 8 - 2 * melds - Math.min(shapes, 4 - melds) - pair);
      return;
    }
    const key = `${counts.join('')}:${melds}:${shapes}:${pair}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (counts[index] >= 3 && melds < 4) {
      counts[index] -= 3; walk(melds + 1, shapes, pair); counts[index] += 3;
    }
    if (tileRank(index) <= 7 && counts[index + 1] && counts[index + 2] && melds < 4) {
      counts[index]--; counts[index + 1]--; counts[index + 2]--;
      walk(melds + 1, shapes, pair);
      counts[index]++; counts[index + 1]++; counts[index + 2]++;
    }
    if (counts[index] >= 2) {
      counts[index] -= 2;
      if (!pair) walk(melds, shapes, 1);
      if (shapes < 4 - melds) walk(melds, shapes + 1, pair);
      counts[index] += 2;
    }
    for (const step of [1, 2]) if (tileRank(index) + step <= 9 && counts[index + step] && shapes < 4 - melds) {
      counts[index]--; counts[index + step]--;
      walk(melds, shapes + 1, pair);
      counts[index]++; counts[index + step]++;
    }
    counts[index]--; walk(melds, shapes, pair); counts[index]++;
  };
  walk(meldCount, 0, 0);
  return best;
}

function exchangeOptions(view) {
  const counts = tileCounts(view.hand);
  return [0, 1, 2].map(suit => {
    const tiles = view.hand.filter(tile => tileSuit(tile) === suit);
    if (tiles.length < 3) return null;
    const chosen = tiles.slice().sort((a, b) => isolation(b, counts) - isolation(a, counts)).slice(0, 3);
    return { action: { type: 'exchange', tiles: chosen }, score: 25 - tiles.length * 5 + chosen.reduce((sum, tile) => sum + isolation(tile, counts), 0) };
  }).filter(Boolean);
}

function discardScore(view, tile, hints, difficulty) {
  const hand = view.hand.slice();
  hand.splice(hand.indexOf(tile), 1);
  const counts = tileCounts(view.hand);
  const ready = hints.get(tile);
  const waitValue = ready ? ready.waits.reduce((sum, wait) => sum + wait.remaining * (12 + wait.fan * 2), 0) : 0;
  const remaining = Math.max(0, 4 - counts[tile] - view.visibleCounts[tile]);
  const danger = difficulty === 'hard' && view.wallRemaining < 30 ? remaining * (tileRank(tile) >= 4 && tileRank(tile) <= 6 ? 4 : 2) : 0;
  return 180 - 65 * shanten(hand, view.melds.length) + waitValue + isolation(tile, counts) * 3 - danger;
}

export function chooseAiAction(view, difficulty = 'medium') {
  if (!accuracy[difficulty]) throw Error('未知电脑难度');
  const actions = view.legalActions;
  if (!actions.length) return null;
  if (view.phase === 'exchange') return choose(exchangeOptions(view), view, difficulty);
  if (view.phase === 'dingque') {
    const counts = [0, 1, 2].map(suit => view.hand.filter(tile => tileSuit(tile) === suit).length);
    return choose(actions.map(action => ({ action, score: -counts[action.suit] })), view, difficulty);
  }
  if (view.phase === 'reaction') {
    const ready = waitingTiles(view.hand, view.melds, view.lack).length > 0;
    return choose(actions.map(action => ({ action, score: ({ hu: 1000, directKong: view.wallRemaining > 8 ? 90 : -10, pung: ready ? -20 : 45, pass: 0 })[action.type] })), view, difficulty);
  }
  if (view.phase === 'turn') {
    const hints = new Map(discardHints(view, view.visibleCounts).map(hint => [hint.discard, hint]));
    const scored = actions.map(action => ({ action, score: action.type === 'hu' ? 1000 : action.type === 'discard' ? discardScore(view, action.tile, hints, difficulty) : view.wallRemaining > 8 ? 250 : 0 }));
    return choose(scored, view, difficulty);
  }
  return actions[0];
}
