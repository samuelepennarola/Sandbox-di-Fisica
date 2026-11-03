import projectile from './projectile.js';
import incline from './incline.js';
import builder from './builder.js';
import circular from './circular.js';
import relative from './relative.js';

// Mappa dei moduli. Le voci senza esperimenti compaiono come "in arrivo".
export const AREAS = [
  { id: 'lab', title: 'Laboratorio', experiments: [builder], soon: [] },
  { id: 'meccanica', title: 'Meccanica del punto', experiments: [projectile, incline, circular, relative], soon: [] },
  { id: 'sistemi', title: 'Sistemi e urti', experiments: [], soon: ['Urti 1D e 2D', 'Centro di massa', 'Carrucole e funi'] },
  { id: 'rigido', title: 'Corpo rigido', experiments: [], soon: ['Momenti e leve', 'Rotolamento'] },
  { id: 'oscillazioni', title: 'Oscillazioni e onde', experiments: [], soon: ['Molla', 'Pendolo', 'Onde su corda'] },
  { id: 'gravitazione', title: 'Gravitazione', experiments: [], soon: ['Orbite e Keplero', 'Tre corpi'] },
  { id: 'fluidi', title: 'Fluidi', experiments: [], soon: ['Archimede', 'Bernoulli'] },
  { id: 'termo', title: 'Termodinamica', experiments: [], soon: ['Gas ideale', 'Cicli termici'] },
  { id: 'em', title: 'Elettromagnetismo', experiments: [], soon: ['Campi di cariche', 'Cariche in campi E e B'] },
  { id: 'ottica', title: 'Ottica geometrica', experiments: [], soon: ['Riflessione e rifrazione', 'Lenti'] },
];

export function findExperiment(id) {
  for (const a of AREAS) for (const e of a.experiments) if (e.id === id) return { exp: e, area: a };
  const a = AREAS[0];
  return { exp: a.experiments[0], area: a };
}
