import { Room, Client } from "colyseus";
import { ChessGameState, Piece, Position, Player } from "../schema/ChessGameState.js";
import boardConfig from "../config/boardConfig.json";
import fs from "fs";
import path from "path";

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ChessRoomOptions {
    state?: ChessGameState;
    metadata?: any;
}

export class ChessRoom extends Room<ChessRoomOptions> {
    

    private pieceRankOrder = ["king", "queen", "bishop", "knight", "rook", "pawn"];

    private successionOrder = ["queen", "bishop", "knight", "rook", "pawn"];

    
     private loadBoardConfiguration() {
        try {
            // Read the JSON file synchronously on startup
            const configPath = path.join(__dirname, "../config/boardConfig.json");
            const rawData = fs.readFileSync(configPath, 'utf-8');
            const boardConfig = JSON.parse(rawData);

            // Iterate through each team in the JSON
            for (const teamName in boardConfig.teams) {
                const teamPieces = boardConfig.teams[teamName];

                teamPieces.forEach((pieceData: any) => {
                    const newPiece = new Piece();
                    newPiece.id = pieceData.id;
                    newPiece.type = pieceData.type;
                    newPiece.team = teamName;
                    newPiece.ownerId = ""; // Unowned until a player joins and claims it
                    
                    // Set Coordinates
                    newPiece.position.x = pieceData.x;
                    newPiece.position.y = pieceData.y;

                    //pawn promotion tracking
                    newPiece.startX = pieceData.x;
                    newPiece.startY = pieceData.y;

                    // Add to the Colyseus MapSchema
                    this.state.pieces.set(newPiece.id, newPiece);
                });
            }
        } catch (error) {
            console.error("Failed to load board configuration:", error);
        }
    }

    private resolveTurn() {
        // Step 1: Process moves based on teamPriority order
        this.executeMovesAndCaptures();

        // Step 2: Check for special mechanics (Pawn Promotion, King Death stuns)
        this.processSpecialMechanics();

        // Step 3: Clean up and start the next turn
        this.prepareNextTurn();
    }

    private processSpecialMechanics() {
        for (const piece of this.state.pieces.values()) {
            
            // Skip dead pieces
            if (!piece.isAlive) continue;

            // --- PAWN PROMOTION MATH ---
            if (piece.type === "pawn" && !piece.canPromote) {
                
                // Calculate Manhattan Distance
                const distance = Math.abs(piece.startX - piece.position.x) + 
                                 Math.abs(piece.startY - piece.position.y);

                // If they hit the 8-square threshold, flag them!
                if (distance >= 8) {
                    piece.canPromote = true;
                    console.log(`${piece.id} has traveled ${distance} spaces and can now promote!`);
                }
            }

            // --- KING DEATH STUNS ---
            // (We will add the logic for King captures and team stuns here next)
        }
    }

    private prepareNextTurn() {
    // 1. Clear ALL Ghost flags first
    this.state.pieces.forEach((piece: Piece) => { piece.isGhost = false; });

    // 2. Rotate Priority & Clear Locks
    const firstPriority = this.state.teamPriority.shift();
    if (firstPriority) this.state.teamPriority.push(firstPriority);

    this.state.pieces.forEach((piece: Piece) => {
        piece.hasLockedIn = false;
        piece.lockedBy = "";
        piece.lockedTarget.x = piece.position.x;
        piece.lockedTarget.y = piece.position.y;

        // NEW: Clear promotion flag for dead pieces so they don't respawn with it
        if (!piece.isAlive) {
            piece.canPromote = false;
        }
    });

    // 3. Process Respawn Assignments (Now player.pieceId is populated)
    for (const player of this.state.players.values()) {
        if (player.pieceId === "" && player.turnsUntilRespawn > 0) {
            player.turnsUntilRespawn--;
            if (player.turnsUntilRespawn === 0) {
                const newPiece = this.findHighestAvailablePieceForTeam(player.team);
                if (newPiece) {
                    player.pieceId = newPiece.id;
                    newPiece.ownerId = player.sessionId;
                    newPiece.isIdle = false;
                    // Make it visible as a ghost warning
                    newPiece.isAlive = true; 
                    newPiece.isGhost = true; 
                }
            }
        }
    }

    // 4. Increment turn counter
    this.state.currentTurn++;

    // 5. Decrement Stuns
    this.state.stunnedTeams.forEach((turnsLeft: number, teamName: string) => {
        if (turnsLeft > 0) {
            this.state.stunnedTeams.set(teamName, turnsLeft - 1);
            if (turnsLeft - 1 === 0) {
                console.log(`Team ${teamName} is no longer stunned!`);
                this.state.stunnedTeams.delete(teamName);
            }
        }
    });

    // 6. Restart the clock
    this.state.turnEndTime = Date.now() + 30000; 
    this.state.phase = "planning";
    
    console.log(`Starting Turn ${this.state.currentTurn}. Priority: ${this.state.teamPriority[0]}`);
    }

