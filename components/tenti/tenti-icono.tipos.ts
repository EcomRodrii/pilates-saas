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
  // Desde el 5-oct (lib/tenti/momentos.ts): 'hecho' (la migración), 'esperaTuOk' (la bandeja) y sus emociones.
  { ancho: 22, estado: 'hecho', celebra: true }, { ancho: 18, estado: 'esperaTuOk' }, { ancho: 28, estado: 'dormido', emocion: { tipo: 'bostezo', clave: 'x' } },
  // @ts-expect-error — 'buscando' es solo del asistente (una herramienta consultando los datos).
  { ancho: 18, estado: 'buscando' },
  // @ts-expect-error — 'mareado' solo sale al tocarlo.
  { ancho: 18, estado: 'mareado' },
  // @ts-expect-error — 'feliz' es el logo guardado, en la bienvenida.
  { ancho: 18, emocion: { tipo: 'feliz', clave: 'x' } },
  // @ts-expect-error — 'molesto' solo sale al tocarlo.
  { ancho: 18, emocion: { tipo: 'molesto', clave: 'x' } },
  // @ts-expect-error — siempre decorativo: su nombre no puede colarse en el del botón que lo lleva.
  { ancho: 18, titulo: 'Tenti' },
];
