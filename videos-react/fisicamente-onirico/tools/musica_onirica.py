# Colonna sonora "onirica, ritmata, quasi epica" per il film di lancio di Fisicamente.
# Re minore, 100 BPM: un movimento = 36 fotogrammi a 60 fps, una battuta = 144.
# Struttura (battute 0-26, 64,8 s):
#   0-1   intro sognante (pad che si apre, campane)
#   2-7   groove (rivelazione del nome sulla 2, arpeggio, cassa morbida, basso)
#   8-9   crescendo (taiko, rullante, riser, pausa sull'ultimo movimento)
#   10-17 drop A (tamburi pieni, coro, melodia di ottoni sintetici)
#   18-19 respiro (niente batteria, campane, poi risalita e pausa)
#   20-23 drop B (melodia raddoppiata all'ottava)
#   24-26 coda (impatto finale, pad e campane che sfumano)
# Uso: uv run --with numpy --with scipy python tools/musica_onirica.py
import os
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT
NBARS = 27
OUT = 24  # prima battuta della coda
DUR = NBARS * BAR
N = int(round(DUR * SR))
rng = np.random.default_rng(7)
T = np.arange(N) / SR


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tb(bar, beat=0.0):
    return bar * BAR + beat * BEAT


def track():
    return np.zeros((2, N))


def add(tr, t, sig, pan=0.0, gain=1.0):
    i = int(round(t * SR))
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    n = min(sig.shape[1], N - i)
    if n <= 0:
        return
    tr[:, i:i + n] += gain * sig[:, :n]


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x, axis=-1)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x, axis=-1)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x, axis=-1)


def adsr(dur, a=0.01, d=0.1, s=0.8, r=0.3):
    n = int((dur + r) * SR)
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t >= dur
    e[rel] = e[rel] * np.exp(-(t[rel] - dur) / (r / 4))
    k = min(n, int(0.004 * SR))  # chiusura morbida contro i clic
    e[-k:] *= np.linspace(1, 0, k)
    return e


# --- oscillatori a tabella, senza aliasing ---
TBL = 4096
_tables = {}


def _saw_table(nh):
    if nh not in _tables:
        ph = np.arange(TBL) / TBL * 2 * np.pi
        k = np.arange(1, nh + 1)
        _tables[nh] = (np.sin(np.outer(ph, k)) / k).sum(1) * (2 / np.pi)
    return _tables[nh]


def saw(freq, n, vib=None):
    nh = int(max(1, min(90, 15000 / freq)))
    tab = _saw_table(nh)
    f = np.full(n, freq) if vib is None else freq * vib[:n]
    ph = rng.random() + np.cumsum(f) / SR
    idx = (ph % 1.0) * TBL
    i0 = idx.astype(np.int64)
    fr = idx - i0
    return tab[i0 % TBL] * (1 - fr) + tab[(i0 + 1) % TBL] * fr


def sine(freq, n, phase=0.0):
    return np.sin(2 * np.pi * freq * np.arange(n) / SR + phase)


# --- strumenti ---
def supersaw_note(m, dur, a, r, voices=5, spread=0.12, width=0.8):
    e = adsr(dur, a, 0.6, 0.85, r)
    n = len(e)
    out = np.zeros((2, n))
    for v in range(voices):
        det = (v - (voices - 1) / 2) / ((voices - 1) / 2) * spread  # semitoni
        s = saw(mtof(m + det), n)
        pan = (v - (voices - 1) / 2) / ((voices - 1) / 2) * width
        ang = (pan + 1) * np.pi / 4
        out[0] += s * np.cos(ang)
        out[1] += s * np.sin(ang)
    return out * e / voices


def pluck(m, dur=0.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = 0.6 * saw(mtof(m), n) + 0.5 * sine(mtof(m), n) + 0.25 * sine(mtof(m + 12), n)
    e = np.exp(-t / 0.16) * np.minimum(1, t / 0.002)
    return lp(s * e, 3200)


def bell(m, dur=3.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    idx = 2.2 * np.exp(-t / 0.5)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t))
    s += 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.6)
    e = np.exp(-t / 1.1) * np.minimum(1, t / 0.003)
    return s * e


