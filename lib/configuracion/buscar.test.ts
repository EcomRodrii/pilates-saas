import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AJUSTES_EN_BUSCADOR_GLOBAL, ajustesParaBuscadorGlobal, buscarAjustes, normalizar, sinTareasRepetidas } from './buscar.ts';
import { buscarTareas } from '../tareas.ts';
import { hrefDeLugar, resolverHref, seccionesVisibles } from './destino.ts';
import { FILAS_EXTERNAS, SECCIONES, seccionDeTarjeta, type TarjetaId } from './secciones.ts';

// El buscador del inicio de Configuración. Lo que se fija: que las búsquedas
// de verdad («IVA», «lista de espera», «nif», sin tildes) llevan a su tarjeta, y
// que cada resultado abre una sección y una tarjeta que existen.

const ids = (consulta: string, opciones?: Parameters<typeof buscarAjustes>[1]) =>
  buscarAjustes(consulta, opciones).map(r => r.id);

test('«IVA» lleva a los datos fiscales, en Cobros y facturas, y a nada más', () => {
  const [primero] = buscarAjustes('IVA');
  assert.deepEqual(
    { id: primero.id, seccion: primero.seccion, ancla: primero.ancla, donde: primero.donde },
    { id: 'tarjeta-datos-fiscales', seccion: 'cobros', ancla: 'datos-fiscales', donde: 'Cobros y facturas' },
  );
  // Por dentro de otra palabra no cuenta: «privacidad» y «Motivación» llevan «iva».
  assert.deepEqual(ids('iva'), ['tarjeta-datos-fiscales']);
  // Por el principio sí: se encuentra mientras se escribe.
  assert.ok(ids('canc').includes('tarjeta-cancelar-y-recuperar'));
});

test('«lista de espera» lleva a su tarjeta, y las palabras sueltas también cuentan', () => {
  assert.ok(ids('lista de espera').includes('tarjeta-lista-de-espera'));
  assert.equal(buscarAjustes('lista de espera').find(r => r.id === 'tarjeta-lista-de-espera')!.seccion, 'reservas');
  assert.ok(ids('nif').includes('tarjeta-datos-fiscales'));
  assert.ok(ids('no viene').includes('tarjeta-si-cancela-tarde-o-no-viene'));
  assert.ok(ids('logo').includes('tarjeta-logo-y-favicon'));
});

test('sin tildes ni mayúsculas: «cancelacion» encuentra «cancelación»', () => {
  assert.equal(normalizar('  Cancelación   ÁGIL '), 'cancelacion agil');
  assert.ok(ids('cancelacion').includes('tarjeta-cancelar-y-recuperar'));
  assert.ok(ids('MOTIVACION').includes('seccion-motivacion'));
});

test('vacío no busca, y lo que no existe no devuelve nada', () => {
  assert.deepEqual(buscarAjustes(''), []);
  assert.deepEqual(buscarAjustes('    '), []);
  assert.deepEqual(buscarAjustes('zzz-no-existe'), []);
  // Todas las palabras tienen que estar: «iva salas» no es nada.
  assert.deepEqual(buscarAjustes('iva salas'), []);
});

test('las tarjetas que el estudio no tiene no salen', () => {
  assert.equal(ids('sedes').includes('tarjeta-sedes'), false);
  assert.ok(ids('sedes', { haySedes: true }).includes('tarjeta-sedes'));
  // Por sus sinónimos también: el buscador no espera a que «Mi estudio» cargue las sedes.
  assert.ok(ids('cambiar de sede', { haySedes: true }).includes('tarjeta-sedes'));
  assert.ok(ids('centros', { haySedes: true }).includes('tarjeta-sedes'));
  assert.equal(ids('catálogo').includes('tarjeta-catalogo-de-la-cadena'), false);
  assert.ok(ids('catálogo', { esCadena: true }).includes('tarjeta-catalogo-de-la-cadena'));
});

test('«avisos», «color» y «plan» llevan a lo que se trajo dentro de Configuración', () => {
  assert.ok(ids('avisos').includes('seccion-avisos'));
  assert.ok(ids('notificaciones').includes('seccion-avisos'));
  assert.ok(ids('color').includes('tarjeta-color-de-marca'));
  assert.equal(buscarAjustes('color').find(r => r.id === 'tarjeta-color-de-marca')!.seccion, 'marca');
  assert.ok(ids('modo oscuro').includes('tarjeta-claro-u-oscuro'));
  // «Plan de Tentare» no es una sección: lleva a /suscripcion, desde «Tu cuenta».
  const plan = buscarAjustes('plan').find(r => r.id === 'externa-plan')!;
  assert.deepEqual(
    { seccion: plan.seccion, href: plan.href, donde: plan.donde },
    { seccion: null, href: '/suscripcion', donde: 'Tu cuenta' },
  );
  assert.ok(ids('suscripcion').includes('externa-plan'));
});

