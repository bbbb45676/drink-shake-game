import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// 傍晚（藍調時刻）天空：上方靛藍、地平線蜜桃橘
const SKY = {
  top: new THREE.Color('#16204a'),
  mid: new THREE.Color('#4b4a86'),
  horizon: new THREE.Color('#f09a6e'),
  bottom: new THREE.Color('#2a2230'),
};

function skyMaterial(intensity = 1) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: SKY.top }, mid: { value: SKY.mid }, horizon: { value: SKY.horizon }, bottom: { value: SKY.bottom },
      sunDir: { value: new THREE.Vector3(-0.35, 0.06, -1).normalize() }, k: { value: intensity },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,1.)).xyz - cameraPosition); vec4 p = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, mid, horizon, bottom, sunDir; uniform float k; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0. ? mix(horizon, mid, smoothstep(0.0, 0.22, h)) : mix(horizon, bottom, smoothstep(0.0, 0.12, -h));
        c = h > 0.22 ? mix(mid, top, smoothstep(0.22, 0.8, h)) : c;
        float s = max(dot(d, sunDir), 0.);
        c += vec3(1.0, 0.62, 0.35) * (pow(s, 12.) * 0.9 + pow(s, 400.) * 3.);
        // 淡淡的雲帶
        float band = smoothstep(0.03, 0.09, h) * (1. - smoothstep(0.12, 0.3, h));
        float n = sin(d.x * 9. + d.z * 4.) * sin(d.x * 23. - d.z * 11. + 1.3) * 0.5 + 0.5;
        c = mix(c, vec3(1.0, 0.72, 0.6), band * n * 0.35);
        gl_FragColor = vec4(c * k, 1.); }`,
  });
}

export function makeSky() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), skyMaterial(1));
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// 反光用的環境貼圖：店內暖光燈條＋窗外傍晚天空
export function makeEnvironment(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), skyMaterial(1.1)));
  const room = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfc6ba'), side: THREE.BackSide }));
  room.position.set(0, 1.4, 2.2);
  s.add(room);
  const lamp = (w, h, x, y, z, col, k, rx = -Math.PI / 2) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.x = rx; s.add(m);
  };
  lamp(2.0, 0.6, 0, 2.95, -0.6, '#fff1dc', 1.5);
  lamp(2.0, 0.6, 0, 2.95, 1.6, '#fff1dc', 1.3);
  lamp(0.6, 2.0, -2.9, 1.6, 0.8, '#ffffff', 2.2, 0);
  lamp(0.6, 2.0, 2.9, 1.6, 0.8, '#ffffff', 2.2, 0);
  lamp(3.0, 1.4, 0, 1.6, -0.8, '#8f86b8', 1.2, 0);
  lamp(4, 4, 0, 0.0, 1.0, '#8d847a', 1, -Math.PI / 2);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return env;
}

export function makeLights(scene, q) {
  const hemi = new THREE.HemisphereLight('#9fb0e6', '#5a4030', 0.55);
  scene.add(hemi);

  // 主光：店裡天花板的暖光，打在櫃台上，影子柔和
  const key = new THREE.DirectionalLight('#ffe8cc', 2.3);
  key.position.set(-0.8, 3.0, 2.0);
  key.target.position.set(0.05, 0.9, -0.55);
  key.castShadow = true;
  const sc = key.shadow.camera;
  sc.left = -1.7; sc.right = 1.7; sc.top = 1.7; sc.bottom = -1.7; sc.near = 0.5; sc.far = 7;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.015;
  key.shadow.mapSize.set(q.shadow, q.shadow);
  key.shadow.radius = 5; key.shadow.blurSamples = 12;
  scene.add(key, key.target);

  // 夕陽：從街道後方斜斜照過來，替客人打輪廓光
  const sun = new THREE.DirectionalLight('#ff8a50', 1.1);
  sun.position.set(-6, 3.2, -12);
  sun.target.position.set(0, 1, -1.5);
  scene.add(sun, sun.target);

  // 天光補光：照亮對街的建築正面
  const fill = new THREE.DirectionalLight('#8796d8', 0.4);
  fill.position.set(2, 6, 6);
  fill.target.position.set(0, 2, -12);
  scene.add(fill, fill.target);

  // 騎樓燈：暖黃點光源，讓排隊的客人不會黑掉
  const arcade = new THREE.PointLight('#ffcf8a', 3.5, 2.7, 1.2);
  arcade.position.set(0, 2.75, -2.7);
  scene.add(arcade);

  return { hemi, key, sun, fill, arcade };
}

// 暗角＋一點暖色調色
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0.32 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - .5; float v = 1. - dot(d, d) * amount * 2.2;
      c.rgb *= v; c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.95), .6); gl_FragColor = c; }`,
};

export class Renderer {
  constructor(canvasEl, q) {
    this.r = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    const r = this.r;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.94;
    r.shadowMap.enabled = true;
    r.shadowMap.type = q.softShadow ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    this.q = q;
    this.composer = null;
  }

  setup(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.buildComposer();
  }

  buildComposer() {
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (!this.q.bloom) return;
    const size = this.r.getSize(new THREE.Vector2());
    const c = new EffectComposer(this.r);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.5, 1.05);
    c.addPass(this.bloom);
    c.addPass(new ShaderPass(GradeShader));
    c.addPass(new OutputPass());
    this.composer = c;
  }

  setQuality(q) {
    const shadowChanged = q.softShadow !== this.q.softShadow;
    this.q = q;
    if (shadowChanged) { this.r.shadowMap.type = q.softShadow ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap; this.r.shadowMap.needsUpdate = true; }
    this.resize(this.w, this.h);
    this.buildComposer();
    this.resize(this.w, this.h);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.r.setPixelRatio(pr);
    this.r.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.r.render(this.scene, this.camera);
  }
}
