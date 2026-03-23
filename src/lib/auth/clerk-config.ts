import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server"

type ClerkAuthRoute = "sign-in" | "sign-up"
type SearchParamValue = string | string[] | undefined
type SearchParamRecord = Record<string, SearchParamValue>
type ClerkProviderOptions = {
  signInUrl?: string
  signUpUrl?: string
  signInForceRedirectUrl?: string
  signUpForceRedirectUrl?: string
  signInFallbackRedirectUrl?: string
  signUpFallbackRedirectUrl?: string
  allowedRedirectOrigins?: string[]
  isSatellite?: true
  domain?: string
}

const DEFAULT_SITE_URL = "http://localhost:3000"
const DEFAULT_EDITOR_PATH = "/editor"

const trimToUndefined = (value?: string) => {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

const parseBoolean = (value?: string) => value?.trim().toLowerCase() === "true"

const parseOrigins = (value?: string) =>
  value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)

const siteUrl = trimToUndefined(process.env.NEXT_PUBLIC_SITE_URL) ?? DEFAULT_SITE_URL
const isSatellite = parseBoolean(process.env.NEXT_PUBLIC_CLERK_IS_SATELLITE)
const domain = trimToUndefined(process.env.NEXT_PUBLIC_CLERK_DOMAIN)
const signInUrl = trimToUndefined(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL) ?? "/sign-in"
const signUpUrl = trimToUndefined(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL) ?? "/sign-up"
const signInForceRedirectUrl =
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL) ??
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL)
const signUpForceRedirectUrl =
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL) ??
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL)
const signInFallbackRedirectUrl =
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL) ??
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL) ??
  DEFAULT_EDITOR_PATH
const signUpFallbackRedirectUrl =
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL) ??
  trimToUndefined(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL) ??
  DEFAULT_EDITOR_PATH
const allowedRedirectOrigins = parseOrigins(process.env.NEXT_PUBLIC_CLERK_ALLOWED_REDIRECT_ORIGINS)

const getAuthRouteUrl = (route: ClerkAuthRoute) => (route === "sign-in" ? signInUrl : signUpUrl)

const getFallbackRedirectPath = (route: ClerkAuthRoute) =>
  route === "sign-in" ? signInFallbackRedirectUrl : signUpFallbackRedirectUrl

const toAbsoluteUrl = (value: string) => new URL(value, siteUrl).toString()

const appendSearchParams = (url: URL, searchParams: SearchParamRecord) => {
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item)
      }
      continue
    }

    url.searchParams.append(key, value)
  }
}

export function getClerkProviderProps(): ClerkProviderOptions {
  const props: ClerkProviderOptions = {
    signInUrl,
    signUpUrl,
    signInForceRedirectUrl,
    signUpForceRedirectUrl,
    signInFallbackRedirectUrl,
    signUpFallbackRedirectUrl,
  }

  if (allowedRedirectOrigins.length > 0) {
    props.allowedRedirectOrigins = allowedRedirectOrigins
  }

  if (isSatellite && domain) {
    props.isSatellite = true
    props.domain = domain
  }

  return props
}

export function getClerkMiddlewareOptions(): ClerkMiddlewareOptions {
  const options: ClerkMiddlewareOptions = {
    signInUrl,
    signUpUrl,
  }

  if (isSatellite && domain) {
    options.isSatellite = true
    options.domain = domain
  }

  return options
}

export function getSignInHref(returnBackUrl = signInFallbackRedirectUrl) {
  return buildAuthRouteHref("sign-in", returnBackUrl)
}

export function getSignUpHref(returnBackUrl = signUpFallbackRedirectUrl) {
  return buildAuthRouteHref("sign-up", returnBackUrl)
}

export function getPrimaryAuthRedirectUrl(route: ClerkAuthRoute, searchParams: SearchParamRecord = {}) {
  const authRouteUrl = getAuthRouteUrl(route)

  if (!isSatellite || !isHttpUrl(authRouteUrl)) {
    return null
  }

  const authUrl = new URL(authRouteUrl)
  const currentOrigin = new URL(siteUrl).origin

  if (authUrl.origin === currentOrigin) {
    return null
  }

  appendSearchParams(authUrl, searchParams)

  if (!authUrl.searchParams.has("redirect_url")) {
    authUrl.searchParams.set("redirect_url", toAbsoluteUrl(getFallbackRedirectPath(route)))
  }

  return authUrl.toString()
}

function buildAuthRouteHref(route: ClerkAuthRoute, returnBackUrl: string) {
  const primaryRedirectUrl = getPrimaryAuthRedirectUrl(route, {
    redirect_url: toAbsoluteUrl(returnBackUrl),
  })

  if (primaryRedirectUrl) {
    return primaryRedirectUrl
  }

  const localUrl = new URL(getAuthRouteUrl(route), siteUrl)
  localUrl.searchParams.set("redirect_url", toAbsoluteUrl(returnBackUrl))
  return `${localUrl.pathname}${localUrl.search}${localUrl.hash}`
}
