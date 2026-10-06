// Guardia de la exportación de datos de una socia (arts. 15 y 20 RGPD).
//
// Dos cosas que tienen que seguir siendo verdad aunque el esquema crezca:
//   1. COBERTURA: toda tabla con `socio_id` está decidida (dentro o fuera con
//      motivo). Una tabla nueva sin decidir = una exportación incompleta que
//      nadie nota.
//   2. ALCANCE: nunca sale nada de otra socia, de otro estudio ni datos de
//      contacto del personal; y la salud solo cuando toca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  COBERTURA_TABLAS, SECCIONES, VERSION_EXPORTACION, enmascararIban, exportarDatosSocia, nombreArchivoExportacion,
  type ConsultaBd, type LectorBd,
} from './exportar-datos-socia.ts';

const RAIZ = join(import.meta.dirname, '..', '..');

// Catálogo de PRODUCCIÓN (information_schema, 2026-09-13): tablas base con una
// columna `socio_id` / `recipient_socio_id`. Más las que se detecten en las
// migraciones (abajo), para que una tabla nueva también cuente.
const TABLAS_CON_SOCIO_ID_EN_PRODUCCION = [
  'achievement_history', 'achievement_progress', 'actividad_reciente', 'automation_logs', 'avisos_hueco',
  'challenge_history', 'challenge_progress', 'citas', 'codigos_descuento_consumos', 'comunicaciones_socio',
  'condiciones_salud', 'conversacion_participantes', 'credit_transactions', 'devoluciones', 'documentos_socio',
  'favoritos_clase', 'intentos_reserva_fallidos', 'lecturas_ficha_salud', 'mandatos_sepa', 'member_credits',
  'memoria_socio', 'notas_internas', 'notas_progreso', 'notification', 'pagos_historicos', 'penalizaciones',
  'plazas_fijas', 'post_evento_asistentes', 'preferencias_socio', 'recibos', 'recomendaciones', 'recordatorio_envios',
  'recuperaciones', 'reservas', 'respuestas_cuestionario_salud', 'respuestas_sesion', 'reto_participaciones',
  'reward_actions', 'reward_history', 'reward_redemptions', 'socio_excepciones', 'socio_tipos_clase_autorizados',
  'suscripciones', 'tareas', 'valoraciones', 'valoraciones_iniciales', 'valoraciones_iniciales_salud', 'ventas_pos',
  'widget_eventos',
];

function tablasConSocioIdEnMigraciones(): Set<string> {
  const dir = join(RAIZ, 'supabase', 'migrations');
  const vivas = new Set<string>();
  for (const f of readdirSync(dir).filter(x => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      if (/(^|[\s,(])socio_id\s/i.test(m[2])) vivas.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?socio_id\b/gi)) {
      vivas.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) {
      vivas.delete(m[1].toLowerCase());
    }
  }
  return vivas;
}

test('cobertura: toda tabla con socio_id está dentro de una sección o fuera con motivo', () => {
  const todas = new Set([...TABLAS_CON_SOCIO_ID_EN_PRODUCCION, ...tablasConSocioIdEnMigraciones()]);
  const sinDecidir = [...todas].filter(t => !(t in COBERTURA_TABLAS)).sort();
  assert.deepEqual(sinDecidir, [],
    'Tabla nueva con socio_id: decide si sale en la exportación (y en qué sección) o por qué no, en COBERTURA_TABLAS.');
  assert.ok(todas.has('solicitudes_derechos'), 'la detección por migraciones tiene que ver la tabla de este mismo cambio');
});

test('cobertura: cada motivo de exclusión se puede leer y cada sección existe', () => {
  for (const [tabla, c] of Object.entries(COBERTURA_TABLAS)) {
    if ('seccion' in c) assert.ok((SECCIONES as readonly string[]).includes(c.seccion), `${tabla} → sección inexistente`);
    else assert.ok(c.excluida.length > 30, `${tabla}: el motivo de exclusión tiene que explicarse`);
  }
});

// ── Doble del cliente: aplica los filtros de verdad y registra cada lectura ──

