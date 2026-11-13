// Rescue Team — fases 1 y 2
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ───────────── Aleatoriedad y ruido ─────────────
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
let R = Math.random;
const rr = (a, b) => a + R() * (b - a);
function perlin(seed) {
  const r = mulberry32(seed), p = new Uint8Array(512), a = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  const g = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = f(x), v = f(y), aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    return lerp(lerp(g(aa, x, y), g(ba, x - 1, y), u), lerp(g(ab, x, y - 1), g(bb, x - 1, y - 1), u), v);
  };
}
const fbm = (f, x, y, o) => { let s = 0, a = .5, q = 1, n = 0; for (let i = 0; i < o; i++) { s += a * f(x * q, y * q); n += a; a *= .5; q *= 2; } return s / n; };

// ───────────── Mundo ─────────────
const N = 128, CELL = 6, HALF = (N - 1) * CELL / 2, HMAX = 150, NN = N * N;
const V = { WATER: 0, ROCK: 1, GRASS: 2, SHRUB: 3, PINE: 4, OAK: 5, CROP: 6, TOWN: 7, ROAD: 8 };
const VP = [
  { n: 'Agua', spread: 0, burn: 0, col: [.16, .3, .4], cost: Infinity, dmg: 0 },
  { n: 'Roca', spread: 0, burn: 0, col: [.5, .48, .45], cost: Infinity, dmg: 0 },
  { n: 'Pasto seco', spread: .95, burn: 16, col: [.64, .6, .33], cost: 2.2, dmg: 500 },
  { n: 'Matorral', spread: .72, burn: 28, col: [.45, .46, .25], cost: 3.5, dmg: 1200, spot: .25 },
  { n: 'Pinar', spread: .6, burn: 55, col: [.24, .33, .17], cost: 5, dmg: 2500, spot: 1 },
  { n: 'Robledal', spread: .38, burn: 75, col: [.3, .39, .18], cost: 5, dmg: 3000, spot: .3 },
  { n: 'Cultivos', spread: .85, burn: 14, col: [.74, .65, .38], cost: 2.2, dmg: 3000 },
  { n: 'Casco urbano', spread: .3, burn: 25, col: [.56, .53, .48], cost: 1.4, dmg: 4000 },
  { n: 'Carretera', spread: 0, burn: 0, col: [.27, .26, .25], cost: 1, dmg: 0 },
  { n: 'Cortafuegos', spread: 0, burn: 0, col: [.5, .4, .28], cost: 1.6, dmg: 0 },
];
V.BREAK = 9;
const MAXCUT = 40; // longitud máxima de un cortafuegos (celdas)
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DZ8 = [0, 0, 1, -1, 1, -1, 1, -1], DL8 = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];
const HA_CELL = 0.09; // cada celda ≈ 30 × 30 m

const LEVELS = [
  { foci: 1, wind: 14, drought: .45, rolada: 110, rain: .45, storm: false, limit: 4e6, trucks: 2, hour: 12, k: .85, desc: '1 foco · viento suave' },
  { foci: 1, wind: 22, drought: .55, rolada: 85, rain: .35, storm: false, limit: 4.5e6, trucks: 2, hour: 15, k: .95, desc: '1 foco · se hace de noche' },
  { foci: 2, wind: 28, drought: .65, rolada: 70, rain: .25, storm: true, limit: 5e6, trucks: 3, hour: 13, k: 1, desc: '2 focos · tormentas secas' },
  { foci: 2, wind: 36, drought: .75, rolada: 55, rain: .15, storm: true, limit: 5.5e6, trucks: 3, hour: 17, k: 1.08, desc: '2 focos · viento fuerte' },
  { foci: 3, wind: 46, drought: .85, rolada: 45, rain: .08, storm: true, limit: 6e6, trucks: 3, hour: 19, k: 1.15, desc: '3 focos · ola de calor' },
];
// ───────────── Progreso del jugador y tienda ─────────────
const SHOP = [
  { id: 'bomba', kind: 'unit', ic: '🚒', n: 'Autobomba extra', d: 'Una autobomba más en todas las partidas.', lvl: 1, price: [700, 1100, 1600], max: 3 },
  { id: 'brigada', kind: 'unit', ic: '🪓', n: 'Brigada forestal', d: 'Cuadrilla con motosierras y desbrozadoras. Abre cortafuegos estrechos incluso en laderas muy empinadas, pero es lenta y vulnerable al calor.', lvl: 1, price: [500], max: 1 },
  { id: 'bulldozer', kind: 'unit', ic: '🚜', n: 'Bulldozer', d: 'Abre cortafuegos tres veces más rápido que la brigada, pero no sube pendientes fuertes.', lvl: 2, price: [1200], max: 1 },
  { id: 'heli', kind: 'unit', ic: '🚁', n: 'Helicóptero bombardero', d: 'Vuela en línea recta y llena el helibalde en cualquier embalse. Hace rotaciones solo mientras quede fuego. No vuela de noche ni con viento de más de 60 km/h.', lvl: 2, price: [1600, 2600], max: 2 },
  { id: 'avion', kind: 'unit', ic: '🛩️', n: 'Hidroavión anfibio', d: 'Carga rozando un embalse grande y descarga una franja larga de agua. Muy rápido. No vuela de noche ni con viento de más de 60 km/h.', lvl: 3, price: [3000], max: 1 },
  { id: 'tank', kind: 'upg', ic: '💧', n: 'Depósitos ampliados', d: '+25 % de agua por nivel en autobombas y aeronaves.', lvl: 1, price: [400, 800, 1300], max: 3 },
  { id: 'motor', kind: 'upg', ic: '⚙️', n: 'Motores', d: '+12 % de velocidad por nivel para todos los medios.', lvl: 1, price: [400, 800, 1300], max: 3 },
  { id: 'epi', kind: 'upg', ic: '🦺', n: 'Equipos de protección', d: '−20 % de daño por calor a las dotaciones por nivel.', lvl: 2, price: [500, 1000, 1500], max: 3 },
  { id: 'ret', kind: 'upg', ic: '🧪', n: 'Espumógenos y retardantes', d: '+20 % de eficacia del agua por nivel, en mangueras y descargas.', lvl: 2, price: [600, 1200, 1800], max: 3 },
  { id: 'budget', kind: 'upg', ic: '💶', n: 'Fondo de emergencias', d: '+10 % de límite de daños por nivel.', lvl: 3, price: [700, 1400], max: 2 },
  { id: 'nvg', kind: 'upg', ic: '🌙', n: 'Vuelo nocturno (NVG)', d: 'Gafas de visión nocturna: los helicópteros pueden operar de noche.', lvl: 4, price: [1800], max: 1 },
];
let prof = (() => {
  let p = null; try { p = JSON.parse(localStorage.getItem('rt-prof')); } catch (e) { }
  if (!p) { let xp = 0; try { xp = +localStorage.getItem('rt-xp') || 0; } catch (e) { } p = { xp, maxLvl: 0, own: {} }; }
  p.own ||= {}; return p;
})();
const saveProf = () => { try { localStorage.setItem('rt-prof', JSON.stringify(prof)); } catch (e) { } };
const own = id => prof.own[id] || 0;
const ICON = { bomba: '🚒', ganado: '🚛', brigada: '🪓', bulldozer: '🚜', heli: '🚁', avion: '🛩️' };
const AIR = { heli: { sp: 8, cruise: 38, low: 15, scoopT: 4 }, avion: { sp: 13, cruise: 55, low: 22, scoopT: 3 } };

const TOWN_NAMES = ['Valdelobos', 'Peñarrubia', 'Robledo del Monte', 'Fuentealba', 'Cañada Honda', 'Villaseca', 'Hoyos del Pinar', 'Navalcuervo'];
const FARM_NAMES = ['Granja Los Álamos', 'Majada del Tío Pedro', 'Cortijo El Encinar', 'Granja La Solana'];
const LONE_NAMES = ['Casa del guarda', 'Molino Viejo', 'Cabaña del Hayedo', 'Masía Las Rozas', 'Casa de la Fuente'];
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

let H, VEG, FUEL, STATE, INT, BT, WET, MOI, ROADF, AFF, DIST, BC;
function alloc() {
  H = new Float32Array(NN); VEG = new Uint8Array(NN); FUEL = new Float32Array(NN); STATE = new Uint8Array(NN);
  INT = new Float32Array(NN); BT = new Float32Array(NN); WET = new Float32Array(NN); MOI = new Float32Array(NN);
  ROADF = new Uint8Array(NN); AFF = new Uint8Array(NN); DIST = new Uint8Array(NN); BC = new Float32Array(NN * 3);
}
const cx = i => i % N, cz = i => (i / N) | 0;
const wx = x => x * CELL - HALF;
const cheb = (a, b) => Math.max(Math.abs(cx(a) - cx(b)), Math.abs(cz(a) - cz(b)));
const octile = (a, b) => { const dx = Math.abs(cx(a) - cx(b)), dz = Math.abs(cz(a) - cz(b)); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
// línea de celdas 4-conexa (un cortafuegos así no deja huecos en diagonal)
function line4(a, b) {
  let x = cx(a), z = cz(a); const x1 = cx(b), z1 = cz(b), nx = Math.abs(x1 - x), nz = Math.abs(z1 - z), sx = x1 > x ? 1 : -1, sz = z1 > z ? 1 : -1;
  const out = [a]; let ix = 0, iz = 0;
  while (ix < nx || iz < nz) { if ((.5 + ix) / nx < (.5 + iz) / nz) { x += sx; ix++; } else { z += sz; iz++; } out.push(z * N + x); }
  return out;
}
function hAt(fx, fz) { // altura en coordenadas de celda (flotantes)
  fx = clamp(fx, 0, N - 1.001); fz = clamp(fz, 0, N - 1.001);
  const x = Math.floor(fx), z = Math.floor(fz), u = fx - x, v = fz - z, i = z * N + x;
  return lerp(lerp(H[i], H[i + 1], u), lerp(H[i + N], H[i + N + 1], u), v);
}
const hWorld = (x, z) => hAt((x + HALF) / CELL, (z + HALF) / CELL);
const cellWorld = i => new THREE.Vector3(wx(cx(i)), H[i], wx(cz(i)));

// ───────────── Búsqueda de rutas (A*) ─────────────
const AG = new Float32Array(NN), AS = new Int32Array(NN), AC = new Int32Array(NN), ACL = new Int32Array(NN);
let astamp = 0;
function astar(start, isGoal, hf, costF, maxIt = 40000) {
  astamp++;
  const hi = [], hfv = [];
  const push = (i, f) => { hi.push(i); hfv.push(f); let k = hi.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (hfv[p] <= hfv[k]) break; [hi[p], hi[k]] = [hi[k], hi[p]];[hfv[p], hfv[k]] = [hfv[k], hfv[p]]; k = p; } };
  const pop = () => { const top = hi[0]; const li = hi.pop(), lf = hfv.pop(); if (hi.length) { hi[0] = li; hfv[0] = lf; let k = 0; for (; ;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hi.length && hfv[l] < hfv[m]) m = l; if (r < hi.length && hfv[r] < hfv[m]) m = r; if (m === k) break; [hi[m], hi[k]] = [hi[k], hi[m]];[hfv[m], hfv[k]] = [hfv[k], hfv[m]]; k = m; } } return top; };
  AG[start] = 0; AS[start] = astamp; AC[start] = -1; push(start, hf(start));
  let it = 0;
  while (hi.length && it++ < maxIt) {
    const cur = pop();
    if (ACL[cur] === astamp) continue; ACL[cur] = astamp;
    if (isGoal(cur)) { const path = []; let c = cur; while (c !== start) { path.push(c); c = AC[c]; } return path.reverse(); }
    const x = cx(cur), z = cz(cur);
    for (let d = 0; d < 8; d++) {
      const nx = x + DX8[d], nz = z + DZ8[d]; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const n = nz * N + nx; if (ACL[n] === astamp) continue;
      const c = costF(cur, n, d); if (c === Infinity) continue;
      const g = AG[cur] + c;
      if (AS[n] !== astamp || g < AG[n]) { AS[n] = astamp; AG[n] = g; AC[n] = cur; push(n, g + hf(n)); }
    }
  }
  return null;
}
function passable(a, b, d) { const v = VEG[b]; if (v === V.WATER || v === V.ROCK) return false; return Math.abs(H[b] - H[a]) <= 4.6 * DL8[d]; }
function vehCost(a, b, d) {
  if (!passable(a, b, d)) return Infinity;
  if (STATE[b] === 1 && INT[b] > .06) return Infinity;
  const base = ROADF[b] ? 1 : VP[VEG[b]].cost;
  return base * DL8[d] * (1 + Math.abs(H[b] - H[a]) * .2);
}
function footCost(a, b, d) { // brigada a pie: sube laderas que los vehículos no pueden
  const v = VEG[b], dh = Math.abs(H[b] - H[a]); if (v === V.WATER || dh > 9 * DL8[d] || (v === V.ROCK && dh > 3 * DL8[d])) return Infinity;
  if (STATE[b] === 1 && INT[b] > .06) return Infinity;
  return (ROADF[b] ? 1 : 1.6) * DL8[d] * (1 + dh * .12);
}
const costFor = u => u.type === 'brigada' ? footCost : vehCost;
function carCost(a, b, d) {
  if (!passable(a, b, d)) return Infinity;
  const v = VEG[b]; const base = ROADF[b] ? 1 : v === V.TOWN ? 2 : (v === V.GRASS || v === V.CROP) ? 8 : 25;
  return base * DL8[d];
}

// ───────────── Render ─────────────
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9db8d0, 700, 2200);
const camera = new THREE.PerspectiveCamera(48, 1, 1, 6000);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4a3f2a, .8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -430, right: 430, top: 430, bottom: -430, near: 10, far: 2000 });
sun.shadow.bias = -.0006; sun.shadow.normalBias = 1.2;
scene.add(sun, sun.target);
const moon = new THREE.DirectionalLight(0x8fa8ff, 0); moon.position.set(-300, 500, 200); scene.add(moon);
const fireLights = [0, 1, 2, 3, 4].map(() => { const l = new THREE.PointLight(0xff6a1a, 0, 320, 1.2); scene.add(l); return l; });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b4128, roughness: 1 }));
ground.position.y = -1; ground.receiveShadow = true; scene.add(ground);
// estrellas
{
  const g = new THREE.BufferGeometry(), p = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * .5 + .08, r = 3500; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  var stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(stars);
}
let world = new THREE.Group(); scene.add(world);
const glowTime = { value: 0 }, glowK = { value: 1 };

// Partículas (llamas, humo, agua, nubes)
const PVS = `attribute float aSize;attribute vec4 aCol;varying vec4 vCol;uniform float uScale;
void main(){vCol=aCol;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=min(700.0,aSize*uScale/max(1.0,-mv.z));gl_Position=projectionMatrix*mv;}`;
const PFS = `varying vec4 vCol;uniform float uSoft;void main(){float d=length(gl_PointCoord-0.5)*2.0;if(d>1.0)discard;float a=pow(1.0-d,uSoft);gl_FragColor=vec4(vCol.rgb,vCol.a*a);}`;
const pScale = { value: 500 };
class PSys {
  constructor(max, { add = false, soft = 1.5, buoy = 0, drag = .5, windK = 0, order = 0 }) {
    this.max = max; this.n = 0; this.o = { buoy, drag, windK };
    const F = k => new Float32Array(max * k);
    Object.assign(this, { p: F(3), v: F(3), s: F(1), c: F(4), age: F(1), dur: F(1), s0: F(1), s1: F(1), c0: F(3), c1: F(3), a0: F(1) });
    const g = this.g = new THREE.BufferGeometry();
    this.ap = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.as = new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage);
    this.ac = new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.ap); g.setAttribute('aSize', this.as); g.setAttribute('aCol', this.ac);
    const mat = new THREE.ShaderMaterial({ uniforms: { uScale: pScale, uSoft: { value: soft } }, vertexShader: PVS, fragmentShader: PFS, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, mat); this.pts.frustumCulled = false; this.pts.renderOrder = order; scene.add(this.pts);
  }
  add(x, y, z, vx, vy, vz, dur, s0, s1, c0, c1, a) {
    if (this.n >= this.max) return; const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.age[i] = 0; this.dur[i] = dur; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.c0[i3] = c0[0]; this.c0[i3 + 1] = c0[1]; this.c0[i3 + 2] = c0[2]; this.c1[i3] = c1[0]; this.c1[i3 + 1] = c1[1]; this.c1[i3 + 2] = c1[2];
  }
  kill(i) {
    const j = --this.n; if (i === j) return; const i3 = i * 3, j3 = j * 3;
    for (const k of ['p', 'v', 'c0', 'c1']) { const a = this[k]; a[i3] = a[j3]; a[i3 + 1] = a[j3 + 1]; a[i3 + 2] = a[j3 + 2]; }
    for (const k of ['age', 'dur', 's0', 's1', 'a0']) this[k][i] = this[k][j];
  }
  update(dt, wvx, wvz, ws) {
    const o = this.o, dr = Math.exp(-o.drag * dt);
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt; if (this.age[i] >= this.dur[i]) { this.kill(i); i--; continue; }
      const t = this.age[i] / this.dur[i], i3 = i * 3, i4 = i * 4, v = this.v, p = this.p;
      v[i3 + 1] += o.buoy * dt;
      v[i3] *= dr; v[i3 + 1] *= dr; v[i3 + 2] *= dr;
      if (o.windK) { v[i3] += (wvx * ws - v[i3]) * o.windK * dt; v[i3 + 2] += (wvz * ws - v[i3 + 2]) * o.windK * dt; }
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      this.s[i] = lerp(this.s0[i], this.s1[i], t);
      this.c[i4] = lerp(this.c0[i3], this.c1[i3], t); this.c[i4 + 1] = lerp(this.c0[i3 + 1], this.c1[i3 + 1], t); this.c[i4 + 2] = lerp(this.c0[i3 + 2], this.c1[i3 + 2], t);
      this.c[i4 + 3] = this.a0[i] * (t < .15 ? t / .15 : (1 - t) / .85);
    }
    this.g.setDrawRange(0, this.n);
    this.ap.needsUpdate = this.as.needsUpdate = this.ac.needsUpdate = true;
  }
}
const smoke = new PSys(3500, { soft: 2.4, buoy: -.4, drag: .25, windK: .35, order: 2 });
const flames = new PSys(5000, { add: true, soft: 1.6, buoy: 6, drag: 1.2, windK: .8, order: 3 });
const water = new PSys(1500, { soft: 1.4, buoy: -38, drag: .1, order: 4 });
const clouds = new PSys(90, { soft: 1, drag: 0, windK: .02, order: 5 });

// Lluvia
const RAIN_N = 3500;
const rainGeo = new THREE.BufferGeometry(); const rainPos = new Float32Array(RAIN_N * 6);
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
const rainMat = new THREE.LineBasicMaterial({ color: 0xaac4dd, transparent: true, opacity: 0 });
const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.frustumCulled = false; scene.add(rainLines);
for (let i = 0; i < RAIN_N; i++) { rainPos[i * 6] = rr(-250, 250); rainPos[i * 6 + 1] = rr(0, 300); rainPos[i * 6 + 2] = rr(-250, 250); }

