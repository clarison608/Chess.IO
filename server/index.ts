import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { ChessRoom } from "./room/ChessRoom.js"; 

import { Server, matchMaker } from "colyseus";

const app = express();
app.use(cors({ origin: "https://clarison608.github.io", credentials: true }));
app.use(express.json()); // 2. CRITICAL: Matchmaking requires a JSON parser

// 3. Register the matchmaking routes so the server responds to /matchmake
app.use("/matchmake", matchMaker.getRouter()); 

const server = createServer(app);
const port = Number(process.env.PORT) || 2567; 

const gameServer = new Server({
  transport: new WebSocketTransport({ server: server }),
  driver: new RedisDriver(process.env.REDIS_URL),
  presence: new RedisPresence(process.env.REDIS_URL),
});

gameServer.define("chess_room", ChessRoom);

server.listen(port, "0.0.0.0", () => {
    console.log(`✅ Server is listening on port ${port}`);
});