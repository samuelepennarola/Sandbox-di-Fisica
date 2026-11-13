import * as pl from '../../vendor/planck/planck.mjs';
import { deg, clamp, fmt } from '../core/math.js';
import { drawAxes, dragGuides, alignTo } from '../core/render.js';
import { SceneHistory } from '../core/history.js';
import { icons } from '../core/icons.js';
import { store } from '../core/store.js';
import { el } from '../core/ui.js';
import { crate, ball as ballShape } from '../core/shapes.js';
import { K, MU as UC, pointField, traceLine, drawFieldLines, drawFieldGrid, chargeSphere, chargeBadge } from '../core/electric.js';
import { slab, spring as springShape, rope as ropeShape, pulley as pulleyShape, anchorPlate, trail, dust, BODY_COLORS } from '../core/look.js';

// Costruttore libero: scena composta dall'utente, simulata con Planck.js (Box2D).
// La "spec" (oggetti + collegamenti) è la fonte di verità; a ogni modifica il mondo fisico viene ricostruito.

const DT = 1 / 240;
const V2 = (x, y) => new pl.Vec2(x, y);
const SURF_T = 0.12;   // spessore delle superfici (m)
const KV = 0.3;        // frecce di velocità: metri per (m/s)
const CHARGE_R = 0.12; // raggio di una carica fissa (m)
const KNC = 1e3;       // il campo uniforme si dà in kN/C

const NAMES = {
  block: 'Blocco', ball: 'Sfera', incline: 'Piano inclinato', surface: 'Superficie', anchor: 'Punto fisso',
  pulley: 'Carrucola', charge: 'Carica fissa', spring: 'Molla', rope: 'Fune', pulleyRope: 'Fune su carrucola', force: 'Forza costante',
};
const DYNAMIC = new Set(['block', 'ball']);

const MU = (label = 'Attrito μ') => ({ key: 'mu', label, unit: '', min: 0, max: 1.5, step: 0.01 });
const VX = { key: 'vx', label: 'Velocità iniziale vx', unit: 'm/s', min: -20, max: 20, step: 0.1 };
const VY = { key: 'vy', label: 'Velocità iniziale vy', unit: 'm/s', min: -20, max: 20, step: 0.1 };
const Q = { key: 'q', label: 'Carica elettrica q', unit: 'µC', min: -50, max: 50, step: 0.5, hardMin: -1e4, hardMax: 1e4 };
const PROPS = {
  block: [
    { key: 'm', label: 'Massa m', unit: 'kg', min: 0.1, max: 20, step: 0.1 },
    { key: 'w', label: 'Larghezza', unit: 'm', min: 0.1, max: 3, step: 0.05 },
    { key: 'h', label: 'Altezza', unit: 'm', min: 0.1, max: 3, step: 0.05 },
    { key: 'angle', label: 'Inclinazione', unit: '°', min: -90, max: 90, step: 1 },
    MU('Attrito μ con altri corpi'),
    { key: 'e', label: 'Elasticità negli urti e', unit: '', min: 0, max: 1, step: 0.05 },
    VX, VY, Q,
  ],
  ball: [
    { key: 'm', label: 'Massa m', unit: 'kg', min: 0.1, max: 20, step: 0.1 },
    { key: 'r', label: 'Raggio r', unit: 'm', min: 0.05, max: 2, step: 0.05 },
    MU('Attrito μ con altri corpi'),
    { key: 'e', label: 'Elasticità negli urti e', unit: '', min: 0, max: 1, step: 0.05 },
    VX, VY, Q,
  ],
  incline: [
    { key: 'alpha', label: 'Inclinazione α', unit: '°', min: 5, max: 75, step: 1 },
    { key: 'L', label: 'Lunghezza del piano L', unit: 'm', min: 1, max: 20, step: 0.1 },
    { key: 'dir', type: 'select', label: 'Verso', options: [{ value: 1, label: 'Sale a destra' }, { value: -1, label: 'Sale a sinistra' }] },
    MU('Attrito μ della superficie'),
  ],
  surface: [
    { key: 'L', label: 'Lunghezza', unit: 'm', min: 0.5, max: 30, step: 0.1 },
    { key: 'angle', label: 'Inclinazione', unit: '°', min: -90, max: 90, step: 1 },
    MU('Attrito μ della superficie'),
  ],
  anchor: [],
  pulley: [{ key: 'r', label: 'Raggio', unit: 'm', min: 0.05, max: 1, step: 0.01 }],
  charge: [Q],
  spring: [
    { key: 'k', label: 'Costante elastica k', unit: 'N/m', min: 1, max: 500, step: 1 },
    { key: 'L0', label: 'Lunghezza a riposo L₀', unit: 'm', min: 0.05, max: 10, step: 0.05 },
    { key: 'c', label: 'Smorzamento c', unit: 'N·s/m', min: 0, max: 20, step: 0.1 },
  ],
  rope: [{ key: 'L', label: 'Lunghezza della fune', unit: 'm', min: 0.1, max: 20, step: 0.05 }],
  pulleyRope: [],
  force: [
    { key: 'F', label: 'Modulo F', unit: 'N', min: 0, max: 200, step: 0.5 },
    { key: 'angle', label: 'Direzione', unit: '°', min: -180, max: 180, step: 1 },
  ],
};

const MAKE = {
  block: (x, y) => ({ type: 'block', x, y, angle: 0, w: 0.6, h: 0.4, m: 1, mu: 0.3, e: 0, vx: 0, vy: 0 }),
  ball: (x, y) => ({ type: 'ball', x, y, r: 0.25, m: 1, mu: 0.3, e: 0.5, vx: 0, vy: 0 }),
  incline: (x, y) => ({ type: 'incline', x: x - 4 * Math.cos(30 * deg) / 2, y: y < 1 ? 0 : y, alpha: 30, L: 4, dir: 1, mu: 0.3 }),
  surface: (x, y) => ({ type: 'surface', x, y, L: 3, angle: 0, mu: 0.3 }),
  anchor: (x, y) => ({ type: 'anchor', x, y }),
  pulley: (x, y) => ({ type: 'pulley', x, y, r: 0.2 }),
  chargePos: (x, y) => ({ type: 'charge', x, y, q: 10 }),
  chargeNeg: (x, y) => ({ type: 'charge', x, y, q: -10 }),
};

// Strumenti divisi per sezione: meccanica ed elettromagnetismo.
const TOOL_GROUPS = [
  ['Meccanica', [
    ['select', 'select', 'Seleziona'], ['block', 'block', 'Blocco'], ['ball', 'ball', 'Sfera'],
    ['incline', 'incline', 'Piano incl.'], ['surface', 'surface', 'Superficie'], ['anchor', 'anchor', 'Punto fisso'],
    ['pulley', 'pulley', 'Carrucola'], ['spring', 'spring', 'Molla'], ['rope', 'rope', 'Fune'],
    ['pulleyRope', 'pulley', 'Fune + carr.'], ['force', 'force', 'Forza'],
  ]],
  ['Elettromagnetismo', [
    ['chargePos', 'chargePlus', 'Carica +'], ['chargeNeg', 'chargeMinus', 'Carica −'],
  ]],
];

const B = { spec: null, sel: null, tool: 'select', pending: null, hover: null, api: null, resizing: null };

/* ---------------- Spec ---------------- */

function newSpec() {
  return { g: 9.81, muFloor: 0.3, E: 0, Eangle: 0, show: { fbd: true, all: false, vel: false, trail: false, field: true, Evec: false, Fe: true, dist: true }, objects: [], links: [], next: 1 };
}
function addObj(spec, o) { o.id = 'o' + spec.next++; spec.objects.push(o); return o; }
function addLink(spec, l) { l.id = 'l' + spec.next++; spec.links.push(l); return l; }
const objOf = (spec, id) => spec.objects.find(o => o.id === id);
const linkOf = (spec, id) => spec.links.find(l => l.id === id);
const selected = spec => B.sel && (objOf(spec, B.sel) || linkOf(spec, B.sel));
const save = () => { store.set('builder.scene', B.spec); B.hist?.record(); };

function nameOf(spec, item) {
  const list = item.type in PROPS && spec.objects.includes(item) ? spec.objects : spec.links;
  const same = list.filter(x => x.type === item.type);
  return `${NAMES[item.type]}${same.length > 1 ? ' ' + (same.indexOf(item) + 1) : ''}`;
}

function inclineVerts(o) {
  const b = o.L * Math.cos(o.alpha * deg), h = o.L * Math.sin(o.alpha * deg);
  return o.dir === -1 ? [[0, 0], [b, 0], [0, h]] : [[0, 0], [b, 0], [b, h]];
}

// Facce su cui un corpo può appoggiarsi, con normale rivolta verso l'alto.
function faces(spec) {
  const out = [{ p: [-1e4, 0], q: [1e4, 0] }];
  for (const o of spec.objects) {
    if (o.type === 'incline') {
      const v = inclineVerts(o).map(([x, y]) => [x + o.x, y + o.y]);
      out.push(o.dir === -1 ? { p: v[2], q: v[1] } : { p: v[0], q: v[2] });
    } else if (o.type === 'surface') {
      const a = o.angle * deg, ux = Math.cos(a), uy = Math.sin(a);
      let nx = -uy, ny = ux;
      if (ny < 0) { nx = -nx; ny = -ny; }
      out.push({ p: [o.x - ux * o.L / 2 + nx * SURF_T / 2, o.y - uy * o.L / 2 + ny * SURF_T / 2], q: [o.x + ux * o.L / 2 + nx * SURF_T / 2, o.y + uy * o.L / 2 + ny * SURF_T / 2] });
    }
  }
  return out.map(f => {
    const dx = f.q[0] - f.p[0], dy = f.q[1] - f.p[1], len = Math.hypot(dx, dy);
    let n = [-dy / len, dx / len];
    if (n[1] < 0) n = [-n[0], -n[1]];
    return { ...f, u: [dx / len, dy / len], n, len };
  });
}

// Appoggia un blocco o una sfera sulla faccia più vicina (allineando il blocco alla pendenza).
function snapBody(spec, o) {
  const half = o.type === 'block' ? o.h / 2 : o.r;
  let best = null;
  for (const f of faces(spec)) {
    const rx = o.x - f.p[0], ry = o.y - f.p[1];
    const t = rx * f.u[0] + ry * f.u[1];
    if (t < 0 || t > f.len) continue;
    const dist = rx * f.n[0] + ry * f.n[1];
    if (dist < -half * 0.5 || dist > half + 0.35) continue;
    const err = Math.abs(dist - half);
    if (!best || err < best.err) best = { f, t, err };
  }
  if (!best) return;
  const { f, t } = best;
  o.x = f.p[0] + f.u[0] * t + f.n[0] * half;
  o.y = f.p[1] + f.u[1] * t + f.n[1] * half;
  if (o.type === 'block') {
    let a = Math.atan2(f.u[1], f.u[0]) / deg;
    if (a > 90) a -= 180; if (a < -90) a += 180;
    o.angle = Math.round(a * 10) / 10;
  }
}

/* ---------------- Mondo fisico ---------------- */

