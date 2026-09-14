import { InputController } from '../input/InputController.js';
import { World } from '../world/World.js';
import { CharacterRenderer } from '../render/CharacterRenderer.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new InputController(canvas);
    this.world = new World();
    this.renderer = new CharacterRenderer();
    this.player = {
      x: this.world.tileSize * 3.5,
      y: this.world.tileSize * 10.5,
      radius: 13,
      speed: 170,
      dir: 'down',
      moving: false,
      animTime: 0,
      armorIndex: 0,
      weaponIndex: 0
    };
    this.camera = { x: 0, y: 0 };
    this.autoPath = [];
    this.lastTime = performance.now();
    this.running = false;

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.033, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.update(dt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const manual = this.input.getVector();
    let vector = manual;

    if (manual.magnitude > 0.01) {
      this.autoPath = [];
    } else if (this.autoPath.length) {
      vector = this.#autoVector();
    }

    const speed = this.player.speed * (vector.magnitude || 0);
    const dx = vector.x * speed * dt;
    const dy = vector.y * speed * dt;

    this.player.moving = Math.abs(dx) + Math.abs(dy) > 0.02;
    if (this.player.moving) {
      this.player.animTime += dt;
      this.#setDirection(vector.x, vector.y);
      this.#moveWithCollision(dx, dy);
    } else {
      this.player.animTime += dt * 0.35;
    }

    this.#updateCamera();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.world.render(ctx, this.camera);
    this.renderer.render(ctx, this.player, this.camera);

    if (this.autoPath.length) {
      ctx.save();
      ctx.translate(-this.camera.x, -this.camera.y);
      ctx.strokeStyle = 'rgba(255,244,170,.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(this.player.x, this.player.y);
      for (const tile of this.autoPath) {
        const p = this.world.tileCenter(tile);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  resize() {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.viewWidth = rect.width;
    this.viewHeight = rect.height;
    this.#updateCamera();
  }

  autoMoveToQuest() {
    const path = this.world.findPathFromPixel(this.player.x, this.player.y);
    this.autoPath = path;
    return path.length > 0;
  }

  cycleArmor() {
    this.player.armorIndex = (this.player.armorIndex + 1) % this.renderer.armors.length;
    return this.renderer.armors[this.player.armorIndex].name;
  }

  cycleWeapon() {
    this.player.weaponIndex = (this.player.weaponIndex + 1) % this.renderer.weapons.length;
    return this.renderer.weapons[this.player.weaponIndex].name;
  }

  #autoVector() {
    const targetTile = this.autoPath[0];
    const target = this.world.tileCenter(targetTile);
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 5) {
      this.autoPath.shift();
      if (!this.autoPath.length) return { x: 0, y: 0, magnitude: 0 };
      return this.#autoVector();
    }

    return { x: dx / distance, y: dy / distance, magnitude: 1 };
  }

  #moveWithCollision(dx, dy) {
    const nextX = this.player.x + dx;
    if (this.world.isWalkablePixel(nextX, this.player.y, this.player.radius)) this.player.x = nextX;

    const nextY = this.player.y + dy;
    if (this.world.isWalkablePixel(this.player.x, nextY, this.player.radius)) this.player.y = nextY;
  }

  #setDirection(x, y) {
    if (Math.abs(x) > Math.abs(y)) this.player.dir = x < 0 ? 'left' : 'right';
    else if (Math.abs(y) > 0.05) this.player.dir = y < 0 ? 'up' : 'down';
  }

  #updateCamera() {
    if (!this.viewWidth || !this.viewHeight) return;
    const maxX = Math.max(0, this.world.width - this.viewWidth);
    const maxY = Math.max(0, this.world.height - this.viewHeight);
    this.camera.x = Math.max(0, Math.min(maxX, this.player.x - this.viewWidth / 2));
    this.camera.y = Math.max(0, Math.min(maxY, this.player.y - this.viewHeight / 2));
  }
}
