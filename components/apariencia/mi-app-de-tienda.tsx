'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { authHeader } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { btnPrimary, inputCls } from '@/components/configuracion/estilos';
import { PLANES, PLAN_ENTITLEMENTS, PLAN_INFO } from '@/lib/billing/entitlements';
import { qrSvgMarkup } from '@/lib/qr-svg';
import {
  LETRAS_BAJO_EL_ICONO, esEstadoApp, textoDeEstado, validarNombreApp, type AppDelEstudio,
} from '@/lib/app-nativa/pedir-app';

// «Tu app en la App Store» (Apariencia de tu app, `APP_PROPIA_PEDIR`): pedir la app con el
// nombre y el icono del estudio y ver en qué punto va. Lo decide y lo guarda el SERVIDOR
// (`/api/estudio/app-movil`): aquí solo se pinta lo que contesta, nada optimista, y la puerta
// de plan y de rol se repiten en pantalla pero no son el límite.
//
// ⚠️ No promete plazos ni avisos: Apple decide cuándo revisa, y esta pantalla no manda ningún
// aviso al estudio (lo ve al volver aquí). Tampoco que Apple la vaya a aprobar.

interface Datos { planIncluye: boolean; esPropietaria: boolean; nombreSugerido: string; app: AppDelEstudio | null }

/** Los planes que la incluyen, leídos del catálogo (nunca una lista a mano). */
const planesConApp = () =>
  PLANES.filter((p) => PLAN_ENTITLEMENTS[p].features.appPropia).map((p) => PLAN_INFO[p].nombre);

export function MiAppDeTienda({ studioId }: { studioId: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState(false);
  const [nombre, setNombre] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/api/estudio/app-movil?estudio=${encodeURIComponent(studioId)}`;

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(url, { headers: await authHeader(), cache: 'no-store' });
      const d = (await res.json().catch(() => null)) as (Partial<Datos> & { app?: AppDelEstudio | null }) | null;
      if (!res.ok || !d || typeof d.planIncluye !== 'boolean') { setFallo(true); return; }
      setDatos({
        planIncluye: d.planIncluye, esPropietaria: d.esPropietaria === true,
        nombreSugerido: typeof d.nombreSugerido === 'string' ? d.nombreSugerido : '',
        app: d.app && esEstadoApp(d.app.estado) ? d.app : null,
      });
      setFallo(false);
    } catch { setFallo(true); }
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
        <p role="alert" className="text-[13px] font-medium text-destructive">No hemos podido leer el estado de tu app.</p>
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

  // ── Su plan no la incluye ───────────────────────────────────────────────────
  if (!datos.planIncluye) {
    return (
      <div className="flex flex-col gap-2" data-testid="mi-app-sin-plan">
        <p className="text-[13px] leading-relaxed text-foreground">
          La app con el nombre y el icono de tu estudio en la App Store va incluida en {planesConApp().join(' y ')}.
        </p>
        <Link href="/suscripcion" className="text-[13px] font-medium underline underline-offset-2">Ver los planes</Link>
      </div>
    );
  }

  // ── Solo la propietaria la pide ─────────────────────────────────────────────
  if (!datos.esPropietaria) {
    return <p className="text-[13px] leading-relaxed text-muted-foreground" data-testid="mi-app-solo-propietaria">Solo la propietaria del estudio puede pedir la app.</p>;
  }

  // ── Pedirla ─────────────────────────────────────────────────────────────────
  const largo = valor.trim().length > LETRAS_BAJO_EL_ICONO;
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
        </span>
      </label>
      {error && <p role="alert" className="text-[13px] font-medium text-destructive">{error}</p>}
      <div>
        <button type="submit" className={btnPrimary} disabled={enviando || !validado.ok} data-testid="pedir-app">
          {enviando ? 'Pidiéndola…' : 'Pedir mi app'}
        </button>
      </div>
    </form>
  );
}
