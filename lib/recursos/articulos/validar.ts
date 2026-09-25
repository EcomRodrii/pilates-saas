// ─────────────────────────────────────────────────────────────────────────────
// Lo que un artículo de /recursos tiene que cumplir para publicarse.
//
// Función pura: la usan el test de todo el registro (articulos.test.ts) y el
// script que valida un artículo suelto mientras se escribe
// (scripts/validar-articulo.mjs). Devuelve la lista de problemas; vacía = vale.
//
// Sin alias `@/`: mismo motivo que tipos.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Articulo, Bloque } from './tipos.ts';
import { esSlugDescarga } from '../descargas.ts';

/**
 * Lo que Tentare NO puede decir de sí mismo en la web (registro de afirmaciones
 * del 23-sep-2026). Si una frase de estas aparece, el artículo no se publica.
 */
export const FRASES_PROHIBIDAS: { patron: RegExp; motivo: string }[] = [
  { patron: /todo abierto/i, motivo: 'la prueba es del plan elegido, no «todo abierto»' },
  { patron: /\ben (unos )?(2|dos|pocos) minutos\b|\ben minutos\b/i, motivo: 'promesa de tiempo que no se puede sostener' },
  { patron: /\b48 ?h(oras)?\b/i, motivo: 'no hay plazo garantizado de migración' },
  { patron: /el m[aá]s elegido/i, motivo: 'no hay datos que lo respalden' },
  { patron: /soporte dedicado/i, motivo: 'el soporte es humano pero sin SLA' },
  { patron: /(el|la) [uú]nic[oa] (software|herramienta|programa|plataforma|app)/i, motivo: '«el único…» no se puede demostrar' },
  { patron: /cumple(s|n)? (con )?veri\*?factu|homologad[oa] (para|por) veri\*?factu/i, motivo: 'el envío a la AEAT está en desarrollo' },
  { patron: /cambian? de clase sol[ao]s?/i, motivo: 'no existe «cambiar»: se cancela y se reserva otra' },
  { patron: /\bmailchimp\b|\bbrevo\b/i, motivo: 'no hay integración' },
  { patron: /\bkiosko\b|v[ií]deo bajo demanda/i, motivo: 'funciones congeladas' },
  { patron: /vista consolidada/i, motivo: 'multi-sede sin vista consolidada' },
  { patron: /whatsapp (de serie|incluido|autom[aá]tico)|sms (de serie|incluidos?)/i, motivo: 'WhatsApp solo con la cuenta de Meta del estudio; SMS no' },
  // La factura solo imprime el QR cuando la AEAT ya tiene el registro, y el
  // envío no está activo: «numeración, huella y QR» se coló en cuatro textos.
  { patron: /(numeraci[oó]n legal|huella)[^.]{0,40}\by (el )?(c[oó]digo )?QR\b/i, motivo: 'las facturas de Tentare no llevan QR hasta que la AEAT tenga el registro' },
];

const RE_ENLACE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Todo el texto visible de un bloque. */
function textosDe(b: Bloque): string[] {
  switch (b.t) {
    case 'p': return [b.texto];
    case 'lista': return b.items;
    case 'pasos': return b.items.flatMap((i) => [i.titulo, i.texto]);
    case 'tabla': return [...b.cabecera, ...b.filas.flat(), b.nota ?? ''];
    case 'nota': return [b.titulo, b.texto];
    case 'cifras': return [b.titulo, b.nota, ...b.cifras.flatMap((c) => [c.valor, c.etiqueta])];
    case 'herramienta': return [];
    case 'descarga': return [];
  }
}

/** Todo el texto visible del artículo, en orden. */
export function textoVisible(a: Articulo): string[] {
  return [
    a.titulo, a.respuesta, a.entradilla,
    ...a.secciones.flatMap((s) => [s.titulo, ...s.bloques.flatMap(textosDe)]),
    ...a.faq.flatMap((f) => [f.q, f.a]),
    a.cta.titulo, a.cta.texto,
  ];
}

export function contarPalabras(a: Articulo): number {
  return textoVisible(a).join(' ').replace(RE_ENLACE, '$1').split(/\s+/).filter(Boolean).length;
}

/** Enlaces internos (rutas) que aparecen en el texto. */
export function enlacesInternos(a: Articulo): string[] {
  const out: string[] = [];
  for (const t of textoVisible(a)) {
    for (const m of t.matchAll(RE_ENLACE)) if (m[2].startsWith('/')) out.push(m[2]);
  }
  return out;
}

/**
 * @param rutasValidas rutas que existen (registro SEO, ayuda, otros artículos).
 *   Un enlace a `/ruta#ancla` vale si existe `/ruta`.
 */
