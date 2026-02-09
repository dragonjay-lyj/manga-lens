// Supabase 数据库类型定义

export interface Database {
    public: {
        Tables: {
            users: {
                Row: {
                    id: string
                    clerk_id: string
                    email: string
                    username: string | null
                    avatar_url: string | null
                    role: 'user' | 'admin'
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    clerk_id: string
                    email: string
                    username?: string | null
                    avatar_url?: string | null
                    role?: 'user' | 'admin'
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    clerk_id?: string
                    email?: string
                    username?: string | null
                    avatar_url?: string | null
                    role?: 'user' | 'admin'
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            projects: {
                Row: {
                    id: string
                    user_id: string
                    name: string
                    description: string | null
                    settings: ProjectSettings
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    name: string
                    description?: string | null
                    settings?: ProjectSettings
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    name?: string
                    description?: string | null
                    settings?: ProjectSettings
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            images: {
                Row: {
                    id: string
                    project_id: string
                    original_url: string
                    result_url: string | null
                    selections: Selection[]
                    prompt: string | null
                    status: 'pending' | 'processing' | 'completed' | 'failed'
                    error_message: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    project_id: string
                    original_url: string
                    result_url?: string | null
                    selections?: Selection[]
                    prompt?: string | null
                    status?: 'pending' | 'processing' | 'completed' | 'failed'
                    error_message?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    project_id?: string
                    original_url?: string
                    result_url?: string | null
                    selections?: Selection[]
                    prompt?: string | null
                    status?: 'pending' | 'processing' | 'completed' | 'failed'
                    error_message?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            api_configs: {
                Row: {
                    id: string
                    user_id: string
                    provider: 'gemini' | 'openai'
                    base_url: string | null
                    model: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    provider: 'gemini' | 'openai'
                    base_url?: string | null
                    model?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    provider?: 'gemini' | 'openai'
                    base_url?: string | null
                    model?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            usage_logs: {
                Row: {
                    id: string
                    user_id: string | null
                    action: string
                    details: Record<string, unknown>
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id?: string | null
                    action: string
                    details?: Record<string, unknown>
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string | null
                    action?: string
                    details?: Record<string, unknown>
                    created_at?: string
                }
                Relationships: []
            }
        }
        Views: Record<string, never>
        Functions: Record<string, never>
        Enums: Record<string, never>
        CompositeTypes: Record<string, never>
    }
}

// 选区类型
export interface Selection {
    id: string
    x: number
    y: number
    width: number
    height: number
}

// 项目设置类型
export interface ProjectSettings {
    provider?: 'gemini' | 'openai'
    model?: string
    concurrency?: number
    defaultPrompt?: string
}

// 图片处理状态
export type ImageStatus = 'pending' | 'processing' | 'completed' | 'failed'

// AI 提供商类型
export type AIProvider = 'gemini' | 'openai'

// 表类型便捷别名
export type User = Database['public']['Tables']['users']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type Image = Database['public']['Tables']['images']['Row']
export type ApiConfig = Database['public']['Tables']['api_configs']['Row']
export type UsageLog = Database['public']['Tables']['usage_logs']['Row']

export type UserInsert = Database['public']['Tables']['users']['Insert']
export type ProjectInsert = Database['public']['Tables']['projects']['Insert']
export type ImageInsert = Database['public']['Tables']['images']['Insert']
