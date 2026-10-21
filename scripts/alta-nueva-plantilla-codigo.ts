/**
 * Compone el correo del código del alta nueva para la plantilla del PROYECTO de
 * Supabase (docs/alta-nueva-correo-del-codigo.md, pasos 2 y 3).
 *
 * No habla con nadie: lee la copia que se guardó con el GET y el fichero del
 * repo, y escribe el cuerpo del PATCH. La rama de siempre sale de la COPIA (lo
 * que hay hoy en producción), nunca del repo.
 *
 * USO:
 *   node --experimental-strip-types scripts/alta-nueva-plantilla-codigo.ts <copia.json> <patch.json>
 *
 * Sin claves, sin ids: el GET y el PATCH los hace el fundador con su token.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { componerPlantillaCodigo } from '../lib/alta/plantilla-codigo.ts';

const [copiaRuta, patchRuta] = process.argv.slice(2);
if (!copiaRuta || !patchRuta) {
  console.error('Uso: node --experimental-strip-types scripts/alta-nueva-plantilla-codigo.ts <copia.json> <patch.json>');
  process.exit(1);
}

const copia = JSON.parse(readFileSync(copiaRuta, 'utf8')) as Record<string, unknown>;
const contenidoDeHoy = copia.mailer_templates_confirmation_content;
const asuntoDeHoy = copia.mailer_subjects_confirmation;
if (typeof contenidoDeHoy !== 'string' || typeof asuntoDeHoy !== 'string') {
  console.error('La copia no trae mailer_templates_confirmation_content y mailer_subjects_confirmation como texto. ¿Es el GET de /config/auth?');
  process.exit(1);
}

const ficheroDelRepo = readFileSync(join(import.meta.dirname, '..', 'supabase/templates/confirmation.html'), 'utf8');
const c = componerPlantillaCodigo({ ficheroDelRepo, contenidoDeHoy, asuntoDeHoy });

if (c.yaAplicada) {
  console.error('Producción YA lleva el alta nueva (.Data.alta_nueva). No se compone nada encima: anidaría el condicional.');
  process.exit(1);
}

writeFileSync(patchRuta, JSON.stringify({
  mailer_subjects_confirmation: c.asunto,
  mailer_templates_confirmation_content: c.contenido,
}, null, 2));

console.log(`Escrito ${patchRuta}.`);
console.log(c.laDeSiempreCoincide
  ? 'La plantilla de hoy en producción es la del repo: la rama de siempre queda igual, byte a byte.'
  : '⚠️ La plantilla de hoy en producción NO es la del repo. La rama de siempre es la de PRODUCCIÓN (no se pisa), pero conviene mirar la diferencia.');
console.log(`Asunto de siempre: «${asuntoDeHoy}»`);
