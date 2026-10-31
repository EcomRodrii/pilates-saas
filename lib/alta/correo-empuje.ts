// ─────────────────────────────────────────────────────────────────────────────
// Los dos correos de «después de la primera clase» (31-oct-2026). Puro, para
// probar la regla sin red (correo-empuje.test.ts); los manda el cron horario
// `altas-sin-terminar` (lib/alta/recordatorio-servidor.ts, `enviarCorreosEmpuje`),
// el mismo que ya manda «Tu primera clase en Tentare, en 5 minutos».
//
// De dónde salen: de mirar a los 23 estudios que se dieron de alta en octubre.
// Seis crearon su clase y se quedaron ahí sin enseñársela a nadie, y dos
// compartieron el enlace y no entró ninguna alumna. Quien se para ahí no
// escribe a soporte (en 14 días: cero mensajes), así que se le escribe antes.
//
//   · `compartir`: la clase YA es reservable (hito `clase_reservable`) desde hace
//     24 h-7 días y no copió ni mandó el enlace de su app. «Tu clase está
//     lista: falta que lo sepan tus alumnas».
//   · `alumnas`: compartió el enlace (hito `enlace_compartido`) hace 48 h-10 días
//     y el estudio sigue sin NINGUNA reserva. «Ya compartiste tu enlace».
//
// Cada uno, UNA vez por estudio: la marca `correo_empuje_*` del embudo (solo se
// escribe con el envío hecho) más la clave de idempotencia de Resend. Los dos
// son excluyentes (uno pide enlace sin compartir, el otro compartido), así que
// un estudio nunca recibe los dos a la vez.
//
// Fuera, como en el correo de la primera clase: el alta de siempre, las sedes de
// cadena, las demos y los suspendidos. Y apagado de serie: solo salen con
// ALTA_EMPUJE=on (`correosEmpujeActivos`), igual que se enciende la demo
// personalizada: son correos nuevos a personas reales y los abre el fundador.
// ─────────────────────────────────────────────────────────────────────────────

import { esAltaNueva } from './abandono.ts';

export type VarianteEmpuje = 'compartir' | 'alumnas';

/** La marca del embudo de cada correo (la misma lista cerrada que el CHECK de la migración). */
export const PASO_EMPUJE = {
  compartir: 'correo_empuje_compartir',
  alumnas: 'correo_empuje_alumnas',
} as const satisfies Record<VarianteEmpuje, string>;

/** Desde cuándo y hasta cuándo, contado desde el hito que lo dispara. */
export const VENTANA_EMPUJE = {
  compartir: { desdeHoras: 24, hastaHoras: 7 * 24 },
  alumnas: { desdeHoras: 48, hastaHoras: 10 * 24 },
} as const satisfies Record<VarianteEmpuje, { desdeHoras: number; hastaHoras: number }>;

/** La clave de idempotencia de Resend: un correo por estudio y variante, pase lo que pase. */
export const claveCorreoEmpuje = (variante: VarianteEmpuje, studioId: string) => `alta-empuje-${variante}:${studioId}`;

/** ALTA_EMPUJE=on los enciende. Cualquier otra cosa (o nada): no sale ninguno. */
export function correosEmpujeActivos(valor: string | undefined): boolean {
  return (valor ?? '').trim().toLowerCase() === 'on';
}

export type MotivoSinEmpuje =
  | 'no_es_alta_nueva'
  | 'sede_de_cadena'
  | 'demo'
  | 'suspendido'
  | 'sin_hito'
  | 'aun_no'
  | 'tarde'
  | 'ya_enviado'
  | 'ya_compartido'
  | 'sin_compartir'
  | 'ya_tiene_reservas'
  | 'sin_email';

export function decidirCorreoEmpuje(o: {
  variante: VarianteEmpuje;
  /** `altas_estudio.version` de su dueña. */
  version: string | null | undefined;
  cadenaId: string | null | undefined;
  esDemo: boolean;
  suspendido: boolean;
  /** Cuándo se apuntó el hito: `clase_reservable` (compartir) o `enlace_compartido` (alumnas). */
  hitoEn: string | null | undefined;
  /** Ya consta la marca `correo_empuje_*` de esta variante. */
  yaEnviado: boolean;
  /** Ya consta `enlace_compartido` (solo para `compartir`: si lo hizo, no hay nada que empujar). */
  enlaceCompartido: boolean;
  /** Alguna reserva en el estudio. Ausente = aún no se ha leído (se lee solo si lo demás deja mandarlo). */
  hayReservas?: boolean;
  /** Ausente = aún no se ha leído. */
  email?: string | null;
  ahoraMs: number;
}): { enviar: true } | { enviar: false; motivo: MotivoSinEmpuje } {
  const no = (motivo: MotivoSinEmpuje) => ({ enviar: false as const, motivo });
  if (!esAltaNueva(o.version)) return no('no_es_alta_nueva');
  if (o.cadenaId) return no('sede_de_cadena');
  if (o.esDemo) return no('demo');
  if (o.suspendido) return no('suspendido');
  if (o.yaEnviado) return no('ya_enviado');
  if (o.variante === 'compartir' && o.enlaceCompartido) return no('ya_compartido');
  if (o.variante === 'alumnas' && !o.enlaceCompartido) return no('sin_compartir');
  const hito = Date.parse(o.hitoEn ?? '');
  if (!Number.isFinite(hito)) return no('sin_hito');
  const horas = (o.ahoraMs - hito) / 3_600_000;
  const { desdeHoras, hastaHoras } = VENTANA_EMPUJE[o.variante];
  if (horas < desdeHoras) return no('aun_no');
  if (horas > hastaHoras) return no('tarde');
  if (o.variante === 'alumnas' && o.hayReservas === true) return no('ya_tiene_reservas');
  if (o.email !== undefined && !o.email) return no('sin_email');
  return { enviar: true };
}
