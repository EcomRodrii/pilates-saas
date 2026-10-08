import type { Capitulo } from './tipos.ts';
import { estudio } from './01-estudio.ts';
import { clases } from './02-clases.ts';
import { reservas } from './03-reservas.ts';
import { cobros } from './04-cobros.ts';
import { altas } from './05-altas.ts';
import { comunicacion } from './06-comunicacion.ts';
import { motivacion } from './07-motivacion.ts';
import { marca } from './08-marca.ts';
import { web } from './09-web.ts';
import { equipo } from './10-equipo.ts';
import { conexiones } from './11-conexiones.ts';
import { datos } from './12-datos.ts';
import { avisos } from './13-avisos.ts';
import { panel } from './14-panel.ts';

// El orden es el de las secciones en Configuración (lib/configuracion/secciones.ts),
// sin «Demo»: el vídeo es la propia demo.
export const CAPITULOS: readonly Capitulo[] = [
  estudio, clases, reservas, cobros, altas, comunicacion, motivacion, marca, web, equipo, conexiones, datos, avisos, panel,
];
