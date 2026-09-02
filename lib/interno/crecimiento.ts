// ─────────────────────────────────────────────────────────────────────────────
// Crecimiento: de dónde vienen los clientes y qué piden.
//
// Este módulo es puro a propósito — recibe filas, devuelve lo que hay que
// enseñar — porque lo que decide si la pantalla sirve no es el CSS, es qué se
// considera "un lead que se está enfriando" y qué se considera "convertido".
// Eso hay que poder probarlo sin levantar nada.
//
// La regla que gobierna la pantalla: **no es una lista, es una bandeja**. Un
// CRM que solo enumera leads se convierte en una hoja de cálculo que nadie
// abre. Lo único que justifica mirarla a diario es que te diga a quién hay que
// escribir HOY y qué se ha quedado tirado.
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS = ['NUEVO', 'CONTACTADO', 'DEMO', 'PRUEBA', 'CLIENTE', 'PERDIDO'] as const;
export type EstadoLead = (typeof ESTADOS)[number];

export const ORIGENES = ['CONCIERGE', 'ALTA', 'SOPORTE', 'MANUAL', 'REFERIDO', 'IMPORT_PROSPECTOS'] as const;
export type OrigenLead = (typeof ORIGENES)[number];

export const ESTADO_ETIQUETA: Record<EstadoLead, string> = {
  NUEVO: 'Sin tocar',
  CONTACTADO: 'Escrito',
  DEMO: 'Demo hecha',
  PRUEBA: 'Probándolo',
  CLIENTE: 'Cliente',
  PERDIDO: 'Perdido',
};

export const ORIGEN_ETIQUETA: Record<OrigenLead, string> = {
  CONCIERGE: 'Formulario de migración',
  ALTA: 'Se dio de alta sola',
  SOPORTE: 'Escribió a soporte',
  MANUAL: 'Apuntado a mano',
  REFERIDO: 'Recomendación',
  // Lista fría importada por CSV. Separado de MANUAL a propósito: un frío
  // convierte mucho peor que quien entra solo, y mezclarlos haría que el % de
  // conversión del embudo siguiera saliendo pero dejara de significar nada.
  IMPORT_PROSPECTOS: 'Prospección en frío',
};

/** Los estados en los que el lead sigue vivo: ni ganado ni perdido. */
export const EN_CURSO: readonly EstadoLead[] = ['NUEVO', 'CONTACTADO', 'DEMO', 'PRUEBA'];