type Fila = Record<string, unknown>;
interface Llamada { tabla: string; columnas: string[]; filtros: [string, string, unknown][] }

function bdFalsa(datos: Record<string, Fila[]>) {
  const llamadas: Llamada[] = [];
  const db: LectorBd = {
    from(tabla: string) {
      return {
        select(columnas: string) {
          const filtros: [string, string, unknown][] = [];
          let rango: [number, number] = [0, 999];
          const q = {
            eq(c: string, v: unknown) { filtros.push(['eq', c, v]); return q; },
            in(c: string, v: readonly unknown[]) { filtros.push(['in', c, v]); return q; },
            is(c: string, v: null) { filtros.push(['is', c, v]); return q; },
            order() { return q; },
            range(d: number, h: number) { rango = [d, h]; return q; },
            then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
              const cols = columnas.split(',').map(x => x.trim());
              llamadas.push({ tabla, columnas: cols, filtros: [...filtros] });
              const filas = (datos[tabla] ?? []).filter(f => filtros.every(([op, c, v]) =>
                op === 'eq' ? f[c] === v : op === 'in' ? (v as unknown[]).includes(f[c]) : f[c] == null));
              const data = filas.slice(rango[0], rango[1] + 1)
                .map(f => Object.fromEntries(cols.filter(k => k in f).map(k => [k, f[k]])));
              return Promise.resolve({ data, error: null }).then(ok, ko);
            },
          };
          return q as unknown as ConsultaBd;
        },
      };
    },
  };
  return { db, llamadas };
}

const AHORA = new Date('2026-09-13T10:00:00Z');

