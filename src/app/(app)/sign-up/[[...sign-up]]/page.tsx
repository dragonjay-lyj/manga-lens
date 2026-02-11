import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/20 via-transparent to-transparent blur-3xl animate-pulse-slow" />
                <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/20 via-transparent to-transparent blur-3xl animate-pulse-slow" style={{ animationDelay: "1.5s" }} />
            </div>
            <SignUp
                appearance={{
                    elements: {
                        formButtonPrimary: "gradient-primary hover:opacity-90",
                        card: "glass-card",
                    }
                }}
            />
        </div>
    )
}
