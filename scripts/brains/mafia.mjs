// Bot brain for Mafia: everyone reads their card, then picks at random by night and votes at random by day.
const acted = new Map();
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function act(room, me, send) {
  const m = room.match;
  if (!m || !me) return;
  const v = m.view;
  if (!v.me || v.phase === 'over') return;
  const key = `${m.version}`;
  if (acted.get(me.id) === key) return;
  acted.set(me.id, key);
  const game = (action) => setTimeout(() => send({ type: 'GAME', matchId: m.id, version: m.version, action }), 600 + Math.random() * 1500);
  const self = v.players.find((p) => p.id === v.me.id);
  if (v.phase === 'reveal' && !self.ready) return game({ type: 'READY' });
  if (!v.me.alive) return;
  const living = v.players.filter((p) => p.alive && p.id !== v.me.id);
  if (v.phase === 'night') {
    if (v.me.role === 'mafia' && !v.night.mafiaVotes[v.me.id]) game({ type: 'KILL', target: pick(living.filter((p) => p.role !== 'mafia')).id });
    if (v.me.role === 'doctor' && !v.night.mySave) game({ type: 'SAVE', target: pick(v.players.filter((p) => p.alive && p.id !== v.night.lastSave)).id });
    if (v.me.role === 'detective' && !v.night.myCheck) game({ type: 'CHECK', target: pick(living).id });
  }
  if (v.phase === 'day' && !v.votes[v.me.id]) game({ type: 'VOTE', target: Math.random() < 0.3 ? 'skip' : pick(living).id });
}
