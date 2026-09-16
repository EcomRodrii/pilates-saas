import test from 'node:test';
import assert from 'node:assert/strict';
import { correoValoracion, correoEsperaSinPlaza, correoAutomatizacion } from './mensajes.ts';

const MARCA = {
  estudioNombre: 'Casa Pilates',
  colorPrimario: '#7C9A82',
  portadaUrl: 'https://cdn.example.com/portada.jpg',
  direccionPostal: 'Calle Ejemplo 12, 29015 Málaga',
};
const CLASE = { claseNombre: 'Reformer Iniciación', fecha: 'Lunes 4 de agosto', hora: '09:00', sala: 'Sala 1', instructor: 'Marta' };

test('la valoración pregunta por la clase y por quién la dio', () => {
  const html = correoValoracion({ toName: 'Ana', claseNombre: 'Reformer', cuando: 'lunes a las 09:00', instructorNombre: 'Marta', url: 'https://app.example.com/valorar/x', marca: MARCA });
  assert.match(html, /¿Qué tal tu clase\?/);
  assert.match(html, /tu clase con Marta/);
  assert.match(html, /Valorar la clase/);
  // Sin instructora no queda una frase coja.
  const sinQuien = correoValoracion({ toName: 'Ana', claseNombre: 'Reformer', cuando: 'lunes', url: 'https://app.example.com/v/x', marca: MARCA });
  assert.match(sinQuien, /¿qué tal tu clase\? Tu opinión/);
});

test('la lista de espera sin plaza distingue el bono de la clase suelta', () => {
  const base = { socioNombre: 'Ana', ...CLASE, marca: MARCA };
  const suelta = correoEsperaSinPlaza({ ...base, sesionesRestantes: 1 });
  const bono = correoEsperaSinPlaza({ ...base, sesionesRestantes: 7 });

  // Con una clase suelta el crédito es el importe entero: por eso ahí, y solo
  // ahí, se le ofrece la devolución.
  assert.match(suelta, /tienes una sesión disponible/);
  assert.match(suelta, /te devolvamos el dinero/);

  assert.match(bono, /te quedan 7 sesiones/);
  assert.ok(!bono.includes('te devolvamos el dinero'), 'a quien le quedan sesiones no se le ofrece devolución');
});

test('la caducidad se dice si la hay, y no se inventa un «no caduca» si no', () => {
  const base = { socioNombre: 'Ana', ...CLASE, marca: MARCA, sesionesRestantes: 7 };
  assert.match(correoEsperaSinPlaza({ ...base, caducaEl: '30 de septiembre' }), /hasta el 30 de septiembre/);
  const sinFecha = correoEsperaSinPlaza(base);
  assert.match(sinFecha, /para usar cuando quieras/);
  assert.ok(!sinFecha.includes('no caduca'), 'eso lo decide cada estudio: el correo no puede prometerlo');
});

test('la dirección del estudio solo se ofrece si la hay', () => {
  const base = { socioNombre: 'Ana', ...CLASE, marca: MARCA, sesionesRestantes: 1 };
  assert.match(correoEsperaSinPlaza({ ...base, emailEstudio: 'hola@example.com' }), /escríbenos a hola@example\.com/);
  assert.ok(!correoEsperaSinPlaza(base).includes('escríbenos a'));
});

test('el mensaje de una automatización se parte en párrafos, no en una parrafada', () => {
  const html = correoAutomatizacion({
    socioNombre: 'Ana', titulo: 'Te echamos de menos',
    mensaje: 'Hace un par de semanas que no te vemos.\n\n¿Te reservamos sitio el jueves?',
    marca: MARCA,
  });
  assert.match(html, /Hace un par de semanas/);
  assert.match(html, /¿Te reservamos sitio el jueves\?/);
  // Dos párrafos del mensaje + el saludo.
  assert.ok((html.match(/font-size:14\.5px/g) ?? []).length >= 3);
});

test('el enlace de baja solo va en lo comercial', () => {
  const base = { socioNombre: 'Ana', titulo: 'Tu clase de mañana', mensaje: 'Te esperamos.', marca: MARCA };
  // Un aviso de servicio no se «da de baja»: ofrecerlo insinúa que dejar de
  // recibirlo es opcional, y no lo es.
  assert.ok(!correoAutomatizacion(base).includes('Darte de baja'));
  assert.match(
    correoAutomatizacion({ ...base, unsubscribeUrl: 'https://app.example.com/api/marketing/baja?token=abc' }),
    /Darte de baja de estos avisos/,
  );
});

test('la llamada a la acción de una automatización se pinta como botón', () => {
  // Con el enlace suelto dentro del texto dependes de que el cliente de correo
  // lo detecte y lo subraye, que es justo lo que no hace Outlook.
  const base = { socioNombre: 'Ana', titulo: 'Hay un hueco', mensaje: 'Se ha liberado un sitio mañana.', marca: MARCA };
  assert.ok(!correoAutomatizacion(base).includes('mso-padding-alt'));
  const conBoton = correoAutomatizacion({ ...base, accion: { url: 'https://app.example.com/reservar', texto: 'Reservar mi sitio' } });
  assert.match(conBoton, /mso-padding-alt/);
  assert.match(conBoton, /Reservar mi sitio/);
});
