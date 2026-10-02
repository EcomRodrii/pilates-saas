import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// PR4 del dueño único de «recibo cobrado»: COBRADO lo escribe el servidor.
//
// Hay DOS cerraduras y este fichero fija las dos:
//  · la de la base de datos (migración 20261001120000, trigger
//    `trg_recibos_cobrado_solo_servidor`), que es la real: se comprueba contra una
//    base de datos de verdad en `supabase/tests/rls-recibos-cobrado-solo-servidor.test.ts`
//    (aquí solo que la migración dice lo que tiene que decir);
//  · la del navegador, que dice «no» antes de ir a la red, y sobre todo que NINGÚN flujo de
//    pantalla siga escribiendo un recibo cobrado: el alta de socia con cobro, «Nueva factura» y
//    el cobro de una cita crean el recibo pendiente y lo cobra `cobrarEnServidor`.
//
// Son pruebas sobre el texto del código (mismo recurso que otros tests de `app/api/` y del
// contexto): ni el contexto ni la ruta cargan bajo `node --test` (alias `@/`, React).

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function cuerpoDe(fuente: string, inicio: string): string {
  const i = fuente.indexOf(inicio);
  assert.ok(i >= 0, `no se encontró ${inicio}`);
  // Hasta la siguiente función del mismo nivel (con o sin `async`/`export`).
  const resto = fuente.slice(i + inicio.length);
  const siguiente = resto.search(/\n(?: {2})?(?:export )?(?:async )?function /);
  return fuente.slice(i, siguiente >= 0 ? i + inicio.length + siguiente : undefined);
}

