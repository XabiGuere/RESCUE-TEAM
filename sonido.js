// Línea de Fuego — sonido generado por código (Web Audio), sin archivos de audio
// juego.js decide cuánto se oye cada cosa; aquí solo se sintetiza.

let ctx = null, master = null, comp = null, white = null, brown = null;
let muted = false, vol = .8;
const amb = {}, voices = new Map();
let nextCrk = 0, nextCricket = 0, lastUi = 0;
try { muted = localStorage.getItem('rt-snd') === '0'; } catch (e) { }

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const filt = (type, f, q = .8) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const gainN = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };
const to = (p, v, tc = .12) => p.setTargetAtTime(v, ctx.currentTime, tc);
function loop(buf) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 1.5); return s; }
function osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }

export const isOn = () => !muted;
export const ready = () => !!ctx;

// Se crea en el primer toque o clic (los navegadores no dejan sonar antes)
export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = gainN(muted ? 0 : vol); comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  const n = ctx.sampleRate * 2;
  white = ctx.createBuffer(1, n, ctx.sampleRate); brown = ctx.createBuffer(1, n, ctx.sampleRate);
  const w = white.getChannelData(0), b = brown.getChannelData(0); let last = 0;
  for (let i = 0; i < n; i++) { w[i] = Math.random() * 2 - 1; last = (last + .02 * w[i]) / 1.02; b[i] = last * 3.5; }
  // viento: silbido + cuerpo grave
  amb.windF = filt('bandpass', 500, .6); amb.windG = gainN(); chain(loop(white), amb.windF, amb.windG, master);
  amb.windLo = gainN(); chain(loop(brown), filt('lowpass', 260), amb.windLo, master);
  // fuego: rugido grave (el crepitar se programa a golpes en frame)
  amb.roar = gainN(); chain(loop(brown), filt('lowpass', 180), amb.roar, master);
  amb.crk = gainN(1); chain(amb.crk, filt('highpass', 700), master);
  // lluvia
  amb.rain = gainN(); chain(loop(white), filt('highpass', 2200), filt('lowpass', 9000), amb.rain, master);
  // grillos (se programan a ráfagas)
  amb.crick = gainN(1); chain(amb.crick, master);
}

export function setMuted(m) { muted = m; try { localStorage.setItem('rt-snd', m ? '0' : '1'); } catch (e) { } if (ctx) to(master.gain, m ? 0 : vol, .05); }
export function suspend(s) { if (!ctx) return; if (s) ctx.suspend(); else ctx.resume(); }

// Ambiente: viento (0-1), racha (0-1), lluvia (0-1), noche (0-1), fuego cercano (0-1), pausa
export function ambient(p) {
  if (!ctx) return;
  const t = ctx.currentTime, k = p.paused ? .5 : 1;
  to(amb.windG.gain, (.03 + .2 * p.wind + .15 * p.gust) * k, .4); to(amb.windF.frequency, 350 + 900 * p.wind + 500 * p.gust, .5);
  to(amb.windLo.gain, (.04 + .25 * p.wind + .2 * p.gust) * k, .5);
  to(amb.roar.gain, .55 * p.fire * (p.paused ? .4 : 1), .3);
  to(amb.rain.gain, .22 * p.rain, .6);
  // crepitar: chasquidos breves con ritmo proporcional al fuego que se ve
  const rate = 30 * p.fire * (p.paused ? .3 : 1);
  if (rate < .2) nextCrk = t + .1;
  while (rate >= .2 && nextCrk < t + .12) {
    if (nextCrk < t) nextCrk = t;
    const s = ctx.createBufferSource(); s.buffer = white; const g = gainN(0), f = filt('bandpass', 900 + Math.random() * 3500, 1.2);
    const peak = (.15 + Math.random() * .6) * Math.min(1, p.fire * 1.6), dur = .006 + Math.random() * .03;
    g.gain.setValueAtTime(peak, nextCrk); g.gain.exponentialRampToValueAtTime(.0001, nextCrk + dur);
    chain(s, f, g, amb.crk); s.start(nextCrk, Math.random() * 1.8, dur + .02);
    nextCrk += -Math.log(1 - Math.random()) / rate;
  }
  // grillos de noche, si no hay fuego ni lluvia cerca
  const cr = p.night * (1 - p.rain) * (1 - Math.min(1, p.fire * 3)) * (p.paused ? .6 : 1);
  if (cr > .1 && t > nextCricket) {
    nextCricket = t + .7 + Math.random() * 1.6;
    const f = 4200 + Math.random() * 500;
    for (let k2 = 0; k2 < 3; k2++) { const o = ctx.createOscillator(), g = gainN(0); o.frequency.value = f; const t0 = t + k2 * .055; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.025 * cr, t0 + .01); g.gain.linearRampToValueAtTime(0, t0 + .035); chain(o, g, amb.crick); o.start(t0); o.stop(t0 + .05); }
  }
}