export interface Lead {
  id: string;
  email: string;
  nombre: string | null;
  estudio: string | null;
  telefono: string | null;
  ciudad: string | null;
  softwareActual: string | null;
  // Contexto para redactar el outreach en frío (migr 20260902101500). Solo se
  // rellenan en los leads importados; los que entran por el concierge no los
  // traen y siguen siendo null.
  web: string | null;
  instagram: string | null;
  mensaje: string | null;
  origen: string;
  estado: string;
  motivoPerdida: string | null;
  proximoPaso: string | null;
  proximaFecha: string | null;
  studioId: string | null;
  notas: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

const dias = (desde: string, hasta: number): number =>
  Math.floor((hasta - new Date(desde).getTime()) / 86_400_000);

/**
 * A quién hay que escribir hoy, con el motivo.
 *
 * Tres razones distintas, y el motivo se devuelve porque una lista de nombres
 * sin el porqué obliga a abrir cada ficha para entender por qué está ahí:
 *
 *   · tiene una fecha de siguiente paso y ya ha pasado;
 *   · entró y nadie lo ha tocado en 2 días — el concierge promete responder en
 *     24h, así que a las 48 la promesa ya está rota;
 *   · lleva más de 14 días en el mismo sitio sin fecha de siguiente paso, que
 *     es como se mueren los leads: no se pierden, se olvidan.
 */
export function loQueQuemaHoy(leads: readonly Lead[], ahora: number): Array<{ lead: Lead; motivo: string }> {
  const urgente: Array<{ lead: Lead; motivo: string; orden: number }> = [];

  for (const l of leads) {
    if (!EN_CURSO.includes(l.estado as EstadoLead)) continue;

    if (l.proximaFecha) {
      const retraso = dias(l.proximaFecha, ahora);
      if (retraso > 0) {
        urgente.push({ lead: l, motivo: `El siguiente paso venció hace ${retraso} día(s)`, orden: 1000 - retraso });
        continue;
      }
      if (retraso === 0) {
        urgente.push({ lead: l, motivo: 'El siguiente paso es hoy', orden: 1001 });
        continue;
      }
      // Tiene fecha y está en el futuro: no quema, está bajo control.
      continue;
    }

    if (l.estado === 'NUEVO') {
      const espera = dias(l.creadoEn, ahora);
      // El formulario promete respuesta en 24h. A las 48 la promesa está rota.
      if (espera >= 2) {
        urgente.push({ lead: l, motivo: `Entró hace ${espera} días y nadie le ha escrito`, orden: 2000 - espera });
      }
      continue;
    }

    const parado = dias(l.actualizadoEn, ahora);
    if (parado >= 14) {
      urgente.push({ lead: l, motivo: `${parado} días parado y sin siguiente paso`, orden: 3000 - parado });
    }
  }

  return urgente.sort((a, b) => a.orden - b.orden).map(({ lead, motivo }) => ({ lead, motivo }));
}

export interface Embudo {
  porEstado: Array<{ estado: EstadoLead; n: number }>;
  enCurso: number;
  clientes: number;
  perdidos: number;
  /** % de los CERRADOS que se ganaron. null si no se ha cerrado ninguno. */
  conversion: number | null;
  /** Por qué se pierden, de más a menos. Vacío si nadie ha puesto motivo. */
  motivosDePerdida: Array<{ motivo: string; n: number }>;
}

export function resumirEmbudo(leads: readonly Lead[]): Embudo {
  const cuenta = (e: EstadoLead) => leads.filter(l => l.estado === e).length;
  const clientes = cuenta('CLIENTE');
  const perdidos = cuenta('PERDIDO');
  const cerrados = clientes + perdidos;

  const motivos = new Map<string, number>();
  for (const l of leads) {
    if (l.estado !== 'PERDIDO') continue;
    const m = (l.motivoPerdida ?? '').trim();
    if (m) motivos.set(m, (motivos.get(m) ?? 0) + 1);
  }

  return {
    porEstado: ESTADOS.map(e => ({ estado: e, n: cuenta(e) })),
    enCurso: leads.filter(l => EN_CURSO.includes(l.estado as EstadoLead)).length,
    clientes,
    perdidos,
    // Sobre los CERRADOS, no sobre el total: con los que siguen en curso dentro,
    // el porcentaje sube solo según se vacía el embudo y no significa nada.
    conversion: cerrados === 0 ? null : Math.round((clientes / cerrados) * 100),
    motivosDePerdida: [...motivos.entries()]
      .map(([motivo, n]) => ({ motivo, n }))
      .sort((a, b) => b.n - a.n),
  };
}

/**
 * De dónde dicen los estudios que nos conocieron.
 *
 * `studios.como_nos_conocio` se lleva escribiendo desde la migración 0123 y
 * nunca lo ha leído nadie. Ojo al interpretarlo: el campo es OPCIONAL en el
 * alta, así que "sin responder" no es un canal — por eso se cuenta aparte y no
 * se mete en el reparto.
 */
export function deDondeVienen(
  estudios: ReadonlyArray<{ comoNosConocio: string | null }>,
): { canales: Array<{ canal: string; n: number }>; sinResponder: number; respondieron: number } {
  const canales = new Map<string, number>();
  let sinResponder = 0;

  for (const e of estudios) {
    const c = (e.comoNosConocio ?? '').trim();
    if (!c) { sinResponder++; continue; }
    canales.set(c, (canales.get(c) ?? 0) + 1);
  }

  return {
    canales: [...canales.entries()].map(([canal, n]) => ({ canal, n })).sort((a, b) => b.n - a.n),
    sinResponder,
    respondieron: estudios.length - sinResponder,
  };
}

/**
 * El perfil de los estudios que ya están dentro, según lo que contestaron en el
 * asistente de bienvenida.
 *
 * ⚠️ Estas cuatro columnas llevaban desde que existe el asistente
 * ESCRIBIÉNDOSE Y SIN QUE LAS LEYERA NADIE — comprobado con grep: las únicas
 * referencias de `onb_centros`, `onb_software_anterior`, `onb_alumnos_activos`
 * y `onb_importar_datos` fuera del propio asistente eran el mapper de
 * escritura, el mapper de lectura y la declaración de tipo. Cero pantallas.
 * Es exactamente el problema que ya avisa la cabecera de
 * lib/onboarding/plan-configuracion.ts: datos que se guardan y no se usan.
 *
 * Y son justo las que responden «de dónde vienen nuestros usuarios»: de qué
 * software llegan, cuántas alumnas traen, si son una sede o una cadena, y
 * cuántos han pedido que les migremos los datos.
 *
 * Mismo criterio que `deDondeVienen`: «sin responder» NO es un valor. Se cuenta
 * aparte y se deja fuera del reparto, porque el asistente se puede saltar
 * entero y contar los silencios como una categoría convertiría «la mayoría no
 * contestó» en «la mayoría son X».
 */
export interface RespuestasAsistente {
  onbCentros: string | null;
  onbSoftwareAnterior: string | null;
  onbAlumnosActivos: string | null;
  onbImportarDatos: string | null;
}

export interface RepartoRespuesta {
  valores: Array<{ valor: string; n: number }>;
  respondieron: number;
  sinResponder: number;
}

/** Cuenta por valor ignorando vacíos y espacios. Compartido por los cuatro
 *  repartos para que ninguno pueda contar los silencios de otra manera. */
function reparto(valores: ReadonlyArray<string | null>): RepartoRespuesta {
  const cuenta = new Map<string, number>();
  let sinResponder = 0;
  for (const v of valores) {
    const t = (v ?? '').trim();
    if (!t) { sinResponder++; continue; }
    cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  }
  return {
    valores: [...cuenta.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n),
    respondieron: valores.length - sinResponder,
    sinResponder,
  };
}

/** La respuesta afirmativa de la pregunta de migración, literal del asistente
 *  (components/onboarding/pantalla-bienvenida.tsx). Vive aquí como constante
 *  para que cambiar el texto de la opción rompa el test en vez de dejar el
 *  contador a cero en silencio. */
export const RESPUESTA_QUIERE_IMPORTAR = 'Sí, importadlos';

export function perfilDeLosEstudios(estudios: ReadonlyArray<RespuestasAsistente>): {
  software: RepartoRespuesta;
  tamano: RepartoRespuesta;
  centros: RepartoRespuesta;
  /** Cuántos pidieron que les migremos los datos. Es una LISTA DE TRABAJO, no
   *  una estadística: cada uno es alguien esperando que alguien le importe sus
   *  alumnas. */
  quierenImportar: number;
} {
  return {
    software: reparto(estudios.map(e => e.onbSoftwareAnterior)),
    tamano: reparto(estudios.map(e => e.onbAlumnosActivos)),
    centros: reparto(estudios.map(e => e.onbCentros)),
    quierenImportar: estudios.filter(e => (e.onbImportarDatos ?? '').trim() === RESPUESTA_QUIERE_IMPORTAR).length,
  };
}

export interface Peticion {
  id: string;
  tipo: string;
  mensaje: string;
  contacto: string | null;
  estudio: string | null;
  creadoEn: string;
}

/**
 * Lo que piden los estudios, agrupado por lo que piden — no por quién lo pide.
 *
 * Es la diferencia entre "Pilates Boutique escribió 4 veces" y "4 estudios
 * quieren ClassPass". Lo segundo se puede priorizar; lo primero no.
 *
 * El agrupado es por mensaje normalizado, que es tosco pero honesto: los
 * mensajes que genera la propia aplicación (el botón de "avísame cuando esté
 * la integración X") son idénticos palabra por palabra, así que agrupan bien.
 * Los escritos a mano no agrupan — y no pasa nada, salen sueltos.
 */
export function agruparPeticiones(
  peticiones: readonly Peticion[],
): Array<{ mensaje: string; n: number; estudios: string[]; ultima: string; tipo: string }> {
  const grupos = new Map<string, { mensaje: string; estudios: Set<string>; ultima: string; tipo: string; n: number }>();

  for (const p of peticiones) {
    const clave = p.mensaje.trim().toLowerCase().replace(/\s+/g, ' ');
    const g = grupos.get(clave);
    if (g) {
      g.n++;
      if (p.estudio) g.estudios.add(p.estudio);
      if (p.creadoEn > g.ultima) g.ultima = p.creadoEn;
    } else {
      grupos.set(clave, {
        mensaje: p.mensaje.trim(),
        estudios: new Set(p.estudio ? [p.estudio] : []),
        ultima: p.creadoEn,
        tipo: p.tipo,
        n: 1,
      });
    }
  }

  return [...grupos.values()]
    .map(g => ({ mensaje: g.mensaje, n: g.n, estudios: [...g.estudios].sort(), ultima: g.ultima, tipo: g.tipo }))
    // Primero lo que más gente pide; a igualdad, lo más reciente. Ordenar solo
    // por fecha enterraría una petición repetida por otra nueva de una sola.
    .sort((a, b) => b.estudios.length - a.estudios.length || b.n - a.n || b.ultima.localeCompare(a.ultima));
}

export type Veredicto = { ok: true } | { ok: false; motivo: string };

/**
 * Qué se puede guardar en un lead.
 *
 * Solo dos reglas, y las dos existen para que el embudo no mienta después:
 * un PERDIDO sin motivo convierte "por qué se nos caen" en una pregunta sin
 * respuesta, y es justo la única pregunta accionable del embudo.
 */
export function validarLead(l: {
  email: string; estado: string; motivoPerdida?: string | null;
}): Veredicto {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l.email.trim())) {
    return { ok: false, motivo: 'Escribe un email válido: es lo único con lo que se puede volver a contactar.' };
  }
  if (!(ESTADOS as readonly string[]).includes(l.estado)) {
    return { ok: false, motivo: `"${l.estado}" no es un estado válido.` };
  }
  if (l.estado === 'PERDIDO' && !(l.motivoPerdida ?? '').trim()) {
    return { ok: false, motivo: 'Escribe por qué se ha perdido. Sin el motivo, el embudo no sirve para nada.' };
  }
  return { ok: true };
}
