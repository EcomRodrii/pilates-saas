'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu estudio está listo»: el momento ¡wow! del alta.
//
// Qué se ve, y SOLO lo que es verdad:
//   · SU app: su nombre, su logo, su color y las clases que acaba de crear.
//   · El siguiente paso más valioso resuelto con UN gesto: traer a sus alumnas
//     (subir el archivo de su programa o de Excel → /migracion, con su plan
//     previo y su «deshacer»; o añadir una a mano → /clientas). Antes de esto, 5
//     de 7 altas se quedaban con cero alumnas y no volvían.
//   · La guía rápida con su progreso REAL (lib/onboarding.ts → guiaRapida).
//   · Su enlace de reservas, para copiar, y su QR descargable (el mismo que
//     Configuración → Estudio).
//
// La celebración es sobria a propósito: un check que entra y se asienta, sin
// sonido, sin confeti y sin mascota (Tenti tiene sus sitios en
// lib/tenti/momentos.ts y este no es uno). Con «reducir movimiento» no hay
// animación. La pantalla no sella el alta hasta que se sale por cualquiera de
// sus botones, así que recargar aquí no pierde nada.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowRight, CheckCircle2, Copy, FileSpreadsheet, Link2, Loader2, UserPlus } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { capturarEvento } from '@/lib/posthog-cliente';
import { copiarAlPortapapeles } from '@/lib/utils';
import type { Studio } from '@/lib/types';
import type { RespuestasWizard } from '@/lib/onboarding/borrador-wizard';
import { vieneDeOtraPlataforma } from '@/lib/onboarding/asistente-rapido';
import { GuiaRapidaLista, useGuiaRapida } from './guia-rapida-lista';
import { VistaPreviaApp, useColorMarca } from './vista-previa-app';
import type { ResultadoConfigurar } from './asistente-rapido';

// El cartel/QR trae su propio diálogo y su generador: solo se descarga al llegar aquí.
const BotonQr = dynamic(() => import('@/components/configuracion/dialogo-qr').then((m) => m.BotonQr), { ssr: false });

