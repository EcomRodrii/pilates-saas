import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirAlertas, ordenarAlertas, tarjetaCaducaAntes, type EntradaExito, type Alerta } from './reglas.ts';

const AHORA = new Date('2026-11-17T10:00:00Z');
const VACIA: EntradaExito = { contrataciones: [], impagos: [], bajas: [], renovaciones: [], visitas: [], sinUso: [], limites: [], sedes: [], asistente: [], complementos: [] };
const alertas = (e: Partial<EntradaExito>) => construirAlertas({ ...VACIA, ...e }, AHORA);
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();

test('sin datos no se inventa ninguna alerta', () => {
  assert.deepEqual(alertas({}), []);
});

test('una contratación empezada hace menos de 3 días todavía no es alerta; con 3 o más, sí', () => {
  const c = (dias: number) => ({ estudioId: 's1', nombre: 'Casa Pilates', clienteCreadoEn: hace(dias), visitasDias14d: 2 });
  assert.equal(alertas({ contrataciones: [c(2)] }).length, 0);
  const [a] = alertas({ contrataciones: [c(3)] });
  assert.equal(a.tipo, 'contratacion-sin-terminar');
  assert.equal(a.severidad, 'media');
  assert.match(a.titulo, /hace 3 días/);
  assert.ok(a.contexto.some((l) => /2 días distintos/.test(l)));
  assert.equal(alertas({ contrataciones: [c(8)] })[0].severidad, 'alta');
});

test('cada alerta propone una acción para una persona: nunca promete contactar sola', () => {
  const todas = alertas({
    contrataciones: [{ estudioId: 's1', nombre: 'A', clienteCreadoEn: hace(5), visitasDias14d: 0 }],
    bajas: [{ estudioId: 's2', nombre: 'B', plan: 'BASE', eurosMes: 29, hasta: '2026-12-01T10:00:00Z' }],
    limites: [{ estudioId: 's3', nombre: 'C', fase: 'MARGEN', diasRestantes: 10, reservas30d: 180, limiteReservas: 150 }],
  });
  assert.equal(todas.length, 3);
  for (const a of todas) {
    assert.ok(a.accion.length > 20, a.id);
    assert.ok(!/autom[aá]tic(o|a|amente)? (te|le|les) (envi|mand|escrib)/i.test(a.accion), `${a.id} no puede prometer un contacto automático`);
  }
});

test('un primer pago fallido es alerta alta, con el motivo del banco y los avisos ya mandados', () => {
  const [a] = alertas({ impagos: [{ estudioId: 's1', nombre: 'Casa', plan: 'ESTUDIO', importeCents: 7900, diasAbierto: 0, intentos: 1, motivo: 'La tarjeta ha caducado.', avisosDias: [0], esPrimerPago: true, estado: 'ABIERTO' }] });
  assert.equal(a.tipo, 'primer-pago-fallido');
  assert.equal(a.severidad, 'alta');
  assert.ok(a.contexto.includes('La tarjeta ha caducado.'));
  assert.ok(a.contexto.some((l) => /79 €/.test(l)));
  assert.ok(a.contexto.some((l) => /días 0/.test(l)));
});

test('un impago de una renovación solo es alerta a partir del día 3, y a los 7 o escalado es alta', () => {
  const i = (diasAbierto: number, estado = 'ABIERTO') => ({ estudioId: 's1', nombre: 'Casa', plan: 'BASE', importeCents: 2900, diasAbierto, intentos: 2, motivo: null, avisosDias: [0, 2], esPrimerPago: false, estado });
  assert.equal(alertas({ impagos: [i(2)] }).length, 0);
  assert.equal(alertas({ impagos: [i(3)] })[0].severidad, 'media');
  assert.equal(alertas({ impagos: [i(7)] })[0].severidad, 'alta');
  assert.equal(alertas({ impagos: [i(3, 'ESCALADO')] })[0].severidad, 'alta');
  assert.match(alertas({ impagos: [i(3)] })[0].accion, /decisión tuya/, 'suspender es una decisión humana');
});

test('una baja programada es alerta alta y dice cuánto dinero está en juego', () => {
  const [a] = alertas({ bajas: [{ estudioId: 's1', nombre: 'Casa', plan: 'ESTUDIO', eurosMes: 79, hasta: '2026-12-16T10:00:00Z' }] });
  assert.equal(a.tipo, 'baja-programada');
  assert.equal(a.familia, 'retencion');
  assert.equal(a.eurosMes, 79);
  assert.match(a.titulo, /16 de diciembre/);
});

test('una renovación cercana solo es alerta si hay un motivo: tarjeta que caduca o falta de uso', () => {
  const r = (extra = {}) => ({ estudioId: 's1', nombre: 'Casa', plan: 'BASE', eurosMes: 29, fecha: '2026-11-22T10:00:00Z', diasSinEntrar: 2, tarjetaCaducaAntes: false, ...extra });
  assert.equal(alertas({ renovaciones: [r()] }).length, 0, 'una renovación normal no es alerta');
  assert.equal(alertas({ renovaciones: [r({ diasSinEntrar: null })] }).length, 0, 'sin dato de uso no se inventa inactividad');
  const tarjeta = alertas({ renovaciones: [r({ tarjetaCaducaAntes: true })] })[0];
  assert.equal(tarjeta.severidad, 'alta');
  assert.match(tarjeta.contexto.join(' '), /tarjeta caduca antes/);
  const uso = alertas({ renovaciones: [r({ diasSinEntrar: 20 })] })[0];
  assert.equal(uso.severidad, 'media');
  assert.match(uso.contexto.join(' '), /20 días/);
});

