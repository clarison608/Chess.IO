import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { matchMaker } from "@colyseus/core"; // Import from core
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { ChessRoom } from "./room/ChessRoom.js"; 

const app = express();

// 1. Standard Middleware
app.use(cors());
app.use(express.json()); 

// 2. Attach Matchmaking Routes (This fixes the 404)
// If TS still complains about getRouter, we use the "any" bypass
app.use("/matchmake", (matchMaker as any).getRouter()); 

const server = createServer(app);
const port = Number(process.env.PORT) || 2567; 

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: server 
  }),
  driver: new RedisDriver(process.env.REDIS_URL),
  presence: new RedisPresence(process.env.REDIS_URL),
});

gameServer.define("chess_room", ChessRoom);

server.listen(port, "0.0.0.0", () => {
    console.log(`✅ Server is listening on port ${port}`);
});