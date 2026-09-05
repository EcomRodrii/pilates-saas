import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Test de FUENTE: el aviso «¿qué tal la clase?» enlaza a mis-reservas/[reservaId]
// porque AHÍ vive la tarjeta de valorar. Si alguien la quita de esa pantalla (o
// la mueve) sin cambiar el deep link, el aviso llevaría a un sitio sin nada que
// hacer — y ninguna otra prueba lo vería. Existe porque las dos piezas nacieron
// en ramas distintas (rondas 3 y 7) y la revisión adversarial lo cazó.
const raiz = join(import.meta.dirname, '..', '..');
const catalogo = readFileSync(join(raiz, 'lib/notifications/catalog.ts'), 'utf8');
const pagina = readFileSync(join(raiz, 'app/portal/[slug]/mis-reservas/[reservaId]/page.tsx'), 'utf8');
const deepLinks = readFileSync(join(raiz, 'lib/student/deep-links.ts'), 'utf8');

test('clase.valorar enlaza a reservas/<id> y esa pantalla tiene la tarjeta de valorar', () => {
  assert.match(catalogo, /VALORAR_CLASE\}#SOCIA`\]:[\s\S]*?\/reservas\/\$\{s\(d\.reservaId\)\}/);
  assert.match(pagina, /<ValorarClase\b/);
  assert.match(pagina, /estado === 'asistida'/);
});

test('la app traduce reservas/<id> conservando el id', () => {
  assert.match(deepLinks, /mis-reservas\/\$\{mr\[1\]\}/);
});
