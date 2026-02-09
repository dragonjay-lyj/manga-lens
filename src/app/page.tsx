"use client"

import Link from "next/link"
import { useAuth, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { ThemeSwitcher } from "@/components/shared/theme-switcher"
import { LanguageSwitcher } from "@/components/shared/language-switcher"
import {
  Sparkles,
  Zap,
  Palette,
  Target,
  FolderSync,
  Globe,
  ArrowRight,
  Github,
} from "lucide-react"
import { useEditorStore } from "@/lib/stores/editor-store"
import { getMessages } from "@/lib/i18n"

export default function HomePage() {
  const { isSignedIn } = useAuth()
  const { locale, setLocale } = useEditorStore()
  const t = getMessages(locale)

  return (
    <div className="min-h-screen bg-background">
      {/* 全局背景效果 */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/20 via-transparent to-transparent blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/20 via-transparent to-transparent blur-3xl animate-pulse-slow" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* 导航栏 */}
      <header className="fixed top-4 left-4 right-4 z-50">
        <nav className="max-w-7xl mx-auto glass-card bg-card/95 rounded-2xl px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display font-bold text-xl gradient-text">
              MangaLens
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeSwitcher locale={locale} />
            <LanguageSwitcher
              locale={locale}
              onChange={setLocale}
            />

            {isSignedIn ? (
              <>
                <Button asChild variant="ghost">
                  <Link href="/editor">{t.nav.editor}</Link>
                </Button>
                <UserButton afterSwitchSessionUrl="/" />
              </>
            ) : (
              <>
                <SignInButton mode="modal">
                  <Button variant="outline">{t.nav.signIn}</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button className="gradient-primary text-white">
                    {t.nav.signUp}
                  </Button>
                </SignUpButton>
              </>
            )}
          </div>
        </nav>
      </header>

      <main id="main-content">
        {/* Hero 区域 */}
        <section className="pt-32 pb-20 px-4">
          <div className="max-w-7xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm">
                {locale === "zh" ? "AI 驱动 · 批量处理 · 5种主题" : "AI-Powered · Batch Processing · 5 Themes"}
              </span>
            </div>

            <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="gradient-text">{t.landing.hero.title}</span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-10">
              {t.landing.hero.subtitle}
            </p>

            <div className="flex items-center justify-center gap-4">
              {isSignedIn ? (
                <Button asChild size="lg" className="gradient-primary text-white px-8">
                  <Link href="/editor">
                    {t.landing.hero.cta}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              ) : (
                <SignUpButton mode="modal">
                  <Button size="lg" className="gradient-primary text-white px-8">
                    {t.landing.hero.cta}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </SignUpButton>
              )}
              <Button variant="outline" size="lg" asChild>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                  <Github className="mr-2 h-5 w-5" />
                  GitHub
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* 功能特性 */}
        <section className="py-20 px-4">
          <div className="max-w-7xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-center mb-16">
              {t.landing.features.title}
            </h2>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard
                icon={Target}
                title={t.landing.features.precision.title}
                description={t.landing.features.precision.description}
              />
              <FeatureCard
                icon={FolderSync}
                title={t.landing.features.batch.title}
                description={t.landing.features.batch.description}
              />
              <FeatureCard
                icon={Globe}
                title={t.landing.features.multiModel.title}
                description={t.landing.features.multiModel.description}
              />
              <FeatureCard
                icon={Palette}
                title={t.landing.features.themes.title}
                description={t.landing.features.themes.description}
              />
            </div>
          </div>
        </section>

        {/* 使用场景 */}
        <section className="py-20 px-4 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-center mb-16">
              {t.landing.useCases.title}
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              <UseCaseCard
                number="01"
                title={t.landing.useCases.mangaTranslation.title}
                description={t.landing.useCases.mangaTranslation.description}
              />
              <UseCaseCard
                number="02"
                title={t.landing.useCases.imageEdit.title}
                description={t.landing.useCases.imageEdit.description}
              />
              <UseCaseCard
                number="03"
                title={t.landing.useCases.batchProcess.title}
                description={t.landing.useCases.batchProcess.description}
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
          <div className="glass-card bg-card/95 rounded-3xl p-12">
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
                {locale === "zh" ? "准备好开始了吗？" : "Ready to get started?"}
              </h2>
              <p className="text-muted-foreground mb-8">
                {locale === "zh"
                  ? "免费注册，即刻体验 AI 驱动的图像编辑能力"
                  : "Sign up for free and experience AI-powered image editing"}
              </p>
              {isSignedIn ? (
                <Button asChild size="lg" className="gradient-primary text-white px-8">
                  <Link href="/editor">
                    {t.landing.hero.cta}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              ) : (
                <SignUpButton mode="modal">
                  <Button size="lg" className="gradient-primary text-white px-8">
                    {t.landing.hero.cta}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </SignUpButton>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="font-display font-semibold">MangaLens</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} MangaLens. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

// 功能卡片组件
function FeatureCard({
  icon: Icon,
  title,
  description
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="glass-card bg-card/95 rounded-2xl p-6">
      <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="font-display font-semibold text-lg mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

// 使用场景卡片
function UseCaseCard({
  number,
  title,
  description
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <div className="glass-card bg-card/95 rounded-2xl p-8 relative overflow-hidden">
      <span className="absolute top-4 right-4 text-6xl font-display font-bold text-primary/10">
        {number}
      </span>
      <h3 className="font-display font-semibold text-xl mb-4 relative z-10">{title}</h3>
      <p className="text-muted-foreground relative z-10">{description}</p>
    </div>
  )
}
