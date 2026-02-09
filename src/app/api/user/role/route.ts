import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const supabaseAdmin = createServerClient()
        const { data: user, error } = await supabaseAdmin
            .from("users")
            .select("role")
            .eq("id", userId)
            .single()

        if (error || !user) {
            // 用户不存在时，默认按普通用户处理
            return NextResponse.json({ role: "user", isAdmin: false })
        }

        return NextResponse.json({
            role: user.role,
            isAdmin: user.role === "admin",
        })
    } catch (error) {
        console.error("Get user role error:", error)
        return NextResponse.json({ error: "Failed to get user role" }, { status: 500 })
    }
}
