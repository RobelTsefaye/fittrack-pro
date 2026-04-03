import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { I18nProvider } from "@/lib/i18n-provider";
import { getMessages } from "@/lib/i18n-server";
import { resolveAppLocale } from "@/lib/i18n-resolve";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "FitTrack Pro",
  description: "Intelligent fitness tracking for serious lifters",
  appleWebApp: {
    capable: true,
    title: "FitTrack",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/app-icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveAppLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Providers>
          <I18nProvider locale={locale} messages={messages}>
            {children}
          </I18nProvider>
        </Providers>
      </body>
    </html>
  );
}
