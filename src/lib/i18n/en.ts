// 国际化文案 - 英文

import type { Messages } from "./zh"

export const en: Messages = {
    // Common
    common: {
        appName: "MangaLens",
        tagline: "AI-Powered Manga Translation Tool",
        loading: "Loading...",
        save: "Save",
        cancel: "Cancel",
        delete: "Delete",
        edit: "Edit",
        confirm: "Confirm",
        close: "Close",
        back: "Back",
        next: "Next",
        download: "Download",
        upload: "Upload",
        processing: "Processing...",
        success: "Success",
        error: "Error",
        warning: "Warning",
    },

    // Navigation
    nav: {
        home: "Home",
        editor: "Editor",
        projects: "Projects",
        settings: "Settings",
        admin: "Admin",
        signIn: "Sign In",
        signUp: "Sign Up",
        signOut: "Sign Out",
    },

    // Landing Page
    landing: {
        hero: {
            title: "Professional AI Image Inpainting Tool",
            subtitle: "Precisely modify image regions using Google Gemini and OpenAI multimodal capabilities",
            cta: "Get Started",
            demo: "Watch Demo",
        },
        features: {
            title: "Core Features",
            precision: {
                title: "Precise Local Editing",
                description: "Freely select areas on the canvas, modify only selected parts while keeping the rest intact",
            },
            batch: {
                title: "Batch Automation",
                description: "Support folder upload, process hundreds of images at once",
            },
            multiModel: {
                title: "Multi-Model Support",
                description: "Native support for Gemini and OpenAI compatible APIs",
            },
            themes: {
                title: "5 Beautiful Themes",
                description: "Choose from Light, Dark, Ocean, Rose, or Forest",
            },
        },
        useCases: {
            title: "Use Cases",
            mangaTranslation: {
                title: "Manga Translation",
                description: "Select text areas to send to AI, avoiding full image safety filters",
            },
            imageEdit: {
                title: "Image Post-Processing",
                description: "Remove watermarks, modify details, replace scenes",
            },
            batchProcess: {
                title: "Batch Processing",
                description: "Set selections and prompts once, apply to all images",
            },
        },
    },

    // Editor
    editor: {
        sidebar: {
            files: "Files",
            uploadFile: "Upload File",
            uploadFolder: "Upload Folder",
            paste: "Paste Image",
            prompt: "Prompt",
            promptPlaceholder: "Describe the modifications you want...",
            defaultPrompt: "Please translate the Japanese text in the image to English.",
            applyToAll: "Apply to all images",
        },
        canvas: {
            zoomIn: "Zoom In",
            zoomOut: "Zoom Out",
            resetZoom: "Reset Zoom",
            fitToScreen: "Fit to Screen",
            clearSelections: "Clear Selections",
            noImage: "Please upload or select an image",
        },
        toolbar: {
            original: "Original",
            result: "Result",
            generate: "Generate",
            batchGenerate: "Batch Generate All",
            downloadResult: "Download Result",
            downloadAll: "Download All as ZIP",
            stop: "Stop",
        },
        settings: {
            title: "Connection Settings",
            provider: "AI Provider",
            apiKey: "API Key",
            apiKeyPlaceholder: "Enter your API Key",
            baseUrl: "API Base URL",
            baseUrlPlaceholder: "https://api.openai.com/v1",
            model: "Model",
            concurrency: "Concurrency",
            serial: "Serial",
            concurrent: "Concurrent",
        },
        status: {
            idle: "Ready",
            processing: "Processing",
            completed: "Completed",
            failed: "Failed",
            queued: "Queued",
        },
    },

    // Projects
    projects: {
        title: "My Projects",
        create: "New Project",
        empty: "No Projects",
        emptyDescription: "Create your first project to get started",
        name: "Project Name",
        description: "Description",
        images: "images",
        lastEdited: "Last edited",
    },

    // Settings
    settings: {
        title: "Settings",
        profile: {
            title: "Profile",
            username: "Username",
            email: "Email",
            avatar: "Avatar",
        },
        api: {
            title: "API Configuration",
            description: "Configure your AI API keys",
            saved: "API configuration saved",
            geminiKey: "Gemini API Key",
            openaiKey: "OpenAI API Key",
            openaiBaseUrl: "OpenAI Base URL",
        },
        appearance: {
            title: "Appearance",
            theme: "Theme",
            language: "Language",
        },
    },

    // Admin
    admin: {
        title: "Admin Dashboard",
        dashboard: "Dashboard",
        users: "User Management",
        analytics: "Analytics",
        settings: "System Settings",
        stats: {
            totalUsers: "Total Users",
            activeUsers: "Active Users",
            totalProjects: "Total Projects",
            totalImages: "Images Processed",
        },
    },

    // Error Messages
    errors: {
        apiKeyRequired: "Please configure your API Key first",
        noSelection: "Please select an area on the image first",
        noImage: "Please upload an image first",
        uploadFailed: "Upload failed",
        generateFailed: "Generation failed",
        networkError: "Network error, please try again",
        unauthorized: "Please sign in first",
        unexpectedError: "An unexpected error occurred",
    },

    // Empty State
    emptyState: {
        title: "Start Creating",
        description: "Upload images to start using the AI inpainting tool. Supports single upload, batch upload, or direct paste.",
        uploadImage: "Upload Image",
        uploadFolder: "Upload Folder",
        pasteImage: "Paste Image",
        dragHint: "Drag images here",
        pasteHint: "Ctrl+V to paste",
    },

    // Export Settings
    export: {
        format: "Export Format",
        quality: "Export Quality",
        png: "PNG (Lossless)",
        jpg: "JPG (Lossy)",
        webp: "WebP (Efficient)",
    },

    // Shortcuts
    shortcuts: {
        undo: "Undo",
        redo: "Redo",
        delete: "Delete",
        zoomIn: "Zoom In",
        zoomOut: "Zoom Out",
        resetView: "Reset View",
        toggleView: "Toggle View",
    },

    // Selection
    selection: {
        title: "Selection List",
        empty: "No Selections",
        emptyDescription: "Drag on the canvas to create selections",
        clearAll: "Clear All",
        delete: "Delete",
        moveUp: "Move Up",
        moveDown: "Move Down",
    },
}

