import { currentUser } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"

type EnsuredUser = {
    id: string
    role: string | null
    credits: number | null
}

type EnsureUserRecordResult = {
    user: EnsuredUser
    created: boolean
}

type ClerkUserProfile = {
    email: string | null
    username: string | null
    avatarUrl: string | null
}

function getDisplayName(firstName?: string | null, lastName?: string | null): string | null {
    const name = [firstName, lastName].filter(Boolean).join(" ").trim()
    return name.length > 0 ? name : null
}

function getPrimaryEmailFromClerkUser(user: Awaited<ReturnType<typeof currentUser>>): string | null {
    if (!user) return null
    const primary = user.emailAddresses.find(
        (emailAddress) => emailAddress.id === user.primaryEmailAddressId
    )
    return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
}

async function getClerkProfileForFallbackUser(userId: string): Promise<ClerkUserProfile> {
    try {
        const clerkUser = await currentUser()
        if (!clerkUser || clerkUser.id !== userId) {
            return { email: null, username: null, avatarUrl: null }
        }

        return {
            email: getPrimaryEmailFromClerkUser(clerkUser),
            username: clerkUser.username ?? getDisplayName(clerkUser.firstName, clerkUser.lastName),
            avatarUrl: clerkUser.imageUrl ?? null,
        }
    } catch (error) {
        console.warn("[ensure-user-record] Failed to read Clerk profile for fallback sync:", error)
        return { email: null, username: null, avatarUrl: null }
    }
}

export async function ensureUserRecord(userId: string): Promise<EnsureUserRecordResult> {
    const supabaseAdmin = createServerClient()

    const { data: existingUser, error: existingUserError } = await supabaseAdmin
        .from("users")
        .select("id, role, credits")
        .eq("id", userId)
        .maybeSingle()

    if (existingUserError) {
        throw existingUserError
    }

    if (existingUser) {
        return { user: existingUser, created: false }
    }

    const profile = await getClerkProfileForFallbackUser(userId)
    const { error: insertError } = await supabaseAdmin.from("users").insert({
        id: userId,
        clerk_id: userId,
        email: profile.email,
        username: profile.username,
        avatar_url: profile.avatarUrl,
        role: "user",
        credits: 100,
    })

    if (insertError && insertError.code !== "23505") {
        throw insertError
    }

    const { data: insertedUser, error: insertedUserError } = await supabaseAdmin
        .from("users")
        .select("id, role, credits")
        .eq("id", userId)
        .single()

    if (insertedUserError || !insertedUser) {
        throw insertedUserError ?? new Error("Failed to load ensured user record")
    }

    return {
        user: insertedUser,
        created: !insertError,
    }
}
