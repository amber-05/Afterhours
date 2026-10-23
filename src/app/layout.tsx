import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Ambient } from "@/components/ambient";
import { MusicToggle } from "@/components/music-toggle";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Instrument_Serif({ variable: "--font-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "Afterhours — party games for your late-night crew",
  description:
    "Spin up a private room, share the code, and play anonymous party games with friends. No sign-up.",
};

export const viewport: Viewport = {
  themeColor: "#14090f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col">
        <Ambient />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
        <MusicToggle />
        <Toaster theme="dark" position="top-center" />
      </body>
    </html>
  );
}
