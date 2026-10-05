import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetodoPago } from '@/lib/types';
import { contextoCobroDe, proveedorPara, type PeticionCobro, type ResultadoInicio } from './terminal.ts';
import { desenlaceDeCobroSoltado, type ConsultaCobro } from './consulta-stripe.ts';
import { vidaDelCobroDeLaCaja, type VidaCobroCaja } from './referencia-cobro-recibo.ts';
import { clienteSumup, proveedorDeReferencia, sumupPuedeCobrarAqui, type ClienteSumup } from './sumup.ts';
import { urlDeAviso } from './sumup-aviso.ts';
import { crearProveedorSumup, yaNoEsDelMostrador } from './terminal-sumup.ts';
import { tokenSumup } from './sumup-oauth.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Quién cobra en la Caja: el único sitio que lo decide.
//
//  · Para EMPEZAR un cobro con datáfono manda el datáfono que tiene hoy la sede:
//    el de SumUp si hay un Solo emparejado (`studios.sumup_reader_id`), si no el de
//    Stripe. Un datáfono por sede (CHECK `studios_un_solo_datafono`).
//  · Para un cobro YA EMPEZADO manda su REFERENCIA, nunca la configuración actual:
//    si la sede cambia de datáfono con un cobro en vuelo, el cobro viejo se sigue
//    preguntando a quien lo empezó (`proveedorDeReferencia`, lib/pos/sumup.ts).
//
// Las rutas reciben un `CobroListo` con el contexto ya cerrado dentro: no saben de
// cuentas Connect ni de tokens. Bizum y el resto siguen siendo Stripe, como antes.
// ─────────────────────────────────────────────────────────────────────────────

export interface CobroListo {
  proveedor: 'stripe' | 'sumup';
  esAutoritativo: boolean;
  iniciar(p: PeticionCobro): Promise<ResultadoInicio>;
  consultar(referencia: string): Promise<ConsultaCobro>;
  cancelar(referencia: string, checkoutSessionId?: string | null): Promise<void>;
}

export type CobroPreparado = { ok: true; cobro: CobroListo } | { ok: false; motivo: string; status: number };

async function cobroStripe(admin: SupabaseClient, studioId: string, metodo: MetodoPago, origen: string): Promise<CobroPreparado> {
  const cx = await contextoCobroDe(admin, studioId);
  if (!cx.ok) return { ok: false, motivo: cx.motivo, status: cx.status };
  const prov = proveedorPara(metodo, { readerId: cx.readerId, origen });
  return {
    ok: true,
    cobro: {
      proveedor: 'stripe',
      esAutoritativo: prov.esAutoritativo,
      iniciar: p => prov.iniciar(cx.ctx, p),
      consultar: ref => prov.consultar(cx.ctx, ref),
      cancelar: (ref, cs) => prov.cancelar(cx.ctx, ref, cs),
    },
  };
}

function configSumup(env: NodeJS.ProcessEnv = process.env) {
  return {
    appId: env.SUMUP_AFFILIATE_APP_ID ?? '',
    key: env.SUMUP_AFFILIATE_KEY ?? '',
    secretoAviso: env.SUMUP_WEBHOOK_SECRET ?? '',
    base: (env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001').replace(/\/$/, ''),
  };
}

async function cobroSumup(admin: SupabaseClient, studioId: string, o: { exigirLector: boolean }): Promise<CobroPreparado> {
  const cfg = configSumup();
  if (!cfg.appId || !cfg.key || !cfg.secretoAviso) {
    return { ok: false, status: 503, motivo: 'El datáfono de SumUp todavía no está disponible en Tentare.' };
  }
  if (!sumupPuedeCobrarAqui()) {
    return { ok: false, status: 503, motivo: 'Fuera de producción los cobros con SumUp están desactivados.' };
  }
  const { data: studio, error } = await admin.from('studios').select('sumup_reader_id').eq('id', studioId).maybeSingle();
  if (error) return { ok: false, status: 503, motivo: 'No hemos podido leer el datáfono del estudio. Inténtalo otra vez.' };
  const readerId = (studio?.sumup_reader_id as string | null) ?? null;
  if (o.exigirLector && !readerId) {
    return { ok: false, status: 409, motivo: 'No hay ningún datáfono conectado. En la Caja, pulsa Cobrar y luego «Conectar datáfono».' };
  }
  const t = await tokenSumup(studioId);
  if (!t.ok) {
    return t.motivo === 'no-disponible'
      ? { ok: false, status: 503, motivo: 'SumUp no responde ahora mismo. Inténtalo en un momento.' }
      : { ok: false, status: 409, motivo: 'La cuenta de SumUp del estudio no está conectada o hay que volver a conectarla (Configuración > Cobros y facturas).' };
  }
  const prov = crearProveedorSumup({
    cliente: clienteSumup({ token: t.token }),
    merchantCode: t.merchantCode,
    readerId: readerId ?? '',
    studioId,
    afiliado: { appId: cfg.appId, key: cfg.key },
    urlDeAviso: ref => urlDeAviso(cfg.base, cfg.secretoAviso, studioId,
      ref.ventaId ? { tipo: 'venta', id: ref.ventaId } : { tipo: 'recibo', id: ref.reciboId as string }),
  });
  return {
    ok: true,
    cobro: {
      proveedor: 'sumup',
      esAutoritativo: true,
      iniciar: p => prov.iniciar({ importeCentimos: p.importeCentimos, concepto: p.concepto, ref: p.ref }),
      consultar: ref => prov.consultar(ref),
      // Sin lector guardado (se desconectó con el cobro en vuelo) no hay a quién decir que pare.
      cancelar: async ref => { if (readerId) await prov.cancelar(ref); },
    },
  };
}

/**
 * La cuenta de SumUp del estudio para LEER (el historial del barrido). No exige
 * lector ni las claves de cobro: leer no cobra nada.
 */
export async function cuentaSumupDelEstudio(studioId: string):
  Promise<{ ok: true; cliente: ClienteSumup; merchantCode: string } | { ok: false }> {
  const t = await tokenSumup(studioId);
  if (!t.ok) return { ok: false };
  return { ok: true, cliente: clienteSumup({ token: t.token }), merchantCode: t.merchantCode };
}

/** Para EMPEZAR un cobro: el datáfono que tiene hoy la sede. */
export async function prepararCobroNuevo(
  admin: SupabaseClient, studioId: string, metodo: MetodoPago, o: { origen: string },
): Promise<CobroPreparado> {
  if (metodo === 'DATAFONO') {
    const { data, error } = await admin.from('studios').select('sumup_reader_id').eq('id', studioId).maybeSingle();
    if (error) return { ok: false, status: 503, motivo: 'No hemos podido leer el datáfono del estudio. Inténtalo otra vez.' };
    if (data?.sumup_reader_id) return cobroSumup(admin, studioId, { exigirLector: true });
  }
  return cobroStripe(admin, studioId, metodo, o.origen);
}

/** Para un cobro YA EMPEZADO: quien lo empezó, según su referencia. */
export async function prepararCobroExistente(
  admin: SupabaseClient, studioId: string, referencia: string, metodo: MetodoPago, o: { origen: string },
): Promise<CobroPreparado> {
  if (proveedorDeReferencia(referencia) === 'sumup') return cobroSumup(admin, studioId, { exigirLector: false });
  return cobroStripe(admin, studioId, metodo, o.origen);
}

/**
 * Un cobro de Stripe de un recibo, SOLO LEYENDO (`desenlaceDeCobroSoltado`): la
 * referencia que manda la Caja, o el cobro que un recibo aún tiene guardado al
 * empezar otro. `null` si no es de Stripe (SumUp) o no es de este recibo; sin
 * poder leer, `{ comprobado: false }`.
 */
export async function cobroDeReciboSoloLectura(
  admin: SupabaseClient, studioId: string, reciboId: string, referencia: string,
): ReturnType<typeof desenlaceDeCobroSoltado> {
  if (proveedorDeReferencia(referencia) !== 'stripe') return null;
  const cx = await contextoCobroDe(admin, studioId);
  if (!cx.ok) return { comprobado: false };
  return desenlaceDeCobroSoltado(cx.ctx.stripe, referencia, cx.ctx.stripeAccount, { reciboId, studioId });
}

/**
 * ¿Sigue vivo el cobro de la Caja guardado en un recibo? (`vidaDelCobroDeLaCaja`).
 * SOLO LEE: lo preguntan el enlace de pago de la socia y el cobro con la tarjeta
 * guardada, que nunca paran el cobro del mostrador (lo lleva la Caja). Un cobro de
 * SumUp se le pregunta a SumUp.
 */
export async function vidaDelCobroDeLaCajaEnElRecibo(
  admin: SupabaseClient, studioId: string, reciboId: string, referencia: string, o: { origen: string },
): Promise<VidaCobroCaja> {
  if (proveedorDeReferencia(referencia) === 'sumup') {
    const prep = await prepararCobroExistente(admin, studioId, referencia, 'DATAFONO', o);
    if (!prep.ok) return vidaDelCobroDeLaCaja('SIN_LEER');
    const est = await prep.cobro.consultar(referencia).catch(() => null);
    if (!est) return vidaDelCobroDeLaCaja('SIN_LEER');
    // «Caducado» no lo dice SumUp: es que su API aún no devuelve la transacción, y puede
    // ser un retraso. Hasta que lo soltaría el barrido, no se sabe (si no, un cargo a la
    // tarjeta guardada o un pago online se sumarían a un cobro del Solo que sí entró).
    if (est.estado === 'EXPIRADO' && !yaNoEsDelMostrador(referencia, new Date())) return 'no-se-sabe';
    return vidaDelCobroDeLaCaja(est.estado);
  }
  const leido = await cobroDeReciboSoloLectura(admin, studioId, reciboId, referencia);
  return vidaDelCobroDeLaCaja(!leido ? null : leido.comprobado ? leido.estado : 'SIN_LEER');
}

/**
 * Suelta el cobro de la Caja guardado en un recibo SOLO si está muerto
 * (`vidaDelCobroDeLaCajaEnElRecibo`): cancelado, rechazado, un Bizum caducado que
 * nadie soltó, o que ya no existe en la cuenta. Uno así no es un cobro en marcha y
 * no puede dejar el recibo sin cobrarse para siempre (el cobro con la tarjeta
 * guardada lo exige vacío). Compare-and-set sobre esa misma referencia: uno nuevo
 * que se haya empezado entre medias no se toca. Devuelve si lo soltó.
 */
export async function soltarCobroDeLaCajaSiEstaMuerto(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; referencia: string },
): Promise<boolean> {
  const vida = await vidaDelCobroDeLaCajaEnElRecibo(admin, p.studioId, p.reciboId, p.referencia, { origen: '' });
  if (vida !== 'muerto') return false;
  const { data, error } = await admin.from('recibos')
    .update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('cobro_mostrador_pi', p.referencia)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}
