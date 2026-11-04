// 腦波對頻 Brainwave Sync — an original word-meld party game (2–10 players)
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const MAX_WORD_LEN = 20;
const ROOM_IDLE_MS = 60 * 60 * 1000;

// Original starter topics: round 1 links these two words
const TOPICS = [
  ['海洋', '咖啡'], ['火車', '月光'], ['蛋撻', '颱風'], ['鋼琴', '雨傘'], ['熊貓', '地鐵'],
  ['薄荷', '雪山'], ['魚蛋', '星星'], ['書包', '煙花'], ['奶茶', '恐龍'], ['燈塔', '麵包'],
  ['電梯', '蝴蝶'], ['沙灘', '鬧鐘'], ['紅綠燈', '西瓜'], ['郵票', '火山'], ['叮叮', '彩虹'],
  ['手機', '森林'], ['外星人', '點心'], ['冰箱', '演唱會'], ['貓', '宇宙'], ['考試', '雪糕'],
];

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
// Short ping so dead connections (e.g. a phone switching apps) are noticed within ~15s
const io = new Server(server, { pingInterval: 10000, pingTimeout: 5000 });
const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
const norm = w => String(w || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
const clean = (s, max) => String(s || '').normalize('NFKC').trim().slice(0, max);
const online = room => room.players.filter(p => p.connected);

function publicState(room) {
  return {
    code: room.code, hostId: room.hostId, maxPlayers: room.maxPlayers,
    roundSec: room.roundSec, maxRounds: room.maxRounds, useTopic: room.useTopic,
    phase: room.phase, round: room.round, deadline: room.deadline, topic: room.topic, result: room.result,
    players: room.players.map(p => ({
      id: p.id, name: p.name, connected: p.connected,
      inRound: room.participants.includes(p.id),
      submitted: room.phase === 'writing' ? room.submissions.has(p.id) : undefined,
    })),
    reveal: room.phase === 'writing' ? null : room.lastReveal,
    history: room.history,
  };
}
const broadcast = room => io.to(room.code).emit('state', publicState(room));

function startRound(room) {
  clearTimeout(room.timer);
  room.round += 1;
  room.phase = 'writing';
  room.submissions = new Map();
  room.participants = online(room).map(p => p.id);
  room.deadline = Date.now() + room.roundSec * 1000;
  room.timer = setTimeout(() => endRound(room), room.roundSec * 1000 + 300);
  broadcast(room);
}

function endRound(room) {
  if (room.phase !== 'writing') return;
  clearTimeout(room.timer);
  const entries = room.participants.map(id => {
    const p = room.players.find(x => x.id === id);
    return { id, name: p ? p.name : '?', word: room.submissions.get(id) || null, matched: false };
  });

  // Group identical words so players can see who already matched
  const groups = new Map();
  for (const e of entries) {
    if (!e.word) continue;
    const k = norm(e.word);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const matches = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.forEach(e => { e.matched = true; });
    matches.push({ word: g[0].word, names: g.map(e => e.name), size: g.length });
  }
  matches.sort((a, b) => b.size - a.size);

  // PASS only when every player submitted and all words are the same
  const allSync = entries.length >= MIN_PLAYERS && entries.every(e => e.word) && groups.size === 1;

  room.lastReveal = { round: room.round, entries, matches, allSync };
  room.history.push({ round: room.round, words: entries.map(e => e.word), allSync, best: matches[0] ? matches[0].size : 0 });
  const outOfRounds = room.maxRounds > 0 && room.round >= room.maxRounds;
  room.result = allSync ? 'pass' : outOfRounds ? 'fail' : null;
  room.phase = room.result ? 'over' : 'reveal';
  room.deadline = null;
  broadcast(room);
}

function ensureHost(room) {
  if (!room.players.find(p => p.id === room.hostId && p.connected)) {
    const next = online(room)[0];
    if (next) room.hostId = next.id;
  }
}

function checkAllIn(room) {
  if (room.phase !== 'writing') return;
  const waiting = room.participants.filter(id =>
    !room.submissions.has(id) && room.players.find(p => p.id === id && p.connected));
  if (waiting.length === 0 && room.submissions.size > 0) endRound(room);
}

io.on('connection', socket => {
  let room = null, me = null;

  function attach(r, playerId, name) {
    // If this connection was in a different room, leave it first
    if (room && room !== r) leave(true);
    let p = r.players.find(x => x.id === playerId);
    if (p) { p.connected = true; p.socketId = socket.id; if (name) p.name = name; }
    else {
      if (online(r).length >= r.maxPlayers) return { error: `房間已滿（最多 ${r.maxPlayers} 人）` };
      p = { id: playerId, name, connected: true, socketId: socket.id };
      r.players.push(p);
    }
    room = r; me = p; r.lastActive = Date.now();
    socket.join(r.code);
    if (r.ownerId === playerId) r.hostId = playerId; // room creator gets host back on return
    ensureHost(r);
    broadcast(r);
    return { ok: true, code: r.code };
  }

  socket.on('create', (d = {}, cb) => {
    const name = clean(d.name, 12), playerId = clean(d.playerId, 40);
    if (!name || !playerId) return cb && cb({ error: '請輸入暱稱' });
    const r = {
      code: makeCode(), hostId: playerId, ownerId: playerId,
      maxPlayers: Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, parseInt(d.maxPlayers, 10) || MAX_PLAYERS)),
      roundSec: [45, 60, 90].includes(Number(d.roundSec)) ? Number(d.roundSec) : 60,
      maxRounds: [0, 8, 12].includes(Number(d.maxRounds)) ? Number(d.maxRounds) : 0, // 0 = unlimited
      useTopic: d.useTopic !== false,
      phase: 'lobby', round: 0, deadline: null, topic: null, result: null, players: [],
      submissions: new Map(), participants: [], lastReveal: null, history: [],
      timer: null, lastActive: Date.now(),
    };
    rooms.set(r.code, r);
    cb && cb(attach(r, playerId, name));
  });

  socket.on('join', (d = {}, cb) => {
    const code = clean(d.code, 4).toUpperCase();
    const name = clean(d.name, 12), playerId = clean(d.playerId, 40);
    const r = rooms.get(code);
    if (!r) return cb && cb({ error: '找不到這個房間' });
    if (!name || !playerId) return cb && cb({ error: '請輸入暱稱' });
    cb && cb(attach(r, playerId, name));
  });

  socket.on('start', () => {
    if (!room || !me || room.hostId !== me.id || room.phase !== 'lobby') return;
    if (online(room).length < MIN_PLAYERS) return;
    room.topic = room.useTopic ? TOPICS[Math.floor(Math.random() * TOPICS.length)] : null;
    startRound(room);
  });

  socket.on('submit', (word, cb) => {
    if (!room || !me || room.phase !== 'writing') return;
    if (!room.participants.includes(me.id)) return cb && cb({ error: '你下一輪才加入' });
    if (room.submissions.has(me.id)) return cb && cb({ error: '已經提交了' });
    const w = clean(word, MAX_WORD_LEN);
    if (!w) return cb && cb({ error: '請輸入一個詞' });
    room.submissions.set(me.id, w);
    cb && cb({ ok: true });
    broadcast(room);
    checkAllIn(room);
  });

  socket.on('next', () => {
    if (!room || !me || room.hostId !== me.id || room.phase !== 'reveal') return;
    if (online(room).length < MIN_PLAYERS) return;
    startRound(room);
  });

  socket.on('restart', () => {
    if (!room || !me || room.hostId !== me.id || room.phase !== 'over') return;
    clearTimeout(room.timer);
    room.players = online(room);
    Object.assign(room, { phase: 'lobby', round: 0, result: null, history: [], lastReveal: null,
      topic: null, participants: [], submissions: new Map() });
    broadcast(room);
  });

  // Clients poll this; if the server no longer has them in a room they rejoin
  socket.on('sync', (a, b) => {
    const cb = typeof a === 'function' ? a : b;
    if (typeof cb !== 'function') return;
    if (room && me && me.connected && me.socketId === socket.id && rooms.get(room.code) === room)
      cb({ state: publicState(room) });
    else cb({ lost: true });
  });

  socket.on('leave', () => leave(true));
  socket.on('disconnect', () => leave(false));

  function leave(explicit) {
    if (!room || !me || me.socketId !== socket.id) return;
    const r = room;
    me.connected = false;
    if (explicit && r.phase === 'lobby') r.players = r.players.filter(p => p.id !== me.id);
    socket.leave(r.code);
    room = null;
    ensureHost(r);
    r.lastActive = Date.now();
    broadcast(r);
    checkAllIn(r);
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (online(r).length === 0 && now - r.lastActive > ROOM_IDLE_MS) { clearTimeout(r.timer); rooms.delete(code); }
  }
}, 60 * 1000);

server.listen(PORT, () => console.log(`腦波對頻 running on http://localhost:${PORT}`));
