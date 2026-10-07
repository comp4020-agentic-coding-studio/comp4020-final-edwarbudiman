// The 3D home: a small room with the board hanging on the far wall. Loaded
// only when someone switches to 3D (three.js is a separate chunk), and one
// renderer is kept while 3D is alive, so going back and forth is instant.
//
// The board on the wall is drawn from exactly what the flat board shows (its
// notes and its pan and zoom), and the camera's "fill" pose makes that wall
// board cover the screen pixel for pixel. So both transitions are one camera
// move: pull back from the fill pose into the room, or dolly into it.

import * as THREE from "three";
import type { Note } from "../api.ts";

export interface BoardShot {
  notes: Note[]; // bottom to top
  faded: Set<number>; // hidden by the label filter
  view: { ox: number; oy: number; s: number };
  width: number; // the board's viewport, in CSS pixels
  height: number;
  me: string;
}
export interface SpaceHandlers {
  focusBoard: () => void;
  near: (near: boolean) => void;
}
interface Pose {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
}

const NOTE_W = 200;
const NOTE_H = 160;
const NOTE_FILL: Record<Note["color"], string> = {
  yellow: "#fff1a8",
  pink: "#ffd8e4",
  blue: "#d5e8ff",
  green: "#d8f1d0",
  orange: "#ffe0c2",
  purple: "#e7defe",
};
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

// the room, in metres; the board hangs on the far wall (z = WALL_Z)
const ROOM_W = 10;
const ROOM_D = 9;
const ROOM_H = 3.4;
const WALL_Z = -ROOM_D / 2;
const BOARD_H = 1.5;
const BOARD_Y = 1.75;
const BOARD_Z = WALL_Z + 0.07;
const EYE = 1.6;
const FOV = 55;
const MOVE_MS = 900;
const WALK = 3; // m/s
const SPRINT = 5.5;
const JUMP = 5.2;
const GRAVITY = 16;
const BODY = 0.3; // how close you get to walls and furniture
const REACH = 2.8; // how near the board E works

const FILL_D = BOARD_H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true'], [role='dialog']");
}

