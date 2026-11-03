export const deg = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Passo Runge-Kutta del 4° ordine su un vettore di stato (array di numeri).
export function rk4(y, dt, f) {
  const n = y.length, tmp = new Array(n);
  const k1 = f(y);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + dt / 2 * k1[i];
  const k2 = f(tmp);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + dt / 2 * k2[i];
  const k3 = f(tmp);
  for (let i = 0; i < n; i++) tmp[i] = y[i] + dt * k3[i];
  const k4 = f(tmp);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

// Numero in formato italiano per LaTeX (virgola decimale): 3.14 -> "3{,}14".
export function tn(x, d = 2) {
  let s = (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d);
  return s.replace('.', '{,}');
}

// Numero in formato italiano per testo semplice.
export function fmt(x, d = 2) {
  return (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d).replace('.', ',');
}

export function decimalsOf(step) {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

// Passo "tondo" (1, 2, 5 × 10^n) maggiore o uguale a raw.
export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
