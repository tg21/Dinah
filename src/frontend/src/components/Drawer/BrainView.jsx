import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// 3D synaptic-brain visualization. Port of initThreeBrain() from the legacy
// frontend.html: 180 embedding particles + proximity synapse lines, drag to
// orbit, idle auto-rotation. three.js is now an npm dep (was a CDN script).
export default function BrainView() {
  const containerRef = useRef(null);
  const stateRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || stateRef.current) return;

    const width = container.clientWidth || 440;
    const height = container.clientHeight || 260;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 45;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x080812, 1);
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const particleCount = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const palette = [
      new THREE.Color(0x00e5ff),
      new THREE.Color(0x9b59b6),
      new THREE.Color(0xf39c12),
      new THREE.Color(0x2ecc71)
    ];
    for (let i = 0; i < particleCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 18 * Math.cbrt(Math.random());
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.8;
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    group.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ size: 1.8, vertexColors: true, transparent: true, opacity: 0.9 })
      )
    );

    const linePositions = [];
    for (let i = 0; i < particleCount; i += 2) {
      for (let j = i + 1; j < Math.min(i + 5, particleCount); j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        if (Math.hypot(dx, dy, dz) < 10) {
          linePositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
          linePositions.push(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2]);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    group.add(
      new THREE.LineSegments(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0x9b59b6, transparent: true, opacity: 0.25 })
      )
    );

    let dragging = false;
    let prev = { x: 0, y: 0 };
    let raf = 0;
    const onDown = (e) => {
      dragging = true;
      prev = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e) => {
      if (!dragging) return;
      group.rotation.y += (e.clientX - prev.x) * 0.01;
      group.rotation.x += (e.clientY - prev.y) * 0.01;
      prev = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragging = false;
    };
    container.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!dragging) {
        group.rotation.y += 0.004;
        group.rotation.x += 0.001;
      }
      renderer.render(scene, camera);
    };
    animate();

    stateRef.current = { renderer, raf };
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      stateRef.current = null;
    };
  }, []);

  return (
    <div id="brainCanvasContainer" ref={containerRef}>
      <div className="brain-legend">🖱️ Drag to rotate • Scroll to zoom neural vectors</div>
    </div>
  );
}
