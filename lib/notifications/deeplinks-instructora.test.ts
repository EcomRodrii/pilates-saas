// Tentare Core se retiró (14-sep-2026): la instructora trabaja en la app del
// estudio y el panel la manda allí. Un aviso que la llevara al panel no se
// rompe (la puerta la redirige), pero la deja en «Hoy» en vez de en lo que el
// aviso le cuenta. Esta guardia fija que cada aviso a INSTRUCTOR abre ya la app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTOS, REGLAS, ROLES_POR_AUDIENCIA, plantillaDe } from './catalog.ts';

const DATOS = { slug: 'pilates-centro', sesionId: 's-1', conversacionId: 'c-1', tipo: 'EQUIPO', socioId: 'so-1' };

test('todo aviso a una instructora abre la app del estudio o Network, nunca el panel', () => {
  const alPanel: string[] = [];
  for (const tipo of Object.values(EVENTOS)) {
    const regla = REGLAS[tipo];
    if (!regla || !ROLES_POR_AUDIENCIA[regla.audiencia].includes('INSTRUCTOR')) continue;
    const destino = plantillaDe(tipo, 'INSTRUCTOR')?.deepLink?.(DATOS);
    if (!destino) continue;
    if (!/^\/(portal|network)(\/|$)/.test(destino)) alPanel.push(`${tipo} → ${destino}`);
  }
  assert.deepEqual(alPanel, []);
});

test('sin slug ningún aviso a una instructora genera un `/portal//…` roto', () => {
  const rotos: string[] = [];
  for (const tipo of Object.values(EVENTOS)) {
    const regla = REGLAS[tipo];
    if (!regla || !ROLES_POR_AUDIENCIA[regla.audiencia].includes('INSTRUCTOR')) continue;
    const destino = plantillaDe(tipo, 'INSTRUCTOR')?.deepLink?.({ ...DATOS, slug: '' });
    if (destino && destino.includes('//')) rotos.push(`${tipo} → ${destino}`);
  }
  assert.deepEqual(rotos, []);
});

test('un mensaje de una alumna la lleva a esa conversación en la app', () => {
  const p = plantillaDe(EVENTOS.MENSAJE_RECIBIDO, 'INSTRUCTOR');
  assert.equal(p?.deepLink?.({ ...DATOS, tipo: 'ALUMNA_INSTRUCTORA' }), '/portal/pilates-centro/equipo/mensajes/c-1');
});
