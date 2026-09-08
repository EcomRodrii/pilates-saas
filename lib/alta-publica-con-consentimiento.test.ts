import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: ninguna ruta PÚBLICA puede dar de alta a una socia sin recoger su
// aceptación.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// `socios.aceptacion_origen` tiene un CHECK ('PORTAL','MOSTRADOR') desde la
// migración 0109, justificada con el art. 7.1 del RGPD: hay que poder demostrar
// QUIÉN consintió y por qué vía. Pero en `registrarSociaPublica` el parámetro
// `aceptacion` es OPCIONAL, así que quien no lo manda deja la columna a NULL —
// exactamente el estado que esa migración quería eliminar— y nada se lo impide.
//
// Pasó: `/api/public/alta-al-entrar` creaba socias sin fecha, sin firma y sin
// origen, por la puerta de Google. La auditoría del 4-sep-2026 lo encontró y lo
// dejó anotado como «candidato a borrar»; siguió vivo cuatro días más. Se
// borró, y esto es lo que impide que vuelva por otra puerta.
//
// ── Qué NO cubre ─────────────────────────────────────────────────────────────
// Solo `app/api/public/**`. `app/api/oauth/v1/clientas` queda fuera a
// propósito: ahí el alta la hace el estudio contra su propia API con sus
// credenciales, que es el caso 'MOSTRADOR' y no un autoservicio.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// La ruta nueva tiene que recoger y pasar `aceptacion`. No vale quitarla de
// aquí: lo que se está saltando no es un test, es la prueba de consentimiento.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const PUBLICAS = join(RAIZ, 'app/api/public');

/** Todos los `route.ts` bajo `app/api/public/`, a cualquier profundidad. */
function rutasPublicas(dir: string, halladas: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rutasPublicas(p, halladas);
    else if (e.name === 'route.ts') halladas.push(p);
  }
  return halladas;
}

const rutas = rutasPublicas(PUBLICAS);

test('se han encontrado rutas públicas de verdad', () => {
  // Sin esto, un cambio de estructura de carpetas dejaría el test en verde
  // recorriendo una lista vacía. Verde por vacío, no.
  assert.ok(rutas.length > 15, `solo ${rutas.length} rutas públicas: ¿cambió la estructura?`);
  assert.ok(
    rutas.some((r) => r.endsWith(join('public', 'socio', 'route.ts'))),
    'no se ve app/api/public/socio/route.ts, que es el alta pública de referencia',
  );
});

test('toda ruta pública que da de alta a una socia pasa su aceptación', () => {
  const sinConsentimiento: string[] = [];

  for (const ruta of rutas) {
    const fuente = readFileSync(ruta, 'utf8');
    if (!fuente.includes('registrarSociaPublica(')) continue;

    // El objeto que se le pasa. Se mira que nombre `aceptacion` — no se
    // comprueba su contenido, que es cosa del tipo y de la propia función.
    const i = fuente.indexOf('registrarSociaPublica(');
    const trozo = fuente.slice(i, i + 900);
    if (!/\baceptacion\b/.test(trozo)) {
      sinConsentimiento.push(ruta.slice(RAIZ.length + 1));
    }
  }

  assert.deepEqual(
    sinConsentimiento, [],
    'rutas públicas que crean socias SIN traza de consentimiento (aceptacion_origen quedaría NULL, '
    + `art. 7.1 RGPD): ${sinConsentimiento.join(', ')}`,
  );
});

test('sigue existiendo al menos un alta pública que sí la pasa', () => {
  // Si un refactor dejara CERO rutas llamando a `registrarSociaPublica`, el
  // test de arriba pasaría sin comprobar nada. Esta es su contrapartida.
  const conAlta = rutas.filter((r) => readFileSync(r, 'utf8').includes('registrarSociaPublica('));
  assert.ok(conAlta.length > 0, 'ninguna ruta pública da de alta: el guardián de arriba no está comprobando nada');
});
