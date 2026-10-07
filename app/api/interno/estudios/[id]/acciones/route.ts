import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { PLANES } from '@/lib/billing/entitlements';
import { DIAS_AMPLIACION_PRUEBA } from '@/lib/billing/trial';
import { ampliarPruebaEstudio } from '@/lib/interno/ampliar-prueba';
import { filtroClavesQueLleganA } from '@/lib/api-publica/gestion-reglas';
import { credencialesWellhub, productosWellhub } from '@/lib/plataformas/wellhub/cliente';

export const runtime = 'nodejs';

// Acciones del panel interno sobre un estudio. Todas comparten tres reglas:
//
//   1. Exigen `studios.update` (Meri no las tiene: solo lee).
//   2. Leen el estado ANTES, escriben, y auditan ambos con un resumen legible.
//      Sin el "antes" la auditoría no sirve para reconstruir qué pasó.
//   3. Nada de acciones que solo Stripe sabe hacer bien (reembolsar, reenviar
//      factura, meses gratis a quien paga). Ahí el panel enlaza a Stripe en vez
//      de duplicar una superficie por la que se pierde dinero. La prueba
//      gratuita LOCAL (sin tarjeta) no es de Stripe: esa sí se amplía aquí
//      (`ampliar-prueba`), y nunca a un estudio con suscripción en Stripe.
type Accion =
  | { accion: 'cambiar-plan'; plan: string }
  | { accion: 'suspender'; motivo: string }
  | { accion: 'reactivar' }
  | { accion: 'activar-review-boost' }
  | { accion: 'ampliar-prueba' }
  | { accion: 'activar-api'; nota?: string }
  | { accion: 'desactivar-api' }
  | { accion: 'vincular-wellhub'; gymId?: string; productoId?: string }
  | { accion: 'desvincular-wellhub' };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirPermiso(req, 'studios.update');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { id } = await params;
  const cuerpo = (await req.json().catch(() => null)) as Accion | null;
  if (!cuerpo?.accion) return NextResponse.json({ error: 'Falta la acción' }, { status: 400 });

  const { data: antes } = await db.from('studios')
    .select('id, slug, nombre, plan, suspendido_en, suspendido_motivo, review_boost_elegible_en, cadena_id')
    .eq('id', id).maybeSingle();
  if (!antes) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

  const nombre = (antes.nombre as string | null) ?? (antes.slug as string);

  if (cuerpo.accion === 'cambiar-plan') {
    // Contra la lista real de planes: un plan inventado dejaría al estudio con
    // entitlements que no existen y sin forma de comprar nada.
    if (!PLANES.includes(cuerpo.plan as (typeof PLANES)[number])) {
      return NextResponse.json({ error: `Plan no válido. Son: ${PLANES.join(', ')}.` }, { status: 400 });
    }
    if (cuerpo.plan === antes.plan) {
      return NextResponse.json({ error: `Ya está en el plan ${cuerpo.plan}.` }, { status: 409 });
    }
    // 37ª pasada de auditoría: en una sede de cadena el plan no vive aquí de
    // verdad — vive en `cadenas.plan`, y `trg_propagar_plan_cadena` (migración
    // 0066) sobrescribe `studios.plan` de TODAS las sedes en cuanto `cadenas`
    // reciba cualquier UPDATE normal de Stripe (renovación, cambio de tarjeta,
    // etc.). Escribir aquí parecía un cambio permanente y se revertía solo, en
    // silencio, sin pasar por `registrar()` — el mismo tipo de rama de cadena
    // que un camino antiguo no contemplaba (F-4, 20ª auditoría).
    if (antes.cadena_id) {
      return NextResponse.json(
        { error: 'Esta sede pertenece a una cadena: el plan se gestiona sobre la cadena, no sobre la sede.' },
        { status: 409 },
      );
    }

    const { error } = await db.from('studios').update({ plan: cuerpo.plan }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido cambiar el plan.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.plan.cambiado',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre}: plan ${antes.plan} → ${cuerpo.plan}`,
      antes: { plan: antes.plan }, despues: { plan: cuerpo.plan },
    });
    // El plan aquí NO toca la suscripción de Stripe: cambia lo que el producto
    // deja hacer, no lo que se le cobra. Si además hay que cobrar distinto, eso
    // se hace en Stripe. La respuesta lo dice para que la UI lo avise.
    return NextResponse.json({ ok: true, plan: cuerpo.plan, avisoStripe: Boolean(antes.plan) });
  }

  if (cuerpo.accion === 'suspender') {
    const motivo = (cuerpo.motivo ?? '').trim();
    // Obligatorio y con sustancia: este texto se le enseña al cliente cuando
    // intente entrar, y es lo que queda en la auditoría meses después.
    if (motivo.length < 10) {
      return NextResponse.json(
        { error: 'Escribe un motivo de al menos 10 caracteres: se le muestra al cliente.' },
        { status: 400 },
      );
    }
    if (antes.suspendido_en) return NextResponse.json({ error: 'Ya está suspendido.' }, { status: 409 });

    const { error } = await db.from('studios').update({
      suspendido_en: new Date().toISOString(),
      suspendido_motivo: motivo,
      suspendido_por: g.admin.userId,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido suspender.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.suspendido',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre} suspendido: ${motivo}`,
      antes: { suspendido: false }, despues: { suspendido: true, motivo },
    });
    return NextResponse.json({ ok: true, suspendido: true });
  }

  if (cuerpo.accion === 'reactivar') {
    if (!antes.suspendido_en) return NextResponse.json({ error: 'No está suspendido.' }, { status: 409 });

    const { error } = await db.from('studios').update({
      suspendido_en: null, suspendido_motivo: null, suspendido_por: null,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido reactivar.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.reactivado',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre} reactivado (estaba suspendido por: ${antes.suspendido_motivo ?? 'sin motivo'})`,
      antes: { suspendido: true, motivo: antes.suspendido_motivo }, despues: { suspendido: false },
    });
    return NextResponse.json({ ok: true, suspendido: false });
  }

  if (cuerpo.accion === 'activar-review-boost') {
    // Activación manual: salta el cron de elegibilidad (lib/inngest/review-boost.ts)
    // para un estudio concreto — el mismo campo que marca ese cron, así que el
    // resto del flujo (modal, feedback, recompensa) no distingue cómo llegó a
    // estar elegible.
    if (antes.review_boost_elegible_en) {
      return NextResponse.json({ error: 'Ya está activado para este estudio.' }, { status: 409 });
    }
    const { data: yaRespondio } = await db.from('review_boost_feedback').select('id').eq('studio_id', id).maybeSingle();
    if (yaRespondio) return NextResponse.json({ error: 'Este estudio ya dio su feedback — no tiene sentido reactivarlo.' }, { status: 409 });

    const { error } = await db.from('studios').update({ review_boost_elegible_en: new Date().toISOString() }).eq('id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido activar.' }, { status: 500 });

    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.review_boost.activado_manual',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre}: Review Boost activado manualmente`,
      antes: { reviewBoostElegibleEn: null }, despues: { reviewBoostElegibleEn: true },
    });
    return NextResponse.json({ ok: true, reviewBoostElegible: true });
  }

  if (cuerpo.accion === 'ampliar-prueba') {
    // La regla, la purga y el compare-and-set viven en `ampliarPruebaEstudio`
    // (probado contra las peticiones reales a PostgREST). Aquí: permiso y auditoría.
    const r = await ampliarPruebaEstudio(db, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

    const dia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
    await registrar(db, req, {
      actor: g.admin,
      accion: 'estudio.prueba.ampliada',
      objetivoTipo: 'studio', objetivoId: id,
      // `trialAntes` es NULL en el estado roto que repara #2036 (estudio en
      // 'trial_expirado' sin fecha de fin): ahí no hay fecha anterior que contar.
      resumen: r.trialAntes === null
        ? `${r.nombre}: prueba +${DIAS_AMPLIACION_PRUEBA} días, hasta el ${dia(r.hasta)} (no tenía fecha de fin: estado incoherente reparado)`
        : `${r.nombre}: prueba +${DIAS_AMPLIACION_PRUEBA} días, hasta el ${dia(r.hasta)} (${r.estadoAntes === 'trial_expirado' ? 'había terminado' : 'acababa'} el ${dia(r.trialAntes)})`,
      antes: { trialEndsAt: r.trialAntes, subscriptionStatus: r.estadoAntes },
      despues: { trialEndsAt: r.hasta, subscriptionStatus: 'trialing' },
    });
    return NextResponse.json({ ok: true, pruebaHasta: r.hasta });
  }

  // Wellhub por API: qué gym de Wellhub es este estudio (`plataforma_conexiones`,
  // único por gym). Se vincula desde aquí mientras se prueba en su sandbox; la
  // propietaria tendrá su propio formulario cuando esté probado. Vincular no
  // pone a vender: eso lo deciden «Vendo en Wellhub» y las plazas que cede.
  if (cuerpo.accion === 'vincular-wellhub' || cuerpo.accion === 'desvincular-wellhub') {
    const { data: antesW } = await db.from('plataforma_conexiones')
      .select('id_externo, producto_externo_id').eq('studio_id', id).eq('plataforma', 'WELLHUB').maybeSingle();
    if (cuerpo.accion === 'desvincular-wellhub') {
      if (!antesW) return NextResponse.json({ error: 'No tiene Wellhub vinculado.' }, { status: 409 });
      // Lo publicado allí lo retira el cron con el gym de entonces (plataforma_clases).
      const { error } = await db.from('plataforma_conexiones').delete().eq('studio_id', id).eq('plataforma', 'WELLHUB');
      if (error) return NextResponse.json({ error: 'No se ha podido desvincular.' }, { status: 500 });
      await registrar(db, req, {
        actor: g.admin, accion: 'estudio.wellhub.desvinculado', objetivoTipo: 'studio', objetivoId: id,
        resumen: `${nombre}: Wellhub desvinculado (gym ${antesW.id_externo})`,
        antes: { gymId: antesW.id_externo, productoId: antesW.producto_externo_id }, despues: { gymId: null },
      });
      return NextResponse.json({ ok: true, wellhub: null });
    }

    const gymId = String(cuerpo.gymId ?? '').trim();
    let productoId = String(cuerpo.productoId ?? '').trim();
    if (!/^\d{1,18}$/.test(gymId)) return NextResponse.json({ error: 'El gym de Wellhub es un número (lo ve el estudio en su portal de Wellhub).' }, { status: 400 });
    if (productoId && !/^\d{1,18}$/.test(productoId)) return NextResponse.json({ error: 'El producto de Wellhub es un número.' }, { status: 400 });
    // Con credenciales, el producto se comprueba contra los del gym (y si hay uno solo, se elige solo).
    const cred = credencialesWellhub();
    if (cred) {
      const productos = await productosWellhub(cred, gymId);
      if (productos.ok) {
        const presenciales = productos.valor.filter(x => !x.virtual);
        if (productoId && !productos.valor.some(x => String(x.id) === productoId)) {
          return NextResponse.json({ error: `Ese producto no es de ese gym. Son: ${productos.valor.map(x => `${x.id} (${x.nombre})`).join(', ') || 'ninguno'}.` }, { status: 400 });
        }
        if (!productoId && presenciales.length === 1) productoId = String(presenciales[0].id);
        if (!productoId) {
          return NextResponse.json({ error: `Elige el producto: ${productos.valor.map(x => `${x.id} (${x.nombre})`).join(', ') || 'ese gym no tiene ninguno'}.` }, { status: 400 });
        }
      } else if (!productoId) {
        return NextResponse.json({ error: `No se han podido leer los productos de Wellhub (${productos.error}): pon el producto a mano.` }, { status: 502 });
      }
    }
    const { error } = await db.from('plataforma_conexiones').upsert({
      studio_id: id, plataforma: 'WELLHUB', id_externo: gymId, producto_externo_id: productoId || null,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: 'plataforma,studio_id' });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Ese gym de Wellhub ya está vinculado a otro estudio.' }, { status: 409 });
      return NextResponse.json({ error: 'No se ha podido vincular.' }, { status: 500 });
    }
    await registrar(db, req, {
      actor: g.admin, accion: 'estudio.wellhub.vinculado', objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre}: Wellhub vinculado al gym ${gymId}${productoId ? ` (producto ${productoId})` : ' (sin producto: no publica hasta tenerlo)'}`,
      antes: { gymId: antesW?.id_externo ?? null, productoId: antesW?.producto_externo_id ?? null },
      despues: { gymId, productoId: productoId || null },
    });
    return NextResponse.json({ ok: true, wellhub: { gymId, productoId: productoId || null } });
  }

  // API pública (F1, 1-oct-2026): se activa estudio a estudio. Decisión del
  // fundador: no queda abierta a todos los planes, pero tampoco se inventan
  // límites comerciales todavía. Sin activar, el estudio no puede crear claves
  // y las que tuviera dejan de valer (lib/api-publica/servidor.ts). Los tokens
  // OAuth de Zapier no dependen de esto.
  if (cuerpo.accion === 'activar-api' || cuerpo.accion === 'desactivar-api') {
    const { data: acceso } = await db.from('api_acceso_estudios')
      .select('activada_en, desactivada_en').eq('studio_id', id).maybeSingle();
    const activaAntes = !!acceso && !acceso.desactivada_en;
    const activar = cuerpo.accion === 'activar-api';
    if (activar === activaAntes) {
      return NextResponse.json({ error: activar ? 'La API ya está activada.' : 'La API no está activada.' }, { status: 409 });
    }
    const nota = activar ? (cuerpo.nota ?? '').trim().slice(0, 500) || null : undefined;
    const { error } = activar
      ? await db.from('api_acceso_estudios').upsert({
          studio_id: id, activada_en: new Date().toISOString(), activada_por: g.admin.userId,
          desactivada_en: null, nota,
        }, { onConflict: 'studio_id' })
      : await db.from('api_acceso_estudios').update({ desactivada_en: new Date().toISOString() }).eq('studio_id', id);
    if (error) return NextResponse.json({ error: 'No se ha podido cambiar el acceso a la API.' }, { status: 500 });

    // Desactivar REVOCA las claves que llegan a la sede: las suyas y las de su
    // cadena (lib/api-publica/cadena.ts). Si no, volver a activar la API (meses
    // después, o tras desactivarla por un abuso) resucitaría en silencio todas
    // las que no se revocaron. Tras reactivar, la propietaria crea claves
    // nuevas. Una clave de cadena revocada deja de valer también en las otras
    // sedes: preferible a que siga entrando en esta sin que nadie lo decida.
    let revocadas = 0;
    if (!activar) {
      const { data: filas, error: errRevocar } = await db.from('api_claves')
        .update({ revocada_en: new Date().toISOString(), revocada_por: g.admin.userId })
        .or(filtroClavesQueLleganA({ studioId: id, cadenaId: (antes.cadena_id as string | null) ?? null })).is('revocada_en', null).select('id');
      if (errRevocar) return NextResponse.json({ error: 'API desactivada, pero no se han podido revocar sus claves. Vuelve a intentarlo.' }, { status: 500 });
      revocadas = filas?.length ?? 0;
    }

    // Y sus webhooks, por lo mismo: reactivar la API no vuelve a mandar avisos
    // a nadie hasta que la propietaria reactive cada webhook. Lo pendiente se
    // descarta (el trigger ya no registra nada desde este momento).
    let webhooksDesactivados = 0;
    if (!activar) {
      const ahora = new Date().toISOString();
      const { data: filas, error: errWebhooks } = await db.from('api_webhooks')
        .update({ desactivado_en: ahora, desactivado_por: g.admin.userId, desactivado_motivo: 'api_desactivada' })
        .eq('studio_id', id).is('desactivado_en', null).select('id');
      if (errWebhooks) return NextResponse.json({ error: 'API desactivada, pero no se han podido desactivar sus webhooks. Vuelve a intentarlo.' }, { status: 500 });
      webhooksDesactivados = filas?.length ?? 0;
      await db.from('api_webhook_entregas').update({ estado: 'DESCARTADA', ultimo_error: 'Se desactivó la API del estudio.' })
        .eq('studio_id', id).eq('estado', 'PENDIENTE');
    }

    await registrar(db, req, {
      actor: g.admin,
      accion: activar ? 'estudio.api.activada' : 'estudio.api.desactivada',
      objetivoTipo: 'studio', objetivoId: id,
      resumen: `${nombre}: API pública ${activar ? 'activada' : `desactivada (${revocadas} claves revocadas, ${webhooksDesactivados} webhooks desactivados)`}${nota ? ` (${nota})` : ''}`,
      antes: { apiActiva: activaAntes }, despues: { apiActiva: activar, clavesRevocadas: revocadas, webhooksDesactivados },
    });
    return NextResponse.json({ ok: true, apiActiva: activar, clavesRevocadas: revocadas, webhooksDesactivados });
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
}
