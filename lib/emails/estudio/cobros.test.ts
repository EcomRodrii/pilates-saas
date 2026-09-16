import test from 'node:test';
import assert from 'node:assert/strict';
import { correoImpago, correoRecibo } from './cobros.ts';
import { ACENTO } from './paleta.ts';

const MARCA = {
  estudioNombre: 'Casa Pilates',
  colorPrimario: '#7C9A82',
  portadaUrl: 'https://cdn.example.com/portada.jpg',
  direccionPostal: 'Calle Ejemplo 12, 29015 Málaga',
};

test('ni el impago ni el recibo llevan foto de portada', () => {
  // Una foto grande y luminosa encima de «no hemos podido cobrar tu cuota» se
  // lee como una broma, y un justificante de pago es un documento.
  for (const html of [
    correoImpago({ socioNombre: 'Ana', concepto: 'Cuota de agosto', importe: 45, definitivo: false, marca: MARCA }),
    correoRecibo({ socioNombre: 'Ana', concepto: 'Cuota de agosto', importe: 45, fechaCobro: '2026-08-04T10:00:00.000Z', marca: MARCA }),
  ]) {
    assert.ok(!html.includes('cdn.example.com/portada.jpg'), 'este correo no debería llevar portada');
  }
});

test('el primer fallo y el definitivo no dicen lo mismo ni se ven igual', () => {
  const primero = correoImpago({ socioNombre: 'Ana', concepto: 'Cuota de agosto', importe: 45, definitivo: false, marca: MARCA });
  const ultimo = correoImpago({ socioNombre: 'Ana', concepto: 'Cuota de agosto', importe: 45, definitivo: true, marca: MARCA });

  assert.match(primero, /no tienes que hacer nada/);
  assert.ok(primero.includes(ACENTO.aviso), 'el primer fallo debería ir en ámbar');

  assert.match(ultimo, /No hemos podido cobrar tu cuota/);
  assert.match(ultimo, /Ponte en contacto con el estudio/);
  assert.ok(ultimo.includes(ACENTO.alerta), 'el fallo definitivo debería ir en rojo');
  // Decirle «no hagas nada» cuando ya no quedan intentos es como no avisarla.
  assert.ok(!ultimo.includes('no tienes que hacer nada'));
});

test('el importe sale con dos decimales y en euros', () => {
  // Sin `maximumFractionDigits`, `toLocaleString` usa tres por defecto y el
  // total de un justificante salía como «249,235 €».
  const html = correoRecibo({ socioNombre: 'Ana', concepto: 'Bono 10 sesiones', importe: 249.235, fechaCobro: '2026-08-04T10:00:00.000Z', marca: MARCA });
  assert.ok(!html.includes('249,235'), 'tres decimales en un justificante de pago');
  assert.match(html, /249,24/);
});

test('la fecha del justificante se escribe en cristiano', () => {
  const html = correoRecibo({ socioNombre: 'Ana', concepto: 'Cuota', importe: 45, fechaCobro: '2026-08-04T10:00:00.000Z', marca: MARCA });
  assert.match(html, /4 de agosto de 2026/);
  assert.ok(!html.includes('Invalid Date'));
});

test('el número de factura solo aparece cuando existe', () => {
  const base = { socioNombre: 'Ana', concepto: 'Cuota', importe: 45, fechaCobro: '2026-08-04T10:00:00.000Z', marca: MARCA };
  assert.ok(!correoRecibo(base).includes('Nº factura'), 'la factura se sella aparte y puede no existir todavía');
  assert.match(correoRecibo({ ...base, numeroFactura: 'A-2026-0042' }), /A-2026-0042/);
});

test('sin enlace a su app, el justificante sale sin botón', () => {
  const base = { socioNombre: 'Ana', concepto: 'Cuota', importe: 45, fechaCobro: '2026-08-04T10:00:00.000Z', marca: MARCA };
  assert.ok(!correoRecibo(base).includes('mso-padding-alt'));
  assert.match(correoRecibo({ ...base, url: 'https://app.example.com/portal/casa/pagos' }), /Ver mi factura/);
});

test('el impago admite la personalización del estudio; el justificante no', () => {
  const html = correoImpago({
    socioNombre: 'Ana', concepto: 'Cuota', importe: 45, definitivo: false, marca: MARCA,
    personalizacion: { cuerpo: '# Un aviso\n\nRevisa tu tarjeta.\n\n{datos}', colorCabecera: '#8C6A4A' },
  });
  assert.match(html, /Un aviso/);
  assert.match(html, /Cuota/);
  assert.ok(html.includes('#8C6A4A'));
  // `correoRecibo` ni siquiera acepta personalización: su contenido es fiscal.
  assert.ok(!('personalizacion' in correoRecibo));
});
