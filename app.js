// --- CONFIGURATION ---
const BOARD_SIZE = 24;
const TILE_SIZE = 32; // Change this to scale your board up or down
const BOARD_PIXEL_SIZE = BOARD_SIZE * TILE_SIZE;
import { Client, Callbacks } from "https://esm.sh/@colyseus/sdk@0.17.11";

let myPieceId = null;
let room;
let commandingPieceId = null;

// --- PIXI SETUP ---
const app = new PIXI.Application({
    width: BOARD_PIXEL_SIZE,
    height: BOARD_PIXEL_SIZE,
    backgroundColor: 0x222222,
    resolution: window.devicePixelRatio || 1,
});
document.getElementById('game-container').appendChild(app.view);

// login UI elements
const loginUI = document.getElementById('login-ui');
const nicknameInput = document.getElementById('nickname-input');
const btnJoin = document.getElementById('btn-join');

// leaderboard UI elements
const leaderboardUI = document.getElementById('leaderboard-ui');
const leaderboardContent = document.getElementById('leaderboard-content');

// The master container holding everything on the board.
// We center its pivot point so that rotating it later spins it perfectly on its axis.
const boardContainer = new PIXI.Container();
boardContainer.width = BOARD_PIXEL_SIZE;
boardContainer.height = BOARD_PIXEL_SIZE;
boardContainer.pivot.x = BOARD_PIXEL_SIZE / 2;
boardContainer.pivot.y = BOARD_PIXEL_SIZE / 2;
boardContainer.position.x = BOARD_PIXEL_SIZE / 2;
boardContainer.position.y = BOARD_PIXEL_SIZE / 2;
app.stage.addChild(boardContainer);

const tilesContainer = new PIXI.Container();
boardContainer.addChild(tilesContainer);

// A container specifically for the tiles (the floor)
const piecesContainer = new PIXI.Container();
boardContainer.addChild(piecesContainer);

// A container specifically for the highlights (the green dots showing valid moves)
const highlightsContainer = new PIXI.Container();
boardContainer.addChild(highlightsContainer);
let currentValidMoves = []; // Store them to check against clicks

// A container specifically for the pieces (the pawns, knights, etc.)
const targetIndicator = new PIXI.Graphics();
targetIndicator.lineStyle(4, 0xFF0000); // A thick red border
targetIndicator.drawRect(0, 0, TILE_SIZE, TILE_SIZE);
targetIndicator.visible = false; // Hidden by default
boardContainer.addChild(targetIndicator);


//A UI graphic to show which piece the King is commanding
const commandIndicator = new PIXI.Graphics();
commandIndicator.lineStyle(4, 0xFFFF00); // Thick Yellow border
commandIndicator.drawRect(0, 0, TILE_SIZE, TILE_SIZE);
commandIndicator.visible = false;
boardContainer.addChild(commandIndicator);

// --- UI ELEMENTS ---
const ffUI = document.getElementById('friendly-fire-ui');
const ffPieceText = document.getElementById('ff-piece');
const ffCoordsText = document.getElementById('ff-coords');
const btnYield = document.getElementById('btn-yield');
const btnHold = document.getElementById('btn-hold');
const btnVeto = document.getElementById('btn-veto');

// --- PROMOTION UI ELEMENTS ---
const btnOpenPromote = document.getElementById('btn-open-promote');
const promoteUI = document.getElementById('promote-ui');
const btnCancelPromote = document.getElementById('btn-cancel-promote');
const rankButtons = document.querySelectorAll('.btn-rank');

// Dictionary to quickly find a sprite by its Colyseus piece ID
const pieceSprites = {};

const timerUI = document.getElementById('timer-ui');



// Helper to make the team names look nice on a dark background
const teamUIColors = {
    "white": "#FFFFFF",
    "black": "#AAAAAA", // Light grey so it's readable on dark background
    "blue": "#66AFFF",
    "green": "#66FF66"
};