    private checkGameStartCondition() {
        if (this.state.status === "playing") return;

        // Count how many Kings are currently owned by a player
        let ownedKings = 0;
        this.state.pieces.forEach((piece: Piece) => {
            if (piece.type === "king" && piece.ownerId !== "") {
                ownedKings++;
            }
        });

        if (ownedKings === 4) {
            this.state.status = "playing";
            this.state.phase = "planning";
            // Start your 30-second turn countdown here
            this.state.turnEndTime = Date.now() + 30000; 
            console.log("All 4 Kings seated. The game begins!");
        }
    }

    private executeMovesAndCaptures() {
        const movedThisTurn = new Set<string>();

        for (const teamName of this.state.teamPriority) {
            if (this.state.stunnedTeams.has(teamName) && this.state.stunnedTeams.get(teamName)! > 0) {
                continue; 
            }

            const movingPieces: Piece[] = Array.from(this.state.pieces.values()).filter(
                (p: any) => p.team === teamName && p.isAlive && p.hasLockedIn
            ) as Piece[];

            for (const piece of movingPieces) {
                const destX = piece.lockedTarget.x;
                const destY = piece.lockedTarget.y;

                if (destX === piece.position.x && destY === piece.position.y) {
                    this.state.controlledTiles.set(`${destX},${destY}`, piece.team);
                    continue; 
                }

                // NEW: Get the exact path the piece is traveling
                const path = this.getPath(piece.position.x, piece.position.y, destX, destY, piece.type);
                
                let finalX = piece.position.x;
                let finalY = piece.position.y;
                let moveSuccessful = true;

                // Traverse the path one square at a time
                for (const step of path) {
                    const pieceAtStep = this.getAlivePieceAt(step.x, step.y);

                    if (pieceAtStep && pieceAtStep.isGhost) {
                    // CRUSH RULE: The moving piece hits a materializing unit
                    piece.isAlive = false;
                    piece.ownerId = "";
                    // Moving piece dies instantly; Ghost becomes solid at end of turn
                    console.log(`${piece.id} was crushed by a spawning unit!`);
                    break; 
                    }   

                    if (pieceAtStep) {
                        if (pieceAtStep.team === piece.team) {
                            // FRIENDLY BUMP: Stop sliding!
                            if (!pieceAtStep.hasLockedIn || pieceAtStep.lockedTarget.x === step.x) {
                                moveSuccessful = false;
                                break; 
                            }
                        } else {
                            // ENEMY COLLISION
                            if (movedThisTurn.has(pieceAtStep.id)) {
                                // Priority Crash: You die.
                                piece.isAlive = false;
                                piece.ownerId = "";
                                moveSuccessful = false;

                                const deadPlayerClient = Array.from(this.state.players.values()).find(
                                    (player: any) => player.pieceId === piece.id
                                ) as Player;

                                if (deadPlayerClient) {
                                    deadPlayerClient.pieceId = "";
                                    deadPlayerClient.turnsUntilRespawn = 3;
                                }
                                
                                if (piece.type === "king") this.handleKingDeath(piece.team);
                                break; // Stop sliding, you are dead!
                                
                            } else {
                                // Ambush: You hit them and stop moving!
                                pieceAtStep.isAlive = false;
                                pieceAtStep.ownerId = "";
                                
                                const deadPlayerClient = Array.from(this.state.players.values()).find(
                                    (player: any) => player.pieceId === pieceAtStep.id
                                ) as Player;

                                if (deadPlayerClient) {
                                    deadPlayerClient.pieceId = "";
                                    deadPlayerClient.turnsUntilRespawn = 3;
                                }
                                
                                if (pieceAtStep.type === "king") {
                                    this.handleKingDeath(pieceAtStep.team);
                                }
                                
                                // NEW: The piece successfully moved to THIS intermediate square, but no further.
                                finalX = step.x;
                                finalY = step.y;
                                break; 
                            }
                        }
                    }
                    
                    // If the square was empty (or the ally vacated it), update our intended final position
                    finalX = step.x;
                    finalY = step.y;
                }

                if (moveSuccessful) {
                    // Update the piece's position to wherever it stopped
                    piece.position.x = finalX;
                    piece.position.y = finalY;
                    movedThisTurn.add(piece.id);

                    // Paint the tile!
                    const tileKey = `${finalX},${finalY}`;
                    this.state.controlledTiles.set(tileKey, piece.team);
                }
            }
        }
    }

