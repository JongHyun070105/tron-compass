const nativeFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const rawUrl = input instanceof Request ? input.url : String(input);
  let url: URL;
  try {
    url = new URL(rawUrl, "http://localhost");
  } catch {
    return Promise.reject(new Error(`Blocked invalid fetch URL in test: ${rawUrl}`));
  }

  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]" ||
    url.hostname === "::1";
  if (!isLoopback) {
    return Promise.reject(new Error(`Blocked external fetch in deterministic test: ${url.origin}`));
  }

  return nativeFetch(input, init);
}) as typeof fetch;