// ───────────── Estado de partida ─────────────
let G = null, lvlIdx = 0, lastSeed = 0;
let burning = [], changed = [];
let terrain, colAttr, glowAttr, cols, glow, trees = [], cellTrees, houseMesh, roofMesh, winMesh, carMesh, wildMesh, stockMeshes = [], selRing, destRing, trunkMesh, previewLine, planLine;
const ZERO4 = new THREE.Matrix4().makeScale(0, 0, 0);

// ───────────── Generación del mapa ─────────────
function generate(seed) {
  R = mulberry32(seed);
  const p1 = perlin(seed * 7 + 1), p2 = perlin(seed * 7 + 2), p3 = perlin(seed * 7 + 3), p4 = perlin(seed * 7 + 4);
  const ang = R() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang), off = rr(-.18, .18);
  let mn = Infinity, mx = -Infinity;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, u = x / N - .5, v = z / N - .5;
    const base = fbm(p1, x * .022 + 10, z * .022 + 10, 5);
    const r = Math.max(0, 1 - Math.abs(fbm(p2, x * .018 + 3, z * .018 + 7, 4)) * 2.2), ridge = r * r;
    const band = Math.exp(-((u * sa - v * ca - off) ** 2) / .035);
    const h = .3 + base * .9 + ridge * .5 * (.3 + band) + band * .3;
    H[i] = h; mn = Math.min(mn, h); mx = Math.max(mx, h);
    MOI[i] = clamp(fbm(p3, x * .035, z * .035, 4) * .9 + .5, 0, 1);
  }
  for (let i = 0; i < NN; i++) H[i] = Math.pow((H[i] - mn) / (mx - mn), 1.4);
  for (let pass = 0; pass < 2; pass++) { const c = H.slice(); for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { const i = z * N + x; H[i] = (c[i] * 4 + c[i - 1] + c[i + 1] + c[i - N] + c[i + N]) / 8; } }
  const sorted = Float32Array.from(H).sort(); const wl = sorted[Math.floor(NN * .07)];
  G.waterH = wl * HMAX + .8;
  for (let i = 0; i < NN; i++) H[i] *= HMAX;
  // vegetación
  for (let i = 0; i < NN; i++) {
    const x = cx(i), z = cz(i), hn = H[i] / HMAX, m = MOI[i];
    let sl = 0; if (x > 0 && x < N - 1 && z > 0 && z < N - 1) sl = Math.max(Math.abs(H[i + 1] - H[i - 1]), Math.abs(H[i + N] - H[i - N])) / (2 * CELL);
    let v;
    if (H[i] < G.waterH) v = V.WATER;
    else if (sl > 1.05 || hn > .9) v = V.ROCK;
    else if (hn > .68) v = m > .42 ? V.PINE : (m > .3 ? V.SHRUB : V.ROCK);
    else if (hn > .32) v = m > .58 ? V.OAK : m > .4 ? V.PINE : m > .28 ? V.SHRUB : V.GRASS;
    else v = m > .62 ? V.OAK : m > .47 ? V.SHRUB : m > .35 ? V.PINE : V.GRASS;
    if (v !== V.WATER && hn < wl + .05 && R() < .7) v = V.GRASS;
    VEG[i] = v;
  }
  // base y alcance por carretera
  const border = []; for (let k = 2; k < N - 2; k++) border.push(2 * N + k, (N - 3) * N + k, k * N + 2, k * N + N - 3);
  const landB = border.filter(i => VEG[i] !== V.WATER && VEG[i] !== V.ROCK).sort((a, b) => H[a] - H[b]);
  if (!landB.length) return false;
  const base = landB[Math.floor(R() * Math.min(12, landB.length))];
  const reach = new Uint8Array(NN); { const q = [base]; reach[base] = 1; while (q.length) { const c = q.pop(); for (let d = 0; d < 8; d++) { const x = cx(c) + DX8[d], z = cz(c) + DZ8[d]; if (x < 0 || z < 0 || x >= N || z >= N) continue; const n = z * N + x; if (!reach[n] && passable(c, n, d)) { reach[n] = 1; q.push(n); } } } }
  let rc = 0; for (let i = 0; i < NN; i++) rc += reach[i]; if (rc < NN * .4) return false;
  const far = landB.filter(i => reach[i]).sort((a, b) => cheb(b, base) - cheb(a, base));
  const exit2 = far[0];
  G.base = base; G.exits = [base, exit2];
  // pueblos
  const cand = []; for (let z = 10; z < N - 10; z++) for (let x = 10; x < N - 10; x++) { const i = z * N + x; if (!reach[i] || VEG[i] === V.WATER || VEG[i] === V.ROCK) continue; let ok = true, mxd = 0; for (let dz = -4; dz <= 4 && ok; dz++) for (let dx = -4; dx <= 4; dx++) { const n = i + dz * N + dx; if (VEG[n] === V.WATER) { ok = false; break; } mxd = Math.max(mxd, Math.abs(H[n] - H[i])); } if (ok && mxd < 9) cand.push(i); }
  cand.sort(() => R() - .5);
  const names = TOWN_NAMES.slice().sort(() => R() - .5);
  G.towns = [];
  for (const c of cand) { if (G.towns.length >= 3) break; if (G.towns.every(t => cheb(t.cell, c) > 34) && cheb(c, base) > 18) G.towns.push({ id: G.towns.length, cell: c, name: names[G.towns.length], houses: [], alarm: false, warned: 0, paths: [] }); }
  if (G.towns.length < 3) return false;
  for (const t of G.towns) {
    const th = H[t.cell];
    for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) {
      const x = cx(t.cell) + dx, z = cz(t.cell) + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue; const n = z * N + x, d = Math.hypot(dx, dz);
      if (d <= 9 && VEG[n] !== V.WATER) { const w = smooth(9, 4, d); H[n] = lerp(H[n], th, w * .85); if (d <= 4.5) VEG[n] = V.TOWN; else if (d <= 8 && VEG[n] !== V.ROCK) VEG[n] = R() < .7 ? V.CROP : V.GRASS; }
    }
  }
  // carreteras
  const roadCost = (a, b, d) => { if (!passable(a, b, d)) return Infinity; return (ROADF[b] ? .4 : 1 + (Math.abs(H[b] - H[a]) ** 2) * .5 + (VEG[b] === V.TOWN ? 0 : .3)) * DL8[d]; };
  const order = [base, ...G.towns.slice().sort((a, b) => cheb(a.cell, base) - cheb(b.cell, base)).map(t => t.cell), exit2];
  for (let k = 0; k < order.length - 1; k++) {
    const goal = order[k + 1], path = astar(order[k], i => i === goal, i => octile(i, goal) * .4, roadCost, 120000);
    if (!path) return false;
    for (const c of [order[k], ...path]) ROADF[c] = 1;
  }
  for (let i = 0; i < NN; i++) if (ROADF[i]) { if (VEG[i] !== V.TOWN) VEG[i] = V.ROAD; }
  { const c = H.slice(); for (let i = 0; i < NN; i++) if (ROADF[i]) { const x = cx(i), z = cz(i); if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue; H[i] = (c[i] * 2 + c[i - 1] + c[i + 1] + c[i - N] + c[i + N]) / 6; } }
  // casas de los pueblos
  G.houses = [];
  for (const t of G.towns) {
    const nH = 9 + Math.floor(R() * 6); let tries = 0;
    while (t.houses.length < nH && tries++ < 300) {
      const dx = Math.round(rr(-5, 5)), dz = Math.round(rr(-5, 5)); if (Math.hypot(dx, dz) > 5.2) continue;
      const c = t.cell + dz * N + dx; if (ROADF[c] || G.houses.some(h => h.cell === c) || VEG[c] === V.WATER) continue;
      const h = { id: G.houses.length, cell: c, town: t.id, people: 2 + Math.floor(R() * 3), state: 'ok', t: 0, rot: Math.floor(R() * 4) * Math.PI / 2, ox: rr(-1, 1), oz: rr(-1, 1), name: '' };
      G.houses.push(h); t.houses.push(h);
    }
    t.pop0 = t.houses.reduce((s, h) => s + h.people, 0);
  }
  // casas aisladas
  const lone = LONE_NAMES.slice().sort(() => R() - .5); let tries = 0, nl = 0;
  while (nl < 4 && tries++ < 4000) {
    const c = Math.floor(R() * NN); const x = cx(c), z = cz(c); if (x < 6 || z < 6 || x > N - 7 || z > N - 7) continue;
    if (!reach[c] || VEG[c] < V.GRASS || VEG[c] > V.OAK || ROADF[c]) continue;
    if (G.towns.some(t => cheb(t.cell, c) < 15) || G.houses.some(h => cheb(h.cell, c) < 18) || cheb(c, base) < 15) continue;
    VEG[c] = V.GRASS; for (let d = 0; d < 4; d++) { const n = c + DZ8[d] * N + DX8[d]; if (VEG[n] > V.ROCK && R() < .6) VEG[n] = V.GRASS; }
    G.houses.push({ id: G.houses.length, cell: c, town: -1, people: 2 + Math.floor(R() * 3), state: 'ok', t: 0, rot: Math.floor(R() * 4) * Math.PI / 2, ox: 0, oz: 0, name: lone[nl], warned: 0 });
    nl++;
  }
  // granjas
  G.farms = []; tries = 0; const fn = FARM_NAMES.slice().sort(() => R() - .5);
  while (G.farms.length < 3 && tries++ < 4000) {
    const t = G.towns[G.farms.length % 3]; const a = R() * Math.PI * 2, d = rr(10, 17);
    const x = Math.round(cx(t.cell) + Math.cos(a) * d), z = Math.round(cz(t.cell) + Math.sin(a) * d); if (x < 4 || z < 4 || x > N - 5 || z > N - 5) continue;
    const c = z * N + x; if (!reach[c] || VEG[c] === V.WATER || VEG[c] === V.ROCK || ROADF[c]) continue;
    if (G.farms.some(f => cheb(f.cell, c) < 10) || G.houses.some(h => cheb(h.cell, c) < 3)) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = c + dz * N + dx; if (VEG[n] !== V.WATER && VEG[n] !== V.ROCK && !ROADF[n]) VEG[n] = V.GRASS; }
    const sheep = R() < .55;
    G.farms.push({ id: G.farms.length, cell: c, name: fn[G.farms.length], kind: sheep ? 'ovejas' : 'vacas', n: sheep ? 12 : 8, state: 'waiting', warned: 0 });
  }
  // fauna salvaje
  G.wild = []; tries = 0;
  while (G.wild.length < 48 && tries++ < 5000) {
    const c = Math.floor(R() * NN); if (VEG[c] !== V.PINE && VEG[c] !== V.OAK) continue;
    if (G.towns.some(t => cheb(t.cell, c) < 14)) continue;
    const deer = R() < .6, k = 3 + Math.floor(R() * 4);
    for (let j = 0; j < k; j++) G.wild.push({ x: cx(c) + rr(-1.5, 1.5), z: cz(c) + rr(-1.5, 1.5), deer, alive: true, tx: 0, tz: 0, sp: 0, wait: R() * 5, h: R() * 6 });
  }
  // combustible y focos
  for (let i = 0; i < NN; i++) FUEL[i] = VP[VEG[i]].spread > 0 ? 1 : 0;
  G.foci = []; tries = 0;
  while (G.foci.length < G.L.foci && tries++ < 5000) {
    const c = Math.floor(R() * NN); if (![V.PINE, V.SHRUB, V.OAK].includes(VEG[c])) continue;
    if (G.towns.some(t => cheb(t.cell, c) < 28) || cheb(c, base) < 30 || G.houses.some(h => cheb(h.cell, c) < 26) || G.farms.some(f => cheb(f.cell, c) < 20)) continue;
    if (G.foci.some(f => cheb(f, c) < 25)) continue;
    G.foci.push(c);
  }
  if (G.foci.length < G.L.foci) return false;
  // puntos de agua
  G.shore = []; for (let i = 0; i < NN; i++) { if (VEG[i] === V.WATER || VEG[i] === V.ROCK || !reach[i]) continue; const x = cx(i), z = cz(i); for (let d = 0; d < 4; d++) { const nx = x + DX8[d], nz = z + DZ8[d]; if (nx >= 0 && nz >= 0 && nx < N && nz < N && VEG[nz * N + nx] === V.WATER) { G.shore.push(i); break; } } }
  G.hydrants = G.towns.map(t => t.cell).concat([base]);
  // rutas de evacuación precalculadas
  for (const t of G.towns) t.paths = G.exits.map(e => astar(t.cell, i => i === e, i => octile(i, e), carCost, 120000) || []);
  // agua para medios aéreos: cualquier celda (helibalde) o embalses grandes (hidroavión)
  G.waterCells = []; G.lakes = [];
  for (let i = 0; i < NN; i++) {
    if (VEG[i] !== V.WATER) continue; G.waterCells.push(i);
    let n = 0; const x = cx(i), z = cz(i);
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const X = x + dx, Z = z + dz; if (X >= 0 && Z >= 0 && X < N && Z < N && VEG[Z * N + X] === V.WATER) n++; }
    if (n >= 62) G.lakes.push(i);
  }
  if (G.lakes.length < 5) G.lakes = G.waterCells.slice();
  // tendido eléctrico: desde el borde del mapa hasta dos pueblos
  const far2 = landB.filter(i => cheb(i, base) > 40); const start = far2.length ? far2[Math.floor(R() * far2.length)] : landB[landB.length - 1];
  const byD = c => G.towns.slice().sort((a, b) => cheb(a.cell, c) - cheb(b.cell, c));
  const tA = byD(start)[0], tB = byD(tA.cell).find(t => t !== tA);
  G.lines = []; G.lineMask = new Uint8Array(NN);
  const mk = (a, b, feeds) => {
    const seg = { id: G.lines.length, a, b, feeds, state: 'on', cells: line4(a, b).filter(c => G.towns.every(t => cheb(t.cell, c) > 5)) };
    seg.set = new Set(seg.cells);
    for (const c of seg.cells) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const X = cx(c) + dx, Z = cz(c) + dz; if (X >= 0 && Z >= 0 && X < N && Z < N) G.lineMask[Z * N + X] |= 1 << seg.id; }
    G.lines.push(seg);
  };
  mk(start, tA.cell, [tA.id, tB.id]); mk(tA.cell, tB.cell, [tB.id]);
  return true;
}