test('las visitas al selector de planes necesitan al menos 3 días distintos', () => {
  const v = (n: number) => ({ estudioId: 's1', nombre: 'Casa', diasConVisita14d: n });
  assert.equal(alertas({ visitas: [v(2)] }).length, 0);
  const [a] = alertas({ visitas: [v(3)] });
  assert.equal(a.tipo, 'visitas-sin-contratar');
  assert.match(a.contexto.join(' '), /web pública de precios no se puede atribuir/, 'dice lo que NO mide');
});

test('un cliente de pago sin uso es retención; de 30 días en adelante, alta', () => {
  const s = (d: number) => ({ estudioId: 's1', nombre: 'Casa', plan: 'BASE', eurosMes: 29, diasSinEntrar: d });
  assert.equal(alertas({ sinUso: [s(15)] })[0].severidad, 'media');
  assert.equal(alertas({ sinUso: [s(31)] })[0].severidad, 'alta');
  assert.equal(alertas({ sinUso: [s(15)] })[0].familia, 'retencion');
});

test('superar el límite del plan gratis es una oportunidad con el dato real; cerrado es más urgente', () => {
  const [margen] = alertas({ limites: [{ estudioId: 's1', nombre: 'Casa', fase: 'MARGEN', diasRestantes: 12, reservas30d: 180, limiteReservas: 150 }] });
  assert.equal(margen.familia, 'oportunidad');
  assert.equal(margen.severidad, 'media');
  assert.match(margen.contexto.join(' '), /180 reservas en 30 días \(el plan gratis llega a 150\)/);
  assert.match(margen.contexto.join(' '), /12 días de margen/);
  const [cerrado] = alertas({ limites: [{ estudioId: 's1', nombre: 'Casa', fase: 'CERRADO', diasRestantes: 0, reservas30d: null, limiteReservas: 150 }] });
  assert.equal(cerrado.severidad, 'alta');
  assert.match(cerrado.contexto.join(' '), /panel está cerrado/);
});

test('varias sedes por separado: oportunidad de Cadena, y con una sola sede no hay nada', () => {
  const sedes = { duenaId: 'u1', estudios: [{ id: 'a', nombre: 'Centro' }, { id: 'b', nombre: 'Norte' }] };
  const [a] = alertas({ sedes: [sedes] });
  assert.equal(a.tipo, 'varias-sedes');
  assert.match(a.accion, /Si son negocios distintos, no hagas nada/);
  assert.equal(alertas({ sedes: [{ duenaId: 'u1', estudios: [{ id: 'a', nombre: 'Centro' }] }] }).length, 0);
});

test('el asistente sin saldo necesita 3 veces en 30 días', () => {
  const x = (n: number) => ({ estudioId: 's1', nombre: 'Casa', veces30d: n, plan: 'BASE' });
  assert.equal(alertas({ asistente: [x(2)] }).length, 0);
  assert.equal(alertas({ asistente: [x(3)] })[0].tipo, 'asistente-sin-saldo');
});

test('complementos: con dos o más se compara con el precio de Estudio, con las cuentas a la vista', () => {
  assert.equal(alertas({ complementos: [{ estudioId: 's1', nombre: 'Casa', addons: ['Centro de Control'], costeMensualEuros: 51 }] }).length, 0);
  const [dos] = alertas({ complementos: [{ estudioId: 's1', nombre: 'Casa', addons: ['Centro de Control', 'Sustituciones automáticas'], costeMensualEuros: 63 }] });
  assert.match(dos.contexto.join(' '), /63 €/);
  assert.match(dos.accion, /16 € más al mes/, 'Estudio son 79 €: 16 € más');
  assert.equal(dos.eurosMes, 16);
  const [tres] = alertas({ complementos: [{ estudioId: 's1', nombre: 'Casa', addons: ['a', 'b', 'c'], costeMensualEuros: 79 }] });
  assert.match(tres.accion, /sale ganando/);
  assert.equal(tres.eurosMes, null, 'cambiar no suma ingreso: pagaría lo mismo');
});

test('el orden: lo alto primero, luego billing antes que oportunidad, luego más dinero', () => {
  const base = { estudioId: null, nombre: 'x', titulo: 't', contexto: [] as string[], accion: 'a', href: null };
  const a = (id: string, severidad: Alerta['severidad'], familia: Alerta['familia'], eurosMes: number | null): Alerta =>
    ({ ...base, id, tipo: 'sin-uso', severidad, familia, eurosMes });
  const orden = ordenarAlertas([a('c', 'baja', 'oportunidad', null), a('b', 'alta', 'oportunidad', 10), a('a', 'alta', 'billing', null), a('d', 'alta', 'oportunidad', 50)]).map((x) => x.id);
  assert.deepEqual(orden, ['a', 'd', 'b', 'c']);
});

test('una tarjeta vale hasta el último día de su mes de caducidad', () => {
  assert.equal(tarjetaCaducaAntes(11, 2026, '2026-11-25T10:00:00Z'), false, 'caduca el 30 de nov: el 25 aún vale');
  assert.equal(tarjetaCaducaAntes(11, 2026, '2026-12-01T10:00:00Z'), true);
  assert.equal(tarjetaCaducaAntes(10, 2026, '2026-11-02T10:00:00Z'), true);
  assert.equal(tarjetaCaducaAntes(12, 2029, '2026-12-01T10:00:00Z'), false);
});
