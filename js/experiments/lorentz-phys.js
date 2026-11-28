import { deg, tn } from '../core/math.js';
import { sciTeX } from '../core/manim.js';
import { uq } from '../core/units.js';
import { C } from '../core/annot.js';

// Fisica e parametri per l'esperimento «Cariche in campi E e B».
// Coordinate mondo (x, y, z) in cm (1 unità = 1 cm = 0,01 m), terna destrorsa:
// x destra, y alto, z uscente dallo schermo (⊙ = +z, ⊗ = −z).
// Le velocità nello stato di simulazione e in lorentzForces sono in SI (m/s),
// mentre le coordinate spaziali e trail sono in cm.

export const QE = 1.602176634e-19;
export const U_MASS = 1.6605390666e-27;

export const PARTICLES = {
  p: {
    id: 'p',
    name: 'Protone',
    sym: 'p^+',
    qE: 1,
    mU: 1.007276,
    mKg: 1.007276 * U_MASS,
    color: 'red',
  },
  e: {
    id: 'e',
    name: 'Elettrone',
    sym: 'e^-',
    qE: -1,
    mU: 9.1093837e-31 / U_MASS,
    mKg: 9.1093837e-31,
    color: 'blue',
  },
  alpha: {
    id: 'alpha',
    name: 'Particella α',
    sym: '\\alpha',
    qE: 2,
    mU: 4.001506,
    mKg: 4.001506 * U_MASS,
    color: 'green',
  },
};

export const SEL_L = 10;    // lunghezza del selettore di velocità (cm): x ∈ [−SEL_L, 0]
export const SEL_H = 5;     // semialtezza delle armature del selettore (cm): y ∈ [−SEL_H, +SEL_H]
export const SLIT_H = 1.2;  // semiapertura della fenditura d'ingresso a x = 0 (cm): |y| ≤ SLIT_H

export const PARAMS = [
  {
    key: 'particle',
    type: 'select',
    label: 'Particella',
    options: [
      { value: 'p', label: 'Protone (p⁺)' },
      { value: 'e', label: 'Elettrone (e⁻)' },
      { value: 'alpha', label: 'Particella α (He²⁺)' },
      { value: 'custom', label: 'Personalizzata (q, m)' },
    ],
    value: 'p',
    refit: true,
  },
  { key: 'q', label: 'Carica q (personalizzata)', unit: 'e', min: -4, max: 4, step: 1, value: 1, refit: true },
  { key: 'mA', label: 'Massa m (personalizzata)', unit: 'u', min: 0.5, max: 20, step: 0.5, value: 1, refit: true },
  {
    key: 'region',
    type: 'select',
    label: 'Regione dei campi',
    options: [
      { value: 'all', label: 'Ovunque' },
      { value: 'half', label: 'Camera x ≥ 0' },
      { value: 'spectrometer', label: 'Spettrometro' },
    ],
    value: 'all',
    refit: true,
  },
  { key: 'v0', label: 'Velocità nel piano v₀', unit: '×10⁶ m/s', min: 0.2, max: 20, step: 0.1, value: 2.0, refit: true },
  { key: 'theta', label: 'Angolo di lancio θ', unit: '°', min: -90, max: 90, step: 1, value: 0, refit: true },
  { key: 'vz', label: 'Velocità lungo B (v_z)', unit: '×10⁶ m/s', min: -10, max: 10, step: 0.1, value: 0, refit: true },
  { key: 'B', label: 'Campo magnetico B_z', unit: 'mT', min: -1000, max: 1000, step: 1, value: 300, refit: true },
  { key: 'E', label: 'Campo elettrico E_y', unit: 'kV/m', min: -2000, max: 2000, step: 10, value: 0, refit: true },
  { key: 'cycles', label: 'Durata (periodi / corsa)', unit: '', min: 1, max: 10, step: 0.5, value: 3 },
  { key: 'show3d', type: 'toggle', label: 'Vista 3D (elica e spazio)', value: false, live: true },
  { key: 'showFields', type: 'toggle', label: 'Campi E e B', value: true, live: true },
  { key: 'showForces', type: 'toggle', label: 'Forze elettrica e magnetica', short: 'Forze', icon: 'lorentzForce', value: true, live: true },
  { key: 'showVel', type: 'toggle', label: 'Velocità v', value: true, live: true },
  { key: 'showIdeal', type: 'toggle', label: 'Traiettoria / raggio R', short: 'Raggio R', icon: 'radius', value: true, live: true },
  { key: 'showProj', type: 'toggle', label: 'Proiezione sul piano xy (3D)', value: true, live: true },
];

export const PRESETS = [
  {
    label: 'Ciclotrone (solo B)',
    values: { particle: 'p', region: 'all', v0: 2.0, theta: 0, vz: 0, B: 300, E: 0, cycles: 3, show3d: false },
  },
  {
    label: 'Selettore di velocità (E ⊥ B)',
    values: { particle: 'p', region: 'all', v0: 2.0, theta: 0, vz: 0, B: 300, E: 600, cycles: 3, show3d: false },
  },
  {
    label: 'Moto parabolico (solo E)',
    values: { particle: 'p', region: 'all', v0: 2.0, theta: 0, vz: 0, B: 0, E: 400, cycles: 3, show3d: false },
  },
  {
    label: 'Spettrometro di massa',
    values: { particle: 'p', region: 'spectrometer', v0: 2.0, theta: 0, vz: 0, B: 300, E: 600, cycles: 3, show3d: false },
  },
  {
    label: 'Moto elicoidale (3D)',
    values: { particle: 'p', region: 'all', v0: 2.0, theta: 0, vz: 1.2, B: 300, E: 0, cycles: 3, show3d: true },
  },
  {
    label: 'Elettrone in B (q < 0)',
    values: { particle: 'e', region: 'all', v0: 10.0, theta: 0, vz: 0, B: 2, E: 0, cycles: 3, show3d: false },
  },
];

