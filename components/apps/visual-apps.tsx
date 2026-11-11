// Cómo se ve cada app: su color y su glifo o su logo. Vive aparte del catálogo
// (`lib/apps/catalogo.ts`) porque aquel es puro y se prueba con `node --test`;
// esto importa iconos de React.
//
// Una baldosa por app, siempre del mismo juego (`IconoApp`). Las integraciones
// de otras marcas llevan su logo real; las apps de Tentare, un glifo propio.

import type { ReactNode } from 'react';
import { Compass, Replace, Smartphone, Sparkles, Gift, Wallet, ScanLine, type LucideIcon } from 'lucide-react';
import {
  ClassPassIcon, GoogleCalendarIcon, KisiIcon, KlaviyoIcon, MailchimpIcon, StripeIcon, UrbanSportsClubIcon,
  WellhubIcon, WhatsAppIcon, ZapierIcon, ZoomIcon,
} from '@/components/icons/brand-icons';
import type { TonoApp } from './icono-app';

export interface VisualApp {
  tono: TonoApp;
  glifo?: LucideIcon;
  logo?: (px: number) => ReactNode;
}

export const VISUAL: Record<string, VisualApp> = {
  stripe: { tono: 'indigo', logo: (px) => <StripeIcon size={px} /> },
  datafono: { tono: 'teal', glifo: ScanLine },
  whatsapp: { tono: 'verde', logo: (px) => <WhatsAppIcon size={px} /> },
  'google-calendar': { tono: 'azul', logo: (px) => <GoogleCalendarIcon size={px} /> },
  zoom: { tono: 'azul', logo: (px) => <ZoomIcon size={px + 8} /> },
  kisi: { tono: 'indigo', logo: (px) => <KisiIcon size={px + 8} /> },
  klaviyo: { tono: 'ambar', logo: (px) => <KlaviyoIcon size={px} /> },
  mailchimp: { tono: 'ambar', logo: (px) => <MailchimpIcon size={px + 8} /> },
  zapier: { tono: 'ambar', logo: (px) => <ZapierIcon size={px + 8} /> },
  classpass: { tono: 'azul', logo: (px) => <ClassPassIcon size={px} /> },
  'urban-sports-club': { tono: 'teal', logo: (px) => <UrbanSportsClubIcon size={px} /> },
  wellhub: { tono: 'magenta', logo: (px) => <WellhubIcon size={px} /> },
  'complemento-decisiones': { tono: 'azul', glifo: Compass },
  'complemento-sustituciones': { tono: 'magenta', glifo: Replace },
  'complemento-ia': { tono: 'indigo', glifo: Sparkles },
  'proximamente-datafono-banco': { tono: 'gris', glifo: Wallet },
  'proximamente-app-propia': { tono: 'gris', glifo: Smartphone },
  'proximamente-tarjeta-regalo': { tono: 'gris', glifo: Gift },
};

export const VISUAL_POR_DEFECTO: VisualApp = { tono: 'azul', glifo: Compass };
