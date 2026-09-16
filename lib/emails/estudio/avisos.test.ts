import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correoCambioClase, correoAvisoSustitucion, asuntoAvisoAlumna,
  correoPedirConfirmacion, correoRecordatorioConfirmacion, correoPlazaLiberadaSinConfirmar,
} from './avisos.ts';
import { ACENTO } from './paleta.ts';

const MARCA = {
  estudioNombre: 'Casa Pilates',
  colorPrimario: '#7C9A82',
  portadaUrl: 'https://cdn.example.com/portada.jpg',
  direccionPostal: 'Calle Ejemplo 12, 29015 Málaga',
};
const CLASE = { claseNombre: 'Reformer Iniciación', fecha: 'Lunes 4 de agosto', hora: '09:00', sala: 'Sala 1', instructor: 'Marta' };
const CUANDO = 'lunes 4 de agosto a las 09:00';

test('ninguno de estos avisos lleva foto de portada', () => {
  // Los seis llegan a mitad de semana para decir algo concreto sobre un día
  // concreto: una portada delante retrasa el dato.
  const todos = [
    correoCambioClase({ socioNombre: 'Ana', ...CLASE, marca: MARCA, instructorAnterior: 'Lucía' }),
    correoAvisoSustitucion({ toName: 'Ana', claseNombre: CLASE.claseNombre, cuando: CUANDO, aviso: { tipo: 'cancelada' }, marca: MARCA }),
    correoPedirConfirmacion({ toName: 'Ana', claseNombre: CLASE.claseNombre, cuando: CUANDO, marca: MARCA, url: 'https://app.example.com/c/x' }),
    correoPlazaLiberadaSinConfirmar({ toName: 'Ana', claseNombre: CLASE.claseNombre, cuando: CUANDO, marca: MARCA }),
  ];
  for (const html of todos) assert.ok(!html.includes('cdn.example.com/portada.jpg'));
});

test('el cambio de clase dice QUÉ cambió, no «algo ha cambiado»', () => {
  const soloInstructora = correoCambioClase({ socioNombre: 'Ana', ...CLASE, marca: MARCA, instructorAnterior: 'Lucía' });
  assert.match(soloInstructora, /ha cambiado la instructora de tu clase/);
  assert.match(soloInstructora, /Antes la daba/);
  // Y tacha a quien la daba antes: es el dato que busca al abrir el correo.
  assert.match(soloInstructora, /line-through[^>]*>Lucía</);

  // Sin saber quién la daba antes no se puede decir «ha cambiado la
  // instructora» como si se supiera de quién a quién: se dice lo que se sabe.
  const aCiegas = correoCambioClase({ socioNombre: 'Ana', ...CLASE, marca: MARCA });
  assert.match(aCiegas, /la dará otra instructora/);
  assert.ok(!aCiegas.includes('Antes la daba'));

  const todo = correoCambioClase({ socioNombre: 'Ana', ...CLASE, marca: MARCA, instructorAnterior: 'Lucía', cambioHora: true, cambioSala: true });
  assert.match(todo, /ha cambiado la hora, la sala y la instructora/);

  const soloHora = correoCambioClase({ socioNombre: 'Ana', ...CLASE, marca: MARCA, cambioHora: true });
  assert.match(soloHora, /ha cambiado la hora de tu clase/);
  assert.ok(!soloHora.includes('Antes la daba'), 'sin instructora anterior no hay nada que tachar');
});

test('la serie entera se avisa una sola vez y se dice', () => {
  assert.ok(!correoCambioClase({ socioNombre: 'Ana', ...CLASE, marca: MARCA, cambioHora: true }).includes('toda la serie'));
  assert.match(
    correoCambioClase({ socioNombre: 'Ana', ...CLASE, marca: MARCA, cambioHora: true, masClasesDeLaSerie: true }),
    /El cambio es para toda la serie/,
  );
});

test('los tres desenlaces de una sustitución se leen distinto', () => {
  const base = { toName: 'Ana', claseNombre: 'Reformer Iniciación', cuando: CUANDO, marca: MARCA };
  const cubierta = correoAvisoSustitucion({ ...base, aviso: { tipo: 'cubierta', sustituta: 'Marta' } });
  const reprogramada = correoAvisoSustitucion({ ...base, aviso: { tipo: 'reprogramada', cuandoNuevo: 'jueves 7 a las 19:00' } });
  const cancelada = correoAvisoSustitucion({ ...base, aviso: { tipo: 'cancelada' } });

  assert.match(cubierta, /Tu clase sigue en pie/);
  assert.match(cubierta, /La dará Marta/);
  assert.ok(!cubierta.includes(ACENTO.alerta), 'una buena noticia no lleva filete rojo');

  assert.match(reprogramada, /cambia de horario/);
  assert.match(reprogramada, /jueves 7 a las 19:00/);
  // El horario viejo tachado y el nuevo debajo.
  assert.match(reprogramada, /line-through[^>]*>lunes 4 de agosto/);

  assert.match(cancelada, /Clase cancelada/);
  assert.ok(cancelada.includes(ACENTO.alerta), 'la única mala de las tres debería ir en rojo');

  assert.equal(new Set([cubierta, reprogramada, cancelada]).size, 3);
});

test('el asunto del aviso viaja con su cuerpo', () => {
  assert.equal(asuntoAvisoAlumna({ tipo: 'cubierta', sustituta: 'Marta' }, 'Reformer'), 'Tu clase sigue en pie — Reformer');
  assert.equal(asuntoAvisoAlumna({ tipo: 'reprogramada', cuandoNuevo: 'x' }, 'Reformer'), 'Cambio de horario — Reformer');
  assert.equal(asuntoAvisoAlumna({ tipo: 'cancelada' }, 'Reformer'), 'Clase cancelada — Reformer');
});

test('los dos avisos de confirmación no repiten el mismo texto', () => {
  const base = { toName: 'Ana', claseNombre: 'Reformer Iniciación', cuando: CUANDO, marca: MARCA, url: 'https://app.example.com/c/x' };
  const primero = correoPedirConfirmacion(base);
  const segundo = correoRecordatorioConfirmacion(base);
  assert.match(primero, /¿Sigues viniendo a tu clase\?/);
  // El segundo reconoce que ya se escribió: repetirlo igual es lo que hace que
  // se ignore las dos veces.
  assert.match(segundo, /te escribimos ayer y todavía no hemos sabido de ti/);
  assert.notEqual(primero, segundo);
  // Los dos dicen qué pasa si no contesta.
  for (const html of [primero, segundo]) assert.match(html, /liberaremos tu plaza/);
});

test('el aviso de plaza liberada informa, no castiga', () => {
  const html = correoPlazaLiberadaSinConfirmar({ toName: 'Ana', claseNombre: 'Reformer Iniciación', cuando: CUANDO, marca: MARCA, url: 'https://app.example.com/horario' });
  assert.ok(!html.includes(ACENTO.alerta), 'un filete rojo aquí diría que ha hecho algo mal');
  assert.match(html, /¿Te apetece reservar otra clase\?/);
  assert.match(html, /Ver el horario/);
});

test('sin enlace de confirmación no se pinta un botón muerto', () => {
  const html = correoPedirConfirmacion({ toName: 'Ana', claseNombre: 'Reformer', cuando: CUANDO, marca: MARCA });
  assert.ok(!html.includes('mso-padding-alt'));
});
