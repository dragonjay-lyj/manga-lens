// 国际化文案 - 中文

export const zh = {
    // 通用
    common: {
        appName: "MangaLens",
        tagline: "AI 驱动的漫画翻译工具",
        loading: "加载中...",
        save: "保存",
        cancel: "取消",
        delete: "删除",
        edit: "编辑",
        confirm: "确认",
        close: "关闭",
        back: "返回",
        next: "下一步",
        download: "下载",
        upload: "上传",
        processing: "处理中...",
        success: "成功",
        error: "错误",
        warning: "警告",
    },

    // 导航
    nav: {
        home: "首页",
        editor: "编辑器",
        projects: "项目",
        settings: "设置",
        admin: "管理",
        signIn: "登录",
        signUp: "注册",
        signOut: "退出",
    },

    // Landing Page
    landing: {
        hero: {
            title: "专业 AI 图像局部重绘工具",
            subtitle: "利用 Google Gemini 和 OpenAI 的多模态能力，精准修改图片局部区域",
            cta: "开始使用",
            demo: "观看演示",
        },
        features: {
            title: "核心功能",
            precision: {
                title: "精准局部编辑",
                description: "在画布上自由框选，仅修改选中部分，保持原图其他部分不变",
            },
            batch: {
                title: "批量自动化处理",
                description: "支持文件夹上传，一次处理数百张图片",
            },
            multiModel: {
                title: "多模型支持",
                description: "原生支持 Gemini 和 OpenAI 兼容接口",
            },
            themes: {
                title: "5 种精美主题",
                description: "Light、Dark、Ocean、Rose、Forest 任你选择",
            },
        },
        useCases: {
            title: "应用场景",
            mangaTranslation: {
                title: "漫画翻译",
                description: "框选文本区域发送给 AI，避免完整图片触发安全过滤",
            },
            imageEdit: {
                title: "图片后期编辑",
                description: "去除水印、修改细节、场景替换",
            },
            batchProcess: {
                title: "批量处理",
                description: "设置一次选区和提示词，应用到所有图片",
            },
        },
    },

    // 编辑器
    editor: {
        sidebar: {
            files: "文件",
            uploadFile: "上传文件",
            uploadFolder: "上传文件夹",
            paste: "粘贴图片",
            prompt: "提示词",
            promptPlaceholder: "描述你想要的修改效果...",
            defaultPrompt: "请用简体中文翻译替换掉图片里的日文。",
            applyToAll: "应用到所有图片",
        },
        canvas: {
            zoomIn: "放大",
            zoomOut: "缩小",
            resetZoom: "重置缩放",
            fitToScreen: "适应屏幕",
            clearSelections: "清除选区",
            noImage: "请上传或选择图片",
        },
        toolbar: {
            original: "原图",
            result: "结果",
            generate: "开始生成",
            batchGenerate: "批量生成所有",
            downloadResult: "下载结果",
            downloadAll: "打包下载全部",
            stop: "停止",
        },
        settings: {
            title: "连接设置",
            provider: "AI 提供商",
            apiKey: "API Key",
            apiKeyPlaceholder: "输入你的 API Key",
            baseUrl: "API 地址",
            baseUrlPlaceholder: "https://api.openai.com/v1",
            model: "模型",
            concurrency: "并发数",
            serial: "串行",
            concurrent: "并发",
        },
        status: {
            idle: "就绪",
            processing: "处理中",
            completed: "完成",
            failed: "失败",
            queued: "排队中",
        },
    },

    // 项目
    projects: {
        title: "我的项目",
        create: "新建项目",
        empty: "暂无项目",
        emptyDescription: "创建你的第一个项目开始使用",
        name: "项目名称",
        description: "项目描述",
        images: "张图片",
        lastEdited: "最后编辑",
    },

    // 设置
    settings: {
        title: "设置",
        profile: {
            title: "个人资料",
            username: "用户名",
            email: "邮箱",
            avatar: "头像",
        },
        api: {
            title: "API 配置",
            description: "配置你的 AI API 密钥",
            saved: "API 配置已保存",
            geminiKey: "Gemini API Key",
            openaiKey: "OpenAI API Key",
            openaiBaseUrl: "OpenAI Base URL",
        },
        appearance: {
            title: "外观",
            theme: "主题",
            language: "语言",
        },
    },

    // Admin
    admin: {
        title: "管理后台",
        dashboard: "仪表盘",
        users: "用户管理",
        analytics: "数据统计",
        settings: "系统设置",
        stats: {
            totalUsers: "总用户数",
            activeUsers: "活跃用户",
            totalProjects: "总项目数",
            totalImages: "处理图片数",
        },
    },

    // 错误信息
    errors: {
        apiKeyRequired: "请先配置 API Key",
        noSelection: "请先在图片上框选区域",
        noImage: "请先上传图片",
        uploadFailed: "上传失败",
        generateFailed: "生成失败",
        networkError: "网络错误，请重试",
        unauthorized: "请先登录",
        unexpectedError: "出现了意外错误",
    },

    // 空状态
    emptyState: {
        title: "开始您的创作",
        description: "上传图片开始使用 AI 局部重绘功能。支持单张上传、批量上传或直接粘贴。",
        uploadImage: "上传图片",
        uploadFolder: "上传文件夹",
        pasteImage: "粘贴图片",
        dragHint: "拖拽图片到此处",
        pasteHint: "Ctrl+V 粘贴",
    },

    // 导出设置
    export: {
        format: "导出格式",
        quality: "导出质量",
        png: "PNG (无损)",
        jpg: "JPG (有损压缩)",
        webp: "WebP (高效压缩)",
    },

    // 快捷键
    shortcuts: {
        undo: "撤销",
        redo: "重做",
        delete: "删除",
        zoomIn: "放大",
        zoomOut: "缩小",
        resetView: "重置视图",
        toggleView: "切换视图",
    },

    // 选区
    selection: {
        title: "选区列表",
        empty: "暂无选区",
        emptyDescription: "在画布上拖动鼠标创建选区",
        clearAll: "清除全部",
        delete: "删除",
        moveUp: "上移",
        moveDown: "下移",
    },
}

export type Messages = typeof zh