export const GRAPHS = [
  {
    title: 'Posizione',
    series: [
      { key: 'x', label: 'x (cm)', color: 'vel' },
      { key: 'y', label: 'y (cm)', color: 'weight' },
      { key: 'z', label: 'z (cm)', color: 'normal' },
    ],
  },
  {
    title: 'Velocità',
    series: [
      { key: 'vx', label: 'vx (×10⁶ m/s)', color: 'vel' },
      { key: 'vy', label: 'vy (×10⁶ m/s)', color: 'weight' },
      { key: 'vz', label: 'vz (×10⁶ m/s)', color: 'normal' },
    ],
  },
  {
    title: 'Energia',
    series: [
      { key: 'K', label: 'K (keV)', color: 'friction' },
    ],
  },
];

const TIME_UNITS = [
  ['ps', 1e-12],
  ['ns', 1e-9],
  ['µs', 1e-6],
  ['ms', 1e-3],
  ['s', 1],
];

const HALF_START_X_CM = -5;
const MAX_SUB = 320;
const texUnit = u => u.replace(/[μµ]/g, '\\mu ');

export function particleOf(p) {
  if (p.particle !== 'custom' && PARTICLES[p.particle]) {
    const base = PARTICLES[p.particle];
    return {
      id: base.id,
      name: base.name,
      sym: base.sym,
      qE: base.qE,
      qC: base.qE * QE,
      mKg: base.mKg,
      sign: Math.sign(base.qE),
      color: base.color,
    };
  }
  const qE = p.q ?? 1;
  const mU = Math.max(1e-6, p.mA ?? 1);
  return {
    id: 'custom',
    name: 'Personalizzata',
    sym: 'q',
    qE,
    qC: qE * QE,
    mKg: mU * U_MASS,
    sign: Math.sign(qE),
    color: qE > 0 ? 'red' : qE < 0 ? 'blue' : 'yellow',
  };
}

function startPosCm(p) {
  if (p.region === 'spectrometer') return [-SEL_L, 0, 0];
  if (p.region === 'half') return [HALF_START_X_CM, 0, 0];
  return [0, 0, 0];
}

function launchVelSI(p) {
  const vPlane = (p.v0 ?? 2) * 1e6;
  const thDeg = p.theta ?? 0;
  const th = thDeg * deg;
  const cos = Math.abs(thDeg) === 90 ? 0 : Math.cos(th);
  const sin = Math.abs(thDeg) === 90 ? Math.sign(thDeg) : Math.sin(th);
  return [vPlane * cos, vPlane * sin, (p.vz ?? 0) * 1e6];
}

export function charTimeSec(p) {
  const { qC, mKg } = particleOf(p);
  const Bz = (p.B ?? 0) * 1e-3;
  const Ey = (p.E ?? 0) * 1e3;
  const vPlane = (p.v0 ?? 2) * 1e6;
  const vz = (p.vz ?? 0) * 1e6;
  const vTot = Math.max(Math.hypot(vPlane, vz), 1e4);
  const absQB = Math.abs(qC * Bz);

  if (absQB > 0) {
    const Tc = (2 * Math.PI * mKg) / absQB;
    if (p.region === 'spectrometer') {
      const tSel = (SEL_L * 0.01) / Math.max(vPlane * 0.5, 1e5);
      return Math.max(Tc, tSel + 0.5 * Tc);
    }
    return Tc;
  }

  const refDist = p.region === 'spectrometer' ? SEL_L * 0.01 : 0.10;
  const tFly = refDist / vTot;
  const aE = Math.abs(qC * Ey) / mKg;
  if (aE > 0 && p.region !== 'half') {
    const tAcc = Math.sqrt((2 * refDist) / aE);
    return Math.min(tFly, tAcc);
  }
  return tFly;
}

function expectedSpanSec(p) {
  const tc = charTimeSec(p);
  const cyc = p.cycles ?? 3;
  const total = tc * cyc;
  if (p.region === 'spectrometer') {
    const { qC, mKg } = particleOf(p);
    const Bz = (p.B ?? 0) * 1e-3;
    const vPlane = Math.max((p.v0 ?? 2) * 1e6, 1e4);
    const absQB = Math.abs(qC * Bz);
    if (absQB > 0) {
      const Tc = (2 * Math.PI * mKg) / absQB;
      const tSel = (SEL_L * 0.01) / Math.max(vPlane * 0.5, 1e5);
      return Math.min(total, tSel + 0.65 * Tc);
    }
  }
  return total;
}

function timeUnitEntry(p) {
  // Il loop principale arresta qualsiasi esperimento oltre MAX_T = 300 unità di tempo:
  // scegliamo il prefisso SI più piccolo tale che la durata attesa resti sotto 280.
  const span = expectedSpanSec(p);
  for (const entry of TIME_UNITS) {
    if (span / entry[1] <= 280) return entry;
  }
  return TIME_UNITS[TIME_UNITS.length - 1];
}

export function timeUnitOf(p) {
  return timeUnitEntry(p)[0];
}

export function timeUnitScale(p) {
  return timeUnitEntry(p)[1];
}

export function timeScale(s, p) {
  const unitScale = timeUnitScale(p);
  const charUnit = charTimeSec(p) / unitScale;
  const tEnd = s?.tEnd ?? (p.cycles ?? 3) * charUnit;
  const targetSec = p.region === 'spectrometer' ? 6.0 : Math.max(5.5, Math.min(12.0, 2.5 * (p.cycles ?? 3)));
  const raw = p.region === 'spectrometer'
    ? (expectedSpanSec(p) / unitScale) / targetSec
    : tEnd / targetSec;
  return Math.max(0.13, Math.min(500, raw));
}

