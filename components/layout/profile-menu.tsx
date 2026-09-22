'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HelpCircle, UserCog, LogOut, ChevronDown, Palette, Building2, Check, Moon, Sun, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { cn } from '@/lib/utils';
import { fetchMisEstudios, type SedeSeleccionable } from '@/lib/supabase-data';
import { irASede } from '@/components/layout/sede-activa';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { HelpWidget } from '@/components/layout/help-widget';
import { usePermisos } from '@/lib/permisos';
import { usePanelTheme } from '@/lib/panel-theme';
import { alPulsarEnlaceAConfiguracion } from '@/components/configuracion/shell/ir-a-configuracion';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { studio, instructores } = useCore();
  const { rol } = usePermisos();
  const { dark, setDark } = usePanelTheme();
  const router = useRouter();
  // Mismo criterio que en el sidebar y en Configuración > Mi perfil: el
  // avatar de cabecera es el de quien ha iniciado sesión, no siempre el de
  // la propietaria.
  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Propietaria sin ficha propia (yo === null): usa el nombre que haya
  // guardado en Configuración > Mi perfil (auth.users.user_metadata) en vez
  // de las iniciales del email, si ya lo ha rellenado.
  const metaNombre = user?.user_metadata?.nombre as string | undefined;
  const userInitials = !yo && metaNombre
    ? metaNombre.slice(0, 2).toUpperCase()
    : (user?.email?.slice(0, 2).toUpperCase() ?? 'TE');
  const userEmail = user?.email ?? 'Modo auditoría';

  // Selector de sede (multi-centro / plan CADENA): solo se pinta si el usuario
  // tiene acceso a más de una. mis_estudios() no depende de cadena_id (es
  // autorización, no billing) — también lista a una instructora que trabaje
  // en dos centros aunque no compartan cadena.
  const [misEstudios, setMisEstudios] = useState<SedeSeleccionable[]>([]);
  const [cambiandoSede, setCambiandoSede] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !user) return;
    let vivo = true;
    fetchMisEstudios().then(r => { if (vivo) setMisEstudios(r); });
    return () => { vivo = false; };
  }, [open, user]);

  function elegirSede(studioId: string) {
    if (!user || studioId === studio?.id) return;
    setCambiandoSede(studioId);
    // Hard-nav en el .then() (no en esta misma función, que ya hizo setState):
    // StudioProvider necesita remontar limpio contra la nueva sede (mismo
    // patrón que crear-estudio/login). resolveStudioId() delega en
    // current_studio_id(), que ya lee sesion_activa.
    void irASede(user.id, studioId, misEstudios.find(s => s.id === studioId)?.nombre ?? '').then(ok => { if (!ok) setCambiandoSede(null); });
  }

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          aria-label="Abrir menú de perfil"
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-background transition-colors"
        >
          <ProfileAvatar avatarId={yo ? yo.avatar : studio?.avatarAdmin} fotoUrl={yo ? yo.fotoUrl : studio?.fotoUrl} nombre={userInitials} size="sm" />
          <ChevronDown size={14} className="text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-card rounded-2xl shadow-xl border border-border py-1.5 z-20 menu-pop-in">
            <div className="px-3.5 py-2.5 border-b border-muted">
              {/* Quien tiene ficha propia (instructora/manager/recepción) es una
                  persona distinta del estudio: ver el nombre del negocio en vez
                  del suyo aquí es la razón por la que este menú "no parecía
                  suyo". La propietaria sin ficha (yo === null) sigue viendo el
                  nombre del estudio, que es lo único que tiene. */}
              <p className="text-[13px] font-semibold text-foreground truncate">{yo ? yo.nombre : (studio?.nombre ?? 'Tentare')}</p>
              <p className="text-[12px] text-muted-foreground truncate">{userEmail}</p>
            </div>
            {misEstudios.length > 1 && (
              <div className="border-b border-muted py-1">
                <p className="px-3.5 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-[#B8B8AE] flex items-center gap-1.5">
                  <Building2 size={11} /> Cambiar de sede
                </p>
                {misEstudios.map(s => (
                  <button
                    key={s.id}
                    onClick={() => elegirSede(s.id)}
                    disabled={cambiandoSede !== null}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3.5 py-2 text-[13px] text-left hover:bg-muted transition-colors',
                      cambiandoSede !== null && 'opacity-50',
                    )}
                  >
                    <span className="truncate">{s.nombre}</span>
                    {s.id === studio?.id && <Check size={14} className="text-success shrink-0" />}
                  </button>
                ))}
              </div>
            )}
            <Link
              href="/mi-perfil"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors"
            >
              <UserCog size={15} className="text-muted-foreground" />
              Mi perfil
            </Link>
            <button
              onClick={() => { setHelpOpen(true); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors text-left"
            >
              <HelpCircle size={15} className="text-muted-foreground" />
              Preguntas frecuentes
            </button>
            {/* ⚠️ Esto abría una hoja intermedia («Apariencia · Beta») cuyo
                único contenido propio era este interruptor: el enlace de dentro
                llevaba a «Personalizar tu panel» y ya no había marca que editar
                porque su editor estuvo cerrado. Con «Apariencia de tu app» viva
                (22-sep), la hoja era un paso de más delante de dos enlaces, así
                que se retiró y sus dos cosas viven aquí.
                El interruptor lo ven TODOS los roles a propósito: el modo
                oscuro es de este navegador, y su otra casa —Configuración ›
                Tu panel— es solo de la propietaria. */}
            <button
              onClick={() => setDark(!dark)}
              role="switch"
              aria-checked={dark}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors text-left"
            >
              {dark ? <Moon size={15} className="text-muted-foreground" /> : <Sun size={15} className="text-muted-foreground" />}
              Modo oscuro
              <span
                aria-hidden
                className="ml-auto w-9 h-5 rounded-full flex items-center px-0.5 transition-colors"
                style={{ backgroundColor: dark ? 'var(--brand)' : 'var(--muted-foreground)' }}
              >
                <span
                  className="w-4 h-4 bg-card rounded-full shadow transition-transform"
                  style={{ transform: dark ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </span>
            </button>
            {rol === 'PROPIETARIO' && (
              <>
                <Link
                  href="/configuracion/apariencia"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors text-left"
                >
                  <Palette size={15} className="text-muted-foreground" />
                  Apariencia de tu app
                  <ChevronRight size={15} className="ml-auto text-muted-foreground" />
                </Link>
                <Link
                  href="/configuracion?tab=panel"
                  // Desde otra sección de Configuración, por el shell (#2030).
                  onClick={e => { setOpen(false); alPulsarEnlaceAConfiguracion(e, '/configuracion?tab=panel'); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors text-left"
                >
                  <UserCog size={15} className="text-muted-foreground" />
                  Personalizar tu panel
                  <ChevronRight size={15} className="ml-auto text-muted-foreground" />
                </Link>
              </>
            )}
            <div className="border-t border-muted mt-1 pt-1">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-[#C4695A] hover:bg-[#FFF2F2] transition-colors text-left"
              >
                <LogOut size={15} />
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>

      <HelpWidget open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
