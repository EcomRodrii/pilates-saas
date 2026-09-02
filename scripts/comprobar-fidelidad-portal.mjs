#!/usr/bin/env node
// Vigila que el portal de la socia no se aleje del vocabulario visual del
// prototipo "Tentare Studio App".
//
// POR QUÉ EXISTE. "Que quede idéntico al prototipo" no se puede sostener a ojo:
// ya se intentó auditando a mano contra el CHEATSHEET y se coló lo que no
// estaba documentado ahí (fotos de instructora, el estado vacío del buscador,
// el conteo de clases de Perfil...). Peor: nadie tenía una definición objetiva
// de "idéntico", así que cada revisión dependía de quién mirase. Esto convierte
// esa frase en algo medible.
//
// QUÉ COMPARA. El contrato NO se escribe a mano: se deriva de
// components/prototipo/StudioApp.jsx, que es el prototipo entero ya commiteado.
// Así no puede desincronizarse — si el prototipo cambia, el contrato cambia con
// él. Se miran tres cosas que definen el aire de una pantalla y que son fáciles
// de romper sin darse cuenta:
//   * color (hex): la paleta es corta y muy reconocible.
//   * tamaño de letra: la escala usa medios píxeles (11.5, 12.5, 9.5) a
//     propósito; un 12 donde tocaba 12.5 no se ve, pero se acumula.
//   * peso de letra: el prototipo usa SOLO 800/700/600/500. Un 400 es la señal
//     más clara de que algo se escribió sin mirar el diseño.
//
// QUÉ **NO** COMPARA, y por qué. Nada de `rgba()` (el prototipo lo usa para
// velos y degradados, donde la variación es legítima y compararla sería ruido),
// ni espaciados (padding/gap dependen del contenido), ni las paletas
// CATEGÓRICAS —colores de salas, tipos de clase, avatares de equipo, series de
// gráficas—: ahí el color DISTINGUE, no marca, y meterlas en la paleta de marca
// es justo el error que .claude/tentare-os.md avisa de no cometer.
//
// CÓMO SE USA. Falla solo con deriva NUEVA: lo que ya estaba el día que se
// escribió esto vive en ACEPTADAS. La conversión del portal al diseño irá
// vaciando esa lista; cuando quede vacía, el portal es idéntico en vocabulario.
// No es un sustituto de mirar la pantalla — es el suelo por debajo del cual no
// se baja sin enterarse.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROTOTIPO = 'components/prototipo/StudioApp.jsx'
const AMBITO = ['components/portal', 'app/portal/[slug]']

/**
 * Borra comentarios conservando saltos de línea (para no mover los números de
 * línea del informe).
 *
 * ⚠️ No es cosmético: este repo cita PRs en los comentarios («ver #500»,
 * «patrón de #610») y eso es indistinguible de un hex de 3 dígitos — `#500`
 * normaliza a `#550000`. Sin esto el check inventaba deriva en ficheros
 * impecables, que es la forma más rápida de que alguien deje de mirarlo.
 */
export function sinComentarios(fuente) {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length))
}

/** `#fff` y `#FFFFFF` son el mismo color; sin esto el informe es puro ruido. */
export function normalizarHex(h) {
  const s = h.toLowerCase()
  return s.length === 4 ? '#' + [...s.slice(1)].map((c) => c + c).join('') : s
}

/**
 * Deja un color en una forma comparable venga de donde venga.
 *
 * Hace falta porque el código escribe `#FFF` o `rgba(250,249,245,.88)` y el
 * navegador computa `rgb(255, 255, 255)` o `rgba(250, 249, 245, 0.88)`: sin
 * canonizar, el mismo color parecía dos distintos.
 */
export function canonizarColor(v) {
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '')
  let m = s.match(/^rgb\((\d+),(\d+),(\d+)\)$/)
  if (m) return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')
  m = s.match(/^rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)$/)
  if (m) return `rgba(${Number(m[1])},${Number(m[2])},${Number(m[3])},${Number(m[4])})`
  return s.startsWith('#') ? normalizarHex(s) : s
}

