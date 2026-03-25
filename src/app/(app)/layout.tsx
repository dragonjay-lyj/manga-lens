import { AppToaster } from "@/components/providers/app-toaster"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      {children}
      <AppToaster />
    </>
  )
}
