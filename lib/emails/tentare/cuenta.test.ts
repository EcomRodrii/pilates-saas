import test from 'node:test';
import assert from 'node:assert/strict';
import { correoFalloPagoSaas, correoEstudioVencido, correoAccesoActivado, correoResumenSemanal } from './cuenta.ts';
import { TENTARE } from './plantilla.ts';

const URL = 'https://app.example.com';

test('el fallo de pago manda a la pantalla que existe, no a una que no', () => {
  const html = correoFalloPagoSaas({ estudioNombre: 'Casa Pilates', plan: 'Estudio', proximoIntento: '19 de septiembre', urlSuscripcion: `${URL}/suscripcion` });
  // Antes decía «Ajustes → Facturación», que no existe en el panel.
  assert.ok(!html.includes('Ajustes'), 'ruta inventada');
  assert.match(html, /Suscripción → «Facturas, tarjeta y cambio de plan»/);
  assert.ok(html.includes(`${URL}/suscripcion`));
  assert.match(html, /19 de septiembre/);
  assert.ok(html.includes(TENTARE.alerta), 'un cobro fallido lleva la regla roja');
});

test('sin fecha de reintento no se inventa una agenda', () => {
  const html = correoFalloPagoSaas({ estudioNombre: 'Casa Pilates', plan: 'Estudio', urlSuscripcion: `${URL}/suscripcion` });
  assert.ok(!html.includes('Qué pasa ahora'));
});

test('el aviso final no promete un borrado que no está armado', () => {
  const base = { fase: 'aviso_final' as const, estudioNombre: 'Casa Pilates', fechaPurga: '24 de noviembre de 2026', urlSuscripcion: `${URL}/s`, urlExportar: `${URL}/e` };
  const armado = correoEstudioVencido({ ...base, purgaArmada: true });
  const desarmado = correoEstudioVencido({ ...base, purgaArmada: false });
  assert.match(armado, /Ese día borraremos/);
  assert.ok(!desarmado.includes('borraremos'), 'con el interruptor apagado ese día solo se calcula un informe');
  assert.match(desarmado, /quedan listos para borrarse/);
  assert.ok(armado.includes(TENTARE.alerta));
});

test('el primer aviso de vencido no habla de borrar', () => {
  const html = correoEstudioVencido({ fase: 'aviso_30', estudioNombre: 'Casa Pilates', fechaPurga: '24 de noviembre de 2026', purgaArmada: true, urlSuscripcion: `${URL}/s`, urlExportar: `${URL}/e` });
  assert.ok(!html.includes('borraremos'));
  assert.match(html, /Conservamos sus datos hasta ese día/);
  assert.ok(!html.includes(TENTARE.alerta), 'el primer aviso no es una alarma');
  assert.match(html, /Descargar los datos del estudio/);
});

test('el acceso activado enseña con qué correo ha entrado', () => {
  // Es lo único que delata una dirección mal tecleada en la ficha.
  const html = correoAccesoActivado({ nombre: 'Marta', emailCuenta: 'marta@example.com', estudioNombre: 'Casa Pilates', urlEquipo: `${URL}/equipo` });
  assert.match(html, /Ha entrado con este correo/);
  assert.match(html, /marta@example\.com/);
  const sin = correoAccesoActivado({ nombre: 'Marta', emailCuenta: null, estudioNombre: 'Casa Pilates', urlEquipo: `${URL}/equipo` });
  assert.ok(!sin.includes('Ha entrado con este correo'));
});

test('el resumen semanal solo enseña crecimiento si lo hay', () => {
  const base = { propietariaNombre: 'Carmen', estudioNombre: 'Casa Pilates', rangoTexto: '4–10 de agosto', urlCentroDeControl: `${URL}/centro-de-control` };
  assert.ok(!correoResumenSemanal(base).includes('Ingresos frente'));
  assert.match(correoResumenSemanal({ ...base, crecimientoPct: 12 }), /\+12 %/);
});

test('ninguno de estos correos lleva la marca de un estudio', () => {
  // Los firma Tentare. Si un color de estudio se colara, sería señal de que
  // alguien volvió a pasarle `colorPrimario`.
  const correos = [
    correoFalloPagoSaas({ estudioNombre: 'Casa Pilates', plan: 'Estudio', urlSuscripcion: URL }),
    correoAccesoActivado({ nombre: 'Marta', emailCuenta: null, estudioNombre: 'Casa Pilates', urlEquipo: URL }),
    correoResumenSemanal({ propietariaNombre: 'Carmen', estudioNombre: 'Casa Pilates', rangoTexto: 'x', urlCentroDeControl: URL }),
  ];
  const kit = new Set(Object.values(TENTARE).map(c => c.toUpperCase()));
  for (const html of correos) {
    const fuera = [...new Set([...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(m => m[0].toUpperCase()))].filter(h => !kit.has(h));
    assert.deepEqual(fuera, []);
    assert.match(html, /Te escribimos porque eres la propietaria de Casa Pilates/);
  }
});
