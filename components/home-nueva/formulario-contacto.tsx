'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { LEGAL } from '@/lib/legal-info';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { CONTACTO } from './contenido';

// El formulario del diseño. Envía a /api/public/solicitar-demo (captcha invisible + trampa de bots, como el resto de formularios públicos).
// Si el servidor no puede enviar (sin clave de captcha o de correo en ese entorno), cae al `mailto:` de siempre: un formulario que nunca
// envía es peor que abrir el correo de quien escribe. Se lo pregunta al montarse; hasta que contesta, vale el `mailto:`.
export function FormularioContacto() {
  const f = CONTACTO.formulario;
  const { widget: captcha, pedirToken } = useCaptcha();
  const [estado, setEstado] = useState<'libre' | 'enviando' | 'enviado' | 'correo'>('libre');
  const [error, setError] = useState<string | null>(null);
  const [trampa, setTrampa] = useState('');
  const [servidor, setServidor] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch('/api/public/solicitar-demo', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { disponible?: boolean } | null) => { if (vivo) setServidor(d?.disponible === true); })
      .catch(() => { /* sin respuesta: se queda el correo del cliente */ });
    return () => { vivo = false; };
  }, []);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (estado === 'enviando') return;
    const d = new FormData(e.currentTarget);
    const v = (k: string) => String(d.get(k) ?? '').trim();
    if (!servidor) {
      const cuerpo = [`Nombre: ${v('nombre')}`, `Estudio: ${v('estudio')}`, `Correo: ${v('email')}`, `Tamaño del estudio: ${v('tamano')}`, '', v('mensaje')].join('\n');
      window.location.href = `mailto:${LEGAL.email}?subject=${encodeURIComponent('Quiero una demo de Tentare')}&body=${encodeURIComponent(cuerpo)}`;
      setEstado('correo');
      return;
    }
    // El estado de carga va ANTES del captcha: el token tarda segundos y sin esto el botón parece muerto y se pulsa dos veces.
    setError(null);
    setEstado('enviando');
    const token = await pedirToken().catch(() => null);
    if (token === null) { setError(ERROR_CAPTCHA); setEstado('libre'); return; }
    try {
      const res = await fetch('/api/public/solicitar-demo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: v('nombre'), estudio: v('estudio'), email: v('email'), tamano: v('tamano'), mensaje: v('mensaje'), captcha: token, [CAMPO_TRAMPA]: trampa }),
      });
      if (res.ok) { setEstado('enviado'); return; }
      const datos = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(datos?.error || f.errorEnvio);
      setEstado('libre');
    } catch {
      setError(f.errorRed);
      setEstado('libre');
    } finally {
      // Un token de Turnstile vale para una sola petición: el siguiente intento necesita otro.
      captchaGastado();
    }
  }

  if (estado === 'enviado') {
    return (
      <div className="lf-form" role="status">
        <h3>{f.enviadoTitulo}</h3>
        <p className="lf-form-nota">{f.enviadoTexto}</p>
      </div>
    );
  }
  return (
    <form className="lf-form" onSubmit={enviar} aria-labelledby="lf-form-t" aria-busy={estado === 'enviando'}>
      <h3 id="lf-form-t">{f.titulo}</h3>
      <div className="lf-form-fila">
        <label><span>{f.nombre.etiqueta}</span><input name="nombre" type="text" placeholder={f.nombre.marcador} autoComplete="name" maxLength={120} /></label>
        <label><span>{f.estudio.etiqueta}</span><input name="estudio" type="text" placeholder={f.estudio.marcador} autoComplete="organization" maxLength={120} /></label>
      </div>
      <div className="lf-form-fila">
        <label><span>{f.email.etiqueta}</span><input name="email" type="email" required placeholder={f.email.marcador} autoComplete="email" maxLength={200} /></label>
        <label className="lf-select">
          <span>{f.tamano.etiqueta}</span>
          <select name="tamano" defaultValue="">
            <option value="" disabled>{f.tamano.marcador}</option>
            {f.tamano.opciones.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
      </div>
      <label><span>{f.mensaje.etiqueta}</span><textarea name="mensaje" rows={4} placeholder={f.mensaje.marcador} maxLength={2000} /></label>
      {/* La trampa para bots: invisible, fuera del orden de tabulación y sin autorrelleno. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
        <label>Web<input type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" value={trampa} onChange={e => setTrampa(e.target.value)} /></label>
      </div>
      <button type="submit" className="lf-boton lf-boton--claro" disabled={estado === 'enviando'}>
        <span>{estado === 'enviando' ? f.enviando : f.enviar}</span>
        <span className="lf-boton-flecha" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.8} /></span>
      </button>
      {error && <p className="lf-form-nota lf-form-error" role="alert">{error}</p>}
      <p className="lf-form-nota" role="status">{estado === 'correo' ? f.aviso : f.nota}</p>
      {captcha}
    </form>
  );
}
