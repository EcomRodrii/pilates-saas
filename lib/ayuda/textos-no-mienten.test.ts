import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// La ayuda se queda vieja sin que nada falle: la pantalla cambia de sitio o de
// nombre, el artículo sigue mandando a la dueña al sitio antiguo, y ella se lo
// repite a su recepcionista. Esto no comprueba que cada artículo diga la verdad
// —eso solo se sabe leyendo el código de la pantalla—, pero sí caza los nombres
// de menú que ya sabemos que NO existen, para que no vuelvan por copiar y pegar.
//
// Se miran los textos, no los comentarios: un comentario que explica «antes
// esto estaba en Configuración → Planes» es memoria del código, no ayuda falsa.

const RAIZ = new URL('../../', import.meta.url).pathname;
const DIR_ARTICULOS = join(RAIZ, 'components/ayuda/articulos');

const FICHEROS = [
  ...readdirSync(DIR_ARTICULOS).filter((f) => f.endsWith('.tsx')).map((f) => join(DIR_ARTICULOS, f)),
  join(RAIZ, 'lib/faqs.ts'),
  join(RAIZ, 'lib/ayuda/registro.ts'),
  join(RAIZ, 'lib/ayuda/pantallas.ts'),
  join(RAIZ, 'app/portal/[slug]/ayuda/page.tsx'),
];

function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const FLECHA = String.raw`\s*(?:&gt;|>|→|›)\s*`;

// Cada entrada: qué no puede aparecer y dónde está ahora, para que el fallo
// diga cómo arreglarlo y no solo que algo va mal.
const PROHIBIDOS: { patron: RegExp; ahora: string }[] = [
  { patron: /Planes y tarifas/, ahora: 'las tarifas están en Paquetes (/productos)' },
  { patron: new RegExp(`Configuración${FLECHA}Planes`), ahora: 'las tarifas están en Paquetes (/productos)' },
  { patron: /Transacciones/, ahora: 'es Cobros (Quién me debe · Lo que he cobrado · Facturas)' },
  { patron: /\bDashboard\b/, ahora: 'la entrada del menú se llama Inicio' },
  { patron: /Tentare Core/, ahora: 'la instructora trabaja en la app del estudio' },
  { patron: new RegExp(`Configuración${FLECHA}Suscripción`), ahora: 'Suscripción es su propia entrada del menú, no una pestaña' },
  // Configuración se reorganizó por preguntas el 15-sep: las pestañas de antes
  // («Logros y motivación», «Estudio», «API»…) ya no existen.
  { patron: new RegExp(`Configuración${FLECHA}(?:Recompensas|Niveles|Retos|Logros)\\b`), ahora: 'van dentro de Configuración > Motivación' },
  { patron: /Logros y motivación/, ahora: 'la sección se llama Motivación' },
  { patron: new RegExp(`Configuración${FLECHA}Reservas`), ahora: 'es Configuración > Cómo reservan mis alumnas' },
  {
    patron: new RegExp(`Configuración${FLECHA}(?:Estudio|Clases y salas|Citas|Integraciones|API|Emails|Descubre y tablón|Campos de clienta|Cuestionario de salud|Copias de seguridad)\\b`),
    ahora: 'es una sección de hoy (lib/configuracion/secciones.ts): Mi estudio, Mis clases y citas, Cómo reservan mis alumnas, Cobros y facturas, Alta de alumnas, Cómo me comunico, Mi equipo, Mi app y mi web, Motivación, Conexiones o Datos y seguridad',
  },
  // 15-sep (PR B): cada ajuste se fue a su sección.
  {
    patron: new RegExp(`Mi estudio${FLECHA}(?:Marca|Datos fiscales|Textos de tu app)|Mi estudio, en «(?:Marca|Datos fiscales e IVA|Textos de tu app)»`),
    ahora: '«Marca» y «Textos de tu app» están en Configuración > Mi app y mi web; «Datos fiscales e IVA», en Cobros y facturas',
  },
  {
    patron: new RegExp(`Conexiones${FLECHA}(?:Stripe|WhatsApp|Gmail)|(?:WhatsApp|Gmail)[^.<]{0,60}Configuración${FLECHA}Conexiones`),
    ahora: 'Stripe está en Configuración > Cobros y facturas; WhatsApp, Gmail y el remitente, en Cómo me comunico',
  },
  { patron: /Guardar datos del estudio/, ahora: 'cada tarjeta tiene su botón: «Guardar datos y contacto», «Guardar datos fiscales», «Guardar textos de tu app»' },
  // Tres textos que mentían sobre lo que HACE el producto, no sobre dónde está.
  { patron: /Avisar a las alumnas por email/, ahora: 'el aviso llega por email y en su app, y se cambia en Configuración > Cómo reservan mis alumnas' },
  { patron: /lista de espera se activa por tipo de clase/, ahora: 'viene encendida para todo el estudio y cada tipo de clase puede apagarla' },
  { patron: /Devolver la\s+sesión al cancelar tú una clase/, ahora: 'se llama «Devolver la sesión al cancelar una clase entera» y decide también el mínimo de asistentes y el cierre' },
];

test('la ayuda no manda a pantallas o nombres de menú que ya no existen', () => {
  const fallos: string[] = [];
  for (const fichero of FICHEROS) {
    const texto = sinComentarios(readFileSync(fichero, 'utf8'));
    for (const { patron, ahora } of PROHIBIDOS) {
      const m = texto.match(patron);
      if (m) fallos.push(`${fichero.slice(RAIZ.length)}: «${m[0]}» — ${ahora}`);
    }
  }
  assert.ok(FICHEROS.length > 40, 'no se han leído los artículos: ¿cambió la carpeta?');
  assert.deepEqual(fallos, []);
});
