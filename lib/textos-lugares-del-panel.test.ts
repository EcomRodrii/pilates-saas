// Guardia barata: el panel no manda a sitios que ya no existen.
//
// Un texto de ayuda que dice «ve a Configuración → Planes» cuando las tarifas
// viven en Paquetes (desde el 13-sep) no rompe ningún test ni ninguna pantalla:
// solo manda a la dueña a buscar una pestaña que no está. Pasó con varios
// textos a la vez tras la reorganización del menú, así que se fija aquí la
// lista de lugares retirados. Si uno vuelve a existir, se quita de la lista.
//
// Solo mira líneas de copy: los comentarios pueden contar la historia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');

// `app/api` y los mensajes de `lib` también: sus errores llegan a la pantalla
// tal cual («Conecta tu WhatsApp Business en Configuración → …»).
const DIRECTORIOS = ['app/(dashboard)', 'components', 'app/portal', 'app/api', 'lib/guia'];
const FICHEROS = [
  'lib/onboarding.ts', 'lib/tour-pasos.ts', 'lib/funciones-catalogo.ts',
  'lib/legal-textos.ts', 'lib/kisi-servidor.ts', 'lib/supabase-data.ts',
  'lib/billing/penalizacion-aprobar-reglas.ts', 'lib/inngest/automatizaciones.ts',
];
const EXCLUIDOS = ['components/ayuda/articulos', 'components/landing'];

// «Configuración → …» seguido del nombre de una pestaña de antes (15-sep:
// Configuración se reorganizó por preguntas). Acepta →, > y &gt;.
const PESTANAS_DE_ANTES = /Configuración\s*(?:→|>|&gt;|›)\s*(?:Estudio|Clases y salas|Clases|Salas|Citas|Integraciones|API|Emails|Logros y motivación|Descubre y tablón|Campos de clienta|Cuestionario de salud|Copias de seguridad|Perfil|Mi perfil|Cobros e Integraciones)\b/;

const LUGARES_RETIRADOS: { patron: RegExp; ahora: string }[] = [
  { patron: /Configuración → Planes/, ahora: 'Paquetes (/productos)' },
  {
    patron: PESTANAS_DE_ANTES,
    ahora: 'una sección de hoy: Mi estudio, Mis clases y citas, Cómo reservan mis alumnas, Cobros y facturas, Alta de alumnas, Cómo me comunico, Mi equipo, Mi app y mi web, Motivación, Conexiones o Datos y seguridad (lib/configuracion/secciones.ts)',
  },
  { patron: /Configuración → Servicios de cita/, ahora: 'Configuración → Mis clases y citas → Servicios de cita' },
  // 15-sep (PR B): cada ajuste se fue a su sección. Mi estudio ya no tiene la
  // marca, los textos de la app ni los datos fiscales, y Conexiones ya no tiene
  // Stripe, WhatsApp ni Gmail.
  {
    patron: /Mi estudio\s*(?:→|>|&gt;|›)\s*(?:Marca|Datos fiscales|Textos de tu app)|Mi estudio, en «(?:Marca|Datos fiscales e IVA|Textos de tu app)»/,
    ahora: '«Marca» y «Textos de tu app» en Mi app y mi web; «Datos fiscales e IVA» en Cobros y facturas',
  },
  {
    patron: /Conexiones\s*(?:→|>|&gt;|›)\s*(?:Stripe|WhatsApp|Gmail|Cobro con tarjeta)|(?:WhatsApp|Gmail)[^.<'"`]{0,60}Configuración\s*(?:→|>|&gt;|›)\s*Conexiones/,
    ahora: 'Stripe en Cobros y facturas; WhatsApp, Gmail y el remitente en Cómo me comunico',
  },
  // 15-sep (PR C): las reglas de reserva se partieron en tarjetas con una sola
  // barra de guardar. «Reservas y cancelaciones» era el nombre de antes.
  {
    patron: /Reservas y cancelaciones|Guardar política de reservas/,
    ahora: 'Configuración → Cómo reservan mis alumnas, con sus tarjetas (Reservar, Cancelar y recuperar, Lista de espera, Asistencia, Si cancela tarde o no viene) y un solo «Guardar»',
  },
  { patron: /Ir a Migración/, ahora: 'Traer mis datos' },
  // No hay pantalla para emparejar un datáfono: no se manda a buscarla.
  { patron: /Empareja uno en Configuración/, ahora: 'solo el estado («Sin datáfono emparejado»)' },
];

function ficherosDe(dir: string): string[] {
  const abs = join(RAIZ, dir);
  return (readdirSync(abs, { recursive: true }) as string[])
    .map((r) => join(dir, r))
    .filter((r) => /\.tsx?$/.test(r) && !/\.test\.ts$/.test(r))
    .filter((r) => !EXCLUIDOS.some((e) => r.startsWith(e)))
    .filter((r) => statSync(join(RAIZ, r)).isFile());
}

function esComentario(linea: string): boolean {
  const t = linea.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*');
}

test('ningún texto del panel manda a un lugar que ya no existe', () => {
  const ficheros = [...DIRECTORIOS.flatMap(ficherosDe), ...FICHEROS];
  assert.ok(ficheros.length > 100, 'la guardia no encuentra los ficheros del panel');
  const hallazgos: string[] = [];
  for (const f of ficheros) {
    const lineas = readFileSync(join(RAIZ, f), 'utf8').split('\n');
    lineas.forEach((linea, i) => {
      if (esComentario(linea)) return;
      for (const { patron, ahora } of LUGARES_RETIRADOS) {
        if (patron.test(linea)) hallazgos.push(`${f}:${i + 1} menciona «${linea.trim().slice(0, 80)}» — ahora es ${ahora}`);
      }
    });
  }
  assert.deepEqual(hallazgos, []);
});
