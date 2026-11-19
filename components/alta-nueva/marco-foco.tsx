'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El marco del «modo foco» (`ONBOARDING_NUEVO`): fondo oscuro, logo, la cabecera del paso encima y UNA tarjeta
// blanca debajo (hoja a pantalla completa en móvil). Lo usan la bienvenida del alta y «Tu primera clase».
// Las piezas del paso (piezas.tsx) teletransportan su cabecera al hueco de aquí (FocoContext).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { FocoContext, WhatsAppTexto } from './piezas';

/** Las reglas del modo foco: marco, tarjeta, cabecera, barra de abajo y movimiento. Solo se monta con el foco. */
export function EstilosFoco() {
  return (
    <style>{`
.ob-marco { position: relative; min-height: 100dvh; overflow: hidden; background: var(--t-ink-950); color: #fff; }
.ob-marco::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(60% 45% at 50% 0%, color-mix(in srgb, var(--t-blue-500) 16%, transparent), transparent 70%),
              radial-gradient(40% 35% at 88% 100%, color-mix(in srgb, var(--t-magenta-500) 10%, transparent), transparent 70%); }
.ob-col { position: relative; display: flex; min-height: 100dvh; flex-direction: column; align-items: center; padding: 28px 24px 24px; }
.ob-top { position: relative; display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; }
.ob-logo { display: block; width: auto; animation: ob-fundido .6s cubic-bezier(.25,.1,.25,1) both; }
.ob-salir { position: absolute; right: 0; top: 0; min-height: 44px; border-radius: 9999px; background: var(--t-ink-800); padding: 0 18px; font-size: 14px; font-weight: 500; color: #fff; }
.ob-salir:hover { background: var(--t-ink-700); }
.ob-cab { width: 100%; max-width: 640px; margin-top: 28px; text-align: center; --foreground: #fff; --muted-foreground: var(--t-ink-300); }
.ob-titulo { animation: ob-fundido .5s cubic-bezier(.25,.1,.25,1) both; }
.ob-barras { display: flex; justify-content: center; gap: 6px; }
.ob-barra { width: 28px; height: 4px; border-radius: 4px; background: rgb(255 255 255 / .18); transition: background .45s cubic-bezier(.25,.1,.25,1); }
.ob-barra[data-estado="hecho"] { background: #fff; }
.ob-barra[data-estado="ahora"] { background: linear-gradient(90deg, var(--t-blue-500), var(--t-magenta-500)); }
.ob-eyebrow { margin-top: 14px; font-size: 12.5px; font-weight: 500; letter-spacing: .05em; text-transform: uppercase; color: var(--t-ink-400); }
.ob-h1 { margin-top: 6px; font-size: 30px; line-height: 36px; font-weight: 600; letter-spacing: -.03em; color: #fff; outline: none; }
.ob-sub { margin: 8px auto 0; max-width: 48ch; font-size: 16px; line-height: 24px; color: var(--t-ink-300); }
.ob-mas-tarde { margin-top: 14px; border-radius: 9999px; background: rgb(255 255 255 / .1); padding: 7px 16px; font-size: 13.5px; font-weight: 500; color: #fff; }
.ob-mas-tarde:hover { background: rgb(255 255 255 / .16); }
.ob-hoja { position: relative; width: 100%; max-width: 560px; margin-top: 28px; border-radius: 24px; background: var(--t-paper); color: var(--t-ink-950);
  padding: 32px; box-shadow: 0 0 0 1px rgb(255 255 255 / .06), 0 30px 70px -24px rgb(0 0 0 / .7); animation: ob-paso .45s cubic-bezier(.32,.72,0,1) both; }
/* Los pasos pintan su vista previa en dos columnas: en el foco, una sola tarjeta y sin la vista previa. */
.ob-hoja > div.grid { display: block !important; }
.ob-hoja aside { display: none !important; }
/* La cabecera ya no está dentro de la tarjeta: lo primero del formulario no necesita el aire que le dejaba. */
.ob-hoja form > :first-child { margin-top: 0 !important; }
.ob-hoja [data-testid="vias"] { grid-template-columns: minmax(0, 1fr) !important; }
.ob-nav { display: flex; align-items: center; gap: 12px; margin-top: 24px; }
.ob-nav-der { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.ob-principal { display: inline-flex; height: 48px; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 0 22px; font-size: 15px; font-weight: 500; color: #fff;
  background: linear-gradient(180deg, var(--t-ink-900), var(--t-ink-950)); box-shadow: 0 1px 2px rgb(18 22 27 / .3), inset 0 1px 0 rgb(255 255 255 / .14); }
.ob-principal:hover:not(:disabled) { opacity: .9; }
.ob-secundario { height: 48px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--t-ink-900) 16%, white); background: #fff; padding: 0 18px; font-size: 15px; font-weight: 500; color: var(--t-ink-950); }
.ob-secundario:hover:not(:disabled) { background: color-mix(in srgb, var(--t-ink-900) 4%, white); }
.ob-atras { display: inline-flex; height: 44px; align-items: center; gap: 6px; border-radius: 9999px; padding: 0 10px; font-size: 14px; font-weight: 500; color: var(--t-ink-500); }
.ob-atras:hover:not(:disabled) { color: var(--t-ink-950); }
.ob-principal:disabled, .ob-secundario:disabled, .ob-atras:disabled { opacity: .6; }
.ob-pulsable { transition: transform .15s cubic-bezier(.25,.1,.25,1), background-color .15s, opacity .15s, color .15s; }
.ob-pulsable:active:not(:disabled) { transform: scale(.985); }
.ob-ayuda { margin-top: auto; padding-top: 28px; font-size: 13px; color: var(--t-ink-400); }
.ob-ayuda a { font-weight: 500; color: #fff; }
@keyframes ob-fundido { from { opacity: 0; } to { opacity: 1; } }
@keyframes ob-paso { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes ob-sube { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
@media (max-width: 640px) {
  .ob-col { align-items: stretch; padding: 0; }
  .ob-top { justify-content: flex-start; padding: max(24px, env(safe-area-inset-top)) 24px 0; }
  .ob-logo { height: 30px !important; }
  .ob-salir { right: 16px; top: max(20px, env(safe-area-inset-top)); min-height: 38px; padding: 0 14px; font-size: 13px; }
  .ob-cab { max-width: none; margin: 24px 0 auto; padding: 0 24px; }
  .ob-h1 { font-size: 26px; line-height: 32px; }
  .ob-sub { font-size: 15px; }
  .ob-hoja { max-width: none; margin-top: 24px; border-radius: 28px 28px 0 0; padding: 28px 24px calc(20px + env(safe-area-inset-bottom)); animation-name: ob-sube; }
  .ob-nav { position: sticky; bottom: 0; z-index: 10; margin-top: 20px; background: var(--t-paper); padding-top: 8px; }
  .ob-nav-der { flex: 1; }
  .ob-principal { height: 54px; flex: 1; border-radius: 14px; font-size: 16px; }
  .ob-secundario { height: 54px; border-radius: 14px; }
  .ob-ayuda { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ob-logo, .ob-titulo, .ob-hoja { animation: none; }
  .ob-barra, .ob-pulsable { transition: none; }
}
`}</style>
  );
}

