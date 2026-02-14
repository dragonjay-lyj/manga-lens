// 图片处理工具函数

import type { Selection } from '@/types/database'

/**
 * 将 File 转换为 base64 字符串
 */
export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

/**
 * 将 base64 字符串转换为 Blob
 */
export function base64ToBlob(base64: string, mimeType: string = 'image/png'): Blob {
    const byteString = atob(base64.split(',')[1])
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
    }
    return new Blob([ab], { type: mimeType })
}

/**
 * 导出格式类型
 */
export type ExportFormat = 'png' | 'jpg' | 'webp'

/**
 * 将图片转换为指定格式
 */
export async function convertToFormat(
    dataUrl: string,
    format: ExportFormat,
    quality: number = 90
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')!

            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)

            const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`
            const qualityValue = format === 'png' ? undefined : quality / 100

            resolve(canvas.toDataURL(mimeType, qualityValue))
        }
        img.onerror = reject
        img.src = dataUrl
    })
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(format: ExportFormat): string {
    return format === 'jpg' ? 'jpg' : format
}

interface NormalizedSelection {
    x: number
    y: number
    width: number
    height: number
}

interface SelectionCropRegion {
    cropX: number
    cropY: number
    cropWidth: number
    cropHeight: number
    selectionX: number
    selectionY: number
    selectionWidth: number
    selectionHeight: number
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function normalizeSelection(
    selection: Selection,
    imageWidth: number,
    imageHeight: number
): NormalizedSelection {
    const maxX = Math.max(imageWidth - 1, 0)
    const maxY = Math.max(imageHeight - 1, 0)
    const x = clamp(Math.round(selection.x), 0, maxX)
    const y = clamp(Math.round(selection.y), 0, maxY)

    const maxWidth = Math.max(imageWidth - x, 1)
    const maxHeight = Math.max(imageHeight - y, 1)

    return {
        x,
        y,
        width: clamp(Math.round(selection.width), 1, maxWidth),
        height: clamp(Math.round(selection.height), 1, maxHeight),
    }
}

function getSelectionCropRegion(
    imageWidth: number,
    imageHeight: number,
    selection: Selection,
    padding: number
): SelectionCropRegion {
    const safePadding = Math.max(0, Math.round(padding))
    const normalized = normalizeSelection(selection, imageWidth, imageHeight)

    const cropX = Math.max(0, normalized.x - safePadding)
    const cropY = Math.max(0, normalized.y - safePadding)
    const cropWidth = Math.min(imageWidth - cropX, normalized.width + safePadding * 2)
    const cropHeight = Math.min(imageHeight - cropY, normalized.height + safePadding * 2)

    return {
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        selectionX: normalized.x,
        selectionY: normalized.y,
        selectionWidth: normalized.width,
        selectionHeight: normalized.height,
    }
}

/**
 * 从 Image 元素中裁剪选区
 */
export function cropSelection(
    image: HTMLImageElement,
    selection: Selection,
    padding: number = 10
): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const region = getSelectionCropRegion(image.width, image.height, selection, padding)

    canvas.width = region.cropWidth
    canvas.height = region.cropHeight

    ctx.drawImage(
        image,
        region.cropX,
        region.cropY,
        region.cropWidth,
        region.cropHeight,
        0,
        0,
        region.cropWidth,
        region.cropHeight
    )

    return canvas.toDataURL('image/png')
}

/**
 * 裁剪选区并先清空选区中心区域（用于减少原文与译文重叠）
 */
export function cropSelectionWithClearedArea(
    image: HTMLImageElement,
    selection: Selection,
    padding: number = 10,
    clearColor: string = '#ffffff',
    clearPadding: number = 0
): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const region = getSelectionCropRegion(image.width, image.height, selection, padding)

    canvas.width = region.cropWidth
    canvas.height = region.cropHeight

    ctx.drawImage(
        image,
        region.cropX,
        region.cropY,
        region.cropWidth,
        region.cropHeight,
        0,
        0,
        region.cropWidth,
        region.cropHeight
    )

    const localSelectionX = region.selectionX - region.cropX
    const localSelectionY = region.selectionY - region.cropY
    const safeClearPadding = Math.max(0, Math.round(clearPadding))

    const clearX = Math.max(0, localSelectionX - safeClearPadding)
    const clearY = Math.max(0, localSelectionY - safeClearPadding)
    const clearRight = Math.min(region.cropWidth, localSelectionX + region.selectionWidth + safeClearPadding)
    const clearBottom = Math.min(region.cropHeight, localSelectionY + region.selectionHeight + safeClearPadding)
    const clearWidth = Math.max(1, clearRight - clearX)
    const clearHeight = Math.max(1, clearBottom - clearY)

    ctx.fillStyle = clearColor
    ctx.fillRect(clearX, clearY, clearWidth, clearHeight)

    return canvas.toDataURL('image/png')
}

/**
 * 将 Image 元素导出为 data URL
 */
export function imageToDataUrl(image: HTMLImageElement): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = image.width
    canvas.height = image.height
    ctx.drawImage(image, 0, 0)
    return canvas.toDataURL('image/png')
}

/**
 * 创建全图遮罩：仅保留选区区域，其余填充白色
 */
export function createMaskedImage(
    image: HTMLImageElement,
    selections: Selection[],
    backgroundColor: string = '#ffffff',
    padding: number = 0
): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = image.width
    canvas.height = image.height

    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (const selection of selections) {
        const region = getSelectionCropRegion(image.width, image.height, selection, padding)
        ctx.drawImage(
            image,
            region.cropX,
            region.cropY,
            region.cropWidth,
            region.cropHeight,
            region.cropX,
            region.cropY,
            region.cropWidth,
            region.cropHeight
        )
    }

    return canvas.toDataURL('image/png')
}

/**
 * 创建反向遮罩：保留原图，仅将选区填充为白色（用于“选区不发给 AI”）
 */
export function createInverseMaskedImage(
    image: HTMLImageElement,
    selections: Selection[],
    fillColor: string = '#ffffff',
    padding: number = 0
): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = image.width
    canvas.height = image.height

    // 先保留整张原图上下文
    ctx.drawImage(image, 0, 0)
    ctx.fillStyle = fillColor

    // 仅清空选区，让模型补全选区内容
    for (const selection of selections) {
        const region = getSelectionCropRegion(image.width, image.height, selection, padding)
        ctx.fillRect(region.cropX, region.cropY, region.cropWidth, region.cropHeight)
    }

    return canvas.toDataURL('image/png')
}

/**
 * 将生成的补丁合成回原图
 */
export function compositeImage(
    originalImage: HTMLImageElement,
    patchBase64: string,
    selection: Selection,
    padding: number = 10,
    blendPadding: number = 0
): Promise<string> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!

        canvas.width = originalImage.width
        canvas.height = originalImage.height

        // 绘制原图
        ctx.drawImage(originalImage, 0, 0)

        // 加载补丁图片
        const patchImage = new Image()
        patchImage.onload = () => {
            const region = getSelectionCropRegion(
                originalImage.width,
                originalImage.height,
                selection,
                padding
            )
            const scaleX = patchImage.width / region.cropWidth
            const scaleY = patchImage.height / region.cropHeight
            const safeBlendPadding = Math.max(0, Math.round(blendPadding))
            const extendLeft = Math.min(safeBlendPadding, region.selectionX - region.cropX)
            const extendTop = Math.min(safeBlendPadding, region.selectionY - region.cropY)
            const extendRight = Math.min(
                safeBlendPadding,
                region.cropX + region.cropWidth - (region.selectionX + region.selectionWidth)
            )
            const extendBottom = Math.min(
                safeBlendPadding,
                region.cropY + region.cropHeight - (region.selectionY + region.selectionHeight)
            )
            const pasteX = region.selectionX - extendLeft
            const pasteY = region.selectionY - extendTop
            const pasteWidth = region.selectionWidth + extendLeft + extendRight
            const pasteHeight = region.selectionHeight + extendTop + extendBottom
            const srcX = (pasteX - region.cropX) * scaleX
            const srcY = (pasteY - region.cropY) * scaleY
            const srcWidth = pasteWidth * scaleX
            const srcHeight = pasteHeight * scaleY

            // 贴回选区并做少量外扩，减少边缘文字被裁切
            ctx.drawImage(
                patchImage,
                srcX,
                srcY,
                srcWidth,
                srcHeight,
                pasteX,
                pasteY,
                pasteWidth,
                pasteHeight
            )

            resolve(canvas.toDataURL('image/png'))
        }
        patchImage.onerror = reject
        patchImage.src = patchBase64
    })
}

/**
 * 合成多个选区的补丁
 */
export async function compositeMultiplePatches(
    originalImage: HTMLImageElement,
    patches: Array<{ base64: string; selection: Selection }>,
    padding: number = 10,
    blendPadding: number = 0
): Promise<string> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    canvas.width = originalImage.width
    canvas.height = originalImage.height

    // 绘制原图
    ctx.drawImage(originalImage, 0, 0)

    // 依次绘制所有补丁
    for (const { base64, selection } of patches) {
        await new Promise<void>((resolve, reject) => {
            const patchImage = new Image()
            patchImage.onload = () => {
                const region = getSelectionCropRegion(
                    originalImage.width,
                    originalImage.height,
                    selection,
                    padding
                )
                const scaleX = patchImage.width / region.cropWidth
                const scaleY = patchImage.height / region.cropHeight
                const safeBlendPadding = Math.max(0, Math.round(blendPadding))
                const extendLeft = Math.min(safeBlendPadding, region.selectionX - region.cropX)
                const extendTop = Math.min(safeBlendPadding, region.selectionY - region.cropY)
                const extendRight = Math.min(
                    safeBlendPadding,
                    region.cropX + region.cropWidth - (region.selectionX + region.selectionWidth)
                )
                const extendBottom = Math.min(
                    safeBlendPadding,
                    region.cropY + region.cropHeight - (region.selectionY + region.selectionHeight)
                )
                const pasteX = region.selectionX - extendLeft
                const pasteY = region.selectionY - extendTop
                const pasteWidth = region.selectionWidth + extendLeft + extendRight
                const pasteHeight = region.selectionHeight + extendTop + extendBottom
                const srcX = (pasteX - region.cropX) * scaleX
                const srcY = (pasteY - region.cropY) * scaleY
                const srcWidth = pasteWidth * scaleX
                const srcHeight = pasteHeight * scaleY

                // 贴回选区并做少量外扩，减少边缘文字被裁切
                ctx.drawImage(
                    patchImage,
                    srcX,
                    srcY,
                    srcWidth,
                    srcHeight,
                    pasteX,
                    pasteY,
                    pasteWidth,
                    pasteHeight
                )
                resolve()
            }
            patchImage.onerror = reject
            patchImage.src = base64
        })
    }

    return canvas.toDataURL('image/png')
}

/**
 * 从全图结果中仅贴回选区区域（用于遮罩模式单次请求）
 */
export function compositeSelectionsFromFullImage(
    originalImage: HTMLImageElement,
    fullResultBase64: string,
    selections: Selection[],
    blendPadding: number = 0
): Promise<string> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')!
        canvas.width = originalImage.width
        canvas.height = originalImage.height

        // 先绘制原图
        ctx.drawImage(originalImage, 0, 0)

        const resultImage = new Image()
        resultImage.onload = () => {
            const scaleX = resultImage.width / originalImage.width
            const scaleY = resultImage.height / originalImage.height

            for (const selection of selections) {
                const region = getSelectionCropRegion(
                    originalImage.width,
                    originalImage.height,
                    selection,
                    blendPadding
                )
                const srcX = region.cropX * scaleX
                const srcY = region.cropY * scaleY
                const srcWidth = region.cropWidth * scaleX
                const srcHeight = region.cropHeight * scaleY
                ctx.drawImage(
                    resultImage,
                    srcX,
                    srcY,
                    srcWidth,
                    srcHeight,
                    region.cropX,
                    region.cropY,
                    region.cropWidth,
                    region.cropHeight
                )
            }
            resolve(canvas.toDataURL('image/png'))
        }
        resultImage.onerror = reject
        resultImage.src = fullResultBase64
    })
}

/**
 * 加载图片
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.crossOrigin = 'anonymous'
        img.src = src
    })
}

/**
 * 调整图片大小
 */
export function resizeImage(
    image: HTMLImageElement,
    maxWidth: number,
    maxHeight: number
): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    let { width, height } = image

    if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
    }

    if (height > maxHeight) {
        width = (width * maxHeight) / height
        height = maxHeight
    }

    canvas.width = width
    canvas.height = height

    ctx.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/png')
}

/**
 * 获取图片尺寸
 */
export function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.width, height: img.height })
        img.onerror = reject
        img.src = src
    })
}

/**
 * 下载图片
 */
export function downloadImage(dataUrl: string, filename: string): void {
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

/**
 * 批量下载图片为 ZIP
 */
export async function downloadImagesAsZip(
    images: Array<{ name: string; dataUrl: string }>,
    zipFilename: string = 'manga-lens-results.zip'
): Promise<void> {
    const JSZip = (await import('jszip')).default
    const { saveAs } = await import('file-saver')

    const zip = new JSZip()

    for (const { name, dataUrl } of images) {
        const base64Data = dataUrl.split(',')[1]
        zip.file(name, base64Data, { base64: true })
    }

    const content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, zipFilename)
}

export interface HtmlExportEntry {
    name: string
    resultDataUrl: string
    originalDataUrl?: string
    selectionCount?: number
    prompt?: string
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * 导出 HTML 对比报告（内嵌 base64，单文件可离线查看）
 */
export async function downloadImagesAsHtml(
    images: HtmlExportEntry[],
    filename: string = 'manga-lens-results.html'
): Promise<void> {
    if (!images.length) return

    const generatedAt = new Date().toLocaleString()
    const cards = images.map((item, index) => {
        const title = escapeHtml(item.name || `Image ${index + 1}`)
        const prompt = item.prompt ? `<pre>${escapeHtml(item.prompt)}</pre>` : ''
        const selectionInfo = typeof item.selectionCount === 'number'
            ? `<p><strong>Selections:</strong> ${item.selectionCount}</p>`
            : ''
        const originalColumn = item.originalDataUrl
            ? `
                <div class="col">
                    <h4>Original</h4>
                    <img src="${item.originalDataUrl}" alt="Original image ${index + 1}" />
                </div>
            `
            : ''

        return `
            <article class="card">
                <header>
                    <h3>${title}</h3>
                    <span>#${index + 1}</span>
                </header>
                <div class="grid ${item.originalDataUrl ? 'two-col' : 'one-col'}">
                    ${originalColumn}
                    <div class="col">
                        <h4>Result</h4>
                        <img src="${item.resultDataUrl}" alt="Result image ${index + 1}" />
                    </div>
                </div>
                ${selectionInfo}
                ${prompt}
            </article>
        `
    }).join('\n')

    const html = [
        '<!doctype html>',
        '<html lang="en">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        '  <title>MangaLens Export</title>',
        '  <style>',
        '    :root { color-scheme: light dark; }',
        '    body { margin: 0; padding: 24px; font-family: "Segoe UI", "PingFang SC", sans-serif; background: #f5f5f5; color: #111; }',
        '    main { max-width: 1200px; margin: 0 auto; }',
        '    h1 { margin: 0 0 6px; }',
        '    .meta { color: #666; margin: 0 0 20px; }',
        '    .card { background: #fff; border: 1px solid #ddd; border-radius: 12px; padding: 14px; margin-bottom: 16px; }',
        '    .card header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 10px; }',
        '    .card h3 { margin: 0; font-size: 16px; word-break: break-all; }',
        '    .card span { color: #777; font-size: 12px; }',
        '    .grid { display: grid; gap: 10px; }',
        '    .grid.two-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
        '    .grid.one-col { grid-template-columns: minmax(0, 1fr); }',
        '    .col h4 { margin: 0 0 8px; font-size: 13px; color: #555; }',
        '    img { width: 100%; height: auto; border-radius: 8px; border: 1px solid #e1e1e1; background: #fafafa; }',
        '    p { margin: 10px 0 0; font-size: 13px; }',
        '    pre { margin: 10px 0 0; padding: 10px; background: #f7f7f7; border-radius: 8px; border: 1px solid #e7e7e7; white-space: pre-wrap; word-break: break-word; }',
        '    @media (max-width: 880px) { .grid.two-col { grid-template-columns: 1fr; } body { padding: 14px; } }',
        '  </style>',
        '</head>',
        '<body>',
        '  <main>',
        '    <h1>MangaLens Export</h1>',
        `    <p class="meta">Generated at: ${escapeHtml(generatedAt)} | Total images: ${images.length}</p>`,
        cards,
        '  </main>',
        '</body>',
        '</html>',
    ].join('\n')

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const { saveAs } = await import('file-saver')
    saveAs(blob, filename)
}
