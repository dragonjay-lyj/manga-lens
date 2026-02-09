import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { Webhook } from "svix"
import { WebhookEvent } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"

export async function POST(req: Request) {
    // 获取 Clerk Webhook Secret
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET?.trim()

    if (!WEBHOOK_SECRET) {
        console.error("Missing CLERK_WEBHOOK_SECRET")
        return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    // 获取 headers
    const headerPayload = await headers()
    const svix_id = headerPayload.get("svix-id")
    const svix_timestamp = headerPayload.get("svix-timestamp")
    const svix_signature = headerPayload.get("svix-signature")

    if (!svix_id || !svix_timestamp || !svix_signature) {
        return NextResponse.json({ error: "Missing svix headers" }, { status: 400 })
    }

    // 获取请求体
    const payload = await req.json()
    const body = JSON.stringify(payload)

    // 验证 Webhook
    const wh = new Webhook(WEBHOOK_SECRET)
    let evt: WebhookEvent

    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        }) as WebhookEvent
    } catch (err) {
        console.error("Webhook verification failed:", err)
        return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 })
    }

    const eventType = evt.type

    // 处理用户创建事件
    if (eventType === "user.created") {
        const { id, email_addresses, username, image_url } = evt.data
        const email = email_addresses[0]?.email_address

        if (!email) {
            return NextResponse.json({ error: "No email found" }, { status: 400 })
        }

        const supabase = createServerClient()

        const { error } = await supabase.from("users").upsert(
            {
                id,
                clerk_id: id,
                email,
                username: username || null,
                avatar_url: image_url || null,
                role: "user",
            },
            {
                onConflict: "id",
            }
        )

        if (error) {
            console.error("Failed to create user:", error)
            return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
        }
    }

    // 处理用户更新事件
    if (eventType === "user.updated") {
        const { id, email_addresses, username, image_url } = evt.data
        const email = email_addresses[0]?.email_address

        const supabase = createServerClient()

        const { error } = await supabase
            .from("users")
            .update({
                email,
                username: username || null,
                avatar_url: image_url || null,
            })
            .eq("id", id)

        if (error) {
            console.error("Failed to update user:", error)
            return NextResponse.json({ error: "Failed to update user" }, { status: 500 })
        }
    }

    // 处理用户删除事件
    if (eventType === "user.deleted") {
        const { id } = evt.data

        if (!id) {
            return NextResponse.json({ error: "No user id found" }, { status: 400 })
        }

        const supabase = createServerClient()

        const { error } = await supabase
            .from("users")
            .delete()
            .eq("id", id)

        if (error) {
            console.error("Failed to delete user:", error)
            return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
        }
    }

    return NextResponse.json({ success: true })
}