def kick(n_sec=0.5, f0=150, f1=44):
    n = int(n_sec * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / 0.03)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = lp(rng.standard_normal(n), 4000) * np.exp(-t / 0.004) * 0.25
    return np.tanh(1.6 * (s + click))


def taiko():
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    f = 52 + 60 * np.exp(-t / 0.05)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45)
    skin = lp(rng.standard_normal(n), 900) * np.exp(-t / 0.06) * 0.8
    return np.tanh(1.3 * (s + skin))


def tom(m=45):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.6 * np.exp(-t / 0.04))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.25)
    s += lp(rng.standard_normal(n), 1500) * np.exp(-t / 0.04) * 0.4
    return s


def clap():
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    nz = bp(rng.standard_normal(n), 900, 5000)
    e = np.zeros(n)
    for off in (0.0, 0.011, 0.022):
        tt = t - off
        e += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / (0.008 if off < 0.02 else 0.13)), 0)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.4
    return nz * e * 0.8 + body


def snare(vel=1.0):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    nz = bp(rng.standard_normal(n), 1500, 7000) * np.exp(-t / 0.07)
    body = np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.04)
    return vel * (0.7 * nz + 0.4 * body)


def hat(dec=0.035):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500, 4) * np.exp(-t / dec)


def crash(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    nz = hp(rng.standard_normal((2, n)), 3500, 2)
    return nz * np.exp(-t / 0.9) * np.minimum(1, t / 0.002)


def impact():
    n = int(4.0 * SR)
    t = np.arange(n) / SR
    f = 30 + 45 * np.exp(-t / 0.15)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.3)
    rumble = lp(rng.standard_normal(n), 220, 4) * np.exp(-t / 0.7) * 1.5
    return np.tanh(1.5 * (boom + rumble))


def riser(dur, f_lo=300, f_hi=9000):
    # rumore che sale di frequenza: finestre filtrate sovrapposte
    n = int(dur * SR)
    out = np.zeros((2, n))
    seg = int(0.12 * SR)
    hop = seg // 2
    win = np.hanning(seg)
    nz = rng.standard_normal((2, n + seg))
    for i in range(0, n, hop):
        x = i / n
        fc = f_lo * (f_hi / f_lo) ** (x ** 1.6)
        piece = bp(nz[:, i:i + seg], fc * 0.7, min(fc * 1.4, SR / 2 - 100))
        m = min(seg, n - i)
        out[:, i:i + m] += (piece * win)[:, :m]
    amp = (np.arange(n) / n) ** 2.2
    gl = mtof(50 + 24 * (np.arange(n) / n) ** 1.5) / mtof(50)  # glissando che sale
    tone = lp(saw(mtof(50), n, vib=gl), 2500) * 0.25
    return (out + tone) * amp


def reverse_swell(dur):
    c = crash(dur + 0.2)[:, :int(dur * SR)]
    return c[:, ::-1] * 0.8


