'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  cuerpoPaginaPublica, formularioPaginaPublica, hayCambiosPaginaPublica, textoGuardadoPaginaPublica,
  type EstadoPaginaPublica, type FormPaginaPublica,
} from '@/lib/configuracion/pagina-publica';
import { guardarPaginaPublica, leerPaginaPublica } from '@/lib/pagina-publica-cliente';

// Visibilidad de la página pública del estudio, dentro de los ajustes del tema.
//
// ⚠️ El editor de apariencia está EN MANTENIMIENTO (2026-09-07) y nadie llega
// aquí: desde el 16-sep el ajuste vive en Configuración → Mi app y mi web
// («Ocultar tu página», components/configuracion/pagina-publica.tsx). Los dos
// comparten la lógica (lib/configuracion/pagina-publica.ts) y las llamadas
// (lib/pagina-publica-cliente.ts); no se borra por si el editor vuelve.
//
// ⚠️ **Este panel NO pasa por Publicar y lo dice en pantalla.** Todo lo demás
// de esta columna es borrador hasta que se publica; esto tiene efecto al
// momento, porque «esconde mi página» es un interruptor y esperar a publicar
// sería justo lo contrario de lo que se pide al pulsarlo.
//
// Por eso tiene su propio Guardar en vez de autoguardarse: escribir media
// clave y que se guarde sola dejaría fuera a quien tenga el enlace.

export function PanelVisibilidad() {
  const [servidor, setServidor] = useState<EstadoPaginaPublica | null>(null);
  const [form, setForm] = useState<FormPaginaPublica>({ oculta: false, clave: '', quitarClave: false });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    // Sin respuesta, el panel se queda sin poder guardar: no se afirma nada.
    void leerPaginaPublica().then((data) => {
      if (!vivo || !data) return;
      setServidor(data);
      setForm(formularioPaginaPublica(data));
    });
    return () => { vivo = false; };
  }, []);

  async function guardar() {
    if (!servidor) return;
    setGuardando(true);
    setAviso(null);
    // Se comprueba la respuesta ANTES de decir que ha ido bien: anunciar
    // éxito con el servidor diciendo que no es el bug más repetido de este
    // repo, y aquí significaría creer que tu página está escondida cuando no.
    const res = await guardarPaginaPublica(cuerpoPaginaPublica(form), servidor);
    setGuardando(false);
    if (!res.ok) {
      setAviso({ tipo: 'error', texto: res.error });
      return;
    }
    setServidor(res.estado);
    setForm(formularioPaginaPublica(res.estado));
    setAviso({ tipo: 'ok', texto: textoGuardadoPaginaPublica(res.estado, servidor) });
  }

  const hayCambios = servidor !== null && hayCambiosPaginaPublica(form, servidor);
  const { oculta, clave, quitarClave } = form;

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground leading-snug">
        Esconde tu página de reservas mientras la preparas. <strong className="font-semibold text-foreground">Se aplica al momento</strong>, sin publicar.
      </p>

      <div className="space-y-1.5">
        {([
          { valor: false, Icono: Eye, titulo: 'Visible', ayuda: 'Cualquiera con el enlace puede reservar.' },
          { valor: true, Icono: EyeOff, titulo: 'Oculta', ayuda: 'Nadie la ve ni reserva desde fuera, y Google no la indexa.' },
        ] as const).map(({ valor, Icono, titulo, ayuda }) => (
          <button
            key={String(valor)}
            type="button"
            onClick={() => setForm((f) => ({ ...f, oculta: valor }))}
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
              onChange={(e) => { const valor = e.target.value; setForm((f) => ({ ...f, clave: valor, quitarClave: false })); }}
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
              <input
                type="checkbox"
                checked={quitarClave}
                onChange={(e) => { const marcado = e.target.checked; setForm((f) => ({ ...f, quitarClave: marcado, clave: marcado ? '' : f.clave })); }}
              />
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