export function fieldAt(xCm, yCm, zCm, p) {
  void zCm;
  const Ey = (p.E ?? 0) * 1e3;
  const Bz = (p.B ?? 0) * 1e-3;

  if (p.region === 'all') {
    return { Ex: 0, Ey, Ez: 0, Bx: 0, By: 0, Bz, zone: 'all' };
  }
  if (p.region === 'half') {
    if (xCm >= 0) return { Ex: 0, Ey: 0, Ez: 0, Bx: 0, By: 0, Bz, zone: 'chamber' };
    return { Ex: 0, Ey: 0, Ez: 0, Bx: 0, By: 0, Bz: 0, zone: 'free' };
  }
  if (p.region === 'spectrometer') {
    if (xCm >= 0) return { Ex: 0, Ey: 0, Ez: 0, Bx: 0, By: 0, Bz, zone: 'chamber' };
    if (xCm >= -SEL_L && Math.abs(yCm) <= SEL_H) {
      return { Ex: 0, Ey, Ez: 0, Bx: 0, By: 0, Bz, zone: 'selector' };
    }
    return { Ex: 0, Ey: 0, Ez: 0, Bx: 0, By: 0, Bz: 0, zone: 'free' };
  }
  return { Ex: 0, Ey, Ez: 0, Bx: 0, By: 0, Bz, zone: 'all' };
}

export function lorentzForces(vx, vy, vz, xCm, yCm, zCm, p) {
  const { qC, mKg } = particleOf(p);
  const { Ex, Ey, Ez, Bx, By, Bz } = fieldAt(xCm, yCm, zCm, p);
  const FEx = qC * Ex;
  const FEy = qC * Ey;
  const FEz = qC * Ez;
  const FBx = qC * (vy * Bz - vz * By);
  const FBy = qC * (vz * Bx - vx * Bz);
  const FBz = qC * (vx * By - vy * Bx);
  const Fx = FEx + FBx;
  const Fy = FEy + FBy;
  const Fz = FEz + FBz;
  return {
    FE: [FEx, FEy, FEz],
    FB: [FBx, FBy, FBz],
    F: [Fx, Fy, Fz],
    a: [Fx / mKg, Fy / mKg, Fz / mKg],
  };
}

export function analytics(p) {
  const { qC, mKg } = particleOf(p);
  const Bz = (p.B ?? 0) * 1e-3;
  const Ey = (p.E ?? 0) * 1e3;
  const startCm = startPosCm(p);
  const [vx0, vy0, vz0] = launchVelSI(p);
  const vPlane = Math.hypot(vx0, vy0);
  const qOverM = qC / mKg;
  const aE_ms2 = qOverM * Ey;
  const vSel_ms = Math.abs(Bz) > 0 ? Ey / Bz : null;
  const omegaSigned = qOverM * Bz;
  const absOmega = Math.abs(omegaSigned);

  if (!(absOmega > 0)) {
    return {
      startCm,
      R_cm: null,
      T_s: null,
      fc_Hz: 0,
      pitch_cm: null,
      vSel_ms,
      aE_ms2,
      centerCm: null,
      qOverM,
    };
  }

  const R_cm = (vPlane / absOmega) * 100;
  const T_s = (2 * Math.PI) / absOmega;
  const fc_Hz = 1 / T_s;
  const pitch_cm = vz0 * T_s * 100;

  let centerCm = null;
  if (p.region === 'spectrometer') {
    if (Math.abs(p.theta ?? 0) <= 0.5) {
      centerCm = [
        (vy0 / omegaSigned) * 100,
        -(vx0 / omegaSigned) * 100,
        startCm[2],
      ];
    }
  } else if (p.region === 'half') {
    if (Math.abs(vx0) > 1e-3 * vPlane) {
      const refY = startCm[1] - startCm[0] * (vy0 / vx0);
      centerCm = [
        (vy0 / omegaSigned) * 100,
        refY - (vx0 / omegaSigned) * 100,
        startCm[2],
      ];
    }
  } else {
    centerCm = [
      startCm[0] + (vy0 / omegaSigned) * 100,
      startCm[1] - (vx0 / omegaSigned) * 100,
      startCm[2],
    ];
  }

  return {
    startCm,
    R_cm,
    T_s,
    fc_Hz,
    pitch_cm,
    vSel_ms,
    aE_ms2,
    centerCm,
    qOverM,
  };
}

export function init(p) {
  const [x, y, z] = startPosCm(p);
  const [vx, vy, vz] = launchVelSI(p);
  const unitScale = timeUnitScale(p);
  const charUnits = charTimeSec(p) / unitScale;
  return {
    t: 0,
    tSec: 0,
    x,
    y,
    z,
    vx,
    vy,
    vz,
    trail: [[x, y, z]],
    hit: null,
    hitPos: null,
    enteredChamber: p.region === 'all' || (p.region === 'half' && x >= 0),
    tEnd: (p.cycles ?? 3) * charUnits,
  };
}

function borisSubstep(xM, yM, zM, vx, vy, vz, hSec, qC, mKg, p) {
  const halfH = 0.5 * hSec;
  const xm = xM + halfH * vx;
  const ym = yM + halfH * vy;
  const zm = zM + halfH * vz;

  const { Ex, Ey, Ez, Bx, By, Bz } = fieldAt(xm * 100, ym * 100, zm * 100, p);
  const qb = (qC * halfH) / mKg;

  // Mezzo impulso elettrico
  const vmx = vx + qb * Ex;
  const vmy = vy + qb * Ey;
  const vmz = vz + qb * Ez;

  // Rotazione magnetica di Boris (conserva esattamente |v| quando E = 0)
  const tx = qb * Bx;
  const ty = qb * By;
  const tz = qb * Bz;
  const t2 = tx * tx + ty * ty + tz * tz;
  const inv = t2 > 0 ? 2 / (1 + t2) : 2;
  const sx = tx * inv;
  const sy = ty * inv;
  const sz = tz * inv;

  const vpx = vmx + (vmy * tz - vmz * ty);
  const vpy = vmy + (vmz * tx - vmx * tz);
  const vpz = vmz + (vmx * ty - vmy * tx);

  const vplx = vmx + (vpy * sz - vpz * sy);
  const vply = vmy + (vpz * sx - vpx * sz);
  const vplz = vmz + (vpx * sy - vpy * sx);

  // Secondo mezzo impulso elettrico
  const vx1 = vplx + qb * Ex;
  const vy1 = vply + qb * Ey;
  const vz1 = vplz + qb * Ez;

  return [
    xm + halfH * vx1,
    ym + halfH * vy1,
    zm + halfH * vz1,
    vx1,
    vy1,
    vz1,
  ];
}

