// 2D play-area landscape engine.
// Faithful port of the canvas logic from legacy src/frontend.html:
// world gradient + cobblestone paths + pond, scenery props, LandscapeAgent
// sprite tokens, postal-courier flights, particles, clamped camera [1.0–2.5x].
import { ROLE_CONFIGS } from '../../constants/roles.js';

export function createLandscapeEngine(canvas, hooks = {}) {
  const ctx = canvas.getContext('2d');
  const getSelectedId = () => hooks.getSelectedId?.() || '';
  const getThoughts = () => hooks.getThoughts?.() || {};
  const onPickAgent = (id) => hooks.onPickAgent?.(id);

  let W = 0;
  let H = 0;
  const camera = { x: 0, y: 0, zoom: 1.0 };
  let landscapeChars = [];
  let sceneryProps = [];
  let particles = [];
  let flyingCouriers = [];
  let rafId = 0;
  let lastTime = performance.now();
  let destroyed = false;

  const worldCv = document.createElement('canvas');

  function buildWorldLandscape() {
    worldCv.width = Math.max(1600, W);
    worldCv.height = Math.max(1200, H);
    const g = worldCv.getContext('2d');
    const ww = worldCv.width;
    const wh = worldCv.height;

    const grassGrad = g.createLinearGradient(0, 0, ww, wh);
    grassGrad.addColorStop(0, '#244d21');
    grassGrad.addColorStop(0.5, '#2e662b');
    grassGrad.addColorStop(1, '#1e441b');
    g.fillStyle = grassGrad;
    g.fillRect(0, 0, ww, wh);

    for (let i = 0; i < 2400; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#1b3d18' : '#3d8339';
      g.fillRect(Math.random() * ww, Math.random() * wh, 3, 3);
    }

    g.fillStyle = '#7a6f5d';
    for (let px = 0; px < ww; px += 6) {
      const py = wh * 0.52 + Math.sin(px / 180) * 90 + Math.cos(px / 320) * 40;
      g.beginPath();
      g.ellipse(px, py, 45, 30, 0, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 800; i++) {
      const px = Math.random() * ww;
      const py =
        wh * 0.52 + Math.sin(px / 180) * 90 + Math.cos(px / 320) * 40 + (Math.random() - 0.5) * 45;
      g.fillStyle = Math.random() < 0.5 ? '#6b6152' : '#8a7f6a';
      g.fillRect(px, py, 4, 3);
    }

    const pondX = ww * 0.78;
    const pondY = wh * 0.72;
    const pondGrad = g.createRadialGradient(pondX, pondY, 10, pondX, pondY, 120);
    pondGrad.addColorStop(0, '#4fc3f7');
    pondGrad.addColorStop(1, '#01579b');
    g.fillStyle = pondGrad;
    g.beginPath();
    g.ellipse(pondX, pondY, 110, 60, 0, 0, Math.PI * 2);
    g.fill();

    for (let i = 0; i < 6; i++) {
      g.strokeStyle = 'rgba(255,255,255,0.25)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(pondX, pondY, 30 + i * 14, 16 + i * 7, 0, 0, Math.PI * 2);
      g.stroke();
    }

    const flowerColors = ['#ff5252', '#ffeb3b', '#e040fb', '#ffffff', '#ffab40'];
    for (let i = 0; i < 150; i++) {
      const fx = Math.random() * ww;
      const fy = Math.random() * wh;
      g.fillStyle = flowerColors[Math.floor(Math.random() * flowerColors.length)];
      g.beginPath();
      g.arc(fx, fy, 2, 0, Math.PI * 2);
      g.fill();
    }

    buildSceneryProps(ww, wh);
  }

  function buildSceneryProps(ww, wh) {
    sceneryProps = [
      { type: 'overseer-balcony', x: ww * 0.5, y: wh * 0.18 },
      { type: 'watchtower', x: ww * 0.15, y: wh * 0.35 },
      { type: 'astrolabe-library', x: ww * 0.85, y: wh * 0.35 },
      { type: 'blueprint-monolith', x: ww * 0.32, y: wh * 0.52 },
      { type: 'backend-cathedral', x: ww * 0.5, y: wh * 0.52 },
      { type: 'frontend-crystal', x: ww * 0.68, y: wh * 0.52 },
      { type: 'qa-tent', x: ww * 0.38, y: wh * 0.75 },
      { type: 'devops-forge', x: ww * 0.6, y: wh * 0.75 },
      { type: 'tree', x: ww * 0.08, y: wh * 0.2, scale: 1.2 },
      { type: 'tree', x: ww * 0.92, y: wh * 0.2, scale: 1.1 },
      { type: 'tree', x: ww * 0.2, y: wh * 0.85, scale: 1.3 },
      { type: 'tree', x: ww * 0.88, y: wh * 0.85, scale: 1.2 },
      { type: 'campfire', x: ww * 0.48, y: wh * 0.68 }
    ];
  }

  function clampCameraBounds() {
    camera.zoom = Math.min(Math.max(camera.zoom, 1.0), 2.5);
    if (camera.zoom === 1.0) {
      camera.x = 0;
      camera.y = 0;
      return;
    }
    const worldW = worldCv.width * camera.zoom;
    const worldH = worldCv.height * camera.zoom;
    const minX = W - worldW;
    const minY = H - worldH;
    camera.x = Math.min(0, Math.max(minX, camera.x));
    camera.y = Math.min(0, Math.max(minY, camera.y));
  }

  class LandscapeAgent {
    constructor(id, data, x, y) {
      this.id = id;
      this.data = data;
      this.x = x;
      this.y = y;
      this.targetX = x;
      this.targetY = y;
      this.facing = 1;
      this.animTimer = Math.random() * 10;
      this.bubbleText = null;
      this.bubbleTimer = 0;
    }
    say(text, duration = 4.5) {
      this.bubbleText = text;
      this.bubbleTimer = duration;
    }
    update(dt) {
      this.animTimer += dt;
      if (this.bubbleTimer > 0) {
        this.bubbleTimer -= dt;
        if (this.bubbleTimer <= 0) this.bubbleText = null;
      }
      if (
        Math.random() < 0.005 &&
        this.data.status !== 'paused' &&
        this.data.status !== 'awaiting-confirmation'
      ) {
        this.targetX = this.x + (Math.random() - 0.5) * 60;
        this.targetY = this.y + (Math.random() - 0.5) * 40;
      }
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 2) {
        this.x += (dx / dist) * Math.min(dist, 40 * dt);
        this.y += (dy / dist) * Math.min(dist, 40 * dt);
        this.facing = dx >= 0 ? 1 : -1;
      }
    }
    draw() {
      const conf = ROLE_CONFIGS[this.data.role] || ROLE_CONFIGS['manager-bard'];
      const currentAgentId = getSelectedId();
      const agentThoughts = getThoughts();
      const isSelected = currentAgentId === this.id;
      const isAwaiting = this.data.status === 'awaiting-confirmation';
      const isPaused = this.data.status === 'paused';

      ctx.save();
      ctx.translate(this.x, this.y);

      if (isAwaiting) {
        const t = this.animTimer;
        ctx.save();
        ctx.strokeStyle = '#00bcd4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 32 + Math.sin(t * 3) * 3, 16 + Math.sin(t * 3) * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const angle = t * 2 + i * Math.PI * 0.5;
          ctx.fillStyle = '#80deea';
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * 32, Math.sin(angle) * 16, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (isSelected) {
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.scale(this.facing, 1);
      const bob = Math.sin(this.animTimer * 4) * 2;

      if (isPaused) {
        ctx.fillStyle = 'rgba(231, 76, 60, 0.25)';
        ctx.beginPath();
        ctx.arc(0, -18 + bob, 22, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = conf.cloth || '#3498db';
      ctx.fillRect(-8, -26 + bob, 16, 20);

      ctx.fillStyle = conf.skin || '#ffcc80';
      ctx.beginPath();
      ctx.arc(0, -32 + bob, 9, 0, Math.PI * 2);
      ctx.fill();

      if (conf.hat === 'crown') {
        ctx.fillStyle = '#f39c12';
        ctx.beginPath();
        ctx.moveTo(-7, -39 + bob);
        ctx.lineTo(-5, -45 + bob);
        ctx.lineTo(0, -41 + bob);
        ctx.lineTo(5, -45 + bob);
        ctx.lineTo(7, -39 + bob);
        ctx.closePath();
        ctx.fill();
      } else if (conf.hat === 'pointed') {
        ctx.fillStyle = '#2980b9';
        ctx.beginPath();
        ctx.moveTo(-10, -37 + bob);
        ctx.lineTo(0, -56 + bob);
        ctx.lineTo(10, -37 + bob);
        ctx.closePath();
        ctx.fill();
      } else if (conf.hat === 'halo') {
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -43 + bob, 10, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = '#cfd8dc';
      if (conf.tool === 'lute') {
        ctx.fillStyle = '#d35400';
        ctx.fillRect(8, -24 + bob, 4, 16);
        ctx.beginPath();
        ctx.arc(10, -12 + bob, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (conf.tool === 'sword') {
        ctx.fillRect(7, -32 + bob, 3, 22);
        ctx.fillRect(4, -20 + bob, 9, 3);
      } else if (conf.tool === 'staff') {
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(8, -42 + bob, 3, 36);
        ctx.fillStyle = conf.color;
        ctx.beginPath();
        ctx.arc(9.5, -44 + bob, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.font = 'bold 10px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(this.data.name || this.id, 0, 14);
      if (isAwaiting) {
        ctx.font = 'bold 9px Segoe UI, sans-serif';
        ctx.fillStyle = '#00e5ff';
        ctx.fillText('Awaiting Confirmation', 0, 26);
      }
      ctx.restore();

      const thought = this.bubbleText || agentThoughts[this.id]?.currentThought;
      if (thought && !isPaused) this.drawSpeechBubble(thought);
    }
    drawSpeechBubble(text) {
      ctx.save();
      ctx.translate(this.x, this.y - 54);
      ctx.font = '10px Segoe UI, sans-serif';
      const bw = Math.min(Math.max(ctx.measureText(text).width + 16, 60), 180);
      const bh = 22;
      ctx.fillStyle = 'rgba(16, 16, 26, 0.92)';
      ctx.strokeStyle = 'rgba(155, 89, 182, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-bw / 2, -bh, bw, bh, 6);
      else ctx.rect(-bw / 2, -bh, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(4, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f0f3f8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.length > 26 ? text.slice(0, 24) + '...' : text, 0, -bh / 2);
      ctx.restore();
    }
  }

  function drawSceneryProp(prop, now) {
    ctx.save();
    const x = prop.x;
    const y = prop.y;
    if (prop.type === 'overseer-balcony') {
      ctx.fillStyle = '#1e1b2e';
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - 320, y - 50, 640, 70, 10);
      else ctx.rect(x - 320, y - 50, 640, 70);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f39c12';
      ctx.font = 'bold 11px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑 HIGH EXECUTIVE SKY BALCONY — OVERSEERS OF ALL REALMS', x, y - 28);
    } else if (prop.type === 'watchtower') {
      ctx.fillStyle = '#263238';
      ctx.fillRect(x - 22, y - 80, 44, 80);
      ctx.fillStyle = '#00bcd4';
      ctx.beginPath();
      ctx.arc(x, y - 88, 14, 0, Math.PI * 2);
      ctx.fill();
      const rot = (now / 600) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 188, 212, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 88);
      ctx.lineTo(x + Math.cos(rot) * 60, y - 88 + Math.sin(rot) * 30);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ Marshall Watchtower', x, y + 14);
    } else if (prop.type === 'astrolabe-library') {
      ctx.fillStyle = '#311b92';
      ctx.fillRect(x - 24, y - 70, 48, 70);
      ctx.strokeStyle = '#9c27b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 80, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔮 Knowledge Chrono-Dome', x, y + 14);
    } else if (prop.type === 'blueprint-monolith') {
      ctx.fillStyle = '#1565c0';
      ctx.fillRect(x - 20, y - 55, 40, 55);
      ctx.fillStyle = '#80d8ff';
      ctx.fillRect(x - 14, y - 45, 28, 20);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🧙 Architecture Monolith', x, y + 14);
    } else if (prop.type === 'backend-cathedral') {
      ctx.fillStyle = '#004d40';
      ctx.fillRect(x - 24, y - 60, 48, 60);
      ctx.fillStyle = '#64ffda';
      ctx.beginPath();
      ctx.arc(x, y - 40, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✝️ SQL Persistence Altar', x, y + 14);
    } else if (prop.type === 'frontend-crystal') {
      ctx.fillStyle = '#880e4f';
      ctx.fillRect(x - 20, y - 50, 40, 50);
      const glow = 0.5 + Math.sin(now / 300) * 0.4;
      ctx.fillStyle = `rgba(233, 30, 99, ${glow})`;
      ctx.beginPath();
      ctx.arc(x, y - 35, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✨ UI Crystal Anvil', x, y + 14);
    } else if (prop.type === 'qa-tent') {
      ctx.fillStyle = '#1b5e20';
      ctx.beginPath();
      ctx.moveTo(x - 25, y);
      ctx.lineTo(x, y - 45);
      ctx.lineTo(x + 25, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🗡️ QA Infiltration Tent', x, y + 14);
    } else if (prop.type === 'devops-forge') {
      ctx.fillStyle = '#b71c1c';
      ctx.fillRect(x - 22, y - 45, 44, 45);
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(x, y - 22, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🐉 CI/CD Fortress Forge', x, y + 14);
    } else if (prop.type === 'tree') {
      const s = prop.scale || 1.0;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(x, y, 22 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(x - 5 * s, y - 28 * s, 10 * s, 28 * s);
      ctx.fillStyle = '#1b5e20';
      ctx.beginPath();
      ctx.arc(x, y - 36 * s, 24 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(x, y - 48 * s, 20 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.type === 'campfire') {
      ctx.fillStyle = '#546e7a';
      for (let a = 0; a < 6; a++) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 12, y + Math.sin(a) * 7, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const fH = 14 + Math.sin(now / 150) * 5;
      ctx.fillStyle = '#ff5722';
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x, y - fH);
      ctx.lineTo(x + 7, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function landscapeLoop(now) {
    if (destroyed) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.drawImage(worldCv, 0, 0);
    const renderables = [];
    sceneryProps.forEach((p) => renderables.push({ y: p.y, draw: () => drawSceneryProp(p, now) }));
    landscapeChars.forEach((c) => renderables.push({ y: c.y, draw: () => c.draw() }));
    renderables.sort((a, b) => a.y - b.y);
    renderables.forEach((r) => r.draw());

    for (let i = flyingCouriers.length - 1; i >= 0; i--) {
      const fc = flyingCouriers[i];
      fc.progress += dt * fc.speed;
      const t = Math.min(fc.progress, 1.0);
      const curX =
        (1 - t) * (1 - t) * fc.startX + 2 * (1 - t) * t * fc.ctrlX + t * t * fc.targetX;
      const curY =
        (1 - t) * (1 - t) * fc.startY + 2 * (1 - t) * t * fc.ctrlY + t * t * fc.targetY;
      ctx.save();
      ctx.translate(curX, curY);
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(-8, -6, 16, 12);
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-8, -6, 16, 12);
      const wingFlap = Math.sin(now / 80) * 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-8, -3);
      ctx.lineTo(-18, -10 + wingFlap);
      ctx.lineTo(-8, 3);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.lineTo(18, -10 + wingFlap);
      ctx.lineTo(8, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (Math.random() < 0.6) {
        particles.push({
          x: curX,
          y: curY,
          c: '#ffeb3b',
          r: 2,
          a: 0.8,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.5) * 15
        });
      }
      if (t >= 1.0) {
        for (let p = 0; p < 14; p++) {
          particles.push({
            x: fc.targetX,
            y: fc.targetY,
            c: '#f1c40f',
            r: 3.5,
            a: 1,
            vx: (Math.random() - 0.5) * 80,
            vy: (Math.random() - 0.5) * 80
          });
        }
        flyingCouriers.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.a -= dt * 0.8;
      if (p.a <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.a);
      ctx.fillStyle = p.c || '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r || 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    landscapeChars.forEach((c) => c.update(dt));
    rafId = requestAnimationFrame(landscapeLoop);
  }

  // --- interaction -------------------------------------------------------
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };

  function onMouseDown(e) {
    isDragging = true;
    dragStart = { x: e.clientX - camera.x, y: e.clientY - camera.y };
  }
  function onMouseMove(e) {
    if (!isDragging) return;
    camera.x = e.clientX - dragStart.x;
    camera.y = e.clientY - dragStart.y;
    clampCameraBounds();
  }
  function onMouseUp() {
    isDragging = false;
  }
  function onWheel(e) {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.15 : 0.85);
  }
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - camera.x) / camera.zoom;
    const clickY = (e.clientY - rect.top - camera.y) / camera.zoom;
    let best = null;
    let bestDist = 40;
    for (const char of landscapeChars) {
      const d = Math.hypot(clickX - char.x, clickY - char.y);
      if (d < bestDist) {
        bestDist = d;
        best = char;
      }
    }
    if (best) onPickAgent(best.id);
  }

  function resize() {
    const container = canvas.parentElement;
    if (!container) return;
    W = canvas.width = container.clientWidth;
    H = canvas.height = container.clientHeight;
    buildWorldLandscape();
    clampCameraBounds();
  }

  function zoom(factor) {
    camera.zoom *= factor;
    clampCameraBounds();
  }
  function resetView() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1.0;
    clampCameraBounds();
  }

  function syncAgents(projectAgentsMap, globalAgentsMap) {
    const targetMap = { ...globalAgentsMap, ...projectAgentsMap };
    const targetIds = new Set(Object.keys(targetMap));
    const existingIds = new Set(landscapeChars.map((c) => c.id));
    landscapeChars = landscapeChars.filter((c) => targetIds.has(c.id));
    const ww = worldCv.width || 1600;
    const wh = worldCv.height || 1200;
    const overseerPositions = {
      'ceo-warlock': { x: ww * 0.4, y: wh * 0.17 },
      'hr-mind-flayer': { x: ww * 0.46, y: wh * 0.17 },
      'staff-engineer-paladin': { x: ww * 0.52, y: wh * 0.17 },
      'senior-analyst-diviner': { x: ww * 0.58, y: wh * 0.17 },
      'marshall-agent-system-inspector': { x: ww * 0.15, y: wh * 0.4 }
    };
    for (const [id, agent] of Object.entries(globalAgentsMap)) {
      if (!existingIds.has(id)) {
        const pos = overseerPositions[id] || { x: ww * 0.5, y: wh * 0.17 };
        landscapeChars.push(new LandscapeAgent(id, agent, pos.x, pos.y));
      } else {
        const char = landscapeChars.find((c) => c.id === id);
        if (char) char.data = agent;
      }
    }
    let idx = 0;
    for (const [id, agent] of Object.entries(projectAgentsMap)) {
      if (!existingIds.has(id)) {
        let spawnX = ww * 0.35 + (idx % 4) * 110 + (Math.random() - 0.5) * 30;
        let spawnY = wh * 0.52 + Math.floor(idx / 4) * 90 + (Math.random() - 0.5) * 30;
        if (agent.role.includes('manager')) {
          spawnX = ww * 0.48;
          spawnY = wh * 0.62;
        } else if (agent.role.includes('wizard')) {
          spawnX = ww * 0.32;
          spawnY = wh * 0.58;
        } else if (agent.role.includes('cleric')) {
          spawnX = ww * 0.5;
          spawnY = wh * 0.58;
        } else if (agent.role.includes('sorcerer')) {
          spawnX = ww * 0.68;
          spawnY = wh * 0.58;
        } else if (agent.role.includes('rogue')) {
          spawnX = ww * 0.38;
          spawnY = wh * 0.78;
        } else if (agent.role.includes('warmage')) {
          spawnX = ww * 0.6;
          spawnY = wh * 0.78;
        }
        const newChar = new LandscapeAgent(id, agent, spawnX, spawnY);
        landscapeChars.push(newChar);
        for (let p = 0; p < 12; p++) {
          particles.push({
            x: spawnX + (Math.random() - 0.5) * 30,
            y: spawnY + (Math.random() - 0.5) * 20,
            c: '#00e5ff',
            r: 3.5,
            a: 1,
            vx: (Math.random() - 0.5) * 60,
            vy: (Math.random() - 0.5) * 60
          });
        }
      } else {
        const char = landscapeChars.find((c) => c.id === id);
        if (char) char.data = agent;
      }
      idx++;
    }
  }

  function launchCourier(fromAgentId, toAgentId) {
    const fromChar = landscapeChars.find((c) => c.id === fromAgentId);
    const toChar = landscapeChars.find((c) => c.id === toAgentId);
    const startX = fromChar ? fromChar.x : worldCv.width * 0.5;
    const startY = fromChar ? fromChar.y : worldCv.height * 0.2;
    const targetX = toChar ? toChar.x : worldCv.width * 0.5;
    const targetY = toChar ? toChar.y : worldCv.height * 0.5;
    flyingCouriers.push({
      startX,
      startY,
      targetX,
      targetY,
      ctrlX: (startX + targetX) / 2,
      ctrlY: Math.min(startY, targetY) - 80,
      progress: 0,
      speed: 0.9
    });
  }

  function say(agentId, text, duration) {
    const char = landscapeChars.find((c) => c.id === agentId);
    if (char) char.say(text, duration);
  }

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  resize();
  rafId = requestAnimationFrame(landscapeLoop);

  return {
    resize,
    zoom,
    resetView,
    syncAgents,
    launchCourier,
    say,
    getZoom: () => camera.zoom,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('resize', resize);
    }
  };
}
