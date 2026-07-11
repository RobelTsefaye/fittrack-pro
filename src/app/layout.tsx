import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Barlow_Condensed } from "next/font/google";
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

/* Barlow Condensed — for large metric numerals (stat cards, big numbers).
   Athletic, precise, distinctive without being decorative. */
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#070708" },
  ],
};

export const metadata: Metadata = {
  title: "FitTrack Pro",
  description: "Intelligent fitness tracking — offline training, cloud sync.",
  applicationName: "FitTrack Pro",
  appleWebApp: {
    capable: true,
    title: "FitTrack",
    statusBarStyle: "black-translucent",
    startupImage: [
      {
        url: "/icons/icon-512.png",
        media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
  },
  formatDetection: {
    telephone: false,
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
  // Static export has no request to read a cookie/session from — resolveAppLocale()
  // calls cookies()/auth()/Prisma, none of which exist at build time under
  // `output: "export"`. The native shell always renders this same pre-built
  // "en" HTML regardless of the visitor; per-user locale there is a Phase 3+
  // concern (project-docs/offline-first-roadmap.md).
  const locale = process.env.NATIVE_BUILD === "1" ? "en" : await resolveAppLocale();
  const messages = getMessages(locale);

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} h-full antialiased`} suppressHydrationWarning>
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
