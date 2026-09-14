import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// El repositorio de GitHub es PÚBLICO. Lo que se versiona aquí lo lee cualquiera.
//
// El 2026-09-14 se retiraron del árbol decenas de informes de auditoría (con sus
// parches) y varias direcciones de correo reales que habían ido entrando en
// docs, migraciones y comentarios. Nadie las metió a propósito: cada una llegó
// «de paso», dentro de un commit que hacía otra cosa. Esta guardia existe para
// que la próxima no llegue igual.
//
// Mira los ficheros VERSIONADOS (`git ls-files`), no el disco: lo que importa
// es lo que acaba en GitHub.
//
// ⚠️ Los mensajes de fallo NO imprimen el email encontrado: los logs de Actions
// de un repo público también son públicos. Se enseña enmascarado.
// ─────────────────────────────────────────────────────────────────────────────

const ficheros = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter(Boolean);

const EXT_DOCUMENTO = /\.(md|mdx|txt|pdf|html?|docx?|odt|rtf|csv|xlsx?|patch|diff)$/i;
const NOMBRE_DE_INFORME = /audit|auditor[ií]a|pentest|vuln|exploit|hallazgo/i;

// ── Excepciones: cortas y con motivo. «Para que pase» no es un motivo. ────────

/** Documentos con nombre de auditoría que SÍ pueden estar en el repo. */
const INFORMES_PERMITIDOS = new Set([
  // Inventarios previos a construir algo, citados desde código: describen qué
  // existía y cómo se diseñó, sin escenarios de explotación.
  'docs/NETWORK-AUDIT.md',
  'docs/NETWORK-AUDIT-2.md',
  'docs/marketing-integrations-audit.md',
  'docs/TENTARE-BRAIN-AUDITORIA.md',
  'WHATSAPP_AUDIT.md',
  // Producto, UX y CI: sin superficie de ataque.
  'docs/AUDITORIA-ALUMNA.md',
  'docs/AUDITORIA-FILOSOFIA-PRODUCTO-2026-07.md',
  'docs/AUDITORIA-CI-RENDIMIENTO-2026-08.md',
]);

/** Carpetas con nombre de auditoría cuyo contenido restante es de negocio. */
const CARPETAS_PERMITIDAS = [
  // Mercado, fiscalidad y roadmap. La parte técnica se retiró del repo.
  'AUDITORIA-TOTAL-2026-07/',
];

const DOMINIOS_PERMITIDOS: RegExp[] = [
  // Reservados para ejemplos y pruebas (RFC 2606 / 6761).
  /(^|\.)example(\.(com|org|net))?$/i,
  /\.(invalid|test|local|localhost)$/i,
  // Corporativos de Tentare: buzones de empresa, no de particulares.
  /^tentare\.(app|es)$/i,
  // Remitentes públicos de terceros citados en docs: sandbox de Resend y AEAT.
  /^resend\.dev$/i,
  /^correo\.aeat\.es$/i,
  // Fixtures: dominios de una letra y los estudios ficticios de las capturas.
  /^[a-z]\.(com|es)$/i,
  /^(studiocarmen|estudioaura)\.es$/i,
];

/** La plantilla por defecto de `supabase/config.toml` (comentada). */
const DIRECCIONES_PERMITIDAS = new Set(['admin@email.com']);

// ─────────────────────────────────────────────────────────────────────────────

function enmascarar(email: string): string {
  const [local, dominio] = email.split('@');
  const partes = dominio.split('.');
  const tld = partes.pop();
  return `${local[0]}***@${partes.map(p => `${p[0]}***`).join('.')}.${tld}`;
}

function leerTexto(ruta: string): string | null {
  let buf: Buffer;
  try {
    buf = readFileSync(ruta);
  } catch {
    return null; // borrado en el árbol de trabajo pero aún en el índice
  }
  if (buf.subarray(0, 8000).includes(0)) return null; // binario
  return buf.toString('utf8');
}