// Punto di tangenza della fune sulla carrucola, dalla parte del corpo (la fune passa sopra la ruota).
function tangent(c, r, P, side) {
  const dx = P[0] - c[0], dy = P[1] - c[1], d = Math.hypot(dx, dy);
  if (d <= r * 1.001) return [c[0] + side * r, c[1]];
  const phi = Math.atan2(dy, dx), beta = Math.acos(r / d);
  const cands = [phi + beta, phi - beta].map(a => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  return cands.sort((A, Bp) => side * (Bp[0] - A[0]))[0];
}

function buildSim(src) {
  const spec = structuredClone(src);
  const world = new pl.World({ gravity: V2(0, -spec.g), allowSleep: false });
  const ground = world.createBody();
  ground.createFixture({ shape: new pl.Edge(V2(-1e4, 0), V2(1e4, 0)), friction: spec.muFloor });
  ground.setUserData({ id: 'floor', mu: spec.muFloor, e: 0, fixed: true });
  const bodies = new Map();

  for (const o of spec.objects) {
    let b;
    if (o.type === 'block') {
      b = world.createBody({ type: 'dynamic', position: V2(o.x, o.y), angle: o.angle * deg, fixedRotation: true, linearVelocity: V2(o.vx, o.vy) });
      b.createFixture({ shape: new pl.Box(o.w / 2, o.h / 2), density: o.m / (o.w * o.h), friction: o.mu, restitution: o.e });
    } else if (o.type === 'ball') {
      b = world.createBody({ type: 'dynamic', position: V2(o.x, o.y), linearVelocity: V2(o.vx, o.vy) });
      b.createFixture({ shape: new pl.Circle(o.r), density: o.m / (Math.PI * o.r * o.r), friction: o.mu, restitution: o.e });
    } else if (o.type === 'incline') {
      b = world.createBody({ type: 'static', position: V2(o.x, o.y) });
      b.createFixture({ shape: new pl.Polygon(inclineVerts(o).map(([x, y]) => V2(x, y))), friction: o.mu });
    } else if (o.type === 'surface') {
      b = world.createBody({ type: 'static', position: V2(o.x, o.y), angle: o.angle * deg });
      b.createFixture({ shape: new pl.Box(o.L / 2, SURF_T / 2), friction: o.mu });
    } else if (o.type === 'charge') {
      b = world.createBody({ type: 'static', position: V2(o.x, o.y) });
      b.createFixture({ shape: new pl.Circle(CHARGE_R), friction: 0.2, restitution: 0.3 });
    } else {
      b = world.createBody({ type: 'static', position: V2(o.x, o.y) });
    }
    b.setUserData({ id: o.id, mu: o.mu ?? 0, e: o.e ?? 0, fixed: !DYNAMIC.has(o.type) });
    bodies.set(o.id, b);
  }

  // Attrito del contatto: quello della superficie fissa se c'è, altrimenti il minore dei due corpi.
  world.on('pre-solve', c => {
    const a = c.getFixtureA().getBody().getUserData(), b = c.getFixtureB().getBody().getUserData();
    if (!a || !b) return;
    c.setFriction(a.fixed && !b.fixed ? a.mu : b.fixed && !a.fixed ? b.mu : Math.min(a.mu, b.mu));
    c.setRestitution(Math.max(a.e, b.e));
  });

  const joints = new Map(), geo = {};
  for (const l of spec.links) {
    if (l.type === 'rope') {
      const bA = bodies.get(l.a.o), bB = bodies.get(l.b.o);
      if (!bA || !bB || (!bA.isDynamic() && !bB.isDynamic())) continue;
      joints.set(l.id, world.createJoint(new pl.RopeJoint({
        localAnchorA: V2(l.a.lx, l.a.ly), localAnchorB: V2(l.b.lx, l.b.ly), maxLength: l.L, collideConnected: true,
      }, bA, bB)));
    } else if (l.type === 'pulleyRope') {
      const p = objOf(spec, l.p), bA = bodies.get(l.a.o), bB = bodies.get(l.b.o);
      if (!p || !bA || !bB) continue;
      const pa = bA.getPosition(), pb = bB.getPosition();
      const side = pb.x >= pa.x ? 1 : -1;
      const ga = tangent([p.x, p.y], p.r, [pa.x, pa.y], -side), gb = tangent([p.x, p.y], p.r, [pb.x, pb.y], side);
      geo[l.id] = { ga, gb, la0: Math.hypot(pa.x - ga[0], pa.y - ga[1]) };
      joints.set(l.id, world.createJoint(new pl.PulleyJoint({ collideConnected: true }, bA, bB, V2(...ga), V2(...gb), V2(pa.x, pa.y), V2(pb.x, pb.y), 1)));
    }
  }

  const s = {
    t: 0, world, ground, bodies, joints, geo, spec,
    trails: {}, forces: {}, springs: {}, tensions: {}, accel: {}, prevV: {},
    Wext: 0, E0: null, energy: null, mouse: null, lastTrail: 0,
  };
  for (const [id, b] of bodies) if (b.isDynamic()) { const p = b.getPosition(); s.trails[id] = [[p.x, p.y]]; }

  // Passo "di prova" per conoscere le forze di contatto a t = 0, poi si ripristina lo stato iniziale.
  const saved = [...bodies].filter(([, b]) => b.isDynamic()).map(([, b]) => [b, b.getPosition().clone(), b.getAngle(), b.getLinearVelocity().clone(), b.getAngularVelocity()]);
  physStep(s, DT);
  s.forces = computeForces(s);
  for (const [b, p, a, v, w] of saved) { b.setTransform(p, a); b.setLinearVelocity(v); b.setAngularVelocity(w); }
  s.Wext = 0;
  return s;
}

function endpoint(s, ep) {
  const b = s.bodies.get(ep.o) ?? s.ground;
  const p = b.getWorldPoint(V2(ep.lx, ep.ly));
  return { b, p: [p.x, p.y] };
}

// Un passo di integrazione: forze elastiche e applicate, poi il risolutore di Box2D.
function physStep(s, dt) {
  const work = [];   // forze esterne del passo: il loro lavoro si integra con la velocità media (prima e dopo il passo)
  for (const l of s.spec.links) {
    if (l.type === 'spring') {
      const A = endpoint(s, l.a), Bp = endpoint(s, l.b);
      const dx = Bp.p[0] - A.p[0], dy = Bp.p[1] - A.p[1], L = Math.hypot(dx, dy) || 1e-9;
      const ux = dx / L, uy = dy / L;
      const vA = A.b.getLinearVelocityFromWorldPoint(V2(...A.p)), vB = Bp.b.getLinearVelocityFromWorldPoint(V2(...Bp.p));
      const F = l.k * (L - l.L0) + l.c * ((vB.x - vA.x) * ux + (vB.y - vA.y) * uy); // > 0: la molla tira
      if (A.b.isDynamic()) A.b.applyForce(V2(F * ux, F * uy), V2(...A.p), true);
      if (Bp.b.isDynamic()) Bp.b.applyForce(V2(-F * ux, -F * uy), V2(...Bp.p), true);
      s.springs[l.id] = { F, L };
    } else if (l.type === 'force') {
      const b = s.bodies.get(l.o);
      if (!b) continue;
      const F = V2(l.F * Math.cos(l.angle * deg), l.F * Math.sin(l.angle * deg));
      b.applyForceToCenter(F, true);
      const v = b.getLinearVelocity();
      work.push({ b, F: [F.x, F.y], v0: [v.x, v.y] });
    }
  }
  for (const [id, F] of Object.entries(electricForces(s))) s.bodies.get(id).applyForceToCenter(V2(F[0], F[1]), true);
  if (s.mouse) {
    const f = s.mouse.j.getReactionForce(1 / dt), v = s.mouse.b.getLinearVelocity();
    work.push({ b: s.mouse.b, F: [f.x, f.y], v0: [v.x, v.y] });
  }
  for (const [id, b] of s.bodies) if (b.isDynamic()) { const v = b.getLinearVelocity(); s.prevV[id] = [v.x, v.y]; }
  s.world.step(dt, 10, 8);
  for (const { b, F, v0 } of work) { const v = b.getLinearVelocity(); s.Wext += (F[0] * (v0[0] + v.x) + F[1] * (v0[1] + v.y)) / 2 * dt; }
  for (const [id, b] of s.bodies) if (b.isDynamic()) {
    const v = b.getLinearVelocity(), p = s.prevV[id];
    s.accel[id] = [(v.x - p[0]) / dt, (v.y - p[1]) / dt];
  }
}

/* ---------------- Elettrostatica ---------------- */

// Cariche presenti: corpi con q ≠ 0 (nella posizione attuale) e cariche fisse. q in coulomb.
function chargesOf(st) {
  const out = [];
  for (const o of st.spec.objects) {
    if (!(o.q) || !(DYNAMIC.has(o.type) || o.type === 'charge')) continue;
    const T = xf(st, o.id);
    if (T) out.push({ id: o.id, x: T.x, y: T.y, q: o.q * UC, fixed: o.type === 'charge', r: o.type === 'charge' ? CHARGE_R : o.type === 'ball' ? o.r : Math.min(o.w, o.h) / 2 });
  }
  return out;
}

const uniformE = spec => [(spec.E ?? 0) * KNC * Math.cos((spec.Eangle ?? 0) * deg), (spec.E ?? 0) * KNC * Math.sin((spec.Eangle ?? 0) * deg)];

// Campo totale (N/C) in (x, y): campo uniforme più le cariche (esclusa quella con id skip).
function fieldAt(st, x, y, list = chargesOf(st), skip = null) {
  let [Ex, Ey] = uniformE(st.spec);
  for (const c of list) {
    if (c.id === skip) continue;
    const [ex, ey] = pointField(c.x, c.y, c.q, x, y);
    Ex += ex; Ey += ey;
  }
  return [Ex, Ey];
}

// Forza elettrica su ogni corpo carico: F = q·E, con E dovuto a tutto il resto. Le distanze troppo piccole
// (corpi compenetrati) sono limitate alla somma dei raggi, per non avere forze infinite.
function electricForces(st) {
  const list = chargesOf(st), out = {};
  for (const c of list) {
    if (c.fixed) continue;
    let [Fx, Fy] = uniformE(st.spec).map(e => e * c.q);
    for (const o of list) {
      if (o === c) continue;
      let dx = c.x - o.x, dy = c.y - o.y, r = Math.hypot(dx, dy);
      const rmin = (c.r + o.r) * 0.8;
      if (r < rmin) { if (r < 1e-9) { dx = 1; dy = 0; r = 1; } dx *= rmin / r; dy *= rmin / r; r = rmin; }
      const f = K * c.q * o.q / (r * r * r);
      Fx += f * dx; Fy += f * dy;
    }
    out[c.id] = [Fx, Fy];
  }
  return out;
}

// Forza elettrica su una carica (anche fissa), voce per voce: da ogni altra carica e dal campo uniforme.
function forceDetail(st, id, list = chargesOf(st)) {
  const c = list.find(o => o.id === id);
  if (!c) return null;
  const rows = [];
  for (const o of list) {
    if (o === c) continue;
    let dx = c.x - o.x, dy = c.y - o.y, r = Math.hypot(dx, dy);
    const rmin = (c.r + o.r) * 0.8, rr = Math.max(r, rmin, 1e-9);
    const f = K * c.q * o.q / (rr * rr * (r || 1));
    rows.push({ from: o.id, r, F: [f * dx, f * dy] });
  }
  const [Ux, Uy] = uniformE(st.spec);
  if (Ux || Uy) rows.push({ from: 'E', F: [c.q * Ux, c.q * Uy] });
  const R = rows.reduce((a, f) => [a[0] + f.F[0], a[1] + f.F[1]], [0, 0]);
  return { c, rows, R };
}

// Frecce delle forze elettriche su tutte le cariche (in scala tra loro); per la carica selezionata
// anche i singoli contributi, tratteggiati.
function drawElectricForces(P, st, sel, skip, all = false) {
  const list = chargesOf(st);
  if (!list.length) return;
  const data = list.map(c => forceDetail(st, c.id, list)).filter(d => d.rows.length);
  let maxF = 0, dmin = Infinity;
  for (const d of data) {
    maxF = Math.max(maxF, Math.hypot(...d.R));
    if (all || d.c.id === sel) for (const f of d.rows) maxF = Math.max(maxF, Math.hypot(...f.F));
  }
  for (const a of list) for (const b of list) if (a !== b) dmin = Math.min(dmin, Math.hypot(a.x - b.x, a.y - b.y));
  if (maxF <= 0) return;
  const kf = clamp(0.35 * (Number.isFinite(dmin) ? dmin : 2), 0.3, 1.5) / maxF;
  const name = id => id === 'E' ? 'E' : nameOf(st.spec, objOf(st.spec, id));
  for (const d of data) {
    const { c } = d;
    if (skip.has(c.id)) continue;
    // Con un solo contributo la freccia tratteggiata coinciderebbe con la risultante.
    if ((all || c.id === sel) && d.rows.length > 1) for (const f of d.rows) {
      // F₁₂ = forza esercitata da q₂ su q₁ (notazione dei libri di testo).
      P.arrow(c.x, c.y, c.x + kf * f.F[0], c.y + kf * f.F[1], { color: 'acc', width: 2.2, dash: [5, 4], alpha: 0.75, label: f.from === 'E' ? 'qE' : 'F' + subN(chargeNo(st.spec, c.id)) + subN(chargeNo(st.spec, f.from)) });
    }
    P.arrow(c.x, c.y, c.x + kf * d.R[0], c.y + kf * d.R[1], { color: 'acc', width: 3.5, label: 'F' + subN(chargeNo(st.spec, c.id)) });
    forceAngle(P, c.x, c.y, d.R);
  }
}

// Angolo di una forza rispetto all'asse x: riferimento orizzontale tratteggiato, arco e valore in gradi.
function forceAngle(P, x, y, F) {
  if (Math.hypot(...F) < 1e-12) return;
  const th = Math.atan2(F[1], F[0]), [a, b] = P.S(x, y), R = 30;
  const ctx = P.ctx;
  ctx.save();
  ctx.strokeStyle = P.c.muted; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + R + 16, b); ctx.stroke();
  ctx.restore();
  P.arc(x, y, R, Math.min(0, th), Math.max(0, th), { color: 'acc', width: 1.6, label: `${fmt(th / deg, 0)}°`, labelR: R + 15 });
}

