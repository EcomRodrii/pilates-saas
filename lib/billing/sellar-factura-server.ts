import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
// Relativos y con `.ts` explícita, no `@/lib/...`: este módulo ahora lo
// importa `entregar-plan-comprado.ts` (P-6, auditoría 21ª pasada), que sí
// tiene test unitario — el alias no lo resuelve el runner de `node --test`.
import { calcularHuellaAlta, type RegistroAltaVerifactu } from '../verifactu.ts';
import { fechaExpedicionDesdeISO, fechaHoraHusoMadrid, urlQrVerifactu } from '../verifactu-qr.ts';
import { nifEmisorValido } from '../nif.ts';
import { fiskalyConfigurado, asegurarEmisor, firmarFactura } from './fiskaly.ts';

// Núcleo del sellado Veri*Factu, extraído de app/api/facturas/sellar para que lo
// puedan invocar TANTO la ruta (staff autenticado) COMO el webhook de Stripe
// (cobro SEPA confirmado → factura por ciclo, sin sesión de usuario). Todo el
// contenido fiscal se recalcula en servidor desde el recibo; el llamador solo
// aporta studioId + reciboId + un id de factura.
//
// Idempotente por id o recibo_id: llamarlo dos veces sobre el mismo recibo no
// duplica la factura ni bifurca la cadena. Distingue "reservada pero
// incompleta" (crash entre la reserva atómica y el UPDATE final con la huella)
// de "verdaderamente sellada": en el primer caso retoma el cálculo de la
// huella/Fiskaly con los datos YA reservados, sin pedir un número nuevo.
//
// ── C-5 (cerrado) ───────────────────────────────────────────────────────────
// La reserva de numero_completo/verifactu_seq/verifactu_prev_hash pasa por la
// RPC reservar_numero_factura (SECURITY DEFINER, solo service_role — ver
// supabase/migrations/20260729152338_facturas_numeracion_atomica.sql), que
// toma un pg_advisory_xact_lock por estudio antes de leer el extremo de la
// cadena e insertar la fila base: serializa dos sellados simultáneos del
// MISMO estudio (p. ej. webhook de Stripe por un cobro SEPA + sellado manual
// desde el panel) y cierra el hueco de bifurcación que antes existía por leer
// el extremo de la cadena + insertar en llamadas SEPARADAS de supabase-js sin
// transacción compartida. Además, UNIQUE(studio_id, verifactu_seq) y
// UNIQUE(studio_id, numero_completo) actúan como red de seguridad dura.
//
// La huella (calcularHuellaAlta, función pura) y la firma Fiskaly (llamada
// HTTP externa) se calculan DESPUÉS de la reserva, fuera del lock — no lo
// necesitan — y terminan en un UPDATE por id (sin condición de carrera:
// acotado además a verifactu_hash IS NULL, así que si otra llamada
// concurrente para la MISMA factura ya la completó mientras tanto, se
// devuelve SU resultado en vez de pisarlo).

export interface ResultadoSellado {
  ok: boolean;
  error?: string;
  yaExistia?: boolean;
  sellada?: boolean;
  aviso?: string | null;
  factura?: Record<string, unknown>;
}

interface FilaFacturaReservada {
  id: string;
  verifactu_hash: string | null;
  verifactu_prev_hash: string | null;
  verifactu_ts: string | null;
  verifactu_seq: number | null;
  numero_completo: string;
  fecha_emision: string;
  receptor_nombre: string | null;
  receptor_nif: string | null;
  base_imponible: number | string | null;
  tipo_iva: number | string | null;
  cuota_iva: number | string | null;
  total: number | string | null;
}

