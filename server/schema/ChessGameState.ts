import { Schema, MapSchema, ArraySchema, defineTypes } from '@colyseus/schema';

// 1. Define classes WITHOUT decorators
export class Position extends Schema {
    declare x: number;
    declare y: number;
}

export class Piece extends Schema {
    declare id: string;
    declare type: string;
    declare team: string;
    declare ownerId: string;
    declare position: Position;
    declare isAlive: boolean;
    declare isIdle: boolean;
    declare isGhost: boolean;
    declare startX: number;
    declare startY: number;
    declare canPromote: boolean;
    declare hasLockedIn: boolean;
    declare lockedBy: string;
    declare lockedTarget: Position;

    constructor() {
        super();
        this.position = new Position();
        this.isAlive = true;
        this.isIdle = true;
        this.isGhost = false;
        this.startX = 0;
        this.startY = 0;
        this.canPromote = false;
        this.hasLockedIn = false;
        this.lockedBy = "";
        this.lockedTarget = new Position();
    }
}

export class Player extends Schema {
    declare sessionId: string;
    declare nickname: string;
    declare team: string;
    declare pieceId: string;
    declare connected: boolean;
    declare hasLockedIn: boolean;
    declare turnsUntilRespawn: number;

    constructor() {
        super();
        this.connected = true;
        this.hasLockedIn = false;
        this.turnsUntilRespawn = 0;
    }
}

export class ChessGameState extends Schema {
    declare players: MapSchema<Player>;
    declare pieces: MapSchema<Piece>;
    declare controlledTiles: MapSchema<string>;
    declare status: string;
    declare currentTurn: number;
    declare turnEndTime: number;
    declare phase: string;
    declare teamPriority: ArraySchema<string>;
    declare stunnedTeams: MapSchema<number>;

    constructor() {
        super();
        this.players = new MapSchema<Player>();
        this.pieces = new MapSchema<Piece>();
        this.controlledTiles = new MapSchema<string>();
        this.status = "waiting_for_kings";
        this.currentTurn = 1;
        this.turnEndTime = 0;
        this.phase = "planning";
        this.teamPriority = new ArraySchema<string>("black", "white", "blue", "green");
        this.stunnedTeams = new MapSchema<number>();
    }
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