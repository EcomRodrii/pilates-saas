import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// La ruta que comprueba el código del correo (`/api/auth/otp/verificar`) la usan
// la app del estudio, la app Tentare (/app), /reservar y el alta del equipo. Se
// lee como texto: es una ruta de Next y este runner no la importa.
const ruta = readFileSync(join(process.cwd(), 'app/api/auth/otp/verificar/route.ts'), 'utf8')
  .replace(/\/\/[^\n]*/g, '');

test('acepta el código de ALTA y el de ENTRAR: tipo `email`, nunca `signup`', () => {
  // Con `signup`, gotrue solo mira el código del correo de alta. Una cuenta que
  // ya existe recibe el de «entrar» (Magic Link, solo código desde #2522), y
  // con `signup` ninguna alumna con cuenta podía entrar con él.
  assert.match(ruta, /verifyOtp\(\{ email, token, type: 'email' \}\)/);
  assert.doesNotMatch(ruta, /type: 'signup'/);
});

test('los intentos que quedan solo salen si el limitador los ha contado de verdad', () => {
  // Sin recuento (fail-open) `remaining` vale el máximo: decir «te quedan 6»
  // sería inventarlo.
  assert.match(ruta, /porEmail\.resetAt \? \{ intentosRestantes: porEmail\.remaining \} : \{\}/);
});