// Con tre cariche: angoli interni del triangolo ai vertici.
function triangleAngles(P, list) {
  if (list.length !== 3) return;
  for (let i = 0; i < 3; i++) {
    const A = list[i], Bv = list[(i + 1) % 3], C = list[(i + 2) % 3];
    let a0 = Math.atan2(Bv.y - A.y, Bv.x - A.x), d = Math.atan2(C.y - A.y, C.x - A.x) - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    if (d < 0) { a0 += d; d = -d; }
    P.arc(A.x, A.y, 46, a0, a0 + d, { color: 'muted', width: 1.4, label: `${fmt(d / deg, 0)}°`, labelR: 62 });
  }
}
// Numero di una carica (q₁, q₂…) nell'ordine di creazione, contando corpi carichi e cariche fisse.
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const subN = n => String(n).split('').map(d => SUBS[+d]).join('');
function chargeNo(spec, id) { return spec.objects.filter(o => o.q && (DYNAMIC.has(o.type) || o.type === 'charge')).findIndex(o => o.id === id) + 1; }
const shortName = n => n.replace('Carica fissa', 'carica').replace('Sfera', 'sfera').replace('Blocco', 'blocco');

// Distanze tra le cariche: segmento tratteggiato e valore di r a metà.
function drawDistances(P, st) {
  const list = chargesOf(st);
  if (list.length > 7) return;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], r = Math.hypot(a.x - b.x, a.y - b.y);
    P.line([[a.x, a.y], [b.x, b.y]], { color: 'muted', width: 1.4, dash: [5, 5] });
    const [ma, mb] = P.S((a.x + b.x) / 2, (a.y + b.y) / 2), ang = Math.atan2(b.y - a.y, b.x - a.x);
    P.textS(ma - Math.sin(ang) * 12, mb - Math.cos(ang) * 12, `r = ${fmt(r, 2)} m`, { size: 12, align: 'center', color: 'muted' });
  }
  triangleAngles(P, list);
}

// Energia potenziale elettrica: coppie di cariche (k q₁q₂/r) più il campo uniforme (−q E·r).
function electricEnergy(st) {
  const list = chargesOf(st), [Ex, Ey] = uniformE(st.spec);
  let U = 0;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.fixed) U -= a.q * (Ex * a.x + Ey * a.y);
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (a.fixed && b.fixed) continue;
      U += K * a.q * b.q / Math.max(Math.hypot(a.x - b.x, a.y - b.y), (a.r + b.r) * 0.8);
    }
  }
  return U;
}

// Linee di campo: partono dalle cariche (una ogni µC circa) e, se c'è, da una fila di semi lungo il campo uniforme.
function fieldLines(st, box) {
  const list = chargesOf(st), [Ux, Uy] = uniformE(st.spec), U = Math.hypot(Ux, Uy);
  if (!list.length && !U) return [];
  const F = (x, y) => fieldAt(st, x, y, list);
  const step = (x, y) => {
    let near = Infinity;
    for (const c of list) near = Math.min(near, Math.hypot(x - c.x, y - c.y));
    return clamp(near * 0.15, 0.01, 0.12);
  };
  const stop = (x, y, i) => i > 2 && list.some(c => Math.hypot(x - c.x, y - c.y) < c.r * 0.6);
  const lines = [];
  for (const c of list) {
    const n = clamp(Math.round(Math.abs(c.q) / UC), 4, 32), dir = Math.sign(c.q), r0 = c.r * 1.05;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * 2 * Math.PI;
      lines.push({ pts: traceLine(F, c.x + r0 * Math.cos(a), c.y + r0 * Math.sin(a), dir, { box, step, stop, max: 500 }), dir });
    }
  }
  if (U) {
    // Semi su una retta perpendicolare al campo uniforme, attraverso il centro della vista.
    const ux = Ux / U, uy = Uy / U, cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const half = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2, sp = Math.max(0.35, half / 9);
    for (let t = -half + sp / 2; t < half; t += sp) {
      const x = cx - uy * t, y = cy + ux * t;
      if (list.some(c => Math.hypot(x - c.x, y - c.y) < c.r * 1.5)) continue;
      for (const dir of [1, -1]) lines.push({ pts: traceLine(F, x, y, dir, { box, step, stop, max: 500 }), dir });
    }
  }
  return lines;
}

// Forze agenti su ogni corpo dinamico nell'ultimo passo (per il diagramma di corpo libero).
function computeForces(s) {
  const inv = 1 / DT, out = {}, g = s.spec.g;
  const name = id => { const o = objOf(s.spec, id); return o ? nameOf(s.spec, o) : id === 'floor' ? 'suolo' : '?'; };
  for (const [id, b] of s.bodies) if (b.isDynamic()) {
    const c = b.getWorldCenter();
    out[id] = [{ n: 'Peso', l: 'P', c: 'weight', F: [0, -b.getMass() * g], at: [c.x, c.y] }];
  }
  for (let c = s.world.getContactList(); c; c = c.getNext()) {
    if (!c.isTouching()) continue;
    const man = c.getManifold();
    if (!man.pointCount) continue;
    const wm = c.getWorldManifold(null);
    if (!wm) continue;
    const bA = c.getFixtureA().getBody(), bB = c.getFixtureB().getBody();
    let N = 0, T = 0, px = 0, py = 0;
    for (let i = 0; i < man.pointCount; i++) {
      N += man.points[i].normalImpulse; T += man.points[i].tangentImpulse;
      px += wm.points[i].x; py += wm.points[i].y;
    }
    N *= inv; T *= inv; px /= man.pointCount; py /= man.pointCount;
    const n = wm.normal, tx = n.y, ty = -n.x;
    const push = (body, other, sg) => {
      const id = body.getUserData()?.id;
      if (!out[id]) return;
      const from = name(other.getUserData()?.id);
      if (Math.abs(N) > 1e-6) out[id].push({ n: `Normale (${from})`, l: 'N', c: 'normal', F: [sg * n.x * N, sg * n.y * N], at: [px, py] });
      if (Math.abs(T) > 1e-6) out[id].push({ n: `Attrito (${from})`, l: 'fa', c: 'friction', F: [sg * tx * T, sg * ty * T], at: [px, py] });
    };
    push(bB, bA, 1); push(bA, bB, -1);
  }
  const pull = (id, from, to, T, n, l, c) => {
    if (!out[id]) return;
    const dx = to[0] - from[0], dy = to[1] - from[1], d = Math.hypot(dx, dy) || 1;
    out[id].push({ n, l, c, F: [T * dx / d, T * dy / d], at: from });
  };
  s.tensions = {};
  for (const l of s.spec.links) {
    if (l.type === 'spring') {
      const sp = s.springs[l.id];
      if (!sp) continue;
      const A = endpoint(s, l.a), Bp = endpoint(s, l.b);
      pull(l.a.o, A.p, Bp.p, sp.F, 'Forza elastica', 'Fel', 'spring');
      pull(l.b.o, Bp.p, A.p, sp.F, 'Forza elastica', 'Fel', 'spring');
    } else if (l.type === 'rope' && s.joints.get(l.id)) {
      const T = s.joints.get(l.id).getReactionForce(inv).length();
      s.tensions[l.id] = T;
      const A = endpoint(s, l.a), Bp = endpoint(s, l.b);
      pull(l.a.o, A.p, Bp.p, T, 'Tensione', 'T', 'tension');
      pull(l.b.o, Bp.p, A.p, T, 'Tensione', 'T', 'tension');
    } else if (l.type === 'pulleyRope' && s.joints.get(l.id)) {
      const T = s.joints.get(l.id).getReactionForce(inv).length();
      s.tensions[l.id] = T;
      const A = endpoint(s, l.a), Bp = endpoint(s, l.b), { ga, gb } = s.geo[l.id];
      pull(l.a.o, A.p, ga, T, 'Tensione', 'T', 'tension');
      pull(l.b.o, Bp.p, gb, T, 'Tensione', 'T', 'tension');
    } else if (l.type === 'force' && out[l.o]) {
      const c = s.bodies.get(l.o).getWorldCenter();
      out[l.o].push({ n: 'Forza applicata', l: 'F', c: 'applied', F: [l.F * Math.cos(l.angle * deg), l.F * Math.sin(l.angle * deg)], at: [c.x, c.y] });
    }
  }
  for (const [id, F] of Object.entries(electricForces(s))) {
    if (!out[id]) continue;
    const c = s.bodies.get(id).getWorldCenter();
    out[id].push({ n: 'Forza elettrica', l: 'Fe', c: 'acc', F, at: [c.x, c.y] });
  }
  if (s.mouse && out[s.mouse.id]) {
    const f = s.mouse.j.getReactionForce(inv), a = s.mouse.j.getAnchorB();
    out[s.mouse.id].push({ n: 'Spinta della mano', l: 'Fm', c: 'applied', F: [f.x, f.y], at: [a.x, a.y] });
  }
  return out;
}

function energy(s) {
  let Kin = 0, Ug = 0, Uel = 0;
  for (const [, b] of s.bodies) if (b.isDynamic()) {
    const v = b.getLinearVelocity(), w = b.getAngularVelocity();
    Kin += 0.5 * b.getMass() * (v.x * v.x + v.y * v.y) + 0.5 * b.getInertia() * w * w;
    Ug += b.getMass() * s.spec.g * b.getWorldCenter().y;
  }
  for (const l of s.spec.links) if (l.type === 'spring') {
    const A = endpoint(s, l.a), Bp = endpoint(s, l.b);
    const L = Math.hypot(Bp.p[0] - A.p[0], Bp.p[1] - A.p[1]);
    Uel += 0.5 * l.k * (L - l.L0) ** 2;
  }
  return { K: Kin, Ug, Uel, Ue: electricEnergy(s) };
}

/* ---------------- Pose (vive o dalla moviola) ---------------- */

function xf(st, id) {
  const fr = st.frame?.poses[id];
  if (fr) return { x: fr[0], y: fr[1], a: fr[2] };
  const b = st.bodies.get(id);
  if (!b) return null;
  const p = b.getPosition();
  return { x: p.x, y: p.y, a: b.getAngle() };
}
function velOf(st, id) {
  const fr = st.frame?.poses[id];
  if (fr) return [fr[3], fr[4]];
  const v = st.bodies.get(id)?.getLinearVelocity();
  return v ? [v.x, v.y] : [0, 0];
}
const toW = (T, lx, ly) => [T.x + Math.cos(T.a) * lx - Math.sin(T.a) * ly, T.y + Math.sin(T.a) * lx + Math.cos(T.a) * ly];
const toL = (T, wx, wy) => { const dx = wx - T.x, dy = wy - T.y, c = Math.cos(T.a), s = Math.sin(T.a); return [c * dx + s * dy, -s * dx + c * dy]; };
const epW = (st, ep) => { const T = xf(st, ep.o); return T ? toW(T, ep.lx, ep.ly) : [ep.lx, ep.ly]; };

/* ---------------- Hit test ---------------- */