function pushTrail(s, minDistCm, force = false) {
  const last = s.trail[s.trail.length - 1];
  const d = Math.hypot(s.x - last[0], s.y - last[1], s.z - last[2]);
  if (force ? d > 1e-9 : d >= minDistCm) {
    s.trail.push([s.x, s.y, s.z]);
  }
}

function handleSpectrometerCrossing(s, x0, y0, z0, vx0, vy0, vz0, x1, y1, z1, vx1, vy1, vz1, hSec, unitScale) {
  const halfH = SEL_H;
  const halfSlit = SLIT_H;

  if (!s.enteredChamber) {
    let uPlate = Infinity;
    let yPlate = 0;
    let xPlate = 0;
    if (Math.abs(y1) >= halfH && (Math.abs(y0) < halfH || Math.abs(y1) > Math.abs(y0))) {
      yPlate = y1 >= halfH ? halfH : -halfH;
      const dy = y1 - y0;
      const u = Math.abs(dy) > 1e-15 ? Math.min(1, Math.max(0, (yPlate - y0) / dy)) : 0;
      xPlate = x0 + (x1 - x0) * u;
      if (xPlate >= -SEL_L - 1e-6 && xPlate <= 0) uPlate = u;
    }

    let uSlit = Infinity;
    let ySlit = 0;
    if ((x0 < 0 && x1 >= 0 && x1 > x0) || (x0 === 0 && x1 > 0)) {
      uSlit = x0 < 0 ? -x0 / (x1 - x0) : 0;
      ySlit = y0 + (y1 - y0) * uSlit;
    }

    if (uPlate <= uSlit && uPlate <= 1) {
      const zPlate = z0 + (z1 - z0) * uPlate;
      s.x = xPlate;
      s.y = yPlate;
      s.z = zPlate;
      s.vx = vx0 + (vx1 - vx0) * uPlate;
      s.vy = vy0 + (vy1 - vy0) * uPlate;
      s.vz = vz0 + (vz1 - vz0) * uPlate;
      s.tSec += hSec * uPlate;
      s.t = s.tSec / unitScale;
      s.hit = 'plate';
      s.hitPos = [xPlate, yPlate, zPlate];
      return true;
    }

    if (uSlit <= 1) {
      const zSlit = z0 + (z1 - z0) * uSlit;
      if (Math.abs(ySlit) > halfSlit) {
        s.x = 0;
        s.y = ySlit;
        s.z = zSlit;
        s.vx = vx0 + (vx1 - vx0) * uSlit;
        s.vy = vy0 + (vy1 - vy0) * uSlit;
        s.vz = vz0 + (vz1 - vz0) * uSlit;
        s.tSec += hSec * uSlit;
        s.t = s.tSec / unitScale;
        s.hit = 'slit';
        s.hitPos = [0, ySlit, zSlit];
        return true;
      }
      if (x1 > 0 || vx1 > 0) s.enteredChamber = true;
    }
    return false;
  }

  if ((x0 > 0 || (x0 === 0 && s.enteredChamber && x1 < 0)) && x1 <= 0) {
    const denom = x0 - x1;
    const u = denom > 1e-15 ? x0 / denom : 0;
    const yHit = y0 + (y1 - y0) * u;
    const zHit = z0 + (z1 - z0) * u;
    if (Math.abs(yHit) > halfSlit) {
      s.x = 0;
      s.y = yHit;
      s.z = zHit;
      s.vx = vx0 + (vx1 - vx0) * u;
      s.vy = vy0 + (vy1 - vy0) * u;
      s.vz = vz0 + (vz1 - vz0) * u;
      s.tSec += hSec * u;
      s.t = s.tSec / unitScale;
      s.hit = 'detector';
      s.hitPos = [0, yHit, zHit];
      return true;
    }
    if (x1 < 0 || (x1 === 0 && vx1 < 0)) s.enteredChamber = false;
  }
  return false;
}

export function step(s, dtUnit, p) {
  if (s.hit || s.t >= s.tEnd - 1e-12 || dtUnit <= 0) return;

  const { qC, mKg } = particleOf(p);
  const unitScale = timeUnitScale(p);
  const remUnit = Math.max(0, s.tEnd - s.t);
  const closingStep = dtUnit >= remUnit - 1e-12;
  const stepUnit = closingStep ? remUnit : dtUnit;
  let leftSec = stepUnit * unitScale;
  if (leftSec <= 0) {
    if (closingStep) s.t = s.tEnd;
    return;
  }

  const Bz0 = (p.B ?? 0) * 1e-3;
  const Ey0 = (p.E ?? 0) * 1e3;
  const absOmegaMax = Math.abs((qC * Bz0) / mKg);
  const aEMax = Math.abs((qC * Ey0) / mKg);
  const vPlane0 = (p.v0 ?? 2) * 1e6;
  const R_estCm = absOmegaMax > 0 ? (vPlane0 / absOmegaMax) * 100 : 5;
  const minTrailCm = Math.min(0.25, Math.max(1e-6, R_estCm * 0.03));

  const epsSec = Math.max(1e-24, leftSec * 1e-12);
  const subCap = p.region === 'spectrometer'
    ? Math.min(4000, Math.max(MAX_SUB, Math.ceil((Math.hypot(s.vx, s.vy, s.vz) * 100 * leftSec) / 1.5)))
    : MAX_SUB;

  let sub = 0;
  while (leftSec > epsSec && sub < subCap && !s.hit) {
    const rem = subCap - sub;
    sub++;

    const vMag = Math.hypot(s.vx, s.vy, s.vz);
    let hIdeal = leftSec;
    if (absOmegaMax > 0) hIdeal = Math.min(hIdeal, 0.025 / absOmegaMax);
    if (aEMax > 0) hIdeal = Math.min(hIdeal, (0.04 * Math.max(vMag, 1e5)) / aEMax);

    const nearBoundary =
      (p.region !== 'all' && Math.abs(s.x) < 1.0) ||
      (p.region === 'spectrometer' && !s.enteredChamber && SEL_H - Math.abs(s.y) < 0.4);
    if (vMag > 0) {
      const dxMaxM = nearBoundary ? 0.0005 : 0.004;
      hIdeal = Math.min(hIdeal, dxMaxM / vMag);
    }

    const isLast = rem === 1 || leftSec <= hIdeal * (1 + 1e-12);
    const hSec = isLast ? leftSec : Math.max(leftSec / rem, hIdeal);
    const x0 = s.x, y0 = s.y, z0 = s.z;
    const vx0 = s.vx, vy0 = s.vy, vz0 = s.vz;

    const [x1M, y1M, z1M, vx1, vy1, vz1] = borisSubstep(
      x0 * 0.01, y0 * 0.01, z0 * 0.01,
      vx0, vy0, vz0,
      hSec, qC, mKg, p
    );
    const x1 = x1M * 100, y1 = y1M * 100, z1 = z1M * 100;

    if (p.region === 'spectrometer') {
      const stopped = handleSpectrometerCrossing(
        s, x0, y0, z0, vx0, vy0, vz0,
        x1, y1, z1, vx1, vy1, vz1,
        hSec, unitScale
      );
      if (stopped) {
        pushTrail(s, minTrailCm, true);
        return;
      }
    } else if (p.region === 'half' && x1 >= 0) {
      s.enteredChamber = true;
    }

    s.x = x1;
    s.y = y1;
    s.z = z1;
    s.vx = vx1;
    s.vy = vy1;
    s.vz = vz1;
    s.tSec += hSec;
    s.t = s.tSec / unitScale;
    leftSec = isLast ? 0 : leftSec - hSec;

    pushTrail(s, minTrailCm, false);
  }

  if (!s.hit && (closingStep || s.t >= s.tEnd - 1e-12)) {
    s.t = s.tEnd;
    s.tSec = s.tEnd * unitScale;
    pushTrail(s, minTrailCm, true);
  }
}

