export const SUITS = ['万', '筒', '条'];
export const MODES = ['normal', 'battle', 'river'];
export const tileSuit = tile => Math.floor(tile / 9);
export const tileRank = tile => tile % 9 + 1;
export const tileName = tile => `${tileRank(tile)}${SUITS[tileSuit(tile)]}`;
export const nextSeat = seat => (seat + 1) % 4;

export function tileCounts(tiles) {
  const counts = Array(27).fill(0);
  for (const tile of tiles) {
    if (!Number.isInteger(tile) || tile < 0 || tile >= 27 || ++counts[tile] > 4) throw Error('非法牌组');
  }
  return counts;
}

function concealedPatterns(counts, setsNeeded) {
  const found = [];
  const pairCandidates = counts.flatMap((n, tile) => n >= 2 ? [tile] : []);
  for (const pair of pairCandidates) {
    counts[pair] -= 2;
    const walk = (groups) => {
      const tile = counts.findIndex(n => n > 0);
      if (tile < 0) {
        if (groups.length === setsNeeded) found.push({ pair, groups: groups.slice() });
        return;
      }
      if (groups.length >= setsNeeded) return;
      if (counts[tile] >= 3) {
        counts[tile] -= 3;
        groups.push({ kind: 'triplet', tile });
        walk(groups);
        groups.pop();
        counts[tile] += 3;
      }
      if (tileRank(tile) <= 7 && counts[tile + 1] > 0 && counts[tile + 2] > 0 && tileSuit(tile) === tileSuit(tile + 2)) {
        counts[tile]--; counts[tile + 1]--; counts[tile + 2]--;
        groups.push({ kind: 'sequence', tile });
        walk(groups);
        groups.pop();
        counts[tile]++; counts[tile + 1]++; counts[tile + 2]++;
      }
    };
    walk([]);
    counts[pair] += 2;
  }
  return found;
}

export function evaluateHu({ hand, melds = [], lack, context = {} }) {
  if (!Array.isArray(hand) || hand.length !== 14 - melds.length * 3 || !Number.isInteger(lack)) return null;
  const allTiles = [...hand, ...melds.flatMap(m => Array(m.kind === 'kong' ? 4 : 3).fill(m.tile))];
  let counts;
  try { counts = tileCounts(allTiles); } catch { return null; }
  if (allTiles.some(tile => tileSuit(tile) === lack)) return null;
  const concealed = tileCounts(hand);
  const patterns = concealedPatterns(concealed, 4 - melds.length);
  const sevenPairs = melds.length === 0 && concealed.every(n => n % 2 === 0) && concealed.reduce((sum, n) => sum + n / 2, 0) === 7;
  if (!patterns.length && !sevenPairs) return null;
  const roots = counts.filter(n => n === 4).length;
  const oneSuit = allTiles.every(tile => tileSuit(tile) === tileSuit(allTiles[0]));
  const behaviour = [];
  if (context.robKong) behaviour.push(['抢杠胡', 1]);
  else if (context.kongDraw) behaviour.push(['杠上花', 1]);
  else if (context.kongDiscard) behaviour.push(['杠上炮', 1]);
  if (context.lastTile) behaviour.push([context.selfDraw ? '海底捞月' : '海底炮', 1]);
  if (context.selfDraw) behaviour.push(['自摸', 1]);
  const options = [];
  if (sevenPairs) {
    const dragon = roots > 0;
    const base = oneSuit ? dragon ? ['清龙七对', 5] : ['清七对', 4] : dragon ? ['龙七对', 4] : ['七对', 2];
    const extraRoots = roots - Number(dragon);
    options.push({ base, extras: [...(extraRoots ? [[`根×${extraRoots}`, extraRoots]] : []), ...behaviour], pattern: 'sevenPairs' });
  }
  for (const pattern of patterns) {
    const allTriplets = [...pattern.groups, ...melds].every(g => g.kind !== 'sequence');
    const base = oneSuit ? allTriplets ? ['清对', 3] : ['清一色', 2] : allTriplets ? ['对对胡', 1] : ['平胡', 0];
    options.push({ base, extras: [...(roots ? [[`根×${roots}`, roots]] : []), ...behaviour], pattern });
  }
  options.sort((a, b) => b.base[1] - a.base[1] || b.extras.reduce((sum, x) => sum + x[1], 0) - a.extras.reduce((sum, x) => sum + x[1], 0));
  const best = options[0];
  const fan = best.base[1] + best.extras.reduce((sum, x) => sum + x[1], 0);
  return { fan, names: [best.base[0], ...best.extras.map(x => x[0])], base: best.base[0], score: 2 ** fan, pattern: best.pattern };
}

export function waitingTiles(hand, melds, lack, context = {}) {
  if (hand.length !== 13 - 3 * melds.length) return [];
  const result = [];
  for (let tile = 0; tile < 27; tile++) {
    if (hand.filter(t => t === tile).length === 4) continue;
    const hu = evaluateHu({ hand: [...hand, tile], melds, lack, context });
    if (hu) result.push({ tile, ...hu });
  }
  return result;
}

export function legalDiscards(player) {
  if (player.lockedWaits) return [player.drawn];
  const lacks = player.hand.filter(t => tileSuit(t) === player.lack);
  return [...new Set(lacks.length ? lacks : player.hand)].sort((a, b) => a - b);
}

export function discardHints(player, visibleCounts = Array(27).fill(0)) {
  if (player.lockedWaits) return [];
  return legalDiscards(player).map(discard => {
    const copy = player.hand.slice();
    copy.splice(copy.indexOf(discard), 1);
    const waits = waitingTiles(copy, player.melds, player.lack).map(item => ({
      ...item,
      remaining: Math.max(0, 4 - copy.filter(t => t === item.tile).length - visibleCounts[item.tile] - (discard === item.tile ? 1 : 0)),
    }));
    return { discard, waits };
  }).filter(hint => hint.waits.length);
}