// ───────────── Construcción de la escena ─────────────
const lin = c => Math.pow(c, 2.2);
function disposeWorld() {
  world.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
  scene.remove(world); world = new THREE.Group(); scene.add(world);
}
function buildScene() {
  disposeWorld();
  // terreno
  const g = new THREE.PlaneGeometry((N - 1) * CELL, (N - 1) * CELL, N - 1, N - 1); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; for (let i = 0; i < NN; i++) pos.setY(i, H[i]);
  g.computeVertexNormals();
  cols = new Float32Array(NN * 3); glow = new Float32Array(NN);
  const nz = perlin(lastSeed + 99);
  for (let i = 0; i < NN; i++) {
    const c = VP[VEG[i]].col, x = cx(i), z = cz(i);
    const n = 1 + fbm(nz, x * .15, z * .15, 3) * .35 + (Math.random() - .5) * .06;
    let r = c[0] * n, gg = c[1] * n, b = c[2] * n;
    const ny = g.attributes.normal.getY(i);
    if (VEG[i] !== V.WATER && VEG[i] !== V.ROAD && ny < .82) { const k = smooth(.82, .6, ny); r = lerp(r, .46, k); gg = lerp(gg, .43, k); b = lerp(b, .39, k); }
    BC[i * 3] = lin(r); BC[i * 3 + 1] = lin(gg); BC[i * 3 + 2] = lin(b);
  }
  for (let i = 0; i < NN; i++) cellColor(i);
  colAttr = new THREE.BufferAttribute(cols, 3).setUsage(THREE.DynamicDrawUsage); g.setAttribute('color', colAttr);
  glowAttr = new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage); g.setAttribute('aGlow', glowAttr);
  const tm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0 });
  tm.onBeforeCompile = sh => {
    sh.uniforms.uTime = glowTime; sh.uniforms.uGlowK = glowK;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow=aGlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uTime;\nuniform float uGlowK;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(1.0,0.28,0.04)*vGlow*uGlowK*(1.0+0.35*sin(uTime*9.0+vViewPosition.x*0.4+vViewPosition.y*0.3));');
  };
  terrain = new THREE.Mesh(g, tm); terrain.receiveShadow = true; world.add(terrain);
  // agua
  const wm = new THREE.Mesh(new THREE.PlaneGeometry((N - 1) * CELL, (N - 1) * CELL).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a5d78, roughness: .12, metalness: .2, transparent: true, opacity: .86 }));
  wm.position.y = G.waterH; world.add(wm);
  // árboles
  buildTrees();
  // casas
  const nh = G.houses.length, dummy = new THREE.Object3D();
  houseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 3, 5).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ roughness: .85 }), nh);
  roofMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(3.7, 2.3, 4).rotateY(Math.PI / 4).scale(1, 1, 1.35).translate(0, 4.15, 0), new THREE.MeshStandardMaterial({ color: 0xa2482c, roughness: .8 }), nh);
  winMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(4.08, .7, 2.6).translate(0, 1.7, 0), new THREE.MeshBasicMaterial({ color: 0xffc36b, transparent: true, opacity: 0, fog: false }), nh);
  houseMesh.castShadow = roofMesh.castShadow = true; houseMesh.receiveShadow = true;
  G.houses.forEach((h, k) => {
    const x = wx(cx(h.cell)) + h.ox, z = wx(cz(h.cell)) + h.oz;
    dummy.position.set(x, hWorld(x, z) - .3, z); dummy.rotation.set(0, h.rot, 0); dummy.scale.setScalar(h.town < 0 ? 1.2 : 1); dummy.updateMatrix();
    houseMesh.setMatrixAt(k, dummy.matrix); roofMesh.setMatrixAt(k, dummy.matrix); winMesh.setMatrixAt(k, dummy.matrix); h.mat = dummy.matrix.clone();
    const w = new THREE.Color().setHSL(.1, .25, .78 + Math.random() * .12); houseMesh.setColorAt(k, w);
    h.pos = dummy.position.clone();
  });
  world.add(houseMesh, roofMesh, winMesh);
  // base de bomberos
  const bp = cellWorld(G.base);
  const st = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 9).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: 0xd9d4cb }));
  const sr = new THREE.Mesh(new THREE.BoxGeometry(12.6, 1, 9.6).translate(0, 6.5, 0), new THREE.MeshStandardMaterial({ color: 0xb3122a }));
  const bg = new THREE.Group(); bg.add(st, sr); st.castShadow = true; bg.position.copy(bp); bg.position.x += CELL * 1.5; world.add(bg);
  // granjas
  stockMeshes = G.farms.map(f => {
    const fp = cellWorld(f.cell), grp = new THREE.Group(); grp.position.copy(fp);
    const fm = new THREE.MeshStandardMaterial({ color: 0x6b4a2f });
    for (const [x, z, w, d] of [[0, -7, 14, .4], [0, 7, 14, .4], [-7, 0, .4, 14], [7, 0, .4, 14]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d).translate(0, .6, 0), fm); b.position.set(x, 0, z); grp.add(b); }
    const barn = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 8).translate(0, 2, 0), new THREE.MeshStandardMaterial({ color: 0x8e2f22 })); barn.position.set(-10, hWorld(fp.x - 10, fp.z) - fp.y, 0); barn.castShadow = true; grp.add(barn);
    const geo = f.kind === 'ovejas' ? new THREE.BoxGeometry(1.1, 1, 1.7).translate(0, .8, 0) : new THREE.BoxGeometry(1.5, 1.5, 2.6).translate(0, 1.1, 0);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 1 }), f.n);
    f.anim = [];
    for (let k = 0; k < f.n; k++) { const a = { x: rr(-5, 5), z: rr(-5, 5), r: R() * 6 }; f.anim.push(a); im.setColorAt(k, new THREE.Color(f.kind === 'ovejas' ? 0xeeeae0 : (k % 2 ? 0x2b2622 : 0xe8e2d8))); }
    im.castShadow = true; grp.add(im); world.add(grp); f.mesh = im; f.grp = grp;
    return im;
  });
  // fauna, coches
  wildMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, 1.3, 2.1).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ roughness: 1 }), G.wild.length);
  G.wild.forEach((a, k) => wildMesh.setColorAt(k, new THREE.Color(a.deer ? 0x8a5a32 : 0x3a2c22)));
  world.add(wildMesh);
  carMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.4, 3.8).translate(0, .9, 0), new THREE.MeshStandardMaterial({ roughness: .4, metalness: .4 }), 120);
  for (let k = 0; k < 120; k++) { carMesh.setColorAt(k, new THREE.Color().setHSL(Math.random(), .5, .45)); }
  carMesh.count = 0; world.add(carMesh);
  // anillos de selección
  selRing = new THREE.Mesh(new THREE.RingGeometry(6, 7.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: .9, depthTest: false }));
  destRing = new THREE.Mesh(new THREE.RingGeometry(3, 4, 30).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: .8, depthTest: false }));
  selRing.renderOrder = destRing.renderOrder = 10; selRing.visible = destRing.visible = false; world.add(selRing, destRing);
  // líneas de cortafuegos (vista previa y planificadas)
  const mkLine = (n, col, seg) => { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)); const L = new (seg ? THREE.LineSegments : THREE.Line)(g2, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: .9, depthTest: false })); L.renderOrder = 11; L.frustumCulled = false; L.visible = false; world.add(L); return L; };
  previewLine = mkLine(MAXCUT + 2, 0xffb347); planLine = mkLine(MAXCUT * 2 * 6, 0xffe08a, true);
  // tendido eléctrico
  const pyl = [];
  for (const s of G.lines) {
    const A = cellWorld(s.a), B = cellWorld(s.b), len = Math.hypot(B.x - A.x, B.z - A.z), n = Math.max(2, Math.round(len / 50)), th = Math.atan2(B.x - A.x, B.z - A.z);
    s.pylons = [];
    for (let k = 0; k <= n; k++) {
      const x = lerp(A.x, B.x, k / n), z = lerp(A.z, B.z, k / n), c = clamp(Math.round((z + HALF) / CELL), 0, N - 1) * N + clamp(Math.round((x + HALF) / CELL), 0, N - 1);
      if (VEG[c] === V.WATER || G.towns.some(t => cheb(t.cell, c) < 5)) continue;
      const p = new THREE.Vector3(x, hWorld(x, z) - .3, z); s.pylons.push(p); pyl.push([p, th]);
    }
    s.labelPos = s.pylons[Math.floor(s.pylons.length / 2)] || A;
    const wp = [], px = Math.cos(th), pz = -Math.sin(th);
    for (let k = 0; k < s.pylons.length - 1; k++) {
      const P = s.pylons[k], Q = s.pylons[k + 1], span = P.distanceTo(Q), sag = span * .045;
      for (const o of [-3.6, 0, 3.6]) for (let j = 0; j < 10; j++) {
        for (const t of [j / 10, (j + 1) / 10]) wp.push(lerp(P.x, Q.x, t) + px * o, lerp(P.y, Q.y, t) + 18.6 + (o ? 0 : 2) - 4 * sag * t * (1 - t), lerp(P.z, Q.z, t) + pz * o);
      }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    s.wire = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x23262a })); world.add(s.wire);
  }
  const pm = new THREE.MeshStandardMaterial({ color: 0x7a7f84, metalness: .6, roughness: .5, flatShading: true });
  const tower = new THREE.InstancedMesh(new THREE.CylinderGeometry(.45, 1.9, 21, 4).translate(0, 10.5, 0), pm, pyl.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(9, .5, .5).translate(0, 18.8, 0), pm, pyl.length);
  const top = new THREE.InstancedMesh(new THREE.BoxGeometry(4, .5, .5).translate(0, 20.8, 0), pm, pyl.length);
  pyl.forEach(([p, th], k) => { dummy.position.copy(p); dummy.rotation.set(0, th, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); tower.setMatrixAt(k, dummy.matrix); arm.setMatrixAt(k, dummy.matrix); top.setMatrixAt(k, dummy.matrix); });
  tower.castShadow = true; world.add(tower, arm, top);
  // unidades
  for (const u of G.units) { u.mesh = makeVehicle(u.type); world.add(u.mesh); }
  // nubes
  clouds.n = 0;
  for (let k = 0; k < 70; k++) clouds.add(rr(-HALF * 1.4, HALF * 1.4), rr(330, 420), rr(-HALF * 1.4, HALF * 1.4), 0, 0, 0, 1e9, rr(220, 380), rr(220, 380), [1, 1, 1], [1, 1, 1], 1);
}
function buildTrees() {
  const list = { pine: [], oak: [], shrub: [] };
  cellTrees = new Array(NN);
  for (let i = 0; i < NN; i++) {
    const v = VEG[i]; let k = 0, type = null;
    if (v === V.PINE) { type = 'pine'; k = R() < .85 ? 2 : 1; } else if (v === V.OAK) { type = 'oak'; k = R() < .6 ? 2 : 1; } else if (v === V.SHRUB) { type = 'shrub'; k = R() < .6 ? 2 : 1; } else if (v === V.GRASS && R() < .05) { type = 'shrub'; k = 1; }
    for (let j = 0; j < k; j++) list[type].push(i);
  }
  const defs = {
    pine: { geo: new THREE.ConeGeometry(2.3, 9, 7).translate(0, 6.4, 0), col: [.16, .27, .14] },
    oak: { geo: new THREE.IcosahedronGeometry(3.3, 1).scale(1, .82, 1).translate(0, 5.6, 0), col: [.24, .34, .15] },
    shrub: { geo: new THREE.IcosahedronGeometry(1.6, 0).scale(1, .7, 1).translate(0, .9, 0), col: [.33, .36, .19] },
  };
  trees = [];
  const trunkCells = [];
  const dummy = new THREE.Object3D(), c = new THREE.Color();
  for (const t of ['pine', 'oak', 'shrub']) {
    const cells = list[t], d = defs[t];
    const m = new THREE.InstancedMesh(d.geo, new THREE.MeshStandardMaterial({ roughness: .9, flatShading: true }), cells.length);
    m.castShadow = true; m.receiveShadow = true;
    const xf = [];
    cells.forEach((cell, k) => {
      const x = wx(cx(cell)) + rr(-2.6, 2.6), z = wx(cz(cell)) + rr(-2.6, 2.6), s = rr(.75, 1.3);
      dummy.position.set(x, hWorld(x, z) - .4, z); dummy.rotation.set(0, R() * 6.28, 0); dummy.scale.set(s, s * rr(.85, 1.2), s); dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix); xf.push(dummy.matrix.clone());
      const n = rr(.82, 1.15); c.setRGB(d.col[0] * n, d.col[1] * n, d.col[2] * n, THREE.SRGBColorSpace); m.setColorAt(k, c);
      (cellTrees[cell] ||= []).push([trees.length, k, t !== 'shrub' ? trunkCells.length : -1]);
      if (t !== 'shrub') trunkCells.push(dummy.matrix.clone());
    });
    trees.push({ mesh: m, base: d.col, xf }); world.add(m);
  }
  const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(.35, .5, 3, 5).translate(0, 1.4, 0), new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), trunkCells.length);
  trunkCells.forEach((mx, k) => tr.setMatrixAt(k, mx)); world.add(tr); trunkMesh = tr;
}
// talar una celda (cortafuegos): se quitan árboles y tocones y queda tierra
function clearTrees(i) {
  const L = cellTrees[i]; if (!L) return;
  for (const [t, k, tk] of L) { const T = trees[t]; T.mesh.setMatrixAt(k, ZERO4); T.xf[k] = ZERO4.clone(); T.mesh.instanceMatrix.needsUpdate = true; if (tk >= 0) { trunkMesh.setMatrixAt(tk, ZERO4); trunkMesh.instanceMatrix.needsUpdate = true; } }
  cellTrees[i] = null;
}
function makeBreak(i) {
  VEG[i] = V.BREAK; FUEL[i] = 0; if (STATE[i] === 3) STATE[i] = 0; clearTrees(i);
  const c = VP[V.BREAK].col, n = .9 + Math.random() * .15; BC[i * 3] = lin(c[0] * n); BC[i * 3 + 1] = lin(c[1] * n); BC[i * 3 + 2] = lin(c[2] * n);
  changed.push(i); G.stats.breaks++;
}
function makeVehicle(type) {
  const g = new THREE.Group();
  const M = (c, e) => new THREE.MeshStandardMaterial({ color: c, roughness: .45, metalness: .3, emissive: e || 0 });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  const glass = M(0x1b1f2a);
  if (type === 'heli') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 10).scale(1, .9, 1.9), M(0xc8102e)); body.position.y = 2.2; body.castShadow = true; g.add(body);
    const win = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8).scale(1.05, .8, 1), glass); win.position.set(0, 2.6, 2); g.add(win);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(.25, .5, 6, 8).rotateX(Math.PI / 2), M(0xf2f2f2)); tail.position.set(0, 2.6, -5.2); g.add(tail);
    box(.2, 1.6, 1, M(0xc8102e), 0, 3.2, -8);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(.1, 2.2, .3), M(0x222222)); tr.position.set(.35, 3.2, -8); g.add(tr); g.userData.tailRotor = tr;
    box(.25, .25, 4.5, M(0x333333), -1.3, .25, 0); box(.25, .25, 4.5, M(0x333333), 1.3, .25, 0);
    const rotor = new THREE.Group(); rotor.position.y = 4.1; for (const r of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(15, .08, .55), M(0x1a1a1a)); b.rotation.y = r; rotor.add(b); } g.add(rotor); g.userData.rotor = rotor;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(.9, .6, 1.2, 10), M(0xe06a1a)); bucket.position.y = -4.5; g.add(bucket);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 5, 4), M(0x111111)); rope.position.y = -1.6; g.add(rope);
    g.userData.light = box(.4, .3, .4, new THREE.MeshBasicMaterial({ color: 0xff2a3a }), 0, 3.6, -1);
    g.scale.setScalar(1.6); return g;
  }
  if (type === 'avion') {
    const Y = M(0xf3c316), Rr = M(0xc8102e);
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(1.2, .7, 14, 12).rotateX(Math.PI / 2), Y); fus.position.set(0, 3, 0); fus.castShadow = true; g.add(fus);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8).scale(1, 1, 1.4), Y); nose.position.set(0, 3, 7); g.add(nose);
    box(.1, .9, 3, Rr, 1.15, 3, 2); box(.1, .9, 3, Rr, -1.15, 3, 2);
    const wing = box(24, .35, 3, Y, 0, 4.4, 1.2); wing.castShadow = true;
    box(8, .25, 2, Y, 0, 3.4, -6.2); box(.25, 3.2, 2.2, Rr, 0, 5, -6.4);
    box(.9, .9, 7, M(0xdddddd), -3, .6, 1.5); box(.9, .9, 7, M(0xdddddd), 3, .6, 1.5);
    box(.2, 2.8, .2, M(0x555555), -3, 2, 1.5); box(.2, 2.8, .2, M(0x555555), 3, 2, 1.5);
    for (const x of [-5, 5]) { const pr = new THREE.Mesh(new THREE.BoxGeometry(.2, 3.4, .25), M(0x1a1a1a)); pr.position.set(x, 4.4, 3.1); g.add(pr); (g.userData.props ||= []).push(pr); }
    g.userData.light = box(.4, .3, .4, new THREE.MeshBasicMaterial({ color: 0xff2a3a }), 0, 6.7, -6.4);
    g.scale.setScalar(1.6); return g;
  }
  if (type === 'bomba') {
    box(2.6, 2.2, 5, M(0xc8102e), 0, 1.9, -.6); box(2.6, 1.9, 2, M(0xd81b34), 0, 1.75, 2.6); box(2.62, .25, 7, M(0xf2f2f2), 0, 1.4, 0);
    box(2.2, .6, 1.4, glass, 0, 2.3, 3.2);
  } else if (type === 'brigada') {
    box(2.4, 1.6, 2.2, M(0x2d6a3e), 0, 1.7, 1.8); box(2.1, .6, 1.2, glass, 0, 2.2, 2.4); box(2.4, .8, 3, M(0x2d6a3e), 0, 1.2, -1);
    box(2.42, .2, 5.2, M(0xf3c316), 0, 1.6, .3);
    for (const [x, z] of [[-.6, -.6], [.6, -1.6]]) box(.6, 1.2, .5, M(0xf08a1c), x, 2.2, z); // operarios con chaleco
  } else if (type === 'bulldozer') {
    const Y = M(0xf2b705);
    box(2.8, 1.6, 4.4, Y, 0, 1.9, -.2); box(2, 1.8, 1.8, Y, 0, 3.5, -.8); box(1.8, 1, 1.6, glass, 0, 3.7, -.8);
    box(1, 1, 5, M(0x1c1c1c), -1.7, .6, -.2); box(1, 1, 5, M(0x1c1c1c), 1.7, .6, -.2);
    box(4.4, 1.6, .35, M(0x6b6e70), 0, 1, 2.8);
  } else {
    box(2.6, 2.6, 5, M(0x2f6d3a), 0, 2.2, -.8); box(2.6, 1.9, 2, M(0xe8e8e8), 0, 1.75, 2.6); box(2.2, .6, 1.4, glass, 0, 2.3, 3.2);
  }
  if (type !== 'bulldozer') {
    const wm = M(0x111111);
    for (const [x, z] of [[-1.3, -2], [1.3, -2], [-1.3, 2.4], [1.3, 2.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .5, 10).rotateZ(Math.PI / 2), wm); w.position.set(x, .6, z); g.add(w); }
  }
  const lb = box(type === 'bulldozer' ? .5 : 1.6, .3, .4, new THREE.MeshBasicMaterial({ color: 0x2a6bff }), 0, type === 'bulldozer' ? 4.55 : 2.85, type === 'bulldozer' ? -.8 : 2.6); g.userData.light = lb;
  g.scale.setScalar(1.5);
  return g;
}

// ───────────── Colores del terreno ─────────────
function cellColor(i) {
  const s = STATE[i], i3 = i * 3; let r, g, b;
  if (s === 2) { r = .022; g = .019; b = .017; }
  else if (s === 1) { r = .03; g = .018; b = .012; }
  else { r = BC[i3]; g = BC[i3 + 1]; b = BC[i3 + 2]; if (s === 3) { r = r * .3 + .02; g = g * .26 + .015; b = b * .24 + .012; } }
  const w = Math.min(1, WET[i]); if (w > 0 && VEG[i] !== V.WATER) { r *= 1 - w * .45; g *= 1 - w * .38; b *= 1 - w * .2; }
  cols[i3] = r; cols[i3 + 1] = g; cols[i3 + 2] = b;
}
function treeState(i) {
  const L = cellTrees[i]; if (!L) return; const s = STATE[i]; const c = new THREE.Color(); const m4 = new THREE.Matrix4(), sc = new THREE.Matrix4();
  for (const [t, k] of L) {
    const T = trees[t];
    if (s === 2) { c.setRGB(.03, .025, .02); sc.makeScale(.62, .8, .62); m4.copy(T.xf[k]).multiply(sc); T.mesh.setMatrixAt(k, m4); T.mesh.instanceMatrix.needsUpdate = true; }
    else if (s === 1) c.setRGB(.07, .025, .01);
    else if (s === 3) c.setRGB(.09, .07, .05);
    else continue;
    T.mesh.setColorAt(k, c); T.mesh.instanceColor.needsUpdate = true;
  }
}

// ───────────── Clima ─────────────
const WX = {};
function initWeather() {
  const L = G.L;
  Object.assign(WX, { time: L.hour * 60, wind: R() * Math.PI * 2, windT: 0, wsBase: L.wind, ws: L.wind, gust: 0, cloud: .15, cloudT: .15, rain: 0, rainT: 0, hum: .3, temp: 30, nextFront: rr(70, 120), nextRolada: L.rolada * rr(.8, 1.2), roladaWarned: false, roladaDir: 0, storm: false, flash: 0, t: 0, front: 'Despejado' });
  WX.windT = WX.wind;
}
const sunElev = () => Math.sin(((WX.time / 60 % 24) - 6) / 12 * Math.PI);
const dirName = a => DIRS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
function weatherStep(dt) {
  const L = G.L; WX.t += dt; WX.time += dt * 2;
  WX.nextFront -= dt;
  if (WX.nextFront <= 0) {
    WX.nextFront = rr(70, 140); const r = R();
    if (r < L.rain) { WX.cloudT = .9; WX.rainT = rr(.5, 1); WX.storm = false; WX.front = 'Lluvia'; log('🌧️ Se acerca un frente de lluvia.', 'info'); }
    else if (L.storm && r < L.rain + .25) { WX.cloudT = .8; WX.rainT = 0; WX.storm = true; WX.front = 'Tormenta seca'; log('⛈️ Tormenta seca: riesgo de rayos y nuevos focos.', 'warn'); }
    else if (r < .7) { WX.cloudT = rr(.35, .65); WX.rainT = 0; WX.storm = false; WX.front = 'Nuboso'; }
    else { WX.cloudT = rr(0, .2); WX.rainT = 0; WX.storm = false; WX.front = 'Despejado'; }
  }
  WX.cloud += (WX.cloudT - WX.cloud) * dt * .04;
  WX.rain += ((WX.cloud > .6 ? WX.rainT : 0) - WX.rain) * dt * .05;
  if (WX.rain > .3 && WX.rainT > 0 && R() < dt / 90) { WX.rainT = 0; WX.cloudT = .4; WX.front = 'Nuboso'; }
  // rolada de viento con aviso
  WX.nextRolada -= dt;
  if (WX.nextRolada < 15 && !WX.roladaWarned) { WX.roladaWarned = true; WX.roladaDir = WX.windT + (R() < .5 ? 1 : -1) * rr(.8, 2.2); log(`⚠️ Previsión: en 15 s el viento rolará y soplará del ${dirName(WX.roladaDir + Math.PI)}.`, 'warn'); }
  if (WX.nextRolada <= 0) { WX.windT = WX.roladaDir; WX.nextRolada = L.rolada * rr(.7, 1.3); WX.roladaWarned = false; WX.gust = WX.wsBase * .5; log(`💨 ¡Rolada! Ahora el viento sopla del ${dirName(WX.windT + Math.PI)}.`, 'bad'); }
  WX.windT += (R() - .5) * .03 * dt;
  let da = WX.windT - WX.wind; da = Math.atan2(Math.sin(da), Math.cos(da)); WX.wind += da * dt * .12;
  if (R() < dt * .015) WX.gust = WX.wsBase * rr(.3, .7);
  WX.gust *= Math.exp(-dt * .15);
  WX.ws = Math.max(2, WX.wsBase * (1 + .25 * Math.sin(WX.t * .07) + .12 * Math.sin(WX.t * .31)) + WX.gust - WX.rain * 8);
  const e = sunElev(), night = 1 - smooth(-.12, .15, e);
  WX.hum = clamp((1 - L.drought) * .5 + night * .22 + WX.rain * .5 + WX.cloud * .08, .05, 1);
  WX.temp = 17 + L.drought * 19 + Math.max(0, e) * 7 - night * 9 - WX.rain * 7 - WX.cloud * 3;
  WX.flash *= Math.exp(-dt * 6);
  if (WX.storm && WX.cloud > .6 && R() < dt / 35) lightning();
}
function lightning() {
  WX.flash = 1;
  for (let k = 0; k < 60; k++) {
    const c = Math.floor(R() * NN);
    if (![V.PINE, V.SHRUB, V.OAK, V.GRASS].includes(VEG[c]) || STATE[c] !== 0) continue;
    if (G.towns.some(t => cheb(t.cell, c) < 12) || G.houses.some(h => cheb(h.cell, c) < 6)) continue;
    if (R() < .55) { ignite(c); log(`⚡ Un rayo ha provocado un nuevo foco cerca de ${nearestPlace(c)}.`, 'bad'); }
    else log('⚡ Ha caído un rayo, pero no ha prendido.', 'info');
    return;
  }
}
function nearestPlace(c) { let best = null, bd = 1e9; for (const t of G.towns) { const d = cheb(t.cell, c); if (d < bd) { bd = d; best = t.name; } } return best; }