test('la migración cierra las cuatro cosas, con la guardia de servidor, mensajes con el nombre del trigger y sin EXECUTE para anon/authenticated', () => {
  const dir = join(raiz, 'supabase', 'migrations');
  const nombre = readdirSync(dir).find(n => n.endsWith('_recibos_cobrado_solo_servidor.sql'));
  assert.ok(nombre, 'no existe la migración del trigger de recibos');
  const sql = sinComentarios(readFileSync(join(dir, nombre), 'utf8').replace(/^\s*--.*$/gm, ''));

  assert.match(sql, /create trigger trg_recibos_cobrado_solo_servidor\s+before insert or update on public\.recibos/);
  // Como los otros triggers de guardia «solo servidor»: INVOKER con `search_path` vacío (no lee ninguna tabla).
  assert.match(sql, /security invoker\s+set search_path = ''/);
  assert.doesNotMatch(sql, /security definer/);
  assert.match(sql, /if public\.es_llamada_servicio\(\) then\s+return new;/, '«sin sesión» no es «servidor»: tiene que usar es_llamada_servicio()');
  // 1. nacer cobrado · 2. pasar a cobrado · 3. salir de cobrado · 4. el dinero de uno cobrado.
  assert.match(sql, /tg_op = 'INSERT'[\s\S]*new\.estado = 'COBRADO'/);
  assert.match(sql, /new\.estado = 'COBRADO' or old\.estado = 'COBRADO'/);
  for (const col of ['importe', 'metodo_cobro', 'fecha_cobro', 'stripe_payment_intent_id']) {
    assert.match(sql, new RegExp(`new\\.${col} is distinct from old\\.${col}`), `un recibo cobrado podría cambiar ${col}`);
  }
  // Los rechazos son 42501 (permiso), como una política de RLS: nacer cobrado, cambiar el estado
  // cobrado (entrar o salir comparten mensaje) y tocar el dinero de uno cobrado. Los `raise` de la
  // verificación final (`la función…`, `el trigger…`) son de la propia migración y no cuentan.
  const rechazos = (sql.match(/raise exception/g) ?? []).length - (sql.match(/raise exception '(la función|el trigger)/g) ?? []).length;
  assert.equal(rechazos, 3);
  assert.equal((sql.match(/errcode = '42501'/g) ?? []).length, 3, 'los rechazos tienen que ser 42501');
  // `lib/errores.ts` los reconoce por el nombre del trigger: sin él, un 42501 sale como «vuelve a entrar».
  assert.equal((sql.match(/raise exception 'recibos_cobrado_solo_servidor: /g) ?? []).length, 3, 'los mensajes tienen que llevar el nombre del trigger delante');
  assert.match(leer('lib/errores.ts'), /recibos_cobrado_solo_servidor/, 'lib/errores.ts no reconoce el mensaje del trigger');
  assert.match(sql, /revoke all on function public\.recibos_cobrado_solo_servidor\(\) from public, anon, authenticated;/);
});

test('el navegador dice no antes de ir a la red: dbInsertRecibo y dbUpdateRecibo rechazan COBRADO', () => {
  const datos = sinComentarios(leer('lib/supabase-data.ts'));
  const insertar = cuerpoDe(datos, 'export async function dbInsertRecibo(');
  assert.match(insertar, /rec\.estado === 'COBRADO'[\s\S]{0,200}falloEscritura/);
  assert.ok(insertar.indexOf("rec.estado === 'COBRADO'") < insertar.indexOf(".from('recibos').insert("), 'la guardia tiene que ir ANTES de escribir');
  const actualizar = cuerpoDe(datos, 'export async function dbUpdateRecibo(');
  assert.match(actualizar, /changes\.estado === 'COBRADO'[\s\S]{0,200}falloEscritura/);
  assert.ok(actualizar.indexOf("changes.estado === 'COBRADO'") < actualizar.indexOf(".from('recibos').update("), 'la guardia tiene que ir ANTES de escribir');
});

test('ningún flujo del contexto crea un recibo ya cobrado', () => {
  const ctx = sinComentarios(leer('lib/studio-context.tsx'));
  // Un recibo construido para insertar: `estado: 'COBRADO',` (con coma, en un literal) o decidido
  // por una condición (`cobrado ? 'COBRADO' : 'PENDIENTE'`). El `estado: 'COBRADO' as const` de
  // `setRecibos` es el reflejo de pantalla DESPUÉS de que el servidor confirmara, y no cuenta.
  assert.doesNotMatch(ctx, /estado: 'COBRADO',/, 'un literal de recibo cobrado: ¿se crea cobrado desde el navegador?');
  assert.doesNotMatch(ctx, /\? 'COBRADO' : 'PENDIENTE'/, 'el estado de un recibo nuevo no se decide en el navegador');
  assert.doesNotMatch(ctx, /addVentaPOS|dbInsertVentaPOS/, 'el escritor de ventas del navegador no tenía ningún llamador y creaba recibos cobrados');
});

test('el alta de socia con cobro crea recibos pendientes y los cobra por el servidor, sin factura local', () => {
  const ctx = sinComentarios(leer('lib/studio-context.tsx'));
  const alta = cuerpoDe(ctx, 'async function addSocio(');
  assert.match(alta, /estado: 'PENDIENTE'/);
  assert.match(alta, /recibosACobrar\.push\(reciboMatricula\.id\)/, 'la matrícula tiene que cobrarse con el alta');
  assert.match(alta, /if \(cobrado\) \{[\s\S]*cobrarEnServidor\(recibosACobrar, cobroAlta\.metodo\)/);
  // Lo que antes hacía el navegador a mano: factura local + sellado. Ahora lo sella `confirmarCobro`.
  assert.doesNotMatch(alta, /buildFactura|sellarFacturaYActualizar/, 'el alta sigue sellando facturas desde el navegador');
  // El recibo existe ANTES de cobrarlo, y si el servidor no lo confirma se AVISA (no se da por cobrado).
  assert.ok(alta.indexOf('dbInsertRecibo(reciboAlta)') < alta.indexOf('cobrarEnServidor(recibosACobrar'));
  assert.match(alta, /esCobroConfirmado\(d\)[\s\S]{0,600}avisos\.push/);
  // Cobrado pero con la factura sin sellar: antes lo avisaba `sellarFacturaYActualizar`, ahora hay que decirlo.
  assert.match(alta, /d\.resultado === 'aplicada' && !d\.selladoOk[\s\S]{0,300}avisos\.push/);
  // Los avisos se DEVUELVEN (la pantalla los enseña juntos): ni toasts que se pisan ni una clave repetida.
  assert.doesNotMatch(alta, /setDbError/);
  assert.match(alta, /\.\.\.\(avisos\.length > 0 \? \{ avisos \} : \{\}\)/);
});

test('«Nueva factura» y el cobro de una cita crean el recibo pendiente, lo cobra el servidor y distinguen los cuatro desenlaces', () => {
  const ctx = sinComentarios(leer('lib/studio-context.tsx'));
  const directa = cuerpoDe(ctx, 'async function crearFacturaDirecta(');
  assert.match(directa, /estado: 'PENDIENTE'/);
  // `cobrarEnServidor([rec.id], …)`: con o sin el método del mostrador.
  const cobro = directa.search(/cobrarEnServidor\(\[rec\.id\]/);
  assert.ok(cobro > 0 && directa.indexOf('dbInsertRecibo(rec)') < cobro);
  assert.match(directa, /cobroSinConfirmar: true/, 'si el servidor no confirma, el recibo existe y no se puede reintentar');
  assert.match(directa, /cobroRegistrado: true/, 'si el dinero entró y falló la factura, tampoco se reintenta');
  assert.doesNotMatch(directa, /buildFactura|sellarFacturaYActualizar|construirFacturaCobro/, 'sigue sellando desde el navegador');

  // Los que lo llaman tratan `cobroSinConfirmar` como «el recibo ya existe».
  for (const [ruta, que] of [
    ['components/cobros/panel-pendientes.tsx', 'Nueva factura'],
    ['app/(dashboard)/citas/page.tsx', 'cobro de una cita'],
  ] as const) {
    const f = sinComentarios(leer(ruta));
    assert.match(f, /'cobroSinConfirmar' in res/, `${que}: no distingue «el recibo existe pero no consta cobrado»`);
  }
  // Y la cita no se marca pagada con un cobro sin confirmar.
  const citas = sinComentarios(leer('app/(dashboard)/citas/page.tsx'));
  assert.ok(citas.indexOf("'cobroSinConfirmar' in res") < citas.indexOf('updateCita(cita.id, { pagada: true })'));
});

test('la clase suelta del Calendario la vende el servidor al reservar, y se cobra después por el servidor', () => {
  const cal = sinComentarios(leer('app/(dashboard)/calendario/page.tsx'));
  // Ni recibo ni cobro desde el navegador: la venta (la PUNTUAL y su recibo
  // pendiente) la hace `crearReservaMostrador`, para que le valga la política
  // de cancelación como a un bono.
  assert.doesNotMatch(cal, /crearFacturaDirecta|addRecibo\(/, 'el navegador vuelve a crear el recibo de la clase suelta');
  const cobrar = cuerpoDe(cal, 'async function cobrarSueltaYAnadir(');
  const reserva = cobrar.indexOf('claseSuelta: { importeEsperado: precio }');
  const cobro = cobrar.indexOf('marcarCobrado(reserva.venta.reciboId, metodo)');
  assert.ok(reserva > 0 && cobro > reserva, 'primero la plaza (con la venta) y después el cobro, con el método');
});

test('el alta ya no ofrece «Domiciliación» como método de un cobro ya hecho (un adeudo lo confirma el banco)', () => {
  const pagina = leer('app/(dashboard)/clientas/page.tsx');
  assert.ok(!pagina.includes('<option value="SEPA">'), 'el alta vuelve a ofrecer SEPA como «ya pagado»: la ruta de cobro lo rechaza');
  const tipos = leer('lib/types.ts');
  assert.match(tipos, /metodo: Exclude<MetodoCobro, 'SEPA'>/);
});
