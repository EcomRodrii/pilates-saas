// Veri*Factu — el trabajo de mandar a la AEAT lo que está en cola.
//
// SOLO SERVIDOR (service-role). Lo dispara un cron, nunca una petición de
// usuario: la AEAT impone control de flujo entre envíos y eso no cabe dentro de
// un cobro.
//
// Lo que decide QUÉ se manda y qué significa la respuesta vive aparte, en
// pendientes.ts, que es lógica pura con tests. Aquí solo está lo que toca la
// base de datos y la red.

import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { certificadoDeEntorno, destinoDeEntorno, sistemaInformatico, transmisionConfigurada, queFaltaParaTransmitir } from './config.ts';
import { enviarSobreAeat } from './envio.ts';
import { sobreSoapRegFactu, xmlRegistroAlta, type RegistroAltaXml } from './xml.ts';
import { casarRespuestas, hayHuecoAntesDe, loteAEnviar, yaNoSeReenvia, type FacturaPendiente } from './pendientes.ts';

export interface ResumenTransmision {
  estudios: number;
  enviadas: number;
  registradas: number;
  rechazadas: number;
  pendientes: number;
  saltados: string[];
  motivo?: string;
}

interface FilaFactura {
  id: string;
  studio_id: string;
  numero_completo: string;
  fecha_emision: string;
  verifactu_seq: number;
  verifactu_hash: string;
  verifactu_prev_hash: string | null;
  verifactu_ts: string;
  receptor_nombre: string | null;
  receptor_nif: string | null;
  base_imponible: string | number;
  tipo_iva: string | number;
  cuota_iva: string | number;
  total: string | number;
  tipo: string | null;
  tipo_rectificativa: string | null;
}

const num = (v: string | number | null): number => (v === null ? 0 : typeof v === 'number' ? v : Number(v));

/** 'yyyy-mm-dd' → 'dd-mm-yyyy', que es como lo quiere el registro. */
function fechaAeat(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
}