function updateLeaderboard() {
    if (!room) return;

    // 1. Tally up the territory points
    const scores = { "white": 0, "black": 0, "blue": 0, "green": 0 };
    room.state.controlledTiles.forEach((teamName) => {
        if (scores[teamName] !== undefined) {
            scores[teamName]++;
        }
    });

    // 2. Build the HTML list based on the CURRENT turn priority
    let html = "";
    
    // Convert Colyseus ArraySchema to a normal array
    const currentPriority = Array.from(room.state.teamPriority); 

    currentPriority.forEach((teamName, index) => {
        const score = scores[teamName];
        const isFirst = index === 0;
        const color = teamUIColors[teamName];
        
        // Highlight the team that goes first this turn
        const rowStyle = isFirst 
            ? `font-weight: bold; font-size: 18px; border-left: 3px solid ${color}; padding-left: 5px;` 
            : `font-size: 14px; opacity: 0.8; padding-left: 8px;`;

        html += `
            <div style="display: flex; justify-content: space-between; color: ${color}; ${rowStyle}">
                <span>${index + 1}. ${teamName.toUpperCase()}</span>
                <span>${score} sq</span>
            </div>
        `;
    });

    leaderboardContent.innerHTML = html;
}

// Cancel hides the menu
btnCancelPromote.onclick = () => {
    promoteUI.style.display = 'none';
};

// Clicking a rank sends the request to the server
rankButtons.forEach(btn => {
    btn.onclick = (e) => {
        const selectedRank = e.target.getAttribute('data-rank');
        if (room) {
            console.log(`Requesting promotion to ${selectedRank}...`);
            room.send("promote_pawn", { targetRank: selectedRank });
        }
        promoteUI.style.display = 'none';
    };
});

// Button Event Listeners
btnYield.onclick = () => {
    if (room) {
        room.send("friendly_fire_response", { yield: true });
        console.log("You yielded the space.");
    }
    ffUI.style.display = 'none'; // Hide the popup
};

btnHold.onclick = () => {
    if (room) {
        room.send("friendly_fire_response", { yield: false });
        console.log("You held your ground.");
    }
    ffUI.style.display = 'none'; // Hide the popup
};

// --- COLYSEUS SETUP ---
// Change this to your live server URL when you deploy
const client = new Client('wss://chess-io-hkjk.onrender.com');


async function connect(playerNickname) {
    try {
        // Pass the nickname option to the server!
        room = await client.joinOrCreate("chess_room", { nickname: playerNickname });
        console.log("Joined successfully!", room.sessionId);

        // Show the leaderboard once we join
        loginUI.style.display = 'none'; 
        leaderboardUI.style.display = 'block';

        // Hide the login screen
        

        // 1. Draw the initial grid
        drawGrid();

       

        

        timerUI.style.display = 'block'; // Unhide the timer!

       // 3. Get the Callbacks handler
        const callbacks = Callbacks.get(room);

        // 4. Listen to the players map
        callbacks.onAdd("players", (player, sessionId) => {
            if (sessionId === room.sessionId) {
                console.log(`I am on team: ${player.team}`);
                myPieceId = player.pieceId; 
                rotateCamera(player.team);
            }

            callbacks.listen(player, "pieceId", (newPieceId, oldPieceId) => {
                // ... your pieceId changing logic ...
            });
            
            // ...
        });

        // 5. Listen to the other maps
        callbacks.onAdd("controlledTiles", (teamColor, tileKey) => {
            updateTileColor(tileKey, teamColor);
            updateLeaderboard();
        });

        callbacks.onAdd("pieces", (piece, pieceId) => {
            const sprite = createPieceSprite(piece);
            pieceSprites[pieceId] = sprite;
            piecesContainer.addChild(sprite);
            
            // Listen for coordinate changes
            piece.position.onChange = function(changes) {
                sprite.targetX = (piece.position.x * 32) + (32 / 2); 
                sprite.targetY = (piece.position.y * 32) + (32 / 2);
                if (pieceId === myPieceId) targetIndicator.visible = false;
            };

            piece.onChange = function(changes) {
                sprite.visible = piece.isAlive;
                if (piece.isGhost) {
                    sprite.alpha = 0.5;
                    sprite.tint = 0xFF0000; 
                } else {
                    sprite.alpha = 1.0;
                    sprite.tint = 0xFFFFFF;
                }
            };
    

            

        room.onMessage("king_force_promotion", (data) => {
    const forceUI = document.getElementById('king-force-ui');
    const actionText = document.getElementById('force-action-text'); // Action label
    const forceTimerText = document.getElementById('force-timer');
    
    actionText.innerText = data.action; // e.g., "Unit Reset (Pawn)"
    
    let count = data.timer;
    forceUI.style.display = 'block';
    forceTimerText.innerText = count;

    clearInterval(forceTimerInterval);
    forceTimerInterval = setInterval(() => {
        count--;
        forceTimerText.innerText = count;
        if (count <= 0) {
            clearInterval(forceTimerInterval);
            forceUI.style.display = 'none';
            // If they didn't cancel, the server logic will process the promotion/reset
        }
    }, 1000);

    btnVeto.onclick = () => {
        room.send("cancel_king_force");
        clearInterval(forceTimerInterval);
        forceUI.style.display = 'none';
    };
});
});
        // 5. Listen for Friendly Fire Pings
        room.onMessage("friendly_fire_ping", (data) => {
            console.log("Friendly fire ping received!", data);
            
            // Populate the text fields with the data from the server
            ffPieceText.innerText = data.contestingPieceType.toUpperCase();
            ffCoordsText.innerText = `(${data.x}, ${data.y})`;
            
            // Show the popup
            ffUI.style.display = 'block';
        });

        // 6. Failsafe: Hide the UI if the turn timer ends before they answer!
        room.state.listen("phase", (currentPhase) => {
            if (currentPhase === "resolving") {
                ffUI.style.display = 'none';
            }
        });
        
        // 7. Cleanup if a piece is ever fully removed from the server state
        room.state.pieces.onRemove((piece, pieceId) => {
            const sprite = pieceSprites[pieceId];
            if (sprite) {
                piecesContainer.removeChild(sprite);
                sprite.destroy();
                delete pieceSprites[pieceId];
            }
        });

        // 8. Listen for explicit Server Errors
        room.onMessage("error", (errorMessage) => {
            console.error("Server Error:", errorMessage);
            // You can replace this with a nice UI toast notification later!
            alert(errorMessage); 
        });

    } catch (e) {
        console.error("Join error", e);
    }

    
}

