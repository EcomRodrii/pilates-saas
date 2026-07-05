import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { StudioProvider } from '@/lib/studio-context';
import { AuthProvider } from '@/lib/auth-context';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Tentare · Gestión del estudio',
  description: 'Software de gestión para el estudio de pilates Tentare',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${jakarta.variable} antialiased`}>
      <body className="bg-[#F7F7FB]">
        <AuthProvider>
          <StudioProvider>{children}</StudioProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
