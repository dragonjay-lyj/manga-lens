import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Selection, AIProvider } from '@/types/database'
import type { Locale } from '@/lib/i18n'
import type { SourceLanguageCode, TranslationDirection } from '@/lib/ai/ai-service'

export type SelectionProcessStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface SelectionProcessState {
    status: SelectionProcessStatus
    error?: string
}

export interface DetectedTextBBox {
    x: number
    y: number
    width: number
    height: number
}

export interface DetectedTextStyleHints {
    textColor?: string
    outlineColor?: string
    strokeColor?: string
    strokeWidth?: number
    textOpacity?: number
    fontFamily?: string
    angle?: number
    orientation?: "vertical" | "horizontal" | "auto"
    alignment?: "start" | "center" | "end" | "justify" | "auto"
    fontWeight?: string
}

export interface DetectedTextSegment {
    x: number
    y: number
    width: number
    height: number
}

export interface DetectedTextItem {
    sourceText: string
    translatedText: string
    bbox: DetectedTextBBox
    sourceLanguage?: string
    lines?: string[]
    segments?: DetectedTextSegment[]
    style?: DetectedTextStyleHints
    richTextHtml?: string
}

export interface GuideLine {
    id: string
    orientation: "horizontal" | "vertical"
    position: number
}

export interface AnnotationShape {
    id: string
    type: "rect" | "ellipse"
    x: number
    y: number
    width: number
    height: number
    strokeColor: string
    fillColor: string
    opacity: number
}

// 图片项类型
export interface ImageItem {
    id: string
    file: File
    originalUrl: string
    imageOnlyBaseUrl: string | null
    imageOnlyBaseName?: string
    resultUrl: string | null
    repairMaskUrl: string | null
    repairMaskUpdatedAt?: string
    selections: Selection[]
    selectionProgress: Record<string, SelectionProcessState>
    detectedTextBlocks: DetectedTextItem[]
    detectedTextUpdatedAt?: string
    guides: GuideLine[]
    annotationShapes: AnnotationShape[]
    status: 'idle' | 'processing' | 'completed' | 'failed'
    error?: string
}

// 导出格式类型
export type ExportFormat = 'png' | 'jpg' | 'webp'

// 编辑器设置
export interface EditorSettings {
    provider: AIProvider
    apiKey: string
    baseUrl: string
    model: string
    imageSize: '1K' | '2K' | '4K'
    concurrency: number
    isSerial: boolean
    maxRetries: number
    translationDirection: TranslationDirection
    sourceLanguageAllowlist: SourceLanguageCode[]
    enableAngleFilter: boolean
    angleThreshold: number
    detectionRegionMode: "full" | "selection_only" | "selection_ignore"
    chapterBulkTranslate: boolean
    comicType: "auto" | "manga" | "western"
    textStylePreset: "match-original" | "comic-bold" | "clean-serif"
    preferredOutputFontFamily: string
    enableComicModule: boolean
    enableBubbleDetection: boolean
    enableSelectionOcr: boolean
    enablePatchEditor: boolean
    defaultVerticalText: boolean
    useMaskMode: boolean
    useReverseMaskMode: boolean
    enablePretranslate: boolean
    exportFormat: ExportFormat
    exportQuality: number // 0-100，仅用于 jpg/webp
    useServerApi: boolean // 使用网站提供的 API
}

// 历史记录项
interface HistoryState {
    images: ImageItem[]
    currentImageId: string | null
}

// 编辑器状态
interface EditorState {
    // 图片列表
    images: ImageItem[]
    currentImageId: string | null

    // 编辑器设置
    settings: EditorSettings

    // 提示词
    prompt: string
    applyToAll: boolean

    // 视图状态
    showResult: boolean
    zoom: number
    panX: number
    panY: number

    // 语言
    locale: Locale

    // 处理状态
    isProcessing: boolean
    processingQueue: string[]

    // 历史记录（用于撤销/重做）
    history: HistoryState[]
    historyIndex: number
    maxHistory: number

    // Coin 余额
    coins: number
    coinsLoading: boolean

    // Actions
    addImages: (files: File[]) => void
    removeImage: (id: string) => void
    clearImages: () => void
    setCurrentImage: (id: string | null) => void

    updateSelections: (imageId: string, selections: Selection[]) => void
    clearSelections: (imageId: string) => void
    setImageOnlyBase: (imageId: string, imageOnlyBaseUrl: string | null, imageOnlyBaseName?: string) => void
    clearImageOnlyBase: (imageId: string) => void
    mergeResultIntoOriginal: (imageId: string) => void
    setRepairMask: (imageId: string, maskUrl: string | null) => void
    clearRepairMask: (imageId: string) => void
    setGuides: (imageId: string, guides: GuideLine[]) => void
    clearGuides: (imageId: string) => void
    setAnnotationShapes: (imageId: string, shapes: AnnotationShape[]) => void
    clearAnnotationShapes: (imageId: string) => void