function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
  const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / L2, 0, 1);
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
function inTri(px, py, v) {
  const s = (a, b) => (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
  const d1 = s(v[0], v[1]), d2 = s(v[1], v[2]), d3 = s(v[2], v[0]);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function hitObj(st, o, wx, wy, tol) {
  const T = xf(st, o.id);
  if (!T) return false;
  const [lx, ly] = toL(T, wx, wy);
  switch (o.type) {
    case 'block': return Math.abs(lx) < o.w / 2 + tol && Math.abs(ly) < o.h / 2 + tol;
    case 'ball': return Math.hypot(lx, ly) < o.r + tol;
    case 'surface': return Math.abs(lx) < o.L / 2 + tol && Math.abs(ly) < SURF_T / 2 + tol;
    case 'incline': return inTri(lx, ly, inclineVerts(o));
    case 'anchor': return Math.hypot(lx, ly) < 0.08 + tol;
    case 'pulley': return Math.hypot(lx, ly) < o.r + tol;
    case 'charge': return Math.hypot(lx, ly) < CHARGE_R + tol;
  }
  return false;
}

function linkSegs(st, l) {
  if (l.type === 'force') {
    const T = xf(st, l.o);
    if (!T) return [];
    const k = forceScale(st);
    return [[[T.x, T.y], [T.x + k * l.F * Math.cos(l.angle * deg), T.y + k * l.F * Math.sin(l.angle * deg)]]];
  }
  if (l.type === 'pulleyRope') {
    const g = st.geo[l.id];
    return g ? [[epW(st, l.a), g.ga], [g.gb, epW(st, l.b)]] : [];
  }
  return [[epW(st, l.a), epW(st, l.b)]];
}

function hitTest(st, wx, wy, tol) {
  const spec = st.spec;
  const order = [
    ...spec.objects.filter(o => DYNAMIC.has(o.type)),
    ...spec.objects.filter(o => o.type === 'anchor' || o.type === 'pulley' || o.type === 'charge'),
  ];
  for (const o of order) if (hitObj(st, o, wx, wy, tol)) return o;
  for (const l of spec.links) if (linkSegs(st, l).some(([a, b]) => segDist(wx, wy, a, b) < tol)) return l;
  for (const o of spec.objects) if ((o.type === 'incline' || o.type === 'surface') && hitObj(st, o, wx, wy, tol)) return o;
  return null;
}

/* ---------------- Interazione ---------------- */

function select(id) {
  B.sel = id;
  B.api.rebuildPanel();
  B.api.refresh();
}

function setTool(t) {
  cancelPending();
  B.tool = t;
  B.api.rebuildPanel();
}

function cancelPending() {
  if (B.pending?.created) {
    B.spec.objects = B.spec.objects.filter(o => o.id !== B.pending.created);
    save(); B.api.reset();
  }
  B.pending = null;
}

function finishEdit(selId) {
  B.tool = 'select';
  B.pending = null;
  save();
  B.api.reset();
  select(selId);
}

// Copia dell'oggetto selezionato, spostata a destra di mezzo metro; la copia diventa la selezione.
function duplicate(o) {
  const c = addObj(B.spec, { ...structuredClone(o), id: undefined, x: Math.round((o.x + 0.5) * 100) / 100 });
  if (DYNAMIC.has(c.type)) snapBody(B.spec, c);
  finishEdit(c.id);
}

// Molla o fune che parte dal corpo selezionato: il prossimo tocco sceglie l'altro estremo.
function startLink(type, o) {
  B.tool = type;
  B.pending = { type, a: { o: o.id, lx: 0, ly: 0 } };
  B.api.rebuildPanel();
}

function deleteSelected() {
  const id = B.sel;
  if (!id) return;
  const spec = B.spec;
  spec.objects = spec.objects.filter(o => o.id !== id);
  spec.links = spec.links.filter(l => l.id !== id && l.o !== id && l.p !== id && l.a?.o !== id && l.b?.o !== id);
  B.sel = null;
  save(); B.api.reset(); B.api.rebuildPanel(); B.api.refresh();
}

// Estremo di una molla o di una fune nel punto toccato: centro di un corpo, punto di un oggetto fisso,
// oppure un nuovo punto fisso nello spazio vuoto.
function pickEndpoint(st, wx, wy, tol) {
  const hit = hitTest(st, wx, wy, tol);
  if (hit && hit.type in PROPS && B.spec.objects.some(o => o.id === hit.id)) {
    if (DYNAMIC.has(hit.type) || hit.type === 'anchor' || hit.type === 'pulley' || hit.type === 'charge') return { o: hit.id, lx: 0, ly: 0 };
    const [lx, ly] = toL(xf(st, hit.id), wx, wy);
    return { o: hit.id, lx, ly };
  }
  const a = addObj(B.spec, MAKE.anchor(wx, wy));
  return { o: a.id, lx: 0, ly: 0, created: a.id };
}

// Trascinamento di un oggetto: modifica la scena (e riporta a t = 0) solo se il dito si muove davvero,
// così un semplice tocco seleziona senza perdere la simulazione in corso.
function moveGesture(o, wx0, wy0) {
  const ox = o.x, oy = o.y;
  let moved = false;
  // Punti a cui allinearsi: centri degli altri oggetti (e l'origine degli assi).
  const others = [[0, 0], ...B.spec.objects.filter(p => p !== o && 'x' in p && p.type !== 'incline').map(p => [p.x, p.y])];
  return {
    move: ({ wx, wy }) => {
      if (!moved && Math.hypot(wx - wx0, wy - wy0) * B.api.cam.scale < 5) return;
      moved = true;
      // Le posizioni scattano su una griglia (5 cm per gli oggetti fissi, 1 cm per i corpi, che poi si appoggiano)
      // e si agganciano agli allineamenti con gli altri oggetti, mostrati da linee guida.
      const g = DYNAMIC.has(o.type) ? 0.01 : 0.05;
      const al = alignTo(ox + wx - wx0, oy + wy - wy0, others, 10 / B.api.cam.scale);
      const gs = v => +(Math.round(v / g) * g).toFixed(4);
      o.x = al.vx ?? gs(al.x); o.y = al.hy ?? gs(al.y);
      if (o.type === 'incline') o.y = Math.max(0, o.y);
      if (DYNAMIC.has(o.type)) snapBody(B.spec, o);
      B.drag = { o, vx: al.vx, hy: o.y === al.hy ? al.hy : null };
      B.api.reset();
    },
    up: () => { B.drag = null; if (moved) { save(); B.api.refresh(); } },
    cancel: () => { B.drag = null; },
  };
}

function pullGesture(st, o, wx, wy) {
  const b = st.bodies.get(o.id);
  const j = st.world.createJoint(new pl.MouseJoint({ maxForce: 60 * b.getMass() * st.spec.g, frequencyHz: 4, dampingRatio: 0.8 }, st.ground, b, V2(wx, wy)));
  st.mouse = { j, b, id: o.id };
  const end = () => { st.world.destroyJoint(j); st.mouse = null; };
  return { move: ({ wx, wy }) => j.setTarget(V2(wx, wy)), up: end, cancel: end };
}

function hint() {
  const p = B.pending;
  switch (B.tool) {
    case 'select': return 'Tocca un oggetto per modificarlo, trascinalo per spostarlo. Durante la simulazione puoi tirare i corpi.';
    case 'block': case 'ball': return 'Tocca la scena per posizionarlo: vicino a un piano si appoggia da solo.';
    case 'spring': case 'rope': return p ? 'Ora tocca il secondo estremo.' : 'Tocca il primo estremo: un corpo, un punto fisso o uno spazio vuoto (crea un punto fisso).';
    case 'pulleyRope': return !p ? 'Tocca una carrucola (o uno spazio vuoto per crearla).' : !p.a ? 'Tocca il primo corpo.' : 'Tocca il secondo corpo.';
    case 'force': return 'Tocca il corpo a cui applicare la forza.';
    case 'chargePos': case 'chargeNeg': return 'Tocca la scena per posizionare la carica fissa. Per caricare un blocco o una sfera, selezionalo e cambia la sua carica q.';
    default: return 'Tocca la scena per posizionarlo.';
  }
}

/* ---------------- Disegno ---------------- */

function forceScale(st) {
  let w = 1;
  for (const o of st.spec.objects) if (DYNAMIC.has(o.type)) w = Math.max(w, o.m * st.spec.g);
  return 1.3 / w;
}

// Colore di un corpo: dipende dall'ordine in cui è stato creato.
function colorOf(spec, o) {
  const i = spec.objects.filter(x => DYNAMIC.has(x.type)).indexOf(o);
  return BODY_COLORS[Math.max(0, i) % BODY_COLORS.length];
}

// Punti di una fune lenta: piccola curva verso il basso.
function ropePts(a, b, len) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len == null || d >= len - 0.01) return { pts: [a, b], slack: false };
  const sag = Math.sqrt(Math.max(0, len * len - d * d)) / 2, pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t)]);
  }
  return { pts, slack: true };
}

// Fune che passa sopra la carrucola: tratto A → tangenza, arco sopra la ruota, tangenza → B.
function pulleyRopePts(st, l) {
  const g = st.geo[l.id], p = objOf(st.spec, l.p);
  if (!g || !p) return null;
  const norm = a => { while (a <= -Math.PI / 2) a += 2 * Math.PI; while (a > 1.5 * Math.PI) a -= 2 * Math.PI; return a; };
  const aa = norm(Math.atan2(g.ga[1] - p.y, g.ga[0] - p.x)), ab = norm(Math.atan2(g.gb[1] - p.y, g.gb[0] - p.x));
  const arc = [];
  for (let i = 0; i <= 20; i++) { const a = aa + (ab - aa) * i / 20; arc.push([p.x + p.r * Math.cos(a), p.y + p.r * Math.sin(a)]); }
  return [epW(st, l.a), ...arc, epW(st, l.b)];
}

// Rotazione della ruota di una carrucola: quanta fune è scorsa dal lato del primo corpo.
function pulleyAngle(st, p) {
  const l = st.spec.links.find(k => k.type === 'pulleyRope' && k.p === p.id), g = l && st.geo[l.id];
  if (!g) return 0;
  const A = epW(st, l.a);
  return (Math.hypot(A[0] - g.ga[0], A[1] - g.ga[1]) - g.la0) / p.r;
}

/* ---------------- Ridimensionamento con le maniglie ---------------- */

// Maniglie dell'oggetto selezionato: cambiano le misure vere (quelle usate dalla fisica).
function resizeHandles(st) {
  const o = objOf(B.spec, B.sel);
  if (!o) return [];
  const T = xf(st, o.id);
  if (!T) return [];
  const D = Math.SQRT1_2;
  switch (o.type) {
    case 'block': { const [x, y] = toW(T, o.w / 2, o.h / 2); return [{ id: 'corner', x, y }]; }
    case 'ball': return [{ id: 'radius', x: T.x + o.r * D, y: T.y - o.r * D }];
    case 'pulley': return [{ id: 'radius', x: o.x + o.r * D, y: o.y - o.r * D }];
    case 'incline': { const top = inclineVerts(o)[2]; return [{ id: 'top', x: top[0] + o.x, y: top[1] + o.y }]; }
    case 'surface': return [-1, 1].map(sg => { const [x, y] = toW(T, sg * o.L / 2, 0); return { id: sg < 0 ? 'endA' : 'endB', x, y }; });
  }
  return [];
}

const r2 = v => Math.round(v * 100) / 100;

function resizeGesture(st, h) {
  const o = objOf(B.spec, B.sel), T = xf(st, o.id);
  const start = { x: o.x, y: o.y, L: o.L, alpha: o.alpha };
  // Per piano e superficie resta fermo il punto opposto a quello trascinato.
  const foot = o.type === 'incline' ? (o.dir === -1 ? [o.x + o.L * Math.cos(o.alpha * deg), o.y] : [o.x, o.y]) : null;
  const other = o.type === 'surface' ? toW(T, (h.id === 'endA' ? 1 : -1) * o.L / 2, 0) : null;
  // Corpi che all'inizio del gesto sono appoggiati sulla faccia di questo oggetto.
  const resting = [];
  if (o.type === 'incline' || o.type === 'surface') {
    const f = faces({ objects: [o] })[1];
    for (const b of B.spec.objects) {
      if (!DYNAMIC.has(b.type)) continue;
      const half = b.type === 'block' ? b.h / 2 : b.r, rx = b.x - f.p[0], ry = b.y - f.p[1];
      const t = rx * f.u[0] + ry * f.u[1], d = rx * f.n[0] + ry * f.n[1];
      if (t >= 0 && t <= f.len && Math.abs(d - half) < 0.05) resting.push(b.id);
    }
  }
  B.resizing = h.id;
  return {
    move: ({ wx, wy }) => {
      if (o.type === 'block') {
        const [lx, ly] = toL(T, wx, wy);
        o.w = clamp(r2(2 * Math.abs(lx)), 0.1, 5); o.h = clamp(r2(2 * Math.abs(ly)), 0.1, 5);
        o.x = T.x; o.y = T.y;
        snapBody(B.spec, o);
      } else if (o.type === 'ball' || o.type === 'pulley') {
        const cx = o.type === 'ball' ? T.x : start.x, cy = o.type === 'ball' ? T.y : start.y;
        o.r = clamp(r2(Math.hypot(wx - cx, wy - cy)), 0.05, o.type === 'ball' ? 2 : 1);
        if (o.type === 'ball') { o.x = cx; o.y = cy; snapBody(B.spec, o); }
      } else if (o.type === 'incline') {
        const vx = (wx - foot[0]) * (o.dir === -1 ? -1 : 1), vy = wy - foot[1];
        o.L = clamp(r2(Math.hypot(vx, vy)), 1, 20);
        o.alpha = clamp(Math.round(Math.atan2(vy, vx) / deg), 5, 75);
        if (o.dir === -1) o.x = foot[0] - o.L * Math.cos(o.alpha * deg);
      } else if (o.type === 'surface') {
        const dx = wx - other[0], dy = wy - other[1];
        o.L = clamp(r2(Math.hypot(dx, dy)), 0.5, 30);
        let a = Math.atan2(dy, dx) / deg;
        if (a > 90) a -= 180; if (a < -90) a += 180;
        o.angle = Math.round(a);
        o.x = r2(other[0] + dx / 2); o.y = r2(other[1] + dy / 2);
      }
      // I corpi appoggiati su un piano o su una superficie ne seguono la nuova forma.
      if (o.type === 'incline' || o.type === 'surface') for (const id of resting) snapBody(B.spec, objOf(B.spec, id));
      B.api.reset();
    },
    up: () => { B.resizing = null; save(); B.api.refresh(); },
    cancel: () => { B.resizing = null; },
  };
}

