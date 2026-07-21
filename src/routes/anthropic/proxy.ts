export const ANTHROPIC_BASE = 'https://api.anthropic.com'

// Transparent passthrough: rebuild the request against Anthropic's origin while
// preserving method, headers, and body. Constructing from the original Request
// carries the (possibly streaming) body through and lets the runtime set the
// correct Host/SNI. Auth headers (`x-api-key`, `authorization`, `anthropic-beta`)
// are forwarded untouched, so both API-key and subscription/OAuth clients work.
// `pathAndSearch` overrides the upstream target path — used to strip a
// `/s/<system>` prefix so the tagged request still reaches Anthropic's `/v1/...`.
export const forwardToAnthropic = (req: Request, pathAndSearch?: string): Promise<Response> => {
  const url = new URL(req.url)
  const target = `${ANTHROPIC_BASE}${pathAndSearch ?? `${url.pathname}${url.search}`}`
  return fetch(new Request(target, req))
}
