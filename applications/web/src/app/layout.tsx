import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/cn";
import { Providers } from "./providers";
import { prefetchProjects } from "@/lib/api.server";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const themeScript = `
  (function() {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  })();
`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const projects = await prefetchProjects();

  return (
    <html lang="en" className={cn(geist.variable, geistMono.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans text-[0.75rem] text-text bg-bg antialiased">
        <Providers fallback={{ projects }}>{children}</Providers>
      </body>
    </html>
  );
}
