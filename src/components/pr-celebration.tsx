"use client";

import { useEffect } from "react";
import { PR_CELEBRATION_EVENT } from "@/lib/pr-celebration";

const VOLT = 0xc8f53a;
const DURATION = 2.8; // seconds

/**
 * New personal record: a weight plate spins into the middle of the screen and
 * bursts into sparks, then fades out. three.js is loaded on demand (dynamic
 * import), so it costs nothing until the first record. Skipped for
 * prefers-reduced-motion; the toast + haptics still fire.
 */
async function play(): Promise<void> {
  const THREE = await import("three");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:80";
  document.body.append(canvas);

  let renderer: InstanceType<typeof THREE.WebGLRenderer>;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    canvas.remove();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    0.1,
    50,
  );
  camera.position.set(0, 0, 9);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rim = new THREE.PointLight(VOLT, 30, 20);
  rim.position.set(-3, -2, 4);
  scene.add(rim);

  // Plate: lathe profile (disc with a centre hole and a raised rim), axis turned towards the camera.
  const profile = [
    [0.3, -0.16], [0.3, 0.16], [0.42, 0.16], [0.42, 0.1], [0.9, 0.1], [0.9, 0.18],
    [1, 0.18], [1, -0.18], [0.9, -0.18], [0.9, -0.1], [0.42, -0.1], [0.42, -0.16], [0.3, -0.16],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const plateMat = new THREE.MeshStandardMaterial({
    color: VOLT, metalness: 0.65, roughness: 0.28, emissive: VOLT, emissiveIntensity: 0.18,
    transparent: true,
  });
  const plate = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), plateMat);
  plate.rotation.x = Math.PI / 2;
  const pivot = new THREE.Group();
  pivot.add(plate);
  pivot.position.y = 0.4;
  scene.add(pivot);

  // Sparks
  const N = 90;
  const pos = new Float32Array(N * 3);
  const vel: number[][] = [];
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 2 + Math.random() * 3.5;
    vel.push([Math.cos(a) * s, Math.sin(a) * s + 1.2, (Math.random() - 0.3) * 2]);
    pos.set([0, 0.4, 0], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xf4ffd0, size: 0.07, transparent: true, opacity: 1 });
  const sparks = new THREE.Points(geo, sparkMat);
  scene.add(sparks);

  const size = window.innerWidth < 500 ? 0.85 : 1.1;
  const t0 = performance.now();
  const easeOutBack = (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

  await new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      if (t >= DURATION) return resolve();
      const grow = easeOutBack(Math.min(1, t / 0.55));
      pivot.scale.setScalar(Math.max(0.001, grow * size));
      pivot.rotation.y = (1 - Math.pow(1 - Math.min(1, t / 2.2), 3)) * Math.PI * 5;
      pivot.rotation.x = Math.sin(t * 2) * 0.12;
      pivot.position.y = 0.4 + Math.sin(t * 2.4) * 0.08;
      const fade = t > 2.2 ? 1 - (t - 2.2) / (DURATION - 2.2) : 1;
      plateMat.opacity = fade;
      sparkMat.opacity = fade;
      const p = geo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
      const dt = 1 / 60;
      for (let i = 0; i < N; i++) {
        vel[i][1] -= 3.2 * dt;
        p.setXYZ(i, p.getX(i) + vel[i][0] * dt, p.getY(i) + vel[i][1] * dt, p.getZ(i) + vel[i][2] * dt);
      }
      p.needsUpdate = true;
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  scene.traverse((o) => {
    const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void } };
    m.geometry?.dispose();
    m.material?.dispose();
  });
  renderer.dispose();
  renderer.forceContextLoss();
  canvas.remove();
}

export function PrCelebrationHost() {
  useEffect(() => {
    let running = false;
    const onPr = () => {
      if (running || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      running = true;
      play()
        .catch(() => {})
        .finally(() => {
          running = false;
        });
    };
    window.addEventListener(PR_CELEBRATION_EVENT, onPr);
    return () => window.removeEventListener(PR_CELEBRATION_EVENT, onPr);
  }, []);
  return null;
}
