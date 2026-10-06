'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getMetodoPago, getTarjetasApp, quitarTarjeta, quitarTarjetaApp } from '@/lib/student/pago';
import { catalogo, invalidarCatalogo } from '@/lib/student/catalogo';
import { clavePublicableStripe } from '@/lib/student/comprar';
import { lineaConsentimiento } from '@/lib/student/guardar-tarjeta-reglas';
import { HojaGuardarTarjeta } from '@/components/student/domain/HojaGuardarTarjeta';
import type { TarjetaGuardada } from '@/lib/billing/tarjetas-guardadas';
import { Button } from '@/components/student/ui/Button';
import { Sheet } from '@/components/student/ui/Sheet';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Método de pago (§ auditoría: la app GUARDA la tarjeta para cobros
// automáticos y no daba ninguna pantalla para verla ni quitarla, teniendo
// `DELETE /api/public/tarjeta` hecho y huérfano).
//
// Los datos que se enseñan (marca, últimos cuatro, caducidad) ya viajan en el
// payload de la socia: son suyos. El número completo no existe en ninguna parte
// del sistema — lo guarda Stripe, no nosotros.
//
// Un método Link se enseña igual, con su nombre en vez de «Visa •••• 4242»: se
// cobra cada renovación exactamente como una tarjeta, así que tiene que verse y
// poder quitarse.

// «Cambiar tarjeta» y «Añadir tarjeta» (6-oct-2026): el formulario de Stripe va DENTRO
// de la app (`HojaGuardarTarjeta`, Checkout incrustado en modo setup), y «Tarjeta
// guardada» solo lo dice cuando el servidor la lee en su ficha. Cambiar es la acción
// principal; quitar, la secundaria.

export default function PagoPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  // La hoja de guardar tarjeta; `sesion` = volvió de Stripe con su sesión (un método que redirige).
  const [hojaTarjeta, setHojaTarjeta] = useState<{ sesion: string | null } | null>(null);

  // P16: además de la de cobros automáticos, las que aceptó guardar para pagar en la app.
  const cargar = useCallback(async () => {
    const [metodo, app, d] = await Promise.all([getMetodoPago(estudio.slug), getTarjetasApp(estudio.id), catalogo(estudio.slug)]);
    return { ...metodo, app, stripeAccountId: d?.studio?.stripeAccountId ?? null };
  }, [estudio.slug, estudio.id]);
  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => !d.tieneTarjeta && (d.app?.filter((t) => !t.paraCobros).length ?? 0) === 0);
  const esLink = data?.esLink === true;
  // Sin la cuenta de Stripe del estudio o sin la clave pública no hay formulario que montar: no se ofrece.
  const stripeAccountId = data?.stripeAccountId ?? null;
  const puedeGuardar = !!stripeAccountId && !!clavePublicableStripe();
  const consentimiento = lineaConsentimiento(estudio.nombre);
  const abrirHojaTarjeta = () => {
    if (!online) { toast('Necesitas conexión para guardar una tarjeta.'); return; }
    setHojaTarjeta({ sesion: null });
  };
  // Vuelta de Stripe con `session_id` (una tarjeta no redirige; si algo lo hiciera): a comprobar ESA sesión, sin
  // afirmar nada. Se quita de la URL para que recargar no la vuelva a abrir.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const sesion = q.get('session_id');
    if (q.get('tarjeta') !== 'vuelta' || !sesion) return;
    window.history.replaceState(null, '', window.location.pathname);
    void Promise.resolve().then(() => setHojaTarjeta({ sesion }));
  }, []);
  const trasGuardar = useCallback(() => { invalidarCatalogo(estudio.slug); void refrescar(); }, [estudio.slug, refrescar]);
  const delApp = (data?.app ?? []).filter((t) => !t.paraCobros);
  const [quitandoApp, setQuitandoApp] = useState<TarjetaGuardada | null>(null);
  const [quitandoAppEnVuelo, setQuitandoAppEnVuelo] = useState(false);
  const confirmarApp = async () => {
    if (!quitandoApp) return;
    setQuitandoAppEnVuelo(true);
    const error = await quitarTarjetaApp(estudio.slug, estudio.id, quitandoApp.id);
    setQuitandoAppEnVuelo(false);
    setQuitandoApp(null);
    // Si falla, se dice y la tarjeta sigue en la lista (no se quita de la pantalla sin que el servidor diga que sí).
    if (error) { toast(error); return; }
    toast('Tarjeta eliminada');
    await refrescar();
  };

  const confirmar = async () => {
    setQuitando(true);
    const error = await quitarTarjeta(estudio.slug, estudio.id);
    setQuitando(false);
    setConfirmando(false);
    if (error) { toast(error); return; }
    toast(esLink ? 'Link eliminado' : 'Tarjeta eliminada');
    await refrescar();
  };

  return (
    <StudentShell>
      <PageHeader titulo="Método de pago" back />
      <div className="px" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
        {estado === 'loading' && <ListSkeleton n={1} h={110} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver tu método de pago." />}
        {(estado === 'empty' || (estado === 'ready' && data && !data.tieneTarjeta)) && (
          puedeGuardar ? (
            <div data-testid="sin-tarjeta">
              <EmptyState
                ilustracion="tarjeta"
                titulo="No tienes ninguna tarjeta guardada"
                cuerpo={consentimiento}
                accion="Añadir tarjeta"
                onAccion={abrirHojaTarjeta}
              />
            </div>
          ) : (
            <EmptyState
              ilustracion="tarjeta"
              titulo="No tienes ninguna tarjeta guardada"
              cuerpo="Cuando pagues online podrás guardarla para las próximas veces."
            />
          )
        )}

        {estado === 'ready' && data?.tieneTarjeta && (
          <>
            <div className="card" data-testid="tarjeta" style={{ padding: '15px 16px' }}>
              <p className="t-label" style={{ margin: 0 }}>{esLink ? 'Método guardado' : 'Tarjeta guardada'}</p>
              <p style={{ margin: '6px 0 0', fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.01em' }}>
                {esLink ? 'Link' : <>{data.marca ? `${data.marca} ` : ''}•••• {data.ultimos4}</>}
              </p>
              {data.caducidad && <p className="t-meta" style={{ margin: '2px 0 0' }}>Caduca {data.caducidad}</p>}
              <p className="t-meta" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
                {esLink
                  ? 'Se usa para los cobros de tus cuotas y bonos. Tus datos de pago los guarda Link, no el estudio.'
                  : <>Se usa para los cobros de tus cuotas y bonos. El número completo
                    lo guarda la pasarela de pago, no el estudio.</>}
              </p>
            </div>

            {puedeGuardar && (
              <>
                <Button full disabled={!online} onClick={abrirHojaTarjeta}>
                  {esLink ? 'Usar una tarjeta' : 'Cambiar tarjeta'}
                </Button>
                <p className="t-meta" style={{ margin: 0, textAlign: 'center', lineHeight: 1.5 }}>{consentimiento}</p>
              </>
            )}
            <Button variant={puedeGuardar ? 'secondary' : 'danger'} full disabled={!online} onClick={() => setConfirmando(true)}>
              {esLink ? 'Quitar Link' : 'Quitar tarjeta'}
            </Button>
            <p className="t-meta" style={{ margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
              Si {esLink ? 'lo quitas' : 'la quitas'}, los cobros automáticos de tus renovaciones dejarán de
              funcionar y tendrás que pagarlos a mano.
            </p>
          </>
        )}

        {estado === 'ready' && delApp.length > 0 && (
          <section data-testid="tarjetas-app" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            <p className="t-label" style={{ margin: 0 }}>Para pagar en la app</p>
            <p className="t-meta" style={{ margin: 0, lineHeight: 1.5 }}>
              Las guardaste al pagar («Guárdala para la próxima»). Solo se usan cuando tú pagas; nunca para cobros automáticos.
            </p>
            {delApp.map((t) => (
              <div key={t.id} className="card" data-tarjeta={t.id} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, textTransform: 'capitalize' }}>{t.marca} •••• {t.ultimos4}</p>
                  {t.caducidad && <p className="t-meta" style={{ margin: '2px 0 0' }}>Caduca {t.caducidad}</p>}
                </div>
                <Button variant="secondary" disabled={!online} onClick={() => setQuitandoApp(t)}>Quitar</Button>
              </div>
            ))}
          </section>
        )}
      </div>

      {hojaTarjeta && stripeAccountId && (
        <HojaGuardarTarjeta
          studioId={estudio.id}
          stripeAccountId={stripeAccountId}
          cambiar={!!data?.tieneTarjeta}
          consentimiento={consentimiento}
          sesionDeVuelta={hojaTarjeta.sesion}
          onCerrar={() => { setHojaTarjeta(null); void refrescar(); }}
          onGuardada={trasGuardar}
          onSesionCaducada={() => router.push(href('/acceso/login'))}
        />
      )}
      <Sheet open={confirmando} onClose={() => setConfirmando(false)} label={esLink ? 'Quitar Link' : 'Quitar la tarjeta'}>
        <h3 className="t-h2" style={{ margin: 0 }}>{esLink ? '¿Quitar Link?' : '¿Quitar tu tarjeta?'}</h3>
        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-small)', lineHeight: 1.55, color: 'var(--muted-foreground)' }}>
          Tus renovaciones dejarán de cobrarse solas.{' '}
          {puedeGuardar
            ? 'Podrás guardar otra tarjeta cuando quieras desde aquí.'
            : <>Podrás volver a {esLink ? 'guardar un método' : 'guardarla'} la próxima vez que pagues.</>}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <Button variant="danger" full disabled={quitando} onClick={() => void confirmar()}>
            {quitando ? 'Quitando…' : esLink ? 'Sí, quitar Link' : 'Sí, quitar la tarjeta'}
          </Button>
          <Button variant="ghost" full onClick={() => setConfirmando(false)}>{esLink ? 'Mantenerlo' : 'Mantenerla'}</Button>
        </div>
      </Sheet>
      <Sheet open={!!quitandoApp} onClose={() => setQuitandoApp(null)} label="Quitar la tarjeta guardada">
        <h3 className="t-h2" style={{ margin: 0 }}>¿Quitar esta tarjeta?</h3>
        <p style={{ margin: '8px 0 0', fontSize: 'var(--t-small)', lineHeight: 1.55, color: 'var(--muted-foreground)' }}>
          {quitandoApp ? `${quitandoApp.marca} •••• ${quitandoApp.ultimos4}` : ''} dejará de salir al pagar. Podrás volver a guardarla la próxima vez.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <Button variant="danger" full disabled={quitandoAppEnVuelo} onClick={() => void confirmarApp()}>
            {quitandoAppEnVuelo ? 'Quitando…' : 'Sí, quitarla'}
          </Button>
          <Button variant="ghost" full onClick={() => setQuitandoApp(null)}>Mantenerla</Button>
        </div>
      </Sheet>
    </StudentShell>
  );
}
