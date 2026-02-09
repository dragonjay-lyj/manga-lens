import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import * as crypto from "crypto"

// 使用 Service Role Key 绕过 RLS
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// AES-256 加密密钥（从环境变量获取，32 字节）
const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_SECRET
const IV_LENGTH = 16

function getEncryptionKey(): Buffer {
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
        throw new Error("API_KEY_ENCRYPTION_SECRET 未配置或长度不足 32 位")
    }
    return Buffer.from(ENCRYPTION_KEY.slice(0, 32))
}

/**
 * AES-256-CBC 加密
 */
function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH)
    const key = getEncryptionKey()
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
    let encrypted = cipher.update(text)
    encrypted = Buffer.concat([encrypted, cipher.final()])
    return iv.toString("hex") + ":" + encrypted.toString("hex")
}

/**
 * AES-256-CBC 解密
 */
function decrypt(text: string): string {
    const [ivHex, encryptedHex] = text.split(":")
    if (!ivHex || !encryptedHex) {
        // 兼容旧版 base64 编码
        return Buffer.from(text, "base64").toString("utf-8")
    }
    const iv = Buffer.from(ivHex, "hex")
    const encrypted = Buffer.from(encryptedHex, "hex")
    const key = getEncryptionKey()
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString()
}

/**
 * 掩码 API Key（只显示前后几位）
 */
function maskApiKey(encryptedKey: string): string {
    try {
        const key = decrypt(encryptedKey)
        if (key.length <= 8) return "****"
        return key.slice(0, 4) + "****" + key.slice(-4)
    } catch {
        return "****"
    }
}

/**
 * 获取用户的 API Key（解密后返回预览）
 */
export async function GET() {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { data, error } = await supabaseAdmin
            .from("user_api_keys")
            .select("provider, encrypted_key, created_at, updated_at")
            .eq("user_id", userId)

        if (error) {
            console.error("Error fetching API keys:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // 返回带掩码的 API Key
        const maskedKeys = data.map((item) => ({
            provider: item.provider,
            keyPreview: maskApiKey(item.encrypted_key),
            updatedAt: item.updated_at,
        }))

        return NextResponse.json({ keys: maskedKeys })
    } catch (error) {
        console.error("API keys GET error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

/**
 * 保存用户的 API Key（使用 AES-256 加密）
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { provider, apiKey } = body

        if (!provider || !apiKey) {
            return NextResponse.json(
                { error: "Provider and apiKey are required" },
                { status: 400 }
            )
        }

        // 验证 provider
        const validProviders = ["gemini", "openai", "custom"]
        if (!validProviders.includes(provider)) {
            return NextResponse.json(
                { error: "Invalid provider" },
                { status: 400 }
            )
        }

        // AES-256 加密存储
        const encryptedKey = encrypt(apiKey)

        // Upsert API Key
        const { error } = await supabaseAdmin.from("user_api_keys").upsert(
            {
                user_id: userId,
                provider,
                encrypted_key: encryptedKey,
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: "user_id,provider",
            }
        )

        if (error) {
            console.error("Error saving API key:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("API keys POST error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

/**
 * 删除用户的 API Key
 */
export async function DELETE(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const provider = searchParams.get("provider")

        if (!provider) {
            return NextResponse.json(
                { error: "Provider is required" },
                { status: 400 }
            )
        }

        const { error } = await supabaseAdmin
            .from("user_api_keys")
            .delete()
            .eq("user_id", userId)
            .eq("provider", provider)

        if (error) {
            console.error("Error deleting API key:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("API keys DELETE error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