// --- RENDERING LOGIC ---

// Store our tile graphics in a dictionary for easy color updating later
const mapTiles = {}; 

function drawGrid() {
    for (let x = 0; x < BOARD_SIZE; x++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            const tile = new PIXI.Graphics();
            
            const isLight = (x + y) % 2 === 0;
            const color = isLight ? 0xEEEEEE : 0x888888; 

            tile.beginFill(color);
            tile.drawRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            tile.endFill();

            // NEW: Make the tile clickable!
            tile.eventMode = 'static'; // Pixi v7 uses 'static' instead of 'interactive'
            tile.cursor = 'pointer';
            
            // Listen for the click event
            tile.on('pointerdown', () => {
                if (!room || !myPieceId) return;

                const myPiece = room.state.pieces.get(myPieceId);
                const clickedPiece = getPieceAt(x, y);

                // --- STEP 1: THE KING SELECTS A UNIT ---
                // If I am the King, and I click an ally that is idle or unowned
                if (myPiece.type === "king" && clickedPiece && clickedPiece.team === myPiece.team) {
                    if (clickedPiece.isIdle || clickedPiece.ownerId === "") {
                        // Select this piece!
                        commandingPieceId = clickedPiece.id;
                        
                        // Move the yellow ring to this piece
                        commandIndicator.visible = true;
                        commandIndicator.x = clickedPiece.position.x * TILE_SIZE;
                        commandIndicator.y = clickedPiece.position.y * TILE_SIZE;

                        // Draw the valid moves for the SUBORDINATE
                        highlightsContainer.visible = true;
                        drawValidMoves(clickedPiece);
                        return; // Stop here, wait for them to click a destination
                    }
                }

                // --- STEP 2: THE KING ISSUES THE COMMAND ---
                if (commandingPieceId) {
                    // Did they click a valid green dot?
                    const isValid = currentValidMoves.some(m => m.x === x && m.y === y);
                    if (isValid) {
                        console.log(`Commanding ${commandingPieceId} to: ${x}, ${y}`);
                        room.send("king_command", { targetPieceId: commandingPieceId, x: x, y: y });
                    } else {
                        // Clicked an invalid spot (or another piece), cancel the command
                        console.log("Command cancelled.");
                    }
                    
                    // Reset the command state
                    commandingPieceId = null;
                    commandIndicator.visible = false;
                    highlightsContainer.visible = false;
                    
                    // Redraw the King's own moves just in case they want to move themselves next
                    drawValidMoves(myPiece); 
                    highlightsContainer.visible = true;
                    return;
                }

                // --- NORMAL MOVEMENT (For Everyone Else, or the King moving themselves) ---
                const isValid = currentValidMoves.some(m => m.x === x && m.y === y);
                if (isValid) {
                    console.log(`Locking in move to: ${x}, ${y}`);
                    room.send("lock_move", { x: x, y: y });
                    targetIndicator.visible = true;
                    targetIndicator.x = x * TILE_SIZE;
                    targetIndicator.y = y * TILE_SIZE;
                }
            });

            const tileKey = `${x},${y}`;
            mapTiles[tileKey] = tile;
            
            tilesContainer.addChild(tile);
        }
    }
}

