'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «El color de tu marca»: el cajón de su fila, en Configuración › Marca.
//
// Vivía en «Personalizar tu panel» (/configuracion/apariencia/panel), a una
// pantalla del logo. La misma lectura y la misma vista previa; al guardar se
// publican solo los dos colores.
//
// ⚠️ No es un color «del panel»: es el `primary`/`secondary` del tema PUBLICADO,
// el mismo que ven las alumnas en su app y en tu página de reservas. Un color
// solo del panel sería una segunda fuente para lo mismo, y a la primera
// divergencia el panel diría un color y el portal otro.
//
// ⚠️ Y hay que DISPARAR `tentare-theme-changed` al publicar: `PanelThemeProvider`
// lo escucha y repinta sin recargar. No hacerlo fue exactamente por qué la
// primera versión «no hacía nada» al guardar un color.
//
// 16-sep (v2): tenía su propio «Guardar colores» en línea, una de las TRES
// formas de guardar que convivían en Marca. Ahora es la `BarraGuardar` de todo
// el repo: el mismo botón, la misma guardia de salida y el mismo contrato de
// «Guardado» solo con la respuesta del servidor. El tema PUBLICADO lo lee la
// sección una sola vez y lo comparte con la fila del logo (seccion-marca.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { publicarThemeApi } from '@/lib/api-client';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import type { ThemeConfig } from '@/lib/theme-schema';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { btnSecondary, inputCls, labelCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';

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

function FormularioColorMarca({ publicado, onGuardado }: {
  publicado: ThemeConfig;
  onGuardado: (tema: ThemeConfig) => void;
}) {
  const [primary, setPrimary] = useState(publicado.primary);
  const [secondary, setSecondary] = useState(publicado.secondary);

  // Vista previa en vivo: el color se ve MIENTRAS se elige, no después de
  // guardar. Se pinta sobre el mismo nodo que usa `PanelThemeProvider`.
  useEffect(() => {
    if (!HEX.test(primary)) return;
    document.documentElement.style.setProperty('--brand', primary);
  }, [primary]);

  // Y si se sale sin guardar, se deshace: el proveedor vuelve a leer del
  // servidor. Sin esto, un color probado y descartado se quedaría puesto hasta
  // recargar, que es peor que no tener vista previa.
  const guardadoRef = useRef(false);
  useEffect(() => () => {
    if (!guardadoRef.current) {
      document.documentElement.style.removeProperty('--brand');
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
    }
  }, []);

  const cambiado = primary !== publicado.primary || secondary !== publicado.secondary;
  const validos = HEX.test(primary) && HEX.test(secondary);

  async function guardar(): Promise<string | null> {
    try {
      // ⚠️ Solo los dos colores. El servidor los publica encima de lo PUBLICADO
      // y los deja en el borrador sin tocar nada más: ni sale a producción lo
      // que el editor del portal dejara a medias, ni se pierde el favicon
      // (lib/theme-publicar-campos.ts). Antes se reescribía el borrador entero
      // desde lo publicado, y el favicon pendiente desaparecía.
      const res = await publicarThemeApi({ primary, secondary });
      if (!res.ok) return res.errores[0]?.mensaje ?? 'Ese color no tiene contraste suficiente para leerse encima.';
      guardadoRef.current = true;
      document.documentElement.style.removeProperty('--brand');
      // Esto es lo que repinta el panel entero al momento.
      window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
      onGuardado(res.theme);
      return null;
    } catch (e) {
      return mensajeSeguro((e as Error).message, ERROR_RED);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-wrap gap-5">
          <CampoColor label="Color principal" valor={primary} onChange={setPrimary} />
          <CampoColor label="Color secundario" valor={secondary} onChange={setSecondary} />
        </div>
        {!validos && (
          <p role="alert" className="text-sm text-destructive">Escríbelo como #RRGGBB: seis cifras, por ejemplo #7C3AED.</p>
        )}
      </div>
      <BarraGuardar
        seccion="marca"
        cambios={cambiado ? [tarjetaPorId('color-de-marca').titulo] : []}
        bloqueo={validos ? null : 'Uno de los dos colores no está escrito como #RRGGBB.'}
        onGuardar={guardar}
        onDescartar={() => { setPrimary(publicado.primary); setSecondary(publicado.secondary); }}
      />
    </>
  );
}

/**
 * El cajón. Sin el tema leído no se enseña ningún selector: uno con un color de
 * fábrica marcado afirmaría un color que a lo mejor no es el suyo.
 */
export function DetalleColorMarca({ publicado, cargando, onReintentar, onGuardado }: {
  publicado: ThemeConfig | null;
  cargando: boolean;
  onReintentar: () => void;
  onGuardado: (tema: ThemeConfig) => void;
}) {
  if (publicado) {
    return <FormularioColorMarca key={`${publicado.primary}-${publicado.secondary}`} publicado={publicado} onGuardado={onGuardado} />;
  }
  if (cargando) return <p role="status" className="pb-6 text-sm text-muted-foreground">Cargando tus colores…</p>;
  return (
    <div className="flex flex-col items-start gap-3 pb-6">
      <p role="alert" className="text-sm font-medium text-destructive text-pretty">
        No hemos podido leer tus colores.
      </p>
      <button type="button" onClick={onReintentar} className={btnSecondary}>Volver a intentarlo</button>
    </div>
  );
}
