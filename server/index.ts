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
  transport: transport,
  presence: new RedisPresence({
    host: process.env.REDIS_HOST || "redis-12163.c57.us-east-1-4.ec2.cloud.redislabs.com",
    port: Number(process.env.REDIS_PORT) || 12163,
    password: process.env.REDIS_PASSWORD || "3XNiq40Kqz9h1hLFgSTgZ51MsSFynGoK"
  }),
  driver: new RedisDriver({
    host: process.env.REDIS_HOST || "redis-12163.c57.us-east-1-4.ec2.cloud.redislabs.com",
    port: Number(process.env.REDIS_PORT) || 12163,
    password: process.env.REDIS_PASSWORD || "3XNiq40Kqz9h1hLFgSTgZ51MsSFynGoK"
  }),
});

gameServer.define("chess_room", ChessRoom);