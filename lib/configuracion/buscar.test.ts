import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscarAjustes, normalizar } from './buscar.ts';
import { hrefDeSeccion, resolverHref } from './destino.ts';
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

test('cada resultado abre una sección y una tarjeta que existen', () => {
  for (const consulta of ['a', 'e', 'o', 'iva', 'lista de espera', 'horario']) {
    for (const r of buscarAjustes(consulta, { haySedes: true, esCadena: true })) {
      if (r.seccion === null) {
        assert.ok(Object.values(FILAS_EXTERNAS).some(f => f.href === r.href), r.id);
        continue;
      }
      const esperado = r.ancla ? { tab: r.seccion, ancla: r.ancla } : { tab: r.seccion };
      assert.deepEqual(resolverHref(hrefDeSeccion(r.seccion, r.ancla)), esperado, r.id);
      if (r.ancla) assert.equal(seccionDeTarjeta(r.ancla as TarjetaId), r.seccion, r.id);
    }
  }
  // Ids únicos: son los id de los enlaces.
  const todos = ids('a', { haySedes: true, esCadena: true });
  assert.equal(new Set(todos).size, todos.length);
});
