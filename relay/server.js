// TeleCaption relay: rooms of websockets, broadcast captions to everyone else in room.
const http = require('http');
const { WebSocketServer } = require('ws');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('telecaption relay ok');
});

const wss = new WebSocketServer({ server });
const rooms = new Map(); // room -> Set<ws>

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.room = null;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.type === 'join') {
      const room = String(msg.room || '').trim().toLowerCase();
      if (!room) return;
      if (ws.room && rooms.has(ws.room)) rooms.get(ws.room).delete(ws);
      ws.room = room;
      ws.role = msg.role || 'unknown';
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      console.log(`join: role=${ws.role} room=${room} peers=${rooms.get(room).size}`);
      ws.send(JSON.stringify({ type: 'joined', room, peers: rooms.get(room).size }));
    } else if (msg.type === 'caption' && ws.room && rooms.has(ws.room)) {
      const out = data.toString();
      for (const peer of rooms.get(ws.room)) {
        if (peer !== ws && peer.readyState === 1) peer.send(out);
      }
    }
  });

  ws.on('close', () => {
    if (ws.room && rooms.has(ws.room)) {
      rooms.get(ws.room).delete(ws);
      console.log(`leave: role=${ws.role} room=${ws.room} peers=${rooms.get(ws.room).size}`);
      if (rooms.get(ws.room).size === 0) rooms.delete(ws.room);
    }
  });
});

// keepalive: kill dead sockets so rooms stay clean
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

const port = process.env.PORT || 8080;
server.listen(port, () => console.log('relay listening on ' + port));
