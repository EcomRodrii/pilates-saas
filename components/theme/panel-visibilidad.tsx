'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

// Visibilidad de la página pública del estudio, dentro de los ajustes del tema.
//
// ⚠️ **Este panel NO pasa por Publicar y lo dice en pantalla.** Todo lo demás
// de esta columna es borrador hasta que se publica; esto tiene efecto al
// momento, porque «esconde mi página» es un interruptor y esperar a publicar
// sería justo lo contrario de lo que se pide al pulsarlo. Vive aquí de todos
// modos porque es donde se busca —junto a lo demás de la cara pública— y no
// perdido en Configuración.
//
// Por eso tiene su propio Guardar en vez de autoguardarse: escribir media
// clave y que se guarde sola dejaría fuera a quien tenga el enlace.

interface Estado {
  oculta: boolean;
  tieneClave: boolean;
}

export function PanelVisibilidad() {
  const [servidor, setServidor] = useState<Estado | null>(null);
  const [oculta, setOculta] = useState(false);
  const [clave, setClave] = useState('');
  // `null` = no se toca la clave guardada. Se separa del texto para poder
  // distinguir «no he escrito nada» de «quiero quitarla».
  const [quitarClave, setQuitarClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/pagina-publica', { headers: await authHeader() });
        if (!res.ok) return;
        const data = await res.json() as Estado;
        if (!vivo) return;
        setServidor(data);
        setOculta(data.oculta);
      } catch { /* el panel se queda en su estado inicial; el Guardar lo dirá */ }
    })();
    return () => { vivo = false; };
  }, []);

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      const cuerpo: { oculta: boolean; clave?: string } = { oculta };
      if (quitarClave) cuerpo.clave = '';
      else if (clave.trim()) cuerpo.clave = clave.trim();

      const res = await fetch('/api/pagina-publica', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(cuerpo),
      });
      // Se comprueba la respuesta ANTES de decir que ha ido bien: anunciar
      // éxito con el servidor diciendo que no es el bug más repetido de este
      // repo, y aquí significaría creer que tu página está escondida cuando no.
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) {
        setAviso({ tipo: 'error', texto: data?.error ?? 'No se ha podido guardar.' });
        return;
      }
      setServidor({ oculta, tieneClave: quitarClave ? false : (clave.trim() ? true : (servidor?.tieneClave ?? false)) });
      setClave('');
      setQuitarClave(false);
      setAviso({ tipo: 'ok', texto: oculta ? 'Tu página ya no se ve.' : 'Tu página vuelve a estar visible.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setGuardando(false);
    }
  }

  const hayCambios = servidor !== null
    && (oculta !== servidor.oculta || clave.trim().length > 0 || quitarClave);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground leading-snug">
        Esconde tu página de reservas mientras la preparas. <strong className="font-semibold text-foreground">Se aplica al momento</strong>, sin publicar.
      </p>

      <div className="space-y-1.5">
        {([
          { valor: false, Icono: Eye, titulo: 'Visible', ayuda: 'Cualquiera con el enlace puede reservar.' },
          { valor: true, Icono: EyeOff, titulo: 'Oculta', ayuda: 'Nadie la ve y Google no la indexa.' },
        ] as const).map(({ valor, Icono, titulo, ayuda }) => (
          <button
            key={String(valor)}
            type="button"
            onClick={() => setOculta(valor)}
            aria-pressed={oculta === valor}
            className={`w-full flex items-start gap-2.5 text-left px-3 py-2.5 rounded-xl border ${
              oculta === valor ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted'
            }`}
          >
            <Icono size={15} className="flex-none mt-0.5 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-foreground">{titulo}</span>
              <span className="block text-[11.5px] text-muted-foreground leading-snug">{ayuda}</span>
            </span>
          </button>
        ))}
      </div>

      {oculta && (
        <div className="space-y-2 border-t border-border pt-3">
          <label className="block space-y-1">
            <span className="text-[13px] font-medium text-foreground">
              {servidor?.tieneClave ? 'Cambiar la clave' : 'Clave para dejar entrar (opcional)'}
            </span>
            <input
              type="password"
              value={clave}
              onChange={(e) => { setClave(e.target.value); setQuitarClave(false); }}
              autoComplete="new-password"
              placeholder={servidor?.tieneClave ? '••••••' : 'Mínimo 6 caracteres'}
              className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
            />
          </label>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Con clave puedes enseñársela a quien quieras. Sin clave no entra nadie.
          </p>
          {servidor?.tieneClave && (
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <input type="checkbox" checked={quitarClave} onChange={(e) => { setQuitarClave(e.target.checked); if (e.target.checked) setClave(''); }} />
              Quitar la clave
            </label>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={!hayCambios || guardando}
          className="text-[13px] font-semibold px-3 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Aplicar'}
        </button>
        {aviso && (
          <p className={`text-[12px] ${aviso.tipo === 'ok' ? 'text-success' : 'text-destructive'}`} role="status">{aviso.texto}</p>
        )}
      </div>
    </div>
  );
}
