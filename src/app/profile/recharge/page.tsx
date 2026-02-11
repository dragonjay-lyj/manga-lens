"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SiteShell } from "@/components/shared/site-shell"
import { RechargePanel } from "@/components/profile/recharge-panel"

export default function RechargePage() {
    return (
        <SiteShell contentClassName="max-w-2xl">
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                    <Button variant="outline" asChild>
                        <Link href="/profile">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            返回个人中心
                        </Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href="/profile/billing">查看账单</Link>
                    </Button>
                </div>

                <RechargePanel />
            </div>
        </SiteShell>
    )
}
