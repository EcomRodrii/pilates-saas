import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACCIONES, TABLAS_AUDITADAS, cuandoDe, fraseDeAccion, describirEntrada, entradaDeFila, esRutina, formatearValor, quienDe,
  type EntradaAuditoria, type FilaAuditoria,
} from './auditoria-estudio.ts';

const AHORA = new Date('2026-09-25T12:00:00Z');

function fila(o: Partial<FilaAuditoria> = {}): FilaAuditoria {
  return {
    id: 1, studio_id: 'studio-1', ocurrido_en: '2026-09-25T12:32:00+00:00',
    actor_uid: '00000000-0000-4000-8000-000000000001', actor_rol: 'RECEPCION',
    origen: 'panel', tabla: 'recibos', fila_id: 'rec-1', operacion: 'UPDATE', socio_id: 'soc-1',
    cambios: ['importe'], motivo: null, contexto: { concepto: 'Mensual Ilimitado — Jul 2026', fecha_vencimiento: '2026-07-01' },
    antes: { importe: 85 }, despues: { importe: 86 },
    ...o,
  };
}
function entrada(o: Partial<FilaAuditoria> = {}): EntradaAuditoria {
  const e = entradaDeFila(fila(o));
  assert.ok(e, 'la fila de prueba debería ser válida');
  return e;
}

test('una fila válida se convierte y una rara se descarta sin romper', () => {
  assert.equal(entrada().tabla, 'recibos');
  assert.equal(entradaDeFila(fila({ operacion: 'TRUNCATE' })), null);
  assert.equal(entradaDeFila(fila({ ocurrido_en: '' })), null);
  const sinNada = entrada({ cambios: null, contexto: null, antes: null, despues: null });
  assert.deepEqual([sinNada.cambios, sinNada.contexto, sinNada.antes, sinNada.despues], [[], {}, {}, {}]);
});

test('un cambio de importe dice quién, qué recibo y el valor de antes y de después', () => {
  const d = describirEntrada(entrada(), { ahora: AHORA, nombreDeActor: uid => (uid === '00000000-0000-4000-8000-000000000001' ? 'Lucía' : null) });
  assert.equal(d.titulo, 'Cambió un recibo');
  assert.equal(d.quien, 'Lucía · Recepción');
  assert.equal(d.objeto, 'Mensual Ilimitado — Jul 2026');
  assert.deepEqual(d.lineas, [{ campo: 'Importe', antes: '85,00 €', despues: '86,00 €' }]);
  assert.equal(d.rutina, false);
});

test('un alta enseña solo lo que existe y una baja lo que había', () => {
  const alta = describirEntrada(entrada({
    operacion: 'INSERT', cambios: null, antes: null,
    despues: { concepto: 'Clase suelta', importe: 12, estado: 'PENDIENTE', fecha_vencimiento: '2026-11-03', metodo_cobro: null },
  }), { ahora: AHORA });
  assert.equal(alta.titulo, 'Creó un recibo');
  assert.deepEqual(alta.lineas, [
    { campo: 'Concepto', despues: 'Clase suelta' },
    { campo: 'Importe', despues: '12,00 €' },
    { campo: 'Estado', despues: 'Pendiente' },
    { campo: 'Vencimiento', despues: '3 nov 2026' },
  ]);
  const baja = describirEntrada(entrada({
    operacion: 'DELETE', cambios: null, despues: null, antes: { concepto: 'Clase suelta', importe: 12, estado: 'COBRADO' },
  }), { ahora: AHORA });
  assert.equal(baja.titulo, 'Eliminó un recibo');
  assert.deepEqual(baja.lineas, [
    { campo: 'Concepto', antes: 'Clase suelta' }, { campo: 'Importe', antes: '12,00 €' }, { campo: 'Estado', antes: 'Cobrado' },
  ]);
});

test('las líneas de un cambio van en el orden de siempre, no en el de la base de datos', () => {
  const d = describirEntrada(entrada({
    cambios: ['estado', 'fecha_cobro', 'importe'],
    antes: { estado: 'PENDIENTE', fecha_cobro: null, importe: 40 },
    despues: { estado: 'COBRADO', fecha_cobro: '2026-09-25', importe: 45 },
  }), { ahora: AHORA });
  assert.deepEqual(d.lineas.map(l => l.campo), ['Importe', 'Estado', 'Fecha de cobro']);
  assert.equal(d.lineas[2].antes, '—', 'un valor vacío se ve como raya, no como «null»');
  assert.equal(d.lineas[2].despues, '25 sept 2026');
});

