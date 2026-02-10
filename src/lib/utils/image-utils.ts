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
 * 将生成的补丁合成回原图
 */
export function compositeImage(
    originalImage: HTMLImageElement,
    patchBase64: string,
    selection: Selection,
    padding: number = 10
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
            const srcX = (region.selectionX - region.cropX) * scaleX
            const srcY = (region.selectionY - region.cropY) * scaleY
            const srcWidth = region.selectionWidth * scaleX
            const srcHeight = region.selectionHeight * scaleY

            // 仅贴回选区本体，避免 padding 区域污染周边内容
            ctx.drawImage(
                patchImage,
                srcX,
                srcY,
                srcWidth,
                srcHeight,
                region.selectionX,
                region.selectionY,
                region.selectionWidth,
                region.selectionHeight
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
    padding: number = 10
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
                const srcX = (region.selectionX - region.cropX) * scaleX
                const srcY = (region.selectionY - region.cropY) * scaleY
                const srcWidth = region.selectionWidth * scaleX
                const srcHeight = region.selectionHeight * scaleY

                // 仅贴回选区本体，避免 padding 区域污染周边内容
                ctx.drawImage(
                    patchImage,
                    srcX,
                    srcY,
                    srcWidth,
                    srcHeight,
                    region.selectionX,
                    region.selectionY,
                    region.selectionWidth,
                    region.selectionHeight
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
    selections: Selection[]
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
                const normalized = normalizeSelection(selection, originalImage.width, originalImage.height)
                const srcX = normalized.x * scaleX
                const srcY = normalized.y * scaleY
                const srcWidth = normalized.width * scaleX
                const srcHeight = normalized.height * scaleY
                ctx.drawImage(
                    resultImage,
                    srcX,
                    srcY,
                    srcWidth,
                    srcHeight,
                    normalized.x,
                    normalized.y,
                    normalized.width,
                    normalized.height
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
