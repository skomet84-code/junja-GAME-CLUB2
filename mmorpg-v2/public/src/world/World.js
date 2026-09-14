import { PathFinder } from './PathFinder.js';

export class World {
  constructor() {
    this.tileSize = 48;
    this.cols = 34;
    this.rows = 26;
    this.width = this.cols * this.tileSize;
    this.height = this.rows * this.tileSize;

    this.pathTiles = new Set();
    this.waterTiles = new Set();
    this.blocked = new Set();
    this.houses = [];
    this.trees = [];
    this.rocks = [];
    this.resources = [];
    this.npcs = [];
    this.monsters = [];
    this.time = 0;

    this.#buildVillage();

    this.spawn = this.tileCenter({ x: 16, y: 21 });
    this.questTarget = { x: 28, y: 8 };
  }

  #buildVillage() {
    for (let x = 0; x < this.cols; x++) {
      this.#addTree(x, 0);
      this.#addTree(x, this.rows - 1);
    }
    for (let y = 1; y < this.rows - 1; y++) {
      this.#addTree(0, y);
      this.#addTree(this.cols - 1, y);
    }

    this.#roadRect(15, 1, 3, 24);
    this.#roadRect(2, 11, 30, 3);
    this.#roadRect(27, 6, 3, 8);
    this.#roadRect(8, 12, 3, 10);

    for (let y = 4; y <= 8; y++) {
      for (let x = 4; x <= 9; x++) {
        const corner = (x === 4 || x === 9) && (y === 4 || y === 8);
        if (!corner) this.#addWater(x, y);
      }
    }

    this.#addHouse({ x: 5, y: 15, w: 6, h: 4, doorX: 9, label: '잡화점' });
    this.#addHouse({ x: 21, y: 16, w: 6, h: 4, doorX: 23, label: '대장간' });
    this.#addHouse({ x: 25, y: 3, w: 6, h: 4, doorX: 28, label: '장로의 집' });

    const treePoints = [
      [2,3],[3,4],[11,3],[12,5],[20,3],[22,5],[31,3],[31,7],
      [3,15],[3,18],[13,16],[13,20],[29,17],[31,19],[12,23],
      [20,22],[23,23],[28,22],[6,22],[4,23]
    ];
    for (const [x, y] of treePoints) this.#addTree(x, y);

    const rockPoints = [[12,7],[20,8],[31,14],[13,14],[3,10],[24,9]];
    for (const [x, y] of rockPoints) this.#addRock(x, y);

    this.resources.push(
      { type: 'herb', x: 3, y: 9, name: '들꽃' },
      { type: 'herb', x: 12, y: 9, name: '약초' },
      { type: 'wood', x: 7, y: 21, name: '마른나무' },
      { type: 'ore', x: 30, y: 15, name: '구리광석' },
      { type: 'ore', x: 31, y: 16, name: '철광석' }
    );

    this.npcs.push(
      { id: 'elder', name: '백운 장로', x: 28, y: 8, role: 'quest', robe: '#8f7658' },
      { id: 'smith', name: '무쇠', x: 23, y: 14, role: 'smith', robe: '#684840' },
      { id: 'merchant', name: '연화', x: 9, y: 20, role: 'shop', robe: '#6f557f' }
    );

