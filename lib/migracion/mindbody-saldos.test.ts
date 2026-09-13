import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarDeterminista } from './clasificador.ts';

// Evaluación del 13-sep: un export de clientas con la forma del de Mindbody —
// el bono de cada clienta en «Pricing Option», su saldo en «Remaining» y la
// caducidad en «Expiration Date», todo en la MISMA fila— se importaba como
// clientas y avisaba «No se importan estas columnas: «Pricing Option»,
// «Remaining», «Expiration Date»». Los saldos de bono se quedaban fuera: 250
// alumnas con sesiones ya pagadas, a cargar a mano.
const MINDBODY = [
  'Client ID,First Name,Last Name,Email,Mobile Phone,Birth Date,Pricing Option,Remaining,Expiration Date,Last Visit',
  '10021,Marta,Soler Puig,marta@test.com,612345001,1984-03-12,10 Class Pack Reformer,6,2026-11-30,2026-09-10',
  '10022,Núria,Vidal Ferrer,nuria@test.com,612345002,1979-07-02,Monthly Unlimited,,2026-10-01,2026-09-11',
  '10023,Elena,Castro Ruiz,elena@test.com,612345003,1990-11-25,10 Class Pack Reformer,2,2026-10-15,2026-08-28',
].join('\n');

test('un export tipo Mindbody trae clientas Y sus bonos con el saldo', () => {
  const plan = analizarDeterminista([{ nombre: 'clients.csv', contenido: MINDBODY }]);
  const clientas = plan.archivos.find(a => a.entidad === 'socias');
  const bonos = plan.archivos.find(a => a.entidad === 'membresias');

  assert.ok(clientas, 'tiene que seguir importando las clientas');
  assert.equal(clientas.ok, 3);
  assert.ok(bonos, 'el bono de la misma fila tiene que salir como bloque propio');
  assert.equal(bonos.ok, 3);

  const marta = bonos.muestra.find(m => (m as { email: string }).email === 'marta@test.com') as
    { plan: string; sesiones: number | null; fechaFin: string | null };
  assert.equal(marta.plan, '10 Class Pack Reformer');
  assert.equal(marta.sesiones, 6);
  assert.equal(marta.fechaFin, '2026-11-30');

  // Y el orden de ejecución crea las clientas antes que sus bonos.
  assert.deepEqual(plan.orden, ['socias', 'membresias']);
});

test('ya no avisa de que el saldo o la caducidad se quedan fuera', () => {
  const plan = analizarDeterminista([{ nombre: 'clients.csv', contenido: MINDBODY }]);
  // Solo el aviso de columnas IGNORADAS: el bloque de bonos sí las nombra,
  // pero para decir de dónde salen.
  const ignoradas = plan.archivos.flatMap(a => a.avisos).filter(av => av.startsWith('No se importan estas columnas')).join(' ');
  for (const col of ['Pricing Option', 'Remaining', 'Expiration Date']) {
    assert.ok(!ignoradas.includes(`«${col}»`), `sigue diciendo que ignora «${col}»: ${ignoradas}`);
  }
});
