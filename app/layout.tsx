import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import NextTopLoader from "nextjs-toploader"

import "./globals.css"
import { Providers } from "@/components/providers"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const metadata: Metadata = {
  title: { default: "Resource Hub", template: "%s · Resource Hub" },
  description: "Your private library of everything you save online.",
  applicationName: "Resource Hub",
}

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn("dark antialiased", geist.variable, geistMono.variable)}
      style={{ colorScheme: "dark" }}
    >
      <body>
        <NextTopLoader color="#ff6a00" showSpinner={false} />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
