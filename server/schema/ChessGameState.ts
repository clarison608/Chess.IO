import { Schema, MapSchema, ArraySchema, defineTypes } from '@colyseus/schema';

// 1. Define classes WITHOUT decorators
export class Position extends Schema {
    x!: number;
    y!: number;
}

export class Piece extends Schema {
    id!: string;
    type!: string;
    team!: string;
    ownerId!: string;
    position: Position = new Position();
    isAlive: boolean = true;
    isIdle: boolean = true;
    isGhost: boolean = false;
    startX: number = 0;
    startY: number = 0;
    canPromote: boolean = false;
    hasLockedIn: boolean = false;
    lockedBy: string = "";
    lockedTarget: Position = new Position();
}

export class Player extends Schema {
    sessionId!: string;
    nickname!: string;
    team!: string;
    pieceId!: string;
    connected: boolean = true;
    hasLockedIn: boolean = false;
    turnsUntilRespawn: number = 0;
}

export class ChessGameState extends Schema {
    players = new MapSchema<Player>();
    pieces = new MapSchema<Piece>();
    controlledTiles = new MapSchema<string>();
    status: string = "waiting_for_kings";
    currentTurn: number = 1;
    turnEndTime: number = 0;
    phase: string = "planning";
    teamPriority = new ArraySchema<string>("black", "white", "blue", "green");
    stunnedTeams = new MapSchema<number>();
}

// 2. Define types explicitly at the bottom of the file
defineTypes(Position, {
    x: "int8",
    y: "int8"
});

defineTypes(Piece, {
    id: "string",
    type: "string",
    team: "string",
    ownerId: "string",
    position: Position,
    isAlive: "boolean",
    isIdle: "boolean",
    isGhost: "boolean",
    startX: "int8",
    startY: "int8",
    canPromote: "boolean",
    hasLockedIn: "boolean",
    lockedBy: "string",
    lockedTarget: Position
});

defineTypes(Player, {
    sessionId: "string",
    nickname: "string",
    team: "string",
    pieceId: "string",
    connected: "boolean",
    hasLockedIn: "boolean",
    turnsUntilRespawn: "int8"
});

defineTypes(ChessGameState, {
    players: { map: Player },
    pieces: { map: Piece },
    controlledTiles: { map: "string" },
    status: "string",
    currentTurn: "number",
    turnEndTime: "number",
    phase: "string",
    teamPriority: ["string"],
    stunnedTeams: { map: "uint8" }
});