    updateSettings: (settings: Partial<EditorSettings>) => void
    setPrompt: (prompt: string) => void
    setApplyToAll: (value: boolean) => void

    setShowResult: (value: boolean) => void
    setZoom: (zoom: number) => void
    setPan: (x: number, y: number) => void
    resetView: () => void

    setLocale: (locale: Locale) => void

    setImageStatus: (imageId: string, status: ImageItem['status'], resultUrl?: string, error?: string) => void
    initializeSelectionProgress: (imageId: string, selectionIds: string[]) => void
    setSelectionProgress: (
        imageId: string,
        selectionId: string,
        status: SelectionProcessStatus,
        error?: string
    ) => void
    clearSelectionProgress: (imageId: string) => void
    setDetectedTextBlocks: (imageId: string, blocks: DetectedTextItem[]) => void
    clearDetectedTextBlocks: (imageId: string) => void
    setProcessing: (value: boolean) => void
    addToQueue: (imageIds: string[]) => void
    removeFromQueue: (imageId: string) => void
    clearQueue: () => void

    // 历史记录操作
    undo: () => void
    redo: () => void
    canUndo: () => boolean
    canRedo: () => boolean
    saveToHistory: () => void
    setCoins: (coins: number) => void
    setCoinsLoading: (loading: boolean) => void
}

// 默认设置
const defaultSettings: EditorSettings = {
    provider: 'gemini',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gemini-2.5-flash-image',
    imageSize: '2K',
    concurrency: 3,
    isSerial: false,
    maxRetries: 2,
    translationDirection: "ja2zh",
    sourceLanguageAllowlist: [],
    enableAngleFilter: false,
    angleThreshold: 1,
    detectionRegionMode: "full",
    chapterBulkTranslate: false,
    comicType: "auto",
    textStylePreset: "match-original",
    preferredOutputFontFamily: "",
    enableComicModule: true,
    enableBubbleDetection: true,
    enableSelectionOcr: true,
    enablePatchEditor: true,
    defaultVerticalText: true,
    useMaskMode: false,
    useReverseMaskMode: false,
    enablePretranslate: false,
    exportFormat: 'png',
    exportQuality: 90,
    useServerApi: false,
}

