'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeader } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { btnPrimary, inputCls } from '@/components/configuracion/estilos';
import { PLANES, PLAN_ENTITLEMENTS, PLAN_INFO } from '@/lib/billing/entitlements';
import { qrSvgMarkup } from '@/lib/qr-svg';
import {
  LETRAS_BAJO_EL_ICONO, esEstadoApp, textoDeEstado, validarNombreApp, type AppDelEstudio, type BloqueoPedirApp,
} from '@/lib/app-nativa/pedir-app';

// «Tu app en la App Store» (Apariencia de tu app, `APP_PROPIA_PEDIR`): pedir la app con el
// nombre y el icono del estudio y ver en qué punto va. Lo decide y lo guarda el SERVIDOR
// (`/api/estudio/app-movil`): aquí solo se pinta lo que contesta, nada optimista, y la puerta
// de plan y de rol se repiten en pantalla pero no son el límite.
//
// ⚠️ No promete plazos ni avisos: Apple decide cuándo revisa, y esta pantalla no manda ningún
// aviso al estudio (lo ve al volver aquí). Tampoco que Apple la vaya a aprobar.

interface Datos {
  bloqueo: BloqueoPedirApp | null; sedePrincipal: string | null; esPropietaria: boolean; nombreSugerido: string; app: AppDelEstudio | null;
  /** Si corre el margen por no pagar Estudio/Cadena: el día en que se pausa (ISO), o `null`. */
  retiradaEl: string | null;
}

const BLOQUEOS: readonly string[] = ['plan', 'prueba', 'cobro', 'sin-plan', 'sede'];
const esBloqueo = (v: unknown): v is BloqueoPedirApp => typeof v === 'string' && BLOQUEOS.includes(v);

/** Los planes que la incluyen, leídos del catálogo (nunca una lista a mano). */
const planesConApp = () =>
  PLANES.filter((p) => PLAN_ENTITLEMENTS[p].features.appPropia).map((p) => PLAN_INFO[p].nombre);