test('una columna que no conoce se enseña con su nombre en claro, no se esconde', () => {
  const d = describirEntrada(entrada({ cambios: ['tras_cancelar_cuota'], antes: { tras_cancelar_cuota: false }, despues: { tras_cancelar_cuota: true } }));
  assert.deepEqual(d.lineas, [{ campo: 'Tras cancelar cuota', antes: 'No', despues: 'Sí' }]);
});

test('el descuento de una sesión de bono es rutina; un ajuste mayor, o con otro cambio, no', () => {
  const sub = (o: Partial<FilaAuditoria>) => entrada({ tabla: 'suscripciones', cambios: ['sesiones_restantes'], contexto: { plan_id: 'plan-4', estado: 'ACTIVA' }, ...o });
  assert.equal(esRutina(sub({ antes: { sesiones_restantes: 5 }, despues: { sesiones_restantes: 4 } })), true);
  assert.equal(esRutina(sub({ antes: { sesiones_restantes: 4 }, despues: { sesiones_restantes: 5 } })), true, 'la devolución también');
  assert.equal(esRutina(sub({ antes: { sesiones_restantes: 0 }, despues: { sesiones_restantes: 10 } })), false, 'recargar un bono no es rutina');
  assert.equal(esRutina(sub({ cambios: ['sesiones_restantes', 'estado'], antes: { sesiones_restantes: 5, estado: 'CANCELADA' }, despues: { sesiones_restantes: 4, estado: 'ACTIVA' } })), false);
  assert.equal(esRutina(entrada()), false, 'un recibo nunca es rutina');
});

test('el plan de una cuota sale por su nombre; si no se conoce, no se inventa', () => {
  const e = entrada({ tabla: 'suscripciones', cambios: ['estado'], antes: { estado: 'CANCELADA' }, despues: { estado: 'ACTIVA' }, contexto: { plan_id: 'plan-4', estado: 'ACTIVA' } });
  assert.equal(describirEntrada(e, { nombreDePlan: id => (id === 'plan-4' ? 'Mensual Ilimitado' : null) }).objeto, 'Mensual Ilimitado');
  assert.equal(describirEntrada(e).objeto, null);
  assert.equal(describirEntrada(e, { nombreDePlan: () => null }).objeto, null);
  const cambioDePlan = describirEntrada(entrada({ tabla: 'suscripciones', cambios: ['plan_id'], antes: { plan_id: 'plan-1' }, despues: { plan_id: 'plan-4' } }), {
    nombreDePlan: id => ({ 'plan-1': 'Bono 8', 'plan-4': 'Mensual Ilimitado' })[id],
  });
  assert.deepEqual(cambioDePlan.lineas, [{ campo: 'Plan', antes: 'Bono 8', despues: 'Mensual Ilimitado' }]);
});

test('quién: el nombre lo pone quien pinta con la plantilla del equipo; sin él, solo el rol', () => {
  assert.equal(quienDe({ actorRol: 'RECEPCION' }, 'Lucía'), 'Lucía · Recepción');
  assert.equal(quienDe({ actorRol: 'PROPIETARIO' }), 'Propietaria');
  assert.equal(quienDe({ actorRol: 'PROPIETARIO' }, '   '), 'Propietaria', 'un nombre en blanco no cuenta');
  assert.equal(quienDe({ actorRol: 'CONTABLE' }), 'Contable', 'un rol desconocido no rompe');
  // Una persona que ya no está en la plantilla se sigue viendo por su rol: el libro no guarda su nombre.
  const e = entrada();
  assert.equal(describirEntrada(e, { nombreDeActor: () => undefined }).quien, 'Recepción');
});

test('el libro no guarda el nombre de nadie: ni la fila ni la entrada tienen esa columna', () => {
  assert.equal('actor_nombre' in fila(), false);
  assert.equal('actorNombre' in entrada(), false);
});

