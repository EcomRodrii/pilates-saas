import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// Auditoría 62ª pasada (SEC-3): tres fuentes distintas del mínimo de
// contraseña (`/login` decía 6, `/clave-nueva` y `password-regla.ts` decían 8
// cada uno por su cuenta). Guardián de inspección de fuente —igual que
// lib/reservas/reserva-mostrador.test.ts— porque el comportamiento vive en un
// atributo HTML de un componente de cliente.

test('/login importa MINIMO_PASSWORD, no repite el número a mano', () => {
  const src = leer('app/login/page.tsx');
  assert.match(src, /import \{ MINIMO_PASSWORD \} from '@\/lib\/student\/password-regla'/);
  assert.doesNotMatch(src, /minLength=\{6\}/, 'volvió el mínimo suelto de 6, por debajo del real del proyecto');
});

test('/login solo exige el mínimo al CREAR cuenta, nunca al entrar', () => {
  const src = leer('app/login/page.tsx');
  assert.match(
    src, /minLength=\{modo === 'crear' \? MINIMO_PASSWORD : undefined\}/,
    'una contraseña ya correcta pero corta no puede quedar bloqueada por el navegador al iniciar sesión',
  );
});

test('/clave-nueva importa MINIMO_PASSWORD, no una constante local propia', () => {
  const src = leer('app/clave-nueva/page.tsx');
  assert.match(src, /import \{ MINIMO_PASSWORD \} from '@\/lib\/student\/password-regla'/);
  assert.doesNotMatch(src, /const MIN_LEN/, 'volvió una segunda fuente local del mínimo');
});
