export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragNow = { x: 0, y: 0 };
    this.deadZone = 18;

    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragNow = { ...this.dragStart };
      canvas.setPointerCapture?.(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragNow = { x: e.clientX, y: e.clientY };
    });

    const stop = () => {
      this.dragging = false;
      this.dragNow = { ...this.dragStart };
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !e.buttons) stop();
    });
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
      if (length >= this.deadZone) return { x: x / length, y: y / length, magnitude: Math.min(1, length / 90) };
    }

    return { x: 0, y: 0, magnitude: 0 };
  }

  #normalize(x, y) {
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length, magnitude: 1 };
  }
}