function fixture(sociaExtra: Fila = {}): Record<string, Fila[]> {
  return {
    studios: [{ id: 'st1', nombre: 'Pilates Luz' }, { id: 'st2', nombre: 'Otro' }],
    socios: [
      { id: 's1', studio_id: 'st1', auth_user_id: 'u1', nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@x.es', campos_extra: { c1: 'Mañanas' }, ...sociaExtra },
      { id: 's2', studio_id: 'st1', auth_user_id: 'u2', nombre: 'Bea', apellidos: 'Otra', email: 'bea@x.es' },
    ],
    campos_personalizados: [{ id: 'c1', studio_id: 'st1', etiqueta: 'Horario preferido' }],
    instructores: [{ id: 'i1', studio_id: 'st1', nombre: 'Laura', email: 'laura@equipo.es', telefono: '600000000' }],
    tipos_clase: [{ id: 't1', studio_id: 'st1', nombre: 'Reformer' }],
    salas: [{ id: 'sa1', studio_id: 'st1', nombre: 'Sala 1' }],
    sesiones: [{ id: 'se1', studio_id: 'st1', tipo_clase_id: 't1', sala_id: 'sa1', instructor_id: 'i1', inicio: '2026-09-01T09:00:00Z', fin: '2026-09-01T10:00:00Z', cancelada: false }],
    reservas: [
      { id: 'r1', studio_id: 'st1', socio_id: 's1', sesion_id: 'se1', estado: 'CONFIRMADA', creado_en: '2026-08-30T10:00:00Z' },
      { id: 'r2', studio_id: 'st1', socio_id: 's2', sesion_id: 'se1', estado: 'CONFIRMADA', creado_en: '2026-08-30T10:00:00Z' },
      { id: 'r3', studio_id: 'st2', socio_id: 's1', sesion_id: 'se1', estado: 'CONFIRMADA', creado_en: '2026-08-30T10:00:00Z' },
    ],
    recibos: [{ id: 'rc1', studio_id: 'st1', socio_id: 's1', concepto: 'Bono 8', importe: 80, estado: 'COBRADO', fecha_vencimiento: '2026-09-01' }],
    facturas: [{ id: 'f1', studio_id: 'st1', recibo_id: 'rc1', numero_completo: 'A-1', fecha_emision: '2026-09-01', receptor_nombre: 'Ana Ruiz', total: 80 }],
    mandatos_sepa: [{ id: 'm1', studio_id: 'st1', socio_id: 's1', iban: 'ES9121000418450200051332', estado: 'ACTIVO' }],
    conversacion_participantes: [{ conversacion_id: 'cv1', socio_id: 's1' }],
    mensajes: [
      { id: 'ms1', studio_id: 'st1', conversacion_id: 'cv1', remitente_auth_user_id: 'u1', cuerpo: 'Hola, ¿mañana hay clase?', creado_en: '2026-09-02T10:00:00Z' },
      { id: 'ms2', studio_id: 'st1', conversacion_id: 'cv1', remitente_auth_user_id: 'staff', cuerpo: 'Respuesta del equipo', creado_en: '2026-09-02T11:00:00Z' },
    ],
    comunicaciones_socio: [{ id: 'co1', studio_id: 'st1', socio_id: 's1', tipo: 'EMAIL', asunto: 'Bienvenida', creado_por_nombre: 'Laura' }],
    lecturas_ficha_salud: [{ id: 'l1', studio_id: 'st1', socio_id: 's1', leido_por_nombre: 'Laura' }],
    condiciones_salud: [{ id: 'cs1', studio_id: 'st1', socio_id: 's1', categoria: 'LESION', etiqueta: 'Rodilla', creado_por: 'Laura' }],
    notas_progreso: [{ id: 'np1', studio_id: 'st1', socio_id: 's1', instructor_id: 'i1', sesion_id: 'se1', progreso: 'Mejor', creada_en: '2026-09-01T10:30:00Z' }],
    valoraciones_iniciales: [{ id: 'v1', studio_id: 'st1', socio_id: 's1', estado: 'COMPLETADA', objetivos: ['Espalda'] }],
    valoraciones_iniciales_salud: [{ valoracion_id: 'v1', studio_id: 'st1', socio_id: 's1', tiene_molestias: true, zonas: ['lumbar'] }],
    aceptaciones_contrato_eventos: [
      { id: 'ac1', studio_id: 'st1', socio_id: 's1', en: '2026-09-01T08:00:00Z', origen: 'MOSTRADOR', texto_hash: 'h'.repeat(64), texto_cliente_coincide: true,
        firma: 'Ana Ruiz', introducida_por: 'Recepción Marta', actor_uid: 'staff-uid', ip_hmac: 'f'.repeat(64), user_agent: 'Mozilla/5.0 iPad-recepcion' },
      { id: 'ac2', studio_id: 'st1', socio_id: 's2', en: '2026-09-01T08:00:00Z', origen: 'PORTAL', texto_hash: 'h'.repeat(64), texto_cliente_coincide: false, firma: 'Bea', ip_hmac: 'e'.repeat(64) },
    ],
    terminos_versiones: [
      { id: 'tv1', studio_id: 'st1', hash: 'h'.repeat(64), texto: 'Condiciones de Pilates Luz v1' },
      { id: 'tv2', studio_id: 'st2', hash: 'h'.repeat(64), texto: 'Condiciones de OTRO estudio' },
    ],
  };
}

const TABLAS_SALUD = ['condiciones_salud', 'respuestas_cuestionario_salud', 'respuestas_sesion', 'valoraciones_iniciales', 'valoraciones_iniciales_salud', 'notas_progreso'];

test('forma: JSON versionado con todas las secciones, y solo lo de ESTA socia en ESTE estudio', async () => {
  const { db } = bdFalsa(fixture());
  const r = await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  assert.ok(r);
  assert.equal(r.version, VERSION_EXPORTACION);
  assert.equal(r.generadoEn, AHORA.toISOString());
  assert.deepEqual(r.estudio, { nombre: 'Pilates Luz' });
  assert.deepEqual(Object.keys(r.secciones).sort(), [...SECCIONES].sort());
  assert.equal(r.socia.email, 'ana@x.es');
  assert.deepEqual(r.socia.camposPersonalizados, [{ campo: 'Horario preferido', valor: 'Mañanas' }]);

  const reservas = r.secciones.reservas as Fila[];
  assert.equal(reservas.length, 1, 'ni la reserva de otra socia ni la suya en otro estudio');
  assert.equal(reservas[0].clase, 'Reformer');
  assert.equal(reservas[0].instructora, 'Laura');
  assert.equal((r.secciones.facturas as Fila[]).length, 1);
  assert.deepEqual(r.secciones.mensajesEnviados, [{ fecha: '2026-09-02T10:00:00Z', texto: 'Hola, ¿mañana hay clase?', retiradoPorElEstudio: false }]);
  const salud = r.secciones.salud as Record<string, unknown>;
  assert.equal((salud.condiciones as Fila[]).length, 1);
  assert.deepEqual((salud.valoracionInicial as Fila).salud, { tieneMolestias: true, zonas: ['lumbar'], detalle: null, estadoDelCuerpo: null });
});

test('minimización: nada de contacto del personal, de quién tecleó ni del IBAN entero', async () => {
  const { db } = bdFalsa(fixture());
  const r = await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  const json = JSON.stringify(r);
  for (const prohibido of ['laura@equipo.es', '600000000', 'Respuesta del equipo', 'ES9121000418450200051332', 'leido_por', 'creado_por']) {
    assert.ok(!json.includes(prohibido), `no debe salir: ${prohibido}`);
  }
  assert.equal(enmascararIban('ES91 2100 0418 4502 0005 1332'), 'ES·· ···· 1332');
});

test('historial del contrato (art. 15): fecha, vía, si coincidía y el texto; nada de IP, navegador ni quién lo tecleó', async () => {
  const { db } = bdFalsa(fixture());
  const r = await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  const c = r!.secciones.consentimientos as { historialContrato: Fila[] };
  assert.deepEqual(c.historialContrato, [{
    fecha: '2026-09-01T08:00:00Z', via: 'MOSTRADOR', textoCoincidiaConElMostrado: true,
    versionTexto: 'h'.repeat(64), textoAceptado: 'Condiciones de Pilates Luz v1',
  }]);
  const json = JSON.stringify(r);
  for (const prohibido of ['f'.repeat(64), 'e'.repeat(64), 'iPad-recepcion', 'Recepción Marta', 'staff-uid', 'Condiciones de OTRO estudio', 'ip_hmac', 'user_agent']) {
    assert.ok(!json.includes(prohibido), `no debe salir: ${prohibido}`);
  }
});

test('alcance: cada lectura de una tabla con socio_id va filtrada por la socia, y por el estudio si la tabla lo tiene', async () => {
  const { db, llamadas } = bdFalsa(fixture());
  await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  // `normas_comunidad_aceptaciones` va por su cuenta: las normas valen para todos sus estudios.
  const sinEstudio = new Set(['codigos_descuento_consumos', 'conversacion_participantes', 'post_evento_asistentes', 'normas_comunidad_aceptaciones']);
  for (const l of llamadas) {
    const tiene = (op: string, c: string, v?: unknown) => l.filtros.some(f => f[0] === op && f[1] === c && (v === undefined || f[2] === v));
    if (l.tabla in COBERTURA_TABLAS) {
      assert.ok(tiene('eq', 'socio_id', 's1'), `${l.tabla} sin filtro de socia`);
    }
    if (!sinEstudio.has(l.tabla)) {
      assert.ok(tiene('eq', 'studio_id', 'st1') || (l.tabla === 'studios' && tiene('eq', 'id', 'st1')), `${l.tabla} sin filtro de estudio`);
    }
  }
  assert.ok(!llamadas.some(l => l.tabla === 'lecturas_ficha_salud' || l.tabla === 'notas_internas'), 'las tablas excluidas ni se leen');
});

test('columnas: todo lo que se pide existe en lib/db-types.ts', async () => {
  const tipos = readFileSync(join(RAIZ, 'lib', 'db-types.ts'), 'utf8');
  const { db, llamadas } = bdFalsa(fixture());
  await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  const errores: string[] = [];
  for (const l of llamadas) {
    const nombre = 'Row' + l.tabla.split('_').map(p => p[0].toUpperCase() + p.slice(1)).join('');
    const bloque = new RegExp(`export interface ${nombre} \\{([\\s\\S]*?)\\n\\}`).exec(tipos)?.[1];
    if (!bloque) continue; // tabla anterior a las migraciones leídas por el generador
    for (const c of l.columnas) if (!new RegExp(`\\n\\s+${c}\\??:`).test(bloque)) errores.push(`${l.tabla}.${c}`);
  }
  assert.deepEqual(errores, [], 'columna pedida que no existe: la exportación fallaría entera en producción');
});

test('salud: no sale (ni se lee) sin permiso clínico', async () => {
  const { db, llamadas } = bdFalsa(fixture());
  const r = await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: true, puerta: { estudio: 'PROPIETARIO' }, ahora: AHORA });
  assert.equal(r?.secciones.salud, null);
  assert.ok(!llamadas.some(l => TABLAS_SALUD.includes(l.tabla)));
  assert.match(r!.notas.join(' '), /ficha clínica/);
});

