import test from 'node:test';
import assert from 'node:assert/strict';
import { correoReserva, correoRecordatorio, correoCancelacionClase, correoPlazaLiberada, type PropsClase } from './clase.ts';
import { ACENTO } from './paleta.ts';

// Muestras sin PII: dominios de ejemplo (RFC 2606) y nombres inventados. El
// repositorio es público.
const BASE: PropsClase = {
  socioNombre: 'Ana',
  claseNombre: 'Reformer Iniciación',
  fecha: 'Lunes 4 de agosto',
  hora: '09:00',
  sala: 'Sala 1',
  instructor: 'Marta',
  url: 'https://app.example.com/portal/casa-pilates',
  marca: {
    estudioNombre: 'Casa Pilates',
    colorPrimario: '#7C9A82',
    portadaUrl: 'https://cdn.example.com/portada.jpg',
    direccionPostal: 'Calle Ejemplo 12, 29015 Málaga',
  },
};

test('la reserva dice lo que hay que decir y lleva los datos de la clase', () => {
  const html = correoReserva(BASE);
  for (const dato of ['Reformer Iniciación', 'Lunes 4 de agosto', '09:00', 'Sala 1', 'Marta']) {
    assert.ok(html.includes(dato), `falta «${dato}» en el correo de reserva`);
  }
  assert.match(html, /Tu plaza está reservada/);
  assert.match(html, /Casa Pilates/);
});

test('el recordatorio NO es el mismo correo que la reserva', () => {
  // Suena obvio; el fallo real que evita es un `case` mal copiado en el emisor,
  // que manda «tu plaza está reservada» 24 h antes de la clase.
  assert.notEqual(correoRecordatorio(BASE), correoReserva(BASE));
  assert.match(correoRecordatorio(BASE), /Te esperamos mañana/);
});

test('la clase online enseña su enlace de Zoom', () => {
  const sin = correoRecordatorio(BASE);
  assert.ok(!sin.includes('Enlace de Zoom'));
  const con = correoRecordatorio({ ...BASE, zoomJoinUrl: 'https://zoom.example.com/j/123' });
  assert.match(con, /Enlace de Zoom/);
  assert.ok(con.includes('https://zoom.example.com/j/123'));
});

test('sin url no se pinta un botón que no lleva a ninguna parte', () => {
  const html = correoReserva({ ...BASE, url: null });
  assert.ok(!html.includes('mso-padding-alt'));
  assert.ok(!html.includes('Ver mis clases'));
});

test('la intro de la propietaria sustituye al párrafo de fábrica', () => {
  const html = correoReserva({ ...BASE, intro: 'Qué alegría verte por aquí, Ana.' });
  assert.match(html, /Qué alegría verte por aquí/);
  assert.ok(!html.includes('ya tienes sitio en'), 'el texto de fábrica debería haberse ido');
});

test('los colores y la fuente de ESTA plantilla mandan sobre la marca del estudio', () => {
  const html = correoReserva({
    ...BASE,
    personalizacion: { colorCabecera: '#8C6A4A', colorBoton: '#2E5E4E', fuente: 'Georgia', botonTexto: 'Abrir mi app' },
  });
  assert.ok(html.includes('#8C6A4A'), 'el color elegido para esta plantilla no se aplicó');
  assert.ok(html.includes('#2E5E4E'), 'el color del botón no se aplicó');
  assert.ok(!html.includes('#7C9A82'), 'seguía saliendo el color general del estudio');
  assert.match(html, /font-family:'Georgia'/);
  assert.match(html, /Abrir mi app/);
});

test('eligiendo solo el color de cabecera, el botón la sigue', () => {
  // Quien pone un color de marca espera que el correo entero vaya de ese color,
  // no una banda marrón con un botón verde.
  const html = correoReserva({ ...BASE, personalizacion: { colorCabecera: '#8C6A4A' } });
  assert.ok(html.includes('#8C6A4A'));
  assert.ok(!html.includes('#7C9A82'));
});

test('el logo y el pie propios de la plantilla se respetan', () => {
  const html = correoReserva({
    ...BASE,
    personalizacion: { logoUrl: 'https://cdn.example.com/otro-logo.png', pie: 'Casa Pilates · 600 000 000' },
  });
  assert.ok(html.includes('otro-logo.png'));
  assert.match(html, /Casa Pilates · 600 000 000/);
  assert.ok(!html.includes('Calle Ejemplo 12'), 'su pie debería sustituir al legal por defecto');
});

test('con cuerpo propio manda su texto, pero el correo sigue siendo suyo de marca', () => {
  const html = correoReserva({
    ...BASE,
    personalizacion: { cuerpo: '# Nos vemos, Ana\n\nTrae **calcetines**.\n\n{datos}\n\n{boton}' },
  });
  assert.match(html, /Nos vemos, Ana/);
  assert.ok(!html.includes('Tu plaza está reservada'), 'no puede haber dos titulares');
  assert.ok(html.includes('Lunes 4 de agosto'));
  assert.ok(html.includes('#7C9A82'), 'el cuerpo libre perdió el color del estudio');
  assert.ok(html.includes('https://cdn.example.com/portada.jpg'), 'el cuerpo libre perdió la portada');
});