// ───────────── Fuego ─────────────
function ignite(i) {
  if (STATE[i] === 1 || VP[VEG[i]].spread <= 0 || FUEL[i] < .05) return false;
  STATE[i] = 1; BT[i] = 0; INT[i] = .1; burning.push(i); changed.push(i);
  if (!AFF[i]) { AFF[i] = 1; G.stats.cells++; addDamage(VP[VEG[i]].dmg); }
  else if (G.t > 5) G.stats.rekindle++;
  return true;
}
function addDamage(e) { G.damage += e; if (G.damage > G.limit && !G.over) endGame(false, `Los daños materiales y económicos han superado el límite del nivel (${money(G.limit)}).`); }
function fireStep(dt) {
  const wsm = WX.ws / 3.6, wvx = Math.sin(WX.wind), wvz = -Math.cos(WX.wind);
  const dryG = clamp(1 - WX.hum * .85, .05, 1) * (.55 + G.L.drought * .6);
  const K = .34 * G.L.k * (G.tut ? .55 : 1);
  for (let k = burning.length - 1; k >= 0; k--) {
    const i = burning[k], vp = VP[VEG[i]];
    BT[i] += dt; const ph = BT[i] / vp.burn;
    if (WX.rain > .05) WET[i] += WX.rain * .03 * dt;
    let env = ph < .12 ? .3 + ph / .12 * .7 : Math.max(0, 1 - (ph - .12) / .88);
    env *= Math.max(0, 1 - WET[i] * 1.15);
    INT[i] = env;
    if (WET[i] > .85 || (ph > .25 && env < .03)) {
      STATE[i] = 3; FUEL[i] *= Math.max(0, 1 - ph); INT[i] = 0; burning[k] = burning[burning.length - 1]; burning.pop(); changed.push(i);
      if (ph >= 1 || FUEL[i] < .05) STATE[i] = 2;
      continue;
    }
    if (ph >= 1) { STATE[i] = 2; FUEL[i] = 0; INT[i] = 0; burning[k] = burning[burning.length - 1]; burning.pop(); changed.push(i); continue; }
    const x = cx(i), z = cz(i);
    for (let d = 0; d < 8; d++) {
      const nx = x + DX8[d], nz = z + DZ8[d]; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const n = nz * N + nx, s = STATE[n]; if (s === 1 || s === 2) continue;
      const sp = VP[VEG[n]].spread; if (!sp || FUEL[n] < .05) continue;
      const dry = dryG * (1 - MOI[n] * .45) - WET[n] * 1.5; if (dry <= 0) continue;
      const cosA = (DX8[d] * wvx + DZ8[d] * wvz) / DL8[d];
      const W = Math.exp(.15 * wsm * cosA);
      const Sl = clamp(Math.exp(1.6 * (H[n] - H[i]) / (CELL * DL8[d])), .35, 4);
      const rate = K * sp * env * W * Sl * dry * (s === 3 ? FUEL[n] : 1) / DL8[d];
      if (R() < rate * dt) ignite(n);
    }
    // pavesas
    if (vp.spot && wsm > 4.5 && R() < dt * .007 * vp.spot * env * (wsm / 8) ** 2 * dryG) {
      const dist = 3 + R() * wsm * .9, a = WX.wind + (R() - .5) * .7;
      const tx = Math.round(x + Math.sin(a) * dist), tz = Math.round(z - Math.cos(a) * dist);
      if (tx >= 0 && tz >= 0 && tx < N && tz < N) {
        const n = tz * N + tx;
        for (let e = 0; e < 6; e++) flames.add(wx(x), H[i] + 12, wx(z), Math.sin(a) * wsm * 2 + rr(-3, 3), rr(8, 14), -Math.cos(a) * wsm * 2 + rr(-3, 3), rr(1.5, 3), 1.2, .6, [1, .8, .4], [1, .3, .05], 1);
        if (STATE[n] === 0 && VP[VEG[n]].spread && R() < dryG * (1 - MOI[n] * .4)) { if (ignite(n) && !G.spotWarned) { G.spotWarned = true; log('🔥 ¡Las pavesas han saltado y abierto un foco secundario por delante del frente!', 'bad'); } }
      }
    }
  }
}
function computeDist() {
  DIST.fill(255); const q = new Int32Array(NN); let h = 0, t = 0;
  for (const i of burning) { DIST[i] = 0; q[t++] = i; }
  while (h < t) { const c = q[h++], d = DIST[c]; if (d >= 60) continue; const x = cx(c), z = cz(c); for (let k = 0; k < 4; k++) { const nx = x + DX8[k], nz = z + DZ8[k]; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const n = nz * N + nx; if (DIST[n] > d + 1) { DIST[n] = d + 1; q[t++] = n; } } }
}
function slowTick() {
  computeDist();
  const ev = .012 + Math.max(0, WX.temp - 20) * .0006 - WX.rain * .02;
  for (let i = 0; i < NN; i++) if (WET[i] > 0) { WET[i] = Math.max(0, WET[i] - ev); changed.push(i); }
  // avisos
  for (const t of G.towns) {
    const d = Math.min(...t.houses.filter(h => h.state !== 'destroyed').map(h => DIST[h.cell]).concat([255]));
    if (!t.alarm && d < 24 && t.warned < 1) { t.warned = 1; log(`🚨 El fuego está a menos de 700 m de <b>${t.name}</b>. ¡Activa la alarma de evacuación!`, 'bad'); }
    if (!t.alarm && d < 10 && t.warned < 2) { t.warned = 2; log(`🚨 ¡El fuego entra en <b>${t.name}</b> y la gente sigue en sus casas!`, 'bad'); }
  }
  for (const h of G.houses) if (h.town < 0 && h.people > 0 && DIST[h.cell] < 26 && !h.warned) { h.warned = 1; log(`🏠 Hay ${h.people} personas en <b>${h.name}</b> y el fuego se acerca. Envía un vehículo a avisarles.`, 'warn'); }
  for (const f of G.farms) if (f.state === 'waiting' && DIST[f.cell] < 26 && !f.warned) { f.warned = 1; log(`🐑 El fuego amenaza <b>${f.name}</b> (${f.n} ${f.kind}). Manda el camión de ganado.`, 'warn'); }
  linesTick();
  // medios aéreos: noche y viento
  const gr = airGrounded(false);
  if (G.units.some(u => u.air) && gr !== G.airGr) {
    if (gr === 'noche') log(`🌙 Anochece: ${own('nvg') ? 'el hidroavión vuelve a la base (los helicópteros siguen con NVG).' : 'los medios aéreos vuelven a la base hasta el amanecer.'}`, 'warn');
    else if (gr === 'viento') log('💨 Viento de más de 60 km/h: los medios aéreos no pueden volar.', 'warn');
    else if (G.airGr) log('🚁 Los medios aéreos ya pueden volver a despegar.', 'ok');
    G.airGr = gr;
  }
  if (burning.length === 0 && G.t > 5 && !G.houses.some(h => h.state === 'burning')) endGame(true);
}

// ───────────── Tendido eléctrico ─────────────
function linesTick() {
  for (const s of G.lines) {
    if (s.state === 'broken') continue;
    let hit = -1; for (const c of s.cells) if (STATE[c] === 1 && INT[c] > .45) { hit = c; break; }
    if (hit >= 0) {
      const was = s.state; s.state = 'broken'; s.wire.visible = false; addDamage(300000); updatePower();
      if (was === 'on') {
        let n = 0; for (let k = 0; k < 30 && n < 2; k++) { const c = hit + Math.round(rr(-4, 4)) * N + Math.round(rr(-4, 4)); if (c >= 0 && c < NN && STATE[c] === 0 && ignite(c)) n++; }
        log(`⚡ ¡El fuego ha derribado la línea de alta tensión! Los cables con corriente han provocado ${n ? 'nuevos focos' : 'chispazos'}. ${s.feeds.map(t => G.towns[t].name).join(' y ')} sin luz.`, 'bad');
      } else log('⚡ El fuego ha derribado la línea eléctrica (ya estaba sin tensión).', 'warn');
      continue;
    }
    // chispazos con viento fuerte
    if (s.state === 'on' && WX.ws > 32 && R() < .0025 * (WX.ws - 32) / 10 * (.5 + G.L.drought)) {
      const cand = s.cells.filter(c => STATE[c] === 0 && VP[VEG[c]].spread > 0);
      if (cand.length) { const c = cand[Math.floor(R() * cand.length)]; if (ignite(c)) { const p = cellWorld(c); for (let e = 0; e < 25; e++) flames.add(p.x, p.y + 18, p.z, rr(-6, 6), rr(-4, 4), rr(-6, 6), rr(.5, 1.2), 1.4, .4, [1, 1, .8], [1, .5, .1], 1); log('⚡ Las rachas han hecho chocar los cables del tendido eléctrico: ¡un chispazo ha provocado un foco nuevo!', 'bad'); } }
    }
  }
  for (const t of G.towns) if (!t.powered) addDamage(400);
}
function updatePower() {
  for (const t of G.towns) {
    const p = G.lines.filter(s => s.feeds.includes(t.id)).every(s => s.state === 'on');
    if (p === t.powered) continue; t.powered = p;
    for (const h of t.houses) if (h.state !== 'destroyed') winMesh.setMatrixAt(h.id, p ? h.mat : ZERO4);
    winMesh.instanceMatrix.needsUpdate = true;
  }
}
function cutPower(s, on) {
  if (s.state === 'broken') return;
  if (!on) for (const u of G.units) if (u.task.blocked != null) { u.task = { type: 'drop', target: u.task.blocked }; u.status = 'Hacia la descarga'; }
  if (on) { s.state = 'on'; log('⚡ Se ha restablecido la tensión en la línea.', 'info'); }
  else { s.state = 'off'; addDamage(50000); log(`🔌 La compañía eléctrica ha cortado la tensión. ${s.feeds.map(t => G.towns[t].name).join(' y ')} se quedan sin luz, pero ya se puede descargar agua cerca de los cables.`, 'info'); }
  updatePower(); renderPanel();
}
const lineLive = c => { const m = G.lineMask[c]; if (!m) return false; for (const s of G.lines) if ((m >> s.id) & 1 && s.state === 'on') return true; return false; };

// ───────────── Casas, coches, fauna ─────────────
function housesStep(dt) {
  for (const h of G.houses) {
    if (h.state === 'destroyed') continue;
    const c = h.cell;
    if (h.state !== 'burning') {
      let heat = 0; const x = cx(c), z = cz(c);
      for (let d = -1; d < 8; d++) { const n = d < 0 ? c : (z + DZ8[d]) * N + x + DX8[d]; if (n >= 0 && n < NN && STATE[n] === 1) heat += INT[n] * (d < 0 ? 1 : .35); }
      if (heat > .3 && WET[c] < .4 && R() < dt * heat * .25) {
        h.state = 'burning'; h.t = 0; h.ignitedPeople = h.people;
        if (h.people > 0) { G.stats.victims += h.people; endGame(false, `Ha ardido una casa ${h.town >= 0 ? 'de ' + G.towns[h.town].name : '(' + h.name + ')'} con ${h.people} personas dentro. No se activó la evacuación a tiempo.`); return; }
        log(`🏚️ Arde una casa ${h.town >= 0 ? 'en ' + G.towns[h.town].name : '(' + h.name + ')'}.`, 'bad');
      }
    } else {
      h.t += dt;
      if (WET[c] > .7) { h.state = 'damaged'; addDamage(40000); log('💧 Los bomberos han salvado una casa en llamas.', 'ok'); continue; }
      if (R() < dt * 3) for (let k = 0; k < 3; k++) flames.add(h.pos.x + rr(-2, 2), h.pos.y + rr(2, 5), h.pos.z + rr(-2, 2), 0, rr(4, 8), 0, rr(.6, 1.2), rr(5, 8), 2, [1, .85, .45], [1, .25, .05], .9);
      if (R() < dt * 1.5) smoke.add(h.pos.x, h.pos.y + 6, h.pos.z, 0, rr(3, 5), 0, rr(10, 16), 8, 30, [.15, .14, .14], [.3, .3, .3], .5);
      if (h.t > 30) { h.state = 'destroyed'; G.stats.houses++; addDamage(180000); const m = new THREE.Matrix4(); houseMesh.getMatrixAt(h.id, m); houseMesh.setColorAt(h.id, new THREE.Color(.05, .045, .04)); houseMesh.instanceColor.needsUpdate = true; const z0 = new THREE.Matrix4().makeScale(0, 0, 0); roofMesh.setMatrixAt(h.id, z0); winMesh.setMatrixAt(h.id, z0); roofMesh.instanceMatrix.needsUpdate = winMesh.instanceMatrix.needsUpdate = true; log(`🏚️ Una casa ${h.town >= 0 ? 'de ' + G.towns[h.town].name : '(' + h.name + ')'} ha quedado destruida.`, 'bad'); }
    }
  }
}
function activateAlarm(t) {
  if (t.alarm) return; t.alarm = true; addDamage(25000);
  // elige la salida más segura
  const safety = p => p.length ? Math.min(...p.map(c => DIST[c])) : -1;
  t.exit = safety(t.paths[0]) >= safety(t.paths[1]) ? 0 : 1;
  for (const h of t.houses) if (h.people > 0) h.leaveAt = G.t + rr(2, 22);
  log(`🚨 Alarma activada en <b>${t.name}</b>. Los vecinos evacúan por carretera.`, 'info');
}
function carsStep(dt) {
  for (const h of G.houses) if (h.leaveAt && G.t >= h.leaveAt && h.people > 0 && h.state !== 'destroyed') {
    const t = G.towns[h.town]; h.leaveAt = 0;
    const toC = astar(h.cell, i => i === t.cell, i => octile(i, t.cell), carCost, 3000) || [];
    G.cars.push({ path: toC.concat(t.paths[t.exit]), pi: 0, x: cx(h.cell), z: cz(h.cell), people: h.people, wait: 0, heading: 0 });
    h.people = 0;
  }
  for (let k = G.cars.length - 1; k >= 0; k--) {
    const c = G.cars[k];
    const cell = Math.round(c.z) * N + Math.round(c.x);
    if (STATE[cell] === 1 && INT[cell] > .35) { G.stats.victims += c.people; endGame(false, `El fuego ha alcanzado un coche de evacuados en la carretera (${c.people} víctimas). La salida quedó cortada.`); return; }
    if (c.pi >= c.path.length) { G.stats.evac += c.people; G.cars.splice(k, 1); continue; }
    const n = c.path[c.pi];
    if (STATE[n] === 1 && INT[n] > .1) { c.wait += dt; if (c.wait > 4) { c.wait = 0; const e = G.exits[0] === c.path[c.path.length - 1] ? G.exits[1] : G.exits[0]; const alt = astar(cell, i => i === e, i => octile(i, e), (a, b, d) => STATE[b] === 1 ? Infinity : carCost(a, b, d), 60000); if (alt) { c.path = alt; c.pi = 0; log('🚗 Carretera cortada por el fuego: los evacuados buscan otra salida.', 'warn'); } } continue; }
    const tx = cx(n), tz = cz(n), dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz), sp = 3.4 * dt;
    if (d <= sp) { c.x = tx; c.z = tz; c.pi++; } else { c.x += dx / d * sp; c.z += dz / d * sp; c.heading = Math.atan2(dx, dz); }
  }
}
function wildStep(dt) {
  for (const a of G.wild) {
    if (!a.alive) continue;
    const c = clamp(Math.round(a.z), 0, N - 1) * N + clamp(Math.round(a.x), 0, N - 1);
    if (STATE[c] === 1 && INT[c] > .25) { a.alive = false; G.stats.fauna++; if (!G.faunaWarned) { G.faunaWarned = true; log('🦌 Han muerto animales salvajes atrapados por el fuego.', 'warn'); } continue; }
    a.wait -= dt;
    const danger = DIST[c] < 13;
    if (a.wait <= 0) {
      if (danger) {
        let best = c, bd = DIST[c] + (R() * .5);
        for (let d = 0; d < 8; d++) { const nx = Math.round(a.x) + DX8[d] * 2, nz = Math.round(a.z) + DZ8[d] * 2; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const n = nz * N + nx; if (VEG[n] === V.WATER || STATE[n] === 1) continue; const s = DIST[n] + R() * .8; if (s > bd) { bd = s; best = n; } }
        a.tx = cx(best) + rr(-.4, .4); a.tz = cz(best) + rr(-.4, .4); a.sp = a.deer ? 2.4 : 1.8; a.wait = .4;
      } else { a.tx = a.x + rr(-2, 2); a.tz = a.z + rr(-2, 2); a.sp = .35; a.wait = rr(3, 8); }
    }
    const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
    if (d > .05) { const s = Math.min(d, a.sp * dt); a.x = clamp(a.x + dx / d * s, 0, N - 1); a.z = clamp(a.z + dz / d * s, 0, N - 1); a.h = Math.atan2(dx, dz); }
  }
  for (const f of G.farms) {
    if (f.state !== 'waiting') continue;
    let burnt = false; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const n = f.cell + dz * N + dx; if (STATE[n] === 1 && INT[n] > .3) burnt = true; }
    if (burnt) { f.state = 'dead'; G.stats.stockDead += f.n; addDamage(f.n * 1500); log(`💀 El fuego ha alcanzado <b>${f.name}</b>: han muerto ${f.n} ${f.kind}.`, 'bad'); for (let k = 0; k < f.n; k++) f.mesh.setColorAt(k, new THREE.Color(.04, .035, .03)); f.mesh.instanceColor.needsUpdate = true; }
  }
}

