import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/client"

type AdminAuthSuccess = {
    ok: true
    userId: string
}

type AdminAuthFailure = {
    ok: false
    response: NextResponse
}

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure

export async function requireAdmin(): Promise<AdminAuthResult> {
    const { userId } = await auth()
    if (!userId) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        }
    }

    const supabaseAdmin = createServerClient()
    const { data: user, error } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", userId)
        .single()

    if (error || !user || user.role !== "admin") {
        return {
            ok: false,
            response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        }
    }

    return { ok: true, userId }
}
