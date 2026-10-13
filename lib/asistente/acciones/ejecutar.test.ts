import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelarAccion, confirmarAccion, type DepsConfirmar, type SesionConfirmar } from './ejecutar.ts';
import { guardarPropuesta, proponerClase, proponerCita } from './servidor.ts';
import { puedeEjecutarAccion } from './permisos.ts';
import { tablaReferencias } from '../referencias.ts';
import type { ContextoHerramienta } from '../tipos.ts';
import { adminFalso } from './pruebas-admin.ts';
import { zClase, zSala } from './esquemas.ts';
import { mensajeDeFaltantes } from '../herramientas/faltantes.ts';

const AHORA = new Date('2026-10-06T10:00:00Z');
const ID = '11111111-1111-4111-8111-111111111111';
const YO: SesionConfirmar = { studioId: 'est-1', userId: 'user-1', rol: 'PROPIETARIO', nombre: 'Cloe Ejemplo' };
const deps = (extra: Partial<DepsConfirmar> = {}): DepsConfirmar & { avisos: string[] } => {
  const avisos: string[] = [];
  return { ahora: AHORA, despues: f => { void f(); }, avisarEvento: async (p) => { avisos.push(p); }, avisos, ...extra } as DepsConfirmar & { avisos: string[] };
};

const PAYLOAD_CLASE = { tipoClaseId: 't1', salaId: 's1', instructorId: 'i1', inicio: '2026-10-07T16:00:00.000Z', fin: '2026-10-07T17:00:00.000Z', aforo: 8 };
const fila = (o: Record<string, unknown> = {}) => ({
  id: ID, studio_id: 'est-1', auth_user_id: 'user-1', tipo: 'CREAR_CLASE', estado: 'PROPUESTA', payload: PAYLOAD_CLASE,
  resultado: null, caduca_en: '2026-10-06T10:15:00.000Z', reclamada_en: null, ...o,
});
const base = (o: Record<string, unknown[]> = {}) => ({
  asistente_acciones: [fila()], tipos_clase: [{ id: 't1', studio_id: 'est-1', archivado_en: null }],
  salas: [{ id: 's1', studio_id: 'est-1', nombre: 'Grande' }], instructores: [{ id: 'i1', studio_id: 'est-1', activo: true }],
  cierres_estudio: [], instructora_disponibilidad_excepciones: [], sesiones: [], citas: [], socios: [{ id: 'soc-1', studio_id: 'est-1', borrado_en: null }],
  posts_comunidad: [], ...o,
});
const creaciones = (llamadas: { op: string; tabla: string }[], tabla: string) => llamadas.filter(l => l.op === 'insert' && l.tabla === tabla).length;

test('confirmar crea la clase una vez, con el payload GUARDADO, y deja la propuesta EJECUTADA', async () => {
  const { admin, llamadas, tablas } = adminFalso(base());
  const r = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(r.ok && r.estado === 'EJECUTADA' && !r.yaCreada);
  assert.equal(creaciones(llamadas, 'sesiones'), 1);
  const s = tablas.sesiones[0];
  assert.equal(s.id, `ses-asist-${ID}`);
  assert.equal(s.studio_id, 'est-1');
  assert.deepEqual([s.tipo_clase_id, s.sala_id, s.instructor_id, s.aforo_maximo, s.serie_id, s.precio_puntual], ['t1', 's1', 'i1', 8, null, null]);
  assert.equal(tablas.asistente_acciones[0].estado, 'EJECUTADA');
});

test('idempotente: doble clic, reintento y dos pestañas a la vez = una sola creación', async () => {
  const { admin, llamadas } = adminFalso(base());
  const [a, b, c] = await Promise.all([confirmarAccion(admin, YO, ID, deps()), confirmarAccion(admin, YO, ID, deps()), confirmarAccion(admin, YO, ID, deps())]);
  const ok = [a, b, c].filter(x => x.ok);
  assert.ok(ok.length >= 1);
  assert.equal(creaciones(llamadas, 'sesiones'), 1);
  for (const x of [a, b, c]) assert.ok(x.ok || x.codigo === 'EN_CURSO');
  const otra = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(otra.ok && otra.yaCreada);
  assert.equal(creaciones(llamadas, 'sesiones'), 1);
});