// ───────────── Unidades ─────────────
function newUnit(type, name, cell) {
  const wet = type === 'bomba' || type === 'heli' || type === 'avion', maxW = 100 * (1 + .25 * own('tank'));
  const u = { type, name, cell, x: cx(cell), z: cz(cell), heading: 0, path: null, pi: 0, task: { type: 'idle' }, water: wet ? maxW : 0, maxW, hp: 100, carry: 0, carryFarm: null, work: 0, sprayAt: -1, status: 'En la base' };
  if (AIR[type]) { u.air = true; u.home = cell; u.y = H[cell] + 2; u.task = { type: 'parked' }; }
  return u;
}
function setPath(u, path) { if (!path) return false; u.path = path; u.pi = 0; return true; }
function pathNear(u, target, r) {
  if (cheb(u.cell, target) <= r && STATE[u.cell] !== 1) { u.path = []; u.pi = 0; return true; }
  const foot = u.type === 'brigada';
  return setPath(u, astar(u.cell, i => cheb(i, target) <= r && STATE[i] !== 1 && VEG[i] !== V.WATER && (foot || VEG[i] !== V.ROCK), i => Math.max(0, octile(i, target) - r), costFor(u), 50000));
}
// ── Cortafuegos ──
function startCut(u, cells) {
  if (cells.length < 2) return;
  if (pathNear(u, cells[0], 1)) { u.task = { type: 'cut', cells, k: 0, gaps: 0 }; u.status = 'Hacia la línea de corte'; log(`${ICON[u.type]} ${u.name} va a abrir un cortafuegos de ${Math.round(cells.length * 30)} m.`, 'info'); }
  else log(`⛔ ${u.name}: no puede llegar al inicio de ese cortafuegos.`, 'warn');
}
function cutStep(u, T, arrived, dt) {
  if (!arrived) return;
  if (T.k >= T.cells.length) { u.task = { type: 'idle' }; u.status = 'Cortafuegos terminado'; log(`✅ ${u.name} ha terminado el cortafuegos${T.gaps ? ` (${T.gaps} tramos imposibles por la pendiente o el agua)` : ''}.`, 'ok'); return; }
  const c = T.cells[T.k];
  if (VP[VEG[c]].spread === 0 || STATE[c] === 2) { T.k++; return; }
  if (STATE[c] === 1) { u.task = { type: 'idle' }; u.status = 'El fuego ha alcanzado la línea'; log(`🔥 ${u.name}: el fuego ha llegado a la línea de corte antes de terminarla.`, 'warn'); return; }
  if (u.cell !== c) { const p = astar(u.cell, i => i === c, i => octile(i, c), costFor(u), 600); if (p && p.length <= 6) setPath(u, p); else { T.k++; T.gaps++; } return; }
  u.work += dt; u.status = `Abriendo cortafuegos · ${Math.round(T.k / T.cells.length * 100)} %`;
  if (R() < dt * 4) { const p = cellWorld(c); smoke.add(p.x + rr(-3, 3), p.y + 1, p.z + rr(-3, 3), rr(-1, 1), rr(1, 3), rr(-1, 1), rr(2, 4), 4, 14, [.55, .47, .36], [.62, .56, .48], .5); }
  if (u.work >= (u.type === 'bulldozer' ? .5 : 1.5)) { u.work = 0; makeBreak(c); T.k++; }
}
// ── Medios aéreos ──
function airGrounded(heli) { if (WX.ws > 60) return 'viento'; if (sunElev() < -.08 && !(heli && own('nvg'))) return 'noche'; return null; }
function nearestScoop(u, target) {
  const list = u.type === 'avion' ? G.lakes : G.waterCells; let best = null, bd = 1e9;
  for (const c of list) { const d = octile(u.cell, c) + octile(c, target); if (d < bd) { bd = d; best = c; } }
  return best;
}
function airOrder(u, c) {
  const g = airGrounded(u.type === 'heli');
  if (g) return log(`⛔ ${u.name} no puede despegar: ${g === 'noche' ? 'no hay vuelo nocturno' : 'el viento supera los 60 km/h'}.`, 'warn');
  if (VEG[c] === V.WATER) {
    if (u.type === 'avion' && !G.lakes.includes(c)) return log(`⛔ ${u.name} necesita un embalse grande para cargar agua.`, 'warn');
    u.task = { type: 'scoop', src: c, resume: null }; u.status = 'A cargar agua'; return;
  }
  const nb = findBurningNear(c, 4), target = nb >= 0 ? nb : c;
  if (u.water < u.maxW * .2) { u.task = { type: 'scoop', src: nearestScoop(u, target), resume: target }; u.status = 'A cargar agua'; }
  else { u.task = { type: 'drop', target }; u.status = 'Hacia la descarga'; }
}
function dropCells(u, t) {
  const out = new Set(), x0 = cx(t), z0 = cz(t), add = (x, z) => { x = Math.round(x); z = Math.round(z); if (x >= 0 && z >= 0 && x < N && z < N) out.add(z * N + x); };
  if (u.type === 'heli') { for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= 5) add(x0 + dx, z0 + dz); }
  else { const hx = Math.sin(u.heading), hz = Math.cos(u.heading); for (let s = -5; s <= 5; s++) for (let w = -1; w <= 1; w++) add(x0 + hx * s + hz * w, z0 + hz * s - hx * w); }
  return [...out];
}
function doDrop(u, T) {
  const cells = dropCells(u, T.target);
  if (cells.some(lineLive)) {
    u.task = { type: 'wait', blocked: T.target }; u.status = 'Esperando corte de tensión';
    log(`⚡ ${u.name} no puede descargar: hay una línea de alta tensión con corriente. Haz clic en la línea y pide el corte.`, 'warn'); return;
  }
  const k = (1 + .2 * own('ret')) * (u.water / u.maxW) * (u.type === 'heli' ? 1.2 : 1.1);
  for (const c of cells) { const d = Math.hypot(cx(c) - cx(T.target), cz(c) - cz(T.target)); WET[c] = Math.min(1.6, WET[c] + k * (u.type === 'heli' ? 1 - d * .15 : 1)); changed.push(c); }
  const y = u.y;
  for (const c of cells) for (let e = 0; e < 6; e++) water.add(wx(cx(c)) + rr(-3, 3), y - rr(2, 7), wx(cz(c)) + rr(-3, 3), rr(-2, 2), rr(-10, -3), rr(-2, 2), rr(.8, 1.3), 3, 10, [.82, .9, 1], [.95, .97, 1], .5);
  for (let e = 0; e < cells.length; e += 2) { const c = cells[e]; smoke.add(wx(cx(c)), H[c] + 3, wx(cz(c)), rr(-2, 2), rr(1, 3), rr(-2, 2), rr(4, 7), 8, 26, [.85, .88, .92], [.9, .92, .95], .45); }
  u.water = 0; G.stats.drops++;
  const nb = findBurningNear(T.target, 8);
  if (nb >= 0) { u.task = { type: 'scoop', src: nearestScoop(u, nb), resume: nb }; u.status = 'Rotación: a cargar agua'; }
  else { u.task = { type: 'wait' }; u.status = 'Descarga hecha · sin llamas cerca'; }
}
function airStep(u, dt) {
  const A = AIR[u.type], g = airGrounded(u.type === 'heli');
  if (g && u.task.type !== 'abase' && u.task.type !== 'parked') { u.task = { type: 'abase' }; u.status = g === 'noche' ? 'Vuelve a la base (noche)' : 'Vuelve a la base (viento)'; }
  const T = u.task; let tx = u.x, tz = u.z;
  if (T.type === 'drop') { tx = cx(T.target); tz = cz(T.target); }
  else if (T.type === 'scoop') { tx = cx(T.src); tz = cz(T.src); }
  else if (T.type === 'abase' || T.type === 'parked') { tx = cx(u.home); tz = cz(u.home); }
  const dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz), sp = A.sp * G.spd * dt;
  let arrived = d <= sp;
  if (T.type === 'wait' && u.type === 'avion') { u.heading += dt * .9; u.x = clamp(u.x + Math.sin(u.heading) * sp * .5, 2, N - 3); u.z = clamp(u.z + Math.cos(u.heading) * sp * .5, 2, N - 3); }
  else if (!arrived) { u.x += dx / d * sp; u.z += dz / d * sp; u.heading = Math.atan2(dx, dz); } else { u.x = tx; u.z = tz; }
  u.cell = clamp(Math.round(u.z), 0, N - 1) * N + clamp(Math.round(u.x), 0, N - 1);
  let alt = A.cruise, yAbs = null;
  switch (T.type) {
    case 'drop':
      if (d < 7) alt = A.low;
      if (arrived) doDrop(u, T);
      break;
    case 'scoop':
      if (d < 5) alt = A.low;
      if (arrived) {
        yAbs = G.waterH + (u.type === 'heli' ? 9 : 2.5); u.work += dt; u.status = 'Cargando agua';
        if (R() < dt * 8) { const p = cellWorld(T.src); for (let e = 0; e < 4; e++) water.add(p.x + rr(-3, 3), G.waterH + .5, p.z + rr(-3, 3), rr(-3, 3), rr(4, 9), rr(-3, 3), rr(.5, .9), 2, 5, [.85, .92, 1], [.95, .97, 1], .5); }
        if (u.work >= A.scoopT) {
          u.work = 0; u.water = u.maxW;
          if (T.resume == null) { u.task = { type: 'wait' }; u.status = 'Depósito lleno'; }
          else { const nb = findBurningNear(T.resume, 8); if (nb < 0 && STATE[T.resume] !== 1) { u.task = { type: 'wait' }; u.status = 'Depósito lleno · sin llamas'; } else { u.task = { type: 'drop', target: nb >= 0 ? nb : T.resume }; u.status = 'Hacia la descarga'; } }
        }
      }
      break;
    case 'abase':
      if (d < 4) alt = 8;
      if (arrived) { u.task = { type: 'parked' }; }
      break;
    case 'parked':
      yAbs = H[u.home] + .2; u.water = Math.min(u.maxW, u.water + 8 * dt);
      u.status = g ? (g === 'noche' ? 'En la base · sin vuelo nocturno' : 'En la base · viento') : 'En la base';
      break;
  }
  if (yAbs == null) {
    const hx = Math.sin(u.heading), hz = Math.cos(u.heading); let gmax = 0;
    for (const s of [0, 3, 7]) gmax = Math.max(gmax, hAt(u.x + hx * s, u.z + hz * s));
    yAbs = Math.max(gmax, G.waterH) + alt;
  }
  u.y += (yAbs - u.y) * Math.min(1, dt * 1.6);
}
function taskMove(u, cell) { if (pathNear(u, cell, 0) || pathNear(u, cell, 2)) { u.task = { type: 'move', goal: cell }; u.status = 'En marcha'; return true; } log(`⛔ ${u.name}: no hay ruta posible hasta ahí.`, 'warn'); return false; }
function taskAttack(u, cell) {
  if (u.water <= 1) { taskRefill(u, cell); return; }
  if (pathNear(u, cell, 3)) { u.task = { type: 'attack', focus: cell }; u.status = 'Hacia el fuego'; } else log(`⛔ ${u.name}: no puede llegar a ese frente (pendiente, agua o llamas).`, 'warn');
}
function nearestWater(u) {
  let best = null, bd = 1e9;
  for (const c of G.shore.concat(G.hydrants)) { const d = octile(c, u.cell) + (STATE[c] === 1 ? 999 : 0); if (d < bd) { bd = d; best = c; } }
  return best;
}
function taskRefill(u, resume, src) {
  const s = src ?? nearestWater(u); if (s == null) return;
  if (pathNear(u, s, 1)) { u.task = { type: 'refill', src: s, resume }; u.status = 'A por agua'; } else log(`⛔ ${u.name}: no encuentra punto de agua accesible.`, 'warn');
}
function taskRescue(u, h) { if (pathNear(u, h.cell, 1)) { u.task = { type: 'rescue', house: h }; u.status = 'A avisar a ' + h.name; } else log(`⛔ ${u.name}: no puede llegar a ${h.name}.`, 'warn'); }
function taskLoad(u, f) { if (pathNear(u, f.cell, 2)) { u.task = { type: 'load', farm: f }; u.status = 'Hacia ' + f.name; } else log(`⛔ ${u.name}: no puede llegar a ${f.name}.`, 'warn'); }
function taskBase(u) { if (pathNear(u, G.base, 1)) { u.task = { type: 'base' }; u.status = 'Volviendo a la base'; } }
function moveUnit(u, dt) {
  if (!u.path || u.pi >= u.path.length) return true;
  const n = u.path[u.pi];
  if (STATE[n] === 1 && INT[n] > .06) { u.blocked = true; return false; }
  const tx = cx(n), tz = cz(n), dx = tx - u.x, dz = tz - u.z, d = Math.hypot(dx, dz);
  const vc = VP[VEG[n]].cost, cost = ROADF[n] ? 1 : u.type === 'brigada' ? 1.8 : u.type === 'bulldozer' ? Math.min(vc, 2.5) : vc;
  const sp = ({ bomba: 4.2, ganado: 4, brigada: 2.8, bulldozer: 2.4 }[u.type]) * G.spd / Math.sqrt(cost) * dt;
  if (d <= sp) { u.x = tx; u.z = tz; u.pi++; } else { u.x += dx / d * sp; u.z += dz / d * sp; }
  if (d > .01) u.heading = Math.atan2(dx, dz);
  u.cell = Math.round(u.z) * N + Math.round(u.x);
  return u.pi >= u.path.length;
}
function findBurningNear(cell, r, from) {
  let best = -1, bd = 1e9; const x0 = cx(cell), z0 = cz(cell);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx, z = z0 + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue; const n = z * N + x;
    if (STATE[n] !== 1) continue; const d = octile(n, from ?? cell) - INT[n] * .5; if (d < bd) { bd = d; best = n; }
  }
  return best;
}
function spray(u, dt) {
  const t = findBurningNear(u.cell, 5);
  if (t < 0 || u.water <= 0) { u.sprayAt = -1; return false; }
  u.sprayAt = t; u.water = Math.max(0, u.water - 4 * dt);
  const ef = 1 + .2 * own('ret');
  WET[t] = Math.min(1.6, WET[t] + .6 * ef * dt);
  const x = cx(t), z = cz(t);
  for (let d = 0; d < 8; d++) { const nx = x + DX8[d], nz = z + DZ8[d]; if (nx >= 0 && nz >= 0 && nx < N && nz < N) WET[nz * N + nx] = Math.min(1.6, WET[nz * N + nx] + .2 * ef * dt); }
  changed.push(t);
  return true;
}
function unitsStep(dt) {
  for (const u of G.units) {
    if (u.air) { airStep(u, dt); continue; }
    // calor
    let heat = 0; const x = cx(u.cell), z = cz(u.cell);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue; const n = nz * N + nx; if (STATE[n] === 1) heat += INT[n] * (dx || dz ? .45 : 1.3); }
    if (heat > .05) { u.hp -= heat * dt * 7 * (1 - .2 * own('epi')) * (u.type === 'brigada' ? 1.5 : 1); if (u.hp < 45 && !u.hot) { u.hot = true; log(`🥵 ${u.name}: ¡calor extremo, la dotación está en peligro!`, 'bad'); } }
    else u.hp = Math.min(100, u.hp + dt * 1.5);
    if (u.hp < 70) u.hot = u.hp < 45 ? u.hot : false;
    if (u.hp <= 0) { endGame(false, `La dotación de <b>${u.name}</b> ha quedado atrapada por las llamas. Han muerto bomberos.`); return; }
    if (u.hp < 30 && u.task.type !== 'retreat') {
      const safe = astar(u.cell, i => DIST[i] >= 7, () => 0, costFor(u), 8000);
      if (safe) { setPath(u, safe); u.task = { type: 'retreat' }; u.status = 'Retirada de emergencia'; log(`🚒 ${u.name} se retira para salvar a la dotación.`, 'warn'); }
    }
    const T = u.task;
    if (u.blocked) { u.blocked = false; const goal = u.path && u.path[u.path.length - 1]; if (goal != null) { if (!pathNear(u, goal, 2)) { u.task = { type: 'idle' }; u.status = 'Ruta cortada'; } } }
    const arrived = moveUnit(u, dt);
    u.sprayAt = -1;
    switch (T.type) {
      case 'idle': case 'move': case 'retreat':
        if (arrived && T.type !== 'idle') { u.task = { type: 'idle' }; u.status = 'En espera'; }
        if (arrived && u.type === 'bomba' && u.water > 0 && spray(u, dt)) u.status = 'Defendiendo posición';
        break;
      case 'attack':
        if (!arrived) break;
        if (u.water <= 0) { taskRefill(u, T.focus); log(`💧 ${u.name} se ha quedado sin agua y va a repostar.`, 'info'); break; }
        if (spray(u, dt)) { u.status = 'Atacando el fuego'; break; }
        { let nb = findBurningNear(T.focus, 14, u.cell); if (nb < 0) nb = findBurningNear(u.cell, 30); if (nb >= 0) { T.focus = nb; if (!pathNear(u, nb, 3)) { u.task = { type: 'idle' }; u.status = 'Sin acceso al frente'; } } else { u.task = { type: 'idle' }; u.status = 'Zona sofocada'; } }
        break;
      case 'cut': cutStep(u, T, arrived, dt); break;
      case 'refill':
        if (!arrived) break;
        u.status = 'Repostando agua'; u.water = Math.min(u.maxW, u.water + 14 * dt);
        if (u.water >= u.maxW) { if (T.resume != null && STATE[T.resume] !== 0 || (T.resume != null && findBurningNear(T.resume, 14) >= 0)) { const f = findBurningNear(T.resume, 14); if (f >= 0) { taskAttack(u, f); break; } } u.task = { type: 'idle' }; u.status = 'Depósito lleno'; }
        break;
      case 'rescue':
        if (!arrived) break;
        u.work += dt; u.status = 'Evacuando la casa';
        if (u.work > 3) { u.work = 0; const h = T.house; if (h.people > 0) { u.carry += h.people; G.stats.evac += h.people; log(`✅ ${u.name} ha sacado a ${h.people} personas de <b>${h.name}</b>.`, 'ok'); h.people = 0; } u.task = { type: 'idle' }; u.status = 'En espera'; }
        break;
      case 'load':
        if (!arrived) break;
        if (T.farm.state !== 'waiting') { u.task = { type: 'idle' }; u.status = 'En espera'; break; }
        u.work += dt; u.status = `Cargando ${T.farm.kind}`;
        if (u.work > 6) { u.work = 0; T.farm.state = 'loaded'; u.carryFarm = T.farm; for (let k = 0; k < T.farm.n; k++) T.farm.mesh.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0)); T.farm.mesh.instanceMatrix.needsUpdate = true; log(`🐄 ${u.name} ha cargado el ganado de <b>${T.farm.name}</b>. Lo lleva a la base.`, 'ok'); taskBase(u); }
        break;
      case 'base':
        if (!arrived) break;
        u.work += dt; u.status = 'Descargando en zona segura';
        if (u.work > 4) { u.work = 0; if (u.carryFarm) { u.carryFarm.state = 'safe'; G.stats.stockSaved += u.carryFarm.n; log(`✅ ${u.carryFarm.n} ${u.carryFarm.kind} de ${u.carryFarm.name} a salvo.`, 'ok'); u.carryFarm = null; } u.carry = 0; u.task = { type: 'idle' }; u.status = 'En la base'; }
        break;
    }
    if (u.sprayAt >= 0) {
      const p = u.mesh.position, tp = cellWorld(u.sprayAt), tt = .9;
      for (let k = 0; k < 3; k++) { const vx = (tp.x - p.x) / tt + rr(-3, 3), vz = (tp.z - p.z) / tt + rr(-3, 3), vy = (tp.y - p.y - 5 + .5 * 38 * tt * tt) / tt + rr(-2, 2); water.add(p.x, p.y + 5, p.z, vx, vy, vz, tt * rr(.9, 1.1), 1.2, 3.5, [.75, .88, 1], [.9, .95, 1], .55); }
    }
  }
}
function order(u, p, ent) {
  const c = p.cell;
  if (u.air) return airOrder(u, c);
  if (ent && ent.kind === 'house' && ent.obj.town < 0 && ent.obj.people > 0) return taskRescue(u, ent.obj);
  if (u.type === 'brigada' || u.type === 'bulldozer') return taskMove(u, c);
  if (u.type === 'ganado') {
    if (ent && ent.kind === 'farm') { if (ent.obj.state === 'waiting') return taskLoad(u, ent.obj); log(`${ent.obj.name}: no queda ganado que recoger.`, 'info'); return; }
    if (ent && ent.kind === 'base') return taskBase(u);
    return taskMove(u, c);
  }
  if (VEG[c] === V.WATER) { const s = nearestShoreTo(c); if (s != null) return taskRefill(u, null, s); }
  if (ent && ent.kind === 'town' && u.water < u.maxW && cheb(c, ent.obj.cell) < 2) return taskRefill(u, null, ent.obj.cell);
  if (findBurningNear(c, 3) >= 0) return taskAttack(u, c);
  taskMove(u, c);
}
function nearestShoreTo(c) { let best = null, bd = 1e9; for (const s of G.shore) { const d = octile(s, c); if (d < bd) { bd = d; best = s; } } return bd < 30 ? best : null; }

