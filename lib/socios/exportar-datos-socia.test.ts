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
  };
}

const TABLAS_SALUD = ['condiciones_salud', 'respuestas_cuestionario_salud', 'respuestas_sesion', 'valoraciones_iniciales', 'valoraciones_iniciales_salud', 'notas_progreso'];

test('forma: JSON versionado con todas las secciones, y solo lo de ESTA socia en ESTE estudio', async () => {
  const { db } = bdFalsa(fixture());
  const r = await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, ahora: AHORA });
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
  assert.deepEqual(r.secciones.mensajesEnviados, [{ fecha: '2026-09-02T10:00:00Z', texto: 'Hola, ¿mañana hay clase?' }]);
  const salud = r.secciones.salud as Record<string, unknown>;
  assert.equal((salud.condiciones as Fila[]).length, 1);
  assert.deepEqual((salud.valoracionInicial as Fila).salud, { tieneMolestias: true, zonas: ['lumbar'], detalle: null, estadoDelCuerpo: null });
});

test('minimización: nada de contacto del personal, de quién tecleó ni del IBAN entero', async () => {
  const { db } = bdFalsa(fixture());
  const r = await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, ahora: AHORA });
  const json = JSON.stringify(r);
  for (const prohibido of ['laura@equipo.es', '600000000', 'Respuesta del equipo', 'ES9121000418450200051332', 'leido_por', 'creado_por']) {
    assert.ok(!json.includes(prohibido), `no debe salir: ${prohibido}`);
  }
  assert.equal(enmascararIban('ES91 2100 0418 4502 0005 1332'), 'ES·· ···· 1332');
});

test('alcance: cada lectura de una tabla con socio_id va filtrada por la socia, y por el estudio si la tabla lo tiene', async () => {
  const { db, llamadas } = bdFalsa(fixture());
  await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, ahora: AHORA });
  const sinEstudio = new Set(['codigos_descuento_consumos', 'conversacion_participantes', 'post_evento_asistentes']);
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
  await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, ahora: AHORA });
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
  const r = await exportarDatosSocia(db, { studioId: 'st1', socioId: 's1', incluirSalud: false, saludSoloConConsentimiento: true, ahora: AHORA });
  assert.equal(r?.secciones.salud, null);
  assert.ok(!llamadas.some(l => TABLAS_SALUD.includes(l.tabla)));
  assert.match(r!.notas.join(' '), /ficha clínica/);
});

test('salud en el panel: además exige el consentimiento vigente, igual que la RLS', async () => {
  const sinConsentimiento = await exportarDatosSocia(bdFalsa(fixture()).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: true, ahora: AHORA });
  assert.equal(sinConsentimiento?.secciones.salud, null);

  const revocado = await exportarDatosSocia(bdFalsa(fixture({ consentimiento_salud_fecha: '2026-01-01', consentimiento_salud_revocado_en: '2026-02-01' })).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: true, ahora: AHORA });
  assert.equal(revocado?.secciones.salud, null);

  const vigente = await exportarDatosSocia(bdFalsa(fixture({ consentimiento_salud_fecha: '2026-01-01' })).db,
    { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: true, ahora: AHORA });
  assert.notEqual(vigente?.secciones.salud, null);
});

test('una socia de otro estudio no existe para esta exportación', async () => {
  const r = await exportarDatosSocia(bdFalsa(fixture()).db,
    { studioId: 'st2', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, ahora: AHORA });
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
    exportarDatosSocia(conFallo, { studioId: 'st1', socioId: 's1', incluirSalud: true, saludSoloConConsentimiento: false, ahora: AHORA }),
    /recibos/,
  );
});

test('nombre de archivo apto para una cabecera', () => {
  assert.equal(nombreArchivoExportacion('mis-datos Pilates Luz Ñ', AHORA), 'mis-datos-pilates-luz-n-2026-09-13.json');
});