def make_ir(sec, decay, fc, pre=0.02):
    n = int(sec * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((2, n)) * np.exp(-t / decay * 6.9)
    ir = lp(ir, fc)
    ir = np.concatenate([np.zeros((2, int(pre * SR))), ir], axis=1)
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def reverb(x, ir):
    return np.stack([fftconvolve(x[c], ir[c])[:N] for c in range(2)])


def pingpong(x, delay, fb=0.45, taps=6):
    d = int(delay * SR)
    out = np.zeros_like(x)
    mono = x.mean(0)
    for k in range(1, taps + 1):
        ch = (k - 1) % 2
        if k * d < N:
            out[ch, k * d:] += mono[:N - k * d] * fb ** k
    return lp(out, 4500)


def automation(points):
    ts = np.array([p[0] for p in points])
    vs = np.array([p[1] for p in points])
    return np.interp(T, ts, vs)


# --- armonia: i - VI - III - VII ---
CHORDS = [
    ([57, 62, 65, 69, 76], 38),  # Re minore (add9)
    ([58, 62, 65, 70, 72], 34),  # Si bemolle (add9)
    ([57, 60, 65, 67, 72], 41),  # Fa (add9)
    ([55, 60, 64, 67, 74], 36),  # Do (add9)
]

# Sezioni (battute)
GROOVE = range(2, 8)
BUILD = (8, 9)          # crescendo, pausa sull'ultimo movimento della 9
DROP_A = range(10, 18)
BREAK = range(18, 20)   # respiro: niente batteria
DROP_B = range(20, 24)
DROPS = list(DROP_A) + list(DROP_B)


def chord(bar):
    return CHORDS[0] if bar >= OUT else CHORDS[bar % 4]


pad, choir, bass, arp, bells, lead, drums, fx = (track() for _ in range(8))

# PAD: un accordo per battuta, la coda resta su Re minore
for b in range(OUT):
    notes, _ = chord(b)
    a = 1.6 if b in (0, 18) else 0.35
    for m in notes:
        add(pad, tb(b), supersaw_note(m, BAR, a, 1.4))
for m in CHORDS[0][0] + [50]:
    add(pad, tb(OUT), supersaw_note(m, 2.5 * BAR, 0.3, 2.6))

# CORO (vocale "a") nei drop, piano nel respiro, e nella coda
for b in DROPS + list(BREAK) + [OUT]:
    notes, _ = chord(b)
    dur = BAR if b < OUT else 2.2 * BAR
    g = 0.45 if b in BREAK else 1.0
    for m in notes[1:]:
        src = supersaw_note(m + 12, dur, 0.25 if b not in BREAK else 0.9, 1.5, voices=3, spread=0.08)
        v = sum(gg * bp(src, f * 0.85, f * 1.15) for f, gg in ((730, 1.0), (1090, 0.6), (2440, 0.25)))
        add(choir, tb(b), v * g)

# BASSO
for b in range(2, OUT):
    _, root = chord(b)
    if b in BREAK:
        e = adsr(BAR * 0.95, 0.3, 1.0, 0.7, 0.8)
        add(bass, tb(b), sine(mtof(root), len(e)) * e * 0.6)
        continue
    if b in GROOVE:
        hits = [(0, 1.6), (2.5, 1.2)]
    else:
        hits = [(i * 0.5, 0.42) for i in range(8)]
        if b == BUILD[1]:
            hits = [h for h in hits if h[0] < 3]
    for beat, d in hits:
        m = root + (12 if (b in DROPS and int(beat * 2) % 4 == 3) else 0)
        e = adsr(d * BEAT, 0.005, 0.2, 0.7, 0.08)
        s = sine(mtof(m), len(e)) + 0.3 * lp(saw(mtof(m), len(e)), 600)
        add(bass, tb(b, beat), np.tanh(1.8 * s * e) * 0.8)
_, root = chord(OUT)
e = adsr(2.0 * BAR, 0.01, 1.0, 0.6, 2.0)
add(bass, tb(OUT), sine(mtof(root), len(e)) * e * 0.8)

# ARPEGGIO in sedicesimi
PATT = [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 3, 4, 3]
for b in range(2, OUT):
    notes, _ = chord(b)
    for i, k in enumerate(PATT):
        if b == BUILD[1] and i >= 12:
            break
        if b == 18 and i % 2:  # nel respiro solo ottavi
            continue
        oct_ = 12 if (b in DROPS and i % 8 >= 4) else 0
        vel = 0.75 + 0.25 * (i % 4 == 0)
        add(arp, tb(b, i * 0.25), pluck(notes[k] + 12 + oct_) * vel, pan=-0.35 if i % 2 == 0 else 0.35)

# CAMPANE: motivo dell'intro, ripreso nel respiro e nella coda
INTRO = [(0, 0, 81), (0, 1.5, 86), (0, 2.5, 88), (0, 3, 89), (1, 0, 86), (1, 1.5, 82), (1, 3, 81)]
for b, bt, m in INTRO:
    add(bells, tb(b, bt), bell(m), pan=rng.uniform(-0.4, 0.4))
    add(bells, tb(b + 18, bt), bell(m) * 0.9, pan=rng.uniform(-0.5, 0.5))
add(bells, tb(2), bell(93) * 0.7)  # scintilla sulla rivelazione del nome
for b, bt, m in [(OUT, 0, 86), (OUT, 1.5, 89), (OUT, 3, 93), (OUT + 1, 0, 88), (OUT + 1, 2, 86), (OUT + 2, 0, 81)]:
    add(bells, tb(b, bt), bell(m) * 0.8, pan=rng.uniform(-0.5, 0.5))

# MELODIA EPICA: frase di 8 battute nel drop A, ultime 4 un'ottava sopra (raddoppiate) nel drop B
FRASE = [
    [(74, 2), (76, 1), (77, 1)],
    [(77, 3), (74, 1)],
    [(72, 2), (74, 1), (77, 1)],
    [(79, 4)],
    [(81, 2), (79, 1), (77, 1)],
    [(77, 2), (79, 1), (81, 1)],
    [(81, 2), (84, 1), (81, 1)],
    [(79, 3), (81, 1)],
]
MEL = {}
for i, b in enumerate(DROP_A):
    MEL[b] = [(m, d, 1.0) for m, d in FRASE[i]]
for i, b in enumerate(DROP_B):
    MEL[b] = [(m, d, 1.0) for m, d in FRASE[4 + i]] + [(m + 12, d, 0.35) for m, d in FRASE[4 + i]]
MEL[OUT] = [(86, 6, 1.0)]


def lead_note(m, d):
    e = adsr(d * BEAT * 0.95, 0.07, 0.4, 0.8, 0.9)
    n = len(e)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.3) / 0.4, 0, 1)
    s = 0.5 * saw(mtof(m), n, vib) + 0.5 * saw(mtof(m + 0.08), n, vib) + 0.6 * sine(mtof(m - 12), n)
    return lp(s, 2600) * e * 0.55


