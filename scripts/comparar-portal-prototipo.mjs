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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
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
    if (cs.borderRadius !== '0px') anota('radio', cs.borderRadius)
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

async function main() {
  mkdirSync(SALIDA, { recursive: true })
  // `--sesion` evita gotrue del todo. No es un capricho: el auth local se cae
  // con cierta facilidad (pierde la conexión con Postgres dentro de Docker y
  // devuelve 504 en todo), y sin esta salida la comparación se queda bloqueada
  // por un problema de entorno que no tiene nada que ver con el diseño.
  // Se saca de la barra de direcciones tras entrar al portal a mano.
  const frag = arg('--sesion', null) ?? (await fragmentoDeSesion(entorno()))
  const nav = await chromium.launch()
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const pag = await ctx.newPage()

  // ── prototipo ────────────────────────────────────────────────────────────
  const censoProto = {}
  await pag.goto(`${BASE}/portal-prototipo`, { waitUntil: 'domcontentloaded' })
  await pag.waitForTimeout(1500)
  // Si la ruta ya pide sesión (PR de la guardia), dársela: el cliente del panel
  // guarda en localStorage, no en cookie.
  if (await pag.locator('.prototipo-aviso').count()) {
    const p = Object.fromEntries(new URLSearchParams(frag))
    const jwt = JSON.parse(Buffer.from(p.access_token.split('.')[1], 'base64').toString())
    await pag.evaluate(([tok, cuerpo]) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: tok.access_token, refresh_token: tok.refresh_token, token_type: 'bearer',
        expires_in: 3600, expires_at: cuerpo.exp,
        user: { id: cuerpo.sub, aud: 'authenticated', role: 'authenticated', email: cuerpo.email,
                app_metadata: cuerpo.app_metadata, user_metadata: cuerpo.user_metadata,
                created_at: new Date().toISOString() },
      }))
    }, [p, jwt])
    await pag.goto(`${BASE}/portal-prototipo`, { waitUntil: 'domcontentloaded' })
  await pag.waitForTimeout(1500)
  }

  // Saltar el onboarding hasta la Home del prototipo.
  const pulsar = async (txt) => {
    const b = pag.locator(`button:text-is("${txt}")`).first()
    if (await b.count()) { await b.click().catch(() => {}); return true }
    return false
  }
  await pulsar('Empezar'); await pag.waitForTimeout(700)
  await pag.locator('input[placeholder="Tu nombre"]').fill('Laura').catch(() => {})
  await pag.locator('input[placeholder="tu@email.com"]').fill('laura@email.com').catch(() => {})
  await pulsar('Continuar'); await pag.waitForTimeout(1000)
  for (let i = 0; i < 6; i++) { if (!(await pulsar('Ahora no'))) break; await pag.waitForTimeout(800) }
  await pag.waitForTimeout(1500)

  for (const p of PANTALLAS) {
    await pulsar(p.pestana); await pag.waitForTimeout(1200)
    await pag.screenshot({ path: join(SALIDA, `prototipo-${p.id}.png`) })
    fusionar(censoProto, await pag.evaluate(CENSO))
  }

  // ── portal real ──────────────────────────────────────────────────────────
  const censoPortal = {}
  const porPantalla = {}
  for (const p of PANTALLAS) {
    // El fragmento con los tokens solo hace falta la primera vez; después la
    // sesión ya está guardada.
    // ⚠️ `networkidle` NO sirve contra el portal: mantiene abierto el websocket
    // de Realtime, así que la red nunca queda quieta y la espera agota el
    // tiempo. Se espera a que pinte y luego un margen fijo para los datos.
    // 90s y no los 30 de serie: el portal consulta a Supabase en servidor y
    // con la base local cargada tarda ~17s solo en devolver el HTML. Con el
    // límite por defecto la comparación fallaba por lentitud del entorno, no
    // por nada del diseño.
    await pag.goto(`${BASE}/portal/${SLUG}/${p.ruta}#${frag}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await pag.waitForTimeout(4000)
    await pag.screenshot({ path: join(SALIDA, `portal-${p.id}.png`) })
    const c = await pag.evaluate(CENSO)
    porPantalla[p.id] = c
    fusionar(censoPortal, c)
  }
  await nav.close()

  // ── informe ──────────────────────────────────────────────────────────────
  const fuera = {}
  for (const clase of ['color', 'fondo', 'tamaño', 'peso', 'radio']) {
    const permitido = new Set(Object.keys(censoProto[clase] ?? {}))
    fuera[clase] = Object.entries(censoPortal[clase] ?? {})
      .filter(([v]) => !permitido.has(v))
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
  if (total === 0) console.log('El portal no usa ningún valor fuera del prototipo.')
}

await main()
