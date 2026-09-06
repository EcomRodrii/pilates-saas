'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getPlazaFija } from '@/lib/student/datos';
import { PlazaFijaCard } from '@/components/student/domain/PlazaFijaCard';
import { CreditCard } from '@/components/student/domain/CreditCard';
import { useToast } from '@/components/student/ui/Toast';
import { avisoDeRetorno, esperarBonoDePlan } from '@/lib/student/retorno-pago';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Bonos (§A.12). Solo lectura: no hay ninguna acción que mueva dinero aquí.
//
// ⚠️ Un bono es una fila de `suscripciones` cuyo plan es de tipo BONO o PUNTUAL,
// y `sesiones_restantes = null` significa ILIMITADO, no cero (el mensual). La
// proyección ya lo resuelve en `lib/student/mapeo.ts`; esta pantalla solo pinta.
function Bonos() {
  const { estudio } = useEstudio();
  const href = usePortalHref();

  const cargar = useCallback(async () => {
    const [bonos, plazaFija] = await Promise.all([getBonos(estudio.slug), getPlazaFija(estudio.slug)]);
    return { bonos, plazaFija };
  }, [estudio.slug]);
  const { data: cargado, estado, reintentar } = useAsync(cargar, (d) => d.bonos.length === 0 && !d.plazaFija.plaza && d.plazaFija.recuperaciones.disponibles === 0);
  const data = cargado?.bonos ?? null;
  const plazaFija = cargado?.plazaFija ?? null;

  // ── Retorno de Stripe ─────────────────────────────────────────────────────
  // `?compra=ok` dice que STRIPE cobró, no que el bono esté: lo entrega el
  // webhook y puede tardar. Así que se comprueba antes de felicitar a nadie.
  const sp = useSearchParams();
  const { toast } = useToast();
  const aviso = avisoDeRetorno(sp);
  // El spinner arranca en el PRIMER render, no desde un efecto: `sp` está
  // disponible durante el render, así que el valor inicial ya es el correcto.
  // Además, poner este `setState` dentro del efecto es justo lo que el lint
  // rechaza (render en cascada) — y aquí ni siquiera hacía falta.
  const [confirmando, setConfirmando] = useState(aviso?.comprobar === true);
  const yaTratado = useRef(false);

  useEffect(() => {
    if (yaTratado.current || !aviso) return;
    yaTratado.current = true;

    if (!aviso.comprobar) { toast(aviso.mensaje); return; }

    void esperarBonoDePlan(estudio.slug, sp.get('plan')).then((r) => {
      setConfirmando(false);
      toast(r === 'confirmada'
        ? 'Compra confirmada · tu bono ya está aquí ✓'
        : r === 'tardando'
          // NO es un error: el webhook puede completarla en un minuto. Decirle
          // que ha fallado sería peor que decirle que está tardando.
          ? 'Pago recibido. Tu bono aparecerá en unos instantes.'
          : 'Pago recibido. Revisa tus bonos en un momento.');
      reintentar();
    });
  }, [aviso, sp, estudio.slug, toast, reintentar]);

  const activos = data?.filter((b) => b.estado === 'activo') ?? [];
  const otros = data?.filter((b) => b.estado !== 'activo') ?? [];

  return (
    <StudentShell>
      <PageHeader
        titulo="Bonos"
        sub="Tus sesiones y su caducidad"
        accion={<Link href={href('/pagos')} className="btn btn--secondary btn--sm">Pagos</Link>}
      />

      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-3)', marginTop: 14 }}>
        {confirmando && (
          <div className="card card--pad row" role="status" aria-live="polite">
            <span aria-hidden style={{ width: 16, height: 16, borderRadius: 'var(--radius-pill)', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'apSpin .7s linear infinite' }} />
            <p className="t-small" style={{ fontWeight: 700 }}>Confirmando tu compra con el estudio…</p>
          </div>
        )}
        {estado === 'loading' && <ListSkeleton n={2} h={96} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}
        {estado === 'empty' && (
          <EmptyState
            icono="🎟"
            titulo="No tienes ningún bono"
            cuerpo="Compra uno aquí mismo, o reserva clases sueltas desde el horario."
            accion="Comprar un bono"
            href={href('/comprar')}
          />
        )}

        {data && estado === 'ready' && (
          <>
            {activos.length === 0 && (
              <EmptyState
                icono="🎟"
                titulo="Sin bono activo"
                cuerpo="Tus bonos anteriores están agotados o han caducado."
                accion="Comprar un bono"
                href={href('/comprar')}
              />
            )}
            {plazaFija && <PlazaFijaCard plaza={plazaFija.plaza} recuperaciones={plazaFija.recuperaciones} hrefHorario={href('/reservar')} />}
            {activos.map((b) => <CreditCard key={b.id} bono={b} />)}
            {otros.length > 0 && <p className="t-label" style={{ margin: 'var(--s-2) 0 0' }}>Anteriores</p>}
            {otros.map((b) => <CreditCard key={b.id} bono={b} />)}

            {/* La salida. Con un bono activo, esta pantalla se quedaba en una
                tarjeta y el resto de la pantalla en blanco, sin decir qué se
                puede hacer con lo que acaba de mirar: el siguiente paso natural
                —reservar— estaba a dos toques por el menú y a ninguno desde
                aquí. No se inventa nada; son dos rutas que ya existen. */}
            {activos.length > 0 && (
              <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)', marginTop: 'var(--s-2)', alignItems: 'center' }}>
                <Link href={href('/reservar')} className="btn btn--primary btn--full tap">Reservar una clase</Link>
                <Link href={href('/comprar')} className="t-meta" style={{ color: 'var(--accent)', fontWeight: 800 }}>
                  Ver bonos y suscripciones →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </StudentShell>
  );
}

export default function BonosPage() {
  // `useSearchParams` exige un límite de Suspense en el App Router.
  return (
    <Suspense fallback={null}>
      <Bonos />
    </Suspense>
  );
}