test('salud en el panel: además exige el consentimiento vigente, igual que la RLS', async () => {
  const sinConsentimiento = await exportarDatosSocia(bdFalsa(fixture()).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: true, puerta: { estudio: 'PROPIETARIO' }, ahora: AHORA });
  assert.equal(sinConsentimiento?.secciones.salud, null);

  const revocado = await exportarDatosSocia(bdFalsa(fixture({ consentimiento_salud_fecha: '2026-01-01', consentimiento_salud_revocado_en: '2026-02-01' })).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: true, puerta: { estudio: 'PROPIETARIO' }, ahora: AHORA });
  assert.equal(revocado?.secciones.salud, null);

  const vigente = await exportarDatosSocia(bdFalsa(fixture({ consentimiento_salud_fecha: '2026-01-01' })).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: true, puerta: { estudio: 'PROPIETARIO' }, ahora: AHORA });
  assert.notEqual(vigente?.secciones.salud, null);
});

test('una socia de otro estudio no existe para esta exportación', async () => {
  const r = await exportarDatosSocia(bdFalsa(fixture()).db,
    { studioId: 'st2', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  assert.equal(r, null);
});

test('si una lectura falla, falla la exportación entera (nunca un archivo a medias)', async () => {
  const { db } = bdFalsa(fixture());
  const conFallo: LectorBd = {
    from(tabla: string) {
      if (tabla !== 'recibos') return db.from(tabla);
      const roto = {
        eq: () => roto, in: () => roto, is: () => roto, order: () => roto, range: () => roto,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'timeout' } }).then(ok),
      };
      return { select: () => roto as unknown as ConsultaBd };
    },
  };
  await assert.rejects(
    exportarDatosSocia(conFallo, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA }),
    /recibos/,
  );
});