export function MarcoFoco({ children, onSalir, salirDeshabilitado, textoSalir, nombreEstudio, claveHoja, etiqueta, dialogo }: {
  children: React.ReactNode;
  onSalir: () => void;
  salirDeshabilitado?: boolean;
  textoSalir: { corto: string; largo: string };
  nombreEstudio: string;
  /** Al cambiar, la tarjeta se remonta y entra deslizándose. */
  claveHoja: string;
  etiqueta: string;
  dialogo?: boolean;
}) {
  // El hueco encima de la tarjeta, donde las piezas del paso aterrizan su cabecera.
  const [hueco, setHueco] = useState<HTMLElement | null>(null);
  const valor = useMemo(() => ({ foco: true, hueco }), [hueco]);
  return (
    <FocoContext.Provider value={valor}>
      <EstilosFoco />
      <div className="ob-marco" data-screen={etiqueta} data-onboarding-nuevo="" role={dialogo ? 'dialog' : undefined} aria-modal={dialogo ? true : undefined} aria-label={dialogo ? etiqueta : undefined}>
        <div className="ob-col">
          <header className="ob-top">
            <LogoTentare formato="horizontal" tinta="blanco" alto={36} decorativo className="ob-logo" />
            <button type="button" onClick={onSalir} disabled={salirDeshabilitado} className="ob-salir ob-pulsable">
              <span className="sm:hidden">{textoSalir.corto}</span>
              <span className="hidden sm:inline">{textoSalir.largo}</span>
            </button>
          </header>
          <div ref={setHueco} className="ob-cab" />
          <main className="ob-hoja" key={claveHoja}>{children}</main>
          <WhatsAppTexto nombreEstudio={nombreEstudio} />
        </div>
      </div>
    </FocoContext.Provider>
  );
}