// Helper to find a piece at specific coordinates
        function getPieceAt(x, y) {
            if (!room) return null;
            let foundPiece = null;
            room.state.pieces.forEach((piece) => {
                if (piece.isAlive && piece.position.x === x && piece.position.y === y) {
                    foundPiece = piece;
                }
            });
            return foundPiece;
        }

function updateTileColor(tileKey, teamName) {
    const tile = mapTiles[tileKey];
    if (!tile) return;

    // Define your team colors here
    const teamColors = {
        "white": 0xFFFFFF,
        "black": 0x333333,
        "blue": 0x0000FF,
        "green": 0x00FF00
    };

    const newColor = teamColors[teamName] || 0xAAAAAA;

    // Redraw the tile with the new team color
    const coords = tileKey.split(',');
    const x = parseInt(coords[0]);
    const y = parseInt(coords[1]);

    tile.clear();
    tile.beginFill(newColor);
    // You could make it slightly transparent to keep the grid lines visible:
    // tile.beginFill(newColor, 0.7); 
    tile.drawRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    tile.endFill();
}

function rotateCamera(teamName) {
    // PixiJS uses radians. Math.PI = 180 degrees.
    
    if (teamName === "white" || teamName === "blue") {
        // These teams spawn at the TOP. 
        // We rotate the master container 180 degrees so they appear at the bottom.
        boardContainer.rotation = Math.PI;
        console.log(`Camera rotated 180° for ${teamName} team.`);
    } else if (teamName === "black" || teamName === "green") {
        // These teams spawn at the BOTTOM.
        // No rotation needed.
        boardContainer.rotation = 0;
        console.log(`Camera locked at 0° for ${teamName} team.`);
    }
}

function createPieceSprite(piece) {
    // We use a Container so we can bundle a colored circle and text together
    const spriteGroup = new PIXI.Container();
    
    // 1. Draw the base shape (A colored circle)
    const bg = new PIXI.Graphics();
    const teamColors = { "white": 0xFFFFFF, "black": 0x444444, "blue": 0x4444FF, "green": 0x44FF44 };
    bg.beginFill(teamColors[piece.team] || 0x888888);
    bg.lineStyle(2, 0x000000); // Black outline
    bg.drawCircle(0, 0, TILE_SIZE * 0.4); 
    bg.endFill();
    spriteGroup.addChild(bg);

    // 2. Add the Rank Text (K, Q, B, N, R, P)
    const rankMap = { "king": "K", "queen": "Q", "bishop": "B", "knight": "N", "rook": "R", "pawn": "P" };
    const text = new PIXI.Text(rankMap[piece.type] || "?", {
        fontFamily: 'Arial',
        fontSize: TILE_SIZE * 0.5,
        fill: piece.team === "white" ? 0x000000 : 0xFFFFFF, // Contrast text
        fontWeight: 'bold'
    });
    text.anchor.set(0.5); // Center the text in the circle
    spriteGroup.addChild(text);

    // 3. Add the Player's Name below the piece
    const nameText = new PIXI.Text("", {
    fontFamily: 'Arial',
    fontSize: TILE_SIZE * 0.4,
    fill: 0xFFFFFF,
    stroke: 0x000000,
    strokeThickness: 3,
    fontWeight: 'bold'
    });
    nameText.anchor.set(0.5, 1.8); 
    spriteGroup.addChild(nameText);

    // 4. Position it precisely in the middle of the target tile
    spriteGroup.x = (piece.position.x * TILE_SIZE) + (TILE_SIZE / 2);
    spriteGroup.y = (piece.position.y * TILE_SIZE) + (TILE_SIZE / 2);

    // NEW: Save the targets for the animation loop
    spriteGroup.targetX = spriteGroup.x;
    spriteGroup.targetY = spriteGroup.y;

    // 5. THE COUNTER-ROTATION FIX
    // Since the master boardContainer might be flipped 180 degrees (Math.PI), 
    // we rotate the individual piece in the exact opposite direction so the text stays upright!
    spriteGroup.rotation = -boardContainer.rotation;

    // Only show alive pieces
    spriteGroup.visible = piece.isAlive;

    return spriteGroup;
}