    private findHighestAvailablePiece(): Piece | null {
        // Iterate through the ranks (King first, then Queen, etc.)
        for (const rank of this.pieceRankOrder) {
            
            // Iterate through the teams based on CURRENT turn priority
            // This ensures if Black is 1st priority, Black gets their Queen before White.
            for (const teamName of this.state.teamPriority) {
                
                // Find an unowned piece of this rank on this team
                const availablePiece: any = Array.from(this.state.pieces.values()).find(
                    (p: any) => p.type === rank && p.team === teamName && p.ownerId === ""
                );

                if (availablePiece) {
                    return availablePiece;
                }
            }
        }
        return null; // No pieces left
    }

    private handleKingDeath(teamName: string) {
        console.log(`The King of team ${teamName} has fallen! Applying 3-turn stun.`);

        // 1. Apply the Stun Penalty
        this.state.stunnedTeams.set(teamName, 3);

        // 2. Find the Heir to the Throne
        let heirPiece: Piece | null = null;

        for (const rank of this.successionOrder) {
            // Find all ALIVE pieces of this rank on this team that have an ACTIVE PLAYER
            const candidates: any[] = Array.from(this.state.pieces.values()).filter(
                (p: any) => p.team === teamName && p.type === rank && p.isAlive && p.ownerId !== ""
            );

            if (candidates.length > 0) {
                // Tie-breaker: sort by ID to pick the "oldest" piece
                candidates.sort((a: any, b: any) => a.id.localeCompare(b.id));
                heirPiece = candidates[0] as Piece;
                break;
            }
        }

        // 3. Crown the New King
        if (heirPiece) {
            console.log(`${heirPiece.ownerId}'s ${heirPiece.type} is now the King of team ${teamName}!`);
            
            // The piece actually transforms into a King!
            // It loses its old movement rules and gains the Commander RTS abilities.
            heirPiece.type = "king"; 
            
            // Send a specific alert to this client so they know they are the new Commander
            const heirClient = this.clients.find(c => c.sessionId === heirPiece!.ownerId);
            if (heirClient) {
                heirClient.send("crowned_king", { message: "The King is dead! YOU are the new King!" });
            }
        } else {
            console.log(`Team ${teamName} has no active players left to take the crown. They are doomed.`);
        }
    }

