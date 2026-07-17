'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-brand text-brand-foreground text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-lg pointer-events-none">
      <Check size={14} className="text-[#34D399]" />
      {message}
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((msg: string) => setMessage(msg), []);
  const dismiss = useCallback(() => setMessage(null), []);
  return { message, show, dismiss };
}
