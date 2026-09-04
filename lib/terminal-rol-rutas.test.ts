import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Las rutas del datáfono que TOCAN LA CAJA comprueban el rol, no solo la sesión.
//
// Todas usan service-role, así que la RLS de la migración 0112 no está debajo:
// la única cerradura es la de la propia ruta. `/api/terminal/cobrar` sí la tenía
// (`puedeMoverDinero`, S-2), pero sus hermanas `lector` y `reconciliar` se
// quedaron en `verificarSesionStaff` — o sea, en "¿eres del equipo?". Con eso,
// un INSTRUCTOR o un MANAGER podía reemparejar el datáfono del estudio o dar por
// cuadrado un cobro del cierre de caja.
//
// Es el fallo repetido de este repo: arreglar un endpoint y no su gemelo. Por
// eso se blinda la FAMILIA entera y no solo la ruta que se arregló.
//
// Fuera de la lista a propósito: `/api/terminal/estado` y
// `/api/terminal/reconciliaciones` solo LEEN (estado de un PaymentIntent, lista
// de pendientes). Que un instructor pueda verlas es otra pregunta —y sigue
// abierta—, pero no es la de esta familia: aquí se comprueba quién puede
// ESCRIBIR sobre la caja.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

const RUTAS_DE_CAJA = [
  'app/api/terminal/cobrar/route.ts',
  'app/api/terminal/lector/route.ts',
  'app/api/terminal/reconciliar/route.ts',
];

// Trocea el fuente por método HTTP exportado: cada handler tiene que traer su
// propio guardia. Uno solo arriba del fichero no protege a los demás.
function handlers(fuente: string): Array<{ metodo: string; cuerpo: string }> {
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;
  const inicios: Array<{ metodo: string; desde: number }> = [];
  for (const m of fuente.matchAll(re)) inicios.push({ metodo: m[1], desde: m.index as number });
  return inicios.map((h, i) => ({
    metodo: h.metodo,
    cuerpo: fuente.slice(h.desde, i + 1 < inicios.length ? inicios[i + 1].desde : undefined),
  }));
}

for (const rel of RUTAS_DE_CAJA) {
  test(`${rel}: todos sus métodos comprueban el rol con puedeMoverDinero`, () => {
    const fuente = leer(rel);
    const metodos = handlers(fuente);
    assert.ok(metodos.length > 0, `no encuentro ningún handler exportado en ${rel}`);
    for (const { metodo, cuerpo } of metodos) {
      assert.ok(
        cuerpo.includes('puedeMoverDinero(sesion.rol)'),
        `${metodo} de ${rel} no comprueba el rol. La ruta usa service-role (sin RLS ` +
        'debajo), así que un INSTRUCTOR o un MANAGER llegaría a la caja. Copia el ' +
        'guardia de /api/terminal/cobrar.',
      );
      const guardia = cuerpo.indexOf('puedeMoverDinero(sesion.rol)');
      const cierre = cuerpo.indexOf('status: 403', guardia);
      assert.ok(
        cierre > guardia && cierre - guardia < 200,
        `${metodo} de ${rel} llama a puedeMoverDinero pero no corta con un 403.`,
      );
    }
  });

  test(`${rel}: el guardia de rol va antes de tocar Stripe o la base de datos`, () => {
    for (const { metodo, cuerpo } of handlers(leer(rel))) {
      const guardia = cuerpo.indexOf('puedeMoverDinero(sesion.rol)');
      for (const efecto of ['admin.from(', 's.stripe.', 'stripe.terminal.', 'studioConnect(']) {
        const pos = cuerpo.indexOf(efecto);
        if (pos < 0) continue;
        assert.ok(
          guardia < pos,
          `${metodo} de ${rel} usa '${efecto}' ANTES de comprobar el rol: el guardia ` +
          'tiene que ir pegado a la verificación de sesión, no después del trabajo.',
        );
      }
    }
  });
}
