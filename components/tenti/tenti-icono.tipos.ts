// Lo que el TIPO de TentiIcono no deja hacer, comprobado por tsc (npm run
// typecheck, la puerta del CI). Va en un .ts suelto y no en un test porque
// tsconfig excluye los **/*.test.ts: un @ts-expect-error ahí no vigilaría nada.
//
// Si una de estas líneas deja de dar error, tsc falla con «Unused
// '@ts-expect-error' directive»: se ha abierto algo que la guardia
// (lib/tenti/donde-vive-tenti.test.ts) da por cerrado. Nadie importa este
// fichero; existe solo para que el compilador lo lea.
import type { PropsTentiIcono } from './tenti-icono';

export const ASERCIONES_TENTI_ICONO: PropsTentiIcono[] = [
  // Lo que sí vale.
  { ancho: 18 }, { ancho: 20, estado: 'pensando' }, { ancho: 22, sobre: 'invertida' }, { ancho: 24, estado: 'reposo' }, { ancho: 28 },
  // @ts-expect-error — 16 px no existe: los ojos medirían menos de 2 px y a DPR 1 no se leen.
  { ancho: 16 },
  // @ts-expect-error — ni un ancho suelto: los tamaños son cerrados.
  { ancho: 40 },
  // @ts-expect-error — 'hecho' es la celebración del canvas en Listo, no del icono.
  { ancho: 18, estado: 'hecho' },
  // @ts-expect-error — ni ningún otro estado del motor: la bandeja es la dueña de lo que espera tu visto bueno.
  { ancho: 18, estado: 'esperaTuOk' },
  // @ts-expect-error — siempre decorativo: su nombre no puede colarse en el del botón que lo lleva.
  { ancho: 18, titulo: 'Tenti' },
];