const COLS_SELLO = 'id, verifactu_hash, verifactu_prev_hash, verifactu_ts, verifactu_seq, numero_completo, fecha_emision, receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total';

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

  const cargarExistente = async (): Promise<FilaFacturaReservada | null> => {
    const { data: porId } = await admin
      .from('facturas').select(COLS_SELLO)
      .eq('id', facturaId).eq('studio_id', studioId)
      .limit(1).maybeSingle();
    if (porId) return porId as FilaFacturaReservada;
    const { data: porRecibo } = await admin
      .from('facturas').select(COLS_SELLO)
      .eq('recibo_id', reciboId).eq('studio_id', studioId)
      .limit(1).maybeSingle();
    return (porRecibo as FilaFacturaReservada | null) ?? null;
  };

  // Idempotencia: si ya existe (mismo id o mismo recibo) Y ya tiene huella,
  // está verdaderamente sellada — no re-sellar ni duplicar. Si existe pero
  // verifactu_hash es NULL, es una reserva incompleta (crash entre el insert
  // atómico y el update final): se retoma más abajo con los datos YA
  // reservados, sin pedir número nuevo.
  let existente = await cargarExistente();
  if (existente && existente.verifactu_hash) {
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

  let numeroCompleto: string;
  let fechaEmision: string;
  let receptorNombre: string;
  let receptorNIF: string | null;
  let baseImponible: number;
  let tipoIVA: number;
  let cuotaIVA: number;
  let total: number;
  let huellaAnterior: string;
  let seq: number;

  if (existente) {
    // ⚠️ Auditoría 22ª pasada (3-sep-2026), D-2. Esta rama asume que la fila
    // viene de `reservar_numero_factura`. En prod hay 4 facturas ANTERIORES a
    // Veri*Factu (`fac-1`…`fac-4`) con `verifactu_seq` NULL: por aquí,
    // `Number(null)` da 0 y `?? ''` da huella anterior vacía — o sea, "soy el
    // primer registro de la cadena". Sellarlas escribiría una segunda cabecera
    // de cadena por delante del seq 1, y una cadena Veri*Factu bifurcada no se
    // arregla reescribiéndola. No es alcanzable desde el panel (siempre manda
    // un id nuevo), pero el endpoint acepta el `id` del cuerpo.
    if (existente.verifactu_seq == null || !existente.numero_completo) {
      return { ok: false, error: 'Esta factura es anterior a Veri*Factu y no tiene número reservado: sellarla rompería la cadena.' };
    }
    // Retoma la reserva incompleta: numeroCompleto/seq/prev_hash YA están en
    // la fila (los puso reservar_numero_factura); solo falta la huella/Fiskaly.
    numeroCompleto = existente.numero_completo;
    fechaEmision = existente.fecha_emision;
    receptorNombre = existente.receptor_nombre ?? 'Cliente';
    receptorNIF = existente.receptor_nif;
    baseImponible = Number(existente.base_imponible);
    tipoIVA = Number(existente.tipo_iva);
    cuotaIVA = Number(existente.cuota_iva);
    total = Number(existente.total);
    huellaAnterior = existente.verifactu_prev_hash ?? '';
    seq = Number(existente.verifactu_seq);
  } else {
    const { data: recibo } = await admin
      .from('recibos').select('importe, socio_id')
      .eq('id', reciboId).eq('studio_id', studioId).maybeSingle();
    if (!recibo) {
      return { ok: false, error: 'Recibo no encontrado' };
    }

    // El importe del recibo es IVA INCLUIDO; el tipo solo reparte total → base+cuota.
    const tipoIVAStudio = Number(studio?.iva_por_defecto ?? 21);
    const divisor = 1 + tipoIVAStudio / 100;
    const totalCalc = Math.round(Number(recibo.importe) * 100) / 100;
    const baseCalc = Math.round((totalCalc / divisor) * 100) / 100;
    const cuotaCalc = Math.round((totalCalc - baseCalc) * 100) / 100;

    let receptorNombreCalc = 'Cliente de mostrador';
    let receptorNIFCalc: string | null = null;
    if (recibo.socio_id) {
      const { data: socio } = await admin
        .from('socios').select('nombre, apellidos, nif').eq('id', recibo.socio_id).maybeSingle();
      if (socio) {
        receptorNombreCalc = `${socio.nombre ?? ''} ${socio.apellidos ?? ''}`.trim() || 'Cliente';
        receptorNIFCalc = (socio.nif as string | null) ?? null;
      }
    }

    // fecha_emision es un `date` (sin huso) — hay que anclarlo al día natural en
    // Europe/Madrid, no al de new Date().toISOString() (UTC). Una factura sellada
    // entre las 22:00 y las 00:59 (invierno) o 23:00-00:59 (verano) en Madrid caía
    // en el DÍA/AÑO ANTERIOR según UTC: se archivaba en el trimestre/año fiscal
    // equivocado, y el registro Veri*Factu ante la AEAT quedaba con esa misma
    // fecha errónea (no es solo un informe descuadrado, es el propio registro legal).
    const fechaEmisionCalc = fechaHoraHusoMadrid(new Date()).slice(0, 10);

    // Reserva atómica: numero_completo + verifactu_seq + verifactu_prev_hash +
    // el INSERT inicial, todo dentro de la RPC (advisory lock por estudio).
    const { data: reserva, error: errorReserva } = await admin
      .rpc('reservar_numero_factura', {
        p_factura_id: facturaId,
        p_studio_id: studioId,
        p_recibo_id: reciboId,
        p_fecha_emision: fechaEmisionCalc,
        p_receptor_nombre: receptorNombreCalc,
        p_receptor_nif: receptorNIFCalc,
        p_base_imponible: baseCalc,
        p_tipo_iva: tipoIVAStudio,
        p_cuota_iva: cuotaCalc,
        p_total: totalCalc,
      })
      .single<{ numero_completo: string; verifactu_seq: number; verifactu_prev_hash: string }>();

    if (errorReserva) {
      // Reintento del mismo recibo/factura llegando justo cuando otra llamada
      // ya está reservando (mismo id → choca con la PK dentro de la RPC): no
      // es un fallo real, es la MISMA factura — se retoma como existente.
      if (errorReserva.code === '23505') {
        existente = await cargarExistente();
      }
      if (!existente) {
        console.error('[sellarFacturaDeRecibo] reservar_numero_factura:', errorReserva.message);
        return { ok: false, error: 'No se ha podido reservar el número de factura.' };
      }
      if (existente.verifactu_hash) {
        return { ok: true, yaExistia: true, factura: mapSalida(existente) };
      }
      numeroCompleto = existente.numero_completo;
      fechaEmision = existente.fecha_emision;
      receptorNombre = existente.receptor_nombre ?? 'Cliente';
      receptorNIF = existente.receptor_nif;
      baseImponible = Number(existente.base_imponible);
      tipoIVA = Number(existente.tipo_iva);
      cuotaIVA = Number(existente.cuota_iva);
      total = Number(existente.total);
      huellaAnterior = existente.verifactu_prev_hash ?? '';
      seq = Number(existente.verifactu_seq);
    } else {
      numeroCompleto = reserva.numero_completo;
      seq = Number(reserva.verifactu_seq);
      huellaAnterior = reserva.verifactu_prev_hash ?? '';
      fechaEmision = fechaEmisionCalc;
      receptorNombre = receptorNombreCalc;
      receptorNIF = receptorNIFCalc;
      baseImponible = baseCalc;
      tipoIVA = tipoIVAStudio;
      cuotaIVA = cuotaCalc;
      total = totalCalc;
    }
  }

  // A partir de aquí numeroCompleto/seq/huellaAnterior ya están reservados
  // (atómicamente, por la RPC, o recuperados de una reserva previa
  // incompleta) — el resto es cálculo puro + firma opcional, sin condición de
  // carrera posible sobre la NUMERACIÓN.
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

  const camposFinales: Record<string, unknown> = {
    verifactu_hash: huella,
    verifactu_prev_hash: huellaAnterior,
    verifactu_ts: ts,
    verifactu_seq: seq,
  };
  let salida: Record<string, unknown> = {
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
      camposFinales.fiskaly_invoice_id = res.id;
      camposFinales.verifactu_qr_url = res.qrUrl;
      camposFinales.verifactu_qr_imagen = res.qrImagen;
      camposFinales.verifactu_estado = res.transmision;
      camposFinales.verifactu_csv = res.csv;
      salida = { ...salida, fiskaly: { estado: res.estado, transmision: res.transmision, csv: res.csv, qrUrl: res.qrUrl } };
    } catch (e) {
      console.error('[sellarFacturaDeRecibo] Fiskaly:', e instanceof Error ? e.message : e);
      // Se sigue con la huella propia; queda registro en logs para revisar.
    }
  }

  // UPDATE por id (PK, sin condición de carrera posible ahí) — acotado además
  // a verifactu_hash IS NULL: si otra llamada concurrente para esta MISMA
  // factura ya completó el sellado mientras se calculaba la huella aquí
  // (dos reintentos casi simultáneos del webhook, p. ej.), no se pisa su
  // resultado ya persistido — se devuelve el suyo.
  const { data: actualizada, error: errorUpdate } = await admin
    .from('facturas')
    .update(camposFinales)
    .eq('id', facturaId)
    .eq('studio_id', studioId)
    .is('verifactu_hash', null)
    .select(COLS_SELLO)
    .maybeSingle();

  if (errorUpdate) {
    console.error('[sellarFacturaDeRecibo]', errorUpdate.message);
    return { ok: false, error: 'No se ha podido guardar la factura sellada.' };
  }

  if (!actualizada) {
    const final = await cargarExistente();
    if (final?.verifactu_hash) {
      return { ok: true, yaExistia: true, factura: mapSalida(final) };
    }
    console.error('[sellarFacturaDeRecibo] el UPDATE no afectó ninguna fila y no se encontró un sellado final para', facturaId);
    return { ok: false, error: 'No se ha podido confirmar el sellado de la factura.' };
  }

  return {
    ok: true,
    sellada: true,
    aviso: null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Facturas rectificativas (issue #769, Fase A) — DISPARO MANUAL.
//
// Una rectificativa se registra ante la AEAT como un registro de ALTA con
// TipoFactura=R1-R5 (docs/VERIFACTU-INVESTIGACION-TECNICA.md §8), NO como una
// anulación — por eso reutiliza calcularHuellaAlta, igual que
// sellarFacturaDeRecibo, y no calcularHuellaAnulacion (esa es para "esta
// factura nunca debió existir", un caso distinto).
//
// ⚠️ Lo que el llamador DEBE decidir, no esta función: qué tipo R1-R5 y qué
// método (S sustitución / I por diferencia) aplica, y los importes exactos
// de la rectificativa (base/cuota/total — con el signo o la sustitución que
// corresponda). No hay una fórmula fiscal fiable para derivarlo en código
// sin criterio humano/gestoría de por medio — se recibe todo ya calculado.
//
// ⚠️ Fiskaly: DELIBERADAMENTE no se llama en esta Fase A. Su payload exacto
// para rectificativas (¿`type: 'CORRECTIVE'`? ¿SIMPLIFIED/COMPLETE normal con
// TipoFactura=R1 en el content?) no está verificado contra su documentación
// autenticada ni contra su sandbox real — mandar algo adivinado sería firmar
// (mal) ante la AEAT. La huella propia SÍ se calcula y persiste siempre (es
// la parte verificada y con tests, lib/verifactu.ts): la rectificativa queda
// registrada y encadenada en Tentare desde el primer día; falta solo activar
// la transmisión externa una vez validado el payload de Fiskaly.
export interface ParamsRectificativa {
  studioId: string;
  facturaOriginalId: string;
  facturaRectificativaId: string; // id nuevo, lo genera el llamador (randomUUID)
  tipoFactura: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  tipoRectificativa: 'S' | 'I';
  baseImponible: number;
  cuotaIVA: number;
  total: number;
  importeRectificacion: number;
}

interface FilaRectificativaReservada extends FilaFacturaReservada {
  rectifica_a: string | null;
  tipo_rectificativa: string | null;
}

const COLS_RECTIFICATIVA = `${COLS_SELLO}, rectifica_a, tipo_rectificativa`;

export async function sellarRectificativaDeFactura(
  admin: SupabaseClient,
  params: ParamsRectificativa,
): Promise<ResultadoSellado> {
  const { studioId, facturaOriginalId, facturaRectificativaId, tipoFactura, tipoRectificativa, baseImponible, cuotaIVA, total, importeRectificacion } = params;

  const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;
  if (!ID_VALIDO.test(facturaOriginalId) || !ID_VALIDO.test(facturaRectificativaId)) {
    return { ok: false, error: 'Identificadores inválidos' };
  }

  // Idempotencia: si esta rectificativa (mismo id) ya está sellada, no se
  // repite. Igual criterio que sellarFacturaDeRecibo.
  const { data: existenteRaw } = await admin
    .from('facturas').select(COLS_RECTIFICATIVA)
    .eq('id', facturaRectificativaId).eq('studio_id', studioId)
    .limit(1).maybeSingle();
  const existente = existenteRaw as FilaRectificativaReservada | null;
  if (existente?.verifactu_hash) {
    return { ok: true, yaExistia: true, factura: mapSalida(existente) };
  }

  const { data: original } = await admin
    .from('facturas').select('id, verifactu_hash, receptor_nombre, receptor_nif, fecha_emision')
    .eq('id', facturaOriginalId).eq('studio_id', studioId).maybeSingle();
  if (!original) {
    return { ok: false, error: 'Factura original no encontrada' };
  }
  if (!original.verifactu_hash) {
    return { ok: false, error: 'La factura original no está sellada — no se puede rectificar algo que nunca se emitió de verdad.' };
  }

  // Ya existe una rectificativa DISTINTA para esta original: no bloquea (una
  // devolución parcial seguida de otra podría necesitar dos), pero se avisa.
  const { count: rectificativasPrevias } = await admin
    .from('facturas').select('id', { count: 'exact', head: true })
    .eq('rectifica_a', facturaOriginalId).eq('studio_id', studioId)
    .not('verifactu_hash', 'is', null);

  const { data: studio } = await admin
    .from('studios')
    .select('nif, iva_por_defecto, razon_social, nombre, direccion, ciudad, codigo_postal, email, fiskaly_signer_id, fiskaly_client_id')
    .eq('id', studioId)
    .maybeSingle();
  const nifEmisor = studio?.nif?.trim() || '';
  if (!nifEmisorValido(nifEmisor)) {
    return { ok: false, error: 'Configura un NIF fiscal válido en Configuración → Mi estudio antes de emitir facturas.' };
  }

  let numeroCompleto: string;
  let fechaEmision: string;
  let huellaAnterior: string;
  let seq: number;

  if (existente) {
    // Reserva incompleta retomada (crash entre reservar_numero_factura y el
    // UPDATE final con la huella) — mismos datos ya reservados, sin pedir
    // número nuevo.
    numeroCompleto = existente.numero_completo;
    fechaEmision = existente.fecha_emision;
    huellaAnterior = existente.verifactu_prev_hash ?? '';
    seq = Number(existente.verifactu_seq);
  } else {
    const fechaEmisionCalc = fechaHoraHusoMadrid(new Date()).slice(0, 10);
    const { data: reserva, error: errorReserva } = await admin
      .rpc('reservar_numero_factura', {
        p_factura_id: facturaRectificativaId,
        p_studio_id: studioId,
        p_recibo_id: null,
        p_fecha_emision: fechaEmisionCalc,
        p_receptor_nombre: original.receptor_nombre,
        p_receptor_nif: original.receptor_nif,
        p_base_imponible: baseImponible,
        p_tipo_iva: Number(studio?.iva_por_defecto ?? 21),
        p_cuota_iva: cuotaIVA,
        p_total: total,
        p_serie: 'R',
        p_tipo: tipoFactura,
        p_rectifica_a: facturaOriginalId,
        p_tipo_rectificativa: tipoRectificativa,
        p_importe_rectificacion: importeRectificacion,
      })
      .single<{ numero_completo: string; verifactu_seq: number; verifactu_prev_hash: string }>();

    if (errorReserva) {
      console.error('[sellarRectificativaDeFactura] reservar_numero_factura:', errorReserva.message);
      return { ok: false, error: 'No se ha podido reservar el número de la rectificativa.' };
    }
    numeroCompleto = reserva.numero_completo;
    seq = Number(reserva.verifactu_seq);
    huellaAnterior = reserva.verifactu_prev_hash ?? '';
    fechaEmision = fechaEmisionCalc;
  }

  const ts = fechaHoraHusoMadrid(new Date());
  const registro: RegistroAltaVerifactu = {
    idEmisorFactura: nifEmisor,
    numSerieFactura: numeroCompleto,
    fechaExpedicionFactura: fechaExpedicionDesdeISO(fechaEmision),
    tipoFactura,
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

  // Fiskaly NO se llama aquí a propósito — ver el aviso de cabecera. El
  // fiskalyConfigurado() de sellarFacturaDeRecibo NO se reutiliza sin más:
  // haría falta el payload correcto, que todavía no está verificado.
  const camposFinales = {
    verifactu_hash: huella,
    verifactu_prev_hash: huellaAnterior,
    verifactu_ts: ts,
    verifactu_seq: seq,
  };

  const { data: actualizada, error: errorUpdate } = await admin
    .from('facturas')
    .update(camposFinales)
    .eq('id', facturaRectificativaId)
    .eq('studio_id', studioId)
    .is('verifactu_hash', null)
    .select(COLS_RECTIFICATIVA)
    .maybeSingle();

  if (errorUpdate) {
    console.error('[sellarRectificativaDeFactura]', errorUpdate.message);
    return { ok: false, error: 'No se ha podido guardar la rectificativa sellada.' };
  }
  if (!actualizada) {
    const { data: final } = await admin
      .from('facturas').select(COLS_RECTIFICATIVA)
      .eq('id', facturaRectificativaId).eq('studio_id', studioId).maybeSingle();
    if ((final as FilaRectificativaReservada | null)?.verifactu_hash) {
      return { ok: true, yaExistia: true, factura: mapSalida(final as FilaRectificativaReservada) };
    }
    return { ok: false, error: 'No se ha podido confirmar el sellado de la rectificativa.' };
  }

  return {
    ok: true,
    sellada: true,
    aviso: 'Rectificativa sellada con huella propia. Transmisión a Fiskaly/AEAT NO enviada todavía — su payload para rectificativas no está verificado contra el sandbox real. Contacta con soporte de Fiskaly antes de activar el envío.'
      + ((rectificativasPrevias ?? 0) > 0 ? ` Aviso: esta factura ya tenía ${rectificativasPrevias} rectificativa(s) previa(s).` : ''),
    factura: {
      verifactuHash: huella, verifactuPrevHash: huellaAnterior, verifactuTs: ts, verifactuSeq: seq,
      qrUrl, entorno: produccion ? 'produccion' : 'pruebas',
      numeroCompleto, fechaEmision, tipoFactura, tipoRectificativa, rectificaA: facturaOriginalId,
    },
  };
}
