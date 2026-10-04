import test from 'node:test';
import assert from 'node:assert/strict';
import { correoBienvenida } from './cuenta.ts';

const MARCA = { estudioNombre: 'Casa Pilates', colorPrimario: '#7C9A82', portadaUrl: 'https://cdn.example.com/portada.jpg' };

test('la bienvenida saluda con el nombre del estudio y lleva su portada', () => {
  const html = correoBienvenida({ socioNombre: 'Ana', marca: MARCA, url: 'https://app.example.com/acceso' });
  assert.match(html, /Bienvenida a Casa Pilates/);
  assert.ok(html.includes('cdn.example.com/portada.jpg'));
  assert.match(html, /Activar mi acceso/);
});

test('sin enlace de acceso no se promete un enlace que no existe', () => {
  // El magic link se genera al vuelo y puede fallar; el correo sale igual.
  const html = correoBienvenida({ socioNombre: 'Ana', marca: MARCA });
  assert.ok(!html.includes('mso-padding-alt'), 'no debería haber botón');
  assert.ok(!html.includes('Este enlace es tuyo'), 'no se puede prometer un enlace que no va');
  assert.match(html, /Ya puedes reservar tus clases/);
});

test('el plan solo se enseña si lo hay', () => {
  assert.ok(!correoBienvenida({ socioNombre: 'Ana', marca: MARCA }).includes('Tu plan'));
  assert.match(correoBienvenida({ socioNombre: 'Ana', marca: MARCA, planNombre: 'Mensual Ilimitado' }), /Mensual Ilimitado/);
});

test('con cuerpo propio manda su texto y su botón', () => {
  const html = correoBienvenida({
    socioNombre: 'Ana', marca: MARCA, url: 'https://app.example.com/acceso',
    personalizacion: { cuerpo: '# Hola Ana\n\nBienvenida.\n\n{boton}', botonTexto: 'Entrar a mi cuenta' },
  });
  assert.match(html, /Hola Ana/);
  assert.match(html, /Entrar a mi cuenta/);
  assert.ok(!html.includes('Bienvenida a Casa Pilates'), 'no puede haber dos titulares');
});

test('el código de acceso de la app va con la marca del estudio, nunca con la de Tentare, y fuera del preheader', async () => {
  const { correoCodigoAccesoEstudio } = await import('./cuenta.ts');
  const html = correoCodigoAccesoEstudio({ codigo: '048213', minutos: 10, marca: { estudioNombre: 'Casa Pilates' } as never });
  assert.match(html, /048 213/);
  assert.match(html, /Casa Pilates/);
  assert.ok(!/Tentare/.test(html), 'marca blanca: la app es del estudio');
  const preheader = html.slice(0, html.indexOf('Tu código para entrar'));
  assert.ok(!preheader.includes('048'), 'el código no puede ir en el preheader');
});

test('el aviso de «te han quitado la verificación» va con la marca del estudio y dice qué hacer si no lo pidió', async () => {
  const { correoDobleFactorQuitado } = await import('./cuenta.ts');
  const html = correoDobleFactorQuitado({ marca: { estudioNombre: 'Casa Pilates' } as never });
  assert.match(html, /Casa Pilates/);
  assert.match(html, /cambia tu contraseña/);
  assert.ok(!/Tentare/.test(html), 'marca blanca: la app es del estudio');
});
