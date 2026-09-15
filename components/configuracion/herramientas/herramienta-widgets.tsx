'use client';

import { TabApi } from '@/components/configuracion/tab-api';

// El constructor de widgets y, en su otra pestaña, cómo le va a tu página. La
// tarjeta (`#widgets`) la pinta el propio TabApi.
export function HerramientaWidgets({ showToast }: { showToast: (m: string) => void }) {
  return <TabApi showToast={showToast} />;
}