test('una caída a medias (EJECUTANDO muerta) se retoma sin duplicar', async () => {
  const { admin, llamadas, tablas } = adminFalso(base({ asistente_acciones: [fila({ estado: 'EJECUTANDO', reclamada_en: '2026-10-06T09:50:00.000Z' })], sesiones: [{ id: `ses-asist-${ID}`, studio_id: 'est-1' }] }));
  const r = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(r.ok);
  assert.equal(creaciones(llamadas, 'sesiones'), 0);
  assert.equal(tablas.asistente_acciones[0].estado, 'EJECUTADA');
  // Y una toma VIVA no se pisa.
  const viva = adminFalso(base({ asistente_acciones: [fila({ estado: 'EJECUTANDO', reclamada_en: '2026-10-06T09:59:30.000Z' })] }));
  const e = await confirmarAccion(viva.admin, YO, ID, deps());
  assert.ok(!e.ok && e.codigo === 'EN_CURSO');
  assert.equal(creaciones(viva.llamadas, 'sesiones'), 0);
});

test('caduca a los 15 minutos: no crea nada y lo dice', async () => {
  const { admin, llamadas, tablas } = adminFalso(base());
  const tarde = await confirmarAccion(admin, YO, ID, deps({ ahora: new Date('2026-10-06T10:15:01Z') }));
  assert.ok(!tarde.ok && tarde.status === 410 && tarde.codigo === 'CADUCADA');
  assert.equal(creaciones(llamadas, 'sesiones'), 0);
  assert.equal(tablas.asistente_acciones[0].estado, 'CADUCADA');
});

test('cancelada no se confirma; cancelar es idempotente y no deshace lo creado', async () => {
  const { admin, llamadas } = adminFalso(base());
  assert.deepEqual(await cancelarAccion(admin, YO, ID, AHORA), { ok: true, estado: 'CANCELADA' });
  assert.deepEqual(await cancelarAccion(admin, YO, ID, AHORA), { ok: true, estado: 'CANCELADA' });
  const r = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(!r.ok && r.codigo === 'CANCELADA');
  assert.equal(creaciones(llamadas, 'sesiones'), 0);
  const hecha = adminFalso(base({ asistente_acciones: [fila({ estado: 'EJECUTADA' })] }));
  const c = await cancelarAccion(hecha.admin, YO, ID, AHORA);
  assert.ok(!c.ok && c.status === 409);
});

test('solo la persona que la recibió, y solo de SU estudio: otra persona u otro estudio ven «no existe»', async () => {
  const { admin, llamadas } = adminFalso(base());
  for (const s of [{ ...YO, userId: 'user-2' }, { ...YO, studioId: 'est-2' }]) {
    const r = await confirmarAccion(admin, s, ID, deps());
    assert.ok(!r.ok && r.status === 404 && r.codigo === 'NO_ENCONTRADA');
    const c = await cancelarAccion(admin, s, ID, AHORA);
    assert.ok(!c.ok && c.status === 404);
  }
  assert.equal(creaciones(llamadas, 'sesiones'), 0);
});

test('permisos por rol: propietaria y gerencia sí; recepción e instructora no, ni de lejos', async () => {
  for (const tipo of ['CREAR_CLASE', 'CREAR_SALA', 'CREAR_EVENTO', 'CREAR_CITA'] as const) {
    assert.equal(puedeEjecutarAccion('PROPIETARIO', tipo), true, `PROPIETARIO ${tipo}`);
    assert.equal(puedeEjecutarAccion('MANAGER', tipo), true, `MANAGER ${tipo}`);
    assert.equal(puedeEjecutarAccion('RECEPCION', tipo), false, `RECEPCION ${tipo}`);
    assert.equal(puedeEjecutarAccion('INSTRUCTOR', tipo), false, `INSTRUCTOR ${tipo}`);
  }
  const { admin, llamadas } = adminFalso(base());
  for (const rol of ['RECEPCION', 'INSTRUCTOR'] as const) {
    const r = await confirmarAccion(admin, { ...YO, rol }, ID, deps());
    assert.ok(!r.ok && r.status === 403 && r.codigo === 'SIN_PERMISO');
  }
  assert.equal(creaciones(llamadas, 'sesiones'), 0);
});