test('solo busca en las secciones que se le pasan', () => {
  const soloCobros = SECCIONES.filter(s => s.id === 'cobros');
  assert.deepEqual(ids('lista de espera', { secciones: soloCobros }), []);
});

// El buscador del inicio y el de ⌘K comparten `seccionesVisibles`, que recorta
// también las TARJETAS: a la gerencia no puede salirle el IVA, que está en una
// sección que no abre, ni el contacto, que está en una que sí.
test('la gerencia solo encuentra lo suyo, ni una tarjeta más', () => {
  const gerencia = seccionesVisibles('MANAGER');
  assert.deepEqual(ids('horario', { secciones: gerencia }), ['tarjeta-horario', 'tarjeta-horario-de-citas']);
  assert.ok(ids('salas', { secciones: gerencia }).includes('tarjeta-salas'));
  assert.ok(ids('reformer', { secciones: gerencia }).includes('tarjeta-tipos-de-clase'));
  for (const consulta of ['iva', 'nif', 'teléfono', 'logo', 'stripe', 'servicios de cita']) {
    assert.deepEqual(ids(consulta, { secciones: gerencia }), [], consulta);
  }
});

test('⌘K, gerencia: sus ajustes sí, el dinero y la cuenta no', () => {
  const GERENCIA = { rol: 'MANAGER' } as const;
  const horario = ajustesParaBuscadorGlobal('horario', GERENCIA).find(a => a.id === 'tarjeta-horario')!;
  assert.deepEqual(
    { donde: horario.donde, href: horario.href },
    { donde: 'Mi estudio', href: '/configuracion?tab=estudio#horario' },
  );
  assert.deepEqual(ajustesParaBuscadorGlobal('IVA', GERENCIA), []);
  // «Plan de Tentare» y «Mi cuenta» no salen en ⌘K por aquí para nadie (van por
  // su entrada del menú), y recepción no abre Configuración: ni un resultado.
  assert.deepEqual(ajustesParaBuscadorGlobal('horario', { rol: 'RECEPCION' }), []);
});

test('cada resultado abre una sección y una tarjeta que existen', () => {
  for (const consulta of ['a', 'e', 'o', 'iva', 'lista de espera', 'horario']) {
    for (const r of buscarAjustes(consulta, { haySedes: true, esCadena: true })) {
      if (r.seccion === null) {
        assert.ok(Object.values(FILAS_EXTERNAS).some(f => f.href === r.href), r.id);
        continue;
      }
      const esperado = { tab: r.seccion, ...(r.abrir ? { abrir: r.abrir } : {}), ...(r.ancla ? { ancla: r.ancla } : {}) };
      assert.deepEqual(resolverHref(hrefDeLugar({ tab: r.seccion, abrir: r.abrir, ancla: r.ancla })), esperado, r.id);
      if (r.ancla) assert.equal(seccionDeTarjeta(r.ancla as TarjetaId), r.seccion, r.id);
    }
  }
  // Ids únicos: son los id de los enlaces.
  const todos = ids('a', { haySedes: true, esCadena: true });
  assert.equal(new Set(todos).size, todos.length);
});

// ── El grupo «Ajustes» de ⌘K ────────────────────────────────────────────────

const PROPIETARIA = { rol: 'PROPIETARIO' } as const;