test('nombre de archivo apto para una cabecera', () => {
  assert.equal(nombreArchivoExportacion('mis-datos Pilates Luz Ñ', AHORA), 'mis-datos-pilates-luz-n-2026-09-13.json');
});

// ── Moderación de la app (migr 20261006014051) ──────────────────────────────

/** El fixture con su hilo con la instructora, comentarios del tablón y denuncias. */
function fixtureModeracion(): Record<string, Fila[]> {
  const f = fixture();
  return {
    ...f,
    conversaciones: [
      { id: 'cv1', studio_id: 'st1', tipo: 'ALUMNA_MOSTRADOR' },
      { id: 'cv2', studio_id: 'st1', tipo: 'ALUMNA_INSTRUCTORA' },
    ],
    conversacion_participantes: [...f.conversacion_participantes, { conversacion_id: 'cv2', socio_id: 's1', bloqueo_en: '2026-09-09T10:00:00Z' }],
    post_likes: [
      { post_id: 'p1', studio_id: 'st1', user_id: 'u1', creado_en: '2026-09-05T12:00:00Z' },
      { post_id: 'p1', studio_id: 'st1', user_id: 'u2', creado_en: '2026-09-05T12:30:00Z' },
    ],
    socio_companeras: [
      { id: 'sc1', studio_id: 'st1', solicitante_id: 's1', destinataria_id: 's2', estado: 'bloqueada', bloqueada_por: 's1', resuelto_en: '2026-09-10T10:00:00Z' },
      // La bloqueó otra: eso no es suyo (y no se le cuenta).
      { id: 'sc2', studio_id: 'st1', solicitante_id: 's3', destinataria_id: 's1', estado: 'bloqueada', bloqueada_por: 's3', resuelto_en: '2026-09-10T11:00:00Z' },
    ],
    normas_comunidad_aceptaciones: [
      { auth_user_id: 'u1', version: '2026-10-05', aceptada_en: '2026-10-05T09:00:00Z' },
      { auth_user_id: 'u2', version: '2026-10-05', aceptada_en: '2026-10-05T09:30:00Z' },
    ],
    mensajes: [
      ...f.mensajes,
      { id: 'ms3', studio_id: 'st1', conversacion_id: 'cv2', remitente_auth_user_id: 'u1', cuerpo: 'Laura, ¿me cambias el ejercicio?', creado_en: '2026-09-03T10:00:00Z', oculto_en: '2026-09-04T10:00:00Z' },
    ],
    comentarios_comunidad: [
      // Escrito con una cuenta que ya no es la suya: se reconoce por la ficha.
      { id: 'cc1', studio_id: 'st1', post_id: 'p1', autor_id: 'cuenta-vieja', socio_id: 's1', texto: '¡Qué bien lo pasamos!', creado_en: '2026-09-05T10:00:00Z', oculto_en: null },
      { id: 'cc2', studio_id: 'st1', post_id: 'p1', autor_id: 'u1', socio_id: 's1', texto: 'Algo que el estudio retiró', creado_en: '2026-09-06T10:00:00Z', oculto_en: '2026-09-06T12:00:00Z' },
      { id: 'cc3', studio_id: 'st1', post_id: 'p1', autor_id: 'u2', socio_id: 's2', texto: 'Comentario de Bea', creado_en: '2026-09-05T11:00:00Z' },
    ],
    denuncias: [
      { id: 'd1', studio_id: 'st1', socio_id: 's1', ambito: 'CHAT_INSTRUCTORA', motivo: 'DENUNCIA', estado: 'MANTENIDA', revisada_por: 'ESTUDIO',
        detalle: 'Me habló mal', creada_en: '2026-09-07T10:00:00Z', resuelta_en: '2026-09-08T10:00:00Z',
        resuelta_por: 'cuenta-duena', autor_auth_user_id: 'cuenta-laura', denunciante_auth_user_id: 'u1' },
      { id: 'd2', studio_id: 'st1', socio_id: 's2', ambito: 'TABLON', motivo: 'DENUNCIA', estado: 'PENDIENTE', detalle: 'De Bea', creada_en: '2026-09-07T11:00:00Z' },
    ],
  };
}