function draw(P, st, ui = {}) {
  const spec = st.spec, sel = B.sel, show = B.spec.show;
  P.ground(0);
  if (!ui.snapshot) drawAxes(P);
  if (show.field ?? true) {
    const { x0, y0, x1, y1 } = P.cam.bounds(), m = 0.2 * (x1 - x0);
    drawFieldLines(P, fieldLines(st, [x0 - m, y0 - m, x1 + m, y1 + m]), { alpha: 0.35 });
  }
  if (show.Evec) {
    const list = chargesOf(st);
    if (list.length || spec.E) drawFieldGrid(P, (x, y) => fieldAt(st, x, y, list), (x, y) => y < 0 || list.some(c => Math.hypot(x - c.x, y - c.y) < c.r * 1.6));
  }
  if (show.dist ?? true) drawDistances(P, st);

  for (const o of spec.objects) {
    if (o.type === 'incline') {
      const v = inclineVerts(o).map(([x, y]) => [x + o.x, y + o.y]);
      slab(P, v, { topEdge: o.dir === -1 ? [v[2], v[1]] : [v[0], v[2]], selected: sel === o.id });
      const foot = o.dir === -1 ? [v[1][0], o.y] : [o.x, o.y];
      const a0 = o.dir === -1 ? Math.PI - o.alpha * deg : 0, a1 = o.dir === -1 ? Math.PI : o.alpha * deg;
      P.arc(foot[0], foot[1], 34, a0, a1, { color: 'text', label: `${fmt(o.alpha, 0)}°`, labelR: 52 });
    } else if (o.type === 'surface') {
      const T = xf(st, o.id);
      const pts = [[-o.L / 2, -SURF_T / 2], [o.L / 2, -SURF_T / 2], [o.L / 2, SURF_T / 2], [-o.L / 2, SURF_T / 2]].map(([x, y]) => toW(T, x, y));
      slab(P, pts, { topEdge: [pts[3], pts[2]], selected: sel === o.id });
    }
  }

  for (const l of spec.links) {
    const selected = sel === l.id;
    if (l.type === 'spring') {
      const a = epW(st, l.a), b = epW(st, l.b), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      springShape(P, a, b, (L - l.L0) / Math.max(l.L0, 0.05), { selected });
    } else if (l.type === 'rope') {
      const { pts, slack } = ropePts(epW(st, l.a), epW(st, l.b), l.L);
      ropeShape(P, pts, { slack, selected });
    } else if (l.type === 'pulleyRope') {
      const pts = pulleyRopePts(st, l);
      if (pts) ropeShape(P, pts, { selected });
    }
  }

  for (const o of spec.objects) {
    if (o.type === 'pulley') pulleyShape(P, o.x, o.y, o.r, pulleyAngle(st, o), { selected: sel === o.id });
    else if (o.type === 'anchor') anchorPlate(P, o.x, o.y, { selected: sel === o.id });
    else if (o.type === 'charge') {
      const [a, b] = P.S(o.x, o.y), r = Math.max(10, CHARGE_R * P.cam.scale);
      chargeSphere(P, a, b, r, o.q >= 0, sel === o.id);
      P.textS(a, b + r + 13, `q${subN(chargeNo(spec, o.id))} = ${fmt(o.q, 1)} µC`, { size: 12, align: 'center' });
    }
  }

  if (show.trail) for (const id in st.trails) trail(P, st.trails[id], 'vel', 2.5);

  for (const o of spec.objects) {
    if (!DYNAMIC.has(o.type)) continue;
    const T = xf(st, o.id);
    if (!T) continue;
    const isSel = sel === o.id, color = colorOf(spec, o);
    if (o.type === 'block') {
      if (isSel) {
        const pad = 4 / P.cam.scale;
        const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => toW(T, sx * (o.w / 2 + pad), sy * (o.h / 2 + pad)));
        P.poly(pts, { stroke: 'handle', width: 3 });
      }
      crate(P, T.x, T.y, { w: o.w, h: o.h, angle: T.a, minPx: 0, color });
    } else {
      if (isSel) P.circle(T.x, T.y, o.r * P.cam.scale + 4, { stroke: 'handle', width: 3 });
      ballShape(P, T.x, T.y, { r: o.r, minPx: 0, color, spin: T.a });
    }
    if (P.cam.scale * Math.min(o.w ?? o.r * 2, o.h ?? o.r * 2) > 24) P.text(T.x, T.y, `${fmt(o.m, o.m < 10 ? 1 : 0)} kg`, { size: 11, align: 'center', weight: 700 });
    if (o.q) {
      // Corpo carico: distintivo con il segno in alto a destra e valore della carica.
      const [cx, cy] = P.S(T.x, T.y), hw = (o.type === 'ball' ? o.r * Math.SQRT1_2 : o.w / 2) * P.cam.scale, hh = (o.type === 'ball' ? o.r * Math.SQRT1_2 : o.h / 2) * P.cam.scale;
      chargeBadge(P, cx + hw, cy - hh, o.q > 0);
      P.textS(cx + hw + 13, cy - hh, `q${subN(chargeNo(spec, o.id))} = ${fmt(o.q, 1)} µC`, { size: 11, weight: 700 });
    }

    // Polvere dove il corpo striscia con attrito.
    const [vx, vy] = velOf(st, o.id), sp = Math.hypot(vx, vy);
    if (sp > 0.08) for (const f of st.forces[o.id] ?? []) {
      if (f.c !== 'friction') continue;
      dust(f.at[0], f.at[1], vx / sp, vy / sp, Math.min(1.2, Math.hypot(...f.F) * sp * 0.04));
    }
  }

  const kf = forceScale(st);
  for (const l of spec.links) if (l.type === 'force') {
    const T = xf(st, l.o);
    if (T) P.arrow(T.x, T.y, T.x + kf * l.F * Math.cos(l.angle * deg), T.y + kf * l.F * Math.sin(l.angle * deg), { color: 'applied', width: sel === l.id ? 5 : 3.5, label: 'F', dash: [7, 4] });
  }

  // I corpi con il diagramma di corpo libero mostrano la forza elettrica lì, nella scala delle altre forze.
  const fbdIds = !show.fbd ? [] : show.all ? spec.objects.filter(o => DYNAMIC.has(o.type)).map(o => o.id) : DYNAMIC.has(objOf(spec, sel)?.type) ? [sel] : [];
  if (show.Fe ?? true) drawElectricForces(P, st, sel, new Set(fbdIds), show.all);

  if (show.vel) for (const o of spec.objects) if (DYNAMIC.has(o.type)) {
    const T = xf(st, o.id), [vx, vy] = velOf(st, o.id);
    P.arrow(T.x, T.y, T.x + KV * vx, T.y + KV * vy, { color: 'vel', label: 'v' });
  }

  if (show.fbd) {
    const ids = show.all ? spec.objects.filter(o => DYNAMIC.has(o.type)).map(o => o.id)
      : DYNAMIC.has(objOf(spec, sel)?.type) ? [sel] : [];
    for (const id of ids) for (const f of st.forces[id] ?? []) {
      if (Math.hypot(...f.F) < 1e-3) continue;
      P.arrow(f.at[0], f.at[1], f.at[0] + kf * f.F[0], f.at[1] + kf * f.F[1], { color: f.c, label: f.l });
    }
  }

  if (B.drag) {
    const o = B.drag.o;
    dragGuides(P, { x: o.x, y: o.y, vx: B.drag.vx, hy: B.drag.hy, text: `x = ${fmt(o.x, 2)} m · y = ${fmt(o.y, 2)} m` });
  }

  // Maniglie di ridimensionamento dell'oggetto selezionato (solo a simulazione ferma).
  if (!ui.api?.running && B.tool === 'select') for (const h of resizeHandles(st)) P.sizeHandle(h.x, h.y, B.resizing === h.id);

  // Anteprima del collegamento in costruzione.
  const p = B.pending;
  if (p?.a && !p.p) {
    const a = epW(st, p.a);
    P.circle(a[0], a[1], 8, { stroke: 'handle', width: 3 });
    if (B.hover) P.line([a, B.hover], { color: 'handle', width: 2, dash: [5, 5] });
  }
  if (p?.p) {
    const pu = objOf(spec, p.p);
    if (pu) P.circle(pu.x, pu.y, pu.r * P.cam.scale + 7, { stroke: 'handle', width: 3 });
    if (p.a) { const T = xf(st, p.a); if (T) P.circle(T.x, T.y, 12, { stroke: 'handle', width: 3 }); }
  }
}

/* ---------------- Pannelli ---------------- */

const n2 = x => fmt(x, 2);

function forceTable(list, m, a) {
  let sx = 0, sy = 0;
  const rows = list.map(f => {
    sx += f.F[0]; sy += f.F[1];
    return `<tr><td><span class="sw" style="background:var(--c-${f.c})"></span>${f.n}</td><td>${n2(f.F[0])}</td><td>${n2(f.F[1])}</td><td>${n2(Math.hypot(...f.F))}</td></tr>`;
  }).join('');
  return `<table class="ftable"><tr><td></td><td>Fx (N)</td><td>Fy (N)</td><td>|F| (N)</td></tr>${rows}
    <tr class="sum"><td>Risultante ΣF</td><td>${n2(sx)}</td><td>${n2(sy)}</td><td>${n2(Math.hypot(sx, sy))}</td></tr>
    <tr class="sum"><td>m·a</td><td>${n2(m * a[0])}</td><td>${n2(m * a[1])}</td><td>${n2(m * Math.hypot(...a))}</td></tr></table>`;
}

