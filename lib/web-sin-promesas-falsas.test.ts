// ─────────────────────────────────────────────────────────────────────────────
// Guardia: la web comercial no vuelve a prometer lo que el producto no hace
// (fundador, 21-oct-2026: «corregir todas como propone»).
//
// Una auditoría de solo lectura encontró unas cuarenta frases falsas o
// exageradas en la web: facturas «con huella encadenada» que salen sin huella,
// una facturación que «viene apagada» y viene encendida en todos los estudios,
// cuotas que «se cobran solas por SEPA con Stripe» cuando el SEPA de Stripe está
// retirado, sustituciones autónomas «en todos los planes» que en Founding Studio
// de pago son un complemento, un widget «sin salir de tu web» que la primera vez
// lleva a tentare.app… Se corrigieron todas en el mismo PR. Esta guardia falla
// si vuelve una de las más claras.
//
// Qué NO mira, a propósito:
//   · El panel, la ayuda, los correos, la app de la alumna y el catálogo de
//     planes (lib/billing/catalogo-planes.ts): los vigila
//     lib/sin-promesas-falsas-producto.test.ts (#2824). Aquí solo la web
//     comercial, `public/llms.txt` y el prompt de los correos de prospección.
//   · Las líneas de comentario: tienen que poder contar qué se quitó y por qué.
//   · Los tests, que nombran las frases para comprobar que no están.
//
// Si un día una frase vuelve a ser verdad (Veri*Factu activo, por ejemplo), se
// quita su regla con el motivo en el PR: nunca se rodea con una excepción
// silenciosa.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ADDONS } from './billing/entitlements.ts';

const RAIZ = join(import.meta.dirname, '..');

/** La web comercial: lo que lee quien todavía no es cliente. */
const WEB = [
  'app/page.tsx', 'app/layout.tsx', 'app/precios', 'app/empieza', 'app/sobre-tentare', 'app/seguridad',
  'app/(legal)', 'app/comparativa', 'app/soluciones', 'app/funcionalidades', 'app/recursos', 'app/glosario',
  'components/landing', 'components/web', 'components/comparativa', 'components/soluciones',
  'components/funcionalidades', 'components/recursos', 'lib/recursos', 'lib/seo', 'lib/landing',
  'public/llms.txt', 'lib/ai/prospeccion-email-prompt.ts',
];

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ | /g, ' ');
const esComentario = (linea: string) => /^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(linea);

function ficheros(ruta: string): string[] {
  const abs = join(RAIZ, ruta);
  if (statSync(abs).isFile()) return [ruta];
  return readdirSync(abs).flatMap((n) => ficheros(join(ruta, n)));
}

