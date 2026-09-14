import { Game } from './game/Game.js';

const canvas = document.querySelector('#game');
const questBtn = document.querySelector('#questBtn');
const armorBtn = document.querySelector('#armorBtn');
const weaponBtn = document.querySelector('#weaponBtn');
const helmetBtn = document.querySelector('#helmetBtn');
const attackBtn = document.querySelector('#attackBtn');
const status = document.querySelector('#status');
const moveHint = document.querySelector('#moveHint');

const game = new Game(canvas);
game.onStatus = (text) => {
  status.textContent = text;
};
game.start();

questBtn.addEventListener('click', () => {
  const found = game.autoMoveToQuest();
  if (!found) status.textContent = '경로를 찾을 수 없습니다.';
});

armorBtn.addEventListener('click', () => game.cycleArmor());
weaponBtn.addEventListener('click', () => game.cycleWeapon());
helmetBtn.addEventListener('click', () => game.cycleHelmet());

attackBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  game.input.queueAttack();
});

canvas.addEventListener('pointerdown', () => {
  moveHint.classList.add('is-moving');
});

window.addEventListener('pointerup', () => {
  moveHint.classList.remove('is-moving');
});

window.__JUNJA_V2__ = game;
