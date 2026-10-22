// Bot brain for Picture Puzzle: players buzz a few seconds after each new puzzle.
const acted = new Map();

export function act(room, me, send) {
  const m = room.match;
  if (!m || !me) return;
  const v = m.view;
  if (v.isHost || v.phase !== 'show' || v.buzz || (v.myTeam && v.lockedOut.includes(v.myTeam))) return;
  const key = `${v.index}:${v.lockedOut.join()}`;
  if (acted.get(me.id) === key) return;
  acted.set(me.id, key);
  setTimeout(() => send({ type: 'GAME', matchId: m.id, version: m.version, action: { type: 'BUZZ' } }), 2500 + Math.random() * 3000);
}
