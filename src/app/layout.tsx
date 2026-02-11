import type { Metadata } from "next"
import { Inter, Plus_Jakarta_Sans } from "next/font/google"
import { ThemeProvider } from "@/components/providers/theme-provider"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
  preload: false,
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "MangaLens - AI 驱动的漫画翻译工具",
    template: "%s | MangaLens",
  },
  description: "基于 Web 的专业 AI 图像局部重绘工具，利用 Google Gemini 的多模态能力，精准修改图片局部区域。支持批量处理、多模型选择和5种精美主题。",
  keywords: [
    "漫画翻译",
    "AI 图像编辑",
    "图像重绘",
    "Gemini",
    "OpenAI",
    "局部编辑",
    "批量处理",
    "manga translation",
    "AI image inpainting",
  ],
  authors: [{ name: "MangaLens Team" }],
  creator: "MangaLens",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "/",
    title: "MangaLens - AI 驱动的漫画翻译工具",
    description: "基于 Web 的专业 AI 图像局部重绘工具，支持批量处理和多模型选择",
    siteName: "MangaLens",
  },
  twitter: {
    card: "summary_large_image",
    title: "MangaLens - AI 驱动的漫画翻译工具",
    description: "基于 Web 的专业 AI 图像局部重绘工具",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} ${plusJakartaSans.variable} antialiased`}>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange={false}
        >
          <a href="#page-root" className="skip-link">
            跳到主内容 / Skip to main content
          </a>
          <div id="page-root" tabIndex={-1}>
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
