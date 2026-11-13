// Cronologia di una scena (annulla / ripeti) a istantanee JSON.
// Le modifiche ravvicinate che cambiano solo dei numeri (trascinare uno slider o un oggetto) diventano un unico
// passo; se cambia la struttura (un oggetto aggiunto o tolto) il passo è sempre nuovo, anche se ravvicinato.
// get() restituisce la scena serializzabile, set(scena) la ripristina, onRecord() avvisa l'app
// che c'è un nuovo passo (per mescolarlo nell'ordine giusto con quelli dell'inchiostro).

const BURST_MS = 700;
const MAX = 100;

export class SceneHistory {
  constructor(get, set, onRecord) {
    Object.assign(this, { get, set, onRecord });
    this.reset();
  }

  reset() { this.past = []; this.future = []; this.last = JSON.stringify(this.get()); this.t = 0; this.shape = shapeOf(this.last); }

  record() {
    const j = JSON.stringify(this.get());
    if (j === this.last) return;
    const now = performance.now(), shape = shapeOf(j);
    if (now - this.t > BURST_MS || shape !== this.shape) {
      this.past.push(this.last);
      if (this.past.length > MAX) this.past.shift();
      this.future = [];
      this.onRecord?.();
    }
    this.t = now;
    this.last = j; this.shape = shape;
  }

  // Torna a una scena salvata prima (per esempio quando un tocco era il palmo), senza creare un passo.
  restore(j) {
    if (j === JSON.stringify(this.get())) return;
    this.last = j; this.shape = shapeOf(j); this.t = 0;
    this.set(JSON.parse(j));
  }

  undo() { return this.move(this.past, this.future); }
  redo() { return this.move(this.future, this.past); }

  move(from, to) {
    if (!from.length) return false;
    to.push(JSON.stringify(this.get()));
    this.last = from.pop();
    this.t = 0; this.shape = shapeOf(this.last);
    this.set(JSON.parse(this.last));
    return true;
  }
}

// La scena con tutti i numeri azzerati: due istantanee con la stessa "forma" differiscono solo nei valori.
const shapeOf = j => j.replace(/-?\d+(\.\d+)?(e[-+]?\d+)?/gi, '0');