function lineasDeLaWeb(): { donde: string; texto: string }[] {
  const out: { donde: string; texto: string }[] = [];
  for (const f of WEB.flatMap(ficheros)) {
    if (!/\.(tsx?|txt)$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
    readFileSync(join(RAIZ, f), 'utf8').split('\n').forEach((linea, i) => {
      if (esComentario(linea)) return;
      out.push({ donde: `${f}:${i + 1}`, texto: normalizar(linea) });
    });
  }
  return out;
}

/**
 * Reglas sobre el texto normalizado (minúsculas, sin tildes). `salvo`: si la
 * misma línea dice esto, la frase es verdad (p. ej. «con la sesión iniciada»).
 */
const REGLAS: { patron: RegExp; motivo: string; salvo?: RegExp }[] = [
  // Facturación (W1, W2).
  { patron: /huella encadenada en cada factura|(numeracion legal|facturas?) (correlativa )?(y|con) huella encadenada|encadenamiento por hash/,
    motivo: 'sin Veri*Factu —hoy no activo en ningún estudio— la factura sale sin huella ni QR (migr 20261002191517)' },
  { patron: /calcular la huella esta hecho|huella sha-256 encadenada', 'si, siempre'/,
    motivo: 'la huella no se calcula con Veri*Factu apagado' },
  { patron: /(factura\w*)[^.]{0,80}viene apagad|viene apagad[^.]{0,60}gestoria|dejalo apagado, que es como viene|si (la|lo) activas: viene apagad/,
    motivo: 'la facturación viene ENCENDIDA (`facturar_automatico` true de serie)' },
  // Cobros (W3).
  { patron: /(domiciliacion|adeudo) sepa a traves de (tu cuenta de )?stripe|con stripe: tarjeta, domiciliacion sepa|stripe \(tarjeta (y|o) (domiciliacion )?sepa\)|stripe conectado \(tarjeta y sepa\)|tarjeta y sepa directos a tu cuenta con stripe/,
    motivo: 'el SEPA de Stripe está retirado: la domiciliación va por remesa que el estudio presenta en su banco' },
  { patron: /se cobran solas con la tarjeta guardada o por adeudo sepa|se cobran solas con tarjeta o sepa|por adeudo sepa\. si una falla, se reintenta/,
    motivo: 'por SEPA nada se cobra solo ni se reintenta: la remesa la presenta el estudio' },
  // Planes (W6, W7, W8).
  { patron: /autonomas?,? en todos los planes|en todos los planes puede hacerlo sola|se cierra sin ti, en todos los planes|modo autonomo \(en todos los planes\)/,
    motivo: 'en Founding Studio de pago, Autónomo y Vacaciones son un complemento (ADDONS.sustituciones)' },
  { patron: /centro de control[^.]{0,60}\(en todos los planes\)/,
    motivo: 'en Founding Studio de pago, el Centro de Control es un complemento (ADDONS.decisiones)' },
  { patron: /lo que cambia es el tamano/,
    motivo: 'al pasar a Founding Studio de pago cambian también los complementos' },
  { patron: /recepcion no entra en la caja/,
    motivo: 'recepción sí entra en la caja (`puedeMoverDinero`); la que no entra es la gerencia' },
  // Datos de salud, informes (W9, W12, W13).
  { patron: /(detalle clinico|detalle de salud|ficha de salud)[^.]{0,40}solo (lo|la) ve la propietaria/,
    motivo: 'la instructora también ve la salud de sus alumnas (lib/datos-salud/acceso-instructora.ts)' },
  { patron: /\['(gerencia|recepcion)', 'si'/,
    motivo: 'Informes es solo de la propietaria (BLOQUEADO_RECEPCION y BLOQUEADO_MANAGER)' },
  { patron: /ordenad[ao] por (el |la )?peor|ordenado de peor a mejor/,
    motivo: 'el informe no ordena por margen: va por fecha, por franja y por plazas ocupadas' },
  // El widget (W10).
  { patron: /sin salir de tu web|sin salir (en ningun momento )?del dominio|sin redirigir a ninguna otra web|sin iframe, sin redireccion|sin codigo, sin redireccion/,
    motivo: 'sin sesión, el widget lleva la página entera a tentare.app/reservar (app/widget-bundle/main.tsx)',
    salvo: /sesion iniciada/ },
  // Lo demás.
  { patron: /(el|la) unic[oa] (software|herramienta|programa|plataforma)/, motivo: '«el único…» no se puede demostrar, y la propia web pone ✓ a otros' },
  { patron: /la socia actualiza su tarjeta desde su portal antes de que el cobro/, motivo: 'a la socia no se le avisa: el aviso es para la propietaria' },
  { patron: /la deja en pausa|pausarla, retomarla/, motivo: 'la alumna solo PIDE la pausa, y la aprueba el estudio' },
  { patron: /instructora, nivel y franja horaria/, motivo: 'en la página de reservas solo hay filtros de tipo e instructora' },
  { patron: /notas de sesion, campanas y/, motivo: 'las campañas están apagadas (MARKETING_MODULE_ENABLED = false)' },
  { patron: /radar de ocupacion/, motivo: 'el radar se retiró el 23-sep-2026 (#2252)' },
  { patron: /un email para algo que caduca/, motivo: 'la oferta de la lista de espera sí sale por email' },
  { patron: /independiente del de la clase|lista de espera por aparato/, motivo: 'manda el aforo de la clase y la cola es por clase' },
  { patron: /tres momentos distintos/, motivo: 'son tres intentos en total: el cobro y dos reintentos' },
  { patron: /te vas con todo/, motivo: 'la exportación no lleva horario, planes, equipo ni adjuntos' },
  { patron: /bajas que se cubren solas|la baja se cubre sola|tentare la cubre'/, motivo: 'el modo de serie es asistido: espera tu visto bueno' },
  { patron: /demostracion sin compromiso/, motivo: 'no hay forma de pedir una demo' },
  { patron: /rondan el 80|entre el 40 y el 60|la integracion que convierte mas|el motivo numero uno/, motivo: 'cifras del sector sin fuente' },
  { patron: /una idea al mes para llenar tu estudio|sin spam — cancelas cuando quieras/, motivo: 'no existe ningún envío periódico' },
  { patron: /prueba de (7|siete) dias|lo que no tiene nadie mas/, motivo: 'ya no hay prueba de 7 días (15-oct-2026), y otros programas también tienen sustituciones' },
  { patron: /reconoce las exportaciones/, motivo: 'el importador lee CSV o Excel de cualquier programa; nunca se ha probado con un export real de bsport, Mindbody o TIMP' },
  { patron: /veri\*factu \(firma y envio a la aeat\)/, motivo: 'Veri*Factu no está activo: no hay firma ni envío a la AEAT' },
  // Legal (W4, W5): pendiente de abogado. Que no vuelva lo que no existe.
  { patron: /acuerdo de\s+encargo, art\. 28|\(dpa\)[^.]{0,120}te lo damos/, motivo: 'no hay un DPA ni un acuerdo de encargo del art. 28 publicado' },
  { patron: /se suprimen tambien de las copias de seguridad|dispone de 30 dias para descargar sus datos/, motivo: 'la purga de estudios vencidos está apagada hasta que el abogado la valide' },
];

test('la web comercial no vuelve a prometer lo que el producto no hace', () => {
  const fallos: string[] = [];
  for (const { donde, texto } of lineasDeLaWeb()) {
    for (const r of REGLAS) {
      if (r.patron.test(texto) && !(r.salvo && r.salvo.test(texto))) fallos.push(`${donde} — ${r.motivo}`);
    }
  }
  assert.deepEqual(fallos, []);
});

test('cada «complemento de N €/mes» de la web es el precio real de su complemento', () => {
  const precios = new Set(Object.values(ADDONS).map((a) => a.precioMes));
  const fallos: string[] = [];
  for (const { donde, texto } of lineasDeLaWeb()) {
    for (const m of texto.matchAll(/complemento de (\d+) €/g)) {
      const n = Number(m[1]);
      if (!precios.has(n)) fallos.push(`${donde} — ${n} € no es el precio de ningún complemento`);
      // Al lado de las sustituciones autónomas, el de sustituciones; al lado del Centro de Control, el suyo.
      if (/autonom|sustitu|sola/.test(texto) && !/centro de control/.test(texto) && n !== ADDONS.sustituciones.precioMes) {
        fallos.push(`${donde} — el complemento de sustituciones cuesta ${ADDONS.sustituciones.precioMes} €`);
      }
    }
  }
  assert.deepEqual(fallos, []);
});

test('CONTROL: la guardia ve las frases con tildes y deja pasar la verdad', () => {
  const caza = (s: string) => REGLAS.some((r) => r.patron.test(normalizar(s)) && !(r.salvo && r.salvo.test(normalizar(s))));
  assert.equal(caza('Las facturas se emiten con numeración legal y huella encadenada.'), true);
  assert.equal(caza('Sí, si activas la facturación… Viene apagada, para que sigas con tu gestoría.'), true);
  assert.equal(caza('Se cobran solas con la tarjeta guardada o por adeudo SEPA.'), true);
  assert.equal(caza('La alumna reserva y paga sin salir de tu web.'), true);
  assert.equal(caza('Con la sesión iniciada, reserva y paga sin salir de tu web.'), false);
  assert.equal(caza('El detalle clínico solo lo ve la propietaria.'), true);
  assert.equal(caza('Asistidas y autónomas en todos los planes'), true);
  assert.equal(caza('Facturas con numeración legal correlativa'), false);
  assert.equal(caza('Si cobras por domiciliación, Tentare te prepara la remesa SEPA para que la presentes en tu banco.'), false);
  assert.equal(esComentario('  // decía «huella encadenada en cada factura»'), true);
});
