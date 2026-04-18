import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';

// Helper schema for coordinates
export class Position extends Schema {
    @type("int8") x!: number;
    @type("int8") y!: number;
}

// Represents an actual piece on the board
export class Piece extends Schema {
    @type("string") id!: string;         // e.g., "white_pawn_1"
    @type("string") type!: string;       // "pawn", "knight", "king", etc.
    @type("string") team!: string;       // "white", "black", "blue", "green"
    @type("string") ownerId!: string;    // Player's sessionId (empty if unowned/dead)
    @type(Position) position: Position = new Position();
    @type("boolean") isAlive: boolean = true;
    @type("boolean") isIdle: boolean = true; // True if player hasn't locked in or no owner
    @type("boolean") isGhost: boolean = false; // True if materializing ghost piece
    
    // Promotion data (only relevant for pawns)
    @type("int8") startX: number = 0;
    @type("int8") startY: number = 0;
    @type("boolean") canPromote: boolean = false;

    // Turn intent data
    @type("boolean") hasLockedIn: boolean = false;
    @type("string") lockedBy: string = "";
    @type(Position) lockedTarget: Position = new Position();
}

// Represents a connected player
export class Player extends Schema {
    @type("string") sessionId!: string;
    @type("string") nickname!: string;
    @type("string") team!: string;
    @type("string") pieceId!: string;    // The specific piece they currently control
    @type("boolean") connected: boolean = true;
    @type("boolean") hasLockedIn: boolean = false;

    @type("int8") turnsUntilRespawn: number = 0;

}

// The master state synchronized to all clients
export class ChessGameState extends Schema {
    // Maps are incredibly fast for looking up specific players/pieces during resolution
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Piece }) pieces = new MapSchema<Piece>();
    @type({ map: "string" }) controlledTiles = new MapSchema<string>();

    // Game loop and timing
    @type("string") status: string = "waiting_for_kings"; // "waiting_for_kings" or "playing"
    @type("number") currentTurn: number = 1;
    @type("number") turnEndTime: number = 0; // Epoch timestamp for the 30s countdown
    @type("string") phase: string = "planning"; // "planning" or "resolving"

    // Mechanics we discussed
    @type(["string"]) teamPriority = new ArraySchema<string>("black", "white", "blue", "green");
    @type({ map: "uint8" }) stunnedTeams = new MapSchema<number>(); // Maps team name to remaining stun turns
}