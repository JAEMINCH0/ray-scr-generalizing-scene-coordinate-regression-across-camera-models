/* Schematic camera geometry inspired by Fig. 1, with feature tiles from Fig. 3.
   The texture is the input image; tile colors are illustrative, not activations.
   Camera coverage illustrates the paper's camera families, not a calibration.
*/
class RaySphere {
  constructor(canvas, getSource) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getSource = getSource;
    this.camera = '360';
    this.yaw = .48;
    this.pitch = -.2;
    this.visible = false;
    this.frame = 0;
    this.lastDraw = 0;
    this.lastTexture = 0;
    this.texture = document.createElement('canvas');
    this.texture.width = 256;
    this.texture.height = 128;
    this.textureContext = this.texture.getContext('2d', { willReadFrequently: true });
    this.projected = document.createElement('canvas');
    this.projected.width = this.projected.height = 224;
    this.projectedContext = this.projected.getContext('2d');
    this.projectedData = this.projectedContext.createImageData(224, 224);
    this.projectionDirty = true;
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.cameras = {
      '360': { kind: 'panorama', fov: 360, color: '#e8b54e' },
      fisheye1: { kind: 'fisheye', fov: 120, color: '#e49561' },
      fisheye2: { kind: 'fisheye', fov: 150, color: '#d28fbd' },
      fisheye3: { kind: 'fisheye', fov: 195, color: '#67c8a7' },
      pinhole: { kind: 'pinhole', fov: 85, color: '#79b8e2' },
    };
    new ResizeObserver(() => {
      const width = canvas.getBoundingClientRect().width;
      if (!width) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(width * 244 / 320 * dpr);
      this.draw(performance.now());
    }).observe(canvas);
    new IntersectionObserver(entries => {
      this.visible = entries[0].isIntersecting;
      this.schedule();
    }).observe(canvas);
    new MutationObserver(() => this.draw(performance.now())).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme'],
    });
    document.addEventListener('visibilitychange', () => this.schedule());
    this.motion.addEventListener('change', () => this.schedule());
    let pointer = null;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      this.yaw += (event.clientX - pointer.x) * .012;
      this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch + (event.clientY - pointer.y) * .009));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      this.projectionDirty = true;
      this.draw(performance.now());
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(event, () => { pointer = null; });
    }
    canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') { this.yaw = .48; this.pitch = -.2; }
      else if (event.key === 'ArrowLeft') this.yaw -= .12;
      else if (event.key === 'ArrowRight') this.yaw += .12;
      else this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch + (event.key === 'ArrowUp' ? -.12 : .12)));
      this.projectionDirty = true;
      this.draw(performance.now());
    });
    this.draw(0);
  }

  setCamera(camera) {
    if (!this.cameras[camera]) return;
    this.camera = camera;
    this.yaw = .48;
    this.pitch = -.2;
    this.pixels = null;
    this.projectionDirty = true;
    this.canvas.dataset.projection = camera;
    this.refreshTexture();
    this.draw(performance.now());
  }

  refreshTexture() {
    const source = this.getSource();
    if (!source) return;
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height || (source instanceof HTMLImageElement && !source.complete)) return;
    this.aspect = width / height;
    const textureHeight = Math.max(1, Math.round(256 / this.aspect));
    if (this.texture.height !== textureHeight) this.texture.height = textureHeight;
    this.textureContext.drawImage(source, 0, 0, 256, textureHeight);
    this.pixels = this.textureContext.getImageData(0, 0, 256, textureHeight).data;
    this.projectionDirty = true;
    this.lastTexture = performance.now();
    if (this.motion.matches) this.draw(this.lastTexture);
  }

  schedule() {
    cancelAnimationFrame(this.frame);
    if (!this.visible || document.hidden || this.motion.matches) {
      this.frame = 0;
      return;
    }
    const tick = time => {
      if (time - this.lastDraw > 40) {
        if (time - this.lastTexture > 150) this.refreshTexture();
        this.draw(time);
        this.lastDraw = time;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  rotate([x, y, z]) {
    const a = x * Math.cos(this.yaw) + z * Math.sin(this.yaw);
    const b = -x * Math.sin(this.yaw) + z * Math.cos(this.yaw);
    return [a, y * Math.cos(this.pitch) - b * Math.sin(this.pitch),
      y * Math.sin(this.pitch) + b * Math.cos(this.pitch)];
  }

  project(point) {
    const [x, y, z] = this.rotate(point);
    return { x: 160 + x * 94, y: 110 - y * 94, z };
  }

  ray(u, v) {
    const camera = this.cameras[this.camera];
    const thetaMax = camera.fov * Math.PI / 360;
    if (camera.kind === 'panorama') {
      const longitude = (u - .5) * Math.PI * 2;
      const latitude = (.5 - v) * Math.PI;
      return [Math.sin(longitude) * Math.cos(latitude), Math.sin(latitude),
        Math.cos(longitude) * Math.cos(latitude)];
    }
    let x = 2 * u - 1, y = 1 - 2 * v;
    if (camera.kind === 'pinhole') {
      x *= Math.tan(thetaMax);
      y *= Math.tan(thetaMax) / (this.aspect || 1.4);
      const length = Math.hypot(x, y, 1);
      return [x / length, y / length, 1 / length];
    }
    const radius = Math.hypot(x, y);
    const theta = radius * thetaMax;
    const scale = radius ? Math.sin(theta) / radius : 0;
    return [x * scale, y * scale, Math.cos(theta)];
  }

  projectTexture() {
    this.projectionDirty = false;
    const output = this.projectedData.data;
    output.fill(0);
    if (!this.pixels) return;
    const n = 224, camera = this.cameras[this.camera];
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const thetaMax = camera.fov * Math.PI / 360;
    const tangent = Math.tan(thetaMax);
    for (let row = 0; row < n; row++) {
      const y = 1 - 2 * (row + .5) / n;
      for (let col = 0; col < n; col++) {
        const x = 2 * (col + .5) / n - 1;
        const r2 = x * x + y * y;
        if (r2 >= 1) continue;
        const z = Math.sqrt(1 - r2);
        const y1 = y * cp + z * sp, z1 = -y * sp + z * cp;
        const wx = x * cy - z1 * sy, wy = y1, wz = x * sy + z1 * cy;
        let u, v;
        if (camera.kind === 'panorama') {
          u = Math.atan2(wx, wz) / (2 * Math.PI) + .5;
          v = Math.acos(Math.max(-1, Math.min(1, wy))) / Math.PI;
        } else if (camera.kind === 'pinhole') {
          if (wz <= 0) continue;
          u = .5 + wx / wz / tangent / 2;
          v = .5 - wy / wz / tangent * (this.aspect || 1.4) / 2;
        } else {
          const theta = Math.acos(Math.max(-1, Math.min(1, wz)));
          if (theta > thetaMax) continue;
          const radial = Math.hypot(wx, wy);
          const scale = radial ? theta / thetaMax / radial : 0;
          u = .5 + wx * scale / 2;
          v = .5 - wy * scale / 2;
        }
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const source = 4 * (Math.min(this.texture.height - 1, Math.floor(v * this.texture.height)) * 256 + Math.floor(u * 256));
        const target = 4 * (row * n + col);
        const shade = .72 + .28 * Math.max(0, -.25 * x + .35 * y + .9 * z);
        for (let c = 0; c < 3; c++) output[target + c] = this.pixels[source + c] * shade;
        output[target + 3] = this.pixels[source + 3];
      }
    }
    this.projectedContext.putImageData(this.projectedData, 0, 0);
  }

  wireframe(front, light) {
    const ctx = this.ctx;
    ctx.strokeStyle = light ? (front ? '#82928b80' : '#82928b30') : (front ? '#c1d8cc62' : '#a1bbaa25');
    ctx.lineWidth = .65;
    ctx.beginPath();
    const segment = (a, b) => {
      const p = this.project(a), q = this.project(b);
      if (((p.z + q.z) >= 0) !== front) return;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
    };
    for (let lat = -60; lat <= 60; lat += 30) {
      const phi = lat * Math.PI / 180, r = Math.cos(phi), y = Math.sin(phi);
      for (let i = 0; i < 80; i++) {
        const a = i * Math.PI / 40, b = (i + 1) * Math.PI / 40;
        segment([r * Math.sin(a), y, r * Math.cos(a)], [r * Math.sin(b), y, r * Math.cos(b)]);
      }
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const theta = lon * Math.PI / 180;
      for (let i = 0; i < 40; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 40, b = a + Math.PI / 40;
        segment([Math.sin(theta) * Math.cos(a), Math.sin(a), Math.cos(theta) * Math.cos(a)],
          [Math.sin(theta) * Math.cos(b), Math.sin(b), Math.cos(theta) * Math.cos(b)]);
      }
    }
    ctx.stroke();
  }

  featureTile(x, y, conditioned, light) {
    const ctx = this.ctx;
    const colors = ['#c991a0', '#83ac98', '#e2b97a', '#8ba8c8', '#b4a0c6'];
    ctx.fillStyle = light ? '#f9faf6' : '#26302a';
    ctx.fillRect(x - 2, y - 2, 40, 40);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const px = x + col * 9, py = y + row * 9;
        ctx.fillStyle = colors[(row * 3 + col) % colors.length];
        ctx.fillRect(px, py, 8, 8);
        if (conditioned) {
          ctx.strokeStyle = '#445b40';
          ctx.lineWidth = .7;
          ctx.beginPath();
          ctx.moveTo(px + 2, py + 6);
          ctx.lineTo(px + 6, py + 2);
          ctx.lineTo(px + 3.5, py + 2.4);
          ctx.moveTo(px + 6, py + 2);
          ctx.lineTo(px + 5.7, py + 4.5);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = light ? '#4e624f' : '#c6d9ca';
    ctx.font = 'italic 14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(conditioned ? 'F̃ᵢ' : 'Fᵢ', x + 17, y + 53);
  }

  draw(time) {
    const ctx = this.ctx, light = document.documentElement.dataset.theme === 'light';
    const color = this.cameras[this.camera].color;
    ctx.setTransform(this.canvas.width / 320, 0, 0, this.canvas.height / 244, 0, 0);
    ctx.clearRect(0, 0, 320, 244);
    const fill = ctx.createRadialGradient(130, 75, 8, 160, 110, 100);
    fill.addColorStop(0, light ? '#e3eae0' : '#2c3830');
    fill.addColorStop(1, light ? '#f8faf7' : '#121a16');
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.arc(160, 110, 94, 0, Math.PI * 2); ctx.fill();
    this.wireframe(false, light);
    if (this.projectionDirty) this.projectTexture();
    if (this.pixels) {
      ctx.globalAlpha = this.camera === '360' ? .73 : .88;
      ctx.drawImage(this.projected, 66, 16, 188, 188);
      ctx.globalAlpha = 1;
    }
    this.wireframe(true, light);
    ctx.strokeStyle = light ? '#9bae9b' : '#a9c3af60';
    ctx.lineWidth = .8;
    ctx.beginPath(); ctx.arc(160, 110, 94, 0, Math.PI * 2); ctx.stroke();
    const rays = this.camera === '360'
      ? [[.13,.35],[.28,.65],[.38,.28],[.48,.7],[.56,.43],[.7,.65],[.84,.38]]
      : [[.2,.3],[.5,.16],[.77,.27],[.78,.68],[.48,.8],[.25,.64],[.56,.43]];
    rays.forEach(([u, v], index) => {
      const end = this.project(this.ray(u, v));
      const front = end.z >= 0;
      ctx.globalAlpha = front ? .7 : .2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash(front ? [] : [2, 3]);
      ctx.beginPath(); ctx.moveTo(160, 110); ctx.lineTo(end.x, end.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      const t = this.motion.matches ? .75 : (time / 2400 + index * .17) % 1;
      ctx.beginPath(); ctx.arc(160 + (end.x - 160) * t, 110 + (end.y - 110) * t, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(end.x, end.y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });
    // Highlight the same local feature neighborhood on the unit sphere.
    const patch = [[.48,.35],[.64,.35],[.64,.51],[.48,.51]].map(([u,v]) => this.project(this.ray(u,v)));
    ctx.beginPath();
    patch.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fillStyle = color + '28'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
    const selected = this.project(this.ray(.56,.43));
    ctx.beginPath(); ctx.moveTo(160,110); ctx.lineTo(selected.x,selected.y); ctx.stroke();
    ctx.fillStyle = light ? '#425744' : '#e7f0e8';
    ctx.beginPath(); ctx.arc(160,110,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = color;
    ctx.font = 'italic 15px Georgia, serif'; ctx.textAlign = 'left';
    ctx.fillText('rᵢ', selected.x + 7, selected.y - 6);
    this.featureTile(16, 174, false, light);
    this.featureTile(269, 174, true, light);
    ctx.strokeStyle = light ? '#809477' : '#abc29d';
    ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(58,193); ctx.quadraticCurveTo(79,193,88,177);
    ctx.moveTo(84,179); ctx.lineTo(88,177); ctx.lineTo(88,182);
    ctx.moveTo(232,177); ctx.quadraticCurveTo(240,193,262,193);
    ctx.lineTo(258,189); ctx.moveTo(262,193); ctx.lineTo(258,197);
    ctx.stroke();
    ctx.textAlign = 'center'; ctx.font = '13px Georgia, serif';
    ctx.fillStyle = light ? '#60765f' : '#a1b59f';
    ctx.fillText('rᵢ ∈ S²', 160, 231);
  }
}
window.RaySCRSphere = RaySphere;