/** El vocabulario del prototipo, leído del propio componente. */
export function contratoDesde(fuenteCruda) {
  const fuente = sinComentarios(fuenteCruda)
  const colores = new Set()
  for (const h of fuente.match(/#[0-9A-Fa-f]{3}\b|#[0-9A-Fa-f]{6}\b/g) ?? []) {
    colores.add(normalizarHex(h))
  }
  // `rgba(...)` también es vocabulario del prototipo (velos y degradados). No lo
  // usa este check —solo mira hex en el código— pero sí lo necesita
  // comparar-portal-prototipo.mjs, que lee lo que el navegador computa y ahí
  // todo llega como rgb()/rgba(). Se guarda ya canonizado para poder comparar.
  for (const c of fuente.match(/rgba?\([^)]*\)/g) ?? []) colores.add(canonizarColor(c))
  // Los radios no los vigila este check (el código del portal los escribe de mil
  // formas), pero son parte del vocabulario y la comparación visual sí los mide.
  const radios = new Set()
  for (const m of fuente.matchAll(/border-radius:\s*([^;"'`]+)/g)) radios.add(m[1].trim())
  for (const m of fuente.matchAll(/borderRadius:\s*'([^']+)'/g)) radios.add(m[1].trim())
  for (const m of fuente.matchAll(/borderRadius:\s*(\d+)\b/g)) radios.add(m[1] + 'px')
  const tamanos = new Set()
  // Los dos dialectos que convive el prototipo: CSS literal y objeto de React.
  for (const m of fuente.matchAll(/font-size:\s*([0-9.]+)px/g)) tamanos.add(m[1])
  for (const m of fuente.matchAll(/fontSize:\s*([0-9.]+)/g)) tamanos.add(m[1])
  const pesos = new Set()
  for (const m of fuente.matchAll(/font-weight:\s*([0-9]{3})/g)) pesos.add(m[1])
  for (const m of fuente.matchAll(/fontWeight:\s*([0-9]{3})/g)) pesos.add(m[1])
  return { colores, tamanos, pesos, radios }
}

/** Lo que de verdad usa el portal, con dónde, para poder ir a arreglarlo. */
export function usosDe(fuenteCruda) {
  const usos = []
  const lineas = sinComentarios(fuenteCruda).split('\n')
  lineas.forEach((linea, i) => {
    for (const h of linea.match(/#[0-9A-Fa-f]{3}\b|#[0-9A-Fa-f]{6}\b/g) ?? []) {
      usos.push({ clase: 'color', valor: normalizarHex(h), linea: i + 1 })
    }
    for (const m of linea.matchAll(/fontSize:\s*([0-9.]+)/g)) {
      usos.push({ clase: 'tamaño', valor: m[1], linea: i + 1 })
    }
    for (const m of linea.matchAll(/fontWeight:\s*([0-9]{3})/g)) {
      usos.push({ clase: 'peso', valor: m[1], linea: i + 1 })
    }
  })
  return usos
}

function ficherosDe(dir) {
  const salida = []
  const rec = (d) => {
    let entradas
    try { entradas = readdirSync(d) } catch { return }
    for (const e of entradas) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) rec(p)
      else if (p.endsWith('.tsx') || p.endsWith('.ts')) salida.push(p)
    }
  }
  rec(join(RAIZ, dir))
  return salida
}

// Lo que hoy se aparta del prototipo, medido el 2026-09-02 con `--todo`.
// Está partido en dos a propósito, porque NO son la misma cosa:
//
//   LEGITIMAS  — el prototipo no cubre eso, y no debería. Se quedan.
//   PENDIENTES — deriva de verdad, en pantallas que el prototipo SÍ dibuja.
//                Esta lista tiene que ir a cero con la conversión. Cada valor
//                que se borre de aquí es una pantalla que se acercó al diseño.
//
// El check acepta las dos (así está verde en main hoy), pero la diferencia
// queda escrita: si se mezclaran, en un mes nadie sabría qué falta por hacer.

const LEGITIMAS = {
  color: new Set([
    // Marca del ESTUDIO (white-label), no la del prototipo: cada estudio pinta
    // la suya. Ver [[identidad-visual-oliva]] y --portal-brand-*.
    '#343825', '#d9c29e',
    // Paleta CATEGÓRICA de /videos: un degradado por tipo de clase. Aquí el
    // color DISTINGUE, no marca — meterlo en la paleta de marca es justo el
    // error contra el que avisa .claude/tentare-os.md.
    '#059669', '#10b981', '#ec4899', '#f472b6', '#ef4444', '#f97316',
    '#6366f1', '#8b5cf6', '#0ea5e9', '#38bdf8', '#d97706', '#dc2626', '#8e8e86',
    // Pantallas que el prototipo no dibuja: /videos, /progreso, /clave-nueva,
    // error.tsx, layout y el manifest PWA (que ni siquiera es interfaz).
    '#000000', '#131313', '#6b6b6b', '#f8f9fa', '#b85436', '#3e9b6c',
  ]),
  tamaño: new Set([]),
  peso: new Set([]),
}

const PENDIENTES = {
  color: new Set([
    // Neutros y grises propios en pantallas que el prototipo SÍ cubre: la
    // hoja de reserva, el pase, la oferta de lista de espera, Home, Reservas.
    // El prototipo resuelve estos casos con #EFEDE4 / #E5E3DA / #98A093.
    '#d8d4c9', '#eef0ea', '#f6f4ef', '#f2f0ea', '#ece9e2', '#e4e1d8',
    '#0e2216', '#b0453a', '#8a2e22',
  ]),
  // 48px y 42px son cifras grandes de saldo; el prototipo llega a 46px como
  // mucho. 8px es más pequeño que su tamaño mínimo (8.5px).
  tamaño: new Set(['48', '42', '8']),
  // ⚠️ El caso más claro de todos: el prototipo NUNCA usa peso 400, y
  // hoja-reserva.tsx lo usa 11 veces. Es una pantalla que el diseño dibuja
  // entera, y una auditoría a ojo la dio por fiel — esto es exactamente lo
  // que este check existe para no volver a dejar pasar.
  peso: new Set(['400']),
}

const ACEPTADAS = {
  color: new Set([...LEGITIMAS.color, ...PENDIENTES.color]),
  tamaño: new Set([...LEGITIMAS.tamaño, ...PENDIENTES.tamaño]),
  peso: new Set([...LEGITIMAS.peso, ...PENDIENTES.peso]),
}

export function derivaNueva(contrato, hallazgos, aceptadas = ACEPTADAS) {
  const permitido = { color: contrato.colores, tamaño: contrato.tamanos, peso: contrato.pesos }
  return hallazgos.filter(
    (h) => !permitido[h.clase].has(h.valor) && !aceptadas[h.clase].has(h.valor),
  )
}

function main() {
  // `--todo` ignora el baseline y enseña TODO lo que aún separa al portal del
  // prototipo. Es el modo para seguir el avance de la conversión: informa, no
  // falla. Sin la bandera, el check solo protege contra deriva NUEVA.
  const todo = process.argv.includes('--todo')
  const contrato = contratoDesde(readFileSync(join(RAIZ, PROTOTIPO), 'utf8'))
  const hallazgos = []
  for (const dir of AMBITO) {
    for (const f of ficherosDe(dir)) {
      for (const u of usosDe(readFileSync(f, 'utf8'))) {
        hallazgos.push({ ...u, fichero: relative(RAIZ, f) })
      }
    }
  }

  const VACIO = { color: new Set(), tamaño: new Set(), peso: new Set() }
  const nueva = derivaNueva(contrato, hallazgos, todo ? VACIO : ACEPTADAS)
  const fuera = hallazgos.filter(
    (h) => !{ color: contrato.colores, tamaño: contrato.tamanos, peso: contrato.pesos }[h.clase].has(h.valor),
  )

  console.log(
    `Contrato del prototipo: ${contrato.colores.size} colores, ` +
      `${contrato.tamanos.size} tamaños, ${contrato.pesos.size} pesos.`,
  )
  console.log(
    `Portal: ${hallazgos.length} usos revisados, ${fuera.length} fuera del contrato ` +
      `(${fuera.length - nueva.length} ya conocidos).`,
  )

  if (nueva.length === 0) {
    console.log('\nSin deriva nueva.')
    if (fuera.length === 0) console.log('Y la lista conocida está vacía: el vocabulario ya es el del prototipo.')
    return
  }

  console.error(`\n${todo ? 'TODO lo que separa al portal del prototipo' : 'DERIVA NUEVA respecto al prototipo'} (${nueva.length}):`)
  for (const h of nueva) {
    console.error(`  ${h.fichero}:${h.linea}  ${h.clase} ${h.valor}`)
  }
  if (todo) return
  console.error(
    '\nO se usa un valor del prototipo, o —si esta pantalla no existe en el diseño—\n' +
      'se añade a ACEPTADAS en este mismo fichero explicando por qué.',
  )
  process.exitCode = 1
}

// Autocomprobación: que el propio check no mienta, sin depender del repo.
function autocomprobacion() {
  const c = contratoDesde('color:#FFF;font-size:12.5px;fontWeight: 800')
  if (!c.colores.has('#ffffff')) throw new Error('normalización de hex rota')
  if (!c.tamanos.has('12.5')) throw new Error('extracción de tamaño rota')
  if (!c.pesos.has('800')) throw new Error('extracción de peso rota')
  const vacio = { color: new Set(), tamaño: new Set(), peso: new Set() }
  const d = derivaNueva(c, [{ clase: 'peso', valor: '400', linea: 1 }], vacio)
  if (d.length !== 1) throw new Error('no detecta deriva')
  const b = derivaNueva(c, [{ clase: 'peso', valor: '400', linea: 1 }], { ...vacio, peso: new Set(['400']) })
  if (b.length !== 0) throw new Error('no respeta el baseline')
  // El falso positivo que de verdad apareció: «(bug #500)» en un comentario.
  if (usosDe('// se arregló en el bug #500\n').length !== 0) throw new Error('lee hex dentro de comentarios')
  if (usosDe('/* ver #610 */\n').length !== 0) throw new Error('lee hex en comentario de bloque')
  if (usosDe("const c = '#5A5A52'\n").length !== 1) throw new Error('deja de ver colores reales')
  // El canonizador: el mismo color escrito de tres formas tiene que coincidir.
  if (canonizarColor('#FFF') !== '#ffffff') throw new Error('canoniza mal el hex corto')
  if (canonizarColor('rgb(255, 255, 255)') !== '#ffffff') throw new Error('canoniza mal rgb()')
  if (canonizarColor('rgba(250,249,245,.88)') !== canonizarColor('rgba(250, 249, 245, 0.88)')) {
    throw new Error('canoniza mal rgba()')
  }
  if (!contratoDesde('border-radius:999px').radios.has('999px')) throw new Error('no lee radios')
  console.log('autocomprobación OK')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--autocomprobacion')) autocomprobacion()
  else main()
}
