// Generación e impresión de facturas en PDF (vía HTML + window.print), a
// partir de datos ya cargados en cliente — no depende de sesión de staff, así
// que lo usan tanto el panel (app/(dashboard)/facturas) como el portal de
// socias (app/portal/[slug]/mi-plan), donde antes el badge "· Factura" era
// texto inerte sin forma de obtener el documento.
import { urlQrVerifactu, fechaExpedicionDesdeISO } from '@/lib/verifactu-qr';
import { qrSvgMarkup } from '@/lib/qr-svg';
import type { Factura } from '@/lib/types';

export interface EmisorFactura {
  nombre: string;
  nif: string;
  direccion: string;
}

export interface ReceptorFactura {
  telefono?: string | null;
  email?: string | null;
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function generarFacturaHTML(
  f: Factura,
  emisor: EmisorFactura,
  receptor: ReceptorFactura | null,
  opciones?: { produccion?: boolean },
): string {
  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const entornoProduccion = opciones?.produccion ?? false;
  const cotejo = f.verifactuHash && emisor.nif
    ? urlQrVerifactu({ nif: emisor.nif, numSerie: f.numeroCompleto, fecha: fechaExpedicionDesdeISO(f.fechaEmision), importeTotal: f.total }, { produccion: entornoProduccion })
    : null;
  const qrSvg = cotejo ? qrSvgMarkup(cotejo) : '';
  const bloqueVerifactu = f.verifactuHash ? `
<div style="margin-top:32px;padding:16px;border:1px solid #E7E7E0;border-radius:8px;background:#FAFAF7;font-size:11px;color:#5A5A52;display:flex;gap:16px;align-items:flex-start">
  ${qrSvg ? `<div style="flex:0 0 96px;width:96px;height:96px">${qrSvg}</div>` : ''}
  <div style="flex:1;min-width:0">
    <div style="font-weight:700;color:#1A1A1A;margin-bottom:6px">Sistema de facturación verificable (Veri*Factu)</div>
    <div style="margin-bottom:4px">Huella: <span style="font-family:monospace;word-break:break-all">${f.verifactuHash}</span></div>
    ${cotejo ? `<div>QR de cotejo AEAT: <a href="${cotejo}" style="color:#7AA80E;word-break:break-all">${cotejo}</a></div>` : ''}
    ${entornoProduccion ? '' : '<div style="margin-top:6px;color:#B57A8E">Entorno de PRUEBAS — pendiente de validación con la AEAT y asesor fiscal.</div>'}
  </div>
</div>` : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>Factura ${f.numeroCompleto}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; font-size: 13px; color: #1A1A1A; padding: 40px; max-width: 680px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .title { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; }
  .numero { font-size: 13px; font-family: monospace; font-weight: 700; color: #B57A8E; margin-top: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
  .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #8E8E86; margin-bottom: 6px; }
  .party-name { font-weight: 700; margin-bottom: 2px; }
  .party-detail { color: #8E8E86; margin-bottom: 2px; }
  .meta { font-size: 12px; color: #8E8E86; margin-bottom: 32px; }
  .meta strong { color: #1A1A1A; }
  table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #E7E7E0; }
  thead tr { background: #F5F5F1; }
  th { text-align: left; padding: 10px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #8E8E86; }
  th:last-child { text-align: right; }
  td { padding: 14px 16px; border-top: 1px solid #E7E7E0; }
  td:last-child { text-align: right; font-weight: 600; }
  .sub-row td { background: #F5F5F1; font-size: 12px; color: #8E8E86; padding: 8px 16px; }
  .sub-row td:last-child { font-weight: 400; }
  .total-row td { font-weight: 900; font-size: 15px; border-top: 2px solid #E7E7E0; padding: 12px 16px; }
  .footer { margin-top: 48px; font-size: 11px; color: #A8A89F; border-top: 1px solid #F1F1EC; padding-top: 16px; }
  @media print {
    body { padding: 20px; }
    @page { size: A4; margin: 20mm; }
  }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="title">FACTURA</div>
    <div class="numero">${f.numeroCompleto}</div>
  </div>
  <div style="text-align:right">
    <div style="font-weight:700">${emisor.nombre}</div>
    <div style="color:#8E8E86">${emisor.nif}</div>
    <div style="color:#8E8E86">${emisor.direccion}</div>
  </div>
</div>
<div class="parties">
  <div>
    <div class="party-label">Emisor</div>
    <div class="party-name">${emisor.nombre}</div>
    <div class="party-detail">${emisor.nif}</div>
    <div class="party-detail">${emisor.direccion}</div>
  </div>
  <div>
    <div class="party-label">Receptor</div>
    <div class="party-name">${f.receptorNombre}</div>
    ${f.receptorNIF ? `<div class="party-detail">${f.receptorNIF}</div>` : ''}
    ${receptor?.telefono ? `<div class="party-detail">${receptor.telefono}</div>` : ''}
    ${receptor?.email ? `<div class="party-detail">${receptor.email}</div>` : ''}
  </div>
</div>
<div class="meta">Fecha de emisión: <strong>${fecha(f.fechaEmision)}</strong></div>
<table>
  <thead><tr><th>Concepto</th><th style="text-align:right">Importe</th></tr></thead>
  <tbody>
    <tr>
      <td>
        <div style="font-weight:600">Servicios de pilates</div>
        <div style="font-size:11px;color:#8E8E86;margin-top:2px">Cuota mensual / bono</div>
      </td>
      <td>${fmt(f.baseImponible)} €</td>
    </tr>
  </tbody>
  <tfoot>
    <tr class="sub-row"><td>Base imponible</td><td>${fmt(f.baseImponible)} €</td></tr>
    <tr class="sub-row"><td>IVA (${f.tipoIVA}%)</td><td>${fmt(f.cuotaIVA)} €</td></tr>
    <tr class="total-row"><td>TOTAL</td><td>${fmt(f.total)} €</td></tr>
  </tfoot>
</table>
${bloqueVerifactu}
<div class="footer">Documento generado el ${new Date().toLocaleDateString('es-ES')} · ${emisor.nombre} · ${emisor.nif}</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;
}

/** Abre una pestaña nueva con la factura lista para imprimir/guardar como PDF. */
export function abrirFacturaPDF(
  f: Factura,
  emisor: EmisorFactura,
  receptor: ReceptorFactura | null,
  opciones?: { produccion?: boolean },
) {
  const html = generarFacturaHTML(f, emisor, receptor, opciones);
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