test('si al confirmar alguien ocupó la sala: falla con mensaje claro, no queda nada y se puede reintentar', async () => {
  const { admin, llamadas, tablas } = adminFalso(base(), { falla: (t) => (t === 'sesiones' ? { code: '23P01', message: 'conflicting key value violates exclusion constraint "sesiones_sala_sin_solape"' } : null) });
  const r = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(!r.ok && r.status === 409 && r.codigo === 'CONFLICTO');
  assert.match(r.error, /sala está ocupada.*No se ha creado nada/);
  assert.equal(tablas.sesiones.length, 0);
  assert.equal(tablas.asistente_acciones[0].estado, 'PROPUESTA');
  assert.equal(creaciones(llamadas, 'sesiones'), 0);
});

test('lo que cambió desde la propuesta se vuelve a mirar: sala borrada, cierre del centro, hora ya pasada', async () => {
  const sinSala = adminFalso(base({ salas: [] }));
  const a = await confirmarAccion(sinSala.admin, YO, ID, deps());
  assert.ok(!a.ok && /sala ya no existe/.test(a.error));
  const cierre = adminFalso(base({ cierres_estudio: [{ studio_id: 'est-1', id: 'c', desde: '2026-10-07', hasta: '2026-10-07', motivo: null }] }));
  const b = await confirmarAccion(cierre.admin, YO, ID, deps());
  assert.ok(!b.ok && /cerrado/.test(b.error));
  const pasada = adminFalso(base({ asistente_acciones: [fila({ caduca_en: '2026-10-08T00:00:00.000Z' })] }));
  const c = await confirmarAccion(pasada.admin, YO, ID, deps({ ahora: new Date('2026-10-07T16:30:00Z') }));
  assert.ok(!c.ok && /ya ha pasado/.test(c.error));
  for (const x of [sinSala, cierre, pasada]) assert.equal(creaciones(x.llamadas, 'sesiones'), 0);
});

test('un error inesperado no inventa éxito: sin «creada», y la propuesta sigue viva', async () => {
  const { admin, tablas } = adminFalso(base(), { falla: (t) => (t === 'sesiones' ? { code: 'XX000', message: 'boom' } : null) });
  const r = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(!r.ok && r.status === 500 && r.codigo === 'ERROR');
  assert.equal(tablas.asistente_acciones[0].estado, 'PROPUESTA');
});

test('cita: usa la RPC atómica sin precio ni servicio, con el id derivado; un CONFLICTO no crea nada', async () => {
  const payload = { socioId: 'soc-1', instructorId: 'i1', tipo: 'PRIVADA', inicio: '2026-10-08T08:00:00.000Z', fin: '2026-10-08T09:00:00.000Z' };
  const ok = adminFalso(base({ asistente_acciones: [fila({ tipo: 'CREAR_CITA', payload })] }), { rpc: () => ({ data: 'CONFIRMADA' }) });
  const r = await confirmarAccion(ok.admin, YO, ID, deps());
  assert.ok(r.ok);
  const rpc = ok.llamadas.find(l => l.op === 'rpc')!;
  assert.deepEqual(rpc.datos, { p_id: `cita-asist-${ID}`, p_studio_id: 'est-1', p_socio_id: 'soc-1', p_instructor_id: 'i1', p_servicio_id: null, p_tipo: 'PRIVADA', p_inicio: payload.inicio, p_fin: payload.fin, p_precio: null, p_notas: null });
  const choque = adminFalso(base({ asistente_acciones: [fila({ tipo: 'CREAR_CITA', payload })] }), { rpc: () => ({ data: 'CONFLICTO' }) });
  const c = await confirmarAccion(choque.admin, YO, ID, deps());
  assert.ok(!c.ok && c.codigo === 'CONFLICTO' && /No se ha creado nada/.test(c.error));
});

test('sala y evento: ids derivados; el evento avisa a las alumnas solo tras crearse y una vez', async () => {
  const sala = adminFalso(base({ asistente_acciones: [fila({ tipo: 'CREAR_SALA', payload: { nombre: 'Terraza', capacidad: 6, color: '#F7A6C4' } })] }));
  assert.ok((await confirmarAccion(sala.admin, { ...YO, rol: 'MANAGER' }, ID, deps())).ok);
  assert.equal(sala.tablas.salas.find(s => s.id === `sala-asist-${ID}`)?.nombre, 'Terraza');
  const ev = adminFalso(base({ asistente_acciones: [fila({ tipo: 'CREAR_EVENTO', payload: { texto: 'Taller de respiración', inicio: '2026-10-10T09:00:00.000Z', aforo: 12, lugar: null } })] }));
  const d = deps();
  await confirmarAccion(ev.admin, YO, ID, d);
  await confirmarAccion(ev.admin, YO, ID, d);
  const post = ev.tablas.posts_comunidad[0];
  assert.equal(post.tipo, 'EVENTO');
  assert.equal(post.audiencia, 'TODAS');
  assert.equal(post.studio_id, 'est-1');
  assert.deepEqual(d.avisos, [`post-asist-${ID}`]);
});