    this.monsters.push(
      this.#monster('field-rat-1', '들쥐', 19, 10, '#776353'),
      this.#monster('field-rat-2', '들쥐', 21, 10, '#776353'),
      this.#monster('slime-1', '이끼정령', 30, 10, '#4d8462')
    );
  }

  #monster(id, name, tx, ty, color) {
    const p = this.tileCenter({ x: tx, y: ty });
    return { id, name, x: p.x, y: p.y, homeX: p.x, homeY: p.y, hp: 30, maxHp: 30, color, deadFor: 0, phase: Math.random() * Math.PI * 2 };
  }

  #roadRect(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.pathTiles.add(`${xx},${yy}`);
    }
  }

  #addWater(x, y) {
    const key = `${x},${y}`;
    this.waterTiles.add(key);
    this.blocked.add(key);
  }

  #addTree(x, y) {
    const key = `${x},${y}`;
    if (this.pathTiles.has(key)) return;
    this.trees.push({ x, y });
    this.blocked.add(key);
  }

  #addRock(x, y) {
    const key = `${x},${y}`;
    if (this.pathTiles.has(key)) return;
    this.rocks.push({ x, y });
    this.blocked.add(key);
  }

  #addHouse({ x, y, w, h, doorX, label }) {
    const house = { x, y, w, h, doorX, label };
    this.houses.push(house);

    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const isDoor = yy === y + h - 1 && xx === doorX;
        if (!isDoor) this.blocked.add(`${xx},${yy}`);
      }
    }

    this.pathTiles.add(`${doorX},${y + h - 1}`);
    this.pathTiles.add(`${doorX},${y + h}`);
  }

  isWalkableTile(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    return !this.blocked.has(`${x},${y}`);
  }

  isWalkableFoot(x, y, halfW = 10, halfH = 7) {
    const samples = [
      [x - halfW, y - halfH],
      [x + halfW, y - halfH],
      [x - halfW, y + halfH],
      [x + halfW, y + halfH]
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

  findPathToPixel(fromX, fromY, toX, toY) {
    const goal = this.pixelToTile(toX, toY);
    if (!this.isWalkableTile(goal.x, goal.y)) return [];
    return PathFinder.find(this, this.pixelToTile(fromX, fromY), goal);
  }

  update(dt) {
    this.time += dt;

    for (const monster of this.monsters) {
      if (monster.hp <= 0) {
        monster.deadFor += dt;
        if (monster.deadFor >= 4) {
          monster.hp = monster.maxHp;
          monster.deadFor = 0;
          monster.x = monster.homeX;
          monster.y = monster.homeY;
        }
        continue;
      }

      const sway = Math.sin(this.time * 1.2 + monster.phase);
      monster.x = monster.homeX + sway * 5;
    }
  }

  hitMonster(player, damage = 10) {
    const facing = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 }
    }[player.dir] || { x: 0, y: 1 };

    let best = null;
    let bestDistance = Infinity;

    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue;
      const dx = monster.x - player.x;
      const dy = monster.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 72) continue;

      const dot = (dx * facing.x + dy * facing.y) / Math.max(1, distance);
      if (dot < 0.25) continue;

      if (distance < bestDistance) {
        best = monster;
        bestDistance = distance;
      }
    }

    if (!best) return { hit: false, text: '공격이 빗나갔습니다.' };

    best.hp = Math.max(0, best.hp - damage);
    return {
      hit: true,
      killed: best.hp === 0,
      text: best.hp === 0 ? `${best.name} 처치!` : `${best.name} -${damage}`,
      monster: best
    };
  }

  renderGround(ctx, camera, viewWidth, viewHeight) {
    const ts = this.tileSize;
    const startX = Math.max(0, Math.floor(camera.x / ts) - 1);
    const startY = Math.max(0, Math.floor(camera.y / ts) - 1);
    const endX = Math.min(this.cols - 1, Math.ceil((camera.x + viewWidth) / ts) + 1);
    const endY = Math.min(this.rows - 1, Math.ceil((camera.y + viewHeight) / ts) + 1);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const key = `${x},${y}`;
        const px = x * ts;
        const py = y * ts;

        if (this.waterTiles.has(key)) {
          const wave = ((x + y) % 2) * 3;
          ctx.fillStyle = '#5f96a2';
          ctx.fillRect(px, py, ts, ts);
          ctx.strokeStyle = 'rgba(213,239,235,.34)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px + 8 + wave, py + 17);
          ctx.lineTo(px + 23 + wave, py + 17);
          ctx.moveTo(px + 20 - wave, py + 33);
          ctx.lineTo(px + 39 - wave, py + 33);
          ctx.stroke();
          continue;
        }

        if (this.pathTiles.has(key)) {
          ctx.fillStyle = (x + y) % 2 ? '#b8a174' : '#b09a6f';
          ctx.fillRect(px, py, ts, ts);
          ctx.fillStyle = 'rgba(91,73,46,.11)';
          ctx.fillRect(px + 8 + ((x * 7 + y * 3) % 16), py + 9 + ((x * 5 + y * 11) % 18), 3, 2);
        } else {
          ctx.fillStyle = (x + y) % 2 ? '#78965f' : '#739159';
          ctx.fillRect(px, py, ts, ts);
          const seed = (x * 19 + y * 31) % 5;
          if (seed <= 1) {
            ctx.fillStyle = 'rgba(224,236,177,.3)';
            ctx.fillRect(px + 11 + seed * 13, py + 14 + seed * 7, 2, 5);
          }
        }
      }
    }

    ctx.strokeStyle = 'rgba(50,71,52,.35)';
    ctx.lineWidth = 2;
    for (const key of this.waterTiles) {
      const [x, y] = key.split(',').map(Number);
      ctx.strokeRect(x * ts + 1, y * ts + 1, ts - 2, ts - 2);
    }

    ctx.restore();
  }

  renderWorldObjects(ctx, camera, playerY, front = false) {
    const entries = [];

    for (const house of this.houses) {
      entries.push({
        y: (house.y + house.h) * this.tileSize,
        draw: () => this.#drawHouse(ctx, camera, house)
      });
    }

    for (const tree of this.trees) {
      entries.push({
        y: (tree.y + 1) * this.tileSize,
        draw: () => this.#drawTree(ctx, camera, tree)
      });
    }

    for (const rock of this.rocks) {
      entries.push({
        y: (rock.y + 1) * this.tileSize,
        draw: () => this.#drawRock(ctx, camera, rock)
      });
    }

    for (const resource of this.resources) {
      entries.push({
        y: (resource.y + 1) * this.tileSize,
        draw: () => this.#drawResource(ctx, camera, resource)
      });
    }

    for (const npc of this.npcs) {
      entries.push({
        y: npc.y * this.tileSize + this.tileSize / 2,
        draw: () => this.#drawNpc(ctx, camera, npc)
      });
    }

    for (const monster of this.monsters) {
      if (monster.hp <= 0) continue;
      entries.push({
        y: monster.y,
        draw: () => this.#drawMonster(ctx, camera, monster)
      });
    }

    entries.sort((a, b) => a.y - b.y);

    for (const entry of entries) {
      if ((!front && entry.y <= playerY) || (front && entry.y > playerY)) entry.draw();
    }
  }

  renderQuestTrail(ctx, camera, path, player) {
    if (!path?.length) return;
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    ctx.strokeStyle = 'rgba(255,232,147,.48)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 9]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    for (const tile of path) {
      const p = this.tileCenter(tile);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  #drawHouse(ctx, camera, house) {
    const ts = this.tileSize;
    const x = house.x * ts - camera.x;
    const y = house.y * ts - camera.y;
    const w = house.w * ts;
    const h = house.h * ts;

    ctx.fillStyle = '#d9c49a';
    ctx.strokeStyle = '#5a4432';
    ctx.lineWidth = 3;
    ctx.fillRect(x + 13, y + 48, w - 26, h - 55);
    ctx.strokeRect(x + 13, y + 48, w - 26, h - 55);

    ctx.fillStyle = '#5b4432';
    ctx.fillRect(x + 28, y + 58, 7, h - 68);
    ctx.fillRect(x + w - 35, y + 58, 7, h - 68);
    ctx.fillRect(x + 16, y + 83, w - 32, 6);

    ctx.fillStyle = '#586b58';
    ctx.strokeStyle = '#34453a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 58);
    ctx.lineTo(x + w / 2, y + 7);
    ctx.lineTo(x + w - 5, y + 58);
    ctx.lineTo(x + w - 18, y + 72);
    ctx.lineTo(x + 18, y + 72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#c4aa6d';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 16, y + 10);
    ctx.lineTo(x + w / 2 + 16, y + 10);
    ctx.stroke();

    const doorLocalX = (house.doorX - house.x) * ts + ts / 2;
    ctx.fillStyle = '#4c3428';
    ctx.fillRect(x + doorLocalX - 14, y + h - 53, 28, 49);
    ctx.fillStyle = '#d6b66c';
    ctx.fillRect(x + doorLocalX + 7, y + h - 30, 3, 3);

    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(24,29,25,.85)';
    ctx.fillText(house.label, x + w / 2 + 1, y + h + 15);
    ctx.fillStyle = '#f6edd5';
    ctx.fillText(house.label, x + w / 2, y + h + 14);
  }

  #drawTree(ctx, camera, tree) {
    const ts = this.tileSize;
    const x = tree.x * ts + ts / 2 - camera.x;
    const y = tree.y * ts + ts - camera.y;

    ctx.fillStyle = 'rgba(12,25,14,.22)';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 20, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5b3d2b';
    ctx.fillRect(x - 5, y - 29, 10, 29);

    ctx.fillStyle = '#426f45';
    ctx.strokeStyle = '#294e33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 42, 22, 0, Math.PI * 2);
    ctx.arc(x - 13, y - 34, 15, 0, Math.PI * 2);
    ctx.arc(x + 13, y - 34, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#6d9959';
    ctx.beginPath();
    ctx.arc(x - 8, y - 48, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  #drawRock(ctx, camera, rock) {
    const ts = this.tileSize;
    const x = rock.x * ts + ts / 2 - camera.x;
    const y = rock.y * ts + ts - camera.y;

    ctx.fillStyle = 'rgba(9,14,11,.2)';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 17, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#777b72';
    ctx.strokeStyle = '#51574f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 5);
    ctx.lineTo(x - 11, y - 22);
    ctx.lineTo(x + 5, y - 29);
    ctx.lineTo(x + 17, y - 15);
    ctx.lineTo(x + 13, y - 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  #drawResource(ctx, camera, resource) {
    const p = this.tileCenter(resource);
    const x = p.x - camera.x;
    const y = p.y - camera.y + 13;

    if (resource.type === 'herb') {
      ctx.strokeStyle = '#315e39';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 18);
      ctx.moveTo(x, y - 11);
      ctx.lineTo(x - 8, y - 17);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 8, y - 14);
      ctx.stroke();
      ctx.fillStyle = '#d8cf75';
      ctx.beginPath();
      ctx.arc(x, y - 21, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (resource.type === 'ore') {
      ctx.fillStyle = '#6d7774';
      ctx.strokeStyle = '#414b49';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 13, y);
      ctx.lineTo(x - 10, y - 13);
      ctx.lineTo(x + 3, y - 20);
      ctx.lineTo(x + 14, y - 9);
      ctx.lineTo(x + 11, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#b87b4d';
      ctx.fillRect(x - 2, y - 12, 5, 4);
      ctx.fillRect(x + 5, y - 7, 4, 3);
    } else {
      ctx.fillStyle = '#6c4b34';
      ctx.fillRect(x - 15, y - 8, 30, 9);
      ctx.strokeStyle = '#3e2c22';
      ctx.strokeRect(x - 15, y - 8, 30, 9);
      ctx.beginPath();
      ctx.arc(x - 14, y - 3, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  #drawNpc(ctx, camera, npc) {
    const p = this.tileCenter(npc);
    const x = p.x - camera.x;
    const y = p.y - camera.y + 13;
    const bob = Math.sin(this.time * 2 + npc.x) * 0.7;

    ctx.save();
    ctx.translate(x, y + bob);

    ctx.fillStyle = 'rgba(8,12,9,.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = npc.robe;
    ctx.strokeStyle = '#332b26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, -36);
    ctx.lineTo(12, -36);
    ctx.lineTo(15, -5);
    ctx.lineTo(-15, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#efc19b';
    ctx.beginPath();
    ctx.arc(0, -48, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = npc.id === 'elder' ? '#d6d0c0' : '#2b2522';
    ctx.beginPath();
    ctx.arc(0, -52, 11, Math.PI, Math.PI * 2);
    ctx.fill();

    if (npc.role === 'quest') {
      ctx.font = '900 22px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f5d65e';
      ctx.strokeStyle = 'rgba(45,35,15,.9)';
      ctx.lineWidth = 3;
      ctx.strokeText('!', 0, -73);
      ctx.fillText('!', 0, -73);
    }

    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff6dc';
    ctx.fillText(npc.name, 0, -64);
    ctx.restore();
  }

  #drawMonster(ctx, camera, monster) {
    const x = monster.x - camera.x;
    const y = monster.y - camera.y;
    const bounce = Math.abs(Math.sin(this.time * 3.5 + monster.phase)) * -2;

    ctx.save();
    ctx.translate(x, y + bounce);

    ctx.fillStyle = 'rgba(8,12,9,.2)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = monster.color;
    ctx.strokeStyle = '#314338';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -13, 16, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1c2521';
    ctx.fillRect(-6, -16, 3, 3);
    ctx.fillRect(4, -16, 3, 3);

    const ratio = monster.hp / monster.maxHp;
    ctx.fillStyle = 'rgba(20,20,20,.65)';
    ctx.fillRect(-16, -35, 32, 4);
    ctx.fillStyle = '#d8584e';
    ctx.fillRect(-16, -35, 32 * ratio, 4);

    ctx.font = '700 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4eddc';
    ctx.fillText(monster.name, 0, -40);

    ctx.restore();
  }
}