export function MiAppDeTienda({ studioId }: { studioId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/estudio/app-movil?estudio=${encodeURIComponent(studioId)}`;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url, { headers: await authHeader(), cache: 'no-store' });
      const d = (await res.json().catch(() => null)) as (Partial<Datos> & { app?: AppDelEstudio | null; error?: string }) | null;
      // 409: ha cambiado de sede en otra pestaña. Lo dice el servidor; reintentar no lo arregla.
      if (res.status === 409) { setFallo(d?.error ?? 'Has cambiado de sede en otra pestaña: recarga la página.'); return; }
      if (!res.ok || !d || !(d.bloqueo === null || esBloqueo(d.bloqueo))) { setFallo('No hemos podido leer el estado de tu app.'); return; }
      setDatos({
        bloqueo: d.bloqueo, sedePrincipal: typeof d.sedePrincipal === 'string' ? d.sedePrincipal : null,
        esPropietaria: d.esPropietaria === true,
        nombreSugerido: typeof d.nombreSugerido === 'string' ? d.nombreSugerido : '',
        app: d.app && esEstadoApp(d.app.estado) ? d.app : null,
        retiradaEl: typeof d.retiradaEl === 'string' ? d.retiradaEl : null,
      });
      setFallo(null);
    } catch { setFallo('No hemos podido leer el estado de tu app: revisa tu conexión.'); }
  }, [url]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  const valor = nombre ?? datos?.nombreSugerido ?? '';
  const validado = validarNombreApp(valor);
  // Solo se calcula con la app publicada: es una cuenta de microsegundos.
  const enlaceTienda = datos?.app?.urlTienda ?? null;
  const qr = enlaceTienda ? qrSvgMarkup(enlaceTienda, { etiqueta: 'Código QR de tu app en la App Store' }) : '';

  async function pedir() {
    if (!validado.ok) { setError(validado.error); return; }
    setEnviando(true); setError(null);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ nombreApp: validado.nombre }),
      });
      const d = (await res.json().catch(() => null)) as { error?: string; app?: AppDelEstudio } | null;
      // 201: pedida. 409: ya estaba pedida (otra pestaña): se enseña la que hay.
      if ((res.status === 201 || res.status === 409) && d?.app && esEstadoApp(d.app.estado)) {
        setDatos((a) => (a ? { ...a, app: d.app! } : a));
        return;
      }
      setError(d?.error ?? 'No hemos podido pedirla. Inténtalo de nuevo.');
    } catch {
      setError('No hemos podido pedirla: revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (fallo) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-[13px] font-medium text-destructive" data-testid="mi-app-fallo">{fallo}</p>
        <button type="button" className="text-[13px] font-medium underline underline-offset-2" onClick={() => void cargar()}>Volver a intentarlo</button>
      </div>
    );
  }
  if (!datos) return <p className="text-[13px] text-muted-foreground">Cargando…</p>;

  const { app } = datos;

  // ── Ya pedida: en qué punto va ──────────────────────────────────────────────
  if (app) {
    const t = textoDeEstado(app.estado);
    return (
      <div className="flex flex-col gap-3" data-testid="mi-app-estado" data-estado={app.estado}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            'rounded-full px-2.5 py-0.5 text-[12px] font-semibold',
            app.estado === 'PUBLICADA' ? 'bg-success/15 text-success' : app.estado === 'PAUSADA' ? 'bg-muted text-muted-foreground' : 'bg-brand/15 text-brand-medio',
          )}>{t.titulo}</span>
          <span className="text-[13px] text-foreground">«{app.nombreApp}»</span>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t.detalle}</p>
        {datos.retiradaEl && (
          <p role="alert" className="rounded-xl bg-warning/15 px-3 py-2 text-[13px] leading-relaxed text-foreground" data-testid="mi-app-margen">
            Tu plan ya no incluye la app. Si vuelves a {planesConApp().join(' o ')} antes del{' '}
            {new Date(datos.retiradaEl).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })}, todo sigue igual;
            si no, {app.estado === 'PUBLICADA' ? 'la retiramos de la App Store (quien ya la tenga podrá seguir usándola)' : 'dejamos de prepararla'}.{' '}
            <Link href="/suscripcion" className="font-medium underline underline-offset-2">Ver los planes</Link>
          </p>
        )}
        {app.estado === 'PUBLICADA' && app.urlTienda && (
          <div className="flex flex-wrap items-center gap-4">
            {qr && <div className="size-28 shrink-0 rounded-xl border border-border bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} data-testid="qr-tienda" />}
            <a href={app.urlTienda} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium underline underline-offset-2" data-testid="enlace-tienda">
              Ver en la App Store
            </a>
          </div>
        )}
      </div>
    );
  }

  // ── Ahora no puede pedirla ─────────────────────────────────────────────────
  if (datos.bloqueo) {
    const planes = planesConApp().join(' y ');
    const texto: Record<BloqueoPedirApp, string> = {
      plan: `Pedir la app con el nombre y el icono de tu estudio va incluido en ${planes}. Que salga en la App Store depende de la revisión de Apple.`,
      prueba: `Pedir la app con el nombre y el icono de tu estudio va incluido en ${planes}. Se pide con el plan ya pagado, no durante la prueba, y que salga en la App Store depende de la revisión de Apple.`,
      cobro: 'Hay un cobro de tu plan pendiente. Cuando se resuelva, podrás pedir aquí tu app.',
      'sin-plan': `Tu plan no está activo. La app con el nombre y el icono de tu estudio va incluida en ${planes}.`,
      sede: `Tu cadena tiene una sola app, con todas sus sedes dentro. Se pide desde ${datos.sedePrincipal ? `«${datos.sedePrincipal}»` : 'su sede principal'}.`,
    };
    return (
      <div className="flex flex-col gap-2" data-testid="mi-app-sin-plan" data-bloqueo={datos.bloqueo}>
        <p className="text-[13px] leading-relaxed text-foreground">{texto[datos.bloqueo]}</p>
        {datos.bloqueo !== 'sede' && (
          <Link href="/suscripcion" className="text-[13px] font-medium underline underline-offset-2">
            {datos.bloqueo === 'cobro' ? 'Ver mi suscripción' : 'Ver los planes'}
          </Link>
        )}
      </div>
    );
  }

  // ── Solo la propietaria la pide ─────────────────────────────────────────────
  if (!datos.esPropietaria) {
    return <p className="text-[13px] leading-relaxed text-muted-foreground" data-testid="mi-app-solo-propietaria">Solo la propietaria del estudio puede pedir la app.</p>;
  }

  // ── Pedirla ─────────────────────────────────────────────────────────────────
  const largo = [...valor.trim()].length > LETRAS_BAJO_EL_ICONO;
  // El motivo se ve en cuanto el botón se apaga, no solo al pulsarlo (con un «$» no decía por qué).
  const aviso = error ?? (valor.trim() && !validado.ok ? validado.error : null);
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void pedir(); }} data-testid="mi-app-pedir">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        La preparamos nosotros: se abre directa en tu estudio, con su icono y su color. Apple la revisa antes de publicarla y puede pedir cambios o no aprobarla.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-foreground">Nombre bajo el icono</span>
        <input
          className={inputCls} value={valor} maxLength={30} onChange={(e) => { setNombre(e.target.value); setError(null); }}
          data-testid="nombre-app-pedir" aria-describedby="ayuda-nombre-app"
        />
        <span id="ayuda-nombre-app" className="text-[12px] text-muted-foreground">
          {largo
            ? `En la pantalla de inicio caben unas ${LETRAS_BAJO_EL_ICONO} letras: este nombre se verá recortado.`
            : 'Es el que ve tu alumna en la pantalla de inicio de su móvil.'}
          {' '}En la App Store no puede haber dos apps con el mismo nombre: si ya está cogido, te escribimos para elegir otro.
        </span>
      </label>
      {aviso && <p role="alert" className="text-[13px] font-medium text-destructive">{aviso}</p>}
      <div>
        <button type="submit" className={btnPrimary} disabled={enviando || !validado.ok} data-testid="pedir-app">
          {enviando ? 'Pidiéndola…' : 'Pedir mi app'}
        </button>
      </div>
    </form>
  );
}
