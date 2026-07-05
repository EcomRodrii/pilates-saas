'use client';

import { X, LogOut } from 'lucide-react';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';

export function ProfileSheet({
  avatarId, nombre, onChangeAvatar, onLogout, onClose,
}: {
  avatarId: string | null;
  nombre: string;
  onChangeAvatar: (id: string | null) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold text-[#171717]">Tu perfil</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center bg-[#F1F1EC] text-[#8E8E86]">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2 mb-6">
          <ProfileAvatar avatarId={avatarId} nombre={nombre} size="xl" />
          <p className="text-[15px] font-bold text-[#171717]">{nombre}</p>
        </div>

        <p className="text-[13px] font-semibold text-[#171717] mb-2">Elige tu avatar</p>
        <AvatarPicker value={avatarId} onChange={onChangeAvatar} />

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 mt-7 py-3 rounded-2xl border border-[#E7E7E0] text-[#B91C1C] text-[14px] font-semibold active:bg-[#FEF2F2] transition-colors"
        >
          <LogOut size={15} />Cerrar sesión
        </button>
      </div>
    </div>
  );
}
