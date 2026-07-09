import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { calcularHuellaAlta, type RegistroAltaVerifactu } from '@/lib/verifactu';
import { fechaExpedicionDesdeISO, fechaHoraHusoMadrid, urlQrVerifactu } from '@/lib/verifactu-qr';

// ─────────────────────────────────────────────────────────────────────────────
// Sella una factura con su huella Veri*Factu y la persiste. Es el ÚNICO punto
// donde se inserta una factura: así el sellado (huella encadenada por estudio)
// y la inserción ocurren juntos en el servidor, con node:crypto, y no dependen
// del navegador.
//
// SEGURIDAD: solo staff autenticado, y solo puede facturar en SU estudio.
//
// ⚠️ Formato/entorno: la huella y el QR se generan según el orden oficial de la
// AEAT, pero deben validarse contra el entorno de PRUEBAS de la AEAT y con un
// asesor antes de producción. Por defecto el QR apunta a preproducción; pon
// VERIFACTU_ENTORNO=produccion para el endpoint real. No es asesoramiento fiscal.
// ─────────────────────────────────────────────────────────────────────────────

interface FacturaEntrante {
  id: string;
  studioId: string;
  reciboId: string;
  numeroCompleto: string;
  fechaEmision: string;    // ISO
  receptorNombre: string;
  receptorNIF: string | null;
  baseImponible: number;
  tipoIVA: number;
  cuotaIVA: number;
  total: number;
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 });
  }

  const f = (await req.json()) as FacturaEntrante;
  if (!f?.id || !f?.numeroCompleto) {
    return NextResponse.json({ error: 'Factura incompleta' }, { status: 400 });
  }
  if (f.studioId !== sesion.studioId) {
    return NextResponse.json({ error: 'No autorizado para este estudio' }, { status: 403 });
  }

  // Idempotencia: si ya existe (mismo id o mismo recibo) no re-sellar ni duplicar.
  const { data: existente } = await admin
    .from('facturas')
    .select('id, verifactu_hash, verifactu_prev_hash, verifactu_ts, verifactu_seq')
    .or(`id.eq.${f.id},recibo_id.eq.${f.reciboId}`)
    .limit(1)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ ok: true, yaExistia: true, factura: mapSalida(existente) });
  }

  // NIF del emisor (obligatorio para la huella). Sin él, la factura se guarda
  // pero SIN sellar, y se avisa: el estudio debe completar su NIF fiscal.
  const { data: studio } = await admin
    .from('studios')
    .select('nif')
    .eq('id', f.studioId)
    .maybeSingle();
  const nifEmisor = studio?.nif?.trim() || '';

  // Extremo actual de la cadena de este estudio (huella anterior + secuencia).
  // NOTA: en volúmenes de un estudio el riesgo de carrera es bajo; endurecer con
  // secuencia/lock en BD es tarea de la Fase 2 (envío a la AEAT).
  const { data: tip } = await admin
    .from('facturas')
    .select('verifactu_hash, verifactu_seq')
    .eq('studio_id', f.studioId)
    .not('verifactu_seq', 'is', null)
    .order('verifactu_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const huellaAnterior = tip?.verifactu_hash ?? '';
  const seq = (tip?.verifactu_seq ?? 0) + 1;

  const fila: Record<string, unknown> = {
    id: f.id,
    studio_id: f.studioId,
    recibo_id: f.reciboId,
    numero_completo: f.numeroCompleto,
    fecha_emision: f.fechaEmision,
    receptor_nombre: f.receptorNombre,
    receptor_nif: f.receptorNIF,
    base_imponible: f.baseImponible,
    tipo_iva: f.tipoIVA,
    cuota_iva: f.cuotaIVA,
    total: f.total,
  };

  let salida: Record<string, unknown> = {};
  if (nifEmisor) {
    const ts = fechaHoraHusoMadrid(new Date());
    const registro: RegistroAltaVerifactu = {
      idEmisorFactura: nifEmisor,
      numSerieFactura: f.numeroCompleto,
      fechaExpedicionFactura: fechaExpedicionDesdeISO(f.fechaEmision),
      // F1 = factura completa (receptor identificado con NIF); F2 = factura
      // simplificada / ticket (venta de mostrador sin NIF del cliente).
      tipoFactura: f.receptorNIF ? 'F1' : 'F2',
      cuotaTotal: f.cuotaIVA,
      importeTotal: f.total,
      fechaHoraHusoGenRegistro: ts,
    };
    const huella = calcularHuellaAlta(registro, huellaAnterior);
    const produccion = process.env.VERIFACTU_ENTORNO === 'produccion';
    const qrUrl = urlQrVerifactu(
      { nif: nifEmisor, numSerie: f.numeroCompleto, fecha: registro.fechaExpedicionFactura, importeTotal: f.total },
      { produccion },
    );
    fila.verifactu_hash = huella;
    fila.verifactu_prev_hash = huellaAnterior;
    fila.verifactu_ts = ts;
    fila.verifactu_seq = seq;
    salida = {
      verifactuHash: huella,
      verifactuPrevHash: huellaAnterior,
      verifactuTs: ts,
      verifactuSeq: seq,
      qrUrl,
      entorno: produccion ? 'produccion' : 'pruebas',
    };
  }

  const { error } = await admin.from('facturas').insert(fila);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sellada: Boolean(nifEmisor),
    aviso: nifEmisor ? null : 'La factura se guardó sin huella Veri*Factu: falta el NIF fiscal del estudio.',
    factura: salida,
  });
}

function mapSalida(row: { verifactu_hash: string | null; verifactu_prev_hash: string | null; verifactu_ts: string | null; verifactu_seq: number | null }) {
  return {
    verifactuHash: row.verifactu_hash,
    verifactuPrevHash: row.verifactu_prev_hash,
    verifactuTs: row.verifactu_ts,
    verifactuSeq: row.verifactu_seq,
  };
}
