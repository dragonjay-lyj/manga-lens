import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { ensureUserRecord } from "@/lib/auth/ensure-user-record"

export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { user } = await ensureUserRecord(userId)
        const role = user.role ?? "user"

        return NextResponse.json({
            role,
            isAdmin: role === "admin",
        })
    } catch (error) {
        console.error("Get user role error:", error)
        return NextResponse.json({ error: "Failed to get user role" }, { status: 500 })
    }
}