test('denuncias: solo salen en su propia descarga, con lo que contó y sin cuentas de nadie', async () => {
  const alumna = await exportarDatosSocia(bdFalsa(fixtureModeracion()).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  const otros = alumna!.secciones.otros as { denunciasHechas?: Fila[] };
  assert.deepEqual(otros.denunciasHechas, [{
    fecha: '2026-09-07T10:00:00Z', sobre: 'CHAT_INSTRUCTORA', tipo: 'DENUNCIA', estado: 'MANTENIDA',
    revisadaPor: 'ESTUDIO', resueltaEn: '2026-09-08T10:00:00Z', loQueContaste: 'Me habló mal',
  }]);
  const json = JSON.stringify(alumna);
  for (const prohibido of ['cuenta-duena', 'cuenta-laura', 'De Bea']) assert.ok(!json.includes(prohibido), `no debe salir: ${prohibido}`);

  // Desde la ficha, ni la propietaria se lleva lo que denunció: ni se lee.
  const { db, llamadas } = bdFalsa(fixtureModeracion());
  const panel = await exportarDatosSocia(db,
    { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: true, puerta: { estudio: 'PROPIETARIO' }, ahora: AHORA });
  assert.ok(!('denunciasHechas' in (panel!.secciones.otros as object)));
  assert.ok(!llamadas.some((l) => l.tabla === 'denuncias'));
});

test('tablón: sus comentarios por su ficha, también los retirados (son suyos), y nada de otra socia', async () => {
  const { db, llamadas } = bdFalsa(fixtureModeracion());
  for (const puerta of ['alumna', { estudio: 'RECEPCION' }] as const) {
    const r = await exportarDatosSocia(db,
      { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: false, puerta, ahora: AHORA });
    const tablon = (r!.secciones.otros as { tablon: { comentarios: Fila[] } }).tablon;
    assert.deepEqual(tablon.comentarios, [
      { fecha: '2026-09-05T10:00:00Z', texto: '¡Qué bien lo pasamos!', retiradoPorElEstudio: false },
      { fecha: '2026-09-06T10:00:00Z', texto: 'Algo que el estudio retiró', retiradoPorElEstudio: true },
    ]);
  }
  const lectura = llamadas.find((l) => l.tabla === 'comentarios_comunidad');
  assert.ok(lectura?.filtros.some(([op, c, v]) => op === 'eq' && c === 'socio_id' && v === 's1'), 'se leen por su ficha');
});

test('mensajes desde el panel: recepción solo se lleva los del hilo con el estudio', async () => {
  const r = await exportarDatosSocia(bdFalsa(fixtureModeracion()).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: true, puerta: { estudio: 'RECEPCION' }, ahora: AHORA });
  assert.deepEqual(r!.secciones.mensajesEnviados, [{ fecha: '2026-09-02T10:00:00Z', texto: 'Hola, ¿mañana hay clase?', retiradoPorElEstudio: false }]);
  assert.ok(!JSON.stringify(r).includes('Laura, ¿me cambias el ejercicio?'));
});

