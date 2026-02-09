import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { getLinuxdoPaymentConfigStatus } from "@/lib/settings"

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const configStatus = await getLinuxdoPaymentConfigStatus()
        return NextResponse.json({ configStatus })
    } catch (error) {
        console.error("Get linuxdo payment config error:", error)
        return NextResponse.json({ error: "获取支付配置失败" }, { status: 500 })
    }
}
