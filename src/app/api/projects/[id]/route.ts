import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { createServerClient } from "@/lib/supabase/client"

const supabaseAdmin = createServerClient()

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()
        const name = body?.name ? String(body.name).trim() : ""
        const description = body?.description ?? null

        if (!id || !name) {
            return NextResponse.json({ error: "项目名称不能为空" }, { status: 400 })
        }

        const { data, error } = await supabaseAdmin
            .from("projects")
            .update({
                name,
                description: description ? String(description) : null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("user_id", userId)
            .select()
            .single()

        if (error || !data) {
            return NextResponse.json({ error: "更新项目失败" }, { status: 404 })
        }

        return NextResponse.json({ project: data })
    } catch (error) {
        console.error("Projects PATCH error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { id } = await params
        if (!id) {
            return NextResponse.json({ error: "缺少项目 ID" }, { status: 400 })
        }

        const { error } = await supabaseAdmin
            .from("projects")
            .delete()
            .eq("id", id)
            .eq("user_id", userId)

        if (error) {
            console.error("Delete project error:", error)
            return NextResponse.json({ error: "删除项目失败" }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Projects DELETE error:", error)
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
}
