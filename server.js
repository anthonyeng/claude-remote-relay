// Claude Remote relay. Both the Mac bridge (role=mac) and phones (role=phone) connect OUT to this
// server with the same token; the relay forwards phone -> mac and mac -> all phones. It stores
// nothing and never sees the token in clear on the wire when served over wss://.
const http = require("http");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3300);
const rooms = new Map(); // roomKey -> { mac: ws|null, phones: Set<ws> }

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`claude-remote relay ok · rooms=${rooms.size}\n`);
});
const wss = new WebSocketServer({ server });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), "[relay]", ...a);
const send = (ws, msg) => { if (ws && ws.readyState === ws.OPEN) ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); };
const offline = { type: "status", busy: false, session: false, project: "", projectPath: "", projects: [], offline: true };

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  const token = url.searchParams.get("t") || "";
  const role = url.searchParams.get("role") === "mac" ? "mac" : "phone";
  if (token.length < 16) return ws.close(4001, "unauthorized");
  const key = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  const room = rooms.get(key) || rooms.set(key, { mac: null, phones: new Set() }).get(key);
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  if (role === "mac") {
    if (room.mac) room.mac.close(4002, "replaced by a newer bridge");
    room.mac = ws;
    log(`room ${key}: mac connected (${room.phones.size} phones waiting)`);
    send(ws, { type: "relay", phones: room.phones.size });
    ws.on("message", (raw) => { for (const p of room.phones) send(p, raw.toString()); });
    ws.on("close", () => {
      if (room.mac === ws) room.mac = null;
      for (const p of room.phones) send(p, offline);
      log(`room ${key}: mac disconnected`);
      cleanup(key, room);
    });
    return;
  }

  room.phones.add(ws);
  log(`room ${key}: phone connected (mac ${room.mac ? "online" : "offline"})`);
  if (room.mac) send(room.mac, { type: "hello" }); else send(ws, offline);
  ws.on("message", (raw) => {
    if (room.mac) send(room.mac, raw.toString());
    else send(ws, { type: "error", text: "Mac is offline" });
  });
  ws.on("close", () => { room.phones.delete(ws); cleanup(key, room); });
});

function cleanup(key, room) { if (!room.mac && room.phones.size === 0) rooms.delete(key); }

// Keep connections honest (and keep a free Render instance from idling).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false; ws.ping();
  }
}, 30_000);

server.listen(PORT, () => log(`listening on :${PORT}`));
