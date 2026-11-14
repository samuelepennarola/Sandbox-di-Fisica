import projectile from './projectile.js';
import incline from './incline.js';
import builder from './builder.js';
import board from './board.js';
import charges from './charges.js';
import circular from './circular.js';
import relative from './relative.js';
import spring from './spring.js';
import pendulum from './pendulum.js';
import string from './string.js';
import sources from './sources.js';
import collision1d from './collision1d.js';
import collision2d from './collision2d.js';
import lever from './lever.js';
import rolling from './rolling.js';
import inertia from './inertia.js';
import angmom from './angmom.js';
import orbits from './orbits.js';
import cannon from './cannon.js';
import gfield from './gfield.js';
import threebody from './threebody.js';

// Mappa dei moduli. Le voci senza esperimenti compaiono come "in arrivo".
export const AREAS = [
  { id: 'lab', title: 'Laboratorio', experiments: [board, builder], soon: [] },
  { id: 'meccanica', title: 'Meccanica del punto', experiments: [projectile, incline, circular, relative], soon: [] },
  { id: 'sistemi', title: 'Sistemi e urti', experiments: [collision1d, collision2d], soon: ['Centro di massa', 'Carrucole e funi'] },
  { id: 'rigido', title: 'Corpo rigido', experiments: [lever, rolling, inertia, angmom], soon: [] },
  { id: 'oscillazioni', title: 'Oscillazioni e onde', experiments: [spring, pendulum, string, sources], soon: [] },
  { id: 'gravitazione', title: 'Gravitazione', experiments: [orbits, cannon, gfield, threebody], soon: [] },
  { id: 'fluidi', title: 'Fluidi', experiments: [], soon: ['Archimede', 'Bernoulli'] },
  { id: 'termo', title: 'Termodinamica', experiments: [], soon: ['Gas ideale', 'Cicli termici'] },
  { id: 'em', title: 'Elettromagnetismo', experiments: [charges], soon: ['Potenziale ed equipotenziali', 'Cariche in campi E e B'] },
  { id: 'ottica', title: 'Ottica geometrica', experiments: [], soon: ['Riflessione e rifrazione', 'Lenti'] },
];

export function findExperiment(id) {
  for (const a of AREAS) for (const e of a.experiments) if (e.id === id) return { exp: e, area: a };
  const a = AREAS[0];
  return { exp: a.experiments[0], area: a };
}
