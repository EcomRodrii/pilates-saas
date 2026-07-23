/**
 * Prueba de humo de Fiskaly SIGN ES / Veri*Factu (entorno TEST).
 *
 * Recorre la cadena completa contra el entorno de PRUEBAS de Fiskaly, que NO
 * transmite a la AEAT: auth → taxpayer → signer → client → factura, e imprime el
 * QR y el estado. Sirve para confirmar que tus credenciales y el contrato están
 * bien antes de tocar producción.
 *
 * Lo ejecutas TÚ con tus credenciales de TEST (nunca las manejo yo):
 *
 *   FISKALY_API_KEY=... FISKALY_API_SECRET=... FISKALY_ENV=test \
 *     npx tsx scripts/fiskaly-smoke.ts
 *
 * (o añade esas variables a .env.local y usa `npx tsx --env-file=.env.local ...`)
 */
import { randomUUID } from 'node:crypto';
import { fiskalyConfigurado, fiskalyEntorno, asegurarEmisor, firmarFactura } from '../lib/billing/fiskaly.ts';

async function main() {
  if (!fiskalyConfigurado()) {
    console.error('✗ Faltan FISKALY_API_KEY y/o FISKALY_API_SECRET en el entorno.');
    process.exit(1);
  }
  if (fiskalyEntorno() !== 'test') {
    console.error('✗ FISKALY_ENV no es "test". Aborto por seguridad (esto NO debe correr contra live).');
    process.exit(1);
  }

  console.log('· Entorno:', fiskalyEntorno());

  // NIF de prueba válido para TEST. Cámbialo por el tuyo de pruebas si Fiskaly lo exige.
  const emisor = {
    legalName: 'Estudio de Pruebas Tentare SL',
    nif: 'B75777847',
    direccion: 'Calle Falsa 123',
    ciudad: 'Madrid',
    codigoPostal: '28001',
    email: 'pruebas@tentare.app',
  };

  const signerId = randomUUID();
  const clientId = randomUUID();
  console.log('· Creando emisor (taxpayer → signer → client)…');
  await asegurarEmisor(emisor, signerId, clientId);
  console.log('  signer_id:', signerId);
  console.log('  client_id:', clientId);

  const numero = `TEST-${Date.now()}`;
  const total = 25;
  const tipoIva = 21;
  const base = Math.round((total / (1 + tipoIva / 100)) * 100) / 100;

  console.log('· Firmando factura simplificada…', numero);
  const res = await firmarFactura({
    clientId,
    invoiceId: randomUUID(),
    numero,
    simplificada: true,
    concepto: 'Clase de Pilates (prueba de humo)',
    totalConIva: total,
    lineas: [{ texto: 'Clase de Pilates', base, total, tipoIva }],
  });

  console.log('\n✓ Factura firmada por Fiskaly:');
  console.log('  id           :', res.id);
  console.log('  estado       :', res.estado);
  console.log('  transmisión  :', res.transmision, '(en TEST no se envía a la AEAT)');
  console.log('  QR (URL AEAT):', res.qrUrl);
  console.log('  QR (imagen)  :', res.qrImagen ? `${res.qrImagen.slice(0, 48)}… (${res.qrImagen.length} chars)` : null);
  console.log('  CSV AEAT     :', res.csv ?? '(null en TEST — se rellena tras transmisión real)');
  console.log('  leyenda      :', res.texto);
}

main().catch((e) => {
  console.error('\n✗ Falló la prueba de humo:', e instanceof Error ? e.message : e);
  process.exit(1);
});
