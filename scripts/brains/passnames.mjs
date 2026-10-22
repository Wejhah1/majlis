// Bot brain for Passnames: spymasters give a throwaway clue, agents mark and reveal at random.
// BOT_SCRIPT=./scripts/brains/passnames.mjs node scripts/bots.mjs CODE 3
const acted = new Map();
const CLUES = ['تجربة', 'فكرة', 'لغز', 'بحر', 'نجمة'];

export function act(room, me, send) {
  const m = room.match;
  if (!m || !me) return;
  const v = m.view;
  if (!v.me || v.phase === 'finished' || v.paused) return;
  const key = `${me.id}:${m.version}`;
  if (acted.get(me.id) === key) return;
  acted.set(me.id, key);
  const game = (action) => setTimeout(() => send({ type: 'GAME', matchId: m.id, version: m.version, action }), 900 + Math.random() * 600);
  const mine = v.me.team === v.active;
  if (!mine) return;
  if (v.me.role === 'spy' && v.phase === 'clue') {
    game({ type: 'CLUE', text: CLUES[Math.floor(Math.random() * CLUES.length)], count: 1 });
  } else if (v.me.role === 'agent' && v.phase === 'guess') {
    const hidden = v.board.filter((c) => !c.revealed);
    const marked = hidden.find((c) => c.marks.some((x) => x.id === me.id));
    if (marked) game({ type: 'GUESS', cell: marked.id });
    else if (hidden.length) game({ type: 'MARK', cell: hidden[Math.floor(Math.random() * hidden.length)].id });
  } else if (v.me.role === 'agent' && v.phase === 'second') game({ type: 'DECLINE' });
}
