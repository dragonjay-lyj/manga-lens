import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// 浏览器端 Supabase 客户端
export function createBrowserClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    return createClient<Database>(supabaseUrl, supabaseAnonKey)
}

// 服务端 Supabase 客户端（使用 Service Role Key）
export function createServerClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}

// 导出单例实例（浏览器端使用）
let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function getSupabaseClient() {
    if (typeof window === 'undefined') {
        throw new Error('getSupabaseClient should only be called on the client side')
    }

    if (!browserClient) {
        browserClient = createBrowserClient()
    }

    return browserClient
}
