// La declaración responsable en un documento que el estudio puede guardar como
// PDF o imprimir (Orden HAC/1177/2024, art. 15.3: a disposición del cliente
// «en papel o electrónicamente en formato ampliamente extendido y gratuito»).
// Mismo mecanismo que las facturas (`lib/factura-pdf.ts`): HTML + window.print.
//
// Solo se ofrece la SUSCRITA. Un borrador descargado circularía como si fuera
// la declaración de verdad.

export interface DeclaracionImprimible {
  titulo: string;
  version: string;
  apartados: { letra: string; etiqueta: string; valor: string | null }[];
  suscrita: { fecha: string; lugar: string; suscritaEn: string; sha256: string };
}

// Se escribe con document.write en una ventana del mismo origen que la app:
// nombre y dirección del productor vienen del entorno, pero se escapa todo
// igual (mismo motivo que en factura-pdf.ts).
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function htmlDeclaracion(d: DeclaracionImprimible): string {
  const apartados = d.apartados.map(a => {
    const etiqueta = `<p class="etiqueta">${esc(a.letra)}) ${esc(a.etiqueta)}${a.valor === '' ? '' : ':'}</p>`;
    const valor = a.valor === '' ? '' : `<p class="valor">${esc(a.valor ?? '')}</p>`;
    return `<div class="apartado">${etiqueta}${valor}</div>`;
  }).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(d.titulo)} · versión ${esc(d.version)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111; max-width: 720px; margin: 32px auto; padding: 0 24px; line-height: 1.5; }
  h1 { font-size: 17px; letter-spacing: .02em; margin: 0 0 4px; }
  .sub { font-size: 12px; color: #555; margin: 0 0 24px; }
  .apartado { margin: 0 0 14px; page-break-inside: avoid; }
  .etiqueta { font-size: 12px; font-weight: 600; color: #444; margin: 0; }
  .valor { font-size: 13.5px; margin: 3px 0 0; white-space: pre-line; }
  .pie { margin-top: 28px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 11px; color: #555; word-break: break-all; }
</style></head><body>
<h1>${esc(d.titulo)}</h1>
<p class="sub">Versión del sistema ${esc(d.version)}</p>
${apartados}
<p class="pie">Suscrita el ${esc(d.suscrita.fecha)} en ${esc(d.suscrita.lugar)}. Huella SHA-256 del texto suscrito: ${esc(d.suscrita.sha256)}.<br>Documento generado el ${esc(new Date().toLocaleDateString('es-ES'))}.</p>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;
}

/** Abre una pestaña con la declaración lista para guardar como PDF o imprimir. */
export function abrirDeclaracionPDF(d: DeclaracionImprimible) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(htmlDeclaracion(d));
  w.document.close();
}
