// Dev helper: fill a room with fake friends so you can test alone.
//   node scripts/bots.mjs <ROOMCODE> [count=3] [baseUrl=http://localhost:5173]
// Bots join, stay connected, and print every action error. Ctrl+C to stop.
// Optional: BOT_SCRIPT=./my-bot.mjs exporting `act(room, me, send)` to make them play.

const [code, countArg = '3', base = 'http://localhost:5173'] = process.argv.slice(2);
if (!code) {
  console.error('usage: node scripts/bots.mjs <ROOMCODE> [count] [baseUrl]');
  process.exit(1);
}

const NAMES = ['نورة', 'فهد', 'سارة', 'خالد', 'ريم', 'عبدالله', 'لولوة', 'تركي', 'هيا', 'سلمان', 'دانة'];
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map((n) => n.toString(16).padStart(2, '0')).join('');
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const store = new URL(`./.bots-${code}.json`, import.meta.url);
const saved = existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')) : {};
const brain = process.env.BOT_SCRIPT ? await import(new URL(process.env.BOT_SCRIPT, `file://${process.cwd()}/`).href) : null;

async function bot(name) {
  const secret = saved[name] ?? token();
  saved[name] = secret;
  writeFileSync(store, JSON.stringify(saved));
  const res = await fetch(`${base}/api/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, token: secret }),
  });
  const data = await res.json();
  if (!data.ok) return console.error(name, 'join failed:', data.error);
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/parties/rooms/${data.code}`);
  let seq = 0;
  const send = (action) => ws.send(JSON.stringify({ ...action, requestId: `${name}-${++seq}` }));
  ws.onopen = () => ws.send(JSON.stringify({ type: 'AUTH', token: secret }));
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    const msg = JSON.parse(e.data);
    if (msg.type === 'error') console.log(`${name}: ${msg.error}`);
    if (msg.type === 'snapshot' && brain) brain.act(msg.room, msg.room.me, send);
  };
  ws.onclose = (e) => console.log(`${name} disconnected (${e.code} ${e.reason})`);
  setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'HEARTBEAT' })), 20_000);
  console.log(`${name} joined ${data.code} (${data.status})`);
}

for (let i = 0; i < Number(countArg); i++) await bot(NAMES[i % NAMES.length]);
