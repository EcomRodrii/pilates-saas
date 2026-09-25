// Entradas del libro `auditoria_estudio` que escribe el SERVIDOR con un actor
// explícito.
//
// El trigger de la base de datos (`auditar_cambio_dinero`, migración
// 20260925152253) solo ve lo que hace una persona con SU sesión: una ruta de
// servidor escribe con service-role, `auth.uid()` es NULL y el trigger sale sin
// registrar. Reembolsos, «marcar devuelto», ingresos manuales, la reversión de
// una devolución y la aprobación de una penalización pasan por ahí. Aquí se
// construye la fila del libro para esos casos (`origen = 'servidor'`), con las
// MISMAS reglas que el trigger: solo las columnas que cambiaron, los ids
// recortados, y fuera las columnas con datos de un tercero.
//
// Puro, sin I/O: lo prueba `node --test`. Quien escribe en la base es
// `registrar-servidor.ts`.

export type OperacionServidor = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Quién y en qué sede: la sesión de staff que llamó a la ruta (`verificarSesionStaff`), nunca lo que
 * diga el cuerpo. Va JUNTA a propósito: con la sede por un lado y el rol por otro, nada impedía
 * mezclar los de dos sesiones. Cualquier `SesionStaff` encaja tal cual; solo se leen estos tres campos
 * (ni el nombre ni el email de la persona pasan al libro).
 */
export interface SesionAuditoria { userId: string; studioId: string; rol: string }

export interface EntradaServidor {
  sesion: SesionAuditoria;
  tabla: string;
  filaId: string;
  operacion: OperacionServidor;
  socioId?: string | null;
  /** UPDATE: lo que había y lo que hay. Basta con las columnas tocadas; se descartan las que no cambian. */
  antes?: Record<string, unknown> | null;
  despues?: Record<string, unknown> | null;
  /**
   * Qué fila era, en palabras (concepto, fecha…), y OBLIGATORIAMENTE `accion`: un
   * código de `ACCIONES` (lib/auditoria-estudio.ts) que dice qué hizo la persona.
   */
  contexto: Record<string, unknown> & { accion: string };
  /** Código de una lista cerrada, sin texto libre. */
  motivo?: string | null;
}

/** La fila tal como se inserta en `auditoria_estudio`. */
export interface FilaLibroServidor {
  studio_id: string;
  actor_uid: string;
  actor_rol: string;
  origen: 'servidor';
  tabla: string;
  fila_id: string;
  operacion: OperacionServidor;
  socio_id: string | null;
  cambios: string[] | null;
  contexto: Record<string, unknown>;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string | null;
}

export type ResultadoEntrada =
  | { ok: true; fila: FilaLibroServidor }
  /** Un UPDATE sin ningún cambio real: no hay nada que registrar (el trigger hace lo mismo). */
  | { ok: false; razon: 'SIN_CAMBIOS' }
  /** Falta algo imprescindible: es un fallo de quien llama, se avisa. */
  | { ok: false; razon: 'ENTRADA_INVALIDA'; detalle: string };

/**
 * Columnas que NUNCA se copian al libro, por tabla: datos de un tercero que un
 * libro que no se puede rectificar no debe llevar. Espejo del segundo argumento
 * de `trg_auditar_ingresos_manuales` (un test los ata).
 */
export const COLUMNAS_EXCLUIDAS: Readonly<Record<string, readonly string[]>> = {
  ingresos_manuales: ['cliente', 'nif', 'nota'],
};

/** Los índices del libro rechazan una entrada de más de ~2.700 bytes: los ids se recortan como en el trigger. */
export const LIMITE_ID = 200;
export const LIMITE_MOTIVO = 60;

const recorta = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

function sinExcluidas(tabla: string, o: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!o) return null;
  const fuera = new Set(COLUMNAS_EXCLUIDAS[tabla] ?? []);
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => !fuera.has(k) && v !== undefined));
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function filaDeAuditoriaServidor(e: EntradaServidor): ResultadoEntrada {
  const falta = (campo: string): ResultadoEntrada => ({ ok: false, razon: 'ENTRADA_INVALIDA', detalle: `falta ${campo}` });
  if (!e.sesion?.studioId) return falta('sesion.studioId');
  if (!e.sesion?.userId) return falta('sesion.userId');
  if (!e.sesion?.rol) return falta('sesion.rol');
  if (!e.tabla) return falta('tabla');
  if (!e.filaId) return falta('filaId');
  if (typeof e.contexto?.accion !== 'string' || !e.contexto.accion) return falta('contexto.accion');

  const antes = sinExcluidas(e.tabla, e.antes);
  const despues = sinExcluidas(e.tabla, e.despues);
  const contexto = sinExcluidas(e.tabla, e.contexto) as Record<string, unknown>;

  let cambios: string[] | null = null;
  let antesFinal: Record<string, unknown> | null = null;
  let despuesFinal: Record<string, unknown> | null = null;

  if (e.operacion === 'INSERT') {
    despuesFinal = despues;
  } else if (e.operacion === 'DELETE') {
    antesFinal = antes;
  } else {
    // Solo lo que cambió (igual que el trigger): un valor que se queda como está no es un cambio de nadie.
    const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])];
    const cambiadas = claves.filter(k => !igual(antes?.[k], despues?.[k])).sort();
    if (cambiadas.length === 0) return { ok: false, razon: 'SIN_CAMBIOS' };
    cambios = cambiadas;
    antesFinal = Object.fromEntries(cambiadas.map(k => [k, antes?.[k] ?? null]));
    despuesFinal = Object.fromEntries(cambiadas.map(k => [k, despues?.[k] ?? null]));
  }

  return {
    ok: true,
    fila: {
      studio_id: recorta(e.sesion.studioId, LIMITE_ID),
      actor_uid: e.sesion.userId,
      actor_rol: e.sesion.rol,
      origen: 'servidor',
      tabla: e.tabla,
      fila_id: recorta(e.filaId, LIMITE_ID),
      operacion: e.operacion,
      socio_id: e.socioId ? recorta(e.socioId, LIMITE_ID) : null,
      cambios,
      contexto,
      antes: antesFinal,
      despues: despuesFinal,
      motivo: e.motivo ? recorta(e.motivo, LIMITE_MOTIVO) : null,
    },
  };
}
