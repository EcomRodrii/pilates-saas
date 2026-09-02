#!/usr/bin/env node
// Compara el portal real con el prototipo, pantalla a pantalla, en un navegador.
//
// POR QUÉ NO ES UN DIFF DE PÍXELES. Sería inútil: el prototipo enseña a Laura
// en Studio Alma con clases inventadas y el portal enseña a una socia real con
// las suyas. Píxel a píxel todo sale distinto siempre, así que el informe no
// distinguiría «el diseño está mal» de «los datos no son los mismos», que es
// justo lo único que importa. Un check que no distingue eso se ignora el primer
// día.
//
// QUÉ COMPARA ENTONCES. Un CENSO DE ESTILOS COMPUTADOS: recorre lo que se ve en
// cada pantalla y cuenta qué colores, tamaños, pesos y radios ha aplicado el
// navegador de verdad. Eso es independiente de los datos —una tarjeta es una
// tarjeta aunque dentro ponga otro nombre— y mide lo que RENDERIZA, no lo que
// está escrito: pilla lo que scripts/comprobar-fidelidad-portal.mjs no puede
// ver, porque ese solo lee literales del código (variables CSS, herencia,
// clases de utilidad, estilos de terceros).
//
// Las dos herramientas se complementan: aquélla es el guardián barato que corre
// en cada PR; ésta hay que lanzarla a mano contra un servidor con datos, y
// además deja las capturas emparejadas para mirarlas, que sigue haciendo falta
// para juzgar la COMPOSICIÓN (que una tarjeta esté donde toca y respire igual).
//
// USO:  node scripts/comparar-portal-prototipo.mjs --puerto 3098
// Salida en .comparacion-visual/ (ignorado por git): capturas + indice.html.
//
// ⚠️ NECESITA UN SUPABASE LOCAL SANO, y ése es el punto frágil. El contenedor
// de auth pierde la conexión con Postgres cada cierto tiempo dentro de Docker
// (`dial tcp …:5432: i/o timeout`) y entonces devuelve 504 en TODO —enlaces
// mágicos y token—, además de dejar el portal a 17-30s por página. Si ves
// timeouts, mira `docker logs supabase_auth_*` antes de tocar este script:
// casi siempre es eso y se arregla reiniciando la pila (`supabase stop/start`).
// Para salir del paso sin reiniciar nada, entra al portal a mano y pásale la
// sesión con `--sesion "<lo que va detrás del # en la barra de direcciones>"`.

import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { contratoDesde, canonizarColor } from './comprobar-fidelidad-portal.mjs'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
// El propio prototipo es la fuente del vocabulario contra el que se compara.
const PROTOTIPO = 'components/prototipo/StudioApp.jsx'
const SALIDA = join(RAIZ, '.comparacion-visual')

const arg = (n, def) => {
  const i = process.argv.indexOf(n)
  return i > -1 ? process.argv[i + 1] : def
}
const PUERTO = arg('--puerto', '3098')
const SLUG = arg('--slug', 'pilates-boutique')
const EMAIL = arg('--email', 'carmen@ejemplo.test')
const BASE = `http://localhost:${PUERTO}`

// Las cuatro pantallas que el prototipo alcanza por su barra inferior, que son
// las que el diseño define de punta a punta. Deliberadamente no se comparan las
// rutas que el prototipo no dibuja (/videos, /progreso, /comunidad...): ahí no
// hay nada contra lo que comparar y el informe solo tendría ruido.
const PANTALLAS = [
  { id: 'inicio', pestana: 'Hoy', ruta: 'home' },
  { id: 'horario', pestana: 'Horario', ruta: 'clases' },
  { id: 'reservas', pestana: 'Reservas', ruta: 'reservas' },
  { id: 'perfil', pestana: 'Perfil', ruta: 'perfil' },
]

