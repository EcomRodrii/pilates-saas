// ─────────────────────────────────────────────────────────────────────────────
// Exportación del ESTUDIO entero — la parte que faltaba para devolverle sus
// datos al terminar el contrato (art. 28.3.g RGPD): ficha de salud, notas de
// progreso, notas internas y consentimientos. Un CSV cada una, como el resto de
// `app/api/exportar/mis-datos` (que lee la BD y llama a estas funciones).
//
// Puro, sin imports de `@/`, para probarlo con node --test.
//
// Criterios:
//   · La salud y las notas de progreso, solo de quien tiene VIGENTE el
//     consentimiento de salud: la misma regla que la RLS de esas tablas y que la
//     descarga de una alumna desde su ficha (`consentimientoSaludVigente`).
//   · Del personal sale el NOMBRE cuando es parte del hecho (quién escribió la
//     nota); nunca su email ni su cuenta.
//   · Texto libre que escribió una alumna o el equipo pasa por `celda`: un CSV
//     que empieza por «=» se abre en Excel como fórmula.
// ─────────────────────────────────────────────────────────────────────────────
import { consentimientoSaludVigente } from '../socios/exportar-datos-socia.ts';

export interface TablaCsv { headers: string[]; rows: string[][] }

export interface SociaExportable {
  id: string;
  nombre: string | null;
  apellidos: string | null;
  email: string | null;
  consentimiento_salud_fecha?: string | null;
  consentimiento_salud_revocado_en?: string | null;
}

/**
 * Celda de texto libre a prueba de fórmulas: Excel y Sheets ejecutan lo que
 * empieza por = + - @ (y tabulador o retorno). Se antepone un apóstrofo, que
 * es lo que ellos mismos usan para «esto es texto».
 */
