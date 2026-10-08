'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { MAX_MENSAJE, formatearEuros } from '@/lib/regalo/reglas';

interface Info {
  nombreEstudio: string; aLaVenta: boolean; importesEur: number[]; permiteImporteLibre: boolean;
  importeMinEur: number; importeMaxEur: number; caducidadMeses: number; terminos: string | null;
}

const campo: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--portal-line)',
  background: 'var(--portal-surface)', color: 'var(--portal-ink)', fontSize: 16, fontFamily: 'inherit',
};
const etiqueta: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--portal-ink)', margin: '0 0 6px 2px' };

// Compra pública de una tarjeta regalo: sin cuenta, sin registrarse. El importe se ELIGE aquí pero
// lo valida y fija el servidor; la tarjeta no existe hasta que Stripe confirma el cobro.
export function ComprarRegalo({ slug }: { slug: string }) {
  const { widget, pedirToken } = useCaptcha();
  const [info, setInfo] = useState<Info | null>(null);
  const [fallo, setFallo] = useState(false);
  const [importe, setImporte] = useState<number | null>(null);
  const [libre, setLibre] = useState('');
  const [f, setF] = useState({ compradorNombre: '', compradorEmail: '', destinatarioNombre: '', destinatarioEmail: '', mensaje: '' });
  const [trampa, setTrampa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState<{ estado: 'comprobando' | 'pagado' | 'pendiente' | 'revisar'; para?: string | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/public/regalo/info?slug=${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Info) => { if (vivo) { setInfo(j); setImporte(j.importesEur[1] ?? j.importesEur[0] ?? null); } })
      .catch(() => { if (vivo) setFallo(true); });
    return () => { vivo = false; };
  }, [slug]);

  // Vuelta de Stripe: se pregunta al servidor antes de decir «listo». Nada de éxito por la URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sesion = p.get('session_id');
    if (p.get('gracias') !== '1' || !sesion) return;
    let vivo = true;
    setVuelta({ estado: 'comprobando' });
    (async () => {
      for (let i = 0; i < 6 && vivo; i++) {
        try {
          const r = await fetch(`/api/public/regalo/estado?slug=${encodeURIComponent(slug)}&session_id=${encodeURIComponent(sesion)}`);
          const j = (await r.json().catch(() => ({}))) as { estado?: 'pagado' | 'pendiente' | 'revisar'; destinatarioNombre?: string | null };
          if (r.ok && j.estado === 'pagado') { if (vivo) setVuelta({ estado: 'pagado', para: j.destinatarioNombre }); return; }
          if (r.ok && j.estado === 'revisar') { if (vivo) setVuelta({ estado: 'revisar' }); return; }
        } catch { /* se reintenta */ }
        await new Promise(res => setTimeout(res, 2000));
      }
      if (vivo) setVuelta({ estado: 'pendiente' });
    })();
    return () => { vivo = false; };
  }, [slug]);

  const importeFinal = libre.trim() !== '' ? Number(libre) : importe;

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(null); // carga ANTES de pedir el token: tarda segundos
    try {
      const token = await pedirToken();
      if (token === null) { setError(ERROR_CAPTCHA); return; }
      const r = await fetch('/api/public/regalo/comprar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, importeEur: importeFinal, ...f, captchaToken: token, [CAMPO_TRAMPA]: trampa }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string | null; error?: string };
      if (!r.ok || !j.url) { setError(j.error ?? 'No hemos podido abrir el pago. Inténtalo de nuevo.'); return; }
      window.location.assign(j.url);
    } catch { setError('No hemos podido abrir el pago. Revisa tu conexión e inténtalo de nuevo.'); }
    finally { setEnviando(false); }
  }

  const caja: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '24px 16px 56px' };
  const volver = <Link href={`/reservar/${slug}`} style={{ color: 'var(--portal-muted)', fontSize: 14, fontWeight: 700 }}>← Volver a {info?.nombreEstudio ?? 'reservas'}</Link>;

  if (vuelta) {
    return (
      <main style={caja} aria-live="polite">
        {vuelta.estado === 'comprobando' && <p>Estamos comprobando tu pago…</p>}
        {vuelta.estado === 'pagado' && (<>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>¡Regalo enviado!</h1>
          <p>Hemos enviado la tarjeta{vuelta.para ? ` a ${vuelta.para}` : ''} por correo, y a ti te hemos mandado el justificante.</p>
        </>)}
        {vuelta.estado === 'pendiente' && (<>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>Tu pago está en camino</h1>
          <p>Todavía no nos ha llegado la confirmación. No vuelvas a pagar: en unos minutos recibirás el correo. Si no llega, escribe al estudio.</p>
        </>)}
        {vuelta.estado === 'revisar' && (<>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>Revisaremos tu regalo</h1>
          <p>Tu pago se ha recibido pero hay que revisar la tarjeta a mano. Escribe al estudio y lo resolverá.</p>
        </>)}
        <p style={{ marginTop: 20 }}>{volver}</p>
      </main>
    );
  }

  if (fallo) return <main style={caja}><p role="alert">No hemos podido cargar esta página. Inténtalo de nuevo en un rato.</p></main>;
  if (!info) return <main style={caja}><p>Cargando…</p></main>;
  if (!info.aLaVenta) {
    return (<main style={caja}>
      <h1 style={{ fontSize: 26, fontWeight: 800 }}>Tarjeta regalo</h1>
      <p>{info.nombreEstudio} no vende tarjetas regalo por internet por ahora. Pregúntales en el estudio.</p>
      <p style={{ marginTop: 20 }}>{volver}</p>
    </main>);
  }

  return (
    <main style={caja}>
      <p style={{ margin: '0 0 16px' }}>{volver}</p>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 6px' }}>Regala una tarjeta de {info.nombreEstudio}</h1>
      <p style={{ color: 'var(--portal-muted)', margin: '0 0 22px' }}>
        La persona que elijas recibe un código por correo y gasta el saldo en varias veces. Válida {info.caducidadMeses} {info.caducidadMeses === 1 ? 'mes' : 'meses'} desde la compra.
      </p>
      <form onSubmit={pagar} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={etiqueta}>Importe</legend>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {info.importesEur.map(v => (
              <button key={v} type="button" aria-pressed={libre.trim() === '' && importe === v}
                onClick={() => { setImporte(v); setLibre(''); }}
                style={{ ...campo, width: 'auto', fontWeight: 800, cursor: 'pointer',
                  borderColor: libre.trim() === '' && importe === v ? 'var(--portal-brand)' : 'var(--portal-line)',
                  outline: libre.trim() === '' && importe === v ? '2px solid var(--portal-brand)' : 'none' }}>
                {formatearEuros(v)}
              </button>
            ))}
          </div>
          {info.permiteImporteLibre && (
            <div style={{ marginTop: 10 }}>
              <label style={etiqueta} htmlFor="rg-libre">Otro importe ({info.importeMinEur}–{info.importeMaxEur} €)</label>
              <input id="rg-libre" inputMode="numeric" pattern="[0-9]*" style={campo} value={libre}
                onChange={e => setLibre(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Por ejemplo, 75" />
            </div>
          )}
        </fieldset>

        <div><label style={etiqueta} htmlFor="rg-para">Para (nombre)</label>
          <input id="rg-para" required maxLength={120} style={campo} value={f.destinatarioNombre} onChange={e => setF({ ...f, destinatarioNombre: e.target.value })} autoComplete="off" /></div>
        <div><label style={etiqueta} htmlFor="rg-para-mail">Email de quien lo recibe</label>
          <input id="rg-para-mail" required type="email" maxLength={200} style={campo} value={f.destinatarioEmail} onChange={e => setF({ ...f, destinatarioEmail: e.target.value })} autoComplete="off" /></div>
        <div><label style={etiqueta} htmlFor="rg-msg">Mensaje (opcional)</label>
          <textarea id="rg-msg" maxLength={MAX_MENSAJE} rows={3} style={{ ...campo, resize: 'vertical' }} value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} /></div>
        <div><label style={etiqueta} htmlFor="rg-de">De (tu nombre)</label>
          <input id="rg-de" required maxLength={120} style={campo} value={f.compradorNombre} onChange={e => setF({ ...f, compradorNombre: e.target.value })} autoComplete="name" /></div>
        <div><label style={etiqueta} htmlFor="rg-de-mail">Tu email (te enviamos el justificante)</label>
          <input id="rg-de-mail" required type="email" maxLength={200} style={campo} value={f.compradorEmail} onChange={e => setF({ ...f, compradorEmail: e.target.value })} autoComplete="email" /></div>

        {/* Trampa para bots: invisible para personas, no se rellena a propósito. */}
        <div aria-hidden style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
          <label>Web<input tabIndex={-1} autoComplete="off" value={trampa} onChange={e => setTrampa(e.target.value)} name={CAMPO_TRAMPA} /></label>
        </div>
        {widget}
        {error && <p role="alert" style={{ color: 'var(--danger, #b00020)', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={enviando || !importeFinal}
          style={{ padding: '14px 18px', borderRadius: 'var(--reservar-radio-boton, 14px)', border: 0, fontWeight: 800, fontSize: 16, cursor: 'pointer',
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', opacity: enviando || !importeFinal ? 0.6 : 1 }}>
          {enviando ? 'Un momento…' : `Pagar ${importeFinal ? formatearEuros(importeFinal) : ''}`}
        </button>
        <p style={{ fontSize: 12, color: 'var(--portal-muted)', margin: 0 }}>
          {info.terminos ?? 'El saldo no se canjea por dinero. Tras la fecha de caducidad la tarjeta deja de poder usarse.'}
        </p>
      </form>
    </main>
  );
}
