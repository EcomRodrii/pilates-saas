// Registro de especialistas MVP. Un especialista nuevo (Fase E+) se añade
// aquí y en el catálogo de tipos (../tipos.ts TipoRecomendacion).
import type { Especialista, EspecialistaId } from '../tipos.ts';
import { retencion } from './retencion.ts';
import { ingresos } from './ingresos.ts';
import { agenda } from './agenda.ts';
import { captacion } from './captacion.ts';
import { finanzas } from './finanzas.ts';
import { marketing } from './marketing.ts';
import { equipo } from './equipo.ts';

export const ESPECIALISTAS: Especialista[] = [retencion, ingresos, agenda, captacion, finanzas, marketing, equipo];
export const ESPECIALISTA_POR_ID: Map<EspecialistaId, Especialista> = new Map(ESPECIALISTAS.map(e => [e.id, e]));
