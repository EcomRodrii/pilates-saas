import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCIONES } from '../auditoria-estudio.ts';

// Las rutas de servidor escriben con service-role: el trigger del libro no las ve y
// cada una tiene que anotar su propia entrada. Esto no se puede probar sin un servidor
// real, así que se fija en el código lo que NO puede cambiar sin que alguien lo decida:
//   · el actor es la SESIÓN ENTERA (`verificarSesionStaff`: persona, sede y rol juntos), nunca algo que
//     venga en el cuerpo;
//   · cada ruta anota lo que hizo con un código de `ACCIONES`;
//   · en un reembolso, el registro va DESPUÉS de que salga el dinero y ANTES de la marca
//     del recibo (que es de mejor esfuerzo y puede fallar).

const leer = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const RUTAS: Array<{ ruta: string; acciones: string[] }> = [
  { ruta: 'app/api/reembolsos/route.ts', acciones: ['REEMBOLSO_PEDIDO'] },
  { ruta: 'app/api/cobros/marcar-devuelto/route.ts', acciones: [] }, // la anota lib/billing/marcar-devuelto.ts
  { ruta: 'app/api/ingresos-manuales/route.ts', acciones: ['INGRESO_MANUAL_CREADO', 'INGRESO_MANUAL_EDITADO', 'INGRESO_MANUAL_ELIMINADO'] },
  { ruta: 'app/api/devoluciones/revertir/route.ts', acciones: ['ENTREGA_REVERTIDA'] },
  { ruta: 'app/api/penalizaciones/aprobar/route.ts', acciones: ['PENALIZACION_APROBADA', 'PENALIZACION_CORREGIDA', 'PENALIZACION_SIN_CONSENTIMIENTO'] },
];