function entorno() {
  const f = join(RAIZ, '.env.local')
  if (!existsSync(f)) throw new Error('falta .env.local (hace falta para crear la sesión de prueba)')
  const t = readFileSync(f, 'utf8')
  const leer = (k) => t.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1]?.trim()
  return { url: leer('NEXT_PUBLIC_SUPABASE_URL'), clave: leer('SUPABASE_SERVICE_ROLE_KEY') }
}

/** Sesión real de gotrue, sin pasar por la pantalla de acceso. */
async function fragmentoDeSesion({ url, clave }) {
  // gotrue intenta ENVIAR el correo del enlace, y contra el Supabase local eso
  // agota el tiempo cada dos por tres (HTTP 504). No es un fallo real: al
  // segundo intento va. Sin este reintento la comparación fallaba a mitad y
  // parecía un problema de credenciales.
  let r, cuerpo
  for (let intento = 1; intento <= 4; intento++) {
    r = await fetch(`${url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: EMAIL }),
    })
    cuerpo = await r.json()
    if (cuerpo.action_link) break
    if (intento < 4) await new Promise((res) => setTimeout(res, 1500 * intento))
  }
  const enlace = cuerpo.action_link
  // gotrue limita la frecuencia de enlaces mágicos: sin decir el motivo, el
  // fallo parece «no existe ese usuario» y se pierde el rato buscando ahí.
  if (!enlace) {
    throw new Error(
      `gotrue no devolvió enlace para ${EMAIL} (HTTP ${r.status}): ` +
        (cuerpo.msg ?? cuerpo.error_description ?? cuerpo.message ?? JSON.stringify(cuerpo).slice(0, 200)),
    )
  }
  const token = new URL(enlace).searchParams.get('token')
  // `redirect: manual` para quedarnos con el fragmento del Location en vez de
  // seguirlo: ahí viajan los tokens.
  const v = await fetch(`${url}/auth/v1/verify?token=${token}&type=magiclink&redirect_to=${BASE}`, { redirect: 'manual' })
  const loc = v.headers.get('location')
  if (!loc || !loc.includes('#')) throw new Error('gotrue no devolvió tokens')
  return loc.slice(loc.indexOf('#') + 1)
}

/** Cuenta qué ha aplicado el navegador de verdad en lo que se ve. */
const CENSO = () => {
  const props = {}
  const anota = (k, v) => { (props[k] ??= {}); props[k][v] = (props[k][v] ?? 0) + 1 }
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    // Solo lo visible: lo que no se ve no puede estar «mal diseñado», y contarlo
    // metería en el informe pantallas enteras que están montadas y ocultas.
    if (r.width < 1 || r.height < 1) continue
    if (r.bottom < 0 || r.top > innerHeight) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue
    anota('color', cs.color)
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') anota('fondo', cs.backgroundColor)
    // Tipografía solo donde hay texto propio: si no, se cuenta la herencia de
    // cada div contenedor y el censo se llena de valores que nadie ve.
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    if (propio) { anota('tamaño', cs.fontSize); anota('peso', cs.fontWeight) }
    // Un radio que redondea la caja ENTERA se ve igual venga escrito como venga:
    // `50%` sobre un cuadrado, `23px` sobre un botón de 46 de alto y el `999px`
    // del kit dibujan exactamente el mismo círculo o la misma píldora. Contarlos
    // como valores distintos llenaba el informe de deriva inexistente —los 19
    // elementos en `50%` y los 16 en `23px` que marcó la pasada del 2026-09-02—
    // y perseguirla son ~60 ediciones en el portal que no mueven un píxel. Se
    // canoniza SOLO cuando de verdad redondea del todo:
    // sobre una caja no cuadrada `50%` es una elipse, y eso sí difiere.
    if (cs.borderRadius !== '0px') {
      const br = cs.borderRadius.trim()
      const uniforme = !br.includes('/') && !br.includes(' ')
      const px = uniforme && br.endsWith('px') ? parseFloat(br) : null
      const redondoDelTodo =
        uniforme &&
        ((br === '50%' && Math.abs(r.width - r.height) < 1) ||
          (px != null && px >= Math.min(r.width, r.height) / 2 - 0.5))
      anota('radio', redondoDelTodo ? '999px' : br)
    }
  }
  return props
}

const fusionar = (a, b) => {
  for (const [k, vals] of Object.entries(b)) {
    a[k] ??= {}
    for (const [v, n] of Object.entries(vals)) a[k][v] = (a[k][v] ?? 0) + n
  }
  return a
}

/**
 * El texto de la pantalla actual, para poder DECIR dónde se quedó al fallar.
 *
 * Ya no sirve para detectar cambios de pestaña: las cuatro pantallas del
 * prototipo están montadas a la vez, así que al cambiar de pestaña cambia lo
 * que se ve pero no el innerText. Eso lo resuelve `esperarCambioVisual`.
 */
const firma = (pag) => pag.evaluate(() => document.body.innerText.trim())

/**
 * Huella de lo que se VE, no de lo que hay en el DOM.
 *
 * ⚠️ Para las pestañas no vale comparar texto: el prototipo tiene las cuatro
 * pantallas montadas a la vez y al cambiar de pestaña cambia lo visible, no el
 * innerText. Comparando texto, «Horario» parecía no abrirse nunca. La imagen es
 * la única señal que distingue de verdad una pestaña de otra.
 */
const firmaVisual = async (pag) =>
  createHash('sha1').update(await pag.screenshot()).digest('hex')

/** Espera a que lo que se ve deje de ser `antes`. */
async function esperarCambioVisual(pag, antes, ms = 12_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    await pag.waitForTimeout(300)
    if ((await firmaVisual(pag)) !== antes) return true
  }
  return false
}

/**
 * Espera a que el portal traiga DATOS, no su esqueleto de carga.
 *
 * ⚠️ Con una espera fija (4s) se capturaban las cajas grises del esqueleto y el
 * censo salía medido sobre ellas — pantallas enteras comparadas contra nada.
 * Tampoco vale adivinar por longitud de texto: daba falsos positivos en
 * pantallas ya cargadas. La señal exacta es `.animate-pulse`, que es con lo que
 * portal-shell.tsx pinta el esqueleto: mientras quede uno, no ha terminado.
 */
async function esperarContenido(pag, ms = 45_000) {
  try {
    await pag.waitForFunction(
      () => document.querySelectorAll('.animate-pulse').length === 0 && document.body.innerText.trim().length > 80,
      undefined,
      { timeout: ms, polling: 300 },
    )
    // Un respiro para que acabe de pintar lo que entró con el último dato.
    await pag.waitForTimeout(900)
    return true
  } catch {
    return false
  }
}

/**
 * El botón cuyo texto es EXACTAMENTE `txt`, y que además se ve.
 *
 * Las dos condiciones costaron un informe falso cada una:
 *
 *  - `:visible` — el prototipo monta TODAS sus pantallas a la vez en el DOM,
 *    solo ocultas. Sin filtrar, el selector casaba con el botón de otra
 *    pantalla escondida, `.first()` lo pulsaba, no pasaba nada visible y se
 *    capturaba dos veces Inicio creyendo que era Reservas.
 *  - el regex anclado — `:text-is()` NO atraviesa elementos anidados, y estos
 *    botones llevan la etiqueta dentro de un <span> junto al icono: casaba
 *    CERO. Su alternativa, `:has-text()`, es subcadena e insensible a
 *    mayúsculas, así que «Horario» casaba también con «Ver horario →». Con
 *    `filter({hasText: /^…$/})` se mira el texto completo del botón, exacto.
 */
const botonExacto = (pag, txt) =>
  pag.locator('button:visible').filter({ hasText: new RegExp(`^${txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first()

async function main() {
  mkdirSync(SALIDA, { recursive: true })
  // `--sesion` evita gotrue del todo. No es un capricho: el auth local se cae
  // con cierta facilidad (se queda sin memoria y pierde la conexión con
  // Postgres dentro de Docker, devolviendo 504 en todo), y sin esta salida la
  // comparación se queda bloqueada por un problema de entorno que no tiene nada
  // que ver con el diseño. Se saca de la barra de direcciones tras entrar a mano.
  const frag = arg('--sesion', null) ?? (await fragmentoDeSesion(entorno()))
  const nav = await chromium.launch()
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pag = await ctx.newPage()
  const avisos = []
  const boton = (txt) => botonExacto(pag, txt)

  // ── prototipo ────────────────────────────────────────────────────────────
  const censoProto = {}
  // La sesión se inyecta SIEMPRE, sin mirar antes si hace falta.
  //
  // ⚠️ Antes se comprobaba primero si estaba la puerta de acceso, y esa
  // comprobación corría mientras la página aún pintaba: veía cero avisos, se
  // saltaba la inyección, la puerta aparecía después y la comparación moría
  // mucho más tarde con un error que no señalaba a esto. Inyectarla de más no
  // cuesta nada; inyectarla de menos cuesta la ejecución entera.
  //
  // Va en localStorage porque el cliente del panel guarda ahí, nunca en cookie
  // (lo documenta lib/auth-server-action.ts).
  const q = Object.fromEntries(new URLSearchParams(frag))
  const jwt = JSON.parse(Buffer.from(q.access_token.split('.')[1], 'base64').toString())
  await pag.goto(`${BASE}/portal-prototipo`, { waitUntil: 'domcontentloaded' })
  await pag.evaluate(([tok, cuerpo]) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: tok.access_token, refresh_token: tok.refresh_token, token_type: 'bearer',
      expires_in: 3600, expires_at: cuerpo.exp,
      user: { id: cuerpo.sub, aud: 'authenticated', role: 'authenticated', email: cuerpo.email,
              app_metadata: cuerpo.app_metadata, user_metadata: cuerpo.user_metadata,
              created_at: new Date().toISOString() },
    }))
  }, [q, jwt])
  await pag.goto(`${BASE}/portal-prototipo`, { waitUntil: 'domcontentloaded' })
  try {
    await pag.locator('.prototipo-aviso').waitFor({ state: 'detached', timeout: 20_000 })
  } catch {
    throw new Error('la sesión inyectada no abrió /portal-prototipo: la puerta de acceso sigue puesta')
  }

  const pulsar = async (txt) => {
    const b = boton(txt)
    if (!(await b.count())) return false
    await b.click().catch(() => {})
    return true
  }

  // Onboarding, esperando a cada pantalla en vez de dormir a ciegas.
  //
  // ⚠️ Cada paso es OPCIONAL a propósito: el prototipo no siempre arranca en la
  // bienvenida (recuerda por dónde iba), y dar por hecho que «Empezar» está ahí
  // hacía fallar la comparación entera sin que hubiera nada roto.
  if (await boton('Empezar').count()) {
    await boton('Empezar').click({ timeout: 15_000 })
    const nombre = pag.locator('input[placeholder="Tu nombre"]:visible').first()
    try {
      await nombre.waitFor({ timeout: 15_000 })
      await nombre.fill('Laura')
      await pag.locator('input[placeholder="tu@email.com"]:visible').first().fill('laura@email.com')
      await pulsar('Continuar')
    } catch { /* el alta no salió: se sigue, y si no se llega a la barra ya avisa abajo */ }
  }
  // Los permisos opcionales (ubicación, avisos) se saltan uno a uno.
  //
  // ⚠️ Se ESPERA a que aparezca cada botón en vez de mirar si ya está: entre
  // pantalla y pantalla hay una transición, y preguntar durante ella devolvía
  // «no hay botón», el bucle se cortaba a la primera y nunca se llegaba a la
  // Home — con el fallo apareciendo mucho después, al buscar la barra inferior.
  for (let i = 0; i < 8; i++) {
    const salto = boton('Ahora no')
    try {
      await salto.waitFor({ timeout: 6000 })
    } catch {
      break // ya no quedan pasos opcionales
    }
    await salto.click().catch(() => {})
  }
  // Si no se llega a la barra inferior, el prototipo se quedó en algún paso del
  // onboarding. Se deja una captura y el texto de la pantalla: sin eso el fallo
  // es un timeout mudo y hay que reproducirlo a mano para saber dónde paró.
  try {
    await boton('Horario').waitFor({ timeout: 20_000 })
  } catch {
    const donde = join(SALIDA, 'fallo-onboarding.png')
    await pag.screenshot({ path: donde })
    throw new Error(
      'el prototipo no llegó a su barra inferior. Se quedó en:\n  «' +
        (await firma(pag)).replace(/\n/g, ' ') + '»\nCaptura: ' + donde,
    )
  }

  for (const p of PANTALLAS) {
    const antes = await firmaVisual(pag)
    if (!(await pulsar(p.pestana))) throw new Error(`no existe la pestaña «${p.pestana}» en el prototipo`)
    const cambio = await esperarCambioVisual(pag, antes)
    // Inicio ya está abierta al llegar: ahí no cambiar es lo correcto.
    if (!cambio && p.id !== 'inicio') {
      throw new Error(`la pestaña «${p.pestana}» no cambió de pantalla — se habría capturado otra cosa`)
    }
    await pag.waitForTimeout(900)
    await pag.screenshot({ path: join(SALIDA, `prototipo-${p.id}.png`) })
    fusionar(censoProto, await pag.evaluate(CENSO))
  }

  // ── portal real ──────────────────────────────────────────────────────────
  const censoPortal = {}

  // El fragmento con los tokens se usa UNA sola vez, para abrir sesión.
  //
  // ⚠️ Pasárselo a cada ruta dejaba las tres primeras pantallas EN BLANCO y solo
  // funcionaba la última: el fragmento se consume al entrar (`detectSessionInUrl`)
  // y reusarlo compite con la sesión que ya se está estableciendo. Se entra una
  // vez, se espera a que la sesión cuaje, y a partir de ahí se navega limpio —
  // la sesión ya vive en localStorage.
  await pag.goto(`${BASE}/portal/${SLUG}/${PANTALLAS[0].ruta}#${frag}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  if (!(await esperarContenido(pag))) {
    throw new Error('no se pudo abrir sesión en el portal: la primera pantalla no llegó a cargar')
  }

  for (const p of PANTALLAS) {
    // ⚠️ `networkidle` NO sirve aquí: el portal mantiene abierto el websocket de
    // Realtime, la red nunca queda quieta y la espera agota el tiempo siempre.
    await pag.goto(`${BASE}/portal/${SLUG}/${p.ruta}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    if (!(await esperarContenido(pag))) {
      avisos.push(`«${p.pestana}» del portal seguía cargando al capturar: su medida no vale.`)
    }
    await pag.screenshot({ path: join(SALIDA, `portal-${p.id}.png`) })
    fusionar(censoPortal, await pag.evaluate(CENSO))
  }
  await nav.close()

  // ── informe ──────────────────────────────────────────────────────────────
  // Un valor solo cuenta como deriva si NO está en ninguno de los dos sitios:
  //
  //   1. lo que se ha medido en estas cuatro pantallas del prototipo, y
  //   2. el vocabulario COMPLETO del prototipo, leído de su código fuente.
  //
  // ⚠️ Con solo (1) el informe señalaba cosas que el prototipo sí usa, pero en
  // otra pantalla: peso 600 (7 elementos) y #C2503A salieron marcados y son
  // suyos de toda la vida. Perseguir esos fantasmas cuesta más que el informe.
  const vocab = contratoDesde(readFileSync(join(RAIZ, PROTOTIPO), 'utf8'))
  const estatico = {
    color: vocab.colores, fondo: vocab.colores,
    tamaño: vocab.tamanos, peso: vocab.pesos, radio: vocab.radios,
  }
  // El navegador computa `rgb(...)`/`12.5px`; el código escribe `#fff`/`12.5`.
  const comparable = (clase, v) =>
    clase === 'color' || clase === 'fondo' ? canonizarColor(v) : String(v).replace(/px$/, '')

  const fuera = {}
  for (const clase of ['color', 'fondo', 'tamaño', 'peso', 'radio']) {
    const enPantallas = new Set(Object.keys(censoProto[clase] ?? {}))
    fuera[clase] = Object.entries(censoPortal[clase] ?? {})
      .filter(([v]) => {
        if (enPantallas.has(v)) return false
        const c = comparable(clase, v)
        return !estatico[clase].has(c) && !estatico[clase].has(String(v))
      })
      .sort((a, b) => b[1] - a[1])
  }

  console.log(`Prototipo: ${Object.values(censoProto).reduce((n, o) => n + Object.keys(o).length, 0)} valores distintos.`)
  console.log(`Portal:    ${Object.values(censoPortal).reduce((n, o) => n + Object.keys(o).length, 0)} valores distintos.\n`)
  let total = 0
  for (const [clase, lista] of Object.entries(fuera)) {
    if (!lista.length) { console.log(`${clase}: todo dentro del prototipo.`); continue }
    total += lista.length
    console.log(`${clase}: ${lista.length} valores que el prototipo no usa`)
    for (const [v, n] of lista.slice(0, 8)) console.log(`   ${v}  (${n} elementos)`)
    if (lista.length > 8) console.log(`   …y ${lista.length - 8} más`)
  }

  console.log('\nLo señalado ya está cruzado contra el vocabulario COMPLETO del')
  console.log('prototipo, no solo contra estas cuatro pantallas.')

  const filas = PANTALLAS.map((p) => `
    <section>
      <h2>${p.pestana}</h2>
      <div class="par">
        <figure><img src="prototipo-${p.id}.png" alt=""><figcaption>prototipo</figcaption></figure>
        <figure><img src="portal-${p.id}.png" alt=""><figcaption>portal real · /${p.ruta}</figcaption></figure>
      </div>
    </section>`).join('')
  writeFileSync(join(SALIDA, 'indice.html'), `<!doctype html><meta charset="utf-8">
<title>Prototipo vs portal</title>
<style>
 body{margin:0;padding:32px;background:#E9E7DE;font:14px system-ui;color:#1A1A1A}
 h1{font-size:22px;margin:0 0 4px} p.nota{color:#5A5A52;margin:0 0 28px;max-width:60ch;line-height:1.5}
 section{margin-bottom:36px} h2{font-size:15px;margin:0 0 10px}
 .par{display:flex;gap:20px;flex-wrap:wrap}
 figure{margin:0} img{width:390px;border-radius:22px;box-shadow:0 14px 34px -14px rgba(15,15,15,.4);display:block}
 figcaption{margin-top:8px;color:#5A5A52;font-size:12px}
</style>
<h1>Prototipo vs portal real</h1>
<p class="nota">Mismo viewport (390×844) y misma pantalla. Los DATOS son distintos a propósito
—el prototipo es una maqueta—, así que lo que hay que mirar es la composición: dónde cae cada
bloque, cuánto respira y qué pesa más. El informe de la consola cubre los valores.</p>
${filas}`)

  console.log(`\nCapturas y contacto: ${join(SALIDA, 'indice.html')}`)
  if (avisos.length) {
    console.error('\nAVISOS — hay medidas que no son de fiar:')
    for (const a of avisos) console.error('  ' + a)
    process.exitCode = 1
  } else if (total === 0) {
    console.log('El portal no usa ningún valor fuera del prototipo.')
  }
}

await main()