test('⌘K: «IVA» da la tarjeta, su sección y el enlace a su ancla', () => {
  assert.deepEqual(ajustesParaBuscadorGlobal('IVA', PROPIETARIA), [{
    id: 'tarjeta-datos-fiscales',
    titulo: 'Datos fiscales e IVA',
    donde: 'Cobros y facturas',
    href: '/configuracion?tab=cobros#datos-fiscales',
  }]);
  const espera = ajustesParaBuscadorGlobal('lista de espera', PROPIETARIA).find(a => a.id === 'tarjeta-lista-de-espera')!;
  assert.deepEqual(
    { donde: espera.donde, href: espera.href },
    { donde: 'Cómo reservan mis alumnas', href: '/configuracion?tab=reservas#lista-de-espera' },
  );
  // Una sección entera lleva a la sección, y dice que es de Configuración.
  const motivacion = ajustesParaBuscadorGlobal('motivación', PROPIETARIA).find(a => a.id === 'seccion-motivacion')!;
  assert.deepEqual(
    { donde: motivacion.donde, href: motivacion.href },
    { donde: 'Configuración', href: '/configuracion?tab=motivacion' },
  );
  // Lo que vive en una herramienta abre la herramienta, no solo su sección.
  const correos = ajustesParaBuscadorGlobal('recordatorio', PROPIETARIA).find(a => a.id === 'tarjeta-correos-automaticos')!;
  assert.match(correos.href, /^\/configuracion\?tab=comunicacion&abrir=correos-automaticos(#|$)/);
});

test('⌘K: como mucho cinco, y vacío no busca', () => {
  // «e» casa con muchas más de cinco en el inicio: el tope se ejerce de verdad.
  assert.ok(buscarAjustes('e').length > MAX_AJUSTES_EN_BUSCADOR_GLOBAL);
  assert.equal(ajustesParaBuscadorGlobal('e', PROPIETARIA).length, MAX_AJUSTES_EN_BUSCADOR_GLOBAL);
  assert.deepEqual(ajustesParaBuscadorGlobal('', PROPIETARIA), []);
  assert.deepEqual(ajustesParaBuscadorGlobal('   ', PROPIETARIA), []);
});

// ⚠️ MANAGER ya NO está en esta lista: desde el 16-sep entra en Configuración
// para la operación de su sede, así que sí ve ajustes — los suyos, y solo esos,
// que es lo que fija el test «⌘K, gerencia» de arriba. Un rol desconocido sigue
// sin ver nada: la lista es blanca, y lo que no está no entra.
test('⌘K: quien no entra en Configuración no ve ningún ajuste', () => {
  for (const rol of ['RECEPCION', 'INSTRUCTOR', 'ROL-QUE-NO-EXISTE']) {
    assert.deepEqual(ajustesParaBuscadorGlobal('IVA', { rol }), [], rol);
    assert.deepEqual(ajustesParaBuscadorGlobal('e', { rol }), [], rol);
  }
  // Y a la gerencia, «IVA» tampoco: está en una sección que no abre.
  assert.deepEqual(ajustesParaBuscadorGlobal('IVA', { rol: 'MANAGER' }), []);
});

test('⌘K: sin filas de otra pantalla, y cada enlace abre la tarjeta que dice', () => {
  // «Plan de Tentare» ya lo encuentra ⌘K por «Suscripción», su entrada del menú.
  assert.deepEqual(ajustesParaBuscadorGlobal('suscripción', PROPIETARIA), []);
  for (const consulta of ['a', 'e', 'o', 'iva', 'horario', 'sedes']) {
    for (const a of ajustesParaBuscadorGlobal(consulta, { ...PROPIETARIA, haySedes: true, esCadena: true })) {
      const destino = resolverHref(a.href);
      assert.ok(!('redirect' in destino) && destino.tab !== null, a.id);
      // Una tarjeta abre su ancla; la tarjeta que ES una herramienta abre su pantalla.
      if (a.id.startsWith('tarjeta-')) {
        const id = a.id.slice('tarjeta-'.length);
        assert.ok(!('redirect' in destino) && (destino.ancla === id || destino.abrir === id), a.id);
      }
    }
  }
  // Las tarjetas que el estudio no tiene tampoco salen en ⌘K.
  assert.equal(ajustesParaBuscadorGlobal('sedes', PROPIETARIA).some(a => a.id === 'tarjeta-sedes'), false);
  assert.ok(ajustesParaBuscadorGlobal('sedes', { ...PROPIETARIA, haySedes: true }).some(a => a.id === 'tarjeta-sedes'));
});

test('⌘K: una tarea que lleva a la misma tarjeta que un ajuste no sale dos veces', () => {
  const ajustes = ajustesParaBuscadorGlobal('iva', PROPIETARIA);
  const tareas = buscarTareas('iva', 5);
  // La premisa: hoy «IVA» da las dos filas al mismo sitio.
  assert.ok(tareas.some(t => t.id === 'datos-fiscales'));
  const quedan = sinTareasRepetidas(tareas, ajustes);
  assert.equal(quedan.some(t => t.id === 'datos-fiscales'), false);
  // Solo sobra esa: las demás tareas siguen, en su orden.
  assert.deepEqual(quedan.map(t => t.id), tareas.filter(t => t.id !== 'datos-fiscales').map(t => t.id));

  const conHref = (href: string) => ({ href });
  // Otra ancla de la misma sección es otro sitio.
  assert.equal(sinTareasRepetidas([conHref('/configuracion?tab=cobros#integracion-stripe')], ajustes).length, 1);
  // Un `?tab=` viejo cuenta como la sección que abre hoy.
  assert.deepEqual(
    sinTareasRepetidas([conHref('/configuracion?tab=clases-salas')], [conHref('/configuracion?tab=clases')]),
    [],
  );
  // Fuera de Configuración, y sin ajustes, no se quita nada.
  assert.equal(sinTareasRepetidas([conHref('/clientas?nuevo=1')], ajustes).length, 1);
  assert.deepEqual(sinTareasRepetidas(tareas, []).map(t => t.id), tareas.map(t => t.id));
});
