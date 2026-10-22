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
  const living = v.players.filter((p) => p.alive && p.id !== v.me.id);
  if (v.hunter && v.hunter.id === v.me.id && v.hunter.shot === null) return game({ type: 'SHOOT', target: pick(living).id });
  if (!v.me.alive) return;
  if (v.phase === 'night' && v.night.step === 'witch') {
    if (v.me.role === 'witch') game({ type: 'WITCH', heal: !!v.night.victim && Math.random() < 0.5, poison: null });
    return;
  }
  if (v.phase === 'night' && v.me.role === 'cupid' && v.night.cupidOwes) {
    const pair = v.players.filter((p) => p.alive).sort(() => Math.random() - 0.5).slice(0, 2);
    return game({ type: 'CUPID', targets: pair.map((p) => p.id) });
  }
  if (v.phase === 'night') {
    if (v.me.role === 'mafia' && !v.night.mafiaVotes[v.me.id]) game({ type: 'KILL', target: pick(living.filter((p) => p.role !== 'mafia')).id });
    if (v.me.role === 'doctor' && !v.night.mySave) game({ type: 'SAVE', target: pick(v.players.filter((p) => p.alive && p.id !== v.night.lastSave)).id });
    if (v.me.role === 'detective' && !v.night.myCheck) game({ type: 'CHECK', target: pick(living).id });
  }
  if (v.phase === 'day' && !v.votes[v.me.id]) game({ type: 'VOTE', target: Math.random() < 0.3 ? 'skip' : pick(living).id });
}