test('cuándo: en la hora del estudio, no en la del navegador, y con año solo si no es el actual', () => {
  // 23:30 UTC del 25-sep son las 01:30 del día 26 en Madrid (UTC+2).
  assert.equal(cuandoDe('2026-09-25T23:30:00Z', AHORA), '26 de septiembre · 01:30');
  assert.equal(cuandoDe('2025-12-31T12:00:00Z', AHORA), '31 de diciembre de 2025 · 13:00');
  assert.equal(cuandoDe('no-es-una-fecha', AHORA), 'no-es-una-fecha');
});

test('los valores: euros a la española, fechas sin huso, sí/no, vacíos y textos largos', () => {
  assert.equal(formatearValor('importe', 12345.5), '12.345,50 €');
  assert.equal(formatearValor('importe', '85.00'), '85,00 €');
  assert.equal(formatearValor('fecha_fin', '2026-12-31'), '31 dic 2026');
  assert.equal(formatearValor('activo', false), 'No');
  assert.equal(formatearValor('estado', 'EN_CURSO'), 'En curso');
  assert.equal(formatearValor('concepto', null), '—');
  assert.equal(formatearValor('concepto', ''), '—');
  assert.equal(formatearValor('concepto', { a: 1 }), '—');
  assert.equal(formatearValor('concepto', 'x'.repeat(200)).length, 80);
});

test('una tabla que no conoce se describe sin inventar nada', () => {
  const d = describirEntrada(entrada({ tabla: 'tabla_futura', operacion: 'DELETE', cambios: null, despues: null, antes: { valor: 3 }, contexto: null }));
  assert.equal(d.titulo, 'Eliminó un registro de tabla futura');
  assert.deepEqual(d.lineas, [{ campo: 'Valor', antes: '3' }]);
  assert.equal(d.objeto, null);
});

test('las tablas que la pantalla sabe describir son las que vigila un trigger MÁS las de solo servidor', () => {
  // Si un trigger nuevo vigila otra tabla y aquí no se declara, su historial se
  // vería como «un registro de …»; y al revés, un filtro sin datos.
  const sql = readFileSync(new URL('../supabase/migrations/20260925152253_auditoria_estudio_dinero.sql', import.meta.url), 'utf8')
    .replace(/--.*$/gm, '');
  const vigiladas = [...sql.matchAll(/create trigger trg_auditar_\w+\s+after insert or update or delete on public\.(\w+)/g)].map(m => m[1]);
  assert.ok(vigiladas.length >= 4, 'el parser no ve los triggers de la migración');
  const soloServidor = Object.entries(TABLAS_AUDITADAS).filter(([, t]) => t.soloServidor).map(([id]) => id);
  assert.ok(soloServidor.length >= 1, 'no hay ninguna tabla solo de servidor declarada');
  for (const t of soloServidor) assert.ok(!vigiladas.includes(t), `${t} está marcada solo-servidor pero tiene trigger`);
  assert.deepEqual(Object.keys(TABLAS_AUDITADAS).sort(), [...vigiladas, ...soloServidor].sort());
});

test('se ofrece filtrar por todo lo que el libro recoge: ya no hay tabla que el panel escriba a sus espaldas', () => {
  // `ingresos_manuales` se escribía por una ruta de servidor sin actor y por eso no tenía filtro;
  // ahora esa ruta escribe su propia entrada. Si una tabla vuelve a escaparse, se marca `false`.
  const conFiltro = Object.entries(TABLAS_AUDITADAS).filter(([, t]) => t.desdeElPanel).map(([id]) => id).sort();
  assert.deepEqual(conFiltro, ['facturas', 'ingresos_manuales', 'penalizaciones', 'planes_tarifa', 'recibos', 'suscripciones', 'ventas_pos']);
});

test('el motivo se enseña en claro, y sin motivo no se inventa uno', () => {
  const baja = describirEntrada(entrada({ operacion: 'DELETE', cambios: null, despues: null, antes: { concepto: 'Clase suelta' }, motivo: 'DUPLICADO' }), { ahora: AHORA });
  assert.equal(baja.motivo, 'Está duplicado');
  assert.equal(describirEntrada(entrada(), { ahora: AHORA }).motivo, null);
  assert.equal(entrada({ motivo: '   ' }).motivo, null, 'un motivo en blanco no cuenta');
  // Un código que la pantalla aún no conoce se lee igualmente.
  assert.equal(describirEntrada(entrada({ motivo: 'CODIGO_NUEVO' })).motivo, 'Codigo nuevo');
});

