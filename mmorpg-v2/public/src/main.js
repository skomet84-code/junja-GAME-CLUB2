import { Game } from './game/Game.js';

const canvas = document.querySelector('#game');
const questBtn = document.querySelector('#questBtn');
const armorBtn = document.querySelector('#armorBtn');
const weaponBtn = document.querySelector('#weaponBtn');
const status = document.querySelector('#status');
const moveHint = document.querySelector('#moveHint');

const game = new Game(canvas);
game.start();

questBtn.addEventListener('click', () => {
  const found = game.autoMoveToQuest();
  status.textContent = found ? 'AUTO MOVE · 장로에게 이동 중' : '경로를 찾을 수 없음';
});

armorBtn.addEventListener('click', () => {
  const name = game.cycleArmor();
  status.textContent = `ARMOR · ${name}`;
});

weaponBtn.addEventListener('click', () => {
  const name = game.cycleWeapon();
  status.textContent = `WEAPON · ${name}`;
});

canvas.addEventListener('pointerdown', () => {
  moveHint.style.opacity = '.35';
});

window.addEventListener('pointerup', () => {
  moveHint.style.opacity = '1';
});

window.__JUNJA_V2__ = game;
