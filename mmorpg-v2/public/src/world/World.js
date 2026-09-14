import { PathFinder } from './PathFinder.js';

export class World {
  constructor() {
    this.tileSize = 48;
    this.cols = 28;
    this.rows = 20;
    this.width = this.cols * this.tileSize;
    this.height = this.rows * this.tileSize;
    this.blocked = new Set();

    // Outer border
    for (let x = 0; x < this.cols; x++) {
      this.blocked.add(`${x},0`);
      this.blocked.add(`${x},${this.rows - 1}`);
    }
    for (let y = 0; y < this.rows; y++) {
      this.blocked.add(`0,${y}`);
      this.blocked.add(`${this.cols - 1},${y}`);
    }

    // Houses / pond / rocks. Gaps are intentional roads.
    for (let x = 5; x <= 9; x++) for (let y = 4; y <= 7; y++) this.blocked.add(`${x},${y}`);
    for (let x = 18; x <= 22; x++) for (let y = 3; y <= 6; y++) this.blocked.add(`${x},${y}`);
    for (let x = 17; x <= 21; x++) for (let y = 13; y <= 16; y++) this.blocked.add(`${x},${y}`);
    for (const tile of ['13,5','14,5','14,6','4,14','5,14','6,14','22,11','23,11']) this.blocked.add(tile);

    this.questTarget = { x: 24, y: 15 };
  }

  isWalkableTile(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return !this.blocked.has(`${x},${y}`);
  }

  isWalkablePixel(x, y, radius = 13) {
    const samples = [
      [x - radius, y - radius], [x + radius, y - radius],
      [x - radius, y + radius], [x + radius, y + radius]
    ];
    return samples.every(([sx, sy]) => this.isWalkableTile(Math.floor(sx / this.tileSize), Math.floor(sy / this.tileSize)));
  }

  tileCenter(tile) {
    return {
      x: tile.x * this.tileSize + this.tileSize / 2,
      y: tile.y * this.tileSize + this.tileSize / 2
    };
  }

  pixelToTile(x, y) {
    return { x: Math.floor(x / this.tileSize), y: Math.floor(y / this.tileSize) };
  }

  findPathFromPixel(x, y, goal = this.questTarget) {
    return PathFinder.find(this, this.pixelToTile(x, y), goal);
  }

  render(ctx, camera) {
    const ts = this.tileSize;
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Ground checker texture, intentionally simple until final tile art is approved.
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const px = x * ts;
        const py = y * ts;
        const blocked = this.blocked.has(`${x},${y}`);
        ctx.fillStyle = blocked ? ((x + y) % 2 ? '#39453a' : '#334036') : ((x + y) % 2 ? '#7f9a64' : '#78925f');
        ctx.fillRect(px, py, ts, ts);
        ctx.strokeStyle = 'rgba(0,0,0,.06)';
        ctx.strokeRect(px, py, ts, ts);
      }
    }

    // Main road
    ctx.fillStyle = '#b89d70';
    ctx.fillRect(10 * ts, 1 * ts, 5 * ts, 18 * ts);
    ctx.fillRect(1 * ts, 9 * ts, 26 * ts, 4 * ts);

    // Quest NPC marker
    const q = this.tileCenter(this.questTarget);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#d8c36d';
    ctx.fill();
    ctx.fillStyle = '#2e2718';
    ctx.font = '700 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('장로', q.x, q.y - 22);

    ctx.restore();
  }
}
