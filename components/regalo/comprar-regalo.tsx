'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Check, Clock, Gift, Loader2, Lock, MailCheck } from 'lucide-react';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { EMAIL_VALIDO, MAX_MENSAJE, formatearEuros } from '@/lib/regalo/reglas';

interface Info {
  nombreEstudio: string; aLaVenta: boolean; importesEur: number[]; permiteImporteLibre: boolean;
  importeMinEur: number; importeMaxEur: number; caducidadMeses: number; terminos: string | null;
}

type Campo = 'libre' | 'destinatarioNombre' | 'destinatarioEmail' | 'compradorNombre' | 'compradorEmail';
const ID_CAMPO: Record<Campo, string> = {
  libre: 'rg-libre', destinatarioNombre: 'rg-para', destinatarioEmail: 'rg-para-mail',
  compradorNombre: 'rg-de', compradorEmail: 'rg-de-mail',
};

// Estilos propios de esta pantalla de marca blanca: todo sale de las `--portal-*` del estudio
// (nada de colores a mano) y las medidas viven aquí porque un `style` en línea no puede llevar
// media queries. Sin movimiento sin motivo: solo la cifra de la tarjeta «late» al cambiar y se
// apaga con «reducir movimiento».
const CSS = `
.rg{max-width:1040px;margin:0 auto;padding:20px 16px 0;color:var(--portal-ink);font-family:inherit}
.rg *{box-sizing:border-box}
.rg-volver{display:inline-flex;align-items:center;gap:6px;color:var(--portal-muted);font-size:14px;font-weight:700;text-decoration:none;min-height:44px}
.rg-volver:hover{color:var(--portal-ink)}
.rg-grid{display:grid;gap:22px;margin-top:4px}
.rg-h1{font-size:clamp(26px,5.4vw,36px);line-height:1.12;font-weight:800;letter-spacing:-.01em;margin:0 0 8px}
.rg-lead{color:var(--portal-muted);font-size:15.5px;line-height:1.55;margin:0}
.rg-card{position:relative;overflow:hidden;aspect-ratio:1.62/1;border-radius:22px;padding:clamp(16px,4.4vw,24px);display:flex;flex-direction:column;justify-content:space-between;
  color:var(--portal-brand-foreground);
  background:radial-gradient(120% 90% at 100% 0%,color-mix(in srgb,var(--portal-brand-foreground) 20%,transparent),transparent 58%),
    linear-gradient(150deg,var(--portal-brand),var(--portal-brand-secondary,var(--portal-brand)));
  box-shadow:0 18px 40px -18px color-mix(in srgb,var(--portal-brand) 65%,transparent),inset 0 0 0 1px color-mix(in srgb,var(--portal-brand-foreground) 18%,transparent)}
.rg-card::after{content:"";position:absolute;right:-40px;bottom:-60px;width:180px;height:180px;border-radius:50%;border:1.5px solid color-mix(in srgb,var(--portal-brand-foreground) 22%,transparent);pointer-events:none}
.rg-card-top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.rg-card-top span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rg-eti{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.78}
.rg-monto{display:block;font-size:clamp(40px,11vw,58px);line-height:1;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px;animation:rg-late .32s ease-out}
.rg-card-pie{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;font-size:13.5px;font-weight:700;position:relative;z-index:1}
.rg-card-pie small{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.75;margin-bottom:2px}
.rg-vacio{opacity:.55}
@keyframes rg-late{0%{transform:scale(.93);opacity:.45}100%{transform:none;opacity:1}}
.rg-nota{margin:14px 2px 0;padding:14px 16px;border-radius:16px;background:var(--portal-surface);border:1px solid var(--portal-line);font-size:14.5px;line-height:1.55}
.rg-nota q{quotes:none;font-style:italic;white-space:pre-wrap;overflow-wrap:anywhere}
.rg-nota small{display:block;margin-top:6px;color:var(--portal-muted);font-size:12.5px;font-weight:700}
.rg-paso{border:0;margin:0;padding:0;min-width:0}
.rg-paso+.rg-paso{margin-top:26px}
.rg-h2{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:800;margin:0 0 12px;padding:0}
.rg-n{flex:none;width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;
  background:var(--portal-surface);border:1.5px solid var(--portal-line);color:var(--portal-ink);transition:background .2s,color .2s,border-color .2s}
.rg-n[data-ok="true"]{background:var(--portal-brand);border-color:var(--portal-brand);color:var(--portal-brand-foreground)}
.rg-chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px}
.rg-chip{position:relative;min-height:60px;border-radius:16px;border:1.5px solid var(--portal-line);background:var(--portal-surface);color:var(--portal-ink);
  font:inherit;font-size:19px;font-weight:800;cursor:pointer;padding:8px;font-variant-numeric:tabular-nums;transition:border-color .15s,background .15s,transform .1s}
.rg-chip:hover{border-color:var(--portal-muted)}
.rg-chip:active{transform:scale(.98)}
.rg-chip[aria-pressed="true"]{border-color:var(--portal-brand);background:color-mix(in srgb,var(--portal-brand) 9%,var(--portal-surface));box-shadow:0 0 0 1px var(--portal-brand)}
.rg-chip[aria-pressed="true"]::after{content:"✓";position:absolute;top:5px;right:9px;font-size:12px;color:var(--portal-brand)}
.rg-chip-otro{font-size:15px}
.rg-libre{margin-top:12px;position:relative}
.rg-libre-eur{position:absolute;left:15px;bottom:13px;font-weight:800;color:var(--portal-muted);pointer-events:none}
.rg-libre .rg-in{padding-left:34px;font-weight:800;font-size:18px}
.rg-f{display:block;margin-top:14px}
.rg-dos>.rg-f:first-child{margin-top:0}
.rg-eti-f{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:13.5px;font-weight:700;margin:0 0 6px 2px}
.rg-eti-f em{font-style:normal;font-weight:600;font-size:12px;color:var(--portal-muted)}
.rg-in{width:100%;min-height:50px;padding:12px 14px;border-radius:14px;border:1.5px solid var(--portal-line);background:var(--portal-surface);color:var(--portal-ink);font:inherit;font-size:16px;transition:border-color .15s}
.rg-in:hover{border-color:var(--portal-muted)}
.rg-in[aria-invalid="true"]{border-color:var(--danger)}
textarea.rg-in{resize:vertical;min-height:96px;line-height:1.5}
.rg-err{display:flex;gap:6px;align-items:flex-start;margin:6px 2px 0;font-size:13px;font-weight:600;color:var(--danger)}
.rg-ayuda{margin:6px 2px 0;font-size:12.5px;color:var(--portal-muted)}
.rg-dos{display:grid;gap:0}
.rg button:focus-visible,.rg a:focus-visible,.rg .rg-in:focus-visible{outline:3px solid color-mix(in srgb,var(--portal-brand) 60%,transparent);outline-offset:2px}
.rg .rg-in:focus-visible{border-color:var(--portal-brand)}
.rg-barra{position:sticky;bottom:0;z-index:5;margin:22px -16px 0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--portal-bg);border-top:1px solid var(--portal-line);box-shadow:0 -10px 24px -16px color-mix(in srgb,var(--portal-ink) 35%,transparent)}
.rg-pagar{width:100%;min-height:54px;border:0;border-radius:var(--reservar-radio-boton,16px);background:var(--portal-brand);color:var(--portal-brand-foreground);
  font:inherit;font-size:17px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:9px;transition:filter .15s,transform .1s}
.rg-pagar:hover:not(:disabled){filter:brightness(1.07)}
.rg-pagar:active:not(:disabled){transform:scale(.99)}
.rg-pagar:disabled{opacity:.7;cursor:progress}
.rg-seguro{display:flex;gap:6px;align-items:center;justify-content:center;margin:9px 0 0;font-size:12.5px;color:var(--portal-muted)}
.rg-legal{margin:16px 2px 40px;font-size:12.5px;line-height:1.55;color:var(--portal-muted);white-space:pre-wrap}
.rg-aviso{display:flex;gap:10px;align-items:flex-start;margin:16px 0 0;padding:12px 14px;border-radius:14px;border:1.5px solid var(--danger);background:var(--portal-surface);font-size:14px;font-weight:600;color:var(--portal-ink)}
.rg-aviso svg{flex:none;color:var(--danger);margin-top:1px}
.rg-giro{animation:rg-gira .9s linear infinite}
@keyframes rg-gira{to{transform:rotate(360deg)}}
.rg-esq{border-radius:18px;background:linear-gradient(90deg,var(--portal-surface),color-mix(in srgb,var(--portal-line) 55%,var(--portal-surface)),var(--portal-surface));background-size:200% 100%;animation:rg-brilla 1.4s ease-in-out infinite}
@keyframes rg-brilla{0%{background-position:100% 0}100%{background-position:-100% 0}}
.rg-centro{max-width:520px;margin:0 auto;padding:40px 4px 56px;text-align:center}
.rg-sello{width:64px;height:64px;border-radius:50%;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;background:var(--portal-brand);color:var(--portal-brand-foreground)}
.rg-sello[data-t="espera"],.rg-sello[data-t="aviso"]{background:var(--portal-surface);color:var(--portal-ink);border:1.5px solid var(--portal-line)}
.rg-reintento{margin-top:14px;min-height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--portal-line);background:var(--portal-surface);color:var(--portal-ink);font:inherit;font-weight:700;cursor:pointer}
@media(min-width:900px){
  .rg{padding-top:32px}
  .rg-grid{grid-template-columns:minmax(0,440px) minmax(0,1fr);gap:56px;align-items:start}
  .rg-aside{position:sticky;top:28px}
  .rg-barra{position:static;margin:26px 0 0;padding:0;background:none;border:0;box-shadow:none}
  .rg-dos{grid-template-columns:1fr 1fr;gap:14px}
  .rg-dos .rg-f{margin-top:0}
}
@media(prefers-reduced-motion:reduce){.rg *{animation:none!important;transition:none!important}}
`;

