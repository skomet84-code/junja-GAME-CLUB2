export class CharacterRenderer {
  constructor() {
    this.armors = [
      { id: 'cloth', name: '초보 도포', body: '#466f8b', trim: '#d9e6d4' },
      { id: 'leather', name: '가죽 갑옷', body: '#7f5539', trim: '#c59a6c' },
      { id: 'bronze', name: '청동 갑옷', body: '#486d63', trim: '#c99b55' }
    ];
    this.weapons = [
      { id: 'wood', name: '목검', blade: '#845f3d', hilt: '#d7b477' },
      { id: 'bronze', name: '청동검', blade: '#a18a66', hilt: '#d9b25f' },
      { id: 'iron', name: '철검', blade: '#b9c2c4', hilt: '#685044' }
    ];
  }

  render(ctx, player, camera) {
    const x = Math.round(player.x - camera.x);
    const y = Math.round(player.y - camera.y);
    const armor = this.armors[player.armorIndex % this.armors.length];
    const weapon = this.weapons[player.weaponIndex % this.weapons.length];
    const bob = player.moving ? Math.sin(player.animTime * 14) * 1.5 : Math.sin(player.animTime * 3) * .45;

    ctx.save();
    ctx.translate(x, y + bob);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.24)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const side = player.dir === 'left' ? -1 : 1;
    const backWeapon = player.dir === 'up';
    if (backWeapon) this.#weapon(ctx, weapon, side, -1);

    // body + legs
    ctx.fillStyle = '#2d2b2a';
    ctx.fillRect(-9, 7, 7, 12);
    ctx.fillRect(2, 7, 7, 12);

    // armor layer uses the same body pivot, not an arbitrary overlay coordinate.
    ctx.fillStyle = armor.body;
    ctx.beginPath();
    ctx.roundRect(-15, -11, 30, 28, 7);
    ctx.fill();
    ctx.strokeStyle = armor.trim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();

    // sleeves / front arms
    ctx.fillStyle = armor.body;
    ctx.beginPath();
    ctx.roundRect(-20, -7, 8, 20, 4);
    ctx.roundRect(12, -7, 8, 20, 4);
    ctx.fill();

    // neck + face
    ctx.fillStyle = '#f0c7a4';
    ctx.fillRect(-5, -18, 10, 8);
    ctx.beginPath();
    ctx.arc(0, -28, 13, 0, Math.PI * 2);
    ctx.fill();

    // hair - direction aware silhouette
    ctx.fillStyle = '#24201d';
    ctx.beginPath();
    ctx.arc(0, -32, 13, Math.PI, Math.PI * 2);
    ctx.lineTo(11, -28);
    ctx.lineTo(-11, -28);
    ctx.closePath();
    ctx.fill();

    if (player.dir !== 'up') {
      ctx.fillStyle = '#2c2521';
      const eyeX = player.dir === 'left' ? -5 : player.dir === 'right' ? 5 : 0;
      ctx.fillRect(eyeX - 5, -28, 2, 2);
      ctx.fillRect(eyeX + 3, -28, 2, 2);
    }

    if (!backWeapon) this.#weapon(ctx, weapon, side, 1);

    ctx.restore();

    ctx.save();
    ctx.font = '600 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,26,22,.85)';
    ctx.fillText('준자', x + 1, y - 53);
    ctx.fillStyle = '#fff';
    ctx.fillText('준자', x, y - 54);
    ctx.restore();
  }

  #weapon(ctx, weapon, side, front) {
    ctx.save();
    ctx.translate(side * 18, -2);
    ctx.rotate(side * (front > 0 ? -0.58 : 0.58));
    ctx.fillStyle = weapon.hilt;
    ctx.fillRect(-3, 7, 6, 13);
    ctx.fillStyle = weapon.blade;
    ctx.beginPath();
    ctx.moveTo(-4, 8);
    ctx.lineTo(-3, -25);
    ctx.lineTo(0, -33);
    ctx.lineTo(3, -25);
    ctx.lineTo(4, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
