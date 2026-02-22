"use client"

import type { PixelData, Psd, ReadOptions } from "ag-psd"

const TIFF_EXTENSIONS = new Set(["tif", "tiff"])
const PSD_EXTENSIONS = new Set(["psd"])
const PDF_EXTENSIONS = new Set(["pdf"])
const ZIP_ARCHIVE_EXTENSIONS = new Set(["zip", "cbz"])
const UNSUPPORTED_ARCHIVE_EXTENSIONS = new Set(["rar", "cbr", "7z"])
const COMMON_IMAGE_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "avif",
    "heic",
    "heif",
    "svg",
    ...TIFF_EXTENSIONS,
    ...PSD_EXTENSIONS,
])

const TIFF_MIME_TYPES = new Set([
    "image/tiff",
    "image/x-tiff",
    "application/tiff",
])

const PSD_MIME_TYPES = new Set([
    "image/vnd.adobe.photoshop",
    "image/x-photoshop",
    "application/photoshop",
    "application/x-photoshop",
    "application/x-photoshop-image",
    "application/psd",
    "image/psd",
])

const PDF_MIME_TYPES = new Set([
    "application/pdf",
    "application/x-pdf",
])

export const EDITOR_IMAGE_ACCEPT = "image/*,.tif,.tiff,.psd,.pdf,.zip,.cbz,.rar,.cbr,.7z"

export interface NormalizeEditorImageFilesResult {
    files: File[]
    convertedCount: number
    pdfExpandedPages: number
    pdfSourceFiles: number
    failed: Array<{ fileName: string; reason: string }>
}

export interface ExpandEditorUploadFilesResult {
    files: File[]
    archiveSourceFiles: number
    archiveExpandedEntries: number
    unsupportedArchives: string[]
    failed: Array<{ fileName: string; reason: string }>
}

interface UtifIfd {
    width?: number
    height?: number
    t256?: number[]
    t257?: number[]
}

interface UtifModule {
    decode: (buffer: ArrayBuffer) => UtifIfd[]
    decodeImage: (buffer: ArrayBuffer, ifd: UtifIfd) => void
    toRGBA8: (ifd: UtifIfd) => Uint8Array
}

interface AgPsdModule {
    initializeCanvas: (
        createCanvasMethod: (width: number, height: number) => HTMLCanvasElement,
        createImageDataMethod?: (width: number, height: number) => ImageData
    ) => void
    readPsd: (buffer: ArrayBuffer, options?: ReadOptions) => Psd
}

interface JsZipEntry {
    name: string
    dir: boolean
    async: (type: "blob") => Promise<Blob>
}

interface JsZipArchive {
    files: Record<string, JsZipEntry>
}

interface JsZipModule {
    loadAsync: (data: ArrayBuffer) => Promise<JsZipArchive>
}

let psdCanvasInitialized = false

function getFileExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf(".")
    if (dotIndex < 0 || dotIndex >= fileName.length - 1) return ""
    return fileName.slice(dotIndex + 1).toLowerCase()
}

function replaceFileExtension(fileName: string, extension: string): string {
    const dotIndex = fileName.lastIndexOf(".")
    if (dotIndex < 0) return `${fileName}.${extension}`
    return `${fileName.slice(0, dotIndex)}.${extension}`
}

function isTiffFile(file: File): boolean {
    const ext = getFileExtension(file.name)
    return TIFF_EXTENSIONS.has(ext) || TIFF_MIME_TYPES.has(file.type.toLowerCase())
}

function isPsdFile(file: File): boolean {
    const ext = getFileExtension(file.name)
    return PSD_EXTENSIONS.has(ext) || PSD_MIME_TYPES.has(file.type.toLowerCase())
}

function isPdfFile(file: File): boolean {
    const ext = getFileExtension(file.name)
    return PDF_EXTENSIONS.has(ext) || PDF_MIME_TYPES.has(file.type.toLowerCase())
}

function isZipArchiveFile(file: File): boolean {
    const ext = getFileExtension(file.name)
    return ZIP_ARCHIVE_EXTENSIONS.has(ext)
}

function isUnsupportedArchiveFile(file: File): boolean {
    const ext = getFileExtension(file.name)
    return UNSUPPORTED_ARCHIVE_EXTENSIONS.has(ext)
}

export function isEditorSupportedUploadFile(file: File): boolean {
    if (isPdfFile(file)) return true
    if (isTiffFile(file) || isPsdFile(file)) return true
    if (file.type.startsWith("image/")) return true
    return COMMON_IMAGE_EXTENSIONS.has(getFileExtension(file.name))
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    return canvas
}

async function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/png")
    })
    if (!blob) {
        throw new Error("CANVAS_TO_BLOB_FAILED")
    }
    return new File([blob], replaceFileExtension(fileName, "png"), {
        type: "image/png",
        lastModified: Date.now(),
    })
}