// ── Voces de los medios: cada una tiene volumen y panorama propios ──
function makeVoice(kind) {
  const out = gainN(0), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) chain(out, pan, master); else out.connect(master);
  const v = { kind, out, pan, nodes: [], g: {} };
  const keep = (...n) => { v.nodes.push(...n); return n[0]; };
  if (kind === 'heli') {
    // rotor: ruido grave «golpeado» a 17 Hz + silbido de turbina
    const rg = gainN(0), lfo = keep(osc('square', 17)), lg = gainN(0); chain(lfo, lg, rg.gain);
    chain(keep(loop(brown)), filt('lowpass', 420), rg, out); v.g.rot = rg; v.g.lfo = lg;
    v.g.whine = gainN(0); chain(keep(osc('sine', 640)), v.g.whine, out);
  } else if (kind === 'avion') {
    const f = filt('lowpass', 750); v.g.prop = gainN(0); chain(f, v.g.prop, out);
    v.o1 = keep(osc('sawtooth', 92)); v.o2 = keep(osc('sawtooth', 185)); v.o1.connect(f); v.o2.connect(f);
  } else if (kind === 'pueblo') {
    // sirena de evacuación: lamento que sube y baja
    v.o1 = keep(osc('sawtooth', 500)); v.g.siren = gainN(0); chain(v.o1, filt('lowpass', 1800), v.g.siren, out);
  } else {
    // vehículo de tierra: motor + rodadura
    v.o1 = keep(osc('sawtooth', kind === 'bulldozer' ? 38 : 55)); v.g.eng = gainN(0); chain(v.o1, filt('lowpass', kind === 'bulldozer' ? 260 : 340), v.g.eng, out);
    v.g.road = gainN(0); chain(keep(loop(brown)), filt('lowpass', 500), v.g.road, out);
    if (kind === 'bomba' || kind === 'ambu' || kind === 'poli') {
      v.o2 = keep(osc(kind === 'poli' ? 'sawtooth' : 'triangle', 435)); v.g.siren = gainN(0); chain(v.o2, filt('lowpass', kind === 'poli' ? 1600 : 2200), v.g.siren, out);
    }
    if (kind === 'bomba') { v.g.spray = gainN(0); chain(keep(loop(white)), filt('bandpass', 1100, .7), v.g.spray, out); }
    if (kind === 'bulldozer' || kind === 'brigada') { v.g.work = gainN(0); chain(keep(loop(white)), filt('bandpass', kind === 'brigada' ? 2600 : 700, 2), v.g.work, out); }
  }
  return v;
}
// p: { vis 0-1, pan -1..1, move, spray, siren, fly, work }
export function voice(id, kind, p) {
  if (!ctx) return;
  let v = voices.get(id);
  if (!v) { if (p.vis < .01) return; v = makeVoice(kind); voices.set(id, v); }
  const t = ctx.currentTime;
  to(v.out.gain, p.vis, .2); if (v.pan) to(v.pan.pan, clamp(p.pan, -1, 1) * .8, .1);
  if (kind === 'heli') { to(v.g.whine.gain, p.fly ? .02 : 0, .5); to(v.g.rot.gain, p.fly ? .35 : 0, .6); to(v.g.lfo.gain, p.fly ? .3 : 0, .6); }
  else if (kind === 'avion') { to(v.g.prop.gain, p.fly ? .12 : 0, .6); }
  else if (kind === 'pueblo') { v.o1.frequency.setTargetAtTime(520 + 380 * (.5 - .5 * Math.cos(t * Math.PI / 2.2)), t, .05); to(v.g.siren.gain, p.siren ? .07 : 0, .3); }
  else {
    to(v.g.eng.gain, p.move ? .1 : .025, .3); v.o1.frequency.setTargetAtTime((v.kind === 'bulldozer' ? 38 : 55) * (p.move ? 1.35 : 1), t, .4);
    to(v.g.road.gain, p.move ? .12 : 0, .3);
    if (v.g.siren) {
      // bomberos: bitonal lento · ambulancia: bitonal agudo y rápido · policía: aullido que sube y baja
      const f = kind === 'ambu' ? (Math.floor(t * 2.4) % 2 ? 700 : 950) : kind === 'poli' ? 650 + 650 * (.5 - .5 * Math.cos(t * Math.PI * 1.3)) : (Math.floor(t * 1.4) % 2 ? 435 : 580);
      v.o2.frequency.setTargetAtTime(f, t, kind === 'poli' ? .03 : .005); to(v.g.siren.gain, p.siren ? (kind === 'poli' ? .03 : .04) : 0, .1);
    }
    if (v.g.spray) to(v.g.spray.gain, p.spray ? .16 : 0, .15);
    if (v.g.work) to(v.g.work.gain, p.work ? .07 : 0, .2);
  }
}
export function clearVoices() { for (const v of voices.values()) { for (const n of v.nodes) { try { n.stop(); } catch (e) { } } v.out.disconnect(); } voices.clear(); }

