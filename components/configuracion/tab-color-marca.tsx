'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «El color de tu marca», en Configuración › Marca.
//
// Vivía en «Personalizar tu panel» (/configuracion/apariencia/panel), a una
// pantalla del logo. Se trae tal cual: la misma lectura, la misma vista previa y
// el mismo guardado.
//
// ⚠️ No es un color «del panel»: es el `primary`/`secondary` del tema PUBLICADO,
// el mismo que ven las alumnas en su app y en tu página de reservas. Un color
// solo del panel sería una segunda fuente para lo mismo, y a la primera
// divergencia el panel diría un color y el portal otro.
//
// ⚠️ Y hay que DISPARAR `tentare-theme-changed` al publicar: `PanelThemeProvider`
// lo escucha y repinta sin recargar. No hacerlo fue exactamente por qué la
// primera versión «no hacía nada» al guardar un color.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchThemePublicado, guardarThemeBorrador, publicarThemeApi } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ThemeConfig } from '@/lib/theme-schema';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

const HEX = /^#[0-9a-fA-F]{6}$/;

function CampoColor({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  const valido = HEX.test(valor);
  return (
    <div className="flex items-end gap-3">
      <input
        type="color"
        aria-label={label}
        value={valido ? valor : '#000000'}
        onChange={e => onChange(e.target.value)}
        className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-input bg-card p-1"
      />
      <div className="min-w-0">
        <p className={labelCls}>{label}</p>
        <input
          type="text"
          aria-label={`${label} en hexadecimal`}
          aria-invalid={!valido}
          value={valor}
          onChange={e => onChange(e.target.value.trim())}
          spellCheck={false}
          autoComplete="off"
          className={cn(inputCls, 'w-32 font-mono', !valido && 'border-destructive')}
        />
      </div>
    </div>
  );
}

export function TabColorMarca({ showToast }: { showToast: (m: string) => void }) {
  const [publicado, setPublicado] = useState<ThemeConfig | null>(null);
  const [sinLeer, setSinLeer] = useState(false);
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [guardandoColor, setGuardandoColor] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchThemePublicado()
      .then(t => { if (!vivo) return; setPublicado(t); setPrimary(t.primary); setSecondary(t.secondary); })
      .catch(() => { if (vivo) setSinLeer(true); });
    return () => { vivo = false; };
  }, []);

  // Vista previa en vivo: el color se ve MIENTRAS se elige, no después de
  // guardar. Se pinta sobre el mismo nodo que usa `PanelThemeProvider`.
  useEffect(() => {
    if (!HEX.test(primary)) return;
    document.documentElement.style.setProperty('--brand', primary);
  }, [primary]);

  // Y si se sale sin guardar, se deshace: el proveedor vuelve a leer del
  // servidor. Sin esto, un color probado y descartado se quedaría puesto hasta
  // recargar, que es peor que no tener vista previa.
  const publicadoRef = useRef<ThemeConfig | null>(null);
  // En su propio efecto: el compilador de React rechaza escribir un ref
  // durante el render, y con razón.
  useEffect(() => { publicadoRef.current = publicado; }, [publicado]);
  const guardadoRef = useRef(false);
  useEffect(() => () => {
    if (!guardadoRef.current) {
      document.documentElement.style.removeProperty('--brand');
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
    }
  }, []);

  const colorCambiado = Boolean(publicado)
    && (primary !== publicado?.primary || secondary !== publicado?.secondary);
  const validos = HEX.test(primary) && HEX.test(secondary);

  const guardarColor = useCallback(async () => {
    const base = publicadoRef.current;
    if (!base || !HEX.test(primary) || !HEX.test(secondary)) return;
    setGuardandoColor(true);
    try {
      // ⚠️ El parche se construye sobre lo PUBLICADO, no sobre el borrador.
      // `guardarBorradorTheme` fusiona sobre el borrador actual, así que un
      // borrador a medias del editor antiguo se habría publicado sin que nadie
      // lo pidiera. Así, publicar es «lo que ya se ve» + estos dos colores.
      await guardarThemeBorrador({ ...base, primary, secondary });
      const res = await publicarThemeApi();
      if (!res.ok) {
        showToast(res.errores[0]?.mensaje ?? 'Ese color no tiene contraste suficiente para leerse encima.');
        return;
      }
      setPublicado(res.theme);
      guardadoRef.current = true;
      document.documentElement.style.removeProperty('--brand');
      // Esto es lo que repinta el panel entero al momento.
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
      showToast('Colores aplicados');
    } catch (e) {
      showToast(mensajeSeguro((e as Error).message, ERROR_RED));
    } finally {
      setGuardandoColor(false);
    }
  }, [primary, secondary, showToast]);

  return (
    <TarjetaAjuste id="color-de-marca">
      {sinLeer ? (
        <p role="alert" className="text-sm text-destructive">
          No hemos podido leer tus colores. Recarga la página para intentarlo de nuevo.
        </p>
      ) : !publicado ? (
        <p className="text-sm text-muted-foreground">Cargando tus colores…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-5">
            <CampoColor label="Color principal" valor={primary} onChange={setPrimary} />
            <CampoColor label="Color secundario" valor={secondary} onChange={setSecondary} />
          </div>
          {!validos && (
            <p className="text-sm text-destructive">Escríbelo como #RRGGBB: seis cifras, por ejemplo #7C3AED.</p>
          )}
          {/* Los botones solo con algo que guardar: un «Guardar» gris en reposo
              parecía roto. */}
          {colorCambiado && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={guardarColor} disabled={guardandoColor || !validos} className={btnPrimary}>
                {guardandoColor ? 'Guardando…' : 'Guardar colores'}
              </button>
              <button
                type="button"
                onClick={() => { setPrimary(publicado.primary); setSecondary(publicado.secondary); }}
                disabled={guardandoColor}
                className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}
              >
                <RotateCcw size={14} aria-hidden /> Descartar
              </button>
            </div>
          )}
        </div>
      )}
    </TarjetaAjuste>
  );
}