// ── El modelo PROPONE: sus herramientas no escriben nada del estudio ──
const ctx = (admin: unknown, o: Partial<ContextoHerramienta> = {}): ContextoHerramienta => ({
  admin: admin as ContextoHerramienta['admin'], studioId: 'est-1', userId: 'user-1', rol: 'PROPIETARIO', ahora: AHORA, hoy: '2026-10-06',
  refs: tablaReferencias({ EQUIPO_1: { tipo: 'instructora', id: 'i1' }, ALUMNA_1: { tipo: 'socia', id: 'soc-1' }, ALUMNA_2: { tipo: 'socia', id: 'soc-de-otro-estudio' } }),
  personas: [], plan: { decisiones: true }, conversacionId: null, ...o,
});
const datos = () => base({
  asistente_acciones: [], tipos_clase: [{ id: 't1', studio_id: 'est-1', nombre: 'Reformer', duracion_minutos: 60, aforo_por_defecto: 8, archivado_en: null }],
  salas: [{ id: 's1', studio_id: 'est-1', nombre: 'Sala Grande', capacidad: 10 }], studio_horario: [],
  instructores: [{ id: 'i1', studio_id: 'est-1', activo: true, nombre: 'Marta' }],
});
const entrada = { tipo_clase: 'Reformer', fecha: '2026-10-07', hora: '18:00', sala: 'Sala Grande', instructora: '[EQUIPO_1]', aforo: 0 };

test('proponer no escribe nada del estudio: solo la propuesta, atada a quien la recibe, y caduca a los 15 min', async () => {
  const { admin, llamadas, tablas } = adminFalso(datos());
  const c = ctx(admin);
  const prep = await proponerClase(entrada, c);
  assert.ok(prep.ok);
  const bloque = await guardarPropuesta(c, prep);
  assert.equal(bloque.tipo, 'propuesta');
  const escrituras = llamadas.filter(l => l.op !== 'delete').map(l => `${l.op}:${l.tabla}`);
  assert.deepEqual(escrituras, ['insert:asistente_acciones']);
  assert.equal(tablas.sesiones.length, 0);
  const guardada = tablas.asistente_acciones[0];
  assert.equal(guardada.studio_id, 'est-1');
  assert.equal(guardada.auth_user_id, 'user-1');
  assert.equal(Date.parse(guardada.caduca_en as string) - AHORA.getTime(), 15 * 60_000);
  // Nada de nombres: ni en la tarjeta que se guarda en el historial, ni en el payload.
  assert.doesNotMatch(JSON.stringify(bloque) + JSON.stringify(guardada.payload), /Marta/);
});

test('proponer una cita: la marca se resuelve a un id del estudio; una alumna de otro estudio o una PERSONA_n no', async () => {
  const d = { ...datos(), socios: [{ id: 'soc-1', studio_id: 'est-1', borrado_en: null }, { id: 'soc-de-otro-estudio', studio_id: 'est-2', borrado_en: null }] };
  const { admin } = adminFalso(d);
  const c = ctx(admin);
  const cita = { alumna: '[ALUMNA_1]', instructora: '[EQUIPO_1]', fecha: '2026-10-08', hora: '10:00', duracion_min: 0, tipo: 'privada' as const };
  const ok = await proponerCita(cita, c);
  assert.ok(ok.ok && (ok.payload as { socioId: string }).socioId === 'soc-1');
  const ajena = await proponerCita({ ...cita, alumna: '[ALUMNA_2]' }, c);
  assert.ok(!ajena.ok);
  const ambigua = await proponerCita({ ...cita, alumna: '[PERSONA_1]' }, c);
  assert.ok(!ambigua.ok && /varias/.test(ambigua.error));
  const inventada = await proponerCita({ ...cita, alumna: '[ALUMNA_99]' }, c);
  assert.ok(!inventada.ok);
});

test('proponer: una sala de otro estudio no existe para este', async () => {
  const d = { ...datos(), salas: [{ id: 's9', studio_id: 'est-2', nombre: 'Sala Grande', capacidad: 10 }] };
  const { admin } = adminFalso(d);
  const r = await proponerClase(entrada, ctx(admin));
  assert.ok(!r.ok);
});

