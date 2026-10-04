import test from 'node:test';
import assert from 'node:assert/strict';
import { correoFalloPagoSaas, correoEstudioVencido, correoAccesoActivado, correoResumenSemanal, correoDatosBorrados } from './cuenta.ts';
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

test('la baja de un estudio de pago lleva primero a descargar, y solo promete borrar si está armado', () => {
  const base = { fase: 'aviso_baja' as const, motivo: 'baja' as const, estudioNombre: 'Casa Pilates', fechaPurga: '4 de noviembre de 2026', urlSuscripcion: `${URL}/s`, urlExportar: `${URL}/e` };
  const armado = correoEstudioVencido({ ...base, purgaArmada: true });
  const desarmado = correoEstudioVencido({ ...base, purgaArmada: false });
  assert.match(armado, /La suscripción de Casa Pilates a Tentare ha terminado/);
  assert.ok(!armado.includes('prueba gratuita'));
  // El botón principal es la descarga; reactivar queda como enlace.
  assert.ok(armado.indexOf(`${URL}/e`) < armado.indexOf(`${URL}/s`), 'la descarga va antes que reactivar');
  assert.match(armado, /Reactivar la suscripción/);
  assert.match(armado, /Después borraremos/);
  assert.ok(!desarmado.includes('borraremos'), 'con el interruptor apagado ese día solo se calcula un informe');
  assert.match(desarmado, /para que puedas descargarlos/);
  assert.ok(!armado.includes(TENTARE.alerta), 'el primer aviso no es una alarma');
});

test('la descarga que se anuncia ya lleva la salud: nadie dice «sin ficha clínica»', () => {
  for (const fase of ['aviso_30', 'aviso_baja', 'aviso_final'] as const) {
    const html = correoEstudioVencido({ fase, estudioNombre: 'Casa Pilates', fechaPurga: 'x', purgaArmada: false, urlSuscripcion: `${URL}/s`, urlExportar: `${URL}/e` });
    assert.ok(!html.includes('sin ficha clínica'), fase);
    assert.match(html, /ficha de salud/, fase);
  }
});

test('la confirmación del borrado dice qué se borró y qué se conserva por ley', () => {
  const html = correoDatosBorrados({ estudioNombre: 'Casa Pilates', fecha: '4 de noviembre de 2026' });
  assert.match(html, /4 de noviembre de 2026/);
  assert.match(html, /copias de seguridad/);
  assert.match(html, /facturas, los recibos, los registros de facturación y los mandatos SEPA/);
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
    correoDatosBorrados({ estudioNombre: 'Casa Pilates', fecha: '4 de noviembre de 2026' }),
  ];
  const kit = new Set(Object.values(TENTARE).map(c => c.toUpperCase()));
  for (const html of correos) {
    const fuera = [...new Set([...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(m => m[0].toUpperCase()))].filter(h => !kit.has(h));
    assert.deepEqual(fuera, []);
    assert.match(html, /Te escribimos porque eres la propietaria de Casa Pilates/);
  }
});

test('el código de acceso va en el cuerpo, legible, y nunca en el preheader', async () => {
  const { correoCodigoAcceso } = await import('./cuenta.ts');
  const html = correoCodigoAcceso({ codigo: '048213', minutos: 10 });
  assert.match(html, /048 213/);
  // Lo que se ve en la pantalla bloqueada (preheader) no lleva el código.
  const preheader = html.slice(0, html.indexOf('Tu código para entrar'));
  assert.ok(!preheader.includes('048'), 'el código no puede ir en el preheader');
  assert.match(html, /Caduca en 10 minutos/);
  assert.match(html, /He olvidado mi contraseña/);
});
