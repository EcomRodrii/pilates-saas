import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calcularHuellaAlta, type RegistroAltaVerifactu } from '@/lib/verifactu';
import { fechaExpedicionDesdeISO, fechaHoraHusoMadrid, urlQrVerifactu } from '@/lib/verifactu-qr';
import { nifEmisorValido } from '@/lib/nif';
import { fiskalyConfigurado, asegurarEmisor, firmarFactura } from '@/lib/billing/fiskaly';

// Núcleo del sellado Veri*Factu, extraído de app/api/facturas/sellar para que lo
// puedan invocar TANTO la ruta (staff autenticado) COMO el webhook de Stripe
// (cobro SEPA confirmado → factura por ciclo, sin sesión de usuario). Todo el
// contenido fiscal se recalcula en servidor desde el recibo; el llamador solo
// aporta studioId + reciboId + un id de factura.
//
// Idempotente por id o recibo_id: llamarlo dos veces sobre el mismo recibo no
// duplica la factura ni bifurca la cadena.
//
// ⚠️ Follow-up C-5 (preexistente): la lectura del extremo de la cadena + inserción
// no es atómica; bajo dos sellados simultáneos del MISMO estudio puede
// bifurcarse. Endurecer con UNIQUE(studio_id, verifactu_seq/numero_completo) +
// advisory lock. No se agrava aquí (misma idempotencia por recibo_id).

export interface ResultadoSellado {
  ok: boolean;
  error?: string;
  yaExistia?: boolean;
  sellada?: boolean;
  aviso?: string | null;
  factura?: Record<string, unknown>;
}