function getValidMoves(piece) {
    const validMoves = [];
    const px = piece.position.x;
    const py = piece.position.y;

    // Helper to check if a coordinate is on the 24x24 board
    const isOnBoard = (x, y) => x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;

    // Helper to add a move if it's on the board
    const addIfValid = (x, y) => {
        if (isOnBoard(x, y)) validMoves.push({ x, y });
    };

    // Helper for sliding pieces (Rook, Bishop, Queen)
    // In simultaneous games, we often just return the full geometric line, 
    // as pieces might move out of the way during the resolution phase!
    const addSlidingMoves = (dx, dy) => {
        for (let i = 1; i < BOARD_SIZE; i++) {
            const nx = px + (dx * i);
            const ny = py + (dy * i);
            if (!isOnBoard(nx, ny)) break;
            validMoves.push({ x: nx, y: ny });
            // NOTE: If you want pieces to be blocked by static allies/enemies, 
            // you would check the server state here and `break;` if a piece is hit.
        }
    };

    switch (piece.type) {
        case "pawn":
            // Pawns move "forward" based on their spawn side
            const forward = (piece.team === "white" || piece.team === "blue") ? 1 : -1;
            addIfValid(px, py + forward);           // Move forward
            addIfValid(px - 1, py + forward);       // Attack diagonal left
            addIfValid(px + 1, py + forward);       // Attack diagonal right
            break;

        case "knight":
            const knightJumps = [
                {x: 1, y: 2}, {x: 2, y: 1}, {x: 2, y: -1}, {x: 1, y: -2},
                {x: -1, y: -2}, {x: -2, y: -1}, {x: -2, y: 1}, {x: -1, y: 2}
            ];
            knightJumps.forEach(jump => addIfValid(px + jump.x, py + jump.y));
            break;

        case "king":
            const kingMoves = [
                {x: 0, y: 1}, {x: 1, y: 1}, {x: 1, y: 0}, {x: 1, y: -1},
                {x: 0, y: -1}, {x: -1, y: -1}, {x: -1, y: 0}, {x: -1, y: 1}
            ];
            kingMoves.forEach(move => addIfValid(px + move.x, py + move.y));
            break;

        case "rook":
            addSlidingMoves(0, 1);  // Down
            addSlidingMoves(0, -1); // Up
            addSlidingMoves(1, 0);  // Right
            addSlidingMoves(-1, 0); // Left
            break;

        case "bishop":
            addSlidingMoves(1, 1);   // Down-Right
            addSlidingMoves(1, -1);  // Up-Right
            addSlidingMoves(-1, 1);  // Down-Left
            addSlidingMoves(-1, -1); // Up-Left
            break;

        case "queen":
            // Queen is just Rook + Bishop
            addSlidingMoves(0, 1); addSlidingMoves(0, -1);
            addSlidingMoves(1, 0); addSlidingMoves(-1, 0);
            addSlidingMoves(1, 1); addSlidingMoves(1, -1);
            addSlidingMoves(-1, 1); addSlidingMoves(-1, -1);
            break;
    }

    // You can always choose to idle (stay in place to hold territory)
    addIfValid(px, py);

    return validMoves;
}

function drawValidMoves(piece) {
    // Clear old highlights
    highlightsContainer.removeChildren();
    currentValidMoves = getValidMoves(piece);

    // Draw a green dot for every valid move
    currentValidMoves.forEach(move => {
        const dot = new PIXI.Graphics();
        dot.beginFill(0x00FF00, 0.5); // Semi-transparent green
        dot.drawCircle((move.x * TILE_SIZE) + (TILE_SIZE / 2), (move.y * TILE_SIZE) + (TILE_SIZE / 2), TILE_SIZE * 0.2);
        dot.endFill();
        highlightsContainer.addChild(dot);
    });
}



