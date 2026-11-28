import { useEffect, useRef, useState } from 'react'

interface GoogleIdApi {
  initialize: (config: { client_id: string; callback: (res: { credential?: string }) => void }) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } }
    __googleClientId?: string
  }
}

let scriptPromise: Promise<GoogleIdApi> | null = null
let initializedClientId: string | null = null
let activeCredentialHandler: ((idToken: string) => void) | null = null

function loadGoogleIdApi(): Promise<GoogleIdApi> {
  const existing = window.google?.accounts?.id
  if (existing) return Promise.resolve(existing)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      const api = window.google?.accounts?.id
      if (api) resolve(api)
      else {
        scriptPromise = null
        reject(new Error('Google Identity Services unavailable'))
      }
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Failed to load Google Identity Services'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export default function GoogleSignInButton({
  mode,
  disabled,
  onCredential,
}: {
  mode: 'login' | 'register'
  disabled?: boolean
  onCredential: (idToken: string) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handlerRef = useRef(onCredential)
  handlerRef.current = onCredential
  const [failed, setFailed] = useState(false)

  const clientId =
    (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
    (typeof window !== 'undefined' ? window.__googleClientId?.trim() : '') ||
    ''

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    const forward = (token: string) => handlerRef.current(token)
    activeCredentialHandler = forward

    loadGoogleIdApi()
      .then((api) => {
        if (cancelled || !hostRef.current) return
        if (initializedClientId !== clientId) {
          api.initialize({
            client_id: clientId,
            callback: (res) => {
              if (res.credential) activeCredentialHandler?.(res.credential)
            },
          })
          initializedClientId = clientId
        }
        hostRef.current.replaceChildren()
        api.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'register' ? 'signup_with' : 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          locale: 'vi',
          width: Math.min(400, Math.max(200, Math.floor(hostRef.current.clientWidth || 320))),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
      if (activeCredentialHandler === forward) activeCredentialHandler = null
    }
  }, [clientId, mode])

  if (!clientId || failed) return null

  return (
    <div className="auth-social">
      <div className="auth-divider" aria-hidden="true">hoặc</div>
      <div className="auth-google" ref={hostRef} aria-busy={disabled || undefined} data-disabled={disabled || undefined} />
    </div>
  )
}