test('ninguna dirección de muestra de este test es real', () => {
  // Guardia del repo público: si alguien mete un correo de una socia de verdad
  // en un fixture, salta aquí antes que en la revisión.
  const fuente = JSON.stringify(BASE);
  for (const host of [...fuente.matchAll(/@([\w.-]+)/g)].map(m => m[1])) {
    assert.match(host, /\.(example|invalid)$|^example\.(com|org|net)$/);
  }
});

test('la cancelación no lleva foto y tacha lo que ya no existe', () => {
  const html = correoCancelacionClase(BASE);
  assert.ok(!html.includes('cdn.example.com/portada.jpg'),
    'una foto luminosa encima de «tu clase se ha cancelado» se lee como una broma');
  assert.ok(html.includes(ACENTO.alerta), 'el filete debería avisar en rojo');
  assert.match(html, /Tu clase se ha cancelado/);
  // Fecha y hora tachadas; sala e instructora no (siguen existiendo).
  const tachados = [...html.matchAll(/line-through[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(tachados, ['Lunes 4 de agosto', '09:00']);
  assert.ok(!html.includes('mso-padding-alt'), 'no hay nada que pulsar en una clase cancelada');
});

test('la devolución del bono se dice, no se supone', () => {
  assert.ok(!correoCancelacionClase(BASE).includes('devuelto la sesión'));
  assert.match(correoCancelacionClase({ ...BASE, bonoDevuelto: true }), /devuelto la sesión a tu bono/);
});

test('la plaza liberada es buena noticia: portada y filete verde', () => {
  const html = correoPlazaLiberada(BASE);
  assert.ok(html.includes('cdn.example.com/portada.jpg'));
  assert.ok(html.includes(ACENTO.bien));
  assert.match(html, /Se ha liberado tu plaza/);
  assert.match(html, /Ver mis clases/);
});

test('si se consume una sesión del bono, se le dice', () => {
  // Transparencia: nunca se le descuenta sin avisar.
  assert.ok(!correoPlazaLiberada(BASE).includes('descontado una sesión'));
  assert.match(correoPlazaLiberada({ ...BASE, bonoConsumido: true }), /descontado una sesión de tu bono/);
});

test('los cuatro correos de clase se ven distintos entre sí', () => {
  // Un `case` mal copiado en el emisor manda «tu plaza está reservada» cuando
  // la clase se acaba de cancelar, y no lo nota nadie hasta que se queja alguien.
  const correos = [correoReserva(BASE), correoRecordatorio(BASE), correoCancelacionClase(BASE), correoPlazaLiberada(BASE)];
  assert.equal(new Set(correos).size, 4);
});

test('la propietaria puede poner la foto de portada de ESTE correo', () => {
  const html = correoReserva({ ...BASE, personalizacion: { portadaUrl: 'https://cdn.example.com/mi-foto.jpg' } });
  assert.ok(html.includes('cdn.example.com/mi-foto.jpg'));
  assert.ok(!html.includes('cdn.example.com/portada.jpg'), 'su foto debería mandar sobre la de su app');
});

test('y puede apagarla en un correo que la lleva, o encenderla en uno que no', () => {
  // `null` (no lo ha tocado) NO es lo mismo que `false`.
  assert.ok(correoReserva({ ...BASE, personalizacion: {} }).includes('portada.jpg'));
  assert.ok(!correoReserva({ ...BASE, personalizacion: { mostrarPortada: false } }).includes('portada.jpg'));
  // La cancelación va sin foto de fábrica; si la quiere, la tiene.
  assert.ok(!correoCancelacionClase(BASE).includes('portada.jpg'));
  assert.ok(correoCancelacionClase({ ...BASE, personalizacion: { mostrarPortada: true } }).includes('portada.jpg'));
});

test('el destino del botón lo puede cambiar, y lo puede crear donde no había', () => {
  const aSuWeb = correoReserva({ ...BASE, personalizacion: { botonUrl: 'https://casapilates.example/mi-cuenta' } });
  assert.ok(aSuWeb.includes('casapilates.example/mi-cuenta'));
  assert.ok(!aSuWeb.includes('app.example.com'), 'su destino debería mandar sobre el de siempre');

  // La cancelación no lleva botón; con destino Y texto, pasa a llevarlo.
  assert.ok(!correoCancelacionClase(BASE).includes('mso-padding-alt'));
  const conBoton = correoCancelacionClase({
    ...BASE,
    personalizacion: { botonUrl: 'https://casapilates.example/horario', botonTexto: 'Ver el horario' },
  });
  assert.match(conBoton, /mso-padding-alt/);
  assert.match(conBoton, /Ver el horario/);
  // Un destino sin texto sería un rectángulo de color: no se pinta.
  assert.ok(!correoCancelacionClase({ ...BASE, personalizacion: { botonUrl: 'https://casapilates.example' } }).includes('mso-padding-alt'));
});

test('un destino que no es http se queda en # al pintar', () => {
  // La cerradura es el CHECK de la base; esto es defensa en profundidad para
  // una fila escrita antes de existir la regla.
  const html = correoReserva({ ...BASE, personalizacion: { botonUrl: 'javascript:alert(1)', botonTexto: 'Pincha' } });
  assert.ok(!/href="javascript:/i.test(html));
  assert.match(html, /href="#"/);
});
