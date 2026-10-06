// Lo que escribe el modelo al proponer (todas las propiedades, como el resto de
// herramientas). Aparte de nucleo.ts para no hacer un ciclo con definiciones.ts.
import { z } from 'zod';

export const MAX_CAPACIDAD = 300;
const texto = (max: number) => z.string().max(max);
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const HORA = z.string().regex(/^\d{2}:\d{2}$/);

export const zClase = z.object({
  tipo_clase: texto(80), fecha: FECHA, hora: HORA, sala: texto(80), instructora: texto(20), aforo: z.number().int().min(0).max(MAX_CAPACIDAD),
}).strict();
export const zSala = z.object({ nombre: texto(60), capacidad: z.number().int().min(1).max(MAX_CAPACIDAD) }).strict();
export const zEvento = z.object({
  texto: texto(280), fecha: FECHA, hora: HORA, aforo: z.number().int().min(0).max(1000), lugar: texto(80),
}).strict();
export const TIPOS_CITA = { privada: 'PRIVADA', valoracion: 'EVALUACION', fisioterapia: 'FISIOTERAPIA', online: 'ONLINE' } as const;
export const zCita = z.object({
  alumna: texto(20), instructora: texto(20), fecha: FECHA, hora: HORA, duracion_min: z.number().int().min(0).max(240),
  tipo: z.enum(['privada', 'valoracion', 'fisioterapia', 'online']),
}).strict();

export type EntradaClase = z.infer<typeof zClase>;
export type EntradaSala = z.infer<typeof zSala>;
export type EntradaEvento = z.infer<typeof zEvento>;
export type EntradaCita = z.infer<typeof zCita>;

