export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragNow = { x: 0, y: 0 };
    this.pointerDownAt = 0;
    this.pointerMoved = 0;
    this.deadZone = 15;
    this.maxDrag = 78;
    this.pendingTap = null;
    this.attackQueued = false;

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keys.add(key);
      if (key === ' ' || key === 'spacebar') {
        e.preventDefault();
        this.attackQueued = true;
      }
    });

    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      this.dragging = true;
      this.pointerDownAt = performance.now();
      this.pointerMoved = 0;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragNow = { ...this.dragStart };
      canvas.setPointerCapture?.(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      e.preventDefault();

      const previous = this.dragNow;
      this.dragNow = { x: e.clientX, y: e.clientY };
      this.pointerMoved += Math.hypot(this.dragNow.x - previous.x, this.dragNow.y - previous.y);

      const dx = this.dragNow.x - this.dragStart.x;
      const dy = this.dragNow.y - this.dragStart.y;
      const distance = Math.hypot(dx, dy);
      if (distance > this.maxDrag) {
        const nx = dx / distance;
        const ny = dy / distance;
        this.dragStart = {
          x: this.dragNow.x - nx * this.maxDrag,
          y: this.dragNow.y - ny * this.maxDrag
        };
      }
    });

    const stop = (e) => {
      if (!this.dragging) return;
      e?.preventDefault?.();

      const elapsed = performance.now() - this.pointerDownAt;
      const shortGesture = this.pointerMoved < 10 && elapsed < 320;
      if (shortGesture && e) {
        const rect = canvas.getBoundingClientRect();
        this.pendingTap = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }

      this.dragging = false;
      this.dragNow = { ...this.dragStart };
    };

    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  getVector() {
    let x = 0;
    let y = 0;

    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;

    if (x || y) return this.#normalize(x, y);

    if (this.dragging) {
      x = this.dragNow.x - this.dragStart.x;
      y = this.dragNow.y - this.dragStart.y;
      const length = Math.hypot(x, y);
      if (length >= this.deadZone) {
        return {
          x: x / length,
          y: y / length,
          magnitude: Math.min(1, (length - this.deadZone) / (this.maxDrag - this.deadZone))
        };
      }
    }

    return { x: 0, y: 0, magnitude: 0 };
  }

  consumeTap() {
    const tap = this.pendingTap;
    this.pendingTap = null;
    return tap;
  }

  queueAttack() {
    this.attackQueued = true;
  }

  consumeAttack() {
    if (!this.attackQueued) return false;
    this.attackQueued = false;
    return true;
  }

  #normalize(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length, magnitude: 1 };
  }
}
