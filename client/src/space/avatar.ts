// A blocky person: legs and arms on hip and shoulder pivots, so walking is
// just swinging them. Faces -z when its yaw is 0, like the camera.

import * as THREE from "three";

const SKIN = 0xf2c9a0;
const PANTS = 0x3d4a66;

export class Avatar {
  readonly group = new THREE.Group();
  private body: THREE.Mesh;
  private head: THREE.Group;
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private stride = 0; // where in the step cycle
  private swing = 0; // how far the limbs swing, eased towards the speed
  private t = Math.random() * 10;

  constructor(color: string, name?: string) {
    const mat = (c: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    const shirt = mat(color);
    const limb = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, into: THREE.Group[]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.y = -h / 2;
      pivot.add(mesh);
      this.group.add(pivot);
      into.push(pivot);
    };
    limb(0.17, 0.8, 0.19, mat(PANTS), -0.11, 0.8, this.legs);
    limb(0.17, 0.8, 0.19, mat(PANTS), 0.11, 0.8, this.legs);
    limb(0.12, 0.62, 0.14, shirt, -0.3, 1.38, this.arms);
    limb(0.12, 0.62, 0.14, shirt, 0.3, 1.38, this.arms);

    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt);
    this.body.position.y = 1.12;
    this.group.add(this.body);

    this.head = new THREE.Group();
    this.head.position.y = 1.62;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), mat(SKIN));
    const eye = new THREE.SphereGeometry(0.025, 8, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x26262b });
    for (const x of [-0.06, 0.06]) {
      const e = new THREE.Mesh(eye, eyeMat);
      e.position.set(x, 0.03, -0.155);
      this.head.add(e);
    }
    this.head.add(skull);
    this.group.add(this.head);

    if (name) this.group.add(nameTag(name, color));
  }

  /** speed in m/s drives the walk; in the air the legs tuck a little. */
  animate(dt: number, speed: number, airborne: boolean) {
    this.t += dt;
    const target = airborne ? 0.35 : Math.min(speed / 4, 1) * 0.75;
    this.swing += (target - this.swing) * Math.min(1, dt * 10);
    this.stride += dt * (airborne ? 0 : 2.2 + speed * 2.4);
    const s = Math.sin(this.stride) * this.swing;
    this.legs[0].rotation.x = airborne ? -this.swing : s;
    this.legs[1].rotation.x = airborne ? this.swing * 0.6 : -s;
    this.arms[0].rotation.x = -s * 0.9;
    this.arms[1].rotation.x = s * 0.9;
    // a bounce with each step; breathing when standing still
    const bob = Math.abs(Math.cos(this.stride)) * this.swing * 0.06 + Math.sin(this.t * 2.2) * 0.008;
    this.body.position.y = 1.12 + bob;
    this.head.position.y = 1.62 + bob;
    for (const a of this.arms) a.position.y = 1.38 + bob;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        if (o instanceof THREE.Mesh) o.geometry.dispose(); // sprites share one geometry
        const m = o.material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        m.dispose();
      }
    });
    this.group.removeFromParent();
  }
}

/** The name floating over someone's head, always facing you. */
function nameTag(name: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const font = '600 36px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(name).width) + 36;
  c.width = w;
  c.height = 56;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 56, 14);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 18, 29);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }));
  sprite.scale.set((w / 56) * 0.2, 0.2, 1);
  sprite.position.y = 2.05;
  return sprite;
}