    private handleKingDisconnect(kingPiece: Piece) {
        console.log(`The King of team ${kingPiece.team} disconnected! Reassigning the commander seat...`);

        let heirPlayerClient: Player | null = null;
        let vacatedPiece: Piece | null = null;

        // Find the player controlling the highest-ranked piece
        for (const rank of this.successionOrder) {
            // Find an alive piece of this rank that has an ACTIVE player
            const candidatePieces: any[] = Array.from(this.state.pieces.values()).filter(
                (p: any) => p.team === kingPiece.team && p.type === rank && p.isAlive && p.ownerId !== ""
            );

            if (candidatePieces.length > 0) {
                // Tie-breaker: sort by ID
                candidatePieces.sort((a: any, b: any) => a.id.localeCompare(b.id));
                vacatedPiece = candidatePieces[0] as Piece;
                heirPlayerClient = this.state.players.get((vacatedPiece as Piece).ownerId) || null;
                break;
            }
        }

        if (heirPlayerClient && vacatedPiece) {
            // 1. Unlink the player from their old piece (it becomes idle)
            vacatedPiece.ownerId = "";
            vacatedPiece.isIdle = true;

            // 2. Put the player into the King piece
            kingPiece.ownerId = heirPlayerClient.sessionId;
            kingPiece.isIdle = false;
            heirPlayerClient.pieceId = kingPiece.id;

            console.log(`${heirPlayerClient.nickname} abandoned their ${vacatedPiece.type} to take over the King!`);

            // 3. Notify the client so their UI updates
            const client = this.clients.find(c => c.sessionId === heirPlayerClient!.sessionId);
            if (client) {
                client.send("crowned_king", { message: "The King disconnected! You have been moved to take command." });
            }
        } else {
            console.log(`Team ${kingPiece.team} has no active players left to take over the King.`);
        }
    }

    // Helper function to scan the board for collisions
    private getAlivePieceAt(x: number, y: number): Piece | undefined {
        for (const piece of this.state.pieces.values()) {
            if (piece.isAlive && piece.position.x === x && piece.position.y === y) {
                return piece;
            }
        }
        return undefined;
    }

      // Helper Function for Friendly Fire
    private checkForFriendlyFire(teamName: string, targetX: number, targetY: number): Piece | null {
        for (const [id, piece] of this.state.pieces.entries()) {
            if (piece.team === teamName && piece.hasLockedIn && 
                piece.lockedTarget.x === targetX && piece.lockedTarget.y === targetY) {
                return piece;
            }
        }
        return null;
    }

    private findHighestAvailablePieceForTeam(teamName: string): Piece | null {
        // Iterate through ranks (skipping King, since succession handles that)
        const rankOrder = ["queen", "bishop", "knight", "rook", "pawn"];

        for (const rank of rankOrder) {
            // Find all alive, unowned pieces of this rank on this team
            const availablePieces: any[] = Array.from(this.state.pieces.values()).filter(
                (p: any) => p.team === teamName && p.type === rank && p.isAlive && p.ownerId === ""
            );

            if (availablePieces.length > 0) {
                // Tie-breaker: sort by ID to be consistent
                availablePieces.sort((a: any, b: any) => a.id.localeCompare(b.id));
                return availablePieces[0] as Piece;
            }
        }
        return null;
    }

    private getPath(startX: number, startY: number, destX: number, destY: number, type: string): any[] {
        // Knights jump over pieces. Kings and Pawns only move 1 square.
        if (type === "knight" || type === "king" || type === "pawn") {
            const pos = new Position();
            pos.x = destX; pos.y = destY;
            return [pos];
        }

        const path: Position[] = [];
        const dx = Math.sign(destX - startX);
        const dy = Math.sign(destY - startY);
        
        let cx = startX + dx;
        let cy = startY + dy;

        // Trace the path step-by-step until we hit the destination
        while (cx !== destX || cy !== destY) {
            const pos = new Position();
            pos.x = cx; pos.y = cy;
            path.push(pos);
            cx += dx;
            cy += dy;
        }
        
        // Add the final destination
        const finalPos = new Position();
        finalPos.x = destX; finalPos.y = destY;
        path.push(finalPos);

        return path;
    }




// 1. Initialize the state
        state = new ChessGameState();


