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



// Create and attach WebSocket transport to the HTTP server
const transport = new WebSocketTransport();
transport.attachToServer(server);

// 1. Use Redis for presence (tracking players across processes) 
// and the driver for state storage scaling
const gameServer = new Server({
  // Use the env variable Render provides
  driver: new RedisDriver(process.env.REDIS_URL),
  presence: new RedisPresence(process.env.REDIS_URL),
});
gameServer.define("chess_room", ChessRoom);

// 2. Listen on the correct port and the "0.0.0.0" host
// Using "0.0.0.0" is critical for Render to "see" your app
gameServer.listen(port, "0.0.0.0").then(() => {
    console.log(`Server is listening on port ${port}`);
});

