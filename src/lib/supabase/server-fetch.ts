import { EnvHttpProxyAgent } from 'undici';

// The managed cloud requires outbound HTTPS to use its inherited proxy.
// Normal deployments without proxy variables use the standard fetch implementation.
let proxyAgent: EnvHttpProxyAgent | undefined;
export const supabaseServerFetch: typeof fetch = (input, init) => {
  const needsProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (needsProxy) proxyAgent ??= new EnvHttpProxyAgent();
  const timeout = AbortSignal.timeout(10000);
  const options: RequestInit & { dispatcher?: EnvHttpProxyAgent } = {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
    ...(needsProxy ? { dispatcher: proxyAgent } : {}),
  };
  return fetch(input, options);
};
