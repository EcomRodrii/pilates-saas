'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HelpCircle, UserCog, LogOut, ChevronDown, Palette } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { HelpWidget } from '@/components/layout/help-widget';
import { AppearancePanel } from '@/components/layout/appearance-panel';

export function ProfileMenu() {
  const { user, signOut } = useAuth();
  const { studio } = useStudio();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const userInitials = user?.email?.slice(0, 2).toUpperCase() ?? 'TE';
  const userEmail = user?.email ?? 'Modo auditoría';

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
          className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full hover:bg-background transition-colors"
        >
          <ProfileAvatar avatarId={studio?.avatarAdmin} nombre={userInitials} size="sm" />
          <ChevronDown size={13} className="text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-card rounded-2xl shadow-xl border border-border py-1.5 z-20">
            <div className="px-3.5 py-2.5 border-b border-muted">
              <p className="text-[13px] font-semibold text-foreground truncate">{studio?.nombre ?? 'Tentare'}</p>
              <p className="text-[12px] text-muted-foreground truncate">{userEmail}</p>
            </div>
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
