#!/usr/bin/env node
// Compara supabase/migrations/ con lo que producción dice tener aplicado.
//
// POR QUÉ EXISTE. Mergear un PR no aplica su migración, y aplicar una migración
// no crea su fichero. Las dos cosas han pasado de verdad y las dos han costado
// un crítico:
//   * red_formalizaciones / red_vacantes_candidaturas se mergearon el 14-ago y
//     nunca se aplicaron: 3 días con "Formalizar contratación" devolviendo error
//     y las vacantes fingiendo estar vacías, con la CI en verde todo el tiempo.
//   * embudo_widget_revoca_anon (de seguridad) se aplicó y nunca tuvo fichero:
//     quien reconstruyera desde el repo se la habría dejado por el camino.
//
// POR QUÉ NO `supabase migration list`. El CLI cruza por NÚMERO. Este repo
// arrastra un squash antiguo que dejó ~100 ficheros con la numeración
// divergente, así que por número todo parece roto y el check se ignoraría a la
// semana. Aquí se cruza por NOMBRE, que es la regla de .claude/tentare-os.md.
//
// CUÁNDO CORRE. Después de mergear a main y una vez al día — nunca en un PR: al
// abrirlo, una migración nueva legítimamente todavía no está aplicada, así que
// en PR esto daría rojo siempre.

import { strictEqual as eq, deepStrictEqual as deep } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

// Divergencias heredadas, verificadas UNA A UNA contra la BD el 2026-08-17 (ver
// PR #1141). Están aquí para que el check falle solo con lo NUEVO: un baseline
// que empieza en cero fallaría el primer día y acabaría desactivado.
//
// Al arreglar una, se borra de aquí. Esta lista solo debería encoger.
const ACEPTADAS = {
  // Aplicadas en producción, sin fichero en el repo. Recuperables del catálogo
  // (`select statements from supabase_migrations.schema_migrations`).
  sinFichero: [
    'advisor_fk_lecturas_ficha_salud',
    'avatars_path_autorizado_revoke_anon_directo',
    'avatars_path_autorizado_revoke_public',
    'consentimiento_salud_rls',
    'editar_serie_desde_revoke_anon',
    'mis_estudios_search_path',
    'otorgar_credito_disparador_devuelve_accion_id',
    'penalizaciones_indice_recibo_id',
    'reclamar_webhook_event_reload_schema',
    'reserva_exigir_plan_por_defecto',
    'revoke_anon_rpc_via_public',
  ],
  // Ficheros cuyo nombre no aparece en el registro. NINGUNO es un agujero: sus
  // efectos están vivos en producción bajo otro nombre, comprobados de uno en
  // uno (grants de reservar_numero_factura, índice único de socios excluyendo
  // borrado_en, default de reserva_exigir_plan, tiene_consentimiento_salud).
  sinAplicar: [
    'defaults_protectores_reservas',
    'ficha_clinica',
    'fix_socios_email_unico_excluye_borrado',
    'marca_e_iva',
    'reservar_numero_factura_revoca_anon',
    'tiene_consentimiento_salud_revoca_anon',
  ],
}

// Quita los prefijos de versión. Repetido a propósito: algunos nombres del
// registro llevan DOS ("20260730141838" con nombre "20260731102000_ausencias_…",
// porque apply_migration sella con la hora de aplicarla, no la del fichero).
export function normalizar(nombre) {
  let n = nombre.replace(/\.sql$/, '')
  let antes
  do {
    antes = n
    n = n.replace(/^\d{4,14}_/, '')
  } while (n !== antes)
  return n
}

// Los nombres llegan por la ENTRADA ESTÁNDAR, uno por línea: los vuelca `psql`
// en el workflow. Antes esto llamaba a la Management API con un
// `SUPABASE_ACCESS_TOKEN`, o sea una credencial con control TOTAL del proyecto
// (crear y borrar ramas, aplicar migraciones, leer cualquier tabla) viviendo en
// la CI de un repo público — para leer una lista de nombres.
//
// Ahora se conecta con el rol `deriva_ci` (migr 20260818010000), que solo puede
// hacer SELECT sobre `supabase_migrations.schema_migrations` y nada más. Si esa
// credencial se filtrara, lo que se llevan es el catálogo de nombres de
// migraciones, que ya está en el repo, que es público.
function nombresEnProduccion() {
  let crudo;
  try {
    crudo = readFileSync(0, 'utf8');
  } catch {
    throw new Error('no se pudo leer la entrada estándar; ¿falta el `psql ... |` delante?');
  }
  const nombres = crudo.split('\n').map((l) => l.trim()).filter(Boolean).map(normalizar);
  // Cero filas es imposible en un proyecto real y sí es el síntoma de que la
  // conexión falló en silencio o la query no devolvió nada. Fallar aquí evita el
  // peor desenlace posible: un check que da "todo bien" porque no leyó nada.
  if (nombres.length === 0) {
    throw new Error('producción devolvió CERO migraciones — eso no es "sin deriva", es que no se pudo leer');
  }
  return nombres;
}

