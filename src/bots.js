// ==========================================================================
// Bot AI Pathfinding & Decision Logic
// ==========================================================================

export class BotController {
  /**
   * Decide the next direction for an AI snake.
   * @param {Snake} botSnake - The bot snake instance.
   * @param {Array<Snake>} allSnakes - List of all active snakes in the arena (including bot and player).
   * @param {Array<Object>} allFood - List of active food items.
   * @param {number} gridWidth - Map width in cells.
   * @param {number} gridHeight - Map height in cells.
   * @param {boolean} wrapBoundaries - Whether the map wraps around at borders.
   */
  static getNextDirection(botSnake, allSnakes, allFood, gridWidth, gridHeight, wrapBoundaries = false) {
    const head = botSnake.body[0];
    
    // Find closest food
    let target = null;
    let minDistance = Infinity;
    
    allFood.forEach(food => {
      // Calculate distance (taking grid wrap into account if enabled)
      let dx = Math.abs(food.x - head.x);
      let dy = Math.abs(food.y - head.y);
      
      if (wrapBoundaries) {
        dx = Math.min(dx, gridWidth - dx);
        dy = Math.min(dy, gridHeight - dy);
      }
      
      const dist = dx + dy;
      // Prioritize high-value food or closer food
      let priority = dist;
      if (food.type === 'golden') priority -= 4; // attract to golden food
      if (food.type === 'shield') priority -= 2; // attract to shields
      
      if (priority < minDistance) {
        minDistance = priority;
        target = food;
      }
    });

    // If no food exists, target center
    if (!target) {
      target = { x: Math.floor(gridWidth / 2), y: Math.floor(gridHeight / 2) };
    }

    // Evaluate the 4 possible moves
    const moves = [
      { x: 0, y: -1 }, // Up
      { x: 0, y: 1 },  // Down
      { x: -1, y: 0 }, // Left
      { x: 1, y: 0 }   // Right
    ];

    let bestMove = botSnake.dir;
    let bestScore = -Infinity;

    moves.forEach(move => {
      // Prevent immediate 180 turn
      if (move.x + botSnake.dir.x === 0 && move.y + botSnake.dir.y === 0) return;

      // Calculate next position
      let nextX = head.x + move.x;
      let nextY = head.y + move.y;

      if (wrapBoundaries) {
        nextX = (nextX + gridWidth) % gridWidth;
        nextY = (nextY + gridHeight) % gridHeight;
      }

      // 1. Base score is negative distance to target (closer is better)
      let dx = Math.abs(target.x - nextX);
      let dy = Math.abs(target.y - nextY);
      if (wrapBoundaries) {
        dx = Math.min(dx, gridWidth - dx);
        dy = Math.min(dy, gridHeight - dy);
      }
      let score = -(dx + dy);

      // 2. Check collision risk
      const collides = this.checkCollision(nextX, nextY, botSnake.id, allSnakes, gridWidth, gridHeight, wrapBoundaries);
      
      if (collides) {
        score -= 100000; // massive penalty for crash
      } else {
        // 3. Lookahead 1 step to avoid trapping self in a dead-end
        const openPaths = this.countOpenNeighbors(nextX, nextY, botSnake.id, allSnakes, gridWidth, gridHeight, wrapBoundaries);
        if (openPaths === 0) score -= 15000; // instant death trap
        if (openPaths === 1) score -= 5000;  // tight squeeze
        score += openPaths * 10;             // prefer open areas
      }

      // Add minor randomness to break ties and make movements look organic
      score += (Math.random() - 0.5) * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    });

    return bestMove;
  }

  // Check if position collides with boundaries or any snake body
  static checkCollision(x, y, selfId, allSnakes, gridWidth, gridHeight, wrapBoundaries) {
    // Wall boundary check (if no wrap)
    if (!wrapBoundaries) {
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) {
        return true;
      }
    }

    // Snake body check
    for (let snake of allSnakes) {
      if (snake.isDead) continue;
      
      // If it is another snake, check entire body
      // If it's self, we can skip checking our own tail end since it moves, but checking body is safe
      const startSegmentIdx = (snake.id === selfId) ? 1 : 0;
      
      for (let i = startSegmentIdx; i < snake.body.length; i++) {
        if (snake.body[i].x === x && snake.body[i].y === y) {
          // If self or other snake has shield active, we might survive, but generally treat as collision
          if (snake.id === selfId && snake.shieldTime > 0) continue;
          return true;
        }
      }
    }

    return false;
  }

  // Count unblocked neighboring cells around a prospective position
  static countOpenNeighbors(x, y, selfId, allSnakes, gridWidth, gridHeight, wrapBoundaries) {
    const neighbors = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 }
    ];

    let openCount = 0;
    neighbors.forEach(n => {
      let nx = x + n.x;
      let ny = y + n.y;
      
      if (wrapBoundaries) {
        nx = (nx + gridWidth) % gridWidth;
        ny = (ny + gridHeight) % gridHeight;
      }
      
      if (!this.checkCollision(nx, ny, selfId, allSnakes, gridWidth, gridHeight, wrapBoundaries)) {
        openCount++;
      }
    });
    
    return openCount;
  }
}