for b, seq in MEL.items():
    pos = {}
    for m, d, g in seq:
        bt = pos.get(g, 0.0)
        add(lead, tb(b, bt), lead_note(m, d) * g)
        pos[g] = bt + d

# BATTERIA
kick_times = []


def K(t, g=1.0):
    add(drums, t, kick(), gain=0.95 * g)
    kick_times.append(t)


for b in GROOVE:
    for bt in ([0, 2] if b < 4 else [0, 1.5, 2]):
        K(tb(b, bt), 0.75)
    if b >= 3:
        for i in range(4):
            add(drums, tb(b, i + 0.5), hat(), pan=0.3, gain=0.12)
    if b >= 4:
        for bt in (1, 3):
            add(drums, tb(b, bt), clap(), gain=0.35)
        for i in range(16):
            add(drums, tb(b, i * 0.25), hat(0.02), pan=-0.3, gain=0.05 + 0.04 * (i % 2))


def crescendo(b1, b2, con_cassa=True):
    for bt in range(4):
        add(drums, tb(b1, bt), taiko(), gain=0.8)
        if con_cassa:
            K(tb(b1, bt), 0.7)
    for i in range(6):
        add(drums, tb(b2, i * 0.5), taiko(), gain=0.7 + 0.05 * i)
    for i in range(12):  # rullante in sedicesimi fino al terzo movimento
        add(drums, tb(b2, i * 0.25), snare(0.25 + 0.06 * i), pan=0.15)
    add(fx, tb(b1), riser(2 * BAR - BEAT), gain=0.55)
    add(fx, tb(b2, 3), reverse_swell(BEAT), gain=0.9)


crescendo(*BUILD)
# nel respiro: solo la seconda battuta cresce (senza cassa), poi la pausa
for i in range(12):
    add(drums, tb(19, i * 0.25), snare(0.2 + 0.06 * i), pan=0.15)
for i in range(6):
    add(drums, tb(19, i * 0.5), taiko(), gain=0.5 + 0.06 * i)
add(fx, tb(18, 2), riser(1.5 * BAR - BEAT), gain=0.5)
add(fx, tb(19, 3), reverse_swell(BEAT), gain=0.9)

for b in DROPS:
    for bt in (0, 1, 2, 3):
        K(tb(b, bt), 1.0)
    for bt in (0, 2):
        add(drums, tb(b, bt), taiko(), gain=0.9)
    add(drums, tb(b, 2.75), taiko(), gain=0.5)
    for bt in (1, 3):
        add(drums, tb(b, bt), clap(), gain=0.55)
        add(drums, tb(b, bt), snare(0.6))
    for i in range(16):
        add(drums, tb(b, i * 0.25), hat(0.03 if i % 2 else 0.05), pan=0.25 * (1 if i % 2 else -1),
            gain=0.08 + 0.05 * (i % 4 == 2))
