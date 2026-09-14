import { InputController } from '../input/InputController.js';
import { World } from '../world/World.js';
import { CharacterRenderer } from '../render/CharacterRenderer.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.input = new InputController(canvas);
    this.world = new World();
    this.renderer = new CharacterRenderer();

    this.player = {
      name: '준자',
      x: this.world.spawn.x,
      y: this.world.spawn.y,
      footHalfW: 10,
      footHalfH: 7,
      speed: 172,
      dir: 'up',
      moving: false,
      animTime: 0,
      armorIndex: 0,
      weaponIndex: 0,
      helmetIndex: 0,
      attackTimer: 0,
      attackDuration: 0.28
    };

    this.camera = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.autoPath = [];
    this.lastTime = performance.now();
    this.running = false;
    this.onStatus = null;

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
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
    this.world.update(dt);

    if (this.player.attackTimer > 0) {
      this.player.attackTimer = Math.max(0, this.player.attackTimer - dt);
    }

    if (this.input.consumeAttack()) this.attack();

    const tap = this.input.consumeTap();
    if (tap) {
      const worldX = tap.x + this.camera.x;
      const worldY = tap.y + this.camera.y;
      const path = this.world.findPathToPixel(this.player.x, this.player.y, worldX, worldY);
      if (path.length) {
        this.autoPath = path;
        this.#status('목적지로 이동합니다.');
      }
    }

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
      this.player.animTime += dt * 0.25;
    }

    this.#updateCamera(dt);
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);

    this.world.renderGround(ctx, this.camera, this.viewWidth, this.viewHeight);
    this.world.renderQuestTrail(ctx, this.camera, this.autoPath, this.player);
    this.world.renderWorldObjects(ctx, this.camera, this.player.y, false);
    this.renderer.render(ctx, this.player, this.camera);
    this.world.renderWorldObjects(ctx, this.camera, this.player.y, true);
  }

  resize() {
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = Math.max(1, Math.round(rect.width * this.pixelRatio));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.pixelRatio));

    this.viewWidth = rect.width;
    this.viewHeight = rect.height;

    this.ctx.imageSmoothingEnabled = false;
    this.#snapCameraToPlayer();
  }

  autoMoveToQuest() {
    const path = this.world.findPathFromPixel(this.player.x, this.player.y);
    this.autoPath = path;
    if (path.length) this.#status('장로에게 자동이동 중');
    return path.length > 0;
  }

  attack() {
    if (this.player.attackTimer > 0) return null;

    this.autoPath = [];
    this.player.attackTimer = this.player.attackDuration;
    const result = this.world.hitMonster(this.player, 10);
    this.#status(result.text);
    return result;
  }

  cycleArmor() {
    this.player.armorIndex = (this.player.armorIndex + 1) % this.renderer.armors.length;
    const item = this.renderer.armors[this.player.armorIndex];
    this.#status(`갑옷 장착 · ${item.name}`);
    return item.name;
  }

  cycleWeapon() {
    this.player.weaponIndex = (this.player.weaponIndex + 1) % this.renderer.weapons.length;
    const item = this.renderer.weapons[this.player.weaponIndex];
    this.#status(`무기 장착 · ${item.name}`);
    return item.name;
  }

  cycleHelmet() {
    this.player.helmetIndex = (this.player.helmetIndex + 1) % this.renderer.helmets.length;
    const item = this.renderer.helmets[this.player.helmetIndex];
    this.#status(`머리 장식 · ${item.name}`);
    return item.name;
  }

  #status(text) {
    this.onStatus?.(text);
  }

  #autoVector() {
    const targetTile = this.autoPath[0];
    const target = this.world.tileCenter(targetTile);
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 4) {
      this.autoPath.shift();
      if (!this.autoPath.length) {
        this.#status('목적지에 도착했습니다.');
        return { x: 0, y: 0, magnitude: 0 };
      }
      return this.#autoVector();
    }

    return { x: dx / distance, y: dy / distance, magnitude: 1 };
  }

  #moveWithCollision(dx, dy) {
    const p = this.player;

    const nextX = p.x + dx;
    if (this.world.isWalkableFoot(nextX, p.y, p.footHalfW, p.footHalfH)) {
      p.x = nextX;
    } else if (this.autoPath.length) {
      this.autoPath = [];
      this.#status('길이 막혀 자동이동을 중단했습니다.');
    }

    const nextY = p.y + dy;
    if (this.world.isWalkableFoot(p.x, nextY, p.footHalfW, p.footHalfH)) {
      p.y = nextY;
    } else if (this.autoPath.length) {
      this.autoPath = [];
      this.#status('길이 막혀 자동이동을 중단했습니다.');
    }
  }

  #setDirection(x, y) {
    if (Math.abs(x) > Math.abs(y)) this.player.dir = x < 0 ? 'left' : 'right';
    else if (Math.abs(y) > 0.05) this.player.dir = y < 0 ? 'up' : 'down';
  }

  #snapCameraToPlayer() {
    if (!this.viewWidth || !this.viewHeight) return;
    const maxX = Math.max(0, this.world.width - this.viewWidth);
    const maxY = Math.max(0, this.world.height - this.viewHeight);

    const targetX = Math.max(0, Math.min(maxX, this.player.x - this.viewWidth / 2));
    const targetY = Math.max(0, Math.min(maxY, this.player.y - this.viewHeight / 2));

    this.camera.x = targetX;
    this.camera.y = targetY;
    this.camera.targetX = targetX;
    this.camera.targetY = targetY;
  }

  #updateCamera(dt) {
    if (!this.viewWidth || !this.viewHeight) return;

    const maxX = Math.max(0, this.world.width - this.viewWidth);
    const maxY = Math.max(0, this.world.height - this.viewHeight);

    this.camera.targetX = Math.max(0, Math.min(maxX, this.player.x - this.viewWidth / 2));
    this.camera.targetY = Math.max(0, Math.min(maxY, this.player.y - this.viewHeight / 2));

    const follow = 1 - Math.pow(0.001, dt);
    this.camera.x += (this.camera.targetX - this.camera.x) * follow;
    this.camera.y += (this.camera.targetY - this.camera.y) * follow;
  }
}
