// Todo aviso que llega al PANEL lleva a algún sitio.
//
// Nace de un fallo real (24-sep-2026): «Penalización sin cobrar» —un aviso de
// DINERO, con el id de la clienta a mano— no tenía `deepLink`, así que al
// pulsarlo el clic solo lo marcaba como leído y no llevaba a ninguna parte. Un
// aviso sin destino no es un aviso, es una notificación que hay que ir a buscar.
//
// La excepción es una lista corta y explicada, no un «ya lo miraremos»: solo
// puede entrar aquí un aviso cuyo contenido no señale NINGUNA pantalla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTOS, REGLAS, ROLES_POR_AUDIENCIA, plantillaDe } from './catalog.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SIN_DESTINO_A_PROPOSITO = new Set([
  // Un error interno con su mensaje: no hay una pantalla a la que llevarla.
  `${EVENTOS.SISTEMA_ERROR}#PROPIETARIO`,
]);

// Ids que las plantillas pueden necesitar para armar su enlace.
const DATOS = { slug: 'pilates-centro', sesionId: 's-1', socioId: 'so-1', vacanteId: 'v-1', solicitudId: 'sol-1' };

test('todo aviso al panel (propietaria, gerencia, recepción) tiene destino', () => {
  const sinDestino: string[] = [];
  for (const tipo of Object.values(EVENTOS)) {
    const regla = REGLAS[tipo];
    if (!regla) continue;
    for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const) {
      if (!ROLES_POR_AUDIENCIA[regla.audiencia].includes(rol)) continue;
      const plantilla = plantillaDe(tipo, rol);
      if (!plantilla) continue;
      if (plantilla.deepLink?.(DATOS)) continue;
      if (SIN_DESTINO_A_PROPOSITO.has(`${tipo}#${rol}`)) continue;
      sinDestino.push(`${tipo}#${rol}`);
    }
  }
  assert.deepEqual(sinDestino, [], 'avisos que al pulsarlos solo se marcan como leídos');
});

test('«Penalización sin cobrar» lleva a la ficha de la clienta que no ha aceptado el contrato', () => {
  const destino = plantillaDe(EVENTOS.PAGO_PENALIZACION_BLOQUEADA, 'PROPIETARIO')?.deepLink?.(DATOS);
  assert.equal(destino, '/clientas/so-1');
  // Y quien lo emite manda ese id: sin él el enlace saldría a `/clientas/`.
  const emit = readFileSync(join(import.meta.dirname, 'emit.ts'), 'utf8');
  assert.match(emit, /emitirPenalizacionBloqueada[\s\S]*?data: \{ socioId: p\.socioId/);
});