test('git ls-files devuelve el árbol (si no, esta guardia pasaría en verde sin mirar nada)', () => {
  assert.ok(ficheros.length > 1000, `solo ${ficheros.length} ficheros versionados — ¿se ejecuta fuera del repo?`);
  assert.ok(ficheros.some(f => f.startsWith('supabase/migrations/')), 'no se ve ninguna migración');
});

test('ningún informe de auditoría/pentest ni parche versionado fuera de la lista', () => {
  const infractores: string[] = [];
  for (const f of ficheros) {
    if (/\.(patch|diff)$/i.test(f)) {
      infractores.push(`${f} (parche versionado)`);
      continue;
    }
    // Una CARPETA con nombre de revisión en la raíz se mira entera, sea cual
    // sea la extensión: la que entró el 2026-09-14 era casi toda JSON, PNG y
    // `.err`, que el filtro de documentos de abajo deja pasar. Solo la raíz:
    // más adentro hay código legítimo con ese nombre (`app/interno/auditoria`).
    const raiz = f.includes('/') ? f.split('/')[0] : null;
    if (raiz && NOMBRE_DE_INFORME.test(raiz) && !CARPETAS_PERMITIDAS.some(p => f.startsWith(p))) {
      infractores.push(`${f} (carpeta de revisión)`);
      continue;
    }
    if (!EXT_DOCUMENTO.test(f)) continue;
    const segmentos = f.split('/');
    const nombre = segmentos.pop()!;
    if (NOMBRE_DE_INFORME.test(nombre) && !INFORMES_PERMITIDOS.has(f)) {
      infractores.push(f);
      continue;
    }
    const carpeta = segmentos.find(s => NOMBRE_DE_INFORME.test(s));
    if (carpeta && !CARPETAS_PERMITIDAS.some(p => f.startsWith(p)) && !INFORMES_PERMITIDOS.has(f)) {
      infractores.push(f);
    }
  }
  assert.deepEqual(
    infractores,
    [],
    'El repo es público: los informes de auditoría/pentest y sus parches viven fuera de él '
      + '(documentación interna). Si de verdad es un documento de diseño sin detalle explotable, '
      + 'añádelo a INFORMES_PERMITIDOS con su motivo.',
  );
});

test('las excepciones siguen existiendo (una lista muerta solo sirve para colar cosas)', () => {
  const muertas = [...INFORMES_PERMITIDOS].filter(p => !ficheros.includes(p));
  const carpetasMuertas = CARPETAS_PERMITIDAS.filter(p => !ficheros.some(f => f.startsWith(p)));
  assert.deepEqual([...muertas, ...carpetasMuertas], [], 'quita de la lista lo que ya no está en el repo');
});

function enAmbitoDeEmails(f: string): boolean {
  if (!f.includes('/')) return true; // la raíz
  if (/^(supabase|scripts|docs|\.claude|\.github)\//.test(f)) return true;
  // Documentos sueltos en cualquier otra carpeta que no sea código/fixtures.
  return EXT_DOCUMENTO.test(f) && !/^(app|lib|components|e2e|emails|public)\//.test(f);
}

test('ningún email real en supabase/, scripts/, docs/, .claude/, .github/ ni la raíz', () => {
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
  const infractores: string[] = [];
  let revisados = 0;
  for (const f of ficheros) {
    if (!enAmbitoDeEmails(f) || f === 'package-lock.json') continue;
    const texto = leerTexto(f);
    if (texto === null) continue;
    revisados++;
    for (const m of new Set(texto.match(email) ?? [])) {
      const dir = m.toLowerCase();
      if (DIRECCIONES_PERMITIDAS.has(dir)) continue;
      const dominio = dir.split('@')[1];
      if (DOMINIOS_PERMITIDOS.some(r => r.test(dominio))) continue;
      infractores.push(`${f}: ${enmascarar(m)}`);
    }
  }
  assert.ok(revisados > 100, `solo se revisaron ${revisados} ficheros — el ámbito se ha quedado vacío`);
  assert.deepEqual(
    infractores,
    [],
    'El repo es público: nada de direcciones de personas reales. Usa @example.com / .invalid; '
      + 'si es un caso medido en producción, descríbelo sin pegar la dirección.',
  );
});