function imageDataToCanvas(pixelData: PixelData): HTMLCanvasElement {
    const canvas = createCanvas(pixelData.width, pixelData.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
        throw new Error("CANVAS_CONTEXT_FAILED")
    }
    const { data, width, height } = pixelData
    const normalizedData = new Uint8ClampedArray(width * height * 4)
    normalizedData.set(data as ArrayLike<number>)
    ctx.putImageData(new ImageData(normalizedData, width, height), 0, 0)
    return canvas
}

async function convertTiffToPng(file: File): Promise<File> {
    const utifModule = await import("utif")
    const utif = ((utifModule as { default?: unknown }).default || utifModule) as unknown as UtifModule
    const buffer = await file.arrayBuffer()
    const ifds = utif.decode(buffer)
    if (!ifds.length) {
        throw new Error("TIFF_EMPTY")
    }
    const firstIfd = ifds[0]
    utif.decodeImage(buffer, firstIfd)
    const rgba = utif.toRGBA8(firstIfd)
    const width = Number(firstIfd.width ?? firstIfd.t256?.[0] ?? 0)
    const height = Number(firstIfd.height ?? firstIfd.t257?.[0] ?? 0)

    if (!width || !height || rgba.length < width * height * 4) {
        throw new Error("TIFF_DECODE_FAILED")
    }

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext("2d")
    if (!ctx) {
        throw new Error("CANVAS_CONTEXT_FAILED")
    }
    const data = new Uint8ClampedArray(width * height * 4)
    data.set(rgba.subarray(0, width * height * 4))
    ctx.putImageData(new ImageData(data, width, height), 0, 0)
    return canvasToPngFile(canvas, file.name)
}

function ensurePsdCanvasInitialized(agPsd: AgPsdModule) {
    if (psdCanvasInitialized) return
    agPsd.initializeCanvas(
        (width, height) => createCanvas(width, height),
        (width, height) => new ImageData(width, height)
    )
    psdCanvasInitialized = true
}

async function convertPsdToPng(file: File): Promise<File> {
    const agPsd = await import("ag-psd") as unknown as AgPsdModule
    ensurePsdCanvasInitialized(agPsd)
    const buffer = await file.arrayBuffer()
    const psd = agPsd.readPsd(buffer, {
        skipLayerImageData: true,
        skipThumbnail: true,
    })

    let sourceCanvas = psd.canvas
    if (!sourceCanvas && psd.imageData) {
        sourceCanvas = imageDataToCanvas(psd.imageData)
    }
    if (!sourceCanvas) {
        throw new Error("PSD_DECODE_FAILED")
    }

    const output = createCanvas(psd.width || sourceCanvas.width, psd.height || sourceCanvas.height)
    const ctx = output.getContext("2d")
    if (!ctx) {
        throw new Error("CANVAS_CONTEXT_FAILED")
    }
    ctx.drawImage(sourceCanvas, 0, 0, output.width, output.height)
    return canvasToPngFile(output, file.name)
}

interface PdfJsPage {
    getViewport: (params: { scale: number }) => { width: number; height: number }
    render: (params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
    cleanup?: () => void
}

interface PdfJsDocument {
    numPages: number
    getPage: (pageNumber: number) => Promise<PdfJsPage>
    destroy?: () => void
}

interface PdfJsLib {
    version?: string
    GlobalWorkerOptions: { workerSrc: string }
    getDocument: (params: { data: Uint8Array }) => { promise: Promise<PdfJsDocument> }
}

async function convertPdfToPngPages(file: File): Promise<File[]> {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as PdfJsLib
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const version = pdfjs.version || "5.4.296"
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const loadingTask = pdfjs.getDocument({ data: bytes })
    const pdf = await loadingTask.promise

    const outputFiles: File[] = []
    const dotIndex = file.name.lastIndexOf(".")
    const baseName = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name
    const totalPages = pdf.numPages

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber)
        const baseScale = 2
        const baseViewport = page.getViewport({ scale: baseScale })
        const longEdge = Math.max(baseViewport.width, baseViewport.height)
        const maxLongEdge = 4096
        const adaptiveScale = longEdge > maxLongEdge
            ? baseScale * (maxLongEdge / longEdge)
            : baseScale
        const viewport = page.getViewport({ scale: adaptiveScale })

        const canvas = createCanvas(Math.max(1, Math.round(viewport.width)), Math.max(1, Math.round(viewport.height)))
        const ctx = canvas.getContext("2d")
        if (!ctx) {
            throw new Error("CANVAS_CONTEXT_FAILED")
        }

        await page.render({
            canvasContext: ctx,
            viewport,
        }).promise

        const pageSuffix = String(pageNumber).padStart(3, "0")
        outputFiles.push(
            await canvasToPngFile(canvas, `${baseName}-p${pageSuffix}.png`)
        )
        page.cleanup?.()
    }

    pdf.destroy?.()
    return outputFiles
}

