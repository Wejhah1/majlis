// Bot brain for Kalak: writes a silly lie, then votes for a random slip that isn't theirs.
const LIES = ['البطريق', 'سبعة', 'البرازيل', 'الملح', 'القهوة', 'المريخ', 'كوريا', 'خمسين', 'الحمام الزاجل'];
const acted = new Map();

export function act(room, me, send) {
  const m = room.match;
  if (!m || !me) return;
  const v = m.view;
  const key = `${m.version}`;
  if (acted.get(me.id) === key) return;
  acted.set(me.id, key);
  const game = (action) => setTimeout(() => send({ type: 'GAME', matchId: m.id, version: m.version, action }), 800 + Math.random() * 2000);
  if (v.phase === 'write' && !v.myFake) game({ type: 'FAKE', text: `${LIES[Math.floor(Math.random() * LIES.length)]} ${me.name}` });
  if (v.phase === 'vote' && !v.myVote) {
    const options = v.options.filter((o) => !o.mine);
    game({ type: 'VOTE', option: options[Math.floor(Math.random() * options.length)].id });
  }
}