// Compra pública de una tarjeta regalo: sin cuenta, sin registrarse. El importe se ELIGE aquí pero
// lo valida y fija el servidor; la tarjeta no existe hasta que Stripe confirma el cobro.
export function ComprarRegalo({ slug }: { slug: string }) {
  const { widget, pedirToken } = useCaptcha();
  const [info, setInfo] = useState<Info | null>(null);
  const [fallo, setFallo] = useState(false);
  const [importe, setImporte] = useState<number | null>(null);
  const [libre, setLibre] = useState('');
  const [verLibre, setVerLibre] = useState(false);
  const [f, setF] = useState({ compradorNombre: '', compradorEmail: '', destinatarioNombre: '', destinatarioEmail: '', mensaje: '' });
  const [trampa, setTrampa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [tocados, setTocados] = useState<Partial<Record<Campo, boolean>>>({});
  const [vuelta, setVuelta] = useState<{ estado: 'comprobando' | 'pagado' | 'pendiente' | 'revisar'; para?: string | null } | null>(null);
  const libreRef = useRef<HTMLInputElement>(null);

  const cargarInfo = useCallback(() => {
    setFallo(false);
    fetch(`/api/public/regalo/info?slug=${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Info) => { setInfo(j); setImporte(j.importesEur[1] ?? j.importesEur[0] ?? null); })
      .catch(() => setFallo(true));
  }, [slug]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos del servidor; el estado se actualiza al llegar la respuesta
  useEffect(() => { cargarInfo(); }, [cargarInfo]);

  // Vuelta de Stripe: se pregunta al servidor antes de decir «listo». Nada de éxito por la URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const sesion = p.get('session_id');
    if (p.get('gracias') !== '1' || !sesion) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- arranca la comprobación de la vuelta de Stripe
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

  const libreActivo = libre.trim() !== '';
  const importeFinal = libreActivo ? Number(libre) : importe;

  // Errores de campo, derivados: se enseñan al salir del campo o al intentar pagar.
  const errores: Partial<Record<Campo, string>> = {};
  if (info) {
    if (libreActivo && info.permiteImporteLibre && !info.importesEur.includes(Number(libre))
      && (Number(libre) < info.importeMinEur || Number(libre) > info.importeMaxEur)) {
      errores.libre = `Elige un importe entre ${info.importeMinEur} € y ${info.importeMaxEur} €.`;
    }
    if (!f.destinatarioNombre.trim()) errores.destinatarioNombre = 'Escribe el nombre de quien recibe el regalo.';
    if (!EMAIL_VALIDO.test(f.destinatarioEmail.trim())) errores.destinatarioEmail = 'Escribe un email válido para enviarle el regalo.';
    if (!f.compradorNombre.trim()) errores.compradorNombre = 'Escribe tu nombre.';
    if (!EMAIL_VALIDO.test(f.compradorEmail.trim())) errores.compradorEmail = 'Escribe tu email para enviarte el justificante.';
  }
  const verError = (c: Campo) => ((intentado || tocados[c]) ? errores[c] : undefined);
  const tocar = (c: Campo) => () => setTocados(t => ({ ...t, [c]: true }));
  const paso1 = !!importeFinal && !errores.libre;
  const paso2 = !errores.destinatarioNombre && !errores.destinatarioEmail;
  const paso3 = !errores.compradorNombre && !errores.compradorEmail;

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setIntentado(true); setError(null);
    const primero = (['libre', 'destinatarioNombre', 'destinatarioEmail', 'compradorNombre', 'compradorEmail'] as Campo[]).find(c => errores[c]);
    if (primero || !importeFinal) {
      if (!importeFinal) { setVerLibre(true); setError('Elige un importe para el regalo.'); return; }
      document.getElementById(ID_CAMPO[primero!])?.focus();
      return;
    }
    setEnviando(true); // carga ANTES de pedir el token: tarda segundos
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

  const volver = (
    <Link href={`/reservar/${slug}`} className="rg-volver">
      <ArrowLeft size={16} aria-hidden /> Volver a {info?.nombreEstudio ?? 'reservas'}
    </Link>
  );
  const envoltorio = (hijos: React.ReactNode, vivo = false) => (
    <main className="rg" aria-live={vivo ? 'polite' : undefined}><style>{CSS}</style>{hijos}</main>
  );

  if (vuelta) {
    const { estado } = vuelta;
    return envoltorio(
      <div className="rg-centro">
        <div className="rg-sello" data-t={estado === 'pagado' ? 'ok' : estado === 'revisar' ? 'aviso' : 'espera'} aria-hidden>
          {estado === 'pagado' ? <Check size={30} strokeWidth={2.5} />
            : estado === 'comprobando' ? <Loader2 size={28} className="rg-giro" />
            : estado === 'revisar' ? <AlertCircle size={28} /> : <Clock size={28} />}
        </div>
        {estado === 'comprobando' && <p style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Estamos comprobando tu pago…</p>}
        {estado === 'pagado' && (<>
          <h1 className="rg-h1">¡Regalo enviado!</h1>
          <p className="rg-lead">Hemos enviado la tarjeta{vuelta.para ? ` a ${vuelta.para}` : ''} por correo, y a ti te hemos mandado el justificante.</p>
        </>)}
        {estado === 'pendiente' && (<>
          <h1 className="rg-h1">Tu pago está en camino</h1>
          <p className="rg-lead">Todavía no nos ha llegado la confirmación. No vuelvas a pagar: en unos minutos recibirás el correo. Si no llega, escribe al estudio.</p>
        </>)}
        {estado === 'revisar' && (<>
          <h1 className="rg-h1">Revisaremos tu regalo</h1>
          <p className="rg-lead">Tu pago se ha recibido pero hay que revisar la tarjeta a mano. Escribe al estudio y lo resolverá.</p>
        </>)}
        <p style={{ marginTop: 22 }}>{volver}</p>
      </div>, true);
  }

  if (fallo) {
    return envoltorio(
      <div className="rg-centro">
        <div className="rg-sello" data-t="aviso" aria-hidden><AlertCircle size={28} /></div>
        <p role="alert" className="rg-lead" style={{ color: 'var(--portal-ink)', fontWeight: 700 }}>No hemos podido cargar esta página. Inténtalo de nuevo en un rato.</p>
        <button type="button" className="rg-reintento" onClick={cargarInfo}>Reintentar</button>
      </div>);
  }
  if (!info) {
    return envoltorio(
      <div role="status" aria-label="Cargando" className="rg-grid">
        <div className="rg-esq" style={{ aspectRatio: '1.62/1' }} />
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="rg-esq" style={{ height: 34, width: '70%' }} />
          <div className="rg-esq" style={{ height: 60 }} />
          <div className="rg-esq" style={{ height: 50 }} />
          <div className="rg-esq" style={{ height: 50 }} />
        </div>
      </div>);
  }
  if (!info.aLaVenta) {
    return envoltorio(
      <div className="rg-centro">
        <div className="rg-sello" data-t="aviso" aria-hidden><Gift size={28} /></div>
        <h1 className="rg-h1">Tarjeta regalo</h1>
        <p className="rg-lead">{info.nombreEstudio} no vende tarjetas regalo por internet por ahora. Pregúntales en el estudio.</p>
        <p style={{ marginTop: 22 }}>{volver}</p>
      </div>);
  }

  const meses = `${info.caducidadMeses} ${info.caducidadMeses === 1 ? 'mes' : 'meses'}`;
  const montoValido = !!importeFinal && !errores.libre;
  const para = f.destinatarioNombre.trim();
  const de = f.compradorNombre.trim();
  const mensaje = f.mensaje.trim();

  const campoErr = (c: Campo) => {
    const t = verError(c);
    return t ? <p id={`${ID_CAMPO[c]}-e`} role="alert" className="rg-err"><AlertCircle size={15} aria-hidden style={{ flex: 'none', marginTop: 1 }} />{t}</p> : null;
  };
  const props = (c: Campo) => ({
    id: ID_CAMPO[c], className: 'rg-in', 'aria-invalid': verError(c) ? true : undefined,
    'aria-describedby': verError(c) ? `${ID_CAMPO[c]}-e` : undefined, onBlur: tocar(c),
  });

  return envoltorio(<>
    <div>{volver}</div>
    <div className="rg-grid">
      <aside className="rg-aside">
        <h1 className="rg-h1">Regala una tarjeta de {info.nombreEstudio}</h1>
        <p className="rg-lead" style={{ marginBottom: 20 }}>
          La persona que elijas recibe un código por correo y gasta el saldo en varias veces. Válida {meses} desde la compra.
        </p>
        {/* Vista previa viva: lo que se escribe a la derecha aparece aquí. Solo decoración para quien
            lee con lector de pantalla (los campos ya dicen lo mismo). */}
        <div aria-hidden>
          <div className="rg-card">
            <div className="rg-card-top"><span>{info.nombreEstudio}</span><Gift size={20} /></div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <span className="rg-eti">Tarjeta regalo</span>
              <span className="rg-monto" key={montoValido ? importeFinal : 'x'}>{montoValido ? formatearEuros(importeFinal!) : '— €'}</span>
            </div>
            <div className="rg-card-pie">
              <div style={{ minWidth: 0 }}>
                <small>Para</small>
                <span className={para ? '' : 'rg-vacio'}>{para || 'Nombre de quien la recibe'}</span>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <small>Válida</small>{meses}
              </div>
            </div>
          </div>
          <div className="rg-nota">
            <q className={mensaje ? '' : 'rg-vacio'}>{mensaje || 'Tu mensaje aparecerá aquí.'}</q>
            <small>{de ? `— ${de}` : '— Tu nombre'}</small>
          </div>
        </div>
      </aside>

      <form onSubmit={pagar} noValidate>
        <fieldset className="rg-paso">
          <legend className="rg-h2"><span className="rg-n" data-ok={paso1} aria-hidden>{paso1 ? <Check size={14} strokeWidth={3} /> : 1}</span>Importe</legend>
          <div className="rg-chips" role="group" aria-label="Importes disponibles">
            {info.importesEur.map(v => (
              <button key={v} type="button" className="rg-chip" aria-pressed={!libreActivo && !verLibre && importe === v}
                onClick={() => { setImporte(v); setLibre(''); setVerLibre(false); }}>
                {formatearEuros(v)}
              </button>
            ))}
            {info.permiteImporteLibre && (
              <button type="button" className="rg-chip rg-chip-otro" aria-pressed={libreActivo || verLibre} aria-expanded={libreActivo || verLibre}
                onClick={() => { setVerLibre(true); setTimeout(() => libreRef.current?.focus(), 0); }}>
                Otro importe
              </button>
            )}
          </div>
          {info.permiteImporteLibre && (libreActivo || verLibre) && (
            <div className="rg-libre">
              <label className="rg-eti-f" htmlFor="rg-libre">Otro importe ({info.importeMinEur}–{info.importeMaxEur} €)</label>
              <span className="rg-libre-eur" aria-hidden>€</span>
              <input {...props('libre')} ref={libreRef} inputMode="numeric" pattern="[0-9]*" value={libre}
                onChange={e => setLibre(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="75" />
              {campoErr('libre')}
            </div>
          )}
        </fieldset>

        <fieldset className="rg-paso">
          <legend className="rg-h2"><span className="rg-n" data-ok={paso2} aria-hidden>{paso2 ? <Check size={14} strokeWidth={3} /> : 2}</span>Para quién y mensaje</legend>
          <div className="rg-dos">
            <div className="rg-f"><label className="rg-eti-f" htmlFor="rg-para">Para (nombre)</label>
              <input {...props('destinatarioNombre')} required maxLength={120} value={f.destinatarioNombre} onChange={e => setF({ ...f, destinatarioNombre: e.target.value })} autoComplete="off" placeholder="Por ejemplo, Bea" />
              {campoErr('destinatarioNombre')}</div>
            <div className="rg-f"><label className="rg-eti-f" htmlFor="rg-para-mail">Email de quien lo recibe</label>
              <input {...props('destinatarioEmail')} required type="email" maxLength={200} value={f.destinatarioEmail} onChange={e => setF({ ...f, destinatarioEmail: e.target.value })} autoComplete="off" placeholder="bea@correo.com" />
              {campoErr('destinatarioEmail')}</div>
          </div>
          <div className="rg-f"><label className="rg-eti-f" htmlFor="rg-msg">Mensaje (opcional)<em aria-live="off">{f.mensaje.length}/{MAX_MENSAJE}</em></label>
            <textarea id="rg-msg" className="rg-in" maxLength={MAX_MENSAJE} rows={3} value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} placeholder="Unas palabras para acompañar el regalo" /></div>
          <p className="rg-ayuda">Le enviaremos la tarjeta por correo en cuanto se confirme el pago.</p>
        </fieldset>

        <fieldset className="rg-paso">
          <legend className="rg-h2"><span className="rg-n" data-ok={paso3} aria-hidden>{paso3 ? <Check size={14} strokeWidth={3} /> : 3}</span>Tus datos</legend>
          <div className="rg-dos">
            <div className="rg-f"><label className="rg-eti-f" htmlFor="rg-de">De (tu nombre)</label>
              <input {...props('compradorNombre')} required maxLength={120} value={f.compradorNombre} onChange={e => setF({ ...f, compradorNombre: e.target.value })} autoComplete="name" />
              {campoErr('compradorNombre')}</div>
            <div className="rg-f"><label className="rg-eti-f" htmlFor="rg-de-mail">Tu email (te enviamos el justificante)</label>
              <input {...props('compradorEmail')} required type="email" maxLength={200} value={f.compradorEmail} onChange={e => setF({ ...f, compradorEmail: e.target.value })} autoComplete="email" />
              {campoErr('compradorEmail')}</div>
          </div>
        </fieldset>

        {/* Trampa para bots: invisible para personas, no se rellena a propósito. */}
        <div aria-hidden style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}>
          <label>Web<input tabIndex={-1} autoComplete="off" value={trampa} onChange={e => setTrampa(e.target.value)} name={CAMPO_TRAMPA} /></label>
        </div>
        {widget}
        {error && <p role="alert" className="rg-aviso"><AlertCircle size={18} aria-hidden />{error}</p>}

        <div className="rg-barra">
          <button type="submit" className="rg-pagar" disabled={enviando} aria-busy={enviando}>
            {enviando
              ? <><Loader2 size={18} className="rg-giro" aria-hidden />Un momento…</>
              : <><Lock size={17} aria-hidden />{`Pagar ${montoValido ? formatearEuros(importeFinal!) : ''}`}</>}
          </button>
          <p className="rg-seguro"><MailCheck size={14} aria-hidden />Pagas en la página segura de Stripe. No necesitas cuenta.</p>
        </div>
        <p className="rg-legal">
          {info.terminos ?? 'El saldo no se canjea por dinero. Tras la fecha de caducidad la tarjeta deja de poder usarse.'}
        </p>
      </form>
    </div>
  </>);
}
