import test from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, applyAction, getLegalActions } from '../src/engine.js';

for (const wallCount of [4, 12]) {
  test(`点炮胡可忽略，牌墙剩余 ${wallCount} 张`, () => {
    const state = newMatch({ exchange: false, seed: 7 });
    state.phase = 'turn';
    state.current = 0;
    state.wall = state.wall.slice(0, wallCount);
    state.players[0].hand = [0, 1, 2, 3, 4, 5, 6, 6, 9, 10, 11, 12, 13, 14];
    state.players[0].lack = 2;
    state.players[0].drawn = 0;
    state.players[1].hand = [1, 2, 3, 4, 5, 6, 6, 9, 10, 11, 12, 13, 14];
    state.players[1].lack = 2;
    state.players[2].hand = [18, 18, 18];
    state.players[3].hand = [19, 19, 19];
    const afterDiscard = applyAction(state, 0, { type: 'discard', tile: 0 }).state;
    assert.deepEqual(getLegalActions(afterDiscard, 1).map(action => action.type), ['hu', 'pass']);
    const afterPass = applyAction(afterDiscard, 1, { type: 'pass' }).state;
    assert.notEqual(afterPass.phase, 'reaction');
  });
}

test('抢补杠胡可忽略', () => {
  const state = newMatch({ exchange: false, seed: 8 });
  state.phase = 'turn';
  state.current = 0;
  state.wall = state.wall.slice(0, 4);
  state.players[0].hand = [0, 1, 2, 3, 4, 5, 6, 6, 9];
  state.players[0].melds = [{ kind: 'pung', tile: 0, source: 1 }];
  state.players[0].lack = 2;
  state.players[0].drawn = 0;
  state.players[1].hand = [1, 2, 3, 4, 5, 6, 6, 9, 10, 11, 12, 13, 14];
  state.players[1].lack = 2;
  const pending = applyAction(state, 0, { type: 'addKong', tile: 0, meldIndex: 0 }).state;
  assert.deepEqual(getLegalActions(pending, 1).map(action => action.type), ['hu', 'pass']);
  const afterPass = applyAction(pending, 1, { type: 'pass' }).state;
  assert.notEqual(afterPass.phase, 'reaction');
  assert.equal(afterPass.players[0].melds[0].kind, 'kong');
});