test('una acción de servidor se cuenta por lo que hizo la persona, no como un cambio cualquiera', () => {
  const reembolso = describirEntrada(entrada({
    origen: 'servidor', cambios: ['reembolso_solicitado_en', 'reembolso_stripe_id'],
    antes: { reembolso_solicitado_en: null, reembolso_stripe_id: null },
    despues: { reembolso_solicitado_en: '2026-09-25T10:00:00Z', reembolso_stripe_id: 're_123' },
    contexto: { accion: 'REEMBOLSO_PEDIDO', concepto: 'Mensual Ilimitado — Jul 2026', importe: 85 },
  }), { ahora: AHORA });
  assert.equal(reembolso.titulo, 'Pidió un reembolso');
  assert.equal(reembolso.objeto, 'Mensual Ilimitado — Jul 2026');
  // El importe va PRIMERO: es lo que importa de un reembolso.
  assert.deepEqual(reembolso.lineas.map(l => l.campo), ['Importe', 'Reembolso pedido', 'Referencia del reembolso']);
  assert.equal(reembolso.lineas[0].despues, '85,00 €');
  // Sin acción conocida, el verbo genérico de siempre; un código desconocido no se esconde ni rompe.
  assert.equal(describirEntrada(entrada({ contexto: { accion: 'CODIGO_FUTURO' } })).titulo, 'Cambió un recibo');
  assert.equal(describirEntrada(entrada({ contexto: {} })).titulo, 'Cambió un recibo');
  // Y no duplica el importe si el propio cambio ya lo trae.
  const conImporte = describirEntrada(entrada({ contexto: { accion: 'REEMBOLSO_PEDIDO', importe: 85 } }), { ahora: AHORA });
  assert.equal(conImporte.lineas.filter(l => l.campo === 'Importe').length, 1);
});

test('un código de acción que es una clave heredada de los objetos no rompe la pantalla ni se toma por frase', () => {
  // Viene de un JSON de la base: `constructor` y `__proto__` responden en un objeto normal con algo que no es texto.
  for (const accion of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const d = describirEntrada(entrada({ contexto: { accion, importe: 10 } }), { ahora: AHORA });
    assert.equal(typeof d.titulo, 'string', accion);
    assert.equal(d.titulo, 'Cambió un recibo', accion);
    // Se trata como cualquier código desconocido, ni más ni menos.
    assert.deepEqual(d.lineas, describirEntrada(entrada({ contexto: { accion: 'CODIGO_FUTURO', importe: 10 } }), { ahora: AHORA }).lineas, accion);
  }
  assert.equal(fraseDeAccion('REEMBOLSO_PEDIDO'), 'Pidió un reembolso');
  assert.equal(fraseDeAccion(42), null);
});

test('un cobro lanzado con el método guardado se cuenta con su resultado y su origen, y sin jerga de Stripe', () => {
  const d = describirEntrada(entrada({
    origen: 'servidor', cambios: ['estado', 'fecha_cobro', 'metodo_cobro', 'stripe_payment_intent_id'],
    antes: { estado: 'PENDIENTE', fecha_cobro: null, metodo_cobro: null, stripe_payment_intent_id: null },
    despues: { estado: 'COBRADO', fecha_cobro: '2026-09-26', metodo_cobro: 'TARJETA', stripe_payment_intent_id: 'pi_123' },
    contexto: { accion: 'COBRO_LANZADO', concepto: 'Mensual Ilimitado — Sep 2026', importe: 85, resultado_cobro: 'succeeded', origen: 'COBRAR_ONLINE' },
  }), { ahora: AHORA });
  assert.equal(d.titulo, 'Lanzó el cobro de un recibo con el método de pago guardado');
  assert.equal(d.objeto, 'Mensual Ilimitado — Sep 2026');
  // El importe primero, y el resto con etiquetas de persona (no `stripe_payment_intent_id`).
  assert.equal(d.lineas[0].campo, 'Importe');
  assert.equal(d.lineas[0].despues, '85,00 €');
  const campos = d.lineas.map(l => l.campo);
  assert.ok(campos.includes('Referencia del cobro') && campos.includes('Estado'), campos.join(', '));
  assert.ok(!campos.some(c => /payment|intent|_/i.test(c)), `una etiqueta con jerga: ${campos.join(', ')}`);
  // Un adeudo SEPA en marcha se lee igual de bien.
  const sepa = describirEntrada(entrada({
    origen: 'servidor', cambios: ['estado', 'metodo_cobro', 'sepa_estado'],
    antes: { estado: 'PENDIENTE', metodo_cobro: null, sepa_estado: null },
    despues: { estado: 'EN_CURSO', metodo_cobro: 'SEPA', sepa_estado: 'processing' },
    contexto: { accion: 'COBRO_LANZADO', importe: 85, resultado_cobro: 'processing', origen: 'AUTOMATIZACIONES' },
  }), { ahora: AHORA });
  assert.ok(sepa.lineas.some(l => l.campo === 'Estado del adeudo SEPA'));
});