test('cada ruta usa la sesión ENTERA como actor y nunca lo que diga el cuerpo', () => {
  for (const { ruta, acciones } of RUTAS) {
    const fuente = leer(ruta);
    // `marcar-devuelto` pasa la persona a la librería (que ya trae la sede de su propia lectura).
    if (acciones.length > 0) {
      // Todas las llamadas al registro (directas, o a través del `anotar` de la ruta) llevan `sesion,` a secas.
      assert.match(fuente, /registrarAuditoriaServidor\(admin,\s*\{\s*sesion,/, `${ruta}: no le pasa la sesión entera`);
      assert.doesNotMatch(fuente, /registrarAuditoriaServidor\(admin,\s*\{\s*(?![\s]|sesion,)/, `${ruta}: una llamada al registro no empieza por la sesión`);
    }
    assert.doesNotMatch(fuente, /sesion:\s*\{[^}]*\bbody\b/, `${ruta}: la sesión sale del cuerpo`);
    assert.doesNotMatch(fuente, /(actor|sesion):\s*\{[^}]*\bbody\b/, `${ruta}: el actor sale del cuerpo`);
    assert.doesNotMatch(fuente, /userId:\s*body\./, `${ruta}: el userId sale del cuerpo`);
  }
  assert.match(leer('app/api/cobros/marcar-devuelto/route.ts'), /actor:\s*\{\s*userId:\s*sesion\.userId,\s*rol:\s*sesion\.rol\s*\}/);
});

test('cada ruta anota lo que hizo con un código conocido de ACCIONES', () => {
  for (const { ruta, acciones } of RUTAS) {
    const fuente = leer(ruta);
    for (const a of acciones) {
      assert.match(fuente, new RegExp(`accion:\\s*'${a}'`), `${ruta} no anota ${a}`);
      assert.ok(a in ACCIONES, `${a} no tiene frase en ACCIONES`);
    }
    if (acciones.length > 0) assert.match(fuente, /registrarAuditoriaServidor/, `${ruta} no llama al registro`);
  }
  // «Marcar devuelto» lo anota la librería, con el actor que le pasa la ruta.
  assert.match(leer('lib/billing/marcar-devuelto.ts'), /accion:\s*'RECIBO_MARCADO_DEVUELTO'/);
  assert.ok('RECIBO_MARCADO_DEVUELTO' in ACCIONES);
});

test('reembolso: se anota DESPUÉS de que salga el dinero y ANTES de marcar el recibo', () => {
  const f = leer('app/api/reembolsos/route.ts');
  const salidaDelDinero = f.indexOf('stripe.refunds.create');
  const anotacion = f.indexOf('registrarAuditoriaServidor(admin');
  const marcaDelRecibo = f.indexOf("await admin.from('recibos').update({");
  assert.ok(salidaDelDinero > 0 && anotacion > 0 && marcaDelRecibo > 0, 'no se encuentran los tres hitos');
  assert.ok(salidaDelDinero < anotacion, 'se anota un reembolso que aún no ha ocurrido');
  assert.ok(anotacion < marcaDelRecibo, 'si la marca del recibo falla, el reembolso quedaría sin rastro');
  // Y el instante de la marca es el mismo que el del libro (un solo `pedidoEn`).
  assert.equal((f.match(/const pedidoEn = /g) ?? []).length, 1);
  assert.match(f, /reembolso_solicitado_en: pedidoEn/);
  // Un doble clic no anota dos veces el mismo reembolso: la comparación ahorra el intento en un reintento y
  // el índice único de la migración rechaza el duplicado cuando los dos clics llegan a la vez.
  assert.match(f, /if \(recibo\.reembolso_stripe_id !== refund\.id\) await registrarAuditoriaServidor/);
  const sql = leer('supabase/migrations/20260925194043_auditoria_escritura_de_servidor.sql').replace(/--.*$/gm, '');
  assert.match(sql, /create unique index if not exists auditoria_estudio_reembolso_unico_idx[\s\S]*despues\s*->>\s*'reembolso_stripe_id'[\s\S]*contexto\s*->>\s*'accion'\s*=\s*'REEMBOLSO_PEDIDO'/);
});

test('ingresos manuales: al editar y al borrar se lee el valor de ANTES (sin él el libro no sabría qué había)', () => {
  const f = leer('app/api/ingresos-manuales/route.ts');
  const trozo = (desde: string, hasta: string) => f.slice(f.indexOf(desde), f.indexOf(hasta, f.indexOf(desde)));
  const editar = trozo('export async function PATCH', 'export async function DELETE');
  assert.ok(editar.indexOf("select('*')") < editar.indexOf('.update(s)'), 'PATCH: el valor anterior se lee después del UPDATE');
  const borrar = f.slice(f.indexOf('export async function DELETE'));
  assert.ok(borrar.indexOf("select('*')") < borrar.indexOf('.delete()'), 'DELETE: el valor anterior se lee después del borrado');
});

test('penalización: se anota lo que pasó de verdad, no lo que el plan pretendía, y un cobro aprobado siempre deja rastro', () => {
  const f = leer('app/api/penalizaciones/aprobar/route.ts');
  assert.match(f, /let estadoEscrito: string \| null = null;/);
  assert.match(f, /estadoEscrito = plan\.escritura\.estado;/);
  // Si otro proceso (el webhook de Stripe) la cerró un instante antes, el cargo lo aprobó una persona igualmente.
  assert.match(f, /estadoObservado = estadoActual;/);
  assert.match(f, /const estadoFinal = estadoEscrito \?\? estadoObservado;/);
  // Las tres salidas que escriben estado por una acción de la persona dejan entrada.
  assert.match(f, /anotar\(\{ accion: 'PENALIZACION_CORREGIDA' \}, estadoEscrito\)/);
  assert.match(f, /anotar\(\{ accion: 'PENALIZACION_SIN_CONSENTIMIENTO'/);
  assert.match(f, /accion: 'PENALIZACION_APROBADA'/);
  // Y si no se sabe cómo quedó, no es un silencio: se avisa.
  assert.match(f, /avisarAuditoria\('AUDITORIA_PENALIZACION_SIN_ESTADO_FINAL'/);
});

test('ingresos manuales: una lectura previa que falla se AVISA, y solo se anota un borrado que esta petición hizo', () => {
  const f = leer('app/api/ingresos-manuales/route.ts');
  assert.equal((f.match(/avisarAuditoria\('AUDITORIA_LECTURA_PREVIA_FALLO'/g) ?? []).length, 2, 'PATCH y DELETE avisan');
  assert.match(f, /\.delete\(\)\.eq\('id', id\)\.eq\('studio_id', sesion\.studioId\)\.select\('id'\)/);
  assert.match(f, /if \(previo && borradas\?\.length\)/);
});
