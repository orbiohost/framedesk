import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthProviders } from './GoogleSignIn.jsx';

// Cloudflare Turnstile: a free "I'm not a robot" check. Most people never
// click anything; the widget passes them by itself in a second or two. Shown
// only when the server has Turnstile keys set.

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load the security check'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * const captcha = useCaptcha();
 * <Captcha {...captcha.props} />
 * submit: if (!captcha.ready) ...; send { ...values, captchaToken: captcha.token }
 * after a failed request: captcha.reset()   (tokens work only once)
 */
export function useCaptcha() {
  const { data, isLoading } = useAuthProviders();
  const siteKey = data?.captchaSiteKey ?? null;
  const [token, setToken] = useState(null);
  const [resetCount, setResetCount] = useState(0);

  const reset = useCallback(() => {
    setToken(null);
    setResetCount((n) => n + 1);
  }, []);

  return {
    enabled: Boolean(siteKey),
    // While the providers call is in flight we don't yet know if it's needed.
    ready: !isLoading && (!siteKey || Boolean(token)),
    token,
    reset,
    props: { siteKey, onToken: setToken, resetCount },
  };
}

export function Captcha({ siteKey, onToken, resetCount }) {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'auto',
          size: 'flexible',
          callback: (t) => onToken(t),
          'expired-callback': () => onToken(null),
          'error-callback': () => {
            onToken(null);
            return false; // let Turnstile retry by itself
          },
        });
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey, onToken]);

  useEffect(() => {
    if (resetCount > 0 && widgetRef.current && window.turnstile) {
      window.turnstile.reset(widgetRef.current);
    }
  }, [resetCount]);

  if (!siteKey) return null;
  return (
    <div>
      <div ref={containerRef} className="min-h-[65px]" />
      {failed && (
        <p className="text-danger mt-1 text-sm">
          The security check couldn’t load. Check your connection or turn off content blockers, then
          reload the page.
        </p>
      )}
    </div>
  );
}
