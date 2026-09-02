/**
 * Comprobación del buzón de Spacemail antes del primer envío en frío.
 *
 * Existe porque entre "las variables están puestas" y "el correo llega" hay
 * cuatro cosas que fallan por separado y ninguna avisa sola: credenciales mal,
 * el puerto cerrado por la red, el buzón sin SMTP saliente habilitado, y el
 * correo que sale pero aterriza en spam. Descubrirlo con el primer lote de 10
 * estudios reales delante significa quemar diez direcciones que no se pueden
 * volver a usar.
 *
 * Dos modos:
 *
 *   npm run spacemail:check              → solo comprueba. No envía nada.
 *   npm run spacemail:check -- --enviar  → manda UN correo de prueba a tu propio buzón.
 *
 * ⚠️ Nunca imprime la contraseña, solo si está y cuánto mide. Una credencial
 * pegada en un log o en una captura es una credencial filtrada.
 *
 * ⚠️ Las credenciales las pones TÚ en .env.local (nunca las maneja Claude):
 *
 *     SPACEMAIL_USER=tucorreo@tentare.app
 *     SPACEMAIL_PASSWORD=la-del-buzon
 *     SPACEMAIL_FROM=Marcos · Tentare <tucorreo@tentare.app>   # opcional
 */
import { existsSync, readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';

const ROJO = '\x1b[31m', VERDE = '\x1b[32m', AMBAR = '\x1b[33m', GRIS = '\x1b[90m', FIN = '\x1b[0m';
let fallos = 0;
const ok = (m: string, d?: string) => console.log(`  ${VERDE}✓${FIN} ${m}${d ? ` ${GRIS}${d}${FIN}` : ''}`);
const mal = (m: string, arreglo: string) => {
  console.log(`  ${ROJO}✗${FIN} ${m}\n     ${GRIS}→ ${arreglo}${FIN}`);
  fallos++;
};
const nota = (m: string) => console.log(`  ${AMBAR}!${FIN} ${m}`);

// Se lee .env.local a mano: este script corre fuera de Next, que es quien
// normalmente lo carga. Mismo criterio que scripts/stripe-sandbox-check.mjs.
const env: Record<string, string> = {};
if (existsSync('.env.local')) {
  for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linea);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const leer = (k: string) => process.env[k] ?? env[k] ?? '';

console.log('\n── Credenciales ────────────────────────────────────────────');

const usuario = leer('SPACEMAIL_USER');
const clave = leer('SPACEMAIL_PASSWORD');
const remitente = leer('SPACEMAIL_FROM');

if (!existsSync('.env.local') && !process.env.SPACEMAIL_USER) {
  mal('no hay .env.local ni variables en el entorno', 'crea .env.local con SPACEMAIL_USER y SPACEMAIL_PASSWORD');
}
if (!usuario) mal('SPACEMAIL_USER sin definir', 'tu dirección completa, p. ej. marcos@tentare.app');
else if (!usuario.includes('@')) mal(`SPACEMAIL_USER no es una dirección: ${usuario}`, 'Spacemail autentica con el email COMPLETO, no con el nombre de usuario');
else ok('SPACEMAIL_USER', usuario);

if (!clave) mal('SPACEMAIL_PASSWORD sin definir', 'Spacemail Manager → tu buzón → contraseña');
else ok('SPACEMAIL_PASSWORD', `${clave.length} caracteres`);

if (remitente) {
  ok('SPACEMAIL_FROM', remitente);
  const dentro = remitente.match(/<([^>]+)>/)?.[1];
  if (dentro && usuario && dentro.toLowerCase() !== usuario.toLowerCase()) {
    // Casi todos los servidores rechazan enviar «en nombre de» otra dirección.
    mal(`SPACEMAIL_FROM apunta a ${dentro} pero el buzón es ${usuario}`,
      'tienen que coincidir, o Spacemail rechazará el envío');
  }
} else {
  nota(`SPACEMAIL_FROM sin definir — se usará "Marcos · Tentare <${usuario || '…'}>"`);
}

if (fallos > 0) {
  console.log(`\n${ROJO}${fallos} problema(s). Arréglalos antes de seguir.${FIN}\n`);
  process.exit(1);
}

// ── Conexión ────────────────────────────────────────────────────────────────
console.log('\n── Conexión SMTP ───────────────────────────────────────────');

const transporte = nodemailer.createTransport({
  host: 'mail.spacemail.com', port: 465, secure: true,
  auth: { user: usuario, pass: clave },
});

try {
  await transporte.verify();
  ok('mail.spacemail.com:465 acepta las credenciales');
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // Los tres fallos reales se arreglan de formas muy distintas, así que no se
  // resumen en un "no se pudo conectar".
  const arreglo = /auth/i.test(msg)
    ? 'usuario o contraseña incorrectos. Ojo: es la contraseña DEL BUZÓN, no la de tu cuenta de Spaceship'
    : /timeout|ETIMEDOUT|ECONNREFUSED/i.test(msg)
      ? 'no se llega al puerto 465. Puede ser tu red (algunos ISP y wifis públicas lo bloquean) — prueba desde otra conexión'
      : 'revisa que el buzón tenga SMTP saliente habilitado en Spacemail Manager';
  mal(`no conecta: ${msg}`, arreglo);
  console.log(`\n${ROJO}Sin conexión no se puede enviar nada.${FIN}\n`);
  process.exit(1);
}

// ── Envío de prueba ─────────────────────────────────────────────────────────
if (!process.argv.includes('--enviar')) {
  console.log(`\n${VERDE}Todo listo.${FIN} ${GRIS}Para mandarte un correo de prueba a ti mismo:${FIN}`);
  console.log(`${GRIS}  npm run spacemail:check -- --enviar${FIN}\n`);
  process.exit(0);
}

console.log('\n── Envío de prueba ─────────────────────────────────────────');

// Se importa el módulo REAL de envío, no una copia: si el pie de baja o las
// cabeceras cambian mañana, esta prueba prueba lo que de verdad sale.
const { enviarProspeccion, remitenteProspeccion } = await import('../lib/marketing/prospeccion-smtp.ts');

// A ti mismo, siempre. Este script no puede escribir a un estudio real ni por
// accidente: no acepta destinatario.
const resultado = await enviarProspeccion({
  to: usuario,
  asunto: 'Prueba de prospección — ignora este correo',
  cuerpo: `Hola,

Esto es el correo de prueba del sistema de prospección en frío. Si lo estás
leyendo, el camino completo funciona: credenciales, conexión, envío y pie legal.

Mira tres cosas antes de dar por bueno el primer lote de verdad:

1. Que NO haya caído en spam. Si cayó, arréglalo antes de escribir a nadie.
2. Que el remitente se vea como una persona: ${remitenteProspeccion()}
3. Que el pie de abajo lleve tu identidad y la vía de baja.`,
});

if (resultado.ok) {
  ok(`correo enviado a ${usuario}`);
  console.log(`\n${AMBAR}Ahora ábrelo.${FIN} ${GRIS}Que salga sin error no significa que llegue a la bandeja de entrada:`);
  console.log(`  · si está en SPAM, no envíes el primer lote todavía;`);
  console.log(`  · comprueba el remitente y el pie de baja;`);
  console.log(`  · responde "BAJA" para ver que te llega la respuesta.${FIN}\n`);
} else {
  mal(`no se envió: ${resultado.error}`, 'el error de arriba viene tal cual del servidor');
  process.exit(1);
}