export function validarArticulo(a: Articulo, rutasValidas: Set<string>): string[] {
  const p: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) p.push(msg); };

  ok(RE_SLUG.test(a.slug), `slug no es kebab-case: ${a.slug}`);
  ok(a.titulo.length >= 30 && a.titulo.length <= 100, `titulo: ${a.titulo.length} caracteres (30-100)`);
  ok(a.tituloSeo.length >= 30 && a.tituloSeo.length <= 62, `tituloSeo: ${a.tituloSeo.length} caracteres (30-62)`);
  ok(!/tentare/i.test(a.tituloSeo), 'tituloSeo no lleva la marca: se añade sola');
  ok(a.descripcion.length >= 110 && a.descripcion.length <= 160, `descripcion: ${a.descripcion.length} caracteres (110-160)`);
  ok(a.resumen.length >= 60 && a.resumen.length <= 220, `resumen: ${a.resumen.length} caracteres (60-220)`);
  ok(RE_FECHA.test(a.publicado), 'publicado: AAAA-MM-DD');
  ok(a.actualizado === undefined || RE_FECHA.test(a.actualizado), 'actualizado: AAAA-MM-DD');
  ok(a.consultaPrincipal.trim().length > 0, 'falta consultaPrincipal');
  const palabrasRespuesta = a.respuesta.split(/\s+/).filter(Boolean).length;
  ok(palabrasRespuesta >= 35 && palabrasRespuesta <= 100, `respuesta: ${palabrasRespuesta} palabras (35-100)`);
  ok(a.secciones.length >= 4, `solo ${a.secciones.length} secciones (mínimo 4)`);
  ok(a.faq.length >= 4 && a.faq.length <= 8, `faq: ${a.faq.length} preguntas (4-8)`);
  ok(a.relacionadas.length >= 2, 'relacionadas: al menos 2');

  const palabras = contarPalabras(a);
  ok(palabras >= 1100, `solo ${palabras} palabras (mínimo 1100)`);

  const ids = a.secciones.map((s) => s.id);
  ok(new Set(ids).size === ids.length, 'ids de sección repetidos');
  for (const id of ids) ok(RE_SLUG.test(id), `id de sección no es kebab-case: ${id}`);

  for (const f of a.fuentes) {
    ok(/^https:\/\//.test(f.url), `fuente sin https: ${f.url}`);
    ok(RE_FECHA.test(f.consultada), `fuente sin fecha de consulta: ${f.url}`);
  }

  // Cifras y tablas con números: o fuentes, o dicen que son de ejemplo.
  for (const s of a.secciones) {
    for (const b of s.bloques) {
      if (b.t === 'cifras') ok(b.nota.trim().length > 10, `cifras sin nota de origen en «${s.titulo}»`);
      if (b.t === 'descarga') ok(esSlugDescarga(b.recurso), `descarga de un recurso que no está en lib/recursos/descargas.ts: ${b.recurso}`);
      if (b.t === 'tabla') {
        ok(b.filas.every((f) => f.length === b.cabecera.length), `tabla con filas de distinto ancho en «${s.titulo}»`);
        const conNumeros = b.filas.flat().some((c) => /\d/.test(c));
        ok(!conNumeros || (b.nota ?? '').trim().length > 10, `tabla con cifras sin nota de origen en «${s.titulo}»`);
      }
    }
  }

  const texto = textoVisible(a).join('\n');
  for (const { patron, motivo } of FRASES_PROHIBIDAS) {
    ok(!patron.test(texto), `frase prohibida (${motivo}): ${texto.match(patron)?.[0]}`);
  }

  for (const ruta of [...enlacesInternos(a), ...a.relacionadas, ...(a.cta.enlace ? [a.cta.enlace.href] : [])]) {
    const base = ruta.split('#')[0].split('?')[0];
    // Las plantillas descargables son ficheros de public/ (su existencia la
    // comprueba articulos.test.ts), no páginas del registro.
    if (base.startsWith('/recursos/plantillas/')) continue;
    ok(rutasValidas.has(base), `enlace interno a una ruta que no existe: ${ruta}`);
  }
  ok(!a.relacionadas.includes(`/recursos/${a.slug}`), 'se enlaza a sí mismo en relacionadas');

  for (const t of textoVisible(a)) {
    for (const m of t.matchAll(RE_ENLACE)) {
      const url = m[2];
      ok(url.startsWith('/') || url.startsWith('https://'), `enlace con URL no válida: ${url}`);
    }
    ok(!/<[a-z][^>]*>/i.test(t), 'hay HTML en el texto: solo **negrita** y [enlaces](url)');
  }

  return p;
}