      // The onCreate method runs once when the room/match spins up
    onCreate(options: any) {
        

        // 2. Load the JSON configuration
        this.loadBoardConfiguration();

        // 3. Set the initial game loop timer
        this.setSimulationInterval((deltaTime) => this.update(deltaTime));
        
        
        
        // Let clients know the room is ready
        console.log("Chess Room Created. Board initialized.");

        // 1. STANDARD MOVE LOCK-IN
        this.onMessage("lock_move", (client, data) => {
            if (this.state.phase !== "planning") return;

            const player = this.state.players.get(client.sessionId);
            if (!player || !player.pieceId) return;
            const piece = this.state.pieces.get(player.pieceId);
            if (!piece) return;

            // --- THE FINALITY CHECK ---
            // If the player already locked this in themselves, reject any changes!
            if (piece.lockedBy === "player") {
                client.send("error", "Your move is locked in and cannot be changed.");
                return;
            }

            // Check for Friendly Fire (Is an ally already going here?)
            const allyConflict = this.checkForFriendlyFire(piece.team, data.x, data.y);
            if (allyConflict) {
                // Ping the ally who locked in first!
                const allyClient = this.clients.find(c => c.sessionId === allyConflict.ownerId);
                if (allyClient) {
                    allyClient.send("friendly_fire_ping", {
                        contestingPieceType: piece.type,
                        x: data.x,
                        y: data.y
                    });
                }
                // We don't lock this piece in yet. We wait for the ally's response.
                return; 
            }

            // Lock it in as the PLAYER
            piece.lockedTarget.x = data.x;
            piece.lockedTarget.y = data.y;
            piece.hasLockedIn = true;
            piece.lockedBy = "player"; // This seals the deal. No more changes allowed.
        });

        // 2. FRIENDLY FIRE RESPONSE (Hold or Yield)
        this.onMessage("friendly_fire_response", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.pieceId) return;
            const piece = this.state.pieces.get(player.pieceId);
            if (!piece) return;

            if (data.yield === true) {
                // They gave up the space. Clear their lock-in.
                piece.hasLockedIn = false;
                if (player) player.hasLockedIn = false;
                
                // You can optionally send a message back to the contesting player 
                // telling them the space is theirs to lock in now.
            }
            // If data.yield === false (Hold), we do nothing. They keep their lock-in.
        });

        // 3. KING COMMAND (RTS Override)
        this.onMessage("king_command", (client, data) => {
            if (this.state.phase !== "planning") return;

            const player = this.state.players.get(client.sessionId);
            if (!player || !player.pieceId) return;
            const kingPiece = this.state.pieces.get(player.pieceId);
            if (!kingPiece || kingPiece.type !== "king") return;

            const targetPiece = this.state.pieces.get(data.targetPieceId);
            if (!targetPiece || targetPiece.team !== kingPiece.team) return;
            if (!targetPiece.isIdle && targetPiece.ownerId !== "") return;
            if (targetPiece.lockedBy === "player") return; 

            const isEdgePawn = targetPiece.type === "pawn" && 
                (targetPiece.position.x === 0 || targetPiece.position.x === 23 || 
                 targetPiece.position.y === 0 || targetPiece.position.y === 23);
                 
            const timeLeftMs = this.state.turnEndTime - Date.now();

            if (isEdgePawn) {
                if (timeLeftMs < 10000) {
                    client.send("error", "Too late to command an edge pawn.");
                    return;
                }
                targetPiece.lockedBy = "king_force"; 
                const targetClient = this.clients.find(c => c.sessionId === targetPiece.ownerId);
                if (targetClient) {
                    targetClient.send("king_force_promotion", { 
                        timer: 10,
                        action: "Unit Reset (Pawn)"
                    });
                }
            } else {
                targetPiece.lockedTarget.x = data.x;
                targetPiece.lockedTarget.y = data.y;
                targetPiece.hasLockedIn = true;
                targetPiece.lockedBy = "king";
            }
        });

