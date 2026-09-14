import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: Tentare Core retirado (decisión del fundador, 14-sep-2026).
//
// La instructora trabaja en la app del estudio, con sus propias rutas
// (`/api/portal/instructora/*`, acotadas a ella en servidor). Las rutas del
// PANEL tenían vías propias para ella —su disponibilidad, sus ausencias, bajas,
// cancelar o devolver bonos de sus clases, abrir chats, su liquidación, el
// calendario— que ya no usa nadie. Una vía sin usuario es superficie sin dueño:
// se cierran, y esto impide que vuelvan copiando código viejo.
//
// Si falla, no se quita: lo nuevo para la instructora va a la app del estudio.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('las rutas del panel que solo servían a la instructora ya no existen', () => {
  for (const ruta of ['app/api/mi-disponibilidad/route.ts', 'app/api/clases/avisar-creada-por-instructor/route.ts']) {
    assert.equal(existsSync(join(RAIZ, ruta)), false, ruta);
  }
});

test('ninguna ruta del panel abre una vía propia a la instructora', () => {
  const RUTAS = [
    'app/api/equipo/ausencias/route.ts',
    'app/api/reservas/cancelar/route.ts',
    'app/api/reservas/devolver-bonos/route.ts',
    'app/api/equipo/liquidaciones/route.ts',
    'app/api/mensajeria/conversaciones/route.ts',
    'app/api/sustituciones/route.ts',
    'app/api/calendario/route.ts',
  ];
  for (const ruta of RUTAS) {
    const src = sinComentarios(leer(ruta));
    assert.doesNotMatch(src, /rol !== 'INSTRUCTOR'/, `${ruta}: una rama que deja pasar a la instructora`);
    assert.doesNotMatch(src, /esInstructoraPropia|soloSiInstructorEs|resolverInstructorPropio|origen: sesion\.rol === 'INSTRUCTOR'/, ruta);
  }
});

test('leer un pase y ver los correos rebotados exigen rol, no solo sesión de personal', () => {
  // Salieron de la revisión de seguridad de la retirada: el pase dejaba a la
  // instructora marcar cualquier reserva del estudio (créditos, rachas, Kisi) y
  // los rebotes daban las direcciones de todas las socias a cualquier sesión.
  const pase = sinComentarios(leer('app/api/checkin/pase/route.ts'));
  const verifica = pase.indexOf('verificarSesionStaff(req)');
  const gate = pase.indexOf('if (!puedeGestionarCalendario(sesion.rol))');
  assert.ok(verifica > 0 && gate > verifica, 'checkin/pase: rol comprobado justo tras la sesión');
  assert.ok(gate < pase.indexOf('checkinPublico('), 'checkin/pase: antes de marcar nada');

  const rebotes = sinComentarios(leer('app/api/clientas/rebotes/route.ts'));
  const gateRebotes = rebotes.indexOf('if (!puedeGestionarClientas(sesion.rol))');
  assert.ok(gateRebotes > 0 && gateRebotes < rebotes.indexOf("from('socios')"), 'clientas/rebotes: rol antes de leer las direcciones');
});

test('el calendario, las bajas y las ausencias del panel responden 403 a la instructora', () => {
  const explicita = /if \((sesion|staff)\.rol === 'INSTRUCTOR'\) return NextResponse\.json\(\{ error: 'No tienes permiso para esto' \}, \{ status: 403 \}\)/;
  for (const ruta of ['app/api/calendario/route.ts', 'app/api/sustituciones/route.ts', 'app/api/equipo/ausencias/route.ts']) {
    assert.match(sinComentarios(leer(ruta)), explicita, ruta);
  }
});
