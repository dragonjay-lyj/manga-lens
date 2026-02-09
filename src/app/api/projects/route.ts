import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * 获取用户的项目列表
 */
export async function GET(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "20")
        const offset = (page - 1) * limit

        const { data, error, count } = await supabaseAdmin
            .from("projects")
            .select("*, project_images(count)", { count: "exact" })
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) {
            console.error("Error fetching projects:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // 转换数据格式
        const projects = data.map((project) => ({
            id: project.id,
            name: project.name,
            description: project.description,
            imageCount: project.project_images?.[0]?.count || 0,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
        }))

        return NextResponse.json({
            projects,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit),
            },
        })
    } catch (error) {
        console.error("Projects GET error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}

/**
 * 创建新项目
 */
export async function POST(request: Request) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { name, description } = body

        if (!name) {
            return NextResponse.json(
                { error: "Project name is required" },
                { status: 400 }
            )
        }

        const { data, error } = await supabaseAdmin
            .from("projects")
            .insert({
                user_id: userId,
                name,
                description: description || null,
            })
            .select()
            .single()

        if (error) {
            console.error("Error creating project:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ project: data })
    } catch (error) {
        console.error("Projects POST error:", error)
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        )
    }
}
