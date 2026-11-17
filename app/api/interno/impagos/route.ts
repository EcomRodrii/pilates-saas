import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { CLAVE_POLITICA, diasDesde, leerPolitica } from '@/lib/billing/impagos/reglas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Los pagos fallidos de la suscripción de los estudios a Tentare (billing_incidentes_pago) y la
// política de avisos. Stripe reintenta el cobro; aquí solo se ve el estado y se decide cuándo
// avisar. Suspender un estudio sigue siendo un acto humano, desde su ficha.

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'billing.read');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const [abiertos, recientes, ajuste] = await Promise.all([
    db.from('billing_incidentes_pago').select('*').in('estado', ['ABIERTO', 'ESCALADO']).order('abierto_en').limit(200),
    db.from('billing_incidentes_pago').select('*').in('estado', ['RECUPERADO', 'CANCELADO']).order('abierto_en', { ascending: false }).limit(10),
    db.from('ajustes_plataforma').select('valor').eq('clave', CLAVE_POLITICA).maybeSingle(),
  ]);
  if (abiertos.error || recientes.error) return NextResponse.json({ error: 'No se han podido leer los incidentes.' }, { status: 500 });

  const filas = [...(abiertos.data ?? []), ...(recientes.data ?? [])] as Array<Record<string, unknown>>;
  const idsEstudio = [...new Set(filas.map((f) => f.studio_id as string | null).filter((x): x is string => !!x))];
  const idsCadena = [...new Set(filas.map((f) => f.cadena_id as string | null).filter((x): x is string => !!x))];
  const [estudios, cadenas] = await Promise.all([
    idsEstudio.length ? db.from('studios').select('id, nombre, slug, plan, suspendido_en').in('id', idsEstudio) : Promise.resolve({ data: [] }),
    idsCadena.length ? db.from('cadenas').select('id, nombre, plan').in('id', idsCadena) : Promise.resolve({ data: [] }),
  ]);
  const nombreEstudio = new Map((estudios.data ?? []).map((e) => [e.id as string, e as Record<string, unknown>]));
  const nombreCadena = new Map((cadenas.data ?? []).map((c) => [c.id as string, c as Record<string, unknown>]));

  const ahora = new Date();
  const mapear = (f: Record<string, unknown>) => {
    const e = f.studio_id ? nombreEstudio.get(f.studio_id as string) : null;
    const c = f.cadena_id ? nombreCadena.get(f.cadena_id as string) : null;
    return {
      facturaId: f.stripe_invoice_id as string,
      estado: f.estado as string,
      tipo: e ? 'estudio' : 'cadena',
      id: ((e?.id ?? c?.id) as string | undefined) ?? null,
      nombre: ((e?.nombre ?? e?.slug ?? c?.nombre) as string | undefined) ?? '(sin identificar)',
      plan: ((e?.plan ?? c?.plan) as string | undefined) ?? null,
      suspendido: !!e?.suspendido_en,
      importeCents: f.importe_cents as number,
      intentos: f.intentos as number,
      motivo: (f.motivo_texto as string | null) ?? null,
      siguienteIntento: (f.siguiente_intento as string | null) ?? null,
      abiertoEn: f.abierto_en as string,
      diasAbierto: diasDesde(f.abierto_en as string, ahora),
      recuperadoEn: (f.recuperado_en as string | null) ?? null,
      avisos: ((f.avisos as Array<{ dia: number; tipo: string; en: string }> | null) ?? []).filter((a) => a.tipo !== 'saltado'),
    };
  };

  return NextResponse.json({
    abiertos: (abiertos.data ?? []).map((f) => mapear(f as Record<string, unknown>)),
    recientes: (recientes.data ?? []).map((f) => mapear(f as Record<string, unknown>)),
    politica: leerPolitica(ajuste.data?.valor),
  });
}

// Cambiar la política de avisos (días y ventana horaria). Una política inválida se RECHAZA aquí
// (la lectura sí cae a la de serie, pero guardar algo que luego se ignora engaña a quien lo guarda).
export async function PUT(req: NextRequest) {
  const g = await exigirPermiso(req, 'plans.update');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as { dias?: unknown; horaDesde?: unknown; horaHasta?: unknown } | null;
  const nueva = leerPolitica(body);
  if (JSON.stringify(nueva) !== JSON.stringify({ dias: body?.dias, horaDesde: body?.horaDesde, horaHasta: body?.horaHasta })) {
    return NextResponse.json({ error: 'Política no válida: el primer aviso es el día 0, los días van de menor a mayor (máximo 8, hasta el 60) y la ventana horaria tiene que tener sentido.' }, { status: 400 });
  }
  const { data: antes } = await db.from('ajustes_plataforma').select('valor').eq('clave', CLAVE_POLITICA).maybeSingle();
  const { error } = await db.from('ajustes_plataforma').upsert({
    clave: CLAVE_POLITICA, valor: nueva, actualizado_en: new Date().toISOString(), actualizado_por: g.admin.userId,
  }, { onConflict: 'clave' });
  if (error) return NextResponse.json({ error: 'No se ha podido guardar la política.' }, { status: 500 });
  await registrar(db, req, {
    actor: g.admin, accion: 'billing.politica-impagos.cambiada', objetivoTipo: 'ajuste', objetivoId: CLAVE_POLITICA,
    resumen: `Avisos de impago: días ${nueva.dias.join(', ')}, de ${nueva.horaDesde} a ${nueva.horaHasta} h`,
    antes: antes?.valor ?? null, despues: nueva,
  });
  return NextResponse.json({ ok: true, politica: nueva });
}