function getNormalizeErrorMessage(raw: unknown): string {
    const message = raw instanceof Error ? raw.message : String(raw || "")
    if (message.includes("TIFF_EMPTY") || message.includes("TIFF_DECODE_FAILED")) {
        return "TIFF decode failed"
    }
    if (message.includes("PSD_DECODE_FAILED")) {
        return "PSD decode failed"
    }
    if (message.toLowerCase().includes("pdf")) {
        return "PDF decode failed"
    }
    if (message.includes("CANVAS_CONTEXT_FAILED") || message.includes("CANVAS_TO_BLOB_FAILED")) {
        return "Canvas conversion failed"
    }
    return message || "Unsupported image format"
}

function sanitizeArchiveEntryName(input: string): string {
    return input
        .replace(/\\/g, "/")
        .split("/")
        .filter(Boolean)
        .join("_")
}

function guessMimeFromFileName(fileName: string): string {
    const ext = getFileExtension(fileName)
    if (ext === "png") return "image/png"
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
    if (ext === "webp") return "image/webp"
    if (ext === "gif") return "image/gif"
    if (ext === "bmp") return "image/bmp"
    if (ext === "avif") return "image/avif"
    if (ext === "heic") return "image/heic"
    if (ext === "heif") return "image/heif"
    if (ext === "svg") return "image/svg+xml"
    if (ext === "tif" || ext === "tiff") return "image/tiff"
    if (ext === "psd") return "image/vnd.adobe.photoshop"
    if (ext === "pdf") return "application/pdf"
    return "application/octet-stream"
}

export async function expandEditorUploadFiles(files: File[]): Promise<ExpandEditorUploadFilesResult> {
    const result: ExpandEditorUploadFilesResult = {
        files: [],
        archiveSourceFiles: 0,
        archiveExpandedEntries: 0,
        unsupportedArchives: [],
        failed: [],
    }

    let jsZipModule: JsZipModule | null = null

    for (const file of files) {
        if (isUnsupportedArchiveFile(file)) {
            result.unsupportedArchives.push(file.name)
            continue
        }
        if (!isZipArchiveFile(file)) {
            result.files.push(file)
            continue
        }

        result.archiveSourceFiles += 1
        try {
            if (!jsZipModule) {
                const imported = await import("jszip")
                jsZipModule = ((imported as { default?: unknown }).default || imported) as unknown as JsZipModule
            }
            const zip = await jsZipModule.loadAsync(await file.arrayBuffer())
            const archiveBase = file.name.replace(/\.[^.]+$/, "")
            const entries = Object.values(zip.files).filter((entry) => !entry.dir)
            let extractedCount = 0

            for (const entry of entries) {
                const entryName = sanitizeArchiveEntryName(entry.name)
                const ext = getFileExtension(entryName)
                if (!COMMON_IMAGE_EXTENSIONS.has(ext) && !PDF_EXTENSIONS.has(ext)) {
                    continue
                }
                const blob = await entry.async("blob")
                const outputName = `${archiveBase}-${entryName}`
                result.files.push(new File([blob], outputName, {
                    type: blob.type || guessMimeFromFileName(outputName),
                    lastModified: Date.now(),
                }))
                extractedCount += 1
            }

            result.archiveExpandedEntries += extractedCount
            if (extractedCount === 0) {
                result.failed.push({
                    fileName: file.name,
                    reason: "Archive has no supported image entries",
                })
            }
        } catch {
            result.failed.push({
                fileName: file.name,
                reason: "Archive parse failed",
            })
        }
    }

    return result
}

export async function normalizeEditorImageFiles(files: File[]): Promise<NormalizeEditorImageFilesResult> {
    const result: NormalizeEditorImageFilesResult = {
        files: [],
        convertedCount: 0,
        pdfExpandedPages: 0,
        pdfSourceFiles: 0,
        failed: [],
    }

    for (const file of files) {
        if (!isEditorSupportedUploadFile(file)) {
            result.failed.push({
                fileName: file.name,
                reason: "Unsupported image format",
            })
            continue
        }

        try {
            if (isPdfFile(file)) {
                const pages = await convertPdfToPngPages(file)
                result.files.push(...pages)
                result.pdfExpandedPages += pages.length
                result.pdfSourceFiles += 1
                continue
            }
            if (isTiffFile(file)) {
                const converted = await convertTiffToPng(file)
                result.files.push(converted)
                result.convertedCount += 1
                continue
            }
            if (isPsdFile(file)) {
                const converted = await convertPsdToPng(file)
                result.files.push(converted)
                result.convertedCount += 1
                continue
            }
            result.files.push(file)
        } catch (error) {
            result.failed.push({
                fileName: file.name,
                reason: getNormalizeErrorMessage(error),
            })
        }
    }

    return result
}
