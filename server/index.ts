import { Server } from "colyseus";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { RedisPresence } from "@colyseus/redis-presence";
import { RedisDriver } from "@colyseus/redis-driver";
import { ChessRoom } from "./room/ChessRoom.js"; 

const app = express();

// 1. Middleware
app.use(cors({
    origin: "https://clarison608.github.io",
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

const server = createServer(app);
const port = Number(process.env.PORT) || 2567; 

// 2. Initialize Colyseus (0.16 Native Transport + Redis)
const gameServer = new Server({
    server: server, // Transport is natively handled here in 0.16
    driver: new RedisDriver(process.env.REDIS_URL),
    presence: new RedisPresence(process.env.REDIS_URL)
});

// 3. Define your room
gameServer.define("chess_room", ChessRoom);

// 4. Start the server
gameServer.listen(port, "0.0.0.0").then(() => {
    console.log(`✅ Colyseus GameServer is listening on port ${port}`);
}).catch((err) => {
    console.error("Failed to start server:", err);
});