test('mensajes: la propietaria y la propia alumna se llevan también los de su instructora', async () => {
  for (const puerta of ['alumna', { estudio: 'PROPIETARIO' }] as const) {
    const r = await exportarDatosSocia(bdFalsa(fixtureModeracion()).db,
      { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: true, puerta, ahora: AHORA });
    assert.deepEqual((r!.secciones.mensajesEnviados as Fila[]).map((m) => [m.texto, m.retiradoPorElEstudio]), [
      ['Hola, ¿mañana hay clase?', false],
      ['Laura, ¿me cambias el ejercicio?', true],
    ]);
  }
});

test('tablón y moderación: sus «me gusta», a quién bloqueó (sin quién era) y las normas que aceptó', async () => {
  const alumna = await exportarDatosSocia(bdFalsa(fixtureModeracion()).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: false, puerta: 'alumna', ahora: AHORA });
  const otros = alumna!.secciones.otros as { tablon: { meGusta: Fila[] }; bloqueos: Fila[]; normasDeLaComunidadAceptadas: Fila[] };
  assert.deepEqual(otros.tablon.meGusta, [{ fecha: '2026-09-05T12:00:00Z', publicacion: 'p1' }]);
  assert.deepEqual(otros.bloqueos, [
    { donde: 'tablon', desde: '2026-09-10T10:00:00Z' },
    { donde: 'mensajes', desde: '2026-09-09T10:00:00Z' },
  ]);
  assert.deepEqual(otros.normasDeLaComunidadAceptadas, [{ version: '2026-10-05', fecha: '2026-10-05T09:00:00Z' }]);
  assert.ok(!JSON.stringify(otros.bloqueos).includes('s2'), 'sin la ficha de la otra persona');

  // Desde la ficha del estudio: los «me gusta» sí (son del tablón del estudio); bloqueos y normas, no (ni se leen).
  const { db, llamadas } = bdFalsa(fixtureModeracion());
  const panel = await exportarDatosSocia(db,
    { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: true, puerta: { estudio: 'PROPIETARIO' }, ahora: AHORA });
  const o = panel!.secciones.otros as Record<string, unknown>;
  assert.ok(!('bloqueos' in o) && !('normasDeLaComunidadAceptadas' in o));
  assert.ok(!llamadas.some((l) => l.tabla === 'socio_companeras' || l.tabla === 'normas_comunidad_aceptaciones'));
});
