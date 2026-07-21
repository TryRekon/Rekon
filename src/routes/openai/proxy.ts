export const OPENAI_BASE = 'https://api.openai.com'

// Transparent passthrough: rebuild the request against OpenAI's origin while
// preserving method, headers, and body. Constructing from the original Request
// carries the (possibly streaming) body through and lets the runtime set the
// correct Host/SNI. The `authorization` header is forwarded untouched — the
// proxy never holds or injects credentials. `pathAndSearch` carries the
// upstream target with the `/s/<system>` and `/openai` prefixes already
// stripped, so OpenAI still sees its own `/v1/...` surface.
export const forwardToOpenAI = (req: Request, pathAndSearch: string): Promise<Response> =>
  fetch(new Request(`${OPENAI_BASE}${pathAndSearch}`, req))
