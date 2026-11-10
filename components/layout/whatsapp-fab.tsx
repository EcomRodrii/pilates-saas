// El botón flotante de WhatsApp se retiró el 10-nov-2026: el soporte por WhatsApp
// vive ahora en la pestaña «Mensajes» del botón de ayuda
// (components/ayuda/ayuda-del-panel.tsx).
//
// Queda este reexport para quien ya importaba el número de aquí. El número vive en
// lib/soporte.ts (lo usan también el servidor y el alta, fuera del panel).
export { SOPORTE_WHATSAPP } from '@/lib/soporte';