test('una devolución de la caja se cuenta con lo devuelto, y el canal se lee sin jerga', () => {
  const d = describirEntrada(entrada({
    origen: 'servidor', tabla: 'ventas_pos', cambios: ['importe_devuelto'],
    antes: { importe_devuelto: 0 }, despues: { importe_devuelto: 30 },
    contexto: { accion: 'DEVOLUCION_CAJA', concepto: 'Venta #000123', importe: 30, es_total: false, canal: 'tarjeta' },
  }), { ahora: AHORA });
  assert.equal(d.titulo, 'Devolvió una venta de la caja');
  assert.equal(d.objeto, 'Venta #000123');
  assert.equal(d.lineas[0].campo, 'Importe');
  assert.equal(d.lineas[0].despues, '30,00 €');
  assert.ok(d.lineas.some(l => l.campo === 'Importe devuelto'));
});

test('una rectificativa se cuenta por lo que hizo la persona y solo lleva importes', () => {
  const d = describirEntrada(entrada({
    origen: 'servidor', tabla: 'facturas', operacion: 'INSERT', cambios: [], antes: {},
    despues: { base_imponible: 70.25, cuota_iva: 14.75, total: 85, importe_rectificacion: 85 },
    contexto: { accion: 'FACTURA_RECTIFICATIVA_EMITIDA', concepto: 'Rectificativa R1', tipo_factura: 'R1' },
  }), { ahora: AHORA });
  assert.equal(d.titulo, 'Emitió una factura rectificativa');
  assert.equal(d.objeto, 'Rectificativa R1');
  assert.deepEqual(d.lineas.map(l => l.campo), ['Base imponible', 'IVA', 'Total', 'Importe rectificado']);
  assert.equal(TABLAS_AUDITADAS.facturas.uno, 'una factura');
});

test('toda acción que una ruta de servidor puede escribir tiene su frase', () => {
  // Las rutas usan estos códigos; si una escribe uno que no está aquí, el historial lo contaría como un cambio genérico.
  const escritos = new Set<string>();
  for (const ruta of [
    '../lib/billing/marcar-devuelto.ts', '../app/api/reembolsos/route.ts', '../app/api/ingresos-manuales/route.ts',
    '../app/api/devoluciones/revertir/route.ts', '../app/api/penalizaciones/aprobar/route.ts',
    '../lib/auditoria/cobro-manual.ts', '../app/api/facturas/rectificar/route.ts', '../app/api/pos/devolucion/route.ts',
  ]) {
    const fuente = readFileSync(new URL(ruta, import.meta.url), 'utf8');
    // Solo lo que va dentro de `contexto` (o del `anotar({…})` de la ruta de penalizaciones, que lo arma): las
    // respuestas JSON de estas rutas también dicen `accion: 'DESCARTADA'`.
    for (const m of fuente.matchAll(/(?:contexto:\s*|anotar\(\s*)\{\s*accion:\s*'([A-Z_]+)'/g)) escritos.add(m[1]);
  }
  assert.ok(escritos.size >= 10, `solo se ven ${escritos.size} acciones en las rutas: ¿se han instrumentado?`);
  const sinFrase = [...escritos].filter(a => !(a in ACCIONES));
  assert.deepEqual(sinFrase, [], `acciones sin frase: ${sinFrase.join(', ')}`);
});