// ───────────── Bucle de simulación ─────────────
function simStep(dt) {
  if (G.over) return;
  G.t += dt; weatherStep(dt); fireStep(dt); housesStep(dt); if (G.over) return; carsStep(dt); if (G.over) return; wildStep(dt); unitsStep(dt);
  G.slow += dt; if (G.slow >= 1) { G.slow = 0; slowTick(); }
}

// ───────────── Cámara ─────────────
const cam = { tx: 0, tz: 0, ty: 0, yaw: .6, dist: 520, tilt: 0 };
function updateCamera(dt) {
  cam.tx = clamp(cam.tx, -HALF, HALF); cam.tz = clamp(cam.tz, -HALF, HALF);
  cam.ty = lerp(cam.ty, hWorld(cam.tx, cam.tz), 1 - Math.exp(-dt * 6));
  const t = (cam.dist - 30) / (780 - 30), p = clamp(.2 + 1.05 * Math.pow(t, .55) + cam.tilt, .1, 1.48);
  camera.position.set(cam.tx + Math.sin(cam.yaw) * Math.cos(p) * cam.dist, cam.ty + Math.sin(p) * cam.dist, cam.tz + Math.cos(cam.yaw) * Math.cos(p) * cam.dist);
  const gh = hWorld(camera.position.x, camera.position.z); if (camera.position.y < gh + 5) camera.position.y = gh + 5;
  camera.lookAt(cam.tx, cam.ty + 2, cam.tz);
}
function focusOn(v) { cam.tx = v.x; cam.tz = v.z; }

