export class PathFinder {
  static find(world, start, goal) {
    const key = (x, y) => `${x},${y}`;
    const open = [{ x: start.x, y: start.y, g: 0, f: 0 }];
    const cameFrom = new Map();
    const best = new Map([[key(start.x, start.y), 0]]);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      if (current.x === goal.x && current.y === goal.y) {
        const path = [];
        let cursor = { x: goal.x, y: goal.y };
        while (!(cursor.x === start.x && cursor.y === start.y)) {
          path.push(cursor);
          cursor = cameFrom.get(key(cursor.x, cursor.y));
          if (!cursor) return [];
        }
        path.reverse();
        return path;
      }

      for (const [dx, dy] of dirs) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (!world.isWalkableTile(nx, ny)) continue;
        const nextG = current.g + 1;
        const nextKey = key(nx, ny);
        if (nextG >= (best.get(nextKey) ?? Infinity)) continue;
        best.set(nextKey, nextG);
        cameFrom.set(nextKey, { x: current.x, y: current.y });
        const h = Math.abs(goal.x - nx) + Math.abs(goal.y - ny);
        open.push({ x: nx, y: ny, g: nextG, f: nextG + h });
      }
    }
    return [];
  }
}
