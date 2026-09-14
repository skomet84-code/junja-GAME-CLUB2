export class CharacterRenderer {
  constructor() {
    this.armors = [
      {
        id: 'novice',
        name: '초보자 도포',
        cloth: '#4d7892',
        clothDark: '#31566f',
        trim: '#d8e7d7',
        belt: '#6e4b35',
        metal: '#b7c5c7'
      },
      {
        id: 'leather',
        name: '산짐승 가죽갑옷',
        cloth: '#78513a',
        clothDark: '#4f3529',
        trim: '#d4ad72',
        belt: '#493126',
        metal: '#b9a16f'
      },
      {
        id: 'bronze',
        name: '청동 비늘갑옷',
        cloth: '#426b63',
        clothDark: '#294a45',
        trim: '#d3a95c',
        belt: '#3f3026',
        metal: '#b98b4b'
      }
    ];

    this.weapons = [
      { id: 'wood', name: '수련 목검', blade: '#8a603d', edge: '#b88655', hilt: '#3d2a20', guard: '#c89b56' },
      { id: 'bronze', name: '청동 단검', blade: '#9b835a', edge: '#d4bd83', hilt: '#4a3226', guard: '#d2a952' },
      { id: 'iron', name: '철검', blade: '#b7c3c8', edge: '#e4ecee', hilt: '#4b342b', guard: '#c59a48' }
    ];

    this.helmets = [
      { id: 'none', name: '장식 없음', kind: 'none' },
      { id: 'headband', name: '수련 머리띠', kind: 'headband', main: '#8e3e39', accent: '#e9c985' },
      { id: 'bronze', name: '청동 호위모', kind: 'cap', main: '#536f66', accent: '#c79a50' }
    ];
  }

  render(ctx, player, camera) {
    const x = Math.round(player.x - camera.x);
    const y = Math.round(player.y - camera.y);
    const armor = this.armors[player.armorIndex % this.armors.length];
    const weapon = this.weapons[player.weaponIndex % this.weapons.length];
    const helmet = this.helmets[player.helmetIndex % this.helmets.length];

    const walk = player.moving ? Math.sin(player.animTime * 11) : 0;
    const bounce = player.moving ? Math.abs(Math.sin(player.animTime * 11)) * -1.3 : Math.sin(player.animTime * 2.6) * 0.35;
    const attack = Math.max(0, Math.min(1, (player.attackTimer || 0) / (player.attackDuration || 0.28)));
    const attackCurve = attack > 0 ? Math.sin((1 - attack) * Math.PI) : 0;

    ctx.save();
    ctx.translate(x, y + bounce);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    this.#shadow(ctx, walk);

    const weaponBehind = player.dir === 'up' || (player.dir === 'left' && attackCurve < 0.35);
    if (weaponBehind) this.#weapon(ctx, weapon, player.dir, walk, attackCurve, true);

    this.#legs(ctx, armor, player.dir, walk);
    this.#body(ctx, armor, player.dir, walk);
    this.#head(ctx, player.dir);
    this.#hair(ctx, player.dir, helmet);
    this.#helmet(ctx, player.dir, helmet);

    if (!weaponBehind) this.#weapon(ctx, weapon, player.dir, walk, attackCurve, false);

    ctx.restore();
    this.#nameplate(ctx, player, x, y);
  }

  #shadow(ctx, walk) {
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#07100a';
    ctx.beginPath();
    ctx.ellipse(0, 1, 18 - Math.abs(walk) * 1.2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  #legs(ctx, armor, dir, walk) {
    const stride = Math.round(walk * 3.5);
    const sideView = dir === 'left' || dir === 'right';
    const legA = sideView ? -stride : stride;
    const legB = -legA;

    this.#block(ctx, -10, -17 + legA, 8, 15, '#292d2c', '#161918', 2);
    this.#block(ctx, 2, -17 + legB, 8, 15, '#292d2c', '#161918', 2);

    const shoeShift = sideView ? (dir === 'left' ? -2 : 2) : 0;
    this.#block(ctx, -12 + shoeShift, -5 + legA, 11, 6, '#332a24', '#171412', 2);
    this.#block(ctx, 1 + shoeShift, -5 + legB, 11, 6, '#332a24', '#171412', 2);

    ctx.fillStyle = armor.clothDark;
    ctx.strokeStyle = '#1b2625';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -26);
    ctx.lineTo(14, -26);
    ctx.lineTo(11, -11);
    ctx.lineTo(2, -9);
    ctx.lineTo(0, -16);
    ctx.lineTo(-2, -9);
    ctx.lineTo(-11, -11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  #body(ctx, armor, dir, walk) {
    const sideView = dir === 'left' || dir === 'right';
    const armSwing = Math.round(walk * 2.4);

    const backX = sideView ? (dir === 'left' ? 5 : -13) : -19;
    this.#limb(ctx, backX, -37 - armSwing, 9, 22, armor.clothDark, '#1a2928');

    ctx.fillStyle = armor.cloth;
    ctx.strokeStyle = '#1a2928';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-14, -42);
    ctx.quadraticCurveTo(-17, -39, -16, -27);
    ctx.lineTo(-13, -17);
    ctx.lineTo(13, -17);
    ctx.lineTo(16, -27);
    ctx.quadraticCurveTo(17, -39, 14, -42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (armor.id === 'bronze') {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const px = -10 + col * 10 + (row % 2 ? 2 : 0);
          const py = -35 + row * 7;
          ctx.fillStyle = row % 2 ? '#5c8176' : '#668a7e';
          ctx.strokeStyle = armor.trim;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + 7, py);
          ctx.lineTo(px + 6, py + 5);
          ctx.lineTo(px + 3.5, py + 7);
          ctx.lineTo(px + 1, py + 5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      this.#block(ctx, -20, -42, 10, 7, armor.metal, '#403427', 1.5);
      this.#block(ctx, 10, -42, 10, 7, armor.metal, '#403427', 1.5);
    } else if (armor.id === 'leather') {
      ctx.strokeStyle = armor.trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, -39);
      ctx.lineTo(9, -20);
      ctx.moveTo(9, -39);
      ctx.lineTo(-9, -20);
      ctx.stroke();
      this.#block(ctx, -15, -27, 30, 5, armor.belt, '#261b16', 1.5);
    } else {
      ctx.strokeStyle = armor.trim;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, -41);
      ctx.lineTo(4, -30);
      ctx.lineTo(-3, -22);
      ctx.moveTo(8, -41);
      ctx.lineTo(-4, -30);
      ctx.stroke();
      this.#block(ctx, -14, -24, 28, 4, armor.belt, '#2a2520', 1.2);
    }

    const frontX = sideView ? (dir === 'left' ? -14 : 5) : 10;
    this.#limb(ctx, frontX, -37 + armSwing, 9, 22, armor.cloth, '#1a2928');

    const handX = sideView ? (dir === 'left' ? -12 : 13) : 14;
    ctx.fillStyle = '#efbd98';
    ctx.strokeStyle = '#6f4b3d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(handX, -17 + armSwing, 4.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  #head(ctx, dir) {
    const side = dir === 'left' ? -1 : 1;

    this.#block(ctx, -5, -49, 10, 9, '#e7ad86', '#704b3b', 1.4);

    if (dir !== 'up') {
      ctx.fillStyle = '#e9b28c';
      ctx.beginPath();
      if (dir === 'down') {
        ctx.arc(-13, -59, 3.5, 0, Math.PI * 2);
        ctx.arc(13, -59, 3.5, 0, Math.PI * 2);
      } else {
        ctx.arc(12 * side, -59, 3.5, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    ctx.fillStyle = '#f1c29d';
    ctx.strokeStyle = '#704b3b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (dir === 'up') {
      ctx.roundRect(-13, -72, 26, 25, 9);
    } else if (dir === 'down') {
      ctx.roundRect(-13, -72, 26, 27, 10);
    } else {
      ctx.roundRect(-12, -72, 24, 27, 10);
    }
    ctx.fill();
    ctx.stroke();

    if (dir === 'up') return;

    ctx.fillStyle = '#2a2521';
    if (dir === 'down') {
      ctx.fillRect(-7, -60, 3, 3);
      ctx.fillRect(4, -60, 3, 3);
      ctx.fillRect(-7, -64, 4, 1);
      ctx.fillRect(3, -64, 4, 1);

      ctx.fillStyle = '#b46f62';
      ctx.fillRect(-2, -51, 4, 1);
    } else {
      const eyeX = 4 * side;
      ctx.fillRect(eyeX - 1, -60, 3, 3);
      ctx.fillRect(eyeX - 2, -64, 4, 1);
      ctx.fillStyle = '#b46f62';
      ctx.fillRect(5 * side - 1, -52, 3, 1);
    }
  }

  #hair(ctx, dir, helmet) {
    ctx.fillStyle = '#26201d';
    ctx.strokeStyle = '#151210';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(-14, -76, 28, 17, 8);
    ctx.fill();
    ctx.stroke();

    if (dir !== 'up') {
      ctx.beginPath();
      ctx.moveTo(-12, -69);
      ctx.lineTo(-7, -74);
      ctx.lineTo(-3, -68);
      ctx.lineTo(1, -74);
      ctx.lineTo(5, -68);
      ctx.lineTo(11, -72);
      ctx.lineTo(12, -65);
      ctx.lineTo(-12, -65);
      ctx.closePath();
      ctx.fill();
    }

    if (helmet.kind !== 'cap') {
      ctx.beginPath();
      ctx.arc(0, -79, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  #helmet(ctx, dir, helmet) {
    if (!helmet || helmet.kind === 'none') return;

    if (helmet.kind === 'headband') {
      ctx.fillStyle = helmet.main;
      ctx.strokeStyle = '#4e2522';
      ctx.lineWidth = 1.3;
      ctx.fillRect(-14, -69, 28, 5);
      ctx.strokeRect(-14, -69, 28, 5);

      ctx.fillStyle = helmet.accent;
      ctx.fillRect(-2, -69, 4, 5);

      if (dir === 'left' || dir === 'right') {
        const side = dir === 'left' ? 1 : -1;
        ctx.strokeStyle = helmet.main;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(12 * side, -67);
        ctx.lineTo(19 * side, -62);
        ctx.stroke();
      }
      return;
    }

    ctx.fillStyle = helmet.main;
    ctx.strokeStyle = '#2d3d39';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, -68);
    ctx.quadraticCurveTo(-12, -82, 0, -84);
    ctx.quadraticCurveTo(12, -82, 15, -68);
    ctx.lineTo(11, -63);
    ctx.lineTo(-11, -63);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = helmet.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -82);
    ctx.lineTo(0, -64);
    ctx.stroke();
  }

  #weapon(ctx, weapon, dir, walk, attackCurve, behind) {
    const side = dir === 'left' ? -1 : 1;
    const sideView = dir === 'left' || dir === 'right';

    let anchorX = side * 17;
    let anchorY = -22 + Math.round(walk * 2);
    let angle = side * -0.58;

    if (dir === 'up') {
      anchorX = side * 14;
      anchorY = -30;
      angle = side * 0.65;
    } else if (sideView) {
      anchorX = side * 15;
      anchorY = -23;
      angle = side * -0.25;
    }

    if (attackCurve > 0) {
      anchorX += side * 8 * attackCurve;
      anchorY -= 4 * attackCurve;
      angle += side * (1.35 * attackCurve);
    }

    ctx.save();
    ctx.translate(anchorX, anchorY);
    ctx.rotate(angle);

    if (behind) ctx.globalAlpha = 0.96;

    ctx.fillStyle = '#e9b28c';
    ctx.strokeStyle = '#6d493a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 8, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    this.#block(ctx, -3, 4, 6, 16, weapon.hilt, '#201713', 1.5);
    this.#block(ctx, -8, 1, 16, 5, weapon.guard, '#493522', 1.3);

    ctx.fillStyle = weapon.blade;
    ctx.strokeStyle = '#4a4b48';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(-3, -27);
    ctx.lineTo(0, -36);
    ctx.lineTo(3, -27);
    ctx.lineTo(4, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = weapon.edge;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -32);
    ctx.lineTo(1, -1);
    ctx.stroke();

    ctx.restore();
  }

  #limb(ctx, x, y, w, h, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
  }

  #block(ctx, x, y, w, h, fill, stroke, width = 1) {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }
  }

  #nameplate(ctx, player, x, y) {
    ctx.save();
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = player.name || '준자';
    const width = Math.max(42, ctx.measureText(text).width + 16);
    const top = y - 101;

    ctx.fillStyle = 'rgba(13,20,16,.72)';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, top - 8, width, 18, 8);
    ctx.fill();

    ctx.fillStyle = '#f7f2df';
    ctx.fillText(text, x, top + 1);
    ctx.restore();
  }
}
