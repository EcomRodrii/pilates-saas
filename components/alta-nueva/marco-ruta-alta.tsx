'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Las pantallas de traer datos (Migración Mágica, Clientas › Importar,
// Calendario › Importar) abiertas DESDE el alta nueva, antes de terminarla.
//
// Mientras el alta no se ha terminado, el panel enseña la bienvenida en
// cualquier ruta (components/layout/dashboard-shell.tsx). Estas tres son la
// excepción: se pintan enteras, sin menú (no se sale del alta a medias), con una
// barra arriba para volver. La revisión del plan de la Migración Mágica se hace
// aquí y se vuelve al paso 5 (decisión del fundador, 21-oct-2026): ni se guarda
// el análisis ni «te espera en Primeros pasos».
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { BOTON_VIVO } from '@/components/dashboard/vivo';
import { PanelThemeProvider } from '@/lib/panel-theme';
import { PanelPrivacyProvider } from '@/lib/panel-privacy';
import { cn } from '@/lib/utils';
import { guardarPantalla } from './pantalla-guardada';

export function MarcoRutaAlta({ studioId, children }: { studioId: string; children: React.ReactNode }) {
  const router = useRouter();
  const volver = (pantalla: 'importar' | 'marca') => {
    guardarPantalla(studioId, pantalla);
    router.push('/dashboard');
  };
  return (
    <PanelPrivacyProvider>
      <PanelThemeProvider className="panel-app min-h-dvh bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur" data-testid="barra-ruta-alta">
          <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-2.5 lg:px-6">
            <LogoTentare alto={20} tinta="auto" decorativo />
            <p className="hidden min-w-0 truncate text-[13px] text-muted-foreground sm:block">
              Paso 4 de 5 · Configurando tu estudio
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => volver('importar')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-[13.5px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={15} aria-hidden /> <span className="hidden sm:inline">Volver al paso 4</span><span className="sm:hidden">Paso 4</span>
              </button>
              <button type="button" onClick={() => volver('marca')} className={cn(BOTON_VIVO, 'h-10 px-4 text-[14px]')}>
                Seguir con tu marca <ArrowRight size={15} aria-hidden />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1320px] px-4 py-6 lg:px-6">{children}</main>
      </PanelThemeProvider>
    </PanelPrivacyProvider>
  );
}