// 生成唯一 ID
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useEditorStore = create<EditorState>()(
    persist(
        (set, get) => ({
            // 初始状态
            images: [],
            currentImageId: null,
            settings: defaultSettings,
            prompt: '',
            applyToAll: false,
            showResult: false,
            zoom: 1,
            panX: 0,
            panY: 0,
            locale: 'zh',
            isProcessing: false,
            processingQueue: [],
            history: [],
            historyIndex: -1,
            maxHistory: 50,
            coins: 0,
            coinsLoading: false,

            // 保存到历史记录
            saveToHistory: () => {
                const state = get()
                const historyState: HistoryState = {
                    images: state.images.map(img => ({ ...img })),
                    currentImageId: state.currentImageId,
                }

                // 如果当前不在历史记录末尾，删除后面的记录
                const newHistory = state.history.slice(0, state.historyIndex + 1)
                newHistory.push(historyState)

                // 限制历史记录数量
                if (newHistory.length > state.maxHistory) {
                    newHistory.shift()
                }

                set({
                    history: newHistory,
                    historyIndex: newHistory.length - 1,
                })
            },

            // 撤销
            undo: () => {
                const state = get()
                if (state.historyIndex > 0) {
                    const prevState = state.history[state.historyIndex - 1]
                    set({
                        images: prevState.images,
                        currentImageId: prevState.currentImageId,
                        historyIndex: state.historyIndex - 1,
                    })
                }
            },

            // 重做
            redo: () => {
                const state = get()
                if (state.historyIndex < state.history.length - 1) {
                    const nextState = state.history[state.historyIndex + 1]
                    set({
                        images: nextState.images,
                        currentImageId: nextState.currentImageId,
                        historyIndex: state.historyIndex + 1,
                    })
                }
            },

            // 是否可以撤销
            canUndo: () => {
                const state = get()
                return state.historyIndex > 0
            },

            // 是否可以重做
            canRedo: () => {
                const state = get()
                return state.historyIndex < state.history.length - 1
            },

            // 图片操作
            addImages: (files) => {
                const newImages: ImageItem[] = files.map((file) => ({
                    id: generateId(),
                    file,
                    originalUrl: URL.createObjectURL(file),
                    imageOnlyBaseUrl: null,
                    resultUrl: null,
                    repairMaskUrl: null,
                    selections: [],
                    selectionProgress: {},
                    detectedTextBlocks: [],
                    guides: [],
                    annotationShapes: [],
                    status: 'idle',
                }))

                set((state) => ({
                    images: [...state.images, ...newImages],
                    currentImageId: state.currentImageId || newImages[0]?.id || null,
                }))

                // 保存到历史
                get().saveToHistory()
            },

            removeImage: (id) => {
                // 先保存历史
                get().saveToHistory()

                set((state) => {
                    const image = state.images.find((img) => img.id === id)
                    if (image) {
                        URL.revokeObjectURL(image.originalUrl)
                        if (image.imageOnlyBaseUrl?.startsWith('blob:')) URL.revokeObjectURL(image.imageOnlyBaseUrl)
                        if (image.resultUrl) URL.revokeObjectURL(image.resultUrl)
                    }

                    const newImages = state.images.filter((img) => img.id !== id)
                    const newCurrentId = state.currentImageId === id
                        ? newImages[0]?.id || null
                        : state.currentImageId

                    return { images: newImages, currentImageId: newCurrentId }
                })
            },

            clearImages: () => {
                const { images } = get()
                images.forEach((img) => {
                    URL.revokeObjectURL(img.originalUrl)
                    if (img.imageOnlyBaseUrl?.startsWith('blob:')) URL.revokeObjectURL(img.imageOnlyBaseUrl)
                    if (img.resultUrl) URL.revokeObjectURL(img.resultUrl)
                })
                set({ images: [], currentImageId: null, history: [], historyIndex: -1 })
            },

            setCurrentImage: (id) => set({ currentImageId: id }),

            // 选区操作
            updateSelections: (imageId, selections) => {
                // 保存历史
                get().saveToHistory()

                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? {
                                ...img,
                                selections,
                                selectionProgress: selections.reduce<Record<string, SelectionProcessState>>((acc, selection) => {
                                    const currentProgress = img.selectionProgress ?? {}
                                    acc[selection.id] = currentProgress[selection.id] ?? { status: 'pending' }
                                    return acc
                                }, {}),
                            }
                            : img
                    ),
                }))
            },

            clearSelections: (imageId) => {
                // 保存历史
                get().saveToHistory()

                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId ? { ...img, selections: [], selectionProgress: {} } : img
                    ),
                }))
            },
            setImageOnlyBase: (imageId, imageOnlyBaseUrl, imageOnlyBaseName) => {
                set((state) => ({
                    images: state.images.map((img) => {
                        if (img.id !== imageId) return img
                        if (
                            img.imageOnlyBaseUrl &&
                            img.imageOnlyBaseUrl.startsWith('blob:') &&
                            img.imageOnlyBaseUrl !== imageOnlyBaseUrl
                        ) {
                            URL.revokeObjectURL(img.imageOnlyBaseUrl)
                        }
                        return {
                            ...img,
                            imageOnlyBaseUrl,
                            imageOnlyBaseName: imageOnlyBaseUrl ? imageOnlyBaseName : undefined,
                        }
                    }),
                }))
            },
            clearImageOnlyBase: (imageId) => {
                set((state) => ({
                    images: state.images.map((img) => {
                        if (img.id !== imageId) return img
                        if (img.imageOnlyBaseUrl?.startsWith('blob:')) {
                            URL.revokeObjectURL(img.imageOnlyBaseUrl)
                        }
                        return {
                            ...img,
                            imageOnlyBaseUrl: null,
                            imageOnlyBaseName: undefined,
                        }
                    }),
                }))
            },
            mergeResultIntoOriginal: (imageId) => {
                const targetImage = get().images.find((img) => img.id === imageId)
                if (!targetImage?.resultUrl) return
                if (targetImage.originalUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(targetImage.originalUrl)
                }
                if (targetImage.imageOnlyBaseUrl?.startsWith('blob:')) {
                    URL.revokeObjectURL(targetImage.imageOnlyBaseUrl)
                }

                // 保存历史，支持撤销
                get().saveToHistory()

                set((state) => ({
                    showResult: false,
                    images: state.images.map((img) => {
                        if (img.id !== imageId || !img.resultUrl) return img
                        return {
                            ...img,
                            originalUrl: img.resultUrl,
                            imageOnlyBaseUrl: null,
                            imageOnlyBaseName: undefined,
                            resultUrl: null,
                            repairMaskUrl: null,
                            repairMaskUpdatedAt: undefined,
                            selections: [],
                            selectionProgress: {},
                            detectedTextBlocks: [],
                            detectedTextUpdatedAt: undefined,
                            guides: [],
                            annotationShapes: [],
                            status: 'idle',
                            error: undefined,
                        }
                    }),
                }))
            },

            setRepairMask: (imageId, maskUrl) => {
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? {
                                ...img,
                                repairMaskUrl: maskUrl,
                                repairMaskUpdatedAt: maskUrl ? new Date().toISOString() : undefined,
                            }
                            : img
                    ),
                }))
            },

            clearRepairMask: (imageId) => {
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? {
                                ...img,
                                repairMaskUrl: null,
                                repairMaskUpdatedAt: undefined,
                            }
                            : img
                    ),
                }))
            },

            setGuides: (imageId, guides) => {
                get().saveToHistory()
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? { ...img, guides }
                            : img
                    ),
                }))
            },

            clearGuides: (imageId) => {
                get().saveToHistory()
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? { ...img, guides: [] }
                            : img
                    ),
                }))
            },

            setAnnotationShapes: (imageId, shapes) => {
                get().saveToHistory()
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? { ...img, annotationShapes: shapes }
                            : img
                    ),
                }))
            },

            clearAnnotationShapes: (imageId) => {
                get().saveToHistory()
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? { ...img, annotationShapes: [] }
                            : img
                    ),
                }))
            },

            setDetectedTextBlocks: (imageId, blocks) => {
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? {
                                ...img,
                                detectedTextBlocks: blocks,
                                detectedTextUpdatedAt: new Date().toISOString(),
                            }
                            : img
                    ),
                }))
            },

            clearDetectedTextBlocks: (imageId) => {
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? {
                                ...img,
                                detectedTextBlocks: [],
                                detectedTextUpdatedAt: undefined,
                            }
                            : img
                    ),
                }))
            },

            // 设置操作
            updateSettings: (newSettings) => {
                set((state) => ({
                    settings: { ...state.settings, ...newSettings },
                }))
            },

            setPrompt: (prompt) => set({ prompt }),
            setApplyToAll: (value) => set({ applyToAll: value }),

            // 视图操作
            setShowResult: (value) => set({ showResult: value }),
            setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
            setPan: (x, y) => set({ panX: x, panY: y }),
            resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),

            // 语言
            setLocale: (locale) => set({ locale }),

            // 处理状态
            setImageStatus: (imageId, status, resultUrl, error) => {
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? { ...img, status, resultUrl: resultUrl ?? img.resultUrl, error }
                            : img
                    ),
                }))
            },

            initializeSelectionProgress: (imageId, selectionIds) => {
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId
                            ? {
                                ...img,
                                selectionProgress: selectionIds.reduce<Record<string, SelectionProcessState>>((acc, selectionId) => {
                                    acc[selectionId] = { status: 'pending' }
                                    return acc
                                }, {}),
                            }
                            : img
                    ),
                }))
            },

            setSelectionProgress: (imageId, selectionId, status, error) => {
                set((state) => ({
                    images: state.images.map((img) => {
                        if (img.id !== imageId) return img
                        return {
                            ...img,
                            selectionProgress: {
                                ...(img.selectionProgress ?? {}),
                                [selectionId]: {
                                    status,
                                    ...(error ? { error } : {}),
                                },
                            },
                        }
                    }),
                }))
            },

            clearSelectionProgress: (imageId) => {
                set((state) => ({
                    images: state.images.map((img) =>
                        img.id === imageId ? { ...img, selectionProgress: {} } : img
                    ),
                }))
            },

            setProcessing: (value) => set({ isProcessing: value }),

            addToQueue: (imageIds) => {
                set((state) => ({
                    processingQueue: [...state.processingQueue, ...imageIds],
                }))
            },

            removeFromQueue: (imageId) => {
                set((state) => ({
                    processingQueue: state.processingQueue.filter((id) => id !== imageId),
                }))
            },

            clearQueue: () => set({ processingQueue: [] }),

            // Coin 余额
            setCoins: (coins) => set({ coins }),
            setCoinsLoading: (loading) => set({ coinsLoading: loading }),
        }),
        {
            name: 'manga-lens-editor',
            partialize: (state) => ({
                settings: state.settings,
                prompt: state.prompt,
                locale: state.locale,
            }),
        }
    )
)

// 获取当前图片的 selector
export const useCurrentImage = () => {
    return useEditorStore((state) =>
        state.images.find((img) => img.id === state.currentImageId) || null
    )
}
