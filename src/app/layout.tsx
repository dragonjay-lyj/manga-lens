import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { getClerkProviderProps } from "@/lib/auth/clerk-config"
import "./globals.css"

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-noto-sans-jp",
  display: "swap",
})

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-serif-jp",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "MangaLens - AI 驱动的漫画翻译工具",
    template: "%s | MangaLens",
  },
  description:
    "基于 Web 的专业 AI 图像局部重绘工具，利用 Google Gemini 的多模态能力，精准修改图片局部区域。支持批量处理、多模型选择和专业级漫画翻译工作流。",
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
  const clerkProviderProps = getClerkProviderProps()

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${notoSansJP.variable} ${notoSerifJP.variable} antialiased`}>
        <ClerkProvider {...clerkProviderProps}>
          <ThemeProvider>
            <a href="#main-content" className="skip-link">
              跳到主内容 / Skip to main content
            </a>
            {children}
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