# rullate di tom a fine frase
for bar in (13, 17, 23):
    for i, m in enumerate([50, 48, 45, 43, 50, 48, 45, 43]):
        add(drums, tb(bar, 2 + i * 0.25), tom(m), pan=0.5 - i * 0.14, gain=0.7 if bar != 13 else 0.5)
add(fx, tb(22), riser(2 * BAR, 500, 7000), gain=0.35)
# impatti e piatti
add(fx, tb(2), impact(), gain=0.55)
add(drums, tb(2), crash(3.0), gain=0.2)
for b in (10, 20, OUT):
    add(fx, tb(b), impact(), gain=1.0)
    add(drums, tb(b), crash(3.5), gain=0.35)
    K(tb(b), 1.0)
for b in (12, 14, 16, 22):
    add(drums, tb(b), crash(2.2), gain=0.18)
add(fx, tb(18), crash(4.0), gain=0.15)

# --- automazioni ---
bright = automation([(0, 0), (tb(2), 0.25), (tb(8), 0.35), (tb(10), 1), (tb(18), 1), (tb(18, 2), 0.3),
                     (tb(19, 2), 0.5), (tb(20), 1), (tb(OUT), 1), (tb(OUT + 2), 0.2), (DUR, 0)])
pad_mix = lp(pad, 700) * (1 - bright) + lp(pad, 5200) * bright
pad_gain = automation([(0, 0.0), (0.6, 0.55), (tb(2), 0.6), (tb(8), 0.55), (tb(9, 3), 0.75),
                       (tb(9, 3.02), 0.1), (tb(10), 0.9), (tb(18), 0.9), (tb(18, 1), 0.75), (tb(19, 3), 0.8),
                       (tb(19, 3.02), 0.1), (tb(20), 0.9), (tb(OUT), 0.85), (DUR - 1.2, 0.5), (DUR, 0)])
arp_open = automation([(tb(2), 0), (tb(8), 0.3), (tb(9, 3), 1), (tb(18), 1), (tb(18, 1), 0.15),
                       (tb(19, 3), 0.8), (tb(20), 1), (DUR, 1)])
arp_mix = lp(arp, 1400) * (1 - arp_open) + arp * arp_open

# pause sull'ultimo movimento prima di ogni drop (resta solo il risucchio)
gap = np.ones(N)
ramp = int(0.01 * SR)
for gb in (9, 19):
    g0, g1 = int(tb(gb, 3) * SR), int(tb(gb + 1) * SR)
    gap[g0:g1] = 0.0
    gap[g0 - ramp:g0] = np.linspace(1, 0, ramp)

# sidechain: le note lunghe "respirano" con la cassa
duck = np.ones(N)
for t0 in kick_times:
    i = int(t0 * SR)
    n = min(int(0.6 * SR), N - i)
    tt = np.arange(n) / SR
    duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.55 * np.exp(-tt / 0.16))

# --- mix ---
ir_big = make_ir(5.0, 4.2, 6000, 0.03)
ir_room = make_ir(1.6, 1.2, 7000, 0.01)

pad_bus = pad_mix * pad_gain
dry = (pad_bus * 0.30 * duck * gap
       + choir * 0.22 * duck * gap
       + hp(bass, 30) * 0.55 * duck * gap
       + arp_mix * 0.20 * duck * gap
       + bells * 0.15
       + lead * 0.30 * gap
       + drums * 0.55 * gap
       + fx * 0.5)
send_big = (pad_bus * 0.25 + choir * 0.35 + arp_mix * 0.12 + bells * 0.45 + lead * 0.30 + fx * 0.25) * gap
send_room = drums * 0.12 * gap
delays = pingpong(arp_mix * 0.12 + lead * 0.10 + bells * 0.10, 0.75 * BEAT)

mix = dry + reverb(send_big, ir_big) * 0.6 + reverb(send_room, ir_room) * 0.5 + delays
mix = hp(mix, 25)
# master: normalizza, saturazione morbida, picco a -1 dBFS
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(1.8 * mix) / np.tanh(1.8)
fade = np.clip((DUR - T) / 1.0, 0, 1) ** 1.5
mix *= fade * 10 ** (-1 / 20)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'audio', 'onirica.wav')
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('scritto', os.path.abspath(out), f'{DUR:.2f}s')