export function EstudioListo({
  studio, ans, creado, onSalir,
}: {
  studio: Studio;
  ans: RespuestasWizard;
  creado: ResultadoConfigurar;
  /** Sella el alta y navega. Devuelve false si no se pudo sellar (el error lo pinta quien llama). */
  onSalir: (destino: string, evento: string) => Promise<boolean>;
}) {
  const nombre = studio.nombre || 'Tu estudio';
  const guia = useGuiaRapida(creado);
  const colorMarca = useColorMarca();
  const [saliendo, setSaliendo] = useState<string | null>(null);
  const [errorSalida, setErrorSalida] = useState(false);
  const [copiado, setCopiado] = useState<'ok' | 'fallo' | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const migrable = vieneDeOtraPlataforma(ans.software);

  useEffect(() => {
    titulo.current?.focus();
    capturarEvento('bienvenida_resumen');
  }, []);

  const origen = typeof window === 'undefined' ? '' : window.location.origin;
  const urlReservas = studio.slug ? `${origen}/reservar/${studio.slug}` : null;

  async function ir(destino: string, evento: string) {
    if (saliendo) return;
    setSaliendo(destino);
    setErrorSalida(false);
    const ok = await onSalir(destino, evento);
    if (!ok) { setSaliendo(null); setErrorSalida(true); }
  }

  async function copiar() {
    if (!urlReservas) return;
    const ok = await copiarAlPortapapeles(urlReservas);
    setCopiado(ok ? 'ok' : 'fallo');
    setTimeout(() => setCopiado(null), 2500);
  }

  // Función y no componente: se define dentro y un componente anidado se
  // remontaría en cada render (perdería el foco al cambiar `saliendo`).
  const salida = (destino: string, evento: string, contenido: React.ReactNode, principal = false) => (
    <button
      type="button"
      onClick={() => { void ir(destino, evento); }}
      disabled={saliendo !== null}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[14.5px] font-bold transition-colors disabled:opacity-60 ${
        principal ? 'bg-brand-medio text-white' : 'border border-border bg-card text-foreground hover:bg-muted'
      }`}
    >
      {saliendo === destino && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {contenido}
    </button>
  );

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background font-sans text-foreground" data-screen="estudio-listo"
      style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}>
      <style>{`
        @keyframes ob-check { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes ob-aro { 0% { transform: scale(.8); opacity: .5; } 100% { transform: scale(1.7); opacity: 0; } }
        @keyframes ob-sube { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .ob-check { animation: ob-check 520ms cubic-bezier(0.22,1,0.36,1) both; }
        .ob-aro { animation: ob-aro 900ms ease-out 200ms 1 both; }
        .ob-sube { animation: ob-sube 420ms cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .ob-check, .ob-aro, .ob-sube { animation: none; } .ob-aro { display: none; } }
      `}</style>

      <header className="mx-auto flex w-full max-w-[1040px] items-center justify-between px-5 pt-5 sm:px-8">
        <LogoTentare alto={24} tinta="auto" decorativo />
      </header>

      <div className="mx-auto w-full max-w-[1040px] px-5 pb-12 pt-4 sm:px-8">
        <div className="flex items-center gap-4" role="status">
          <span className="relative flex size-14 shrink-0 items-center justify-center">
            <span className="ob-aro absolute inset-0 rounded-full bg-brand-medio/25" aria-hidden />
            <CheckCircle2 size={44} className="ob-check relative text-brand-medio" aria-hidden />
          </span>
          <div>
            <h1 ref={titulo} tabIndex={-1} className="text-[clamp(24px,4.4vw,34px)] font-bold leading-tight outline-none">
              {nombre} ya está en marcha
            </h1>
            <p className="mt-0.5 text-[14px] text-muted-foreground">
              Esta es tu app. Ahora falta lo que la hace valer: tus alumnas.
            </p>
          </div>
        </div>

        <div className="mt-7 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-12">
          <div className="ob-sube lg:sticky lg:top-6 lg:self-start">
            <VistaPreviaApp
              nombre={nombre} logoUrl={studio.logoUrl} color={colorMarca}
              clases={ans.clases ?? []} duracion={ans.duracion} plazas={(ans.aforos ?? [])[0]}
            />
          </div>

          <div className="flex flex-col gap-5">
            {/* El paso que decide si se queda: traer a sus alumnas. */}
            <section aria-labelledby="alumnas-t" className="ob-sube rounded-2xl border-2 border-brand-medio bg-card p-5" style={{ animationDelay: '80ms' }} data-testid="traer-alumnas">
              <h2 id="alumnas-t" className="text-[18px] font-bold leading-tight">Trae a tus alumnas</h2>
              <p className="mt-1 text-[13.5px] leading-snug text-muted-foreground">
                {migrable
                  ? `Exporta de ${ans.software} tus alumnas, bonos y horario y súbelos: los leemos solos, ves el plan antes de importar nada y se puede deshacer. Sin coste.`
                  : 'Si las tienes en Excel o en otro programa, súbelo: lo leemos solo, ves el plan antes de importar nada y se puede deshacer. Sin coste.'}
              </p>
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                {salida('/migracion', 'migracion', <><FileSpreadsheet size={17} aria-hidden /> Subir mi archivo</>, true)}
                {salida('/clientas?nuevo=1', 'alumna_a_mano', <><UserPlus size={17} aria-hidden /> Añadir una alumna ahora</>)}
              </div>
            </section>

            {guia && (
              <div className="ob-sube" style={{ animationDelay: '160ms' }}>
                <GuiaRapidaLista guia={guia} onIr={(href) => { void ir(href, 'guia'); }} />
              </div>
            )}

            {urlReservas && (
              <section aria-labelledby="enlace-t" className="ob-sube rounded-2xl border border-border bg-card p-4" style={{ animationDelay: '240ms' }}>
                <h2 id="enlace-t" className="flex items-center gap-1.5 text-[14px] font-bold"><Link2 size={15} aria-hidden /> Tu enlace de reservas</h2>
                <p className="mt-1 break-all text-[13px] text-muted-foreground" data-testid="url-reservas">{urlReservas}</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">Para Instagram, WhatsApp o la puerta del estudio. Una alumna reserva sin cuenta.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void copiar(); }}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 text-[13.5px] font-semibold hover:bg-muted"
                  >
                    <Copy size={14} aria-hidden /> Copiar enlace
                  </button>
                  {studio.slug && <BotonQr destino="reservas" url={urlReservas} slug={studio.slug} estudio={nombre} nombreEnlace="Página de reservas" />}
                  <span role="status" className="text-[12.5px] text-muted-foreground">
                    {copiado === 'ok' ? 'Enlace copiado' : copiado === 'fallo' ? 'No se ha podido copiar: selecciónalo y cópialo a mano.' : ''}
                  </span>
                </div>
              </section>
            )}

            {errorSalida && (
              <p role="alert" className="text-[13px] text-destructive">
                No hemos podido terminar de abrir tu panel. Revisa tu conexión y vuelve a intentarlo.
              </p>
            )}

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              {salida('/calendario', 'calendario', <>Programar mis clases <ArrowRight size={16} aria-hidden /></>, true)}
              {salida('/dashboard', 'panel', 'Ir a mi panel')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