// NEW: Allow the player to cancel a King's force
this.onMessage("cancel_king_force", (client) => {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.pieceId) return;
    const piece = this.state.pieces.get(player.pieceId);
    if (piece && piece.lockedBy === "king_force") {
        piece.lockedBy = ""; // Clear the threat
        console.log(`${player.nickname} vetoed the King's force command.`);
    }
});

        // 4. PAWN PROMOTION REQUEST
        this.onMessage("promote_pawn", (client, data) => {
            if (this.state.phase !== "planning") return;

            const player = this.state.players.get(client.sessionId);
            if (!player || !player.pieceId) return;
            const pawn = this.state.pieces.get(player.pieceId);
            if (!pawn || pawn.type !== "pawn" || !pawn.canPromote) return;
    
            const targetRank = data.targetRank;

            if (targetRank === "pawn") {
                pawn.isAlive = false;
                pawn.ownerId = "";
                if (player) {
                    player.pieceId = "";
                    player.turnsUntilRespawn = 1; // Respawns next turn cycle
                    console.log(`${player.nickname} chose to reset as a Pawn.`);
                }
                return;
            }

            // 1. Find an available piece of that rank in the team's graveyard
            const availablePiece: any = Array.from(this.state.pieces.values()).find(
                (p: any) => p.team === pawn.team && p.type === targetRank && p.ownerId === "" && !p.isAlive
            );

            if (!availablePiece) {
                client.send("error", `No unowned ${targetRank}s are currently available.`);
                return;
            }

            // 2. Execute the Transformation!
            
            // Kill the pawn and clear its owner
            pawn.isAlive = false;
            pawn.ownerId = "";
            pawn.canPromote = false;

            // Resurrect the requested piece at the pawn's current location
            availablePiece.isAlive = true;
            availablePiece.position.x = pawn.position.x;
            availablePiece.position.y = pawn.position.y;
            availablePiece.ownerId = client.sessionId;
            availablePiece.isIdle = false;

            // Re-link the player to their new powerhouse piece
            if (player) {
                player.pieceId = availablePiece.id;
                console.log(`${player.nickname} promoted their pawn into a ${targetRank}!`);
            }
        });
    }

    onJoin(client: Client, options: any) {
        console.log(`${client.sessionId} joined.`);

        const pieceToAssign = this.findHighestAvailablePiece();

        if (!pieceToAssign) {
            // Room is totally full (64 players). 
            // You could alternatively assign them as a spectator here.
            client.send("error", "Room is full.");
            client.leave();
            return;
        }

        // 1. Create the Player
        const newPlayer = new Player();
        newPlayer.sessionId = client.sessionId;
        newPlayer.nickname = options.nickname || "Anonymous";
        newPlayer.team = pieceToAssign.team;
        newPlayer.pieceId = pieceToAssign.id;
        
        // 2. Claim the Piece
        pieceToAssign.ownerId = client.sessionId;
        pieceToAssign.isIdle = false;

        // 3. Save to state
        this.state.players.set(client.sessionId, newPlayer);

        // 4. Check if we should unpause the game
        this.checkGameStartCondition();
    }

    onLeave(client: Client, code?: number) {
        console.log(`${client.sessionId} left the room.`);

        // 1. Find the player in the state
        const player = this.state.players.get(client.sessionId);
        if (!player) return;

        // 2. Find the piece they were controlling
        const piece = this.state.pieces.get(player.pieceId);

        // 3. Handle the disconnect based on the game phase
        if (this.state.status === "waiting_for_kings") {
            
            // PRE-GAME: Clear the piece so the next joiner can take it
            if (piece) {
                piece.ownerId = "";
                piece.isIdle = true;
                console.log(`Freed up ${piece.type} on team ${piece.team}.`);
            }
            
            // Completely remove the player from the lobby state
            this.state.players.delete(client.sessionId);

        } else if (this.state.status === "playing") {
            
            // MID-GAME: The game has already started
            // Do NOT delete the player from state, as they might reconnect
            player.connected = false;
            
            if (piece) {
                piece.isIdle = true; // Flags the piece so the King can now command it
            }

            if (piece && piece.type === "king") {
                // Instantly reassign the seat to the next player
                this.handleKingDisconnect(piece); 
            }
        }
    }


     update(deltaTime: number) {
        // 1. Do nothing if we are still in the lobby waiting for Kings
        if (this.state.status !== "playing") return;

        // 2. Only watch the clock during the planning phase
        if (this.state.phase === "planning") {
            const now = Date.now();

            // 3. Has the timer hit zero?
            if (now >= this.state.turnEndTime) {
                // Lock the board immediately! 
                // Because phase is no longer "planning", any late "lock_move" 
                // messages arriving due to latency will be automatically rejected.
                this.state.phase = "resolving";
                
                console.log(`Turn ${this.state.currentTurn} ended! Resolving moves...`);
                
                // 4. Trigger the heavy lifting
                this.resolveTurn();
            }
        }
    }
}