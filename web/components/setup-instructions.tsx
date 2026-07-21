import { useState } from 'react'
import { Button } from './ui/button'
import { cn } from '../lib/utils'

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Button variant="ghost" className="shrink-0" onClick={() => void copy()}>
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

export const Snippet = ({ text }: { text: string }) => (
  <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
    <code className="min-w-0 flex-1 font-mono text-xs break-all whitespace-pre-wrap">{text}</code>
    <CopyButton text={text} />
  </div>
)

export const systemBaseUrl = (systemId: string): string =>
  `${window.location.origin}/s/${systemId}`

type Provider = 'anthropic' | 'openai'

const providerTabs: { id: Provider; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
]

const AnthropicInstructions = ({ baseUrl }: { baseUrl: string }) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Claude Code / any Anthropic client</p>
      <Snippet text={`export ANTHROPIC_BASE_URL=${baseUrl}`} />
      <p className="text-xs text-muted-foreground">
        Then run <code className="font-mono">claude</code> (or your SDK client) as usual. Your
        credentials pass through untouched — the proxy never stores API keys or OAuth tokens.
      </p>
    </div>
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Anthropic SDK</p>
      <Snippet text={`new Anthropic({ baseURL: '${baseUrl}' })`} />
    </div>
  </div>
)

const OpenAiInstructions = ({ baseUrl }: { baseUrl: string }) => {
  const openaiUrl = `${baseUrl}/openai/v1`
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Codex / any OpenAI client</p>
        <Snippet text={`export OPENAI_BASE_URL=${openaiUrl}`} />
        <p className="text-xs text-muted-foreground">
          OpenAI SDK base URLs include the <code className="font-mono">/v1</code> suffix, so this
          system's OpenAI proxy lives at <code className="font-mono">/openai/v1</code>.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium">OpenAI SDK</p>
        <Snippet text={`new OpenAI({ baseURL: '${openaiUrl}' })`} />
      </div>
    </div>
  )
}

// How to point a client at one system's ingest URL. Rendered on the
// first-run onboarding page and on each pending system's card. The base URL is
// provider-agnostic; the tabs below tailor the client config to whichever SDK
// the user is wiring up.
export const SetupInstructions = ({ systemId }: { systemId: string }) => {
  const baseUrl = systemBaseUrl(systemId)
  const [provider, setProvider] = useState<Provider>('anthropic')
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs font-medium">Proxy base URL</p>
        <Snippet text={baseUrl} />
        <p className="text-xs text-muted-foreground">
          Treat this URL as a secret — anyone who has it can record usage into this system.
        </p>
      </div>
      <div role="tablist" aria-label="Client provider" className="inline-flex rounded-md bg-muted p-0.5">
        {providerTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={provider === tab.id}
            onClick={() => setProvider(tab.id)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              provider === tab.id
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {provider === 'anthropic' ? (
        <AnthropicInstructions baseUrl={baseUrl} />
      ) : (
        <OpenAiInstructions baseUrl={baseUrl} />
      )}
    </div>
  )
}
