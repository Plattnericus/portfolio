import type { Metadata, Viewport } from "next";
import { Anton, Roboto } from "next/font/google";
import localFont from "next/font/local";
import { siteConfig, absoluteUrl } from "@/lib/site";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const roboto = Roboto({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
});

/* Panchang by Indian Type Foundry, via Fontshare (Free Font License —
   see public/fonts/Panchang-LICENSE.txt) */
const panchang = localFont({
  src: [{ path: "../public/fonts/Panchang-Bold.woff2", weight: "700", style: "normal" }],
  variable: "--font-panchang",
  display: "swap",
});

/* The NEXOR brand face is not loaded here: a 2 KB subset of it is inlined into
   globals.css (see "NexorBrand" there), so the intro wordmark can paint in its
   real glyphs on the very first frame, before any font request could finish. */

const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.shortName,
  title: {
    default: siteConfig.title,
    template: "%s | Nexor / Plattnericus",
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  authors: [{ name: "Nexor / Plattnericus", url: siteConfig.url }],
  creator: "Nexor / Plattnericus",
  publisher: "Nexor / Plattnericus",
  category: "technology",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: siteConfig.shortName,
  },
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      "x-default": "/",
    },
    types: {
      "text/plain": [
        { url: "/llms.txt", title: "LLM summary" },
        { url: "/llms-full.txt", title: "Full AI discovery profile" },
        { url: "/ai.txt", title: "AI crawler index" },
      ],
    },
  },
  openGraph: {
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
    locale: siteConfig.locale,
    /* the image itself is app/opengraph-image.jpg (and twitter-image.jpg):
       a frame of the real hero, picked up by Next with a hashed URL */
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: googleSiteVerification
    ? {
        google: googleSiteVerification,
      }
    : undefined,
  icons: {
    /* /favicon.ico is emitted automatically from app/favicon.ico; only the
       modern PNG mark and the Apple touch icon need declaring here. */
    icon: { url: "/icon", type: "image/png", sizes: "64x64" },
    apple: "/apple-icon",
  },
  manifest: "/site.webmanifest",
  other: {
    "ai-content-purpose":
      "Public developer profile for search engines, AI answer engines and crawler-accessible project discovery.",
    "llms-txt": absoluteUrl("/llms.txt"),
    "llms-full": absoluteUrl("/llms-full.txt"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
  themeColor: "#0b0908",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${roboto.variable} ${panchang.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
