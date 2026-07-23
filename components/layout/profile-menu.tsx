'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HelpCircle, UserCog, LogOut, ChevronDown, Palette, Building2, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { cn } from '@/lib/utils';
import { fetchMisEstudios, cambiarSedeActiva, type SedeSeleccionable } from '@/lib/supabase-data';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { HelpWidget } from '@/components/layout/help-widget';
import { AppearancePanel } from '@/components/layout/appearance-panel';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { studio, instructores } = useCore();
  const router = useRouter();
  // Mismo criterio que en el sidebar y en Configuración > Mi perfil: el
  // avatar de cabecera es el de quien ha iniciado sesión, no siempre el de
  // la propietaria.
  const yo = instructores.find(i => i.authUserId === user?.id) ?? null;
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'TE';
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
    cambiarSedeActiva(user.id, studioId).then(ok => {
      if (!ok) { setCambiandoSede(null); return; }
      window.location.href = '/dashboard';
    });
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
          <ChevronDown size={13} className="text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-card rounded-2xl shadow-xl border border-border py-1.5 z-20">
            <div className="px-3.5 py-2.5 border-b border-muted">
              <p className="text-[13px] font-semibold text-foreground truncate">{studio?.nombre ?? 'Tentare'}</p>
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
                    {s.id === studio?.id && <Check size={13} className="text-success shrink-0" />}
                  </button>
                ))}
              </div>
            )}
            <Link
              href="/configuracion?tab=perfil"
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
            <button
              onClick={() => { setAppearanceOpen(true); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-foreground hover:bg-muted transition-colors text-left"
            >
              <Palette size={15} className="text-muted-foreground" />
              Apariencia
            </button>
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
      <AppearancePanel open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
    </>
  );
}