export function celda(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = Array.isArray(v) ? v.join(', ') : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

const fecha = (v: unknown): string => (typeof v === 'string' ? v : '');

function indiceSocias(socias: readonly SociaExportable[]) {
  const porId = new Map(socias.map(s => [s.id, s]));
  const nombre = (s: SociaExportable | undefined) => [s?.nombre, s?.apellidos].filter(Boolean).join(' ');
  /** Orden estable: por socia (apellidos, nombre) y, dentro, por fecha. */
  const ordenar = (filas: { socioId: string | null; fecha: string; fila: string[] }[]) =>
    filas
      .sort((a, b) => {
        const sa = a.socioId ? porId.get(a.socioId) : undefined;
        const sb = b.socioId ? porId.get(b.socioId) : undefined;
        const ka = `${sa?.apellidos ?? ''} ${sa?.nombre ?? ''}`.toLocaleLowerCase('es');
        const kb = `${sb?.apellidos ?? ''} ${sb?.nombre ?? ''}`.toLocaleLowerCase('es');
        return ka.localeCompare(kb, 'es') || a.fecha.localeCompare(b.fecha);
      })
      .map(f => f.fila);
  return { porId, nombre, ordenar };
}

/** Las socias cuya salud se puede entregar: consentimiento vigente. */
export function sociasConSalud(socias: readonly SociaExportable[]): Set<string> {
  return new Set(socias.filter(s => consentimientoSaludVigente(s as unknown as Record<string, unknown>)).map(s => s.id));
}

export interface DatosSalud {
  socias: readonly SociaExportable[];
  condiciones: readonly {
    socio_id: string; categoria: string; etiqueta: string; zona: string | null; restricciones: string[] | null;
    severidad: string; estado: string; inicio: string; fin: string | null; notas: string | null;
  }[];
  cuestionario: readonly { socio_id: string; pregunta_id: string; respuesta: string | null; actualizado_en: string }[];
  preguntas: readonly { id: string; pregunta: string }[];
  valoraciones: readonly {
    socio_id: string; tiene_molestias: boolean | null; zonas: string[] | null; detalle: string | null;
    estado_cuerpo: string | null; creado_en: string;
  }[];
  trasClase: readonly { socio_id: string; respuesta: string; nota: string | null; creado_en: string | null }[];
}

/**
 * Ficha de salud de todo el estudio en una tabla: condiciones, cuestionario,
 * valoración inicial y cómo se encontró tras cada clase. `socios` es la lista
 * de quién ha salido, para registrar la lectura (lecturas_ficha_salud).
 */
export function tablaSalud(d: DatosSalud): TablaCsv & { socios: string[] } {
  const { porId, nombre, ordenar } = indiceSocias(d.socias);
  const permitidas = sociasConSalud(d.socias);
  const pregunta = new Map(d.preguntas.map(p => [p.id, p.pregunta]));
  const filas: { socioId: string; fecha: string; fila: string[] }[] = [];
  const add = (socioId: string, f: string, tipo: string, que: string, detalle: string, estado: string) => {
    if (!permitidas.has(socioId)) return;
    const s = porId.get(socioId);
    filas.push({ socioId, fecha: f, fila: [celda(s?.email), celda(nombre(s)), tipo, f, celda(que), celda(detalle), celda(estado)] });
  };

  for (const c of d.condiciones) {
    const que = `${c.categoria}: ${c.etiqueta}${c.zona ? ` (${c.zona})` : ''}`;
    const detalle = [
      `Gravedad: ${c.severidad}`,
      c.restricciones?.length ? `Restricciones: ${c.restricciones.join(', ')}` : '',
      c.notas ?? '',
    ].filter(Boolean).join('. ');
    add(c.socio_id, fecha(c.inicio), 'Condición', que, detalle, c.fin ? `${c.estado} (hasta ${c.fin})` : c.estado);
  }
  for (const r of d.cuestionario) {
    add(r.socio_id, fecha(r.actualizado_en), 'Cuestionario de salud', pregunta.get(r.pregunta_id) ?? 'Pregunta', r.respuesta ?? '', '');
  }
  for (const v of d.valoraciones) {
    const que = v.tiene_molestias === null ? 'Molestias: sin responder' : `Molestias: ${v.tiene_molestias ? 'sí' : 'no'}`;
    const detalle = [v.zonas?.length ? `Zonas: ${v.zonas.join(', ')}` : '', v.detalle ?? '', v.estado_cuerpo ? `Cómo está: ${v.estado_cuerpo}` : '']
      .filter(Boolean).join('. ');
    add(v.socio_id, fecha(v.creado_en), 'Valoración inicial', que, detalle, '');
  }
  for (const t of d.trasClase) {
    add(t.socio_id, fecha(t.creado_en), 'Tras la clase', t.respuesta, t.nota ?? '', '');
  }

  return {
    headers: ['Email de la clienta', 'Nombre', 'Tipo', 'Fecha', 'Qué', 'Detalle', 'Estado'],
    rows: ordenar(filas),
    socios: [...new Set(filas.map(f => f.socioId))].sort(),
  };
}

export interface DatosNotasProgreso {
  socias: readonly SociaExportable[];
  notas: readonly {
    socio_id: string | null; instructor_id: string | null; progreso: string | null; alertas: string | null;
    plan_proxima_sesion: string | null; ejercicios_casa: string | null; texto_libre: string | null; creada_en: string | null;
  }[];
  instructoras: readonly { id: string; nombre: string | null }[];
}

/** Notas de progreso de la instructora: dato de salud, mismo filtro de consentimiento. */
export function tablaNotasProgreso(d: DatosNotasProgreso): TablaCsv & { socios: string[] } {
  const { porId, nombre, ordenar } = indiceSocias(d.socias);
  const permitidas = sociasConSalud(d.socias);
  const instructora = new Map(d.instructoras.map(i => [i.id, i.nombre ?? '']));
  const filas = d.notas
    .filter((n): n is typeof n & { socio_id: string } => !!n.socio_id && permitidas.has(n.socio_id))
    .map(n => {
      const s = porId.get(n.socio_id);
      return {
        socioId: n.socio_id,
        fecha: fecha(n.creada_en),
        fila: [
          celda(s?.email), celda(nombre(s)), fecha(n.creada_en), celda(n.instructor_id ? instructora.get(n.instructor_id) : ''),
          celda(n.progreso), celda(n.alertas), celda(n.plan_proxima_sesion), celda(n.ejercicios_casa), celda(n.texto_libre),
        ],
      };
    });
  return {
    headers: ['Email de la clienta', 'Nombre', 'Fecha', 'Instructora', 'Progreso', 'Alertas', 'Plan próxima sesión', 'Ejercicios en casa', 'Texto dictado'],
    rows: ordenar(filas),
    socios: [...new Set(filas.map(f => f.socioId))].sort(),
  };
}

export interface DatosNotasInternas {
  socias: readonly SociaExportable[];
  notas: readonly { socio_id: string | null; texto: string; tipo: string | null; visibilidad: string | null; creado_en: string | null }[];
}

/**
 * Notas internas del equipo sobre cada clienta. Todas, privadas incluidas:
 * quien descarga es la propietaria, que ya las ve (RLS de notas_internas), y al
 * terminar el contrato se le devuelve TODO lo que es suyo.
 */
export function tablaNotasInternas(d: DatosNotasInternas): TablaCsv {
  const { porId, nombre, ordenar } = indiceSocias(d.socias);
  const filas = d.notas.map(n => {
    const s = n.socio_id ? porId.get(n.socio_id) : undefined;
    return {
      socioId: n.socio_id,
      fecha: fecha(n.creado_en),
      fila: [
        celda(s?.email), celda(nombre(s)), fecha(n.creado_en), celda(n.tipo),
        n.visibilidad === 'PRIVADA' ? 'Privada' : n.visibilidad === 'EQUIPO' ? 'Equipo' : celda(n.visibilidad), celda(n.texto),
      ],
    };
  });
  return {
    headers: ['Email de la clienta', 'Nombre', 'Fecha', 'Tipo', 'Visibilidad', 'Nota'],
    rows: ordenar(filas),
  };
}

export interface DatosConsentimientos {
  socias: readonly SociaExportable[];
  salud: readonly { socio_id: string; tipo: string; en: string; origen: string; texto: string | null }[];
  contrato: readonly { socio_id: string; en: string; origen: string; texto_hash: string }[];
  marketing: readonly { socio_id: string; accion: string; en: string; origen: string; texto: string | null }[];
}

/**
 * La prueba de cada consentimiento: el estudio la necesita aunque deje Tentare
 * (es él quien tiene que poder demostrarlo). Sin IP ni cuenta del personal. Del
 * contrato sale la huella del texto aceptado, que es lo que se guarda.
 */
export function tablaConsentimientos(d: DatosConsentimientos): TablaCsv {
  const { porId, nombre, ordenar } = indiceSocias(d.socias);
  const fila = (socioId: string, que: string, accion: string, en: string, origen: string, texto: string) => {
    const s = porId.get(socioId);
    return { socioId, fecha: en, fila: [celda(s?.email), celda(nombre(s)), que, celda(accion), en, celda(origen), celda(texto)] };
  };
  return {
    headers: ['Email de la clienta', 'Nombre', 'Consentimiento', 'Acción', 'Fecha', 'Origen', 'Texto aceptado'],
    rows: ordenar([
      ...d.salud.map(e => fila(e.socio_id, 'Datos de salud', e.tipo, e.en, e.origen, e.texto ?? '')),
      ...d.contrato.map(e => fila(e.socio_id, 'Condiciones del estudio', 'aceptación', e.en, e.origen, `huella ${e.texto_hash}`)),
      ...d.marketing.map(e => fila(e.socio_id, 'Comunicaciones comerciales', e.accion, e.en, e.origen, e.texto ?? '')),
    ]),
  };
}