// ── Efectos sueltos ──
function tone(f, t0, dur, g, type = 'sine', f2) { const o = ctx.createOscillator(), a = gainN(0); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur); a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(g, t0 + .01); a.gain.exponentialRampToValueAtTime(.0001, t0 + dur); chain(o, a, master); o.start(t0); o.stop(t0 + dur + .05); }
function burst(buf, t0, dur, g, type, f, attack = .01) { const s = ctx.createBufferSource(); s.buffer = buf; const a = gainN(0); a.gain.setValueAtTime(0, t0); a.gain.linearRampToValueAtTime(g, t0 + attack); a.gain.exponentialRampToValueAtTime(.0001, t0 + dur); chain(s, filt(type, f), a, master); s.start(t0, Math.random(), dur + .1); }
export function ui(kind) {
  if (!ctx) return; const t = ctx.currentTime;
  if (kind === 'click') { tone(950, t, .05, .08, 'sine', 620); return; }
  if (t - lastUi < .35) return; lastUi = t; // no amontonar avisos
  if (kind === 'radio') { burst(white, t, .09, .07, 'bandpass', 2200); tone(1250, t + .08, .09, .07, 'square'); tone(1650, t + .19, .09, .07, 'square'); }
  else if (kind === 'bad') { burst(white, t, .1, .09, 'bandpass', 1800); for (let k = 0; k < 3; k++) tone(880, t + .1 + k * .13, .09, .08, 'square'); }
  else if (kind === 'ok') { tone(700, t, .1, .08, 'triangle'); tone(1050, t + .1, .16, .08, 'triangle'); }
  else if (kind === 'win') { [523, 659, 784, 1046].forEach((f, k) => tone(f, t + k * .14, k === 3 ? 1.1 : .25, .12, 'triangle')); tone(1568, t + .42, 1.2, .04, 'sine'); }
  else if (kind === 'lose') { tone(220, t, 1.6, .14, 'sawtooth', 70); tone(330, t, 1.2, .06, 'triangle', 110); }
}
export function thunder(delay, near) { if (!ctx) return; const t = ctx.currentTime + delay; if (near) burst(white, t, .35, .25, 'highpass', 900, .005); burst(brown, t + .05, 3.2, .7, 'lowpass', 160, .08); burst(brown, t + .5, 2.5, .4, 'lowpass', 90, .3); }
export function splash(g) { if (!ctx || g < .02) return; const t = ctx.currentTime; burst(white, t, 1.4, .35 * g, 'lowpass', 1300, .05); burst(brown, t, 1.1, .4 * g, 'lowpass', 300, .03); }
