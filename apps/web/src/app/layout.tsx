import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Instrument_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

// Display face. Deliberately not Inter — a slightly technical grotesque
// keeps headings from reading as generic SaaS.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument-sans",
});

export const metadata: Metadata = {
  title: "AI Codebase Copilot",
  description: "Ask questions about your codebase, get grounded answers.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      // next-themes writes the theme class here before paint; without this
      // React warns about the server/client class mismatch.
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bp-grid min-h-screen">
        <ThemeProvider
          attribute="class"
          // Dark is the product's identity, not the OS's call — enableSystem
          // would hand a light-mode OS user a light app on first load.
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AuthProvider>
            <QueryProvider>
              <TooltipProvider delayDuration={200}>
                {children}
                <Toaster position="bottom-right" />
              </TooltipProvider>
            </QueryProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
