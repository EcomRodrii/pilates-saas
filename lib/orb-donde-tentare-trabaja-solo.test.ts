// ─────────────────────────────────────────────────────────────────────────────
// Un icono, un significado.
//
// `Sparkles` en este producto quiere decir **novedad**: es el icono del
// changelog (`app/ayuda/novedades`, el aviso NUEVO del menú, el botón «Señalar
// en el menú» del backoffice). No puede querer decir además «aquí está
// pensando Tentare» — con los dos significados encima del mismo dibujo, ninguno
// se lee.
//
// Donde Tentare trabaja SOLO va el Orb. Esto es estructural a propósito: lo que
// hay que impedir no es un cálculo mal hecho, es que el destello vuelva por la
// puerta de atrás la próxima vez que alguien añada un icono «de IA» a estas dos
// pantallas. El aspecto del Orb se mira en el navegador, no aquí.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
// Sin comentarios: los ficheros vigilados explican en los suyos POR QUÉ va el
// Orb y no el destello, y esa explicación no puede hacer fallar al guardia que
// describe. Se quitan también los bloques `{/* … */}` de JSX, que es donde vive
// esa nota: filtrar solo por línea inicial deja pasar las líneas de en medio.
const leerCodigo = (p: string) =>
  readFileSync(join(raiz, p), 'utf8')
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n');

// Donde Tentare piensa o ejecuta por su cuenta: tres pantallas que trabajan
// solas y cinco botones que llaman de verdad a un modelo (lib/ai/*, y el
// analizador de la Migración Mágica). `clientas/importar` entra porque su
// enlace a la Migración Mágica lleva la marca de esa función — era el único
// sitio del panel donde «esto lo hace Tentare» se pintaba con un emoji suelto.
const CON_ORB = [
  'components/decision/piloto-automatico.tsx',
  'app/(dashboard)/automatizaciones/page.tsx',
  'app/(dashboard)/dashboard/page.tsx',
  'app/(dashboard)/calendario/page.tsx',
  'components/socios/ficha-salud.tsx',
  'components/socios/modal-nota-voz.tsx',
  'app/(dashboard)/migracion/page.tsx',
  'app/(dashboard)/clientas/importar/page.tsx',
];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Los botones que llaman a un modelo. Antes eran `<Bot>`/`<Sparkles>` y, al
// pulsar, `<Loader2>` girando: dos dibujos distintos para el mismo objeto, así
// que al empezar a trabajar parecía que hubiera empezado otra cosa. El Orb
// tiene DOS estados precisamente para esto, así que el icono no se sustituye —
// cambia de estado.
//
// `sinSpinner` dice si en ese fichero NO puede quedar ningún `Loader2`. En
// `migracion` sí queda uno legítimo y a propósito: el paso 3 («ejecutando»)
// es la inserción de filas en la base de datos, trabajo mecánico, no un
// momento en que Tentare esté decidiendo nada. Poner el Orb también ahí
// diluiría lo que significa.
const BOTONES_IA: { fichero: string; cargando: string; sinSpinner: boolean }[] = [
  { fichero: 'app/(dashboard)/calendario/page.tsx', cargando: 'prepIALoading', sinSpinner: true },
  { fichero: 'components/socios/ficha-salud.tsx', cargando: 'adaptacionIALoading', sinSpinner: true },
  { fichero: 'components/socios/modal-nota-voz.tsx', cargando: 'procesando', sinSpinner: true },
  { fichero: 'app/(dashboard)/migracion/page.tsx', cargando: "paso === 'analizando'", sinSpinner: false },
];

for (const { fichero, cargando, sinSpinner } of BOTONES_IA) {
  test(`${fichero}: el botón de IA no cambia de icono al ponerse a trabajar`, () => {
    const src = leerCodigo(fichero);
    assert.match(src, new RegExp(`TentareOrb[^>]*estado=\\{${escapar(cargando)} \\? 'pensando' : 'reposo'\\}`),
      'El mismo Orb, en su estado «pensando». No un icono que se cambia por otro.');
    if (sinSpinner) {
      assert.doesNotMatch(src, /Loader2/,
        'El spinner genérico sobraba: el Orb ya dice que está trabajando, y el texto del botón también.');
    }
  });
}

// El emoji era peor que un icono equivocado: ni siquiera era parte de un
// sistema. Se comprueba aparte porque `CON_ORB` mira identificadores de
// componente, no caracteres.
test('app/(dashboard)/clientas/importar/page.tsx: ya no queda ningún ✨ suelto', () => {
  assert.doesNotMatch(leerCodigo('app/(dashboard)/clientas/importar/page.tsx'), /✨/,
    'La marca de «esto lo hace Tentare» es el Orb, no un emoji que cada sistema operativo dibuja a su manera.');
});

for (const fichero of CON_ORB) {
  test(`${fichero}: donde Tentare trabaja solo va el Orb`, () => {
    const src = leerCodigo(fichero);
    assert.match(src, /TentareOrb/,
      'Esta pantalla dice que el sistema actúa por su cuenta: le toca el Orb.');
    assert.doesNotMatch(src, /\bSparkles\b/,
      '`Sparkles` significa «novedad» (el changelog). Para «lo ha pensado Tentare», el Orb.');
    assert.doesNotMatch(src, /<Bot\b/,
      'El robot tampoco: Tentare no es un bot que responde, es un sistema que decide.');
  });
}

// El otro lado del trato. Si algún día `Sparkles` deja de significar «novedad»,
// este test cae y obliga a revisar la regla entera en vez de dejarla a medias.
test('«Sparkles» sigue siendo el icono del changelog', () => {
  const src = leerCodigo('app/ayuda/novedades/page.tsx');
  assert.match(src, /NUEVA_FUNCIONALIDAD[\s\S]{0,120}Sparkles/,
    'Si esto cambia, el Orb deja de tener con qué contrastar y hay que replantear el criterio.');
});
