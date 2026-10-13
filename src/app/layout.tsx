import type { Metadata, Viewport } from "next";
import { PwaRegistration } from '@/components/pwa';
import "./globals.css";

export const metadata: Metadata = {
  title: "Galaxy Hub",
  description: "Кампус для знакомств, встреч с друзьями и исследования пространства.",
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Galaxy Hub', statusBarStyle: 'black-translucent' },
  icons: { apple: '/app-icons/icon-192.png', icon: '/app-icons/icon-192.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#352b26' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body><PwaRegistration />{children}</body></html>;
}