export async function sellarFacturaDeRecibo(
  admin: SupabaseClient,
  params: { studioId: string; reciboId: string; facturaId: string },
): Promise<ResultadoSellado> {
  const { studioId, reciboId, facturaId } = params;

  // Los identificadores se interpolaban en un filtro PostgREST (.or): una coma o
  // un paréntesis en el id permitía inyectar condiciones arbitrarias en la
  // consulta. Se validan antes de tocar la base de datos y se consultan con
  // .eq() separados, además acotados al estudio (la búsqueda por .or tampoco
  // filtraba por studio_id: podía encontrar la factura de otro tenant y darla
  // por ya sellada).
  const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;
  if (!ID_VALIDO.test(facturaId) || !ID_VALIDO.test(reciboId)) {
    return { ok: false, error: 'Identificadores inválidos' };
  }

  // Idempotencia: si ya existe (mismo id o mismo recibo) no re-sellar ni duplicar.
  const COLS_SELLO = 'id, verifactu_hash, verifactu_prev_hash, verifactu_ts, verifactu_seq';
  const { data: porId } = await admin
    .from('facturas').select(COLS_SELLO)
    .eq('id', facturaId).eq('studio_id', studioId)
    .limit(1).maybeSingle();
  const existente = porId ?? (await admin
    .from('facturas').select(COLS_SELLO)
    .eq('recibo_id', reciboId).eq('studio_id', studioId)
    .limit(1).maybeSingle()).data;
  if (existente) {
    return { ok: true, yaExistia: true, factura: mapSalida(existente) };
  }

  const { data: studio } = await admin
    .from('studios')
    .select('nif, iva_por_defecto, razon_social, nombre, direccion, ciudad, codigo_postal, email, fiskaly_signer_id, fiskaly_client_id')
    .eq('id', studioId)
    .maybeSingle();
  const nifEmisor = studio?.nif?.trim() || '';
  // F0 · CFG-1: no sellar con un NIF vacío o de relleno (p. ej. el 'B12345678' del
  // demo) — crearía una cadena Veri*Factu con identidad fiscal falsa. Se bloquea la
  // emisión hasta que el estudio configure un NIF válido.
  if (!nifEmisorValido(nifEmisor)) {
    return { ok: false, error: 'Configura un NIF fiscal válido en Configuración → Mi estudio antes de emitir facturas (el actual está vacío o es de relleno).' };
  }

  const { data: recibo } = await admin
    .from('recibos').select('importe, socio_id')
    .eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
  if (!recibo) {
    return { ok: false, error: 'Recibo no encontrado' };
  }

  // El importe del recibo es IVA INCLUIDO; el tipo solo reparte total → base+cuota.
  const tipoIVA = Number(studio?.iva_por_defecto ?? 21);
  const divisor = 1 + tipoIVA / 100;
  const total = Math.round(Number(recibo.importe) * 100) / 100;
  const baseImponible = Math.round((total / divisor) * 100) / 100;
  const cuotaIVA = Math.round((total - baseImponible) * 100) / 100;

  let receptorNombre = 'Cliente de mostrador';
  let receptorNIF: string | null = null;
  if (recibo.socio_id) {
    const { data: socio } = await admin
      .from('socios').select('nombre, apellidos, nif').eq('id', recibo.socio_id).maybeSingle();
    if (socio) {
      receptorNombre = `${socio.nombre ?? ''} ${socio.apellidos ?? ''}`.trim() || 'Cliente';
      receptorNIF = (socio.nif as string | null) ?? null;
    }
  }

  // Número correlativo por estudio y año (A-{año}-{NNNN}), max+1.
  const fechaEmision = new Date().toISOString();
  const anio = new Date(fechaEmision).getFullYear();
  const { data: delAnio } = await admin
    .from('facturas').select('numero_completo')
    .eq('studio_id', studioId).like('numero_completo', `A-${anio}-%`);
  let maxN = 0;
  for (const row of delAnio ?? []) {
    const m = /A-\d{4}-(\d+)/.exec((row.numero_completo as string | null) ?? '');
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  const numeroCompleto = `A-${anio}-${String(maxN + 1).padStart(4, '0')}`;

  // Extremo actual de la cadena del estudio.
  const { data: tip } = await admin
    .from('facturas')
    .select('verifactu_hash, verifactu_seq')
    .eq('studio_id', studioId)
    .not('verifactu_seq', 'is', null)
    .order('verifactu_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const huellaAnterior = tip?.verifactu_hash ?? '';
  const seq = (tip?.verifactu_seq ?? 0) + 1;

  const fila: Record<string, unknown> = {
    id: facturaId,
    studio_id: studioId,
    recibo_id: reciboId,
    numero_completo: numeroCompleto,
    fecha_emision: fechaEmision,
    receptor_nombre: receptorNombre,
    receptor_nif: receptorNIF,
    base_imponible: baseImponible,
    tipo_iva: tipoIVA,
    cuota_iva: cuotaIVA,
    total,
  };

  let salida: Record<string, unknown> = {};
  if (nifEmisor) {
    const ts = fechaHoraHusoMadrid(new Date());
    const registro: RegistroAltaVerifactu = {
      idEmisorFactura: nifEmisor,
      numSerieFactura: numeroCompleto,
      fechaExpedicionFactura: fechaExpedicionDesdeISO(fechaEmision),
      tipoFactura: receptorNIF ? 'F1' : 'F2',
      cuotaTotal: cuotaIVA,
      importeTotal: total,
      fechaHoraHusoGenRegistro: ts,
    };
    const huella = calcularHuellaAlta(registro, huellaAnterior);
    const produccion = process.env.VERIFACTU_ENTORNO === 'produccion';
    const qrUrl = urlQrVerifactu(
      { nif: nifEmisor, numSerie: numeroCompleto, fecha: registro.fechaExpedicionFactura, importeTotal: total },
      { produccion },
    );
    fila.verifactu_hash = huella;
    fila.verifactu_prev_hash = huellaAnterior;
    fila.verifactu_ts = ts;
    fila.verifactu_seq = seq;
    salida = {
      verifactuHash: huella, verifactuPrevHash: huellaAnterior, verifactuTs: ts, verifactuSeq: seq,
      qrUrl, entorno: produccion ? 'produccion' : 'pruebas',
    };

    // Firma + transmisión a la AEAT vía Fiskaly, SOLO si está configurado (creds
    // en entorno). Si algo falla, la factura mantiene la huella propia de arriba:
    // no se pierde ninguna factura por un fallo de Fiskaly.
    if (fiskalyConfigurado()) {
      try {
        let signerId = studio?.fiskaly_signer_id as string | null;
        let clientId = studio?.fiskaly_client_id as string | null;
        if (!signerId || !clientId) {
          const nuevos = await asegurarEmisor(
            {
              legalName: (studio?.razon_social as string | null) || (studio?.nombre as string | null) || 'Estudio',
              nif: nifEmisor,
              direccion: (studio?.direccion as string | null) || undefined,
              ciudad: (studio?.ciudad as string | null) || undefined,
              codigoPostal: (studio?.codigo_postal as string | null) || undefined,
              email: (studio?.email as string | null) || undefined,
            },
            signerId || randomUUID(),
            clientId || randomUUID(),
          );
          signerId = nuevos.signerId;
          clientId = nuevos.clientId;
          await admin.from('studios')
            .update({ fiskaly_signer_id: signerId, fiskaly_client_id: clientId })
            .eq('id', studioId);
        }

        const fiskalyInvoiceId = randomUUID();
        const res = await firmarFactura({
          clientId,
          invoiceId: fiskalyInvoiceId,
          numero: numeroCompleto,
          simplificada: !receptorNIF,
          concepto: `Servicios de ${(studio?.nombre as string | null) || 'estudio'}`,
          totalConIva: total,
          lineas: [{ texto: 'Servicios prestados', base: baseImponible, total, tipoIva: tipoIVA }],
          receptor: receptorNIF
            ? { nombre: receptorNombre, nif: receptorNIF, direccion: 'España', codigoPostal: '00000' }
            : undefined,
        });
        fila.fiskaly_invoice_id = res.id;
        fila.verifactu_qr_url = res.qrUrl;
        fila.verifactu_qr_imagen = res.qrImagen;
        fila.verifactu_estado = res.transmision;
        fila.verifactu_csv = res.csv;
        salida = { ...salida, fiskaly: { estado: res.estado, transmision: res.transmision, csv: res.csv, qrUrl: res.qrUrl } };
      } catch (e) {
        console.error('[sellarFacturaDeRecibo] Fiskaly:', e instanceof Error ? e.message : e);
        // Se sigue con la huella propia; queda registro en logs para revisar.
      }
    }
  }

  const { error } = await admin.from('facturas').insert(fila);
  if (error) {
    console.error('[sellarFacturaDeRecibo]', error.message);
    return { ok: false, error: 'No se ha podido guardar la factura sellada.' };
  }

  return {
    ok: true,
    sellada: Boolean(nifEmisor),
    aviso: nifEmisor ? null : 'La factura se guardó sin huella Veri*Factu: falta el NIF fiscal del estudio.',
    factura: { ...salida, numeroCompleto, fechaEmision, receptorNombre, receptorNIF, baseImponible, cuotaIVA, total },
  };
}

export function mapSalida(row: { verifactu_hash: string | null; verifactu_prev_hash: string | null; verifactu_ts: string | null; verifactu_seq: number | null }) {
  return {
    verifactuHash: row.verifactu_hash,
    verifactuPrevHash: row.verifactu_prev_hash,
    verifactuTs: row.verifactu_ts,
    verifactuSeq: row.verifactu_seq,
  };
}
