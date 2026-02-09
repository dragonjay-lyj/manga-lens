import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { Webhook } from "svix"
import { WebhookEvent } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"

type ClerkWebhookEmail = {
    id?: string
    email_address?: string | null
}

type ClerkWebhookUserData = {
    id?: string | null
    email_addresses?: ClerkWebhookEmail[]
    primary_email_address_id?: string | null
    username?: string | null
    first_name?: string | null
    last_name?: string | null
    image_url?: string | null
}

const PLACEHOLDER_WEBHOOK_SECRET_PATTERNS = /(placeholder|example|xxx)/i

function getEmailFromWebhookUser(data: ClerkWebhookUserData): string | null {
    const emailAddresses = data.email_addresses ?? []
    const primaryEmail = emailAddresses.find(
        (emailAddress) => emailAddress.id === data.primary_email_address_id
    )?.email_address

    return primaryEmail ?? emailAddresses[0]?.email_address ?? null
}

function getUsernameFromWebhookUser(data: ClerkWebhookUserData): string | null {
    if (data.username) return data.username

    const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim()
    return fullName.length > 0 ? fullName : null
}

export async function POST(req: Request) {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET?.trim() ?? ""

    if (!webhookSecret || PLACEHOLDER_WEBHOOK_SECRET_PATTERNS.test(webhookSecret)) {
        console.error("[clerk-webhook] CLERK_WEBHOOK_SECRET is missing or still placeholder value")
        return NextResponse.json(
            { error: "CLERK_WEBHOOK_SECRET is not configured correctly" },
            { status: 500 }
        )
    }

    const headerPayload = await headers()
    const svixId = headerPayload.get("svix-id")
    const svixTimestamp = headerPayload.get("svix-timestamp")
    const svixSignature = headerPayload.get("svix-signature")

    if (!svixId || !svixTimestamp || !svixSignature) {
        return NextResponse.json({ error: "Missing svix headers" }, { status: 400 })
    }

    // Svix 需要原始请求体参与验签，不能使用 JSON 反序列化后再 stringify
    const body = await req.text()

    const wh = new Webhook(webhookSecret)
    let evt: WebhookEvent

    try {
        evt = wh.verify(body, {
            "svix-id": svixId,
            "svix-timestamp": svixTimestamp,
            "svix-signature": svixSignature,
        }) as WebhookEvent
    } catch (err) {
        console.error("[clerk-webhook] Webhook verification failed:", err)
        return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 })
    }

    const supabase = createServerClient()
    const eventType = evt.type

    if (eventType === "user.created" || eventType === "user.updated") {
        const userData = evt.data as ClerkWebhookUserData
        const userId = userData.id
        if (!userId) {
            return NextResponse.json({ error: "No user id found in webhook payload" }, { status: 400 })
        }

        const email = getEmailFromWebhookUser(userData)
        const username = getUsernameFromWebhookUser(userData)
        const avatarUrl = userData.image_url ?? null

        const { error } = await supabase
            .from("users")
            .upsert(
            {
                id: userId,
                clerk_id: userId,
                email,
                username,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: "id",
            }
        )

        if (error) {
            console.error(`[clerk-webhook] Failed to upsert user(${userId}):`, error)
            return NextResponse.json({ error: "Failed to upsert user" }, { status: 500 })
        }
    } else if (eventType === "user.deleted") {
        const userData = evt.data as { id?: string | null }
        const userId = userData.id

        if (!userId) {
            return NextResponse.json({ error: "No user id found" }, { status: 400 })
        }

        const { error } = await supabase
            .from("users")
            .delete()
            .eq("id", userId)

        if (error) {
            console.error(`[clerk-webhook] Failed to delete user(${userId}):`, error)
            return NextResponse.json({ error: "Failed to delete user" }, { status: 500 })
        }
    }

    return NextResponse.json({ success: true })
}
