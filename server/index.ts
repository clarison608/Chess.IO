import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { ChessRoom } from "./room/ChessRoom.js"; 

const app = express();
const server = createServer(app);

// Create and attach WebSocket transport to the HTTP server
const transport = new WebSocketTransport();
transport.attachToServer(server);

// Use Redis for presence (tracking players across processes) 
// and the driver for state storage scaling
const gameServer = new Server({
  // Use the env variable Render provides
  driver: new RedisDriver(process.env.REDIS_URL),
  presence: new RedisPresence(process.env.REDIS_URL),
});

gameServer.define("chess_room", ChessRoom);