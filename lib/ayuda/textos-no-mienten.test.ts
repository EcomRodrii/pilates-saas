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
  { patron: /Guardar datos del estudio/, ahora: 'cada parte tiene su propio «Guardar»: las filas de Mi estudio y de Cobros y facturas, y la tarjeta de Textos de tu app' },
  // I-14 (auditoría 15-sep): «Textos de tu app» pasó de su propio botón
  // (`BarraCambiosEstudio`) a la `BarraGuardar` compartida, con la misma
  // guardia de salida que el resto de secciones — el botón ya no dice
  // «Guardar textos de tu app», solo «Guardar».
  { patron: /Guardar textos de tu app/, ahora: 'el botón dice «Guardar», igual que el resto de tarjetas (BarraGuardar)' },
  // 15-sep (v2): Cobros y facturas y Alta de alumnas van en filas con su cajón,
  // y cada cajón se guarda con «Guardar». Stripe se conecta desde su fila.
  {
    patron: /Guardar datos fiscales|Guardar datos SEPA|Guardar política de devoluciones|«Guardar política»|Guardar términos|Conectar con Stripe/,
    ahora: 'cada fila de Cobros y facturas y de Alta de alumnas se abre y se guarda con «Guardar»; Stripe, con «Conectar» en su fila',
  },
  // 15-sep (v2): Mi estudio va en filas con su cajón y un «Guardar» en cada una.
  {
    patron: /Guardar datos y contacto|«Datos y contacto» guarda|en «Datos y contacto»|Cerrar el centro unos días/,
    ahora: 'Mi estudio en filas: «Nombre y dirección», «Contacto», «Horario» y «Cerrar el centro», cada una con su «Guardar»',
  },
  // Tres textos que mentían sobre lo que HACE el producto, no sobre dónde está.
  { patron: /Avisar a las alumnas por email/, ahora: 'el aviso llega por email y en su app, y se cambia en Configuración > Cómo reservan mis alumnas' },
  { patron: /lista de espera se activa por tipo de clase/, ahora: 'viene encendida para todo el estudio y cada tipo de clase puede apagarla' },
  { patron: /Devolver la\s+sesión al cancelar tú una clase/, ahora: 'se llama «Devolver la sesión al cancelar una clase entera» y decide también el mínimo de asistentes y el cierre' },
  // 15-sep (PR C): las reglas de reserva ya no se pliegan. Desde v2 son filas con
  // su cajón, y la clase cancelada entera tiene la suya.
  {
    patron: /Opciones avanzadas|Reservas y cancelaciones|bloque\s+«Recuperaciones»|Permitir lista de espera|Cuando algo cambia, Tentare/,
    ahora: 'Configuración > Cómo reservan mis alumnas, en filas: Reservar, Cancelar y recuperar (con las recuperaciones), Si se cancela una clase entera (con el mínimo), Lista de espera, Asistencia y Si cancela tarde o no viene',
  },
  {
    patron: /(?:tarjeta|fila) «Cancelar y\s+recuperar»[^.]{0,80}(?:clase entera|mínimo)|(?:clase entera|mínimo)[^.]{0,120}en «Cancelar y\s+recuperar»/,
    ahora: 'devolver la sesión al cancelar una clase entera y el mínimo de alumnas están en «Si se cancela una clase entera»',
  },
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