function updatePromotionOptions(playerTeam) {
    const graveyardCounts = { "queen": 0, "knight": 0, "rook": 0, "bishop": 0 };
    const activeUnownedCounts = { "queen": 0, "knight": 0, "rook": 0, "bishop": 0 };
    
    room.state.pieces.forEach((p) => {
        if (p.team === playerTeam) {
            if (!p.isAlive && p.ownerId === "") {
                // Truly dead and available for promotion
                graveyardCounts[p.type]++;
            } else if (p.isAlive && p.ownerId === "") {
                // Alive on board but has no player (King might be controlling it)
                activeUnownedCounts[p.type]++;
            }
        }
    });

    const rankButtons = document.querySelectorAll('.btn-rank');
    rankButtons.forEach(btn => {
        const rank = btn.getAttribute('data-rank');
        
        // Clear existing info labels
        const oldInfo = btn.querySelector('.active-info');
        if (oldInfo) oldInfo.remove();

        if (rank === "pawn") {
            btn.disabled = false;
            btn.style.opacity = "1";
            return;
        }

        const deadCount = graveyardCounts[rank] || 0;
        const activeCount = activeUnownedCounts[rank] || 0;

        if (deadCount > 0) {
            // Option 1: Piece is in the graveyard (Available for immediate promotion)
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.style.background = "#44aa44"; // Green tint for available
            btn.innerText = `${rank.toUpperCase()} (${deadCount})`;
        } else {
            // Option 2: Piece is alive on board with no owner (Grayed out for promotion)
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.style.background = "#333";
            btn.innerText = `${rank.toUpperCase()} (0)`;

            if (activeCount > 0) {
                // Add the blue text indicator to inform the player
                const info = document.createElement('span');
                info.className = 'active-info';
                info.innerText = `${activeCount} ACTIVE ON BOARD`;
                btn.appendChild(info);
            }
        }
    });
}

// Update the HUD button trigger
btnOpenPromote.onclick = () => {
    const myPlayer = room.state.players.get(room.sessionId);
    if (myPlayer) {
        updatePromotionOptions(myPlayer.team); // Refresh before showing
        promoteUI.style.display = 'block';
    }
};

// Start the game!
btnJoin.onclick = () => {
    // Grab the text, default to "Anonymous" if they left it blank
    const chosenName = nicknameInput.value.trim() || "Anonymous";
    connect(chosenName);
};

// --- TURN TIMER ENGINE ---
setInterval(() => {
    // Make sure we are connected and actually playing
    if (!room || room.state.status !== "playing") {
        if (timerUI.style.display === 'block') {
            timerUI.innerText = "WAITING";
        }
        return;
    }

    // If the server is currently resolving moves, pause the clock visually
    if (room.state.phase === "resolving") {
        timerUI.innerText = "RESOLVING";
        timerUI.classList.remove('shake-active');
        return;
    }

    // Calculate time left in seconds
    const timeLeftMs = room.state.turnEndTime - Date.now();
    const secondsLeft = Math.max(0, Math.ceil(timeLeftMs / 1000));

    // Format as 00:XX
    const formattedSeconds = secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft;
    timerUI.innerText = `00:${formattedSeconds}`;

    // Apply the panic effect at 10 seconds!
    if (secondsLeft <= 10 && secondsLeft > 0) {
        timerUI.classList.add('shake-active');
    } else {
        timerUI.classList.remove('shake-active');
    }

}, 100); // Check every 100ms for a snappy UI update

let forceTimerInterval;



// --- THE ANIMATION ENGINE ---
app.ticker.add((delta) => {
    // Loop through every piece currently on the board
    for (const pieceId in pieceSprites) {
        const sprite = pieceSprites[pieceId];
        
        // If the sprite hasn't reached its target yet...
        if (sprite.x !== sprite.targetX || sprite.y !== sprite.targetY) {
            
            // Calculate the distance left to travel
            const dx = sprite.targetX - sprite.x;
            const dy = sprite.targetY - sprite.y;
            
            // If it is incredibly close (less than 1 pixel), just snap it into place to stop the math
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
                sprite.x = sprite.targetX;
                sprite.y = sprite.targetY;
            } else {
                // LERP: Move 15% of the remaining distance per frame. 
                // Multiplying by 'delta' ensures it stays smooth even if the monitor refresh rate fluctuates.
                const speed = 0.15 * delta;
                sprite.x += dx * speed;
                sprite.y += dy * speed;
            }
        }
    }
});