export const done = s => !!s.hit || s.t >= s.tEnd - 1e-12;

export function snapshot(s) {
  return {
    t: s.t,
    tSec: s.tSec,
    x: s.x,
    y: s.y,
    z: s.z,
    vx: s.vx,
    vy: s.vy,
    vz: s.vz,
    trailLen: s.trail.length,
    hit: s.hit,
    hitPos: s.hitPos ? s.hitPos.slice() : null,
    enteredChamber: s.enteredChamber,
    tEnd: s.tEnd,
  };
}

export function stateAt(sim, snap) {
  return {
    t: snap.t,
    tSec: snap.tSec,
    x: snap.x,
    y: snap.y,
    z: snap.z,
    vx: snap.vx,
    vy: snap.vy,
    vz: snap.vz,
    trail: sim.trail.slice(0, snap.trailLen),
    hit: snap.hit,
    hitPos: snap.hitPos ? snap.hitPos.slice() : null,
    enteredChamber: snap.enteredChamber,
    tEnd: snap.tEnd,
  };
}

export function resumeFrom(sim, snap) {
  sim.t = snap.t;
  sim.tSec = snap.tSec;
  sim.x = snap.x;
  sim.y = snap.y;
  sim.z = snap.z;
  sim.vx = snap.vx;
  sim.vy = snap.vy;
  sim.vz = snap.vz;
  sim.trail.length = snap.trailLen;
  sim.hit = snap.hit;
  sim.hitPos = snap.hitPos ? snap.hitPos.slice() : null;
  sim.enteredChamber = snap.enteredChamber;
  sim.tEnd = snap.tEnd;
}

export function sample(s, p) {
  const { mKg } = particleOf(p);
  const v2 = s.vx * s.vx + s.vy * s.vy + s.vz * s.vz;
  return {
    t: s.t,
    x: s.x,
    y: s.y,
    z: s.z,
    vx: s.vx * 1e-6,
    vy: s.vy * 1e-6,
    vz: s.vz * 1e-6,
    K: (0.5 * mKg * v2) / (1e3 * QE),
  };
}

function fmtTimeSecTeX(tSec) {
  if (tSec == null || !Number.isFinite(tSec)) return '\\infty';
  const abs = Math.abs(tSec);
  for (const [name, scale] of TIME_UNITS) {
    if (abs < scale * 1000 || name === 's') {
      return `${tn(tSec / scale, 2)}\\ \\mathrm{${texUnit(name)}}`;
    }
  }
  return `${sciTeX(tSec)}\\ \\mathrm{s}`;
}

export function fmtCmTeX(cm) {
  if (cm == null || !Number.isFinite(cm)) return '\\infty';
  const abs = Math.abs(cm);
  if (abs === 0 || abs >= 0.1) return uq('cm', cm, 2);
  if (abs >= 0.01) return `${tn(cm * 10, 2)}\\ \\mathrm{mm}`;
  return `${tn(cm * 1e4, 1)}\\ \\mathrm{\\mu m}`;
}

export function formulas(s, p) {
  const part = particleOf(p);
  const an = analytics(p);
  const fld = fieldAt(s.x, s.y, s.z, p);
  const lf = lorentzForces(s.vx, s.vy, s.vz, s.x, s.y, s.z, p);

  const Bz = (p.B ?? 0) * 1e-3;
  const Ey = (p.E ?? 0) * 1e3;
  const EyActive = p.region === 'half' ? 0 : Ey;
  const vMag = Math.hypot(s.vx, s.vy, s.vz);
  const vPlane = Math.hypot(s.vx, s.vy);
  const FEmag = Math.hypot(...lf.FE);
  const FBmag = Math.hypot(...lf.FB);
  const Fmag = Math.hypot(...lf.F);
  const amag = Math.hypot(...lf.a);
  const K_keV = (0.5 * part.mKg * vMag * vMag) / (1e3 * QE);

  const out = [];
  out.push({ h: 'Forza di Lorentz' });
  out.push({
    key: true,
    tex: `${C('weight', '\\vec F')} = q\\left(${C('field', '\\vec E')} + ${C('vel', '\\vec v')} \\times ${C('tension', '\\vec B')}\\right)`,
  });

  if (part.qC !== 0 && Bz !== 0 && EyActive === 0) {
    out.push({
      key: true,
      tex: `R = \\dfrac{m\\,${C('vel', 'v_\\perp')}}{|q|\\,${C('tension', '|B_z|')}} = ${fmtCmTeX(an.R_cm)}\\qquad T = \\dfrac{2\\pi m}{|q|\\,${C('tension', '|B_z|')}} = ${fmtTimeSecTeX(an.T_s)}`,
    });
  } else if (part.qC !== 0 && Bz !== 0 && EyActive !== 0) {
    const second = p.region === 'spectrometer'
      ? `d = 2R = ${fmtCmTeX(2 * an.R_cm)}`
      : `R = ${fmtCmTeX(an.R_cm)}`;
    out.push({
      key: true,
      tex: `v_{\\text{sel}} = \\dfrac{${C('field', 'E_y')}}{${C('tension', 'B_z')}} = ${sciTeX(an.vSel_ms)}\\ \\mathrm{m/s}\\qquad ${second}`,
    });
  } else if (part.qC !== 0 && Bz === 0 && EyActive !== 0) {
    out.push({
      key: true,
      tex: `${C('applied', 'F_E')} = q\\,${C('field', 'E_y')}\\qquad a_E = \\dfrac{q\\,${C('field', 'E_y')}}{m} = ${sciTeX(an.aE_ms2)}\\ \\mathrm{m/s^2}`,
    });
  } else {
    out.push({
      key: true,
      tex: `${C('weight', '\\vec F')} = 0\\qquad ${C('vel', '\\vec v')} = \\text{costante}`,
    });
  }

  out.push({ h: 'Particella e campi nella posizione attuale' });
  const qSign = part.qE > 0 ? '+' : '';
  out.push({
    tex: `q = ${qSign}${tn(part.qE, 1)}\\,e = ${sciTeX(part.qC)}\\ \\mathrm{C}`,
  });
  out.push({
    tex: `m = ${sciTeX(part.mKg)}\\ \\mathrm{kg}\\qquad \\dfrac{q}{m} = ${sciTeX(an.qOverM)}\\ \\mathrm{C/kg}`,
  });
  const zoneLabel =
    fld.zone === 'selector' ? 'selettore' :
    fld.zone === 'chamber' ? 'camera\\ magnetica' :
    fld.zone === 'free' ? 'regione\\ libera' :
    'campo\\ ovunque';
  out.push({
    tex: `\\text{zona: } \\mathrm{${zoneLabel}}`,
  });
  out.push({
    tex: `${C('field', 'E_y')} = ${tn(fld.Ey * 1e-3, 0)}\\ \\mathrm{kV/m}\\qquad ${C('tension', 'B_z')} = ${tn(fld.Bz * 1e3, 0)}\\ \\mathrm{mT}`,
  });

  out.push({ h: 'Forze istantanee' });
  out.push({
    tex: `${C('applied', '\\vec F_E')} = (0,\\ ${sciTeX(lf.FE[1])},\\ 0)\\ \\mathrm{N}`,
  });
  out.push({
    tex: `|${C('applied', '\\vec F_E')}| = ${sciTeX(FEmag)}\\ \\mathrm{N}`,
  });
  out.push({
    tex: `${C('normal', '\\vec F_B')} = (${sciTeX(lf.FB[0])},\\ ${sciTeX(lf.FB[1])},\\ 0)\\ \\mathrm{N}`,
  });
  out.push({
    tex: `|${C('normal', '\\vec F_B')}| = ${sciTeX(FBmag)}\\ \\mathrm{N}`,
  });
  out.push({
    tex: `|${C('weight', '\\vec F')}| = ${sciTeX(Fmag)}\\ \\mathrm{N}`,
  });
  out.push({
    tex: `|\\vec a| = \\dfrac{|${C('weight', '\\vec F')}|}{m} = ${sciTeX(amag)}\\ \\mathrm{m/s^2}`,
  });

  if (part.qC !== 0 && Bz !== 0) {
    out.push({ h: 'Moto ciclotrone ed elica' });
    out.push({
      tex: `R = \\dfrac{m\\,${C('vel', 'v_\\perp')}}{|q|\\,${C('tension', '|B_z|')}} = ${fmtCmTeX(an.R_cm)}`,
    });
    out.push({
      tex: `f_c = \\dfrac{1}{T} = ${sciTeX(an.fc_Hz)}\\ \\mathrm{Hz}`,
    });
    if (Math.abs(p.vz ?? 0) > 1e-6) {
      out.push({
        tex: `p_{\\text{elica}} = |${C('vel', 'v_z')}|\\,T = ${fmtCmTeX(Math.abs(an.pitch_cm))}`,
      });
    }
  }

  if (p.region === 'spectrometer') {
    out.push({ h: 'Selettore e spettrometro' });
    if (an.vSel_ms != null) {
      out.push({
        tex: `v_{\\text{sel}} = \\dfrac{${C('field', 'E_y')}}{${C('tension', 'B_z')}} = ${sciTeX(an.vSel_ms)}\\ \\mathrm{m/s}`,
      });
    }
    if (an.R_cm != null) {
      const yIdealDet = -Math.sign(part.qC * Bz) * 2 * an.R_cm;
      out.push({
        tex: `d = 2R = ${fmtCmTeX(2 * an.R_cm)}\\qquad y_{\\text{riv, ideale}} = ${fmtCmTeX(yIdealDet)}`,
      });
    }
    if (s.hit === 'plate') {
      out.push({
        tex: `\\text{Impatto sull'armatura a } x = ${uq('cm', s.hitPos[0], 2)},\\ y = ${uq('cm', s.hitPos[1], 2)}`,
        cls: 'warn',
      });
    } else if (s.hit === 'slit') {
      out.push({
        tex: `\\text{Fermata dal collimatore a } x = 0,\\ y = ${uq('cm', s.hitPos[1], 2)}`,
        cls: 'warn',
      });
    } else if (s.hit === 'detector') {
      out.push({
        tex: `\\text{Rivelata su } x = 0\\text{ a } y = ${uq('cm', s.hitPos[1], 2)}`,
      });
    }
  }

  out.push({ h: 'Istante attuale' });
  out.push({
    tex: `t = ${tn(s.t, 2)}\\ \\mathrm{${texUnit(timeUnitOf(p))}}\\qquad K = \\tfrac{1}{2} m v^2 = ${tn(K_keV, 2)}\\ \\mathrm{keV}`,
  });
  const microPos = an.R_cm != null && an.R_cm < 0.1 && EyActive === 0 && p.region === 'all';
  const fmtPos = v => (microPos ? fmtCmTeX(v) : uq('cm', v, 2));
  out.push({
    tex: `\\vec r = (${fmtPos(s.x)},\\ ${fmtPos(s.y)},\\ ${fmtPos(s.z)})`,
  });
  out.push({
    tex: `${C('vel', '\\vec v')} = (${tn(s.vx * 1e-6, 2)},\\ ${tn(s.vy * 1e-6, 2)},\\ ${tn(s.vz * 1e-6, 2)})\\cdot 10^{6}\\ \\mathrm{m/s}\\qquad |${C('vel', '\\vec v_\\perp')}| = ${tn(vPlane * 1e-6, 2)}\\cdot 10^{6}\\ \\mathrm{m/s}`,
  });

  return out;
}