function nombresEnRepo() {
  return readdirSync(join(RAIZ, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .map(normalizar)
}

function autocomprobacion() {
  eq(normalizar('0042_sustituciones_agotada.sql'), 'sustituciones_agotada')
  eq(normalizar('20260814124844_widget_eventos.sql'), 'widget_eventos')
  // El caso de los dos prefijos, que es el que rompe un strip de una pasada:
  eq(normalizar('20260731102000_ausencias_solo_propia_instructor'), 'ausencias_solo_propia_instructor')
  eq(normalizar('20260726124520_0104_aceptacion_origen'), 'aceptacion_origen')
  // Un nombre ya limpio no se toca:
  eq(normalizar('base'), 'base')
  deep(diferencia(['a', 'b'], ['b', 'c']), { sinAplicar: ['a'], sinFichero: ['c'] })
  // Lo que de verdad importa: que el baseline silencie lo heredado y NO lo nuevo.
  // Un check que no puede ponerse rojo no sirve de nada.
  const base = { sinAplicar: ['vieja_sin_aplicar'], sinFichero: ['vieja_fantasma'] }
  const enPaz = veredicto(['comun', 'vieja_sin_aplicar'], ['comun', 'vieja_fantasma'], base)
  deep([enPaz.nuevasSinAplicar, enPaz.nuevasSinFichero, enPaz.arregladas], [[], [], []])
  eq(enPaz.heredadas, 2)

  // Los dos fallos que este check existe para cazar:
  const mergeadaSinAplicar = veredicto(
    ['comun', 'vieja_sin_aplicar', 'red_formalizaciones'],
    ['comun', 'vieja_fantasma'],
    base,
  )
  deep(mergeadaSinAplicar.nuevasSinAplicar, ['red_formalizaciones'])
  const fantasmaNueva = veredicto(
    ['comun', 'vieja_sin_aplicar'],
    ['comun', 'vieja_fantasma', 'embudo_widget_revoca_anon'],
    base,
  )
  deep(fantasmaNueva.nuevasSinFichero, ['embudo_widget_revoca_anon'])

  // Y que arreglar una divergencia heredada avise en vez de fallar:
  const arreglada = veredicto(['comun', 'vieja_sin_aplicar'], ['comun', 'vieja_fantasma', 'vieja_sin_aplicar'], base)
  deep(arreglada.arregladas, ['vieja_sin_aplicar'])
  deep(arreglada.nuevasSinFichero, [])

  console.log('autocomprobación OK')
}

export function diferencia(repo, prod) {
  const enProd = new Set(prod)
  const enRepo = new Set(repo)
  return {
    sinAplicar: [...enRepo].filter((n) => !enProd.has(n)).sort(),
    sinFichero: [...enProd].filter((n) => !enRepo.has(n)).sort(),
  }
}

const nuevas = (encontradas, aceptadas) => encontradas.filter((n) => !aceptadas.includes(n))

// Toda la decisión, sin red ni proceso: es lo único con lógica, así que es lo
// único que hay que poder probar.
export function veredicto(repo, prod, aceptadas = ACEPTADAS) {
  const { sinAplicar, sinFichero } = diferencia(repo, prod)
  return {
    nuevasSinAplicar: nuevas(sinAplicar, aceptadas.sinAplicar),
    nuevasSinFichero: nuevas(sinFichero, aceptadas.sinFichero),
    heredadas: sinAplicar.length + sinFichero.length,
    // Una aceptada que ya no aparece es una divergencia ARREGLADA. Se avisa sin
    // fallar: que a nadie le toque pelearse con el check por hacer lo correcto.
    arregladas: [
      ...aceptadas.sinAplicar.filter((n) => !sinAplicar.includes(n)),
      ...aceptadas.sinFichero.filter((n) => !sinFichero.includes(n)),
    ],
  }
}

async function main() {
  if (process.argv.includes('--autocomprobacion')) return autocomprobacion()

  const { nuevasSinAplicar, nuevasSinFichero, heredadas, arregladas } = veredicto(
    nombresEnRepo(),
    nombresEnProduccion(),
  )

  if (arregladas.length) {
    console.log(`Arregladas desde el último baseline (bórralas de ACEPTADAS):\n  ${arregladas.join('\n  ')}\n`)
  }

  if (!nuevasSinAplicar.length && !nuevasSinFichero.length) {
    console.log(`Sin deriva nueva. ${heredadas} divergencias heredadas conocidas.`)
    return
  }

  if (nuevasSinAplicar.length) {
    console.error(
      'MIGRACIONES EN EL REPO QUE PRODUCCIÓN NO TIENE APLICADAS.\n' +
        'Mergear no aplica. Si el código que las necesita ya está desplegado, está roto AHORA:\n' +
        nuevasSinAplicar.map((n) => `  - ${n}`).join('\n') +
        '\n',
    )
  }
  if (nuevasSinFichero.length) {
    console.error(
      'APLICADAS EN PRODUCCIÓN Y SIN FICHERO EN EL REPO.\n' +
        'Se pierden en cuanto alguien reconstruya la BD desde el repo. Recupéralas con\n' +
        '`select statements from supabase_migrations.schema_migrations where name = ...`:\n' +
        nuevasSinFichero.map((n) => `  - ${n}`).join('\n') +
        '\n',
    )
  }
  console.error(
    'Si una de éstas es deriva heredada y no un fallo real, verifica su EFECTO en la BD\n' +
      '(no su nombre) y añádela a ACEPTADAS en este mismo fichero, con el porqué.',
  )
  process.exitCode = 1
}

// Solo al ejecutarlo directo: así el módulo se puede importar para probar
// `normalizar`/`diferencia` sin pedir token ni salir a la red.
if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
