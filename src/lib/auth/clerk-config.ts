import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server"

type ClerkAuthRoute = "sign-in" | "sign-up"
type SearchParamValue = string | string[] | undefined
type SearchParamRecord = Record<string, SearchParamValue>
type RequestContext = {
  origin?: string
  host?: string
}
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
const CLERK_API_VERSION = "2025-11-10"

const trimToUndefined = (value?: string | null) => {
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

let clerkEnvironmentCache:
  | {
      expiresAt: number
      value: { signInUrl?: string; signUpUrl?: string }
    }
  | undefined

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

const getRequestContextFromUrl = (value: string | URL): RequestContext => {
  const url = new URL(value.toString())

  return {
    origin: url.origin,
    host: url.host,
  }
}

const decodePublishableKey = (publishableKey?: string) => {
  const encodedFrontendApi = publishableKey?.split("_")[2]

  if (!encodedFrontendApi) {
    return undefined
  }

  try {
    const decodedValue = atob(encodedFrontendApi)
    return decodedValue.endsWith("$") ? decodedValue.slice(0, -1) : decodedValue
  } catch {
    return undefined
  }
}

const getClerkEnvironmentEndpoint = () => {
  const frontendApi = decodePublishableKey(trimToUndefined(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY))
  return frontendApi ? `https://${frontendApi}/v1/environment?__clerk_api_version=${CLERK_API_VERSION}` : undefined
}

async function getClerkEnvironmentConfig() {
  if (clerkEnvironmentCache && Date.now() < clerkEnvironmentCache.expiresAt) {
    return clerkEnvironmentCache.value
  }

  const endpoint = getClerkEnvironmentEndpoint()

  if (!endpoint) {
    return undefined
  }

  try {
    const response = await fetch(endpoint, {
      next: { revalidate: 300 },
    })

    if (!response.ok) {
      return undefined
    }

    const payload = await response.json()
    const value = {
      signInUrl: trimToUndefined(payload.display_config?.sign_in_url),
      signUpUrl: trimToUndefined(payload.display_config?.sign_up_url),
    }

    clerkEnvironmentCache = {
      expiresAt: Date.now() + 5 * 60 * 1000,
      value,
    }

    return value
  } catch {
    return undefined
  }
}

async function resolveClerkRuntimeConfig(requestContext?: RequestContext) {
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
    return props
  }

  if (!requestContext?.origin || !requestContext.host) {
    return props
  }

  const environmentConfig = await getClerkEnvironmentConfig()
  const primarySignInUrl = environmentConfig?.signInUrl
  const primarySignUpUrl = environmentConfig?.signUpUrl

  if (!primarySignInUrl || !isHttpUrl(primarySignInUrl)) {
    return props
  }

  props.signInUrl = primarySignInUrl
  props.signUpUrl = primarySignUpUrl ?? props.signUpUrl

  if (new URL(primarySignInUrl).origin !== requestContext.origin) {
    props.isSatellite = true
    props.domain = requestContext.host
  }

  return props
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

export async function getClerkProviderPropsForRequest(requestContext: RequestContext) {
  return resolveClerkRuntimeConfig(requestContext)
}

export async function getClerkMiddlewareOptions(requestContext: RequestContext): Promise<ClerkMiddlewareOptions> {
  const resolvedConfig = await resolveClerkRuntimeConfig(requestContext)
  const options: ClerkMiddlewareOptions = {
    signInUrl: resolvedConfig.signInUrl,
    signUpUrl: resolvedConfig.signUpUrl,
  }

  if (resolvedConfig.isSatellite && resolvedConfig.domain) {
    options.isSatellite = true
    options.domain = resolvedConfig.domain
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

export async function getPrimaryAuthRedirectUrlForRequest(
  route: ClerkAuthRoute,
  searchParams: SearchParamRecord,
  requestContext: RequestContext,
) {
  const resolvedConfig = await resolveClerkRuntimeConfig(requestContext)
  const authRouteUrl = route === "sign-in" ? resolvedConfig.signInUrl : resolvedConfig.signUpUrl

  if (!resolvedConfig.isSatellite || !resolvedConfig.domain || !authRouteUrl || !isHttpUrl(authRouteUrl)) {
    return null
  }

  const requestOrigin = requestContext.origin ?? new URL(siteUrl).origin
  const authUrl = new URL(authRouteUrl)

  if (authUrl.origin === requestOrigin) {
    return null
  }

  appendSearchParams(authUrl, searchParams)

  if (!authUrl.searchParams.has("redirect_url")) {
    authUrl.searchParams.set("redirect_url", toAbsoluteUrl(getFallbackRedirectPath(route)))
  }

  return authUrl.toString()
}

export function getRequestContextFromHeaders(headers: Headers): RequestContext {
  const forwardedProtocol = trimToUndefined(headers.get("x-forwarded-proto"))
  const forwardedHost = trimToUndefined(headers.get("x-forwarded-host"))
  const host = forwardedHost ?? trimToUndefined(headers.get("host"))

  if (!host) {
    return {}
  }

  const protocol = forwardedProtocol ?? (host.includes("localhost") ? "http" : "https")
  return getRequestContextFromUrl(`${protocol}://${host}`)
}

export function getRequestContextFromRequestUrl(value: string | URL) {
  return getRequestContextFromUrl(value)
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
