import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ── AUT-A (auditoría 2026-09-24) ────────────────────────────────────────────
// El panel tiene un botón «Activar» (title: «Activar como campaña en curso»)
// que escribe `estado='ACTIVA'`. Ningún cron ni función de Inngest barre ese
// estado: `procesarEnvioCampana` solo reacciona a CAMPANA_ENVIAR, que emite
// /api/marketing/campanas/[id]/enviar, y su compare-and-set solo aceptaba
// BORRADOR|PROGRAMADA. Como tampoco existe transición de vuelta a BORRADOR, la
// campaña quedaba con badge verde «Activa», cero emails, cero errores y sin
// forma de enviarla NUNCA. Estos dos guardianes atan la UI con el backend:
// son exactamente el par de gemelos que divergió.

const RUTA_ENVIAR = readFileSync(
  new URL('../../app/api/marketing/campanas/[id]/enviar/route.ts', import.meta.url), 'utf8');
const PANEL = readFileSync(
  new URL('../../app/(dashboard)/marketing/page.tsx', import.meta.url), 'utf8');

test('⚠️ una campaña ACTIVA se puede enviar: el CAS de la ruta la acepta', () => {
  const i = RUTA_ENVIAR.indexOf("update({ estado: 'ENVIANDO' })");
  assert.ok(i > 0, 'no se encuentra el CAS de envío: revisa este guardián');
  // Ventana amplia a propósito: entre el update y el `.in(...)` hay un
  // comentario largo que explica por qué ACTIVA entra y PAUSADA no.
  const cas = RUTA_ENVIAR.slice(i, RUTA_ENVIAR.indexOf('.select(', i));
  assert.match(cas, /\.in\('estado', \[[^\]]*'ACTIVA'[^\]]*\]\)/,
    'sin ACTIVA, el botón «Activar» del panel deja la campaña muerta e irreversible');
  assert.doesNotMatch(cas, /\.in\('estado', \[[^\]]*'PAUSADA'[^\]]*\]\)/,
    'PAUSADA no debe enviarse: pausada significa pausada, y tiene su «Reanudar»');
});

test('⚠️ y el panel ofrece «Enviar» en ACTIVA, no solo en BORRADOR/PROGRAMADA', () => {
  const i = PANEL.indexOf('handleEnviarCampana(c)');
  assert.ok(i > 0, 'no se encuentra el botón Enviar: revisa este guardián');
  const condicion = PANEL.slice(Math.max(0, i - 400), i);
  assert.match(condicion, /c\.estado === 'ACTIVA'/,
    'si la ruta acepta ACTIVA y la UI esconde el botón, la campaña sigue sin salida');
});