// ───────────── Entrada ─────────────
let drag = null, hoverT = 0, mouse = { x: 0, y: 0, in: false };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, b: e.button, moved: false }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (!drag) return;
  const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly; drag.lx = e.clientX; drag.ly = e.clientY;
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
  if (!drag.moved) return;
  if (drag.b === 0) { const k = cam.dist * .0016; cam.tx += (-Math.cos(cam.yaw) * dx - Math.sin(cam.yaw) * dy) * k; cam.tz += (Math.sin(cam.yaw) * dx - Math.cos(cam.yaw) * dy) * k; }
  else { cam.yaw -= dx * .006; cam.tilt = clamp(cam.tilt + dy * .004, -.6, .6); }
});
canvas.addEventListener('pointerleave', () => { mouse.in = false; });
canvas.addEventListener('pointerup', e => { if (drag && !drag.moved) { if (drag.b === 0) clickAt(e.clientX, e.clientY); else if (drag.b === 2) { if (G.mode) { G.mode = null; renderPanel(); } else select(null); } } drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * Math.exp(e.deltaY * .0011), 30, 780); }, { passive: false });
window.addEventListener('keydown', e => { if (e.code === 'Escape' && G) { if (G.mode) { G.mode = null; renderPanel(); } else select(null); } });
window.addEventListener('keydown', e => { if (e.code === 'Space' && G && !G.over && !$('ovStart').classList.contains('show')) { e.preventDefault(); setSpeed(G.speed ? 0 : (G.prevSpeed || 1)); } });
function pick(sx, sy) {
  if (!terrain) return null;
  const r = canvas.getBoundingClientRect(); ndc.set((sx - r.left) / r.width * 2 - 1, -(sy - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera); const h = ray.intersectObject(terrain)[0]; if (!h) return null;
  const x = clamp(Math.round((h.point.x + HALF) / CELL), 0, N - 1), z = clamp(Math.round((h.point.z + HALF) / CELL), 0, N - 1);
  return { point: h.point, cell: z * N + x };
}
function entityAt(p) {
  const P = p.point; let best = null, bd = 1e9;
  const test = (kind, obj, pos, r) => { const d = Math.hypot(pos.x - P.x, pos.z - P.z); if (d < r && d < bd) { bd = d; best = { kind, obj }; } };
  for (const h of G.houses) if (h.town < 0) test('house', h, h.pos, 9);
  for (const s of G.lines) for (const q of s.pylons) test('line', s, q, 8);
  for (const f of G.farms) test('farm', f, f.grp.position, 12);
  for (const t of G.towns) test('town', t, cellWorld(t.cell), CELL * 5.5);
  test('base', null, cellWorld(G.base), 16);
  if (!best) for (const s of G.lines) if (s.set.has(p.cell)) best = { kind: 'line', obj: s };
  return best;
}
function unitAtScreen(sx, sy) { // las aeronaves vuelan alto: se seleccionan por su posición en pantalla
  const r = canvas.getBoundingClientRect(); let best = null, bd = 26;
  for (const u of G.units) { v3.copy(u.mesh.position); v3.y += 3; v3.project(camera); if (v3.z > 1) continue; const d = Math.hypot((v3.x + 1) / 2 * r.width + r.left - sx, (1 - v3.y) / 2 * r.height + r.top - sy); if (d < bd) { bd = d; best = u; } }
  return best;
}
function clickAt(sx, sy) {
  if (!G || G.over) return;
  const p = pick(sx, sy);
  if (G.mode) {
    if (!p) return;
    if (G.mode.a == null) { G.mode.a = p.cell; renderPanel(); return; }
    startCut(G.mode.unit, line4(G.mode.a, p.cell).slice(0, MAXCUT + 1)); G.mode = null; renderPanel(); return;
  }
  const su = unitAtScreen(sx, sy); if (su) return select({ kind: 'unit', obj: su });
  if (!p) return;
  const ent = entityAt(p);
  if (G.sel && G.sel.kind === 'unit') { order(G.sel.obj, p, ent); destRing.visible = true; destRing.position.copy(p.point).y += .5; destRing.userData.t = 1.5; return; }
  select(ent || { kind: 'cell', obj: p.cell });
}
function select(ent) { G.sel = ent; G.mode = null; renderPanel(); renderUnits(); }

// ───────────── Interfaz ─────────────
const money = e => e >= 1e6 ? (e / 1e6).toFixed(2).replace('.', ',') + ' M€' : Math.round(e / 1000) + ' mil €';
const fmtHa = c => (c * HA_CELL).toFixed(1).replace('.', ',') + ' ha';
function log(html, kind = '') {
  const el = document.createElement('div'); el.className = 'msg ' + kind; el.innerHTML = html; $('log').prepend(el);
  while ($('log').children.length > 6) $('log').lastChild.remove();
  setTimeout(() => { el.style.transition = 'opacity 1s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 1000); }, 14000);
}
function setSpeed(s) { if (s) G.prevSpeed = s; G.speed = s; document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.s === s)); }
document.querySelectorAll('#speed button').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
function renderUnits() {
  $('units').innerHTML = G.units.map((u, k) => `<div class="uc glass ${G.sel && G.sel.obj === u ? 'sel' : ''}" data-k="${k}"><div class="ic">${ICON[u.type]}</div><div class="nm">${u.name}</div><div class="ss" id="us${k}">${u.status}</div><div class="bars">${u.maxW && u.water !== undefined && (u.type === 'bomba' || u.air) ? `<div class="bar w" title="Agua"><i id="uw${k}" style="width:${u.water / u.maxW * 100}%"></i></div>` : ''}${u.air ? '' : `<div class="bar h" title="Estado de la dotación"><i id="uh${k}" style="width:${u.hp}%"></i></div>`}</div></div>`).join('');
  $('units').querySelectorAll('.uc').forEach(el => { el.onclick = () => select({ kind: 'unit', obj: G.units[+el.dataset.k] }); el.ondblclick = () => focusOn(G.units[+el.dataset.k].mesh.position); });
}
function updateUnitsUI() {
  G.units.forEach((u, k) => { const s = $('us' + k); if (!s) return; s.textContent = u.status; const w = $('uw' + k); if (w) w.style.width = (u.water / u.maxW * 100) + '%'; const h = $('uh' + k); if (!h) return; h.style.width = u.hp + '%'; h.style.background = u.hp < 45 ? 'var(--bad)' : u.hp < 75 ? 'var(--warn)' : 'var(--ok)'; });
}
function renderPanel() {
  const el = $('panel'), s = G.sel;
  if (!s) { el.style.display = 'none'; return; }
  el.style.display = 'block'; let h = '';
  if (s.kind === 'unit') {
    const u = s.obj, wPct = Math.round(u.water / u.maxW * 10) * 10;
    const help = {
      bomba: 'Clic cerca del fuego para atacarlo · clic en agua o en un pueblo para repostar · clic en una casa aislada para evacuarla.',
      ganado: 'Clic en una granja para recoger el ganado · clic en una casa aislada para evacuarla · clic en la base para descargar.',
      brigada: 'Clic en el mapa para moverla (sube laderas que los camiones no pueden). Pulsa «Trazar cortafuegos» y marca el inicio y el final (máx. 1,2 km).',
      bulldozer: 'Clic en el mapa para moverlo. Pulsa «Trazar cortafuegos» y marca el inicio y el final (máx. 1,2 km). Es rápido, pero no sube pendientes fuertes.',
      heli: 'Clic cerca del fuego para descargar: hará rotaciones solo (cargar → descargar) mientras queden llamas. Clic en un embalse para cargar.',
      avion: 'Clic cerca del fuego para descargar una franja larga en la dirección de vuelo. Carga solo en embalses grandes.',
    }[u.type];
    const cutting = G.mode && G.mode.unit === u;
    h = `<h3>${ICON[u.type]} ${u.name}</h3><p>${u.status}${u.type === 'bomba' || u.air ? ` · Agua ${wPct}%` : ''}${u.air ? '' : ` · Dotación ${Math.round(u.hp / 10) * 10}%`}</p>
    <p style="color:var(--muted)">${cutting ? `<span class="mode">✂️ ${G.mode.a == null ? 'Haz clic donde EMPIEZA el cortafuegos' : 'Ahora haz clic donde TERMINA'} · clic derecho para cancelar</span>` : help}</p>
    <div class="row">${u.type === 'bomba' ? '<button id="pRefill">💧 Repostar</button>' : ''}${u.type === 'brigada' || u.type === 'bulldozer' ? `<button class="act" id="pCutL">✂️ ${cutting ? 'Cancelar' : 'Trazar cortafuegos'}</button>` : ''}<button id="pBase">🏠 Volver a la base</button><button id="pFocus">🎯 Centrar</button></div>`;
  } else if (s.kind === 'line') {
    const L = s.obj, names = L.feeds.map(t => G.towns[t].name).join(' y ');
    h = `<h3>⚡ Línea de alta tensión</h3><p>${{ on: 'En tensión', off: 'Tensión cortada', broken: 'Derribada por el fuego' }[L.state]} · alimenta a ${names}</p>
    <p style="color:var(--muted)">${L.state === 'on' ? 'Con corriente, los medios aéreos no pueden descargar a menos de 60 m de los cables, y con viento fuerte pueden saltar chispazos. Si el fuego llega a la línea, los cables caerán y provocarán más focos.' : L.state === 'off' ? 'Sin corriente se puede descargar agua cerca sin peligro, pero los pueblos que alimenta están sin luz y eso genera pérdidas cada minuto.' : 'La línea ha caído. Los técnicos la repararán cuando se apague el incendio.'}</p>
    <div class="row">${L.state === 'on' ? '<button class="act" id="pCut">🔌 Pedir el corte de tensión (50 mil €)</button>' : L.state === 'off' ? '<button id="pRestore">⚡ Restablecer la tensión</button>' : ''}</div>`;
  } else if (s.kind === 'town') {
    const t = s.obj, pop = t.houses.reduce((a, h) => a + h.people, 0), lost = t.houses.filter(h => h.state === 'destroyed').length;
    h = `<h3>🏘️ ${t.name}</h3><p>${t.houses.length} casas · ${lost} destruidas · ${pop} personas dentro de casa (de ${t.pop0})</p><p style="color:var(--muted)">${t.alarm ? 'Evacuación en curso hacia la salida ' + (t.exit + 1) + '.' : 'Evacuar cuesta 25 mil € y no se puede deshacer. Si el fuego llega con gente dentro, habrá víctimas.'}</p>
    <div class="row"><button class="act" id="pAlarm" ${t.alarm ? 'disabled' : ''}>🚨 ${t.alarm ? 'Alarma activada' : 'Activar alarma de evacuación'}</button></div>`;
  } else if (s.kind === 'farm') {
    const f = s.obj, st = { waiting: 'Ganado en el corral', loaded: 'Ganado en el camión', safe: 'Ganado a salvo', dead: 'Ganado muerto' }[f.state];
    h = `<h3>${f.kind === 'ovejas' ? '🐑' : '🐄'} ${f.name}</h3><p>${f.n} ${f.kind} · ${st}</p><div class="row"><button class="act" id="pStock" ${f.state !== 'waiting' ? 'disabled' : ''}>🚛 Enviar el camión de ganado</button></div>`;
  } else if (s.kind === 'house') {
    const ho = s.obj;
    h = `<h3>🏠 ${ho.name}</h3><p>${ho.people ? ho.people + ' personas dentro. La alarma de los pueblos no llega hasta aquí.' : 'Vacía.'}</p><div class="row"><button class="act" id="pRescue" ${ho.people ? '' : 'disabled'}>🚒 Enviar el vehículo más cercano</button></div>`;
  } else if (s.kind === 'base') {
    h = `<h3>🚩 Base de bomberos</h3><p>Zona segura: aquí se descarga el ganado rescatado. También hay hidrante para repostar.</p>`;
  } else {
    const c = s.obj, st = ['Sin quemar', 'Ardiendo', 'Calcinado', 'Apagado (puede rebrotar)'][STATE[c]];
    h = `<h3>${VP[VEG[c]].n}</h3><p>${st} · Altitud ${Math.round(H[c] * 6)} m · Humedad del suelo ${Math.round((MOI[c] * .5 + Math.min(1, WET[c]) * .5) * 100)}%</p><p style="color:var(--muted)">Selecciona una autobomba (clic en ella o en su tarjeta) para darle órdenes.</p>`;
  }
  if (el._h === h) return; el._h = h;
  el.innerHTML = '<button class="x" id="pClose" title="Cerrar (Esc)">✕</button>' + h;
  const b = id => $(id);
  b('pClose').onclick = () => select(null);
  if (b('pRefill')) b('pRefill').onclick = () => taskRefill(s.obj, null);
  if (b('pBase')) b('pBase').onclick = () => { if (s.obj.air) { if (s.obj.task.type !== 'parked') { s.obj.task = { type: 'abase' }; s.obj.status = 'Vuelve a la base'; } } else taskBase(s.obj); };
  if (b('pCutL')) b('pCutL').onclick = () => { G.mode = G.mode && G.mode.unit === s.obj ? null : { unit: s.obj, a: null }; renderPanel(); };
  if (b('pCut')) b('pCut').onclick = () => cutPower(s.obj, false);
  if (b('pRestore')) b('pRestore').onclick = () => cutPower(s.obj, true);
  if (b('pFocus')) b('pFocus').onclick = () => focusOn(s.obj.mesh.position);
  if (b('pAlarm')) b('pAlarm').onclick = () => { activateAlarm(s.obj); renderPanel(); };
  if (b('pStock')) b('pStock').onclick = () => { const u = G.units.find(u => u.type === 'ganado'); if (u.carryFarm) return log('El camión de ganado ya va cargado; espera a que descargue.', 'warn'); taskLoad(u, s.obj); };
  if (b('pRescue')) b('pRescue').onclick = () => { const us = G.units.filter(u => !u.air && u.task.type !== 'rescue').sort((a, b2) => octile(a.cell, s.obj.cell) - octile(b2.cell, s.obj.cell)); if (us[0]) { taskRescue(us[0], s.obj); log(`${us[0].name} va hacia ${s.obj.name}.`, 'info'); } };
}
// etiquetas flotantes
const labels = [];
function makeLabels() {
  $('labels').innerHTML = ''; labels.length = 0;
  const add = (kind, obj, cls, pos, off) => { const el = document.createElement('div'); el.className = 'lbl ' + cls; $('labels').appendChild(el); el.onclick = () => select(kind === 'unit' ? { kind, obj } : { kind, obj }); labels.push({ el, kind, obj, pos, off }); };
  for (const t of G.towns) add('town', t, 'town', cellWorld(t.cell), 26);
  for (const f of G.farms) add('farm', f, '', f.grp.position, 12);
  for (const h of G.houses) if (h.town < 0) add('house', h, '', h.pos, 10);
  add('base', null, '', cellWorld(G.base), 14);
  for (const s of G.lines) add('line', s, '', s.labelPos, 27);
  for (const u of G.units) add('unit', u, '', null, 9);
}
const v3 = new THREE.Vector3();
function updateLabels() {
  const w = innerWidth, h = innerHeight;
  for (const L of labels) {
    const pos = L.kind === 'unit' ? L.obj.mesh.position : L.pos; v3.set(pos.x, pos.y + L.off, pos.z).project(camera);
    if (v3.z > 1 || v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1) { L.el.style.display = 'none'; continue; }
    L.el.style.display = ''; L.el.style.left = ((v3.x + 1) / 2 * w) + 'px'; L.el.style.top = ((1 - v3.y) / 2 * h) + 'px';
    let txt = '', cls = 'lbl';
    if (L.kind === 'town') { const t = L.obj, pop = t.houses.reduce((a, x) => a + x.people, 0); txt = `${t.alarm ? '🚨 ' : ''}${t.name} · 👥 ${pop}`; cls += ' town' + (t.alarm && pop ? ' alarm' : '') + (!t.alarm && t.warned ? ' danger' : ''); }
    else if (L.kind === 'farm') { const f = L.obj; txt = `${f.kind === 'ovejas' ? '🐑' : '🐄'} ${f.state === 'waiting' ? f.n : f.state === 'dead' ? '💀' : '✅'}`; cls += (f.state !== 'waiting' ? ' gone' : f.warned ? ' danger' : ''); }
    else if (L.kind === 'house') { const ho = L.obj; txt = `🏠 ${ho.people ? '👥 ' + ho.people : '✅'}`; cls += (!ho.people ? ' gone' : ho.warned ? ' danger' : ''); }
    else if (L.kind === 'base') txt = '🚩 Base';
    else if (L.kind === 'line') { const s = L.obj; txt = `⚡ ${{ on: 'En tensión', off: 'Sin tensión', broken: 'Derribada' }[s.state]}`; cls += s.state === 'on' ? ' danger' : ' gone'; }
    else { const u = L.obj; txt = `${ICON[u.type]} ${u.name}`; cls += u.hp < 45 ? ' alarm' : ''; }
    if (G.sel && G.sel.obj === L.obj && (G.sel.kind === L.kind)) cls += ' sel';
    if (tut && tut.hlObj && tut.hlObj === L.obj) cls += ' hl';
    if (L.txt !== txt) { L.el.textContent = txt; L.txt = txt; }
    if (L.cls !== cls) { L.el.className = cls; L.cls = cls; }
  }
}
function updateHUD() {
  const hr = WX.time / 60 % 24, e = sunElev();
  $('clock').textContent = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor(WX.time % 60)).padStart(2, '0')}`;
  $('sunIc').textContent = e > .1 ? '☀️' : e > -.1 ? '🌅' : '🌙';
  $('dayLab').textContent = hr < 6 ? 'Madrugada' : hr < 12 ? 'Mañana' : hr < 20 ? 'Tarde' : 'Noche';
  $('wxIc').textContent = WX.rain > .2 ? '🌧️' : WX.storm && WX.cloud > .5 ? '⛈️' : WX.cloud > .55 ? '☁️' : WX.cloud > .3 ? '⛅' : e > 0 ? '☀️' : '🌙';
  $('temp').textContent = Math.round(WX.temp) + ' °C';
  $('hum').textContent = `Humedad ${Math.round(WX.hum * 100)}% · ${WX.front}`;
  $('wind').textContent = Math.round(WX.ws) + ' km/h';
  $('windDir').textContent = 'Viento del ' + dirName(WX.wind + Math.PI);
  // brújula relativa a la cámara
  const o = new THREE.Vector3(cam.tx, cam.ty, cam.tz).project(camera), pn = new THREE.Vector3(cam.tx, cam.ty, cam.tz - 60).project(camera), pw = new THREE.Vector3(cam.tx + Math.sin(WX.wind) * 60, cam.ty, cam.tz - Math.cos(WX.wind) * 60).project(camera);
  const aN = Math.atan2(pn.x - o.x, pn.y - o.y), aW = Math.atan2(pw.x - o.x, pw.y - o.y);
  $('wArrow').setAttribute('transform', `rotate(${aW * 180 / Math.PI})`);
  $('cN').setAttribute('x', Math.sin(aN) * 34); $('cN').setAttribute('y', -Math.cos(aN) * 34);
  $('sFire').textContent = fmtHa(burning.length);
  $('sBurn').textContent = fmtHa(G.stats.cells);
  $('sHouse').textContent = G.stats.houses;
  $('sFauna').textContent = G.stats.fauna + G.stats.stockDead;
  $('sDmg').textContent = money(G.damage);
  $('dmgBar').style.width = Math.min(100, G.damage / G.limit * 100) + '%';
  updateUnitsUI();
  if (G.sel && G.sel.kind !== 'cell') renderPanel();
  if (tut) tutTick();
}
// hover
function updateHover() {
  if (!mouse.in || drag) return; const p = pick(mouse.x, mouse.y); if (!p) { $('hover').textContent = ''; return; }
  const c = p.cell; $('hover').textContent = `${VP[VEG[c]].n} · ${['sin quemar', 'ardiendo', 'calcinado', 'apagado'][STATE[c]]} · ${Math.round(H[c] * 6)} m`;
}
// minimapa
const mm = $('mmc'), mmx = mm.getContext('2d'), mmOff = document.createElement('canvas'); mmOff.width = mmOff.height = N; const mmo = mmOff.getContext('2d'); let mmImg;
function initMinimap() {
  mmImg = mmo.createImageData(N, N);
  for (let i = 0; i < NN; i++) mmPixel(i);
}
function mmPixel(i) {
  const s = STATE[i], d = mmImg.data, k = i * 4;
  let r, g, b;
  if (s === 1) { r = 255; g = 90 + Math.random() * 60; b = 20; }
  else if (s === 2) { r = 25; g = 22; b = 20; }
  else if (s === 3) { r = 60; g = 48; b = 40; }
  else { const c = VP[VEG[i]].col, sh = i % N > 0 ? clamp(1 + (H[i] - H[i - 1]) * .08, .6, 1.4) : 1; r = c[0] * 255 * sh; g = c[1] * 255 * sh; b = c[2] * 255 * sh; if (ROADF[i]) { r = g = b = 200; } }
  d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
}
function drawMinimap() {
  for (const i of burning) mmPixel(i);
  mmo.putImageData(mmImg, 0, 0);
  const s = 190 / N; mmx.imageSmoothingEnabled = true; mmx.drawImage(mmOff, 0, 0, 190, 190);
  mmx.fillStyle = '#fff'; for (const t of G.towns) { mmx.fillRect(cx(t.cell) * s - 4, cz(t.cell) * s - 4, 8, 8); }
  mmx.fillStyle = '#ffcf4d'; for (const f of G.farms) if (f.state === 'waiting') mmx.fillRect(cx(f.cell) * s - 2.5, cz(f.cell) * s - 2.5, 5, 5);
  mmx.lineWidth = 1.5;
  for (const L of G.lines) { mmx.strokeStyle = L.state === 'on' ? '#ffd23a' : L.state === 'off' ? '#8a8a8a' : '#ff4d5e'; mmx.setLineDash(L.state === 'broken' ? [3, 3] : []); mmx.beginPath(); mmx.moveTo(cx(L.a) * s, cz(L.a) * s); mmx.lineTo(cx(L.b) * s, cz(L.b) * s); mmx.stroke(); }
  mmx.setLineDash([]); mmx.lineWidth = 1;
  for (const u of G.units) {
    mmx.fillStyle = { bomba: '#ff3344', ganado: '#44dd77', brigada: '#f08a1c', bulldozer: '#f2b705', heli: '#4dd2ff', avion: '#4dd2ff' }[u.type]; mmx.strokeStyle = '#000'; mmx.beginPath();
    if (u.air) { const a = u.heading; mmx.moveTo(u.x * s + Math.sin(a) * 6, u.z * s + Math.cos(a) * 6); mmx.lineTo(u.x * s + Math.sin(a + 2.5) * 5, u.z * s + Math.cos(a + 2.5) * 5); mmx.lineTo(u.x * s + Math.sin(a - 2.5) * 5, u.z * s + Math.cos(a - 2.5) * 5); mmx.closePath(); }
    else mmx.arc(u.x * s, u.z * s, 4, 0, 7);
    mmx.fill(); mmx.stroke();
  }
  mmx.fillStyle = '#7cc8ff'; for (const c of G.cars) mmx.fillRect(c.x * s - 1.5, c.z * s - 1.5, 3, 3);
  // vista
  const x = (cam.tx + HALF) / CELL * s, z = (cam.tz + HALF) / CELL * s, r = cam.dist / CELL * s * .5;
  mmx.strokeStyle = 'rgba(255,255,255,.9)'; mmx.lineWidth = 1.5; mmx.beginPath(); mmx.arc(x, z, Math.max(6, r), 0, 7); mmx.stroke();
  mmx.beginPath(); mmx.moveTo(x, z); mmx.lineTo(x - Math.sin(cam.yaw) * 14, z - Math.cos(cam.yaw) * 14); mmx.stroke();
}
let mmDrag = false;
const mmGo = e => { const r = mm.getBoundingClientRect(); cam.tx = ((e.clientX - r.left) / r.width) * (N - 1) * CELL - HALF; cam.tz = ((e.clientY - r.top) / r.height) * (N - 1) * CELL - HALF; };
mm.addEventListener('pointerdown', e => { mmDrag = true; mmGo(e); mm.setPointerCapture(e.pointerId); });
mm.addEventListener('pointermove', e => { if (mmDrag) mmGo(e); });
mm.addEventListener('pointerup', () => mmDrag = false);

// ───────────── Visuales por fotograma ─────────────
const C_SKY_DAY = new THREE.Color(.5, .68, .86), C_SKY_DUSK = new THREE.Color(.95, .55, .33), C_SKY_NIGHT = new THREE.Color(.035, .05, .11), C_GREY = new THREE.Color(.5, .53, .57), tmpC = new THREE.Color();
function updateVisuals(dt, gdt) {
  glowTime.value += dt;
  // cambios de celdas
  if (changed.length) { for (const i of changed) { cellColor(i); treeState(i); mmPixel(i); } changed.length = 0; colAttr.needsUpdate = true; }
  G.glowAcc = (G.glowAcc || 0) + dt;
  if (G.glowAcc > .08) { G.glowAcc = 0; glow.fill(0); for (const i of burning) glow[i] = INT[i] * (.7 + Math.random() * .5); glowAttr.needsUpdate = true; }
  // luz
  const e = sunElev(), day = smooth(-.1, .25, e), dusk = Math.exp(-(((e - .04) / .13) ** 2)), night = 1 - day;
  tmpC.copy(C_SKY_NIGHT).lerp(C_SKY_DAY, day).lerp(C_SKY_DUSK, dusk * .55);
  tmpC.lerp(C_GREY.clone().multiplyScalar(.25 + .75 * day), WX.cloud * .6);
  if (WX.flash > .02) tmpC.lerp(new THREE.Color(.85, .88, 1), WX.flash * .7);
  scene.background = tmpC; scene.fog.color.copy(tmpC);
  scene.fog.near = 500 - WX.rain * 250; scene.fog.far = 2200 - WX.rain * 1100;
  const th = ((WX.time / 60 % 24) - 6) / 12 * Math.PI;
  sun.position.set(Math.cos(th) * 700, Math.max(40, Math.sin(th) * 700), 260); sun.target.position.set(0, 0, 0);
  sun.intensity = 2.6 * day * (1 - WX.cloud * .55) * (1 - WX.rain * .3);
  sun.color.setRGB(1, .85 + .15 * (1 - dusk), .7 + .3 * (1 - dusk));
  hemi.intensity = .32 + .65 * day * (1 - WX.cloud * .3) + WX.flash * 3;
  hemi.color.setRGB(lerp(.55, .81, day), lerp(.65, .89, day), 1);
  moon.intensity = .9 * night * (1 - WX.cloud * .5);
  stars.material.opacity = night * (1 - WX.cloud);
  glowK.value = .45 + 1.3 * night;
  winMesh.material.opacity = smooth(.15, .7, night + WX.cloud * .2);
  // luces del fuego
  G.flAcc = (G.flAcc || 0) + dt;
  if (G.flAcc > .4 && burning.length) { G.flAcc = 0; fireLights.forEach(l => { const i = burning[Math.floor(Math.random() * burning.length)]; l.userData.i = i; const p = cellWorld(i); l.position.set(p.x, p.y + 15, p.z); }); }
  const fi = Math.min(1, burning.length / 30);
  fireLights.forEach(l => { l.intensity = burning.length ? (60 + 140 * night) * fi * (.8 + Math.random() * .4) : 0; });
  // partículas
  const wsm = WX.ws / 3.6, wvx = Math.sin(WX.wind), wvz = -Math.cos(WX.wind);
  if (gdt > 0 && burning.length) {
    const nf = Math.min(burning.length * 3, 900) * gdt, ns = Math.min(burning.length * .35, 70) * gdt;
    for (let k = 0; k < nf; k++) {
      const i = burning[Math.floor(Math.random() * burning.length)], it = INT[i]; if (it < .05) continue;
      const v = VEG[i], tall = v === V.PINE || v === V.OAK, x = wx(cx(i)) + rr(-3, 3), z = wx(cz(i)) + rr(-3, 3), y = hWorld(x, z) + (tall ? rr(3, 10) : rr(.3, 1.5));
      const sz = (tall ? 15 : v === V.SHRUB ? 9 : 6) * (.45 + it * .75);
      flames.add(x, y, z, wvx * wsm * .3, rr(4, 9), wvz * wsm * .3, rr(.45, 1) * (tall ? 1.3 : 1), sz, sz * .3, [1, .78, .35], [.9, .18, .03], .8);
    }
    for (let k = 0; k < ns; k++) {
      const i = burning[Math.floor(Math.random() * burning.length)], it = INT[i]; if (it < .1) continue;
      const x = wx(cx(i)), z = wx(cz(i)), y = H[i] + 6, dark = .1 + day * .2;
      smoke.add(x + rr(-4, 4), y + rr(0, 6), z + rr(-4, 4), 0, rr(5, 9), 0, rr(14, 24), rr(10, 16), rr(60, 110), night > .5 ? [.4, .18, .07] : [dark, dark * .97, dark * .95], night > .5 ? [.08, .08, .09] : [dark + .22, dark + .22, dark + .23], .6 * (.6 + it * .4));
    }
  }
  flames.update(gdt || 0, wvx, wvz, wsm * 2.5);
  smoke.update(gdt || 0, wvx, wvz, wsm * 2.2);
  water.update(gdt || 0, 0, 0, 0);
  // nubes
  const cd = 1 - day * .6;
  for (let i = 0; i < clouds.n; i++) {
    const i3 = i * 3, i4 = i * 4; clouds.p[i3] += wvx * wsm * .5 * (gdt || 0); clouds.p[i3 + 2] += wvz * wsm * .5 * (gdt || 0);
    if (clouds.p[i3] > HALF * 1.5) clouds.p[i3] -= HALF * 3; if (clouds.p[i3] < -HALF * 1.5) clouds.p[i3] += HALF * 3;
    if (clouds.p[i3 + 2] > HALF * 1.5) clouds.p[i3 + 2] -= HALF * 3; if (clouds.p[i3 + 2] < -HALF * 1.5) clouds.p[i3 + 2] += HALF * 3;
    const g = (1 - WX.rain * .55) * (.25 + .75 * day) * (1 - cd * .2);
    clouds.c[i4] = g; clouds.c[i4 + 1] = g; clouds.c[i4 + 2] = g * 1.03; clouds.c[i4 + 3] = clamp((WX.cloud - (i / clouds.n) * .7) * 1.2, 0, .5) * (cam.dist > 250 ? .6 : 1);
    clouds.s[i] = clouds.s0[i];
  }
  clouds.g.setDrawRange(0, clouds.n); clouds.ap.needsUpdate = clouds.ac.needsUpdate = clouds.as.needsUpdate = true;
  // lluvia
  rainMat.opacity = WX.rain * .55; rainLines.visible = WX.rain > .03;
  if (rainLines.visible) {
    const fall = 160 * dt;
    for (let i = 0; i < RAIN_N; i++) {
      const k = i * 6; rainPos[k + 1] -= fall; if (rainPos[k + 1] < cam.ty - 40) { rainPos[k] = cam.tx + rr(-260, 260); rainPos[k + 1] = cam.ty + rr(150, 320); rainPos[k + 2] = cam.tz + rr(-260, 260); }
      rainPos[k + 3] = rainPos[k] + wvx * wsm * .25; rainPos[k + 4] = rainPos[k + 1] + 5; rainPos[k + 5] = rainPos[k + 2] + wvz * wsm * .25;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  // unidades
  for (const u of G.units) {
    const m = u.mesh, x = wx(u.x), z = wx(u.z); m.position.set(x, u.air ? u.y : hWorld(x, z), z);
    let a = u.heading - m.rotation.y; a = Math.atan2(Math.sin(a), Math.cos(a)); m.rotation.y += a * Math.min(1, dt * (u.air ? 3 : 8));
    const lb = m.userData.light;
    if (u.air) {
      const flying = u.task.type !== 'parked' || u.y > H[u.home] + 1.5;
      if (m.userData.rotor) { m.userData.rotor.rotation.y += dt * (flying ? 38 : 0); m.userData.tailRotor.rotation.x += dt * (flying ? 50 : 0); }
      if (m.userData.props) for (const p of m.userData.props) p.rotation.z += dt * (flying ? 45 : 0);
      m.rotation.z = flying ? clamp(-a * 1.2, -.35, .35) : 0; // alabeo en los giros
      lb.visible = Math.floor(glowTime.value * 1.5) % 2 === 0;
    } else { lb.material.color.setHex(Math.floor(glowTime.value * 4) % 2 ? 0x2a6bff : 0xff2a3a); lb.visible = u.task.type !== 'idle' || u.sprayAt >= 0; }
  }
  if (G.sel && G.sel.kind === 'unit') { const q = G.sel.obj.mesh.position; selRing.visible = true; selRing.position.set(q.x, hWorld(q.x, q.z) + .6, q.z); } else selRing.visible = false;
  // cortafuegos: líneas planificadas y vista previa
  {
    const pa = planLine.geometry.attributes.position, arr = pa.array; let n = 0;
    for (const u of G.units) if (u.task.type === 'cut') { const C = u.task.cells; for (let j = u.task.k; j < C.length - 1 && n < arr.length / 3 - 2; j++) for (const c of [C[j], C[j + 1]]) { arr[n * 3] = wx(cx(c)); arr[n * 3 + 1] = H[c] + 1.2; arr[n * 3 + 2] = wx(cz(c)); n++; } }
    planLine.visible = n > 0; planLine.geometry.setDrawRange(0, n); pa.needsUpdate = true;
    let vis = false;
    if (G.mode && G.mode.a != null && mouse.in) {
      const p = pick(mouse.x, mouse.y);
      if (p) { const C = line4(G.mode.a, p.cell).slice(0, MAXCUT + 1), pb = previewLine.geometry.attributes.position; C.forEach((c, k) => { pb.array[k * 3] = wx(cx(c)); pb.array[k * 3 + 1] = H[c] + 1.5; pb.array[k * 3 + 2] = wx(cz(c)); }); previewLine.geometry.setDrawRange(0, C.length); pb.needsUpdate = true; vis = true; }
    }
    previewLine.visible = vis;
  }
  if (destRing.visible) { destRing.userData.t -= dt; destRing.material.opacity = Math.max(0, destRing.userData.t / 1.5); if (destRing.userData.t <= 0) destRing.visible = false; }
  // fauna y coches
  const d = new THREE.Object3D();
  G.wild.forEach((a, k) => { if (!a.alive) { d.position.set(wx(a.x), hWorld(wx(a.x), wx(a.z)), wx(a.z)); d.rotation.set(0, a.h, Math.PI / 2); d.scale.setScalar(1); if (!a.colored) { a.colored = 1; wildMesh.setColorAt(k, new THREE.Color(.04, .035, .03)); wildMesh.instanceColor.needsUpdate = true; } } else { d.position.set(wx(a.x), hWorld(wx(a.x), wx(a.z)), wx(a.z)); d.rotation.set(0, a.h, 0); d.scale.setScalar(1); } d.updateMatrix(); wildMesh.setMatrixAt(k, d.matrix); });
  wildMesh.instanceMatrix.needsUpdate = true;
  carMesh.count = Math.min(120, G.cars.length);
  for (let k = 0; k < carMesh.count; k++) { const c = G.cars[k]; const x = wx(c.x), z = wx(c.z); d.position.set(x, hWorld(x, z), z); d.rotation.set(0, c.heading, 0); d.updateMatrix(); carMesh.setMatrixAt(k, d.matrix); }
  carMesh.instanceMatrix.needsUpdate = true;
  for (const f of G.farms) { if (f.state !== 'waiting') continue; f.anim.forEach((a, k) => { a.r += (Math.random() - .5) * dt; d.position.set(a.x, 0, a.z); d.rotation.set(0, a.r, 0); d.updateMatrix(); f.mesh.setMatrixAt(k, d.matrix); }); f.mesh.instanceMatrix.needsUpdate = true; }
}

// ───────────── Partida ─────────────
function newGame(seed) {
  lastSeed = seed;
  if (tut) { tutClear(); $('coach').classList.remove('show'); tut = null; }
  const L = LEVELS[lvlIdx];
  let ok = false, s = seed;
  for (let k = 0; k < 25 && !ok; k++) {
    alloc(); G = { L, seed: s, t: 0, slow: 0, speed: 1, prevSpeed: 1, damage: 0, over: false, units: [], cars: [], sel: null, mode: null, airGr: null, spd: 1 + .12 * own('motor'), limit: L.limit * (1 + .1 * own('budget')), stats: { cells: 0, houses: 0, fauna: 0, stockDead: 0, stockSaved: 0, evac: 0, victims: 0, rekindle: 0, drops: 0, breaks: 0 } };
    ok = generate(s); if (!ok) s = (s * 1103515245 + 12345) >>> 0;
  }
  lastSeed = G.seed;
  burning = []; changed = [];
  flames.n = smoke.n = water.n = 0;
  // unidades en la base
  const roadNear = []; for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const x = cx(G.base) + dx, z = cz(G.base) + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue; const n = z * N + x; if (VEG[n] !== V.WATER && VEG[n] !== V.ROCK) roadNear.push(n); }
  roadNear.sort((a, b) => (ROADF[b] - ROADF[a]) || (cheb(a, G.base) - cheb(b, G.base)));
  let ri = 0; const slot = () => roadNear[ri++] ?? G.base;
  const nb = L.trucks + own('bomba');
  for (let k = 0; k < nb; k++) G.units.push(newUnit('bomba', 'Bomba ' + (k + 1), slot()));
  G.units.push(newUnit('ganado', 'Camión de ganado', slot()));
  if (own('brigada')) G.units.push(newUnit('brigada', 'Brigada forestal', slot()));
  if (own('bulldozer')) G.units.push(newUnit('bulldozer', 'Bulldozer', slot()));
  // helipuerto junto a la base
  const pads = []; for (let r = 3; r < 14 && pads.length < 3; r++) for (let dz = -r; dz <= r && pads.length < 3; dz++) for (let dx = -r; dx <= r && pads.length < 3; dx++) { if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; const x = cx(G.base) + dx, z = cz(G.base) + dz; if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) continue; const c = z * N + x; if (VEG[c] === V.WATER || VEG[c] === V.ROCK || ROADF[c] || pads.some(p => cheb(p, c) < 3)) continue; pads.push(c); }
  let pi = 0; const pad = () => pads[pi++] ?? G.base;
  for (let k = 0; k < own('heli'); k++) G.units.push(newUnit('heli', 'Helicóptero ' + (k + 1), pad()));
  if (own('avion')) G.units.push(newUnit('avion', 'Hidroavión', pad()));
  initWeather();
  buildScene();
  updatePower();
  initMinimap();
  makeLabels(); renderUnits(); renderPanel();
  $('log').innerHTML = '';
  for (const f of G.foci) ignite(f);
  G.stats.cells = 0; G.damage = 0; // los focos iniciales no cuentan
  for (const f of G.foci) AFF[f] = 1;
  const f0 = cellWorld(G.foci[0]); cam.tx = f0.x; cam.tz = f0.z; cam.dist = 420; cam.yaw = Math.atan2(cellWorld(G.base).x - f0.x, cellWorld(G.base).z - f0.z);
  $('lvlLab').textContent = `Nivel ${lvlIdx + 1} · mapa #${G.seed % 100000}`;
  setSpeed(1);
  log(`🔥 Aviso del 112: ${G.foci.length > 1 ? G.foci.length + ' focos de incendio' : 'incendio forestal'} cerca de <b>${nearestPlace(G.foci[0])}</b>. Viento del ${dirName(WX.wind + Math.PI)} a ${Math.round(WX.ws)} km/h.`, 'bad');
  log('Selecciona una autobomba y haz clic cerca de las llamas para atacarlas.', 'info');
}
function endGame(win, reason) {
  if (G.over) return; G.over = true;
  if (G.tut) tutEnd(win);
  const s = G.stats, total = NN, burned = s.cells;
  const wildAlive = G.wild.filter(a => a.alive).length;
  let xp = 0;
  if (G.tut) { xp = win ? 300 : 50; prof.tut = 1; }
  else if (win) xp = Math.max(50, Math.round(400 * (lvlIdx + 1) + (1 - burned / 1500) * 600 + s.evac * 4 + wildAlive * 6 + s.stockSaved * 5 - G.damage / 20000 - s.houses * 30));
  else xp = Math.round(Math.max(0, s.evac * 2 + s.stockSaved * 2));
  let unlocked = false;
  if (!G.demo) {
    prof.xp += xp;
    if (win && !G.tut && lvlIdx + 1 > prof.maxLvl && lvlIdx + 1 < LEVELS.length) { prof.maxLvl = lvlIdx + 1; unlocked = true; }
    saveProf(); renderLevels();
  }
  $('endT').textContent = win ? '🎉 Incendio extinguido' : '💀 Fin de la partida';
  $('endP').innerHTML = win ? `Has controlado el incendio a las ${$('clock').textContent}.` : reason;
  const row = (a, b) => `<div><span>${a}</span><b>${b}</b></div>`;
  $('endR').innerHTML = row('Superficie quemada', fmtHa(burned)) + row('Daños', money(G.damage)) + row('Casas destruidas', s.houses) + row('Personas evacuadas', s.evac) + row('Fauna salvaje viva', `${wildAlive} / ${G.wild.length}`) + row('Ganado salvado', s.stockSaved) + row('Ganado muerto', s.stockDead) + row('Víctimas', s.victims) + row('Rebrotes', s.rekindle) + row('Descargas aéreas', s.drops) + row('Cortafuegos abiertos', Math.round(s.breaks * 30) + ' m');
  $('endX').innerHTML = `+${xp} XP <span style="font-size:14px;color:var(--muted);font-weight:600">· total ${prof.xp} XP${unlocked ? ` · 🔓 Nivel ${lvlIdx + 2} desbloqueado` : ''}</span>`;
  $('bNext').style.display = win && lvlIdx < LEVELS.length - 1 ? '' : 'none';
  setTimeout(() => $('ovEnd').classList.add('show'), win ? 1200 : 600);
}
$('bRetry').onclick = () => { $('ovEnd').classList.remove('show'); newGame(lastSeed); };
$('bNew').onclick = () => { $('ovEnd').classList.remove('show'); newGame((Math.random() * 1e9) >>> 0); };
$('bNext').onclick = () => { $('ovEnd').classList.remove('show'); lvlIdx = Math.min(LEVELS.length - 1, lvlIdx + 1); newGame((Math.random() * 1e9) >>> 0); };
// ───────────── Tutorial guiado ─────────────
let tut = null;
function startTutorial() {
  lvlIdx = 0; newGame(4242); G.tut = true; WX.nextRolada = 1e9;
  const f = G.foci[0], bombs = G.units.filter(u => u.type === 'bomba');
  const town = G.towns.slice().sort((a, b) => cheb(a.cell, f) - cheb(b.cell, f))[0];
  const farm = G.farms.slice().sort((a, b) => cheb(a.cell, f) - cheb(b.cell, f))[0];
  const card = u => document.querySelector(`#units .uc[data-k="${G.units.indexOf(u)}"]`);
  const fire = () => { const b = burning[0] ?? f; focusOn(cellWorld(b)); cam.dist = Math.min(cam.dist, 300); };
  tut = {
    k: 0, done: 0, T0: null, hlObj: null, steps: [
      { t: 'Bienvenido al puesto de mando. Primero aprende a moverte: <b>arrastra el mapa con el botón izquierdo</b> del ratón.', ok: () => Math.hypot(cam.tx - tut.T0.tx, cam.tz - tut.T0.tz) > 50 },
      { t: 'Ahora <b>arrastra con el botón derecho</b> para girar e inclinar la vista. Te servirá para ver valles que tapa el relieve.', ok: () => Math.abs(cam.yaw - tut.T0.yaw) > .4 || Math.abs(cam.tilt - tut.T0.tilt) > .15 },
      { t: 'Usa la <b>rueda del ratón</b> para acercarte y alejarte. De cerca, la cámara baja casi a ras de suelo.', ok: () => Math.abs(cam.dist - tut.T0.dist) > 100 },
      { t: 'Vamos a por el fuego. Selecciona la <b>Bomba 1</b>: haz clic en su tarjeta, abajo a la izquierda.', hl: () => card(bombs[0]), go: fire, ok: () => G.sel && G.sel.obj === bombs[0] },
      { t: 'Con la Bomba 1 seleccionada, <b>haz clic en el mapa junto a las llamas</b>. Irá por carretera y empezará a echar agua al llegar.', go: fire, ok: () => bombs[0].task.type === 'attack' || bombs[0].sprayAt >= 0 },
      { t: 'En su tarjeta, la <b>barra azul</b> es el agua y la verde, el estado de la dotación. Cuando se queda sin agua va sola a repostar. Ahora selecciona la <b>Bomba 2</b> y mándala también al fuego.', hl: () => card(bombs[1]), ok: () => ['attack', 'refill'].includes(bombs[1].task.type) || bombs[1].sprayAt >= 0 },
      { t: 'Mira la <b>brújula</b> de arriba: la flecha azul indica hacia dónde empuja el viento. El fuego corre más en esa dirección y cuesta arriba. Pulsa <b>pausa</b> (⏸ o la barra espaciadora).', hl: () => $('speed'), ok: () => G.speed === 0 },
      { t: 'En pausa puedes pensar con calma y seguir dando órdenes. Reanuda con <b>▶</b>.', hl: () => $('speed'), ok: () => G.speed > 0 },
      { t: `Los pueblos hay que evacuarlos antes de que llegue el fuego. Haz clic en <b>${town.name}</b> (la etiqueta que parpadea) y pulsa «Activar alarma de evacuación». En una partida normal solo conviene hacerlo si el fuego se acerca, porque cuesta dinero.`, obj: town, go: () => { focusOn(cellWorld(town.cell)); cam.dist = Math.max(cam.dist, 320); }, ok: () => town.alarm },
      { t: `El ganado no escapa solo. Haz clic en <b>${farm.name}</b> y pulsa «Enviar el camión de ganado». Lo llevará a la base, que es zona segura.`, obj: farm, go: () => { focusOn(farm.grp.position); cam.dist = Math.max(cam.dist, 300); }, ok: () => farm.state !== 'waiting' || G.units.some(u => u.type === 'ganado' && u.task.type === 'load') },
      { t: 'Para cerrar un panel usa la <b>✕</b> o la tecla Esc. Lee los <b>mensajes de la derecha</b>: avisan de cambios de viento, casas en peligro y focos nuevos.<br>Ahora usa <b>x2 o x4</b> para ir más rápido y <b>apaga el incendio del todo</b>. ¡Suerte!', hl: () => $('speed'), ok: () => false },
    ]
  };
  tutShow();
}
function tutShow() {
  const s = tut.steps[tut.k]; tut.T0 = { ...cam }; tut.done = 0;
  if (s.go) s.go();
  tut.hlObj = s.obj || null;
  const last = tut.k === tut.steps.length - 1;
  $('coach').innerHTML = `<div class="cs">Tutorial · paso ${tut.k + 1} de ${tut.steps.length}</div><p>${s.t}</p><div class="row">${last ? '' : '<button id="tSkip">Saltar paso</button>'}<button id="tExit">Salir del tutorial</button></div>`;
  $('coach').classList.add('show');
  if ($('tSkip')) $('tSkip').onclick = tutNext;
  $('tExit').onclick = () => { tutClear(); $('coach').classList.remove('show'); tut = null; };
}
function tutNext() { if (!tut) return; tut.k = Math.min(tut.steps.length - 1, tut.k + 1); tutShow(); }
function tutClear() { document.querySelectorAll('.hl:not(.lbl)').forEach(e => e.classList.remove('hl')); }
function tutTick() {
  if (!tut || G.over) return;
  const s = tut.steps[tut.k];
  tutClear(); const el = s.hl && s.hl(); if (el) el.classList.add('hl');
  if (!tut.done && s.ok()) { tut.done = 1; $('coach').classList.add('ok'); setTimeout(() => { $('coach').classList.remove('ok'); tutNext(); }, 900); }
}
function tutEnd(win) {
  tutClear(); $('coach').classList.remove('show'); tut = null;
  setTimeout(() => { if (win) $('endP').innerHTML = '¡Tutorial superado! Ya sabes lo básico. En el <b>hangar</b> puedes gastar la XP en brigadas, bulldozers, helicópteros e hidroaviones.'; }, 50);
}
$('bTut').onclick = () => { $('ovStart').classList.remove('show'); startTutorial(); };
function renderLevels() {
  if (!prof.tut) $('bTut').classList.add('go'); else $('bTut').classList.remove('go');
  if (lvlIdx > prof.maxLvl) lvlIdx = prof.maxLvl;
  $('lvls').innerHTML = LEVELS.map((L, k) => `<button data-k="${k}" class="${k === lvlIdx ? 'on' : ''}" ${k > prof.maxLvl ? 'disabled title="Supera el nivel anterior para desbloquearlo"' : ''}><b>${k > prof.maxLvl ? '🔒' : k + 1}</b><small>${L.desc}</small></button>`).join('');
  $('lvls').querySelectorAll('button').forEach(b => b.onclick = () => { lvlIdx = +b.dataset.k; renderLevels(); });
  $('xpTot').textContent = prof.xp + ' XP';
}
$('bStart').onclick = () => { $('ovStart').classList.remove('show'); newGame((Math.random() * 1e9) >>> 0); };
// ───────────── Tienda (hangar) ─────────────
function renderShop() {
  $('shopXp').textContent = prof.xp + ' XP';
  const card = it => {
    const n = own(it.id), maxed = n >= it.max, locked = it.lvl > prof.maxLvl + 1, price = maxed ? 0 : it.price[n], can = !locked && !maxed && prof.xp >= price;
    const lv = it.max > 1 ? `<span class="lv">${n}/${it.max}</span>` : n ? '<span class="lv">✔</span>' : '';
    return `<div class="item ${locked ? 'locked' : ''}"><div class="iic">${it.ic}</div><div><b>${it.n}</b>${lv}<p>${it.d}</p></div><button data-id="${it.id}" class="${can ? 'buy' : ''}" ${can ? '' : 'disabled'}>${locked ? '🔒 Nivel ' + it.lvl : maxed ? (it.max > 1 ? 'Completo' : 'Comprado') : price + ' XP'}</button></div>`;
  };
  $('shopUnits').innerHTML = SHOP.filter(i => i.kind === 'unit').map(card).join('');
  $('shopUpg').innerHTML = SHOP.filter(i => i.kind === 'upg').map(card).join('');
  $('ovShop').querySelectorAll('button[data-id]').forEach(b => b.onclick = () => {
    const it = SHOP.find(i => i.id === b.dataset.id), n = own(it.id); if (n >= it.max) return; const p = it.price[n]; if (prof.xp < p) return;
    prof.xp -= p; prof.own[it.id] = n + 1; saveProf(); renderShop(); renderLevels();
  });
}
const openShop = () => { renderShop(); $('ovShop').classList.add('show'); };
$('bShop').onclick = openShop; $('bShop2').onclick = openShop;
$('bShopClose').onclick = () => $('ovShop').classList.remove('show');
$('bReset').onclick = () => { // doble pulsación en vez de confirm(), que no funciona dentro de claude.ai
  const b = $('bReset');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Pulsa otra vez para borrar XP, compras y niveles'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reiniciar progreso'; }, 4000); return; }
  delete b.dataset.armed; b.textContent = 'Reiniciar progreso';
  prof = { xp: 0, maxLvl: 0, own: {} }; saveProf(); renderShop(); renderLevels();
};
renderLevels();

