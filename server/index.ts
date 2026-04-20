import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { ChessRoom } from "./room/ChessRoom.js"; 

const app = express();

// 1. Apply CORS to the Express app BEFORE initializing Colyseus
app.use(cors({
    origin: "https://clarison608.github.io",
    credentials: true
}));

const server = createServer(app);
const port = Number(process.env.PORT) || 2567; 

// 2. Link the transport to the HTTP server
const transport = new WebSocketTransport({
  server: server 
});

// 3. Pass the transport into the Colyseus Server constructor
const gameServer = new Server({
  transport: transport,
  driver: new RedisDriver(process.env.REDIS_URL),
  presence: new RedisPresence(process.env.REDIS_URL),
});

gameServer.define("chess_room", ChessRoom);

// 4. Start the HTTP server directly
// This is the ONLY place you should call listen()
server.listen(port, "0.0.0.0", () => {
    console.log(`✅ Server is listening on port ${port}`);
});