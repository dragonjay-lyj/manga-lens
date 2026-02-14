"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    AlignLeft,
    AlignCenter,
    AlignRight,
    List,
} from "lucide-react"

interface RichTextEditorProps {
    value: string
    locale: "zh" | "en"
    placeholder?: string
    className?: string
    onChange: (nextHtml: string) => void
}

const TOOL_BUTTON_CLASSES = "h-7 w-7 p-0"

function ensureHtml(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) return ""
    if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed
    return trimmed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")
}

export function RichTextEditor({
    value,
    locale,
    placeholder,
    className,
    onChange,
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null)
    const [isFocused, setIsFocused] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [strokeColor, setStrokeColor] = useState("#000000")
    const [strokeWidth, setStrokeWidth] = useState(1)
    const [textOpacity, setTextOpacity] = useState(100)
    const normalizedValue = useMemo(() => ensureHtml(value), [value])

    const fontOptions = useMemo(
        () => [
            "Noto Sans CJK SC",
            "Noto Serif CJK SC",
            "Source Han Sans SC",
            "Source Han Serif SC",
            "Microsoft YaHei UI",
            "PingFang SC",
            "Hiragino Sans GB",
            "Arial",
            "Times New Roman",
            "Comic Sans MS",
            "Trebuchet MS",
            "Georgia",
            "Courier New",
        ],
        []
    )

    useEffect(() => {
        const editor = editorRef.current
        if (!editor) return
        if (isEditing) return
        if (editor.innerHTML !== normalizedValue) {
            editor.innerHTML = normalizedValue
        }
    }, [isEditing, normalizedValue])

    const syncToStore = () => {
        const editor = editorRef.current
        if (!editor) return
        onChange(editor.innerHTML)
    }

    const execute = (command: string, valueArg?: string) => {
        editorRef.current?.focus()
        document.execCommand(command, false, valueArg)
        syncToStore()
    }

    const applyInlineStyleToSelection = (styles: Record<string, string>) => {
        const editor = editorRef.current
        if (!editor) return
        editor.focus()
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const range = selection.getRangeAt(0)

        const span = document.createElement("span")
        Object.entries(styles).forEach(([key, value]) => {
            span.style.setProperty(key, value)
        })

        if (range.collapsed) {
            span.appendChild(document.createTextNode("\u200b"))
            range.insertNode(span)
            const cursorRange = document.createRange()
            cursorRange.setStart(span.firstChild as Node, 1)
            cursorRange.collapse(true)
            selection.removeAllRanges()
            selection.addRange(cursorRange)
            syncToStore()
            return
        }

        const content = range.extractContents()
        span.appendChild(content)
        range.insertNode(span)
        const highlightRange = document.createRange()
        highlightRange.selectNodeContents(span)
        selection.removeAllRanges()
        selection.addRange(highlightRange)
        syncToStore()
    }

    return (
        <div className={cn("space-y-1.5", className)}>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "加粗" : "Bold"}
                    onClick={() => execute("bold")}
                >
                    <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "斜体" : "Italic"}
                    onClick={() => execute("italic")}
                >
                    <Italic className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "下划线" : "Underline"}
                    onClick={() => execute("underline")}
                >
                    <Underline className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "删除线" : "Strikethrough"}
                    onClick={() => execute("strikeThrough")}
                >
                    <Strikethrough className="h-3.5 w-3.5" />
                </Button>
                <span className="mx-0.5 h-4 w-px bg-border" />
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "左对齐" : "Align left"}
                    onClick={() => execute("justifyLeft")}
                >
                    <AlignLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "居中对齐" : "Align center"}
                    onClick={() => execute("justifyCenter")}
                >
                    <AlignCenter className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "右对齐" : "Align right"}
                    onClick={() => execute("justifyRight")}
                >
                    <AlignRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    className={TOOL_BUTTON_CLASSES}
                    aria-label={locale === "zh" ? "项目符号" : "Bullet list"}
                    onClick={() => execute("insertUnorderedList")}
                >
                    <List className="h-3.5 w-3.5" />
                </Button>
                <select
                    className="ml-1 h-7 max-w-[220px] rounded border border-border bg-background px-1.5 text-[11px]"
                    defaultValue=""
                    aria-label={locale === "zh" ? "字体选择" : "Font family"}
                    onChange={(e) => {
                        if (!e.target.value) return
                        execute("fontName", e.target.value)
                        e.currentTarget.value = ""
                    }}
                >
                    <option value="">{locale === "zh" ? "字体" : "Font"}</option>
                    {fontOptions.map((font) => (
                        <option key={font} value={font} title={font}>
                            {font}
                        </option>
                    ))}
                </select>
                <label
                    className="ml-1 inline-flex h-7 items-center rounded border border-border bg-background px-1.5 text-[11px] text-muted-foreground"
                    aria-label={locale === "zh" ? "文本颜色" : "Text color"}
                >
                    <span className="mr-1">{locale === "zh" ? "色" : "A"}</span>
                    <input
                        type="color"
                        className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                        defaultValue="#111111"
                        aria-label={locale === "zh" ? "选择文本颜色" : "Choose text color"}
                        onChange={(e) => execute("foreColor", e.target.value)}
                    />
                </label>
                <label
                    className="inline-flex h-7 items-center rounded border border-border bg-background px-1.5 text-[11px] text-muted-foreground"
                    aria-label={locale === "zh" ? "描边颜色" : "Stroke color"}
                >
                    <span className="mr-1">{locale === "zh" ? "描边" : "Stroke"}</span>
                    <input
                        type="color"
                        className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
                        value={strokeColor}
                        aria-label={locale === "zh" ? "选择描边颜色" : "Choose stroke color"}
                        onChange={(e) => setStrokeColor(e.target.value)}
                    />
                </label>
                <input
                    type="number"
                    min={0}
                    max={6}
                    step={0.5}
                    value={strokeWidth}
                    aria-label={locale === "zh" ? "描边粗细" : "Stroke width"}
                    className="h-7 w-14 rounded border border-border bg-background px-1 text-[11px]"
                    onChange={(e) => setStrokeWidth(Number(e.target.value) || 0)}
                />
                <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() =>
                        applyInlineStyleToSelection({
                            "-webkit-text-stroke-color": strokeColor,
                            "-webkit-text-stroke-width": `${Math.max(0, strokeWidth)}px`,
                            "paint-order": "stroke fill",
                            "text-shadow": `0 0 0.6px ${strokeColor}`,
                        })
                    }
                >
                    {locale === "zh" ? "应用描边" : "Apply stroke"}
                </Button>
                <label className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    <span>{locale === "zh" ? "透明" : "Opacity"}</span>
                    <input
                        type="range"
                        min={10}
                        max={100}
                        step={5}
                        value={textOpacity}
                        aria-label={locale === "zh" ? "文本透明度" : "Text opacity"}
                        onChange={(e) => setTextOpacity(Number(e.target.value))}
                    />
                    <span className="w-8 text-right">{textOpacity}%</span>
                </label>
                <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() =>
                        applyInlineStyleToSelection({
                            opacity: `${Math.max(0.1, Math.min(1, textOpacity / 100))}`,
                        })
                    }
                >
                    {locale === "zh" ? "应用透明度" : "Apply opacity"}
                </Button>
            </div>

            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline
                aria-label={locale === "zh" ? "富文本译文编辑器" : "Rich text translation editor"}
                data-placeholder={placeholder || (locale === "zh" ? "输入译文..." : "Type translation...")}
                className={cn(
                    "min-h-16 rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs leading-relaxed outline-none",
                    "empty:before:pointer-events-none empty:before:block empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
                    isFocused ? "ring-1 ring-ring" : ""
                )}
                onFocus={() => {
                    setIsFocused(true)
                    setIsEditing(true)
                }}
                onBlur={() => {
                    setIsFocused(false)
                    setIsEditing(false)
                    syncToStore()
                }}
                onInput={syncToStore}
            />
        </div>
    )
}