export async function transmitirPendientes(): Promise<ResumenTransmision> {
  const vacio: ResumenTransmision = { estudios: 0, enviadas: 0, registradas: 0, rechazadas: 0, pendientes: 0, saltados: [] };

  if (!transmisionConfigurada()) {
    // No es un error: es el estado normal hasta que haya certificado. Las
    // facturas siguen numeradas, encadenadas y con su QR; solo esperan.
    return { ...vacio, motivo: `Sin configurar: falta ${queFaltaParaTransmitir().join(' y ')}` };
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { ...vacio, motivo: 'Service role no configurada' };

  const certificado = certificadoDeEntorno();
  if (!certificado) return { ...vacio, motivo: 'Sin certificado' };
  const destino = destinoDeEntorno();
  const sistema = sistemaInformatico();

  // Solo lo que está en cola. `verifactu_estado` nulo = nunca se intentó.
  const { data: filas, error } = await admin
    .from('facturas')
    .select('id, studio_id, numero_completo, fecha_emision, verifactu_seq, verifactu_hash, verifactu_prev_hash, verifactu_ts, receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total, tipo, tipo_rectificativa')
    .in('verifactu_estado', ['PENDIENTE'])
    .not('verifactu_hash', 'is', null)
    .order('verifactu_seq', { ascending: true })
    .limit(1000);

  if (error) {
    Sentry.captureException(error, { tags: { area: 'verifactu', paso: 'leer-pendientes' } });
    return { ...vacio, motivo: 'No se pudieron leer las facturas pendientes' };
  }
  if (!filas || filas.length === 0) return vacio;

  // Un envío es de UN obligado tributario: la cabecera lleva su NIF. Así que se
  // agrupa por estudio y se manda un sobre por cada uno.
  const porEstudio = new Map<string, FilaFactura[]>();
  for (const f of filas as FilaFactura[]) {
    const lista = porEstudio.get(f.studio_id) ?? [];
    lista.push(f);
    porEstudio.set(f.studio_id, lista);
  }

  const resumen: ResumenTransmision = { ...vacio, estudios: porEstudio.size, saltados: [] };

  for (const [studioId, suyas] of porEstudio) {
    const { data: studio } = await admin
      .from('studios').select('nif, razon_social, nombre').eq('id', studioId).maybeSingle();
    const nif = (studio?.nif as string | null) ?? '';
    if (!nif) {
      resumen.saltados.push(`${studioId}: sin NIF`);
      continue;
    }

    const pendientes: FacturaPendiente[] = suyas.map(f => ({
      id: f.id, studioId: f.studio_id, numeroCompleto: f.numero_completo,
      fechaExpedicion: fechaAeat(f.fecha_emision), verifactuSeq: Number(f.verifactu_seq),
      huella: f.verifactu_hash, huellaAnterior: f.verifactu_prev_hash ?? '',
    }));
    const lote = loteAEnviar(pendientes);

    // ¿Falta por enviar alguna anterior? Si la 7 nunca salió, mandar la 8 deja
    // a la AEAT con una cadena que no puede seguir.
    const { data: ultima } = await admin
      .from('facturas')
      .select('verifactu_seq')
      .eq('studio_id', studioId)
      .in('verifactu_estado', ['REGISTRADA', 'ACEPTADA_CON_ERRORES'])
      .order('verifactu_seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ultimaSeq = ultima?.verifactu_seq == null ? null : Number(ultima.verifactu_seq);

    if (hayHuecoAntesDe(lote, ultimaSeq)) {
      resumen.saltados.push(`${studioId}: hueco en la cadena antes de la ${lote[0].verifactuSeq}`);
      continue;
    }

    // El `RegistroAnterior` exige número y fecha de la factura previa, no solo
    // su huella: sin ellos el registro es inválido. Se traen de una vez, por
    // secuencia, en lugar de una consulta por factura.
    const seqsAnteriores = lote.map(p => p.verifactuSeq - 1).filter(n => n > 0);
    const anteriorPorSeq = new Map<number, { numero: string; fecha: string }>();
    if (seqsAnteriores.length > 0) {
      const { data: previas } = await admin
        .from('facturas')
        .select('numero_completo, fecha_emision, verifactu_seq')
        .eq('studio_id', studioId)
        .in('verifactu_seq', seqsAnteriores);
      for (const pv of previas ?? []) {
        anteriorPorSeq.set(Number(pv.verifactu_seq), {
          numero: pv.numero_completo as string,
          fecha: fechaAeat(pv.fecha_emision as string),
        });
      }
    }

    const porId = new Map(suyas.map(f => [f.id, f]));
    // Una factura encadenada cuya anterior no aparece no se manda: iría con un
    // `RegistroAnterior` a medias y la AEAT la rechazaría entera.
    const enviables = lote.filter(p => {
      if (!p.huellaAnterior) return true;
      if (anteriorPorSeq.has(p.verifactuSeq - 1)) return true;
      resumen.saltados.push(`${studioId}: falta la factura anterior a la ${p.verifactuSeq}`);
      resumen.pendientes += 1;
      return false;
    });
    if (enviables.length === 0) continue;

    const registros = enviables.map(p => {
      const f = porId.get(p.id)!;
      const anterior = p.huellaAnterior ? anteriorPorSeq.get(p.verifactuSeq - 1) : undefined;
      const base = num(f.base_imponible);
      const cuota = num(f.cuota_iva);
      const reg: RegistroAltaXml = {
        emisor: { nombreRazon: (studio?.razon_social as string | null) || (studio?.nombre as string | null) || 'Estudio', nif },
        numSerieFactura: f.numero_completo,
        fechaExpedicionFactura: fechaAeat(f.fecha_emision),
        tipoFactura: f.tipo || (f.receptor_nif ? 'F1' : 'F2'),
        ...(f.tipo_rectificativa ? { tipoRectificativa: f.tipo_rectificativa } : {}),
        descripcionOperacion: 'Servicios de actividad física',
        desglose: [{
          calificacionOperacion: 'S1',
          tipoImpositivo: num(f.tipo_iva),
          baseImponible: base,
          cuotaRepercutida: cuota,
        }],
        cuotaTotal: cuota,
        importeTotal: num(f.total),
        // La primera de la cadena no tiene anterior. El resto encadena con la
        // huella que YA se guardó — nunca se recalcula.
        encadenamiento: anterior
          ? {
              idEmisorFactura: nif,
              numSerieFactura: anterior.numero,
              fechaExpedicionFactura: anterior.fecha,
              huella: p.huellaAnterior,
            }
          : null,
        sistemaInformatico: sistema,
        fechaHoraHusoGenRegistro: f.verifactu_ts,
        huella: f.verifactu_hash,
      };
      return xmlRegistroAlta(reg);
    });

    const sobre = sobreSoapRegFactu({
      obligado: { nombreRazon: (studio?.razon_social as string | null) || (studio?.nombre as string | null) || 'Estudio', nif },
      registros,
    });

    const res = await enviarSobreAeat(sobre, certificado, destino);
    resumen.enviadas += enviables.length;

    if (!res.respuesta || res.respuesta.fault) {
      // Rechazo de cabecera o fallo de transporte: NINGUNA se marca. Se quedan
      // en cola exactamente como estaban, con su misma huella.
      Sentry.captureMessage('Veri*Factu: envío rechazado', {
        level: 'error',
        tags: { area: 'verifactu', studio: studioId },
        extra: { error: res.error, status: res.status },
      });
      resumen.saltados.push(`${studioId}: ${res.error ?? 'envío rechazado'}`);
      resumen.pendientes += enviables.length;
      continue;
    }

    const csv = res.respuesta.csv;
    const casadas = casarRespuestas(enviables, res.respuesta.registros);

    for (const { factura, estado, error: errorRegistro } of casadas) {
      if (estado === 'PENDIENTE') { resumen.pendientes += 1; continue; }
      // El CSV solo se guarda en las que la AEAT admitió: es el acuse de ESA
      // remisión, y no se puede recuperar más tarde.
      const campos: Record<string, unknown> = { verifactu_estado: estado };
      if (yaNoSeReenvia(estado) && csv) campos.verifactu_csv = csv;
      await admin.from('facturas').update(campos).eq('id', factura.id);

      if (yaNoSeReenvia(estado)) resumen.registradas += 1;
      else {
        resumen.rechazadas += 1;
        Sentry.captureMessage('Veri*Factu: registro rechazado por la AEAT', {
          level: 'warning',
          tags: { area: 'verifactu', studio: studioId },
          extra: { factura: factura.numeroCompleto, error: errorRegistro },
        });
      }
    }
  }

  return resumen;
}