export const THEORY = `
<h2>Cariche in campi E e B</h2>
<p>Una carica puntiforme $q$ che si muove con velocità $\\vec v$ in una regione in cui sono presenti un campo elettrico $\\vec E$ e un campo magnetico $\\vec B$ subisce la <b>forza di Lorentz</b>:</p>
$$\\vec F = \\vec F_E + \\vec F_B = q\\left(\\vec E + \\vec v \\times \\vec B\\right)$$
<p>Nella simulazione gli assi formano una terna destrorsa: $x$ verso destra, $y$ verso l'alto e $z$ uscente dallo schermo ($\\odot$ indica $+z$ uscente, $\\otimes$ indica $-z$ entrante).</p>
<ul>
  <li><b>Forza elettrica</b> $\\vec F_E = q\\vec E$: ha la stessa direzione del campo elettrico (concorde per $q > 0$, opposta per $q < 0$) e agisce anche su cariche ferme.</li>
  <li><b>Forza magnetica</b> $\\vec F_B = q(\\vec v \\times \\vec B)$: è sempre perpendicolare sia a $\\vec v$ sia a $\\vec B$, ha modulo $F_B = |q|\\,v\\,B\\sin\\alpha$ (con $\\vec B = B_z\\,\\hat k$, $F_{Bx} = q\\,v_y B_z$ e $F_{By} = -q\\,v_x B_z$).</li>
</ul>
<p>Poiché $\\vec F_B \\perp \\vec v$ in ogni istante, la potenza $P_B = \\vec F_B \\cdot \\vec v$ è <b>sempre nulla</b>: il campo magnetico devia la traiettoria ma non compie lavoro e non cambia il modulo della velocità né l'energia cinetica $K = \\tfrac12 m v^2$.</p>

<h3>Moto di ciclotrone (solo B, v ⊥ B)</h3>
<p>Se $\\vec E = 0$ e $\\vec v$ giace nel piano $xy$ (perpendicolare a $\\vec B = B_z\\,\\hat k$), la forza magnetica fornisce l'accelerazione centripeta necessaria a un <b>moto circolare uniforme</b>:</p>
$$|q|\\,v_\\perp |B_z| = \\frac{m\\,v_\\perp^2}{R} \\quad\\Longrightarrow\\quad R = \\frac{m\\,v_\\perp}{|q|\\,|B_z|}$$
<p>Il periodo $T$ e la frequenza di ciclotrone $f_c$ non dipendono né dalla velocità né dal raggio dell'orbita (principio su cui si basa il ciclotrone):</p>
$$T = \\frac{2\\pi R}{v_\\perp} = \\frac{2\\pi m}{|q|\\,|B_z|} \\qquad f_c = \\frac{1}{T} = \\frac{|q|\\,|B_z|}{2\\pi m}$$
<p>Con $v_x > 0$ e $B_z > 0$, una carica positiva ($q > 0$) curva verso $-y$ (orbita oraria), mentre una carica negativa ($q < 0$, come l'elettrone) curva verso $+y$ (orbita antioraria).</p>

<h3>Moto elicoidale in 3D</h3>
<p>Se la carica possiede anche una componente di velocità $v_z$ parallela a $\\vec B$, il prodotto vettoriale $\\vec v_z \\times \\vec B$ è nullo: lungo $z$ non agisce alcuna forza magnetica e $v_z$ resta costante. La composizione del moto circolare uniforme nel piano $xy$ con il moto rettilineo uniforme lungo $z$ produce un'<b>elica cilindrica</b> di raggio $R$ e <b>passo</b>:</p>
$$p = |v_z|\\,T = \\frac{2\\pi m\\,|v_z|}{|q|\\,|B_z|}$$

<h3>Selettore di velocità (E ⊥ B)</h3>
<p>In un selettore di velocità sono sovrapposti un campo elettrico $\\vec E = (0, E_y, 0)$ e un campo magnetico $\\vec B = (0, 0, B_z)$ tra due armature parallele. Per una carica che entra lungo $+x$ con $\\vec v = (v_x, 0, 0)$, la forza risultante lungo $y$ è:</p>
$$F_y = q\\,E_y - q\\,v_x B_z$$
<p>Le due forze si compensano esattamente ($F_y = 0$) solo quando:</p>
$$v_x = v_{\\text{sel}} = \\frac{E_y}{B_z}$$
<p>La velocità selezionata non dipende né dalla carica $q$ né dalla massa $m$: le particelle più veloci o più lente deviano e vengono arrestate dalle armature o dal collimatore.</p>

<h3>Spettrometro di massa</h3>
<p>Subito oltre la fenditura d'uscita ($x = 0$), solo le particelle con velocità $v = E_y/B_z$ entrano nella camera magnetica ($x \\ge 0$, dove $\\vec E = 0$). Sotto l'azione del solo campo $\\vec B$, descrivono una semicirconferenza di raggio $R = m v / (|q|\\,|B_z|)$ e colpiscono il rivelatore posto sul piano $x = 0$ a una distanza dal foro pari al diametro:</p>
$$d = 2R = \\frac{2\\,m\\,v}{|q|\\,|B_z|} = \\frac{2\\,m\\,|E_y|}{|q|\\,B_z^2}$$
<p>Misurando $d$ si risale al rapporto $m/|q|$ e si possono separare isotopi diversi dello stesso elemento.</p>

<h3>Prova con la simulazione</h3>
<ol>
  <li><b>Ciclotrone (solo B)</b>: raddoppia $v_0$ e verifica nelle formule e nella scena che $R$ raddoppia mentre il periodo $T$ resta identico.</li>
  <li><b>Elettrone in B (q &lt; 0)</b>: osserva il verso di curvatura opposto rispetto al protone e nota quanto è più piccolo $B$ necessario per ottenere un raggio confrontabile (perché $m_e \\ll m_p$).</li>
  <li><b>Moto elicoidale (3D)</b>: attiva la vista 3D e osserva contemporaneamente l'elica nello spazio e la sua proiezione circolare sul piano $xy$; verifica nel grafico che l'energia cinetica $K$ rimane costante.</li>
  <li><b>Selettore di velocità</b>: prova a cambiare leggermente $v_0$ da $2{,}0$ a $2{,}4 \\cdot 10^6\\ \\mathrm{m/s}$ e poi cambia particella da protone a $\\alpha$ mantenendo $v_0 = 2{,}0$: chi riesce a proseguire diritto?</li>
  <li><b>Spettrometro di massa</b>: confronta la posizione d'impatto sul rivelatore tra protone ($m/q \\approx 1\\ \\mathrm{u}/e$) e particella $\\alpha$ ($m/q \\approx 2\\ \\mathrm{u}/e$): il diametro $d$ raddoppia circa?</li>
</ol>

<h3>Esercizi</h3>
<details><summary>1. Un protone ($m = 1{,}673\\cdot10^{-27}\\ \\mathrm{kg}$, $q = 1{,}602\\cdot10^{-19}\\ \\mathrm{C}$) entra perpendicolarmente in $B = 300\\ \\mathrm{mT}$ con $v = 2{,}0\\cdot10^6\\ \\mathrm{m/s}$. Calcola forza magnetica, raggio e periodo.</summary>
<p>$F_B = q v B = 1{,}602\\cdot10^{-19} \\cdot 2{,}0\\cdot10^6 \\cdot 0{,}30 \\approx 9{,}61\\cdot10^{-14}\\ \\mathrm{N}$;<br>
$R = \\dfrac{m v}{q B} = \\dfrac{1{,}673\\cdot10^{-27}\\cdot 2{,}0\\cdot10^6}{1{,}602\\cdot10^{-19}\\cdot 0{,}30} \\approx 6{,}96\\ \\mathrm{cm}$;<br>
$T = \\dfrac{2\\pi m}{q B} \\approx 2{,}19\\cdot10^{-7}\\ \\mathrm{s} = 219\\ \\mathrm{ns}$.</p></details>
<details><summary>2. Con $B = 300\\ \\mathrm{mT}$, quale campo elettrico $E_y$ serve in un selettore per far passare ioni a $v = 2{,}0\\cdot10^6\\ \\mathrm{m/s}$? Cambia qualcosa per uno ione con carica $+2e$?</summary>
<p>$E_y = v B_z = 2{,}0\\cdot10^6 \\cdot 0{,}30 = 6{,}0\\cdot10^5\\ \\mathrm{V/m} = 600\\ \\mathrm{kV/m}$.<br>
Non cambia nulla: nell'equilibrio $q E_y = q v B_z$ la carica $q$ si semplifica (purché $q \\neq 0$).</p></details>
<details><summary>3. Un protone ($1{,}007\\ \\mathrm{u}$, $+1e$) e una particella $\\alpha$ ($4{,}002\\ \\mathrm{u}$, $+2e$) escono dallo stesso selettore a $v = 2{,}0\\cdot10^6\\ \\mathrm{m/s}$ ed entrano nella camera magnetica con $B = 300\\ \\mathrm{mT}$. Dove colpiscono il rivelatore?</summary>
<p>Per il protone $R_p \\approx 6{,}96\\ \\mathrm{cm} \\Rightarrow d_p = 2R_p \\approx 13{,}9\\ \\mathrm{cm}$ (a $y \\approx -13{,}9\\ \\mathrm{cm}$).<br>
Per la particella $\\alpha$, il rapporto $m/|q|$ è quasi doppio ($4{,}002/2 \\approx 2{,}001\\ \\mathrm{u}/e$), quindi $R_\\alpha \\approx 13{,}8\\ \\mathrm{cm} \\Rightarrow d_\\alpha = 2R_\\alpha \\approx 27{,}6\\ \\mathrm{cm}$ (a $y \\approx -27{,}6\\ \\mathrm{cm}$).</p></details>
<details><summary>4. Un elettrone ($m_e = 9{,}109\\cdot10^{-31}\\ \\mathrm{kg}$) si muove in $B_z = 2{,}0\\ \\mathrm{mT}$ con $v_\\perp = 10\\cdot10^6\\ \\mathrm{m/s}$ e $v_z = 4{,}0\\cdot10^6\\ \\mathrm{m/s}$. Calcola raggio, periodo e passo dell'elica.</summary>
<p>$R = \\dfrac{m_e v_\\perp}{e B} = \\dfrac{9{,}109\\cdot10^{-31}\\cdot 1{,}0\\cdot10^7}{1{,}602\\cdot10^{-19}\\cdot 2{,}0\\cdot10^{-3}} \\approx 2{,}84\\ \\mathrm{cm}$;<br>
$T = \\dfrac{2\\pi m_e}{e B} \\approx 17{,}9\\ \\mathrm{ns}$;<br>
$p = |v_z|\\,T = 4{,}0\\cdot10^6 \\cdot 1{,}786\\cdot10^{-8} \\approx 7{,}14\\ \\mathrm{cm}$.</p></details>
`;