function kv(rows) {
  return `<table class="ftable">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
}

// Forze elettriche sulla carica selezionata: Coulomb con distanza, angolo e componenti, poi la somma.
function electricFormulas(st, item) {
  const d = forceDetail(st, item.id);
  if (!d || !d.rows.length) return [];
  const out = [{ h: 'Forze elettriche (Coulomb)' }];
  const n = v => fmt(v, Math.abs(v) < 0.1 ? 4 : 3), ang = F => fmt(Math.atan2(F[1], F[0]) / deg, 0) + '°';
  for (const f of d.rows) {
    if (f.from === 'E') { out.push({ tex: `F = q\\,E = ${n(Math.hypot(...f.F)).replace(',', '{,}')}\\ \\mathrm{N}` }); continue; }
    const o = objOf(st.spec, f.from);
    const i = chargeNo(st.spec, item.id), j = chargeNo(st.spec, o.id);
    out.push({ tex: `F_{${i}${j}} = k\\dfrac{|q_{${i}}\\,q_{${j}}|}{r^2} = ${n(Math.hypot(...f.F)).replace(',', '{,}')}\\ \\mathrm{N}\\quad (r = ${fmt(f.r, 2).replace(',', '{,}')}\\ \\mathrm{m},\\ \\text{${item.q * o.q > 0 ? 'repulsiva' : 'attrattiva'}})` });
  }
  const rows = d.rows.map(f => `<tr><td>${f.from === 'E' ? 'qE' : 'F' + subN(chargeNo(st.spec, item.id)) + subN(chargeNo(st.spec, f.from)) + ' (da q' + subN(chargeNo(st.spec, f.from)) + ')'}</td><td>${n(Math.hypot(...f.F))}</td><td>${ang(f.F)}</td><td>${n(f.F[0])}</td><td>${n(f.F[1])}</td></tr>`).join('');
  out.push({ html: `<table class="ftable"><tr><td></td><td>F (N)</td><td>θ</td><td>Fx (N)</td><td>Fy (N)</td></tr>${rows}<tr class="sum"><td>Risultante</td><td>${n(Math.hypot(...d.R))}</td><td>${ang(d.R)}</td><td>${n(d.R[0])}</td><td>${n(d.R[1])}</td></tr></table>` });
  return out;
}

function formulas(st) {
  const spec = st.spec, item = selected(spec), out = [];
  if (item && DYNAMIC.has(item.type)) {
    const T = xf(st, item.id), v = velOf(st, item.id), a = st.accel[item.id] ?? [0, 0];
    out.push({ h: `${nameOf(spec, item)} · m = ${fmt(item.m, 2)} kg` });
    out.push({ html: forceTable(st.forces[item.id] ?? [], item.m, a) });
    out.push({ h: 'Stato' });
    out.push({ html: kv([
      ['Posizione (x, y)', `${n2(T.x)} ; ${n2(T.y)} m`],
      ['Velocità (vx, vy)', `${n2(v[0])} ; ${n2(v[1])} m/s`],
      ['|v|', `${n2(Math.hypot(...v))} m/s`],
      ['Accelerazione |a|', `${n2(Math.hypot(...a))} m/s²`],
    ]) });
  } else if (item?.type === 'spring') {
    const sp = st.springs[item.id], A = epW(st, item.a), Bp = epW(st, item.b);
    const L = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
    out.push({ h: nameOf(spec, item) });
    out.push({ html: kv([
      ['Lunghezza L', `${n2(L)} m`], ['A riposo L₀', `${n2(item.L0)} m`],
      ['Deformazione ΔL = L − L₀', `${n2(L - item.L0)} m ${L > item.L0 ? '(allungata)' : L < item.L0 ? '(compressa)' : ''}`],
      ['Forza elastica k·|ΔL|', `${n2(item.k * Math.abs(L - item.L0))} N`],
      ...(item.c ? [['Forza totale (con smorzamento)', `${n2(Math.abs(sp?.F ?? 0))} N`]] : []),
      ['Energia elastica ½kΔL²', `${n2(0.5 * item.k * (L - item.L0) ** 2)} J`],
    ]) });
  } else if (item?.type === 'rope' || item?.type === 'pulleyRope') {
    out.push({ h: nameOf(spec, item) });
    const T = st.tensions?.[item.id] ?? 0;
    out.push({ html: kv([['Tensione T', `${n2(T)} N`], ...(item.L ? [['Lunghezza', `${n2(item.L)} m`]] : []), ['Stato', T > 1e-3 ? 'tesa' : 'lenta']]) });
  } else if (item?.type === 'charge') {
    out.push({ h: `${nameOf(spec, item)} · q = ${fmt(item.q, 1)} µC` });
    out.push({ html: '<div class="hint">Una carica fissa non si muove, ma subisce anch\'essa le forze delle altre cariche (terza legge).</div>' });
  } else if (item?.type === 'force') {
    out.push({ h: nameOf(spec, item) });
    out.push({ html: kv([['Fx', `${n2(item.F * Math.cos(item.angle * deg))} N`], ['Fy', `${n2(item.F * Math.sin(item.angle * deg))} N`]]) });
  } else if (!item) {
    out.push({ h: 'Suggerimento' });
    out.push({ html: '<div class="hint">Seleziona un corpo per vedere il suo diagramma di corpo libero e verificare che ΣF = m·a.</div>' });
  }
  if (item?.q) out.push(...electricFormulas(st, item));
  const E = st.energy;
  if (E) {
    out.push({ h: 'Energia del sistema' });
    out.push({ html: kv([
      ['<span class="sw" style="background:var(--c-vel)"></span>Cinetica K', `${n2(E.K)} J`],
      ['<span class="sw" style="background:var(--c-normal)"></span>Potenziale gravitazionale U<sub>g</sub>', `${n2(E.Ug)} J`],
      ['<span class="sw" style="background:var(--c-spring)"></span>Potenziale elastica U<sub>el</sub>', `${n2(E.Uel)} J`],
      ...(E.Ue ? [['<span class="sw" style="background:var(--c-acc)"></span>Potenziale elettrica U<sub>e</sub>', `${n2(E.Ue)} J`]] : []),
      ['Lavoro delle forze esterne W', `${n2(E.W)} J`],
      // Q non si misura direttamente: è ciò che manca al bilancio E₀ + W − (K + U). Valori piccoli e
      // negativi (centesimi di joule) sono l'errore numerico della simulazione, non energia "creata".
      ['<span class="sw" style="background:var(--c-weight)"></span>Dissipata Q = E<sub>0</sub> + W − (K + U)', `${n2(Math.abs(E.Q) < 0.1 && E.Q < 0 ? 0 : E.Q)} J`],
    ]) });
    if (E.Q < -0.1) out.push({ html: '<div class="hint">Q negativa: la simulazione sta accumulando un errore numerico (passo troppo grande o corpi che si compenetrano).</div>' });
  }
  return out;
}

function graphs(st) {
  const item = selected(st.spec), list = [];
  if (item && DYNAMIC.has(item.type)) {
    const id = item.id;
    list.push({ title: 'Posizione', series: [{ label: 'x (m)', color: 'vel', get: o => o.b[id]?.x }, { label: 'y (m)', color: 'weight', get: o => o.b[id]?.y }] });
    list.push({ title: 'Velocità', series: [
      { label: 'vx (m/s)', color: 'vel', get: o => o.b[id]?.vx }, { label: 'vy (m/s)', color: 'weight', get: o => o.b[id]?.vy },
      { label: '|v| (m/s)', color: 'muted', dash: [4, 4], get: o => o.b[id]?.v }] });
  } else if (item?.type === 'spring') {
    const id = item.id;
    list.push({ title: 'Molla', series: [{ label: 'ΔL (m)', color: 'spring', get: o => o.l[id]?.dl }, { label: 'F (N)', color: 'applied', get: o => o.l[id]?.F }] });
  } else if (item?.type === 'rope' || item?.type === 'pulleyRope') {
    const id = item.id;
    list.push({ title: 'Tensione', series: [{ label: 'T (N)', color: 'tension', get: o => o.l[id]?.T }] });
  }
  list.push({ title: 'Energia', series: [
    { label: 'K', color: 'vel', key: 'K' }, { label: 'Ug', color: 'normal', key: 'Ug' }, { label: 'Uel', color: 'spring', key: 'Uel' },
    ...(st.spec.objects.some(o => o.q) ? [{ label: 'Ue', color: 'acc', key: 'Ue' }] : []),
    { label: 'Q', color: 'weight', key: 'Q' }, { label: 'K+U+Q−W', color: 'friction', dash: [5, 4], key: 'tot' }] });
  return list;
}

// Proprietà principali di ogni oggetto; le altre (attrito, elasticità, velocità iniziali) stanno in "Altre proprietà".
const PRIMARY = { block: ['m', 'w', 'h', 'angle', 'q'], ball: ['m', 'r', 'q'] };

function buildPanel(body, api) {
  body.innerHTML = '';
  api.setRail(TOOL_GROUPS.map(([title, items]) => ({ title, items })), B.tool, (t, force) => setTool(!force && B.tool === t && t !== 'select' ? 'select' : t));
  if (B.tool !== 'select') body.appendChild(el('div', 'hint', hint()));

  const spec = B.spec, item = selected(spec);
  if (item) {
    body.appendChild(el('div', 'sel-title', `<span class="dot"></span>${nameOf(spec, item)}`));
    const ctl = (parent, def) => parent.appendChild(api.control({ ...def, pinLabel: `${nameOf(spec, item)} · ${def.label}` }, () => item[def.key] ?? 0, v => {
      item[def.key] = v;
      if (DYNAMIC.has(item.type) && (def.key === 'h' || def.key === 'r')) snapBody(spec, item);
      save(); api.reset();
    }, `${item.id}.${def.key}`));
    const prim = PRIMARY[item.type], defs = PROPS[item.type];
    for (const def of defs) if (!prim || prim.includes(def.key)) ctl(body, def);
    if ('x' in item && item.type !== 'incline') {
      const pos = api.section(body, 'Posizione', 'b.pos', true);
      for (const k of ['x', 'y']) {
        pos.appendChild(api.control({ key: k, label: `Posizione ${k}`, pinLabel: `${nameOf(spec, item)} · ${k}`, unit: 'm', min: k === 'x' ? -20 : 0, max: 20, step: 0.01, hardMin: -1e3, hardMax: 1e3 },
          () => item[k], v => { item[k] = v; save(); api.reset(); }, `${item.id}.${k}`));
      }
    }
    if (prim) {
      const more = api.section(body, 'Altre proprietà', 'b.more', false);
      for (const def of defs) if (!prim.includes(def.key)) ctl(more, def);
    }
    const row = el('div', 'btn-row');
    const del = el('button', 'btn danger', 'Elimina');
    del.onclick = deleteSelected;
    const desel = el('button', 'btn', 'Deseleziona');
    desel.onclick = () => select(null);
    row.append(del, desel);
    body.appendChild(row);
    return;
  }

  if (B.tool === 'select') body.appendChild(el('div', 'hint', 'Scegli un oggetto nella barra a sinistra e tocca la scena. Tocca un oggetto per modificarlo.'));
  // Azioni sulla scena intera, sempre in vista. Svuotare si può annullare con ↶, quindi niente conferma.
  const top = el('div', 'btn-row scene-actions');
  const wipe = el('button', 'btn danger', 'Svuota la scena');
  wipe.disabled = !spec.objects.length;
  wipe.onclick = () => loadScene({ ...newSpec(), show: spec.show });
  const fitB = el('button', 'btn', 'Inquadra');
  fitB.onclick = () => api.fit();
  top.append(wipe, fitB);
  body.appendChild(top);
  const scene = api.section(body, 'Scena', 'b.scene', true);
  scene.appendChild(api.control({ key: 'g', label: 'Gravità g', unit: 'm/s²', min: 0, max: 25, step: 0.01 }, () => spec.g, v => { spec.g = v; save(); api.reset(); }, 'scene.g'));
  scene.appendChild(api.control({ key: 'muFloor', label: 'Attrito μ del suolo', unit: '', min: 0, max: 1.5, step: 0.01 }, () => spec.muFloor, v => { spec.muFloor = v; save(); api.reset(); }, 'scene.mu'));
  const show = api.section(body, 'Mostra', 'b.show', true);
  for (const [k, label] of [['fbd', 'Diagramma di corpo libero'], ['all', '…su tutti i corpi e le cariche'], ['vel', 'Vettori velocità'], ['trail', 'Scie']]) {
    show.appendChild(api.control({ key: k, type: 'toggle', label }, () => spec.show[k], v => { spec.show[k] = v; save(); api.refresh(); }, 'show.' + k));
  }
  const hasEM = spec.E || spec.objects.some(o => o.q);
  const em = api.section(body, 'Elettromagnetismo', 'b.em', !!hasEM);
  em.appendChild(api.control({ key: 'E', label: 'Campo elettrico uniforme E', unit: 'kN/C', min: 0, max: 2000, step: 5 }, () => spec.E ?? 0, v => { spec.E = v; save(); api.reset(); }, 'scene.E'));
  em.appendChild(api.control({ key: 'Eangle', label: 'Direzione del campo', unit: '°', min: -180, max: 180, step: 1 }, () => spec.Eangle ?? 0, v => { spec.Eangle = v; save(); api.reset(); }, 'scene.Ea'));
  for (const [k, label, def] of [['field', 'Linee di campo elettrico', true], ['Evec', 'Vettori del campo E', false], ['Fe', 'Forze elettriche sulle cariche', true], ['dist', 'Distanze tra le cariche', true]]) {
    em.appendChild(api.control({ key: k, type: 'toggle', label }, () => spec.show[k] ?? def, v => { spec.show[k] = v; save(); api.refresh(); }, 'show.' + k));
  }
  em.appendChild(el('div', 'hint', 'Per caricare un blocco o una sfera, selezionalo e cambia la sua carica q.'));
  const exs = api.section(body, 'Esempi', 'b.examples', false);
  const chips = el('div', 'chips');
  for (const ex of EXAMPLES) {
    const b = el('button', '', ex.label);
    b.onclick = () => loadScene(ex.make());
    chips.appendChild(b);
  }
  exs.appendChild(chips);
}

function loadScene(spec) {
  B.spec = spec; B.sel = null; B.pending = null; B.tool = 'select';
  save();
  B.api.stopSweep();
  B.api.reset(); B.api.fit(); B.api.rebuildPanel(); B.api.refresh();
}

/* ---------------- Esempi ---------------- */

function springBetween(spec, a, b, k, c = 0, L0) {
  const pa = [a.x, a.y], pb = [b.x, b.y];
  return addLink(spec, { type: 'spring', a: { o: a.id, lx: 0, ly: 0 }, b: { o: b.id, lx: 0, ly: 0 }, k, c, L0: L0 ?? Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) });
}

const EXAMPLES = [
  { label: 'Piano inclinato, molla e carrucola', make() {
    const s = newSpec();
    const a = 30 * deg, u = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
    addObj(s, { type: 'incline', x: 0, y: 0, alpha: 30, L: 6, dir: 1, mu: 0.15 });
    const at = (t, h) => [u[0] * t + n[0] * h, u[1] * t + n[1] * h];
    const [bx, by] = at(2.5, 0.2);
    const blk = addObj(s, { ...MAKE.block(bx, by), angle: 30, w: 0.6, h: 0.4, m: 2 });
    const [ax, ay] = at(0.35, 0.2);
    const anc = addObj(s, MAKE.anchor(ax, ay));
    springBetween(s, anc, blk, 15);
    const r = 0.18, [px, py] = at(6.25, 0.2 - r);
    const pul = addObj(s, { type: 'pulley', x: px, y: py, r });
    const hang = addObj(s, { ...MAKE.block(px + r, 2.4), w: 0.4, h: 0.4, m: 2.5 });
    addLink(s, { type: 'pulleyRope', p: pul.id, a: { o: blk.id, lx: 0, ly: 0 }, b: { o: hang.id, lx: 0, ly: 0 } });
    return s;
  } },
  { label: 'Macchina di Atwood', make() {
    const s = newSpec();
    const pul = addObj(s, { type: 'pulley', x: 0, y: 5, r: 0.25 });
    const A = addObj(s, { ...MAKE.block(-0.25, 2.5), w: 0.3, h: 0.3, m: 2 });
    const Bb = addObj(s, { ...MAKE.block(0.25, 3), w: 0.3, h: 0.3, m: 1.5 });
    addLink(s, { type: 'pulleyRope', p: pul.id, a: { o: A.id, lx: 0, ly: 0 }, b: { o: Bb.id, lx: 0, ly: 0 } });
    return s;
  } },
  { label: 'Massa appesa a una molla', make() {
    const s = newSpec();
    const anc = addObj(s, MAKE.anchor(0, 5));
    const blk = addObj(s, { ...MAKE.block(0, 2.8), w: 0.5, h: 0.5, m: 1 });
    springBetween(s, anc, blk, 40, 0, 1.5);
    return s;
  } },
  { label: 'Pendolo', make() {
    const s = newSpec();
    const anc = addObj(s, MAKE.anchor(0, 5));
    const ball = addObj(s, { ...MAKE.ball(3 * Math.sin(40 * deg), 5 - 3 * Math.cos(40 * deg)), r: 0.15, e: 0 });
    addLink(s, { type: 'rope', a: { o: anc.id, lx: 0, ly: 0 }, b: { o: ball.id, lx: 0, ly: 0 }, L: 3 });
    s.show.trail = true;
    return s;
  } },
  { label: 'Blocco trainato con attrito', make() {
    const s = newSpec();
    const blk = addObj(s, { ...MAKE.block(-4, 0.25), w: 0.8, h: 0.5, m: 3 });
    addLink(s, { type: 'force', o: blk.id, F: 20, angle: 20 });
    return s;
  } },
  { label: 'Tre cariche (triangolo equilatero)', make() {
    // Tre cariche fisse uguali ai vertici di un triangolo equilatero di lato 2 m: ogni forza risultante
    // è diretta lungo la bisettrice, verso l'esterno, e vale √3·kq²/a².
    const s = newSpec(), a = 2, h = a * Math.sqrt(3) / 2;
    s.g = 0; s.show.all = true; s.show.dist = true;
    for (const [x, y] of [[-a / 2, 1.2], [a / 2, 1.2], [0, 1.2 + h]]) addObj(s, { ...MAKE.chargePos(x, y), q: 10 });
    return s;
  } },
  { label: 'Pendoli carichi', make() {
    // Due sferette con la stessa carica appese allo stesso punto: si respingono finché tensione, peso e forza di Coulomb si equilibrano.
    const s = newSpec(), L = 2, a0 = 5 * deg;
    const anc = addObj(s, MAKE.anchor(0, 4.5));
    for (const sg of [-1, 1]) {
      const b = addObj(s, { ...MAKE.ball(sg * L * Math.sin(a0), 4.5 - L * Math.cos(a0)), r: 0.12, m: 0.05, e: 0, q: 3 });
      addLink(s, { type: 'rope', a: { o: anc.id, lx: 0, ly: 0 }, b: { o: b.id, lx: 0, ly: 0 }, L });
    }
    return s;
  } },
  { label: 'Pendolo in un campo uniforme', make() {
    // Sfera carica appesa a un filo in un campo orizzontale: all'equilibrio tan α = qE/(mg).
    const s = newSpec();
    s.E = 245; s.Eangle = 0;
    const anc = addObj(s, MAKE.anchor(0, 4.5));
    const b = addObj(s, { ...MAKE.ball(0, 2), r: 0.15, m: 0.1, e: 0, q: 2 });
    addLink(s, { type: 'rope', a: { o: anc.id, lx: 0, ly: 0 }, b: { o: b.id, lx: 0, ly: 0 }, L: 2.5 });
    return s;
  } },
  { label: 'Orbita attorno a una carica (g = 0)', make() {
    // Senza gravità, una carica negativa lanciata con la velocità giusta gira attorno a una carica fissa positiva:
    // k·Q·|q|/r² = m·v²/r con r = 1 m dà v ≈ 3 m/s.
    const s = newSpec();
    s.g = 0; s.muFloor = 0; s.show.vel = true; s.show.trail = true;
    addObj(s, { ...MAKE.chargePos(0, 3), q: 20 });
    addObj(s, { ...MAKE.ball(0, 4), r: 0.1, m: 0.1, e: 0, mu: 0, q: -5, vx: Math.sqrt(K * 20e-6 * 5e-6 / 0.1) });
    return s;
  } },
  { label: 'Urto tra due sfere', make() {
    const s = newSpec();
    s.muFloor = 0;
    addObj(s, { ...MAKE.ball(-3, 0.3), r: 0.3, m: 1, e: 1, mu: 0, vx: 4 });
    addObj(s, { ...MAKE.ball(1, 0.3), r: 0.3, m: 2, e: 1, mu: 0, vx: -1 });
    s.show.vel = true;
    return s;
  } },
];

/* ---------------- Esperimento ---------------- */

export default {
  id: 'builder',
  title: 'Costruttore libero',
  subtitle: 'Componi blocchi, piani, molle, funi, carrucole e cariche',
  panelTitle: 'Costruttore',
  axes: true,
  params: [],
  dt: DT,
  sweepHorizon: 4,

  mount(api) {
    B.api = api;
    if (!B.spec) {
      const saved = store.get('builder.scene', null);
      // La prima versione partiva con un esempio: se è rimasto intatto, si riparte dalla scena vuota.
      const first = EXAMPLES[0].make();
      delete first.E; delete first.Eangle; delete first.show.field;
      B.spec = !saved || JSON.stringify(saved) === JSON.stringify(first) ? newSpec() : saved;
    }
    B.tool = 'select'; B.pending = null;
    // Annulla / ripeti: ripristina la scena e ricostruisce il mondo fisico.
    B.hist ??= new SceneHistory(() => B.spec, sc => {
      B.spec = sc; B.sel = null; B.pending = null; B.tool = 'select';
      store.set('builder.scene', sc);
      B.api.stopSweep(); B.api.reset(); B.api.rebuildPanel(); B.api.refresh();
    }, () => B.api.recordChange());
  },
  get history() { return B.hist; },

  // Azioni rapide sull'oggetto selezionato, in una barretta sopra di esso.
  selectionBar(api) {
    if (B.tool !== 'select' || B.drag) return null;
    const spec = B.spec, item = selected(spec);
    if (!item) return null;
    const st = api.view(), acts = [];
    let x, y;
    if (spec.objects.includes(item)) {
      const T = xf(st, item.id) ?? item;
      x = T.x;
      y = T.y + (item.type === 'block' ? item.h / 2 : item.type === 'ball' ? item.r : item.type === 'charge' ? CHARGE_R : item.type === 'pulley' ? item.r : item.type === 'incline' ? item.L * Math.sin(item.alpha * deg) : 0.1);
      if (item.type === 'incline') x = item.x + item.L * Math.cos(item.alpha * deg) / 2;
      acts.push({ label: 'Duplica', run: () => duplicate(item) });
      if (DYNAMIC.has(item.type)) {
        acts.push({ label: '+ Forza', run: () => { const l = addLink(spec, { type: 'force', o: item.id, F: 10, angle: 0 }); finishEdit(l.id); } });
        acts.push({ label: 'Molla', run: () => startLink('spring', item) });
        acts.push({ label: 'Fune', run: () => startLink('rope', item) });
      }
      if (item.q || item.type === 'charge') acts.push({ label: '± Segno', run: () => { item.q = -item.q; save(); api.reset(); api.rebuildPanel(); } });
    } else {
      const segs = linkSegs(st, item);
      if (!segs.length) return null;
      const [[ax, ay], [bx, by]] = segs[0];
      x = (ax + bx) / 2; y = Math.max(ay, by) + 0.1;
    }
    acts.push({ label: 'Elimina', danger: true, run: deleteSelected });
    return { key: item.id, x, y, actions: acts };
  },
  unmount() { B.pending = null; B.tool = 'select'; },

  init() { return buildSim(B.spec); },

  step(s, dt) {
    physStep(s, dt);
    s.t += dt;
    if (s.t - s.lastTrail >= 1 / 30) {
      s.lastTrail = s.t;
      for (const id in s.trails) { const p = s.bodies.get(id).getPosition(); s.trails[id].push([p.x, p.y]); }
    }
  },

  sample(s) {
    if (s.t > 0) s.forces = computeForces(s);
    const E = energy(s), Em = E.K + E.Ug + E.Uel + E.Ue;
    if (s.E0 == null) s.E0 = Em;
    s.energy = { ...E, Em, W: s.Wext, Q: s.E0 + s.Wext - Em };
    const b = {}, l = {};
    for (const [id, body] of s.bodies) if (body.isDynamic()) {
      const p = body.getPosition(), v = body.getLinearVelocity();
      b[id] = { x: p.x, y: p.y, vx: v.x, vy: v.y, v: Math.hypot(v.x, v.y) };
    }
    for (const lk of s.spec.links) {
      if (lk.type === 'spring') {
        const sp = s.springs[lk.id];
        if (sp) l[lk.id] = { dl: sp.L - lk.L0, F: sp.F };
      } else if (s.tensions[lk.id] != null) l[lk.id] = { T: s.tensions[lk.id] };
    }
    return { t: s.t, ...s.energy, tot: Em + s.energy.Q - s.Wext, b, l };
  },

  snapshot(s) {
    const poses = {}, trailLen = {};
    for (const [id, b] of s.bodies) if (b.isDynamic()) {
      const p = b.getPosition(), v = b.getLinearVelocity();
      poses[id] = [p.x, p.y, b.getAngle(), v.x, v.y, b.getAngularVelocity()];
      trailLen[id] = s.trails[id].length;
    }
    return { t: s.t, poses, trailLen, forces: s.forces, energy: s.energy, springs: { ...s.springs }, tensions: { ...s.tensions }, accel: { ...s.accel }, Wext: s.Wext, lastTrail: s.lastTrail };
  },

  stateAt(sim, snap) {
    const trails = {};
    for (const id in snap.trailLen) trails[id] = sim.trails[id].slice(0, snap.trailLen[id]);
    return { ...sim, frame: snap, t: snap.t, trails, forces: snap.forces, energy: snap.energy, springs: snap.springs, tensions: snap.tensions, accel: snap.accel };
  },

  resumeFrom(sim, snap) {
    for (const id in snap.poses) {
      const b = sim.bodies.get(id), [x, y, a, vx, vy, w] = snap.poses[id];
      b.setTransform(V2(x, y), a); b.setLinearVelocity(V2(vx, vy)); b.setAngularVelocity(w);
      sim.trails[id].length = snap.trailLen[id];
    }
    Object.assign(sim, { t: snap.t, forces: snap.forces, energy: snap.energy, springs: { ...snap.springs }, tensions: { ...snap.tensions }, accel: { ...snap.accel }, Wext: snap.Wext, lastTrail: snap.lastTrail });
  },

  view() {
    // Inquadra gli oggetti con un margine; la scena vuota mostra un'area di 6 m × 4,5 m.
    if (!B.spec.objects.length) return { xmin: -3, xmax: 3, ymin: -0.5, ymax: 4 };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const o of B.spec.objects) {
      const pts = o.type === 'incline' ? inclineVerts(o).map(([x, y]) => [x + o.x, y + o.y]) : [[o.x - (o.L ?? 0) / 2, o.y], [o.x + (o.L ?? 0) / 2, o.y]];
      for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    x0 -= 1; x1 += 1; y1 += 1.2; y0 = Math.min(-0.4, y0 - 0.6);
    const cx = (x0 + x1) / 2, w = Math.max(x1 - x0, 4);
    return { xmin: cx - w / 2, xmax: cx + w / 2, ymin: y0, ymax: Math.max(y1, y0 + 3) };
  },

  draw(P, st, p, ui) { draw(P, st, ui); },
  formulas,
  // Valore di una puntina dalla scena corrente (vedi pinValue in main.js).
  pinInfo(key) {
    const spec = B.spec;
    if (!spec) return undefined;
    const SCENE = { 'scene.g': () => spec.g, 'scene.mu': () => spec.muFloor, 'scene.E': () => spec.E ?? 0, 'scene.Ea': () => spec.Eangle ?? 0 };
    if (SCENE[key]) return { value: SCENE[key](), name: null };
    const i = key.lastIndexOf('.'), id = key.slice(0, i), prop = key.slice(i + 1);
    const item = objOf(spec, id) || linkOf(spec, id);
    if (!item) return null;
    return { value: item[prop] ?? 0, name: nameOf(spec, item) };
  },
  graphs,
  buildPanel,

  pointerHover({ wx, wy }) { B.hover = [wx, wy]; },
  cursorAt({ wx, wy, api }) {
    if (B.tool !== 'select') return 'crosshair';
    return hitTest(api.view(), wx, wy, 10 / api.cam.scale) ? 'grab' : 'default';
  },

  pointerDown({ wx, wy, api }) {
    const st = api.view(), tol = 12 / api.cam.scale, spec = B.spec, t = B.tool;
    B.hover = [wx, wy];

    if (MAKE[t]) {
      // Il punto toccato scatta sulla griglia: le cariche e gli oggetti fissi finiscono su coordinate tonde.
      const g = t === 'block' || t === 'ball' ? 0.01 : 0.05, sn = v => Math.round(v / g) * g;
      const o = addObj(spec, MAKE[t](sn(wx), sn(wy)));
      if (DYNAMIC.has(o.type)) snapBody(spec, o);
      finishEdit(o.id);
      return moveGesture(o, wx, wy);
    }

    if (t === 'spring' || t === 'rope') {
      const ep = pickEndpoint(st, wx, wy, tol);
      if (ep.created) { api.reset(); }
      if (!B.pending) {
        B.pending = { type: t, a: ep, created: ep.created };
        api.rebuildPanel();
        return {};
      }
      if (ep.o === B.pending.a.o) return {};
      const st2 = api.view();
      const A = epW(st2, B.pending.a), Bp = epW(st2, ep), d = Math.max(0.05, Math.hypot(Bp[0] - A[0], Bp[1] - A[1]));
      const strip = ({ created, ...e }) => e;
      const l = addLink(spec, t === 'spring'
        ? { type: 'spring', a: strip(B.pending.a), b: strip(ep), k: 20, c: 0, L0: Math.round(d * 100) / 100 }
        : { type: 'rope', a: strip(B.pending.a), b: strip(ep), L: Math.round(d * 100) / 100 });
      finishEdit(l.id);
      return {};
    }

    if (t === 'pulleyRope') {
      const hit = hitTest(st, wx, wy, tol);
      if (!B.pending) {
        const pu = hit?.type === 'pulley' ? hit : addObj(spec, MAKE.pulley(wx, wy));
        B.pending = { type: t, p: pu.id, created: hit?.type === 'pulley' ? null : pu.id };
        save(); api.reset(); api.rebuildPanel();
        return {};
      }
      if (!hit || !DYNAMIC.has(hit.type)) return {};
      if (!B.pending.a) { B.pending.a = hit.id; api.rebuildPanel(); return {}; }
      if (hit.id === B.pending.a) return {};
      const l = addLink(spec, { type: 'pulleyRope', p: B.pending.p, a: { o: B.pending.a, lx: 0, ly: 0 }, b: { o: hit.id, lx: 0, ly: 0 } });
      finishEdit(l.id);
      return {};
    }

    if (t === 'force') {
      const hit = hitTest(st, wx, wy, tol);
      if (!hit || !DYNAMIC.has(hit.type)) return {};
      const l = addLink(spec, { type: 'force', o: hit.id, F: 10, angle: 0 });
      finishEdit(l.id);
      return {};
    }

    // Maniglie di ridimensionamento dell'oggetto selezionato.
    if (B.sel && !api.running) {
      for (const h of resizeHandles(st)) {
        const [hx, hy] = api.cam.toScreen(h.x, h.y), [px, py] = api.cam.toScreen(wx, wy);
        if (Math.hypot(hx - px, hy - py) < 24) return resizeGesture(st, h);
      }
    }

    // Selezione e trascinamento.
    const hit = hitTest(st, wx, wy, tol);
    if (!hit) {
      if (B.sel) select(null);
      return { pan: true };
    }
    if (B.sel !== hit.id) select(hit.id);
    const o = objOf(spec, hit.id);
    if (!o) return {};
    if (api.running && DYNAMIC.has(o.type)) return pullGesture(api.view(), o, wx, wy);
    return moveGesture(o, wx, wy);
  },

  onKey(e) {
    if ((e.key === 'Backspace' || e.key === 'Delete') && B.sel) deleteSelected();
    if (e.key === 'Escape') { setTool('select'); }
  },

  theory: `
<h2>Costruttore libero</h2>
<p>Qui componi tu il sistema: blocchi, sfere, piani inclinati, superfici, punti fissi, carrucole, molle, funi e forze costanti. Premi ▶ e il motore fisico (Box2D) risolve le equazioni del moto di tutti i corpi insieme.</p>

<h3>Come si usa</h3>
<ul>
  <li><b>Aggiungere</b>: scegli un oggetto nella barra a sinistra e tocca la scena. Un blocco vicino a un piano ci si appoggia da solo, allineato alla pendenza.</li>
  <li><b>Collegare</b>: con <i>Molla</i> o <i>Fune</i> tocca i due estremi (un corpo, un punto fisso, una superficie o uno spazio vuoto). Con <i>Fune + carrucola</i> tocca la carrucola e poi i due corpi.</li>
  <li><b>Trascinare dalla barra</b>: puoi anche trascinare un oggetto dalla barra a sinistra e lasciarlo dove vuoi sulla scena.</li>
  <li><b>Allineare</b>: mentre sposti un oggetto vedi le sue coordinate; quando è allineato a un altro oggetto (o all'origine) compare una linea guida e l'oggetto si aggancia.</li>
  <li><b>Azioni rapide</b>: sopra l'oggetto selezionato compare una barretta con Duplica, Elimina, + Forza, Molla, Fune e ± Segno per le cariche.</li>
  <li><b>Annulla e ripeti</b>: ↶ e ↷ in alto (o ⌘Z e ⇧⌘Z; su PC Ctrl+Z e Ctrl+Y) annullano e ripetono sia le modifiche alla scena sia gli appunti.</li>
  <li><b>Modificare</b>: tocca un oggetto per selezionarlo; i suoi parametri compaiono nel pannello. Tocca un valore per scriverlo esattamente, oppure ▸ per animarlo.</li>
  <li><b>Interagire</b>: a simulazione ferma trascini gli oggetti; mentre gira puoi tirare i corpi con il dito.</li>
  <li><b>Moviola</b>: con la barra in basso torni a qualsiasi istante. Premendo ▶ la simulazione riparte da lì.</li>
</ul>

<h3>Il diagramma di corpo libero</h3>
<p>Selezionando un corpo vedi <b>tutte le forze che agiscono su di esso</b>: peso, reazioni normali e attriti dei contatti, tensioni delle funi, forze elastiche e forze applicate. La tabella nel pannello Formule ne dà le componenti e confronta la risultante con il prodotto massa per accelerazione. È la <b>seconda legge della dinamica</b>:</p>
$$\\sum \\vec F = m\\,\\vec a$$
<p>Le due righe coincidono a meno di piccoli errori numerici. Se un corpo è fermo, la risultante è nulla: è l'equilibrio, prima legge. Le forze di contatto tra due corpi sono uguali e opposte: terza legge.</p>

<h3>Le forze del costruttore</h3>
<ul>
  <li><b>Molla</b> (legge di Hooke): $F = k\\,|L - L_0|$, diretta lungo la molla; con lo smorzamento si aggiunge un termine $c\\,v_{rel}$.</li>
  <li><b>Fune</b>: inestensibile e di massa trascurabile; tira ma non spinge. Quando è lenta la tensione è zero.</li>
  <li><b>Carrucola</b>: ideale (senza massa né attrito); la tensione è la stessa da entrambi i lati.</li>
  <li><b>Attrito</b>: $f \\le \\mu N$. Il valore di $\\mu$ è quello della superficie fissa su cui il corpo appoggia; tra due corpi mobili vale il minore dei due.</li>
</ul>

<h3>Forze elettriche</h3>
<ul>
  <li>Selezionando un blocco o una sfera puoi dargli una <b>carica</b> $q$ (in µC). Con <i>Carica +</i> e <i>Carica −</i> aggiungi cariche fisse.</li>
  <li>Due cariche si attraggono o si respingono con la <b>legge di Coulomb</b>: $F = k\\,\\dfrac{|q_1 q_2|}{r^2}$.</li>
  <li>Nella sezione Elettromagnetismo della scena puoi accendere un <b>campo elettrico uniforme</b> $\\vec E$ (come tra le armature di un condensatore): su ogni corpo carico agisce $\\vec F = q\\,\\vec E$.</li>
  <li>Nel diagramma di corpo libero la forza elettrica compare in viola come $F_e$.</li>
  <li>Nella sezione Elettromagnetismo puoi mostrare le <b>forze elettriche</b> su tutte le cariche (anche quelle fisse), i <b>vettori del campo</b> e le <b>distanze</b> tra le cariche. Selezionando una carica, il pannello Formule riporta ogni forza di Coulomb con distanza, angolo e componenti.</li>
  <li>Ogni oggetto selezionato ha la sua <b>posizione x, y</b>, che puoi scrivere esattamente; trascinando, gli oggetti scattano su una griglia di 5 cm.</li>
</ul>
<p>Esempi: nei <i>Pendoli carichi</i> all'equilibrio $\\tan\\theta = \\dfrac{F_e}{mg}$; nel <i>Pendolo in un campo uniforme</i> $\\tan\\alpha = \\dfrac{qE}{mg}$ (con i valori dell'esempio $\\alpha \\approx 26{,}6^\\circ$); nell'<i>Orbita</i> la forza di Coulomb fa da forza centripeta: $k\\dfrac{Q|q|}{r^2} = m\\dfrac{v^2}{r}$.</p>

<h3>Bilancio energetico</h3>
$$K + U_g + U_{el} + U_e + Q - W = \\text{costante}$$
<p>con $U_e = k\\,\\dfrac{q_1 q_2}{r}$ per ogni coppia di cariche, più $-q\\,\\vec E\\cdot\\vec r$ per il campo uniforme.</p>
<p>dove $Q$ è l'energia dissipata (attriti, urti anelastici, smorzamento) e $W$ il lavoro delle forze esterne (forze applicate e trascinamento con il dito). Nel grafico <i>Energia</i> la linea tratteggiata deve restare orizzontale.</p>

<div class="box"><b>Limiti del modello</b> (utili da discutere con gli studenti): il motore usa un solo coefficiente d'attrito, quindi $\\mu_s = \\mu_d$; gli urti molto lenti (sotto circa 1 m/s) vengono trattati come anelastici; le carrucole sono ideali. I numeri sono ottimi ma non esatti al millesimo come una formula.</div>

<h3>Idee per la lezione</h3>
<ol>
  <li><b>Atwood</b>: prevedi $a = g\\,\\dfrac{m_1 - m_2}{m_1 + m_2}$ e la tensione, poi verifica nella tabella.</li>
  <li><b>Massa e molla</b>: misura il periodo dal grafico e confrontalo con $T = 2\\pi\\sqrt{m/k}$.</li>
  <li><b>Pendolo</b>: confronta la tensione nel punto più basso con $mg + mv^2/L$.</li>
  <li><b>Urto</b>: verifica che la quantità di moto totale si conserva; poi metti $e = 0$ e osserva dove finisce l'energia.</li>
  <li><b>Piano inclinato, molla e carrucola</b>: qual è la posizione di equilibrio? Calcola l'allungamento della molla e verificalo.</li>
</ol>
`,
};
