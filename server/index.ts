import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { ChessRoom } from "./room/ChessRoom.js"; 

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT) || 2567; 



// 1. Create the transport and link it to the server
const transport = new WebSocketTransport({
  server: server // This tells Colyseus to use your Express server
});

// 2. Initialize Colyseus with the transport AND Redis
const gameServer = new Server({
  transport: transport,
  driver: new RedisDriver(process.env.REDIS_URL),
  presence: new RedisPresence(process.env.REDIS_URL),
});

gameServer.define("chess_room", ChessRoom);

// 3. Start the HTTP server directly
// This is what Render looks for to detect an "open port"
server.listen(port, "0.0.0.0", () => {
    console.log(`Server is listening on port ${port}`);
});