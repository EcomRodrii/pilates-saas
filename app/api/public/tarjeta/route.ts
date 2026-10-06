import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import {
  confirmacionTarjetaGuardada, idDeSesionCheckoutValido, idDeTarjetaValido, parametrosSesionGuardarTarjeta, puedeQuitarseDesdeLaApp,
  tarjetaEsSuya, tarjetasVisibles, type PaymentMethodMin,
} from '@/lib/billing/tarjetas-guardadas';
import { comprobarModoStripe, comprobarParDeClaves } from '@/lib/billing/modo-stripe';
import { expiraSesionIncrustada, respuestaIncrustada } from '@/lib/billing/sesion-checkout';

const claveStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  return key && !key.startsWith('sk_test_XXXX') ? key : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// P16 (6-oct-2026): las tarjetas que la alumna aceptó GUARDAR al pagar en la app
// («Guárdala para la próxima»): las de su Customer en la cuenta del estudio con
// `allow_redisplay: 'always'`, más la de los cobros automáticos (`paraCobros`).
// Solo lectura. Si el Customer ya no existe en esa cuenta (el estudio reconectó
// Stripe), lista vacía.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // «Cambiar / Añadir tarjeta»: ¿está ya en la ficha la tarjeta de esta sesión? (lo pregunta la hoja tras el Checkout)
  if (req.nextUrl.searchParams.has('sesion')) return confirmarTarjetaGuardada(req);
  const limited = await enforceRateLimit(req, 'public-tarjeta-listar', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const admin = getSupabaseAdmin();
  const key = claveStripe();
  if (!admin || !key) return NextResponse.json({ tarjetas: [] }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const [{ data: socio }, { data: studio }] = await Promise.all([
      admin.from('socios').select('stripe_customer_id, stripe_payment_method_id').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
      admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle(),
    ]);
    const customer = (socio?.stripe_customer_id as string | null) ?? null;
    const stripeAccount = (studio?.stripe_account_id as string | null) ?? null;
    if (!customer || !stripeAccount) return NextResponse.json({ tarjetas: [] }, { headers: { 'Cache-Control': 'no-store' } });
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    let pms: PaymentMethodMin[] = [];
    try {
      const lista = await stripe.paymentMethods.list({ customer, type: 'card', limit: 20 }, { stripeAccount });
      pms = lista.data as unknown as PaymentMethodMin[];
    } catch (e) {
      if ((e as { code?: string })?.code !== 'resource_missing') throw e;
    }
    return NextResponse.json(
      { tarjetas: tarjetasVisibles(pms, (socio?.stripe_payment_method_id as string | null) ?? null) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorInterno('public/tarjeta:GET', err, 'No hemos podido cargar tus tarjetas.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// «Cambiar tarjeta» / «Añadir tarjeta» desde la app de la alumna (6-oct-2026).
//
// Abre un Checkout de Stripe INCRUSTADO en `mode: 'setup'` (no se cobra nada) y
// devuelve lo que la hoja monta (`clientSecret`). Incrustado y no la página de
// Stripe porque la app de iOS carga esta web y una página de fuera se abriría en
// Safari: el botón se quedaba cargando y la vuelta acababa fuera de la app. Es la
// misma pieza con la que la app ya paga un recibo (`HojaPagarRecibo`).
//
// ⚠️ Quién y dónde lo decide el SERVIDOR: la alumna sale de SU JWT
// (`socioAutenticado`), y la cuenta de Stripe del estudio y su Customer, de la base
// de datos. El body solo dice en cuál de SUS estudios está (una cuenta puede ser
// alumna de varios), y eso se comprueba contra su sesión. Connect con cargo
// directo: la tarjeta queda en la cuenta del estudio, en el Customer de su ficha,
// que es donde la buscan los cobros off-session.
//
// La escribe en la ficha el webhook (`purpose: 'tarjeta'`, la rama del enlace del
// panel), y la pantalla solo dice «Tarjeta guardada» cuando el GET con `sesion`
// lee en la ficha la tarjeta de ESTA sesión. Nada optimista.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-tarjeta-guardar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { studioId?: unknown } | null;
  const studioId = typeof body?.studioId === 'string' && body.studioId ? body.studioId : null;
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const NO_DISPONIBLE = 'Ahora mismo no se pueden guardar tarjetas. Inténtalo más tarde.';
  const key = claveStripe();
  if (!key) return NextResponse.json({ error: NO_DISPONIBLE }, { status: 503 });
  // Las dos guardias de siempre: una clave live fuera de producción (o test en
  // producción) no guarda tarjetas, y el incrustado se monta con la publicable, que
  // tiene que ser del mismo modo. Ver lib/billing/modo-stripe.ts.
  const modo = comprobarModoStripe();
  const par = comprobarParDeClaves();
  if (!modo.puedeCobrar || !par.ok) {
    console.error('[public/tarjeta:POST] modo de Stripe', modo.motivo ?? (par.ok ? null : par.motivo));
    return NextResponse.json({ error: NO_DISPONIBLE }, { status: 503 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const [{ data: socio, error: errSocio }, { data: studio, error: errStudio }] = await Promise.all([
      admin.from('socios').select('id, nombre, email, stripe_customer_id').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
      admin.from('studios').select('stripe_account_id, slug').eq('id', studioId).maybeSingle(),
    ]);
    if (errSocio || errStudio) throw new Error(errSocio?.message ?? errStudio?.message);
    if (!socio) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    const stripeAccount = (studio?.stripe_account_id as string | null) ?? null;
    const slug = (studio?.slug as string | null) ?? null;
    if (!stripeAccount || !slug) {
      return NextResponse.json({ error: 'Tu estudio todavía no acepta tarjetas desde la app.' }, { status: 409 });
    }
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });

    // El Customer de SU ficha en la cuenta del estudio: el mismo que usan los cobros.
    // Si aún no tiene, se crea; el UPDATE solo lo apunta si sigue sin tener (dos toques
    // a la vez no dejan la ficha cambiando de Customer: el que pierde usa el del otro).
    const crearCustomer = async (sustituye: string | null): Promise<string> => {
      const c = await stripe.customers.create(
        {
          name: (socio.nombre as string | null) ?? undefined,
          email: (socio.email as string | null) ?? undefined,
          metadata: { socioId, studioId },
        },
        { stripeAccount },
      );
      let q = admin.from('socios').update({ stripe_customer_id: c.id }).eq('id', socioId).eq('studio_id', studioId);
      q = sustituye === null ? q.is('stripe_customer_id', null) : q.eq('stripe_customer_id', sustituye);
      const { data: escrito, error } = await q.select('id');
      if (error) throw new Error(error.message);
      if ((escrito?.length ?? 0) > 0) return c.id;
      const { data: ahora, error: e2 } = await admin.from('socios').select('stripe_customer_id')
        .eq('id', socioId).eq('studio_id', studioId).maybeSingle();
      if (e2 || !ahora?.stripe_customer_id) throw new Error(e2?.message ?? 'Sin Customer tras crearlo');
      return ahora.stripe_customer_id as string;
    };
    let customer = (socio.stripe_customer_id as string | null) ?? await crearCustomer(null);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
    const crearSesion = (cus: string) => stripe.checkout.sessions.create(
      parametrosSesionGuardarTarjeta({
        customer: cus,
        studioId,
        socioId,
        // Una tarjeta no redirige; si algo lo hiciera, vuelve a esta pantalla, que comprueba antes de afirmar nada.
        returnUrl: `${appUrl}/portal/${encodeURIComponent(slug)}/perfil/pago?tarjeta=vuelta&session_id={CHECKOUT_SESSION_ID}`,
        // Abandonada, caduca en ~31 min: una sesión vieja no se completa días después.
        expiresAt: expiraSesionIncrustada(Date.now()),
      }),
      { stripeAccount },
    );
    let sesion: Stripe.Checkout.Session;
    try {
      sesion = await crearSesion(customer);
    } catch (e) {
      // El Customer de la ficha ya no existe en esa cuenta (el estudio reconectó
      // Stripe): uno nuevo, sustituyendo SOLO a ese.
      const err = e as { code?: string; param?: string };
      if (err?.code !== 'resource_missing' || err?.param !== 'customer') throw e;
      customer = await crearCustomer(customer);
      sesion = await crearSesion(customer);
    }
    const r = respuestaIncrustada(sesion);
    if (!r) throw new Error('Sesión sin client_secret');
    return NextResponse.json(r, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    // El mensaje de Stripe (en inglés) no se le enseña a la alumna.
    console.error('[public/tarjeta:POST]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No hemos podido abrir el formulario de la tarjeta. Inténtalo de nuevo.' }, { status: 502 });
  }
}

/**
 * ¿Ya está en su ficha la tarjeta de esta sesión? `guardada` solo cuando la ficha (lo
 * que usan los cobros) apunta al método que autorizó ESA sesión; entonces devuelve
 * los datos de la tarjeta que hay en la ficha, que es lo que la pantalla enseña.
 */
async function confirmarTarjetaGuardada(req: NextRequest) {
  // La hoja pregunta cada pocos segundos durante ~35 s tras el Checkout.
  const limited = await enforceRateLimit(req, 'public-tarjeta-confirmar', { max: 40, windowSeconds: 60 });
  if (limited) return limited;
  const studioId = req.nextUrl.searchParams.get('studioId');
  const sesionId = req.nextUrl.searchParams.get('sesion');
  if (!studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  if (!idDeSesionCheckoutValido(sesionId)) return NextResponse.json({ error: 'Sesión no válida' }, { status: 400 });
  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const admin = getSupabaseAdmin();
  const key = claveStripe();
  if (!admin || !key) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const { data: studio, error: errStudio } = await admin.from('studios').select('stripe_account_id').eq('id', studioId).maybeSingle();
    if (errStudio) throw new Error(errStudio.message);
    const stripeAccount = (studio?.stripe_account_id as string | null) ?? null;
    if (!stripeAccount) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
    const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
    let sesion: Stripe.Checkout.Session;
    try {
      sesion = await stripe.checkout.sessions.retrieve(sesionId, { expand: ['setup_intent'] }, { stripeAccount });
    } catch (e) {
      if ((e as { code?: string })?.code === 'resource_missing') return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
      throw e;
    }
    const si = sesion.setup_intent && typeof sesion.setup_intent === 'object' ? sesion.setup_intent : null;
    // La ficha DESPUÉS de leer la sesión: si el webhook escribe entre las dos lecturas, ya se ve.
    const { data: ficha, error: errFicha } = await admin.from('socios')
      .select('stripe_payment_method_id, tarjeta_marca, tarjeta_ultimos4, tarjeta_exp_mes, tarjeta_exp_anio')
      .eq('id', socioId).eq('studio_id', studioId).maybeSingle();
    if (errFicha) throw new Error(errFicha.message);
    const confirmacion = confirmacionTarjetaGuardada(
      {
        mode: sesion.mode, status: sesion.status, metadata: sesion.metadata,
        setupIntent: si
          ? { status: si.status, paymentMethodId: typeof si.payment_method === 'string' ? si.payment_method : (si.payment_method?.id ?? null) }
          : null,
      },
      { socioId, studioId, metodoDeLaFicha: (ficha?.stripe_payment_method_id as string | null) ?? null },
    );
    // La sesión de otra persona (u otra cosa): lo mismo que si no existiera.
    if (confirmacion === 'ajena') return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
    const mes = (ficha?.tarjeta_exp_mes as number | null) ?? null;
    const anio = (ficha?.tarjeta_exp_anio as number | null) ?? null;
    return NextResponse.json({
      confirmacion,
      tarjeta: confirmacion === 'guardada' ? {
        marca: (ficha?.tarjeta_marca as string | null) ?? null,
        ultimos4: (ficha?.tarjeta_ultimos4 as string | null) ?? null,
        caducidad: mes && anio ? `${String(mes).padStart(2, '0')}/${anio}` : null,
      } : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('public/tarjeta:confirmar', err, 'No hemos podido comprobar tu tarjeta.');
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Quitar la tarjeta guardada, desde el portal de la socia.
//
// El hueco que cierra: se podía GUARDAR una tarjeta (al pagar, o con
// /api/stripe/setup-tarjeta) y no había ninguna forma de quitarla. Ni desde el
// portal ni desde el panel: no hay un solo `paymentMethods.detach` en el repo.
// La socia veía sus cuatro últimos dígitos y un texto que le explicaba cómo se
// había guardado, sin salida.
//
// ⚠️ SEGURIDAD: la identidad sale del JWT verificado, nunca del body — mismo
// patrón que /api/public/favoritos y /api/public/reserva. Es lo que impide que
// nadie borre la tarjeta de otra socia sabiendo su id.
//
// Esto NO es el gemelo de `setup-tarjeta`, que es semipúblico a propósito
// (la socia abre su enlace sin sesión). Aquí sí hay sesión y sí se exige:
// guardar un método propio y BORRAR el de otra persona no son el mismo riesgo.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-tarjeta-borrar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { studioId?: string; paymentMethodId?: unknown } | null;
  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  // P16: con id, se quita ESA tarjeta (una guardada para pagar en la app). Sin id, la de cobros, como siempre.
  if (body.paymentMethodId !== undefined && !idDeTarjetaValido(body.paymentMethodId)) {
    return NextResponse.json({ error: 'Tarjeta no válida' }, { status: 400 });
  }
  const pmPedido = idDeTarjetaValido(body.paymentMethodId) ? body.paymentMethodId : null;

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data: socio } = await admin
      .from('socios')
      .select('id, stripe_payment_method_id, metodo_pago_preferido, sepa_payment_method_id, stripe_customer_id')
      .eq('id', socioId)
      .eq('studio_id', body.studioId)
      .maybeSingle();
    if (!socio) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const metodo = socio.stripe_payment_method_id as string | null;

    // P16: una tarjeta guardada para pagar en la app que NO es la de cobros. Solo si es de SU Customer
    // (403 si no): se suelta en Stripe y, si Stripe falla, se dice y la tarjeta sigue en la lista.
    if (pmPedido && pmPedido !== metodo) {
      const key = claveStripe();
      const { data: studio } = await admin.from('studios').select('stripe_account_id').eq('id', body.studioId).maybeSingle();
      const stripeAccount = studio?.stripe_account_id as string | undefined;
      if (!key || !stripeAccount) return NextResponse.json({ error: 'No se ha podido quitar la tarjeta.' }, { status: 503 });
      const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
      let pm: Stripe.PaymentMethod;
      try {
        pm = await stripe.paymentMethods.retrieve(pmPedido, {}, { stripeAccount });
      } catch (e) {
        // Ya no existe: para ella ya no está, que es lo que pidió.
        if ((e as { code?: string })?.code === 'resource_missing') return NextResponse.json({ ok: true, yaNoEstaba: true });
        throw e;
      }
      if (!tarjetaEsSuya(pm.customer, (socio.stripe_customer_id as string | null) ?? null)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }
      // Solo una TARJETA guardada para pagar en la app: ni el mandato SEPA de sus domiciliaciones ni un método que
      // no aceptó guardar (esos no se ven en la lista y no se quitan desde aquí).
      if (!puedeQuitarseDesdeLaApp(pm, (socio.sepa_payment_method_id as string | null) ?? null)) {
        return NextResponse.json({ error: 'Esta tarjeta no se puede quitar desde aquí. Escribe al estudio.' }, { status: 403 });
      }
      try {
        await stripe.paymentMethods.detach(pmPedido, {}, { stripeAccount });
      } catch (e) {
        console.error('[public/tarjeta] no se pudo soltar la tarjeta guardada', e);
        return NextResponse.json({ error: 'No se ha podido quitar la tarjeta. Inténtalo de nuevo.' }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    // ⚠️ Se limpia la BASE aunque Stripe falle, y no al revés. El orden importa:
    // si se borrase primero en Stripe y luego fallara la escritura, quedaría una
    // tarjeta que el portal enseña y que ya no se puede cobrar — el peor de los
    // dos estados. Al revés, lo que queda es un método huérfano en Stripe que no
    // usa nadie, y eso no le cobra nada a nadie.
    const limpieza: Record<string, unknown> = {
      stripe_payment_method_id: null,
      tarjeta_marca: null,
      tarjeta_ultimos4: null,
      tarjeta_exp_mes: null,
      tarjeta_exp_anio: null,
    };
    // Si su método preferido ERA la tarjeta, deja de serlo. Dejarlo apuntando a
    // una tarjeta que ya no existe haría que el cobro fallara con un motivo que
    // no se entiende, en vez de decir claramente que no hay método.
    if (socio.metodo_pago_preferido === 'TARJETA') {
      limpieza.metodo_pago_preferido = socio.sepa_payment_method_id ? 'SEPA' : null;
    }
    const { error: updErr } = await admin
      .from('socios').update(limpieza).eq('id', socioId).eq('studio_id', body.studioId);
    if (updErr) {
      return NextResponse.json({ error: 'No se ha podido quitar la tarjeta.' }, { status: 500 });
    }

    // Y ahora, si se puede, se suelta también en Stripe. Un fallo aquí NO se le
    // cuenta a la socia como error: para ella la tarjeta ya no está, que es lo
    // que pidió. Se registra para poder limpiarlo.
    const key = process.env.STRIPE_SECRET_KEY;
    if (metodo && key && !key.startsWith('sk_test_XXXX')) {
      const { data: studio } = await admin
        .from('studios').select('stripe_account_id').eq('id', body.studioId).maybeSingle();
      const stripeAccount = studio?.stripe_account_id as string | undefined;
      if (stripeAccount) {
        try {
          const stripe = new Stripe(key, { apiVersion: '2026-06-24.dahlia' });
          await stripe.paymentMethods.detach(metodo, {}, { stripeAccount });
        } catch (err) {
          console.error('[public/tarjeta] no se pudo soltar en Stripe', err);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('public/tarjeta:DELETE', err, 'No se ha podido quitar la tarjeta.');
  }
}