// ───────────── Bucle principal ─────────────
function resize() {
  const w = innerWidth, h = innerHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  pScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', resize); resize();
// coloca el tutorial, los mensajes y el panel debajo de la barra superior sin que se tapen
function layoutTop() {
  let y = $('top').getBoundingClientRect().bottom + 8; const co = $('coach');
  co.style.top = y + 'px';
  const narrow = innerWidth <= 1180;
  if (co.classList.contains('show') && narrow) y = co.getBoundingClientRect().bottom + 8;
  $('log').style.top = y + 'px';
  $('panel').style.top = innerWidth <= 900 ? y + 'px' : '';
}
let last = performance.now(), acc = 0, hudAcc = 0, mmAcc = 0;
const STEP = .1;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!G) { renderer.render(scene, camera); return; }
  const gdt = G.over ? 0 : dt * G.speed;
  if (!G.over) { acc += gdt; let n = 0; while (acc >= STEP && n++ < 12) { simStep(STEP); acc -= STEP; } }
  updateCamera(dt); updateVisuals(dt, gdt); updateLabels();
  hudAcc += dt; if (hudAcc > .25) { hudAcc = 0; updateHUD(); updateHover(); layoutTop(); }
  mmAcc += dt; if (mmAcc > .5) { mmAcc = 0; drawMinimap(); }
  renderer.render(scene, camera);
}
// Escena de fondo para el menú
{ const li = lvlIdx; lvlIdx = 0; newGame(12345); G.demo = true; lvlIdx = li; } G.speed = 0; setSpeed(0);
$('loading').remove();
requestAnimationFrame(frame);
// Acceso de depuración (pruebas)
window.RT = {
  get G() { return G; }, ignite, cam, flames, smoke, water, WX, burning: () => burning, order, taskAttack, activateAlarm,
  get prof() { return prof; }, saveProf, airOrder, startCut, line4, cutPower, newGame, clickAt, get STATE() { return STATE; }, get VEG() { return VEG; }, get WET() { return WET; }, sunElev,
  sim(sec) { const t0 = performance.now(); for (let k = 0; k < sec / STEP && !G.over; k++) simStep(STEP); updateVisuals(.05, .05); updateCamera(1); updateLabels(); updateHUD(); drawMinimap(); renderer.render(scene, camera); return Math.round(performance.now() - t0) + ' ms'; },
  frame() { updateCamera(1); updateVisuals(.05, .05); updateLabels(); updateHUD(); renderer.render(scene, camera); }
};
