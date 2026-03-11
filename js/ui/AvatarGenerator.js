export class AvatarGenerator {
  static generate(name, departmentColor, size = 48) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const hash = AvatarGenerator._hash(name);

    // Background circle
    const bgHue = hash % 360;
    ctx.fillStyle = `hsl(${bgHue}, 30%, 20%)`;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Head silhouette
    ctx.fillStyle = `hsl(${bgHue}, 20%, 55%)`;
    ctx.beginPath();
    ctx.arc(size / 2, size * 0.34, size * 0.20, 0, Math.PI * 2);
    ctx.fill();

    // Shoulders silhouette
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 0.82, size * 0.33, size * 0.20, 0, Math.PI, 0);
    ctx.fill();

    // Department color accent ring
    ctx.strokeStyle = departmentColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Initials overlay
    const initials = name
      .split(/\s+/)
      .filter(w => w.length > 0 && w[0] === w[0].toUpperCase())
      .map(w => w[0])
      .slice(0, 2)
      .join('');
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.30}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, size / 2, size * 0.36);

    return canvas.toDataURL();
  }

  static _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