/** Breaks note text into lines that fit, the way the note's CSS wraps it. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (ctx.measureText(next).width <= max || !line.trim()) {
        line = next;
        // a single word wider than the note breaks anywhere, like overflow-wrap: anywhere
        while (ctx.measureText(line).width > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > max) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export class Space {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 60);
  private boardCanvas = document.createElement("canvas");
  private boardTex: THREE.CanvasTexture;
  private board: THREE.Mesh;
  private frame: THREE.Mesh;
  private solids: THREE.Box2[] = []; // furniture you can't walk through, on the floor plan
  private handlers: SpaceHandlers | null = null;
  private host: HTMLElement | null = null;

  private pose: Pose = { pos: new THREE.Vector3(), yaw: 0, pitch: 0 };
  private saved: Pose | null = null; // where you stood when you last left
  private vy = 0;
  private keys = new Set<string>();
  private anim: { from: Pose; to: Pose; t0: number; done: () => void } | null = null;
  private walking = false;
  private raf = 0;
  private last = 0;
  private wasNear = false;
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  private raycaster = new THREE.Raycaster();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.domElement.className = "space-canvas";
    this.renderer.domElement.tabIndex = 0;
    this.camera.rotation.order = "YXZ";

    this.boardTex = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTex.colorSpace = THREE.SRGBColorSpace;
    this.boardTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    // unlit, so in the fill pose its colours are the flat board's colours
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    this.board.position.set(0, BOARD_Y, BOARD_Z);
    this.frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.05), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.7 }));
    this.frame.position.set(0, BOARD_Y, BOARD_Z - 0.03);
    this.scene.add(this.board, this.frame);
    this.buildRoom();

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointercancel", this.onPointerUp);
  }

  // ---------------------------------------------------------------- the room

  private buildRoom() {
    const s = this.scene;
    s.background = new THREE.Color(0xf4efe6);
    s.add(new THREE.HemisphereLight(0xffffff, 0xe8dccb, 2.6));
    s.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.4);
    sun.position.set(4, 6, 3);
    s.add(sun);

    const std = (color: number, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
    const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, solid = false) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color));
      m.position.set(x, y, z);
      s.add(m);
      if (solid) this.solids.push(new THREE.Box2(new THREE.Vector2(x - w / 2, z - d / 2), new THREE.Vector2(x + w / 2, z + d / 2)));
      return m;
    };
    const plane = (w: number, h: number, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(...pos);
      m.rotation.set(...rot);
      s.add(m);
      return m;
    };

    // floor: warm planks, drawn once on a small canvas
    const planks = document.createElement("canvas");
    planks.width = planks.height = 256;
    const p = planks.getContext("2d")!;
    const tones = ["#d8b98f", "#d2b186", "#dcc097", "#cfae83"];
    for (let i = 0; i < 8; i++) {
      p.fillStyle = tones[i % tones.length];
      p.fillRect(0, i * 32, 256, 32);
      p.fillStyle = "rgba(90,60,30,0.18)";
      p.fillRect(0, i * 32, 256, 1.5);
      p.fillRect(((i * 97) % 200) + 30, i * 32, 1.5, 32);
    }
    const floorTex = new THREE.CanvasTexture(planks);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(ROOM_W / 2, ROOM_D / 2);
    plane(ROOM_W, ROOM_D, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }), [0, 0, 0], [-Math.PI / 2, 0, 0]);
    plane(ROOM_W, ROOM_D, std(0xfbf8f2), [0, ROOM_H, 0], [Math.PI / 2, 0, 0]);

    // walls, the board's wall a little cooler so the board stands out
    plane(ROOM_W, ROOM_H, std(0xe6e3f0), [0, ROOM_H / 2, WALL_Z], [0, 0, 0]);
    plane(ROOM_W, ROOM_H, std(0xf3ede2), [0, ROOM_H / 2, ROOM_D / 2], [0, Math.PI, 0]);
    plane(ROOM_D, ROOM_H, std(0xf1e9dc), [-ROOM_W / 2, ROOM_H / 2, 0], [0, Math.PI / 2, 0]);
    plane(ROOM_D, ROOM_H, std(0xf1e9dc), [ROOM_W / 2, ROOM_H / 2, 0], [0, -Math.PI / 2, 0]);
    // skirting
    box(ROOM_W, 0.12, 0.03, 0xffffff, 0, 0.06, WALL_Z + 0.015);
    box(ROOM_W, 0.12, 0.03, 0xffffff, 0, 0.06, ROOM_D / 2 - 0.015);
    box(0.03, 0.12, ROOM_D, 0xffffff, -ROOM_W / 2 + 0.015, 0.06, 0);
    box(0.03, 0.12, ROOM_D, 0xffffff, ROOM_W / 2 - 0.015, 0.06, 0);

    // a window on the right wall, bright like daylight
    const wx = ROOM_W / 2 - 0.01;
    plane(2.2, 1.4, new THREE.MeshBasicMaterial({ color: 0xcfe6ff }), [wx, 1.9, 0.6], [0, -Math.PI / 2, 0]);
    box(0.06, 1.5, 0.08, 0xffffff, wx, 1.9, -0.5);
    box(0.06, 1.5, 0.08, 0xffffff, wx, 1.9, 1.7);
    box(0.06, 0.08, 2.3, 0xffffff, wx, 2.62, 0.6);
    box(0.06, 0.08, 2.3, 0xffffff, wx, 1.18, 0.6);
    box(0.06, 1.4, 0.04, 0xffffff, wx, 1.9, 0.6);
    box(0.2, 0.05, 2.4, 0xffffff, wx - 0.08, 1.15, 0.6);

    // a rug in front of the board
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48), std(0xc8d4ea));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.005, WALL_Z + 2.6);
    s.add(rug);

    // a desk with a lamp in the back-left corner
    const dx = -ROOM_W / 2 + 1.1;
    const dz = WALL_Z + 0.55;
    box(1.6, 0.05, 0.8, 0x9c7650, dx, 0.75, dz, true);
    for (const [lx, lz] of [
      [-0.72, -0.32],
      [0.72, -0.32],
      [-0.72, 0.32],
      [0.72, 0.32],
    ])
      box(0.05, 0.73, 0.05, 0x7a5a3c, dx + lx, 0.365, dz + lz);
    box(0.03, 0.4, 0.03, 0x333338, dx + 0.5, 0.97, dz - 0.1);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffc860, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    shade.position.set(dx + 0.5, 1.2, dz - 0.1);
    s.add(shade);
    box(0.32, 0.03, 0.24, 0x5b6cd9, dx - 0.3, 0.79, dz); // a notebook

    // a bookshelf on the left wall
    const bx = -ROOM_W / 2 + 0.2;
    const bz = 0.8;
    box(0.35, 1.9, 1.2, 0xa98258, bx, 0.95, bz, true);
    const spines = [0xe5484d, 0x30a46c, 0x0090ff, 0xf76b15, 0x8e4ec6, 0xffc53d];
    for (let shelf = 0; shelf < 4; shelf++) {
      box(0.36, 0.03, 1.16, 0x8a6a4a, bx + 0.01, 0.3 + shelf * 0.45, bz);
      let z = bz - 0.52;
      for (let i = 0; z < bz + 0.45; i++) {
        const w = 0.05 + ((i * 7 + shelf * 3) % 4) * 0.015;
        const h = 0.26 + ((i * 5 + shelf) % 3) * 0.04;
        box(0.24, h, w, spines[(i + shelf * 2) % spines.length], bx + 0.03, 0.315 + shelf * 0.45 + h / 2, z + w / 2);
        z += w + 0.012;
      }
    }

    // a plant in the back-right corner
    const px = ROOM_W / 2 - 0.7;
    const pz = WALL_Z + 0.7;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.5, 24), std(0xd0785a));
    pot.position.set(px, 0.25, pz);
    s.add(pot);
    for (const [ox, oy, oz, r] of [
      [0, 0.85, 0, 0.38],
      [0.18, 1.1, 0.08, 0.26],
      [-0.15, 1.05, -0.1, 0.28],
    ]) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: 0x5f9e5a, roughness: 0.8, flatShading: true }));
      leaf.position.set(px + ox, oy, pz + oz);
      s.add(leaf);
    }
    this.solids.push(new THREE.Box2(new THREE.Vector2(px - 0.3, pz - 0.3), new THREE.Vector2(px + 0.3, pz + 0.3)));

    // an armchair facing the board
    const cx = 2.3;
    const cz = 1.4;
    box(0.9, 0.4, 0.85, 0x6f8fc9, cx, 0.2, cz, true);
    box(0.9, 0.55, 0.18, 0x5f7fb9, cx, 0.65, cz + 0.36);
    box(0.16, 0.3, 0.85, 0x5f7fb9, cx - 0.37, 0.52, cz);
    box(0.16, 0.3, 0.85, 0x5f7fb9, cx + 0.37, 0.52, cz);
  }

  // ---------------------------------------------------------------- the board on the wall

  /** Redraws the wall board from what the flat board shows, and sizes it to the screen's shape. */
  setBoard(shot: BoardShot) {
    const w = Math.max(1, shot.width);
    const h = Math.max(1, shot.height);
    const aspect = w / h;
    const bw = BOARD_H * aspect;
    this.board.scale.set(bw, BOARD_H, 1);
    this.frame.scale.set(bw + 0.12, BOARD_H + 0.12, 1);

    const k = Math.min(devicePixelRatio || 1, 2, 2048 / Math.max(w, h));
    const c = this.boardCanvas;
    if (c.width !== Math.round(w * k) || c.height !== Math.round(h * k)) {
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      // a resized canvas needs a fresh texture on the GPU
      this.boardTex.dispose();
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const { ox, oy, s } = shot.view;
    for (const n of shot.notes) {
      const x = n.x * s + ox;
      const y = n.y * s + oy;
      if (x > w || y > h || x + NOTE_W * s < 0 || y + NOTE_H * s < 0) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.globalAlpha = shot.faded.has(n.id) ? 0.12 : 1;
      ctx.shadowColor = "rgba(0,0,0,0.1)";
      ctx.shadowBlur = 6 * s;
      ctx.shadowOffsetY = 2 * s;
      ctx.fillStyle = NOTE_FILL[n.color];
      ctx.beginPath();
      ctx.roundRect(0, 0, NOTE_W, NOTE_H, 3);
      ctx.fill();
      ctx.shadowColor = "transparent";

      const foot = n.author !== shot.me || n.visibility === "private" || n.labels.length > 0;
      ctx.fillStyle = n.text ? "#26262b" : "rgba(0,0,0,0.35)";
      ctx.font = `400 15px ${FONT}`;
      ctx.textBaseline = "top";
      const lines = wrap(ctx, n.text || (n.canEdit ? "Double-click to write" : "Empty"), NOTE_W - 28);
      const maxLines = Math.floor((NOTE_H - 24 - (foot ? 18 : 0)) / 21);
      lines.slice(0, maxLines).forEach((line, i) => ctx.fillText(line, 14, 14 + i * 21 + 2));

      if (foot) {
        ctx.font = `400 11px ${FONT}`;
        ctx.textBaseline = "middle";
        let lx = 14;
        for (const l of n.labels) {
          const lw = Math.min(ctx.measureText(l).width + 12, 90);
          if (lx + lw > NOTE_W - 60) break;
          ctx.fillStyle = "rgba(0,0,0,0.07)";
          ctx.beginPath();
          ctx.roundRect(lx, NOTE_H - 26, lw, 16, 8);
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.62)";
          ctx.fillText(l, lx + 6, NOTE_H - 18, lw - 12);
          lx += lw + 3;
        }
        const meta = [n.author !== shot.me ? n.author : "", n.visibility === "private" ? "private" : ""].filter(Boolean).join(" · ");
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.textAlign = "right";
        ctx.fillText(meta, NOTE_W - 14, NOTE_H - 18);
        ctx.textAlign = "left";
      }
      ctx.restore();
    }
    this.boardTex.needsUpdate = true;
  }

  /** Where the camera sees the wall board fill the screen exactly. */
  private fillPose(): Pose {
    return { pos: new THREE.Vector3(0, BOARD_Y, BOARD_Z + FILL_D), yaw: 0, pitch: 0 };
  }
  /** Where you stand the first time: back from the board, looking at it. */
  private startPose(): Pose {
    const pos = new THREE.Vector3(0, EYE, WALL_Z + 4.3);
    return { pos, yaw: 0, pitch: Math.atan2(BOARD_Y - EYE, pos.z - BOARD_Z) };
  }

  // ---------------------------------------------------------------- lifecycle

  attach(host: HTMLElement, handlers: SpaceHandlers) {
    this.handlers = handlers;
    this.host = host;
    if (this.renderer.domElement.parentElement !== host) host.appendChild(this.renderer.domElement);
    this.resize(host.clientWidth, host.clientHeight);
  }
  detach(host: HTMLElement) {
    if (this.host !== host) return;
    this.handlers = null;
    this.host = null;
    this.pause();
  }

  resize(w: number, h: number) {
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.raf) this.render();
  }

  /** Board → 3D: start filling the screen with the wall board, then pull back into the room. */
  enter(onFirstFrame: () => void): Promise<void> {
    this.setPose(this.fillPose());
    this.render();
    onFirstFrame();
    this.resume();
    return this.moveTo(this.saved ?? this.startPose()).then(() => {
      this.walking = true;
      this.renderer.domElement.focus({ preventScroll: true });
    });
  }

  /** 3D → board: dolly into the wall board until it is the screen. */
  leave(): Promise<void> {
    this.walking = false;
    this.keys.clear();
    this.vy = 0;
    this.saved = { pos: this.pose.pos.clone().setY(EYE), yaw: this.pose.yaw, pitch: this.pose.pitch };
    this.resume();
    return this.moveTo(this.fillPose());
  }

  /** Stops drawing: no frames, no CPU or GPU work, but everything kept for a quick return. */
  pause() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.walking = false;
    this.keys.clear();
    this.anim?.done();
    this.anim = null;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private resume() {
    if (this.raf) return;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Releases models, textures and the renderer, so the memory is given back. */
  dispose() {
    this.pause();
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- moving

  private setPose(p: Pose) {
    this.pose = { pos: p.pos.clone(), yaw: p.yaw, pitch: p.pitch };
    this.camera.position.copy(p.pos);
    this.camera.rotation.set(p.pitch, p.yaw, 0);
  }

  private moveTo(to: Pose): Promise<void> {
    this.anim?.done();
    return new Promise((resolve) => {
      const from = { pos: this.pose.pos.clone(), yaw: this.pose.yaw, pitch: this.pose.pitch };
      // turn the short way round
      const turn = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw));
      this.anim = { from, to: { ...to, yaw: from.yaw + turn }, t0: performance.now(), done: resolve };
    });
  }

  private tick = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.anim) {
      const { from, to, t0, done } = this.anim;
      const t = Math.min(1, (now - t0) / MOVE_MS);
      const e = ease(t);
      this.setPose({ pos: from.pos.clone().lerp(to.pos, e), yaw: from.yaw + (to.yaw - from.yaw) * e, pitch: from.pitch + (to.pitch - from.pitch) * e });
      if (t === 1) {
        this.anim = null;
        done();
      }
    } else if (this.walking) {
      this.walk(dt);
    }
    this.render();
    this.raf = requestAnimationFrame(this.tick);
  };

  private walk(dt: number) {
    const k = this.keys;
    const f = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0);
    const r = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    const p = this.pose.pos;
    if (f || r) {
      const speed = (k.has("shift") ? SPRINT : WALK) * dt * (f && r ? Math.SQRT1_2 : 1);
      const sin = Math.sin(this.pose.yaw);
      const cos = Math.cos(this.pose.yaw);
      const dx = (-sin * f + cos * r) * speed;
      const dz = (-cos * f - sin * r) * speed;
      // one axis at a time, so you slide along walls and furniture
      if (this.free(p.x + dx, p.z)) p.x += dx;
      if (this.free(p.x, p.z + dz)) p.z += dz;
    }
    const ground = EYE;
    if (this.vy !== 0 || p.y > ground) {
      this.vy -= GRAVITY * dt;
      p.y += this.vy * dt;
      if (p.y <= ground) {
        p.y = ground;
        this.vy = 0;
      }
    }
    this.camera.position.copy(p);
    this.camera.rotation.set(this.pose.pitch, this.pose.yaw, 0);

    const near = this.nearBoard();
    if (near !== this.wasNear) {
      this.wasNear = near;
      this.handlers?.near(near);
    }
  }

  private free(x: number, z: number): boolean {
    if (x < -ROOM_W / 2 + BODY || x > ROOM_W / 2 - BODY || z < WALL_Z + BODY + 0.1 || z > ROOM_D / 2 - BODY) return false;
    return !this.solids.some((b) => x > b.min.x - BODY && x < b.max.x + BODY && z > b.min.y - BODY && z < b.max.y + BODY);
  }

  /** Close to the board and facing it. */
  private nearBoard(): boolean {
    const p = this.pose.pos;
    const half = this.board.scale.x / 2;
    return p.z - BOARD_Z < REACH && Math.abs(p.x) < half + 0.6 && Math.cos(this.pose.yaw) > 0.6;
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- input

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.walking || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === "e") {
      if (this.nearBoard()) this.handlers?.focusBoard();
      return;
    }
    if (k === " ") {
      e.preventDefault();
      if (this.pose.pos.y <= EYE + 1e-3) this.vy = JUMP;
      return;
    }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"].includes(k)) {
      e.preventDefault();
      this.keys.add(k);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    if (e.key === "Shift") this.keys.delete("shift");
  };
  private onBlur = () => this.keys.clear();

  // drag to look around; a click on the board opens it
  private onPointerDown = (e: PointerEvent) => {
    if (!this.walking || e.button !== 0) return;
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    this.renderer.domElement.setPointerCapture(e.pointerId);
  };
  private onPointerMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId || !this.walking) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    this.pose.yaw += dx * 0.004;
    this.pose.pitch = THREE.MathUtils.clamp(this.pose.pitch - dy * 0.004, -1.2, 1.2);
  };
  private onPointerUp = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (d.moved || !this.walking || e.type === "pointercancel") return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.board)[0];
    if (hit && hit.distance < 7) this.handlers?.focusBoard();
  };
}

// ---------------------------------------------------------------- one renderer while 3D is alive

let live: Space | null = null;
let disposeTimer = 0;

/** The space, created on first use and reused (renderer and all) until it's disposed. */
export function getSpace(): Space {
  window.clearTimeout(disposeTimer);
  return (live ??= new Space());
}

/** Pauses now; after `after` ms on the board, frees it altogether. */
export function releaseSpace(after = 60_000): void {
  live?.pause();
  window.clearTimeout(disposeTimer);
  disposeTimer = window.setTimeout(() => {
    live?.dispose();
    live = null;
  }, after);
}
