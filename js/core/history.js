// Cronologia di una scena (annulla / ripeti) a istantanee JSON.
// Le modifiche ravvicinate (per esempio trascinando uno slider) diventano un unico passo.
// get() restituisce la scena serializzabile, set(scena) la ripristina, onRecord() avvisa l'app
// che c'è un nuovo passo (per mescolarlo nell'ordine giusto con quelli dell'inchiostro).

const BURST_MS = 700;
const MAX = 100;

export class SceneHistory {
  constructor(get, set, onRecord) {
    Object.assign(this, { get, set, onRecord });
    this.reset();
  }

  reset() { this.past = []; this.future = []; this.last = JSON.stringify(this.get()); this.t = 0; }

  record() {
    const j = JSON.stringify(this.get());
    if (j === this.last) return;
    const now = performance.now();
    if (now - this.t > BURST_MS) {
      this.past.push(this.last);
      if (this.past.length > MAX) this.past.shift();
      this.future = [];
      this.onRecord?.();
    }
    this.t = now;
    this.last = j;
  }

  undo() { return this.move(this.past, this.future); }
  redo() { return this.move(this.future, this.past); }

  move(from, to) {
    if (!from.length) return false;
    to.push(JSON.stringify(this.get()));
    this.last = from.pop();
    this.t = 0;
    this.set(JSON.parse(this.last));
    return true;
  }
}
