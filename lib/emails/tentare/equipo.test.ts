import test from 'node:test';
import assert from 'node:assert/strict';
import {
  correoInvitacionEquipo, correoSolicitudDisponibilidad, correoContactoSustituta,
  correoAlertaPropietaria, correoCierreGestoria, correoReferenciaSolicitud,
} from './equipo.ts';
import { TENTARE } from './plantilla.ts';

const URL = 'https://app.example.com/x';

test('la invitación de una instructora la lleva a la app; la del resto, al panel', () => {
  const inst = correoInvitacionEquipo({ nombre: 'Marta', propietariaNombre: 'Carmen', estudioNombre: 'Casa Pilates', rol: 'INSTRUCTOR', url: URL });
  assert.match(inst, /te lleva a la app de Casa Pilates/i);
  assert.match(inst, /Aceptar invitación/);
  assert.match(inst, /como instructora en el equipo de Casa Pilates en Tentare\./);

  const rec = correoInvitacionEquipo({ nombre: 'Lola', propietariaNombre: 'Carmen', estudioNombre: 'Casa Pilates', rol: 'RECEPCION', url: URL });
  assert.match(rec, /Crear mi cuenta o entrar/);
  assert.match(rec, /en Tentare Manager\./);
  assert.ok(!rec.includes('Como instructora'));
});

test('un rol desconocido no deja un hueco en la frase', () => {
  const html = correoInvitacionEquipo({ nombre: 'X', propietariaNombre: 'Carmen', estudioNombre: 'Casa Pilates', rol: 'RARO', url: URL });
  assert.match(html, /como miembro del equipo/);
});

test('la petición de disponibilidad dice cuánto cuesta responder', () => {
  const html = correoSolicitudDisponibilidad({ nombre: 'Marta', propietariaNombre: 'Carmen', estudioNombre: 'Casa Pilates', url: URL });
  assert.match(html, /Menos de un minuto/);
  assert.match(html, /Marcar mi disponibilidad/);
});

test('el contacto a una sustituta y su recordatorio no dicen lo mismo', () => {
  const base = { toName: 'Marta', estudioNombre: 'Casa Pilates', claseNombre: 'Reformer', cuando: 'lunes · 18:00', url: URL };
  const primero = correoContactoSustituta(base);
  const segundo = correoContactoSustituta({ ...base, recordatorio: true });
  assert.match(primero, /has salido como la mejor opción/);
  assert.match(segundo, /aún no tenemos tu respuesta/);
  assert.notEqual(primero, segundo);
});

test('una baja recién avisada no se pinta como alarma; una clase sin cubrir sí', () => {
  const base = { estudioNombre: 'Casa Pilates', claseNombre: 'Reformer', cuando: 'lunes · 18:00', urlPanel: URL, candidataNombre: 'Marta' };
  const baja = correoAlertaPropietaria({ ...base, tipo: 'baja', yaContactando: true });
  const agotada = correoAlertaPropietaria({ ...base, tipo: 'agotada', nNetwork: 2 });
  const sinCubrir = correoAlertaPropietaria({ ...base, tipo: 'sin_sustituta' });
  assert.ok(!baja.includes(TENTARE.alerta), 'si todo pinta urgente, nada lo parece');
  assert.match(baja, /no tienes que hacer nada ahora mismo/);
  assert.ok(agotada.includes(TENTARE.alerta));
  assert.ok(sinCubrir.includes(TENTARE.alerta));
});

test('Network solo se menciona cuando se agotó el ranking, y solo con el número', () => {
  const base = { estudioNombre: 'Casa Pilates', claseNombre: 'Reformer', cuando: 'lunes', urlPanel: URL };
  assert.match(correoAlertaPropietaria({ ...base, tipo: 'agotada', nNetwork: 2 }), /Hay 2 profesionales de Tentare Network/);
  assert.ok(!correoAlertaPropietaria({ ...base, tipo: 'agotada', nNetwork: 0 }).includes('Tentare Network que'));
  assert.ok(!correoAlertaPropietaria({ ...base, tipo: 'sin_respuesta', nNetwork: 2 }).includes('Tentare Network que'));
});

test('el cierre para la gestoría lleva cifras con dos decimales y filtra el trimestre', () => {
  const html = correoCierreGestoria({
    estudioNombre: 'Casa Pilates', anio: 2026, trimestre: 3, nombreAdjunto: 'cierre.csv',
    totales: { base: 8264.456, cuota: 1735.544, total: 10000, numFacturas: 212, numManuales: 3 },
    trimestres: [
      { trimestre: 2, base: 1, cuota: 1, total: 2 },
      { trimestre: 3, base: 8264.456, cuota: 1735.544, total: 10000 },
    ],
  });
  assert.match(html, /Cierre T3 2026/);
  assert.ok(!html.includes('8264,456') && !html.includes('8.264,456'), 'tres decimales en un documento fiscal');
  assert.ok(!html.includes('>T2<') && !html.includes('>T3<'), 'un envío trimestral no repite en agenda lo que ya dicen las cifras');
  assert.match(html, /10\.000,00 €/);
  assert.match(html, /font-size:17px;[^"]*white-space:nowrap;">10\.000,00 €/, 'la cifra larga baja de cuerpo y no se parte');
  assert.match(html, /3 ingreso\(s\) añadido\(s\) a mano/);
  assert.match(html, /no sustituye la presentación de impuestos/);
});

test('el cierre de año sí desglosa los trimestres en agenda', () => {
  const html = correoCierreGestoria({
    estudioNombre: 'Casa Pilates', anio: 2026, trimestre: null, nombreAdjunto: 'cierre.csv',
    totales: { base: 20, cuota: 4, total: 24, numFacturas: 8, numManuales: 0 },
    trimestres: [1, 2, 3, 4].map(n => ({ trimestre: n, base: 5, cuota: 1, total: 6 })),
  });
  assert.match(html, /Cierre de año 2026/);
  for (const n of [1, 2, 3, 4]) assert.match(html, new RegExp(`>T${n}<`));
  assert.match(html, /font-size:26px;[^"]*">24,00 €/, 'las cifras cortas mantienen el cuerpo grande');
});

test('la referencia de Network no obliga a crear cuenta', () => {
  const html = correoReferenciaSolicitud({ nombreReferente: 'Laura', profesionalNombre: 'Marta', relacion: 'compañeras', url: URL });
  assert.match(html, /No hace falta crear ninguna cuenta/);
  assert.match(html, /\(compañeras\)/);
  assert.match(html, /caduca en 7 días/);
});

test('ningún correo al equipo lleva colores de un estudio', () => {
  const kit = new Set(Object.values(TENTARE).map(c => c.toUpperCase()));
  const correos = [
    correoInvitacionEquipo({ nombre: 'M', propietariaNombre: 'C', estudioNombre: 'E', rol: 'INSTRUCTOR', url: URL }),
    correoSolicitudDisponibilidad({ nombre: 'M', propietariaNombre: 'C', estudioNombre: 'E', url: URL }),
    correoContactoSustituta({ toName: 'M', estudioNombre: 'E', claseNombre: 'R', cuando: 'l', url: URL }),
    correoReferenciaSolicitud({ nombreReferente: 'L', profesionalNombre: 'M', url: URL }),
  ];
  for (const html of correos) {
    const fuera = [...new Set([...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(m => m[0].toUpperCase()))].filter(h => !kit.has(h));
    assert.deepEqual(fuera, []);
    assert.equal((html.match(/mso-padding-alt/g) ?? []).length, 1, 'una sola llamada a la acción');
  }
});