// ── Una propuesta viva por conversación; nada de relleno con ceros (bug real del 6-oct) ──
test('una propuesta nueva cancela las pendientes anteriores de SU conversación (y solo de esa)', async () => {
  const vieja = (id: string, conv: string) => fila({ id, conversacion_id: conv });
  const { admin, tablas } = adminFalso({ ...datos(), asistente_acciones: [vieja('a1', 'conv-1'), vieja('a2', 'conv-2'), fila({ id: 'a3', conversacion_id: 'conv-1', estado: 'EJECUTADA' })] });
  const c = ctx(admin, { conversacionId: 'conv-1' });
  const prep = await proponerClase(entrada, c);
  assert.ok(prep.ok);
  await guardarPropuesta(c, prep);
  const estado = (id: string) => tablas.asistente_acciones.find(f => f.id === id)?.estado;
  assert.equal(estado('a1'), 'CANCELADA');
  assert.equal(estado('a2'), 'PROPUESTA');
  assert.equal(estado('a3'), 'EJECUTADA');
  assert.equal(tablas.asistente_acciones.length, 4); // la nueva (estado PROPUESTA por defecto en la BD)
});

test('capacidad 0, aforo 0, nombre o campos vacíos: no pasan el esquema y el error dice qué falta (la puerta no llega a crear fila)', () => {
  const dice = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) => { assert.equal(r.success, false); return mensajeDeFaltantes(r.error!.issues); };
  assert.match(dice(zSala.safeParse({ nombre: 'Reformer avanzado', capacidad: 0 })), /capacidad de la sala: pregunta cuántas plazas/);
  assert.match(dice(zSala.safeParse({ nombre: '  ', capacidad: 8 })), /nombre/);
  assert.match(dice(zClase.safeParse({ ...entrada, aforo: 0 })), /aforo.*se omite/);
  const vacia = dice(zClase.safeParse({ ...entrada, sala: '', tipo_clase: '' }));
  assert.match(vacia, /sala/); assert.match(vacia, /tipo_clase/); assert.match(vacia, /NO rellenes con 0/);
  // Omitir el aforo sí vale: el servidor pone el del tipo/sala.
  const { aforo: _a, ...sinAforo } = entrada;
  assert.equal(zClase.safeParse(sinAforo).success, true);
});

const LOTE = { clases: [0, 1, 2].map(i => ({ ...PAYLOAD_CLASE, inicio: `2026-10-${7 + i * 7 < 10 ? '0' : ''}${7 + i * 7}T16:00:00.000Z`, fin: `2026-10-${7 + i * 7 < 10 ? '0' : ''}${7 + i * 7}T17:00:00.000Z` })) };

test('lote: confirmar crea todas, cada una con su id derivado, y es idempotente', async () => {
  const { admin, llamadas, tablas } = adminFalso(base({ asistente_acciones: [fila({ payload: LOTE })] }));
  const r = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(r.ok && !r.yaCreada);
  assert.equal(creaciones(llamadas, 'sesiones'), 3);
  assert.deepEqual(tablas.sesiones.map(s => s.id), [`ses-asist-${ID}-0`, `ses-asist-${ID}-1`, `ses-asist-${ID}-2`]);
  const otra = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(otra.ok && otra.yaCreada);
  assert.equal(creaciones(llamadas, 'sesiones'), 3);
});

test('lote: si una falla a medias se dice cuántas se crearon, la propuesta sigue viva y reintentar crea solo las que faltan', async () => {
  let n = 0;
  const { admin, tablas } = adminFalso(base({ asistente_acciones: [fila({ payload: LOTE })] }), {
    falla: (t) => (t === 'sesiones' && ++n === 3 ? { code: '23P01', message: 'conflicting key value violates exclusion constraint "sesiones_sala_sin_solape"' } : null),
  });
  const r = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(!r.ok && r.status === 409 && r.codigo === 'CONFLICTO');
  assert.match(r.error, /Se han creado 2 de 3/);
  assert.equal(tablas.sesiones.length, 2);
  assert.equal(tablas.asistente_acciones[0].estado, 'PROPUESTA');
  const otra = await confirmarAccion(admin, YO, ID, deps());
  assert.ok(otra.ok);
  assert.equal(tablas.sesiones.length, 3);
});
