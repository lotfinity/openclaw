import WebSocket from "ws";

function toWsUrl(rawBaseUrl: string, path: "/ws" | "/api/ws"): URL {
  const url = new URL(rawBaseUrl);
  if (url.protocol === "http:") {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  url.pathname = path;
  url.search = "";
  return url;
}

export function buildWahaWsCandidates(baseUrl: string): URL[] {
  return [toWsUrl(baseUrl, "/ws"), toWsUrl(baseUrl, "/api/ws")];
}

export async function connectWahaWebSocket(
  candidates: URL[],
  opts: { headers?: Record<string, string>; queryParams?: Array<[string, string]> },
): Promise<WebSocket> {
  let lastError: unknown = null;
  for (const candidate of candidates) {
    const url = new URL(candidate.toString());
    for (const [key, value] of opts.queryParams ?? []) {
      url.searchParams.append(key, value);
    }
    try {
      const ws = await new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url.toString(), {
          headers: opts.headers,
        });
        const cleanup = () => {
          socket.removeListener("open", onOpen);
          socket.removeListener("error", onError);
        };
        const onOpen = () => {
          cleanup();
          resolve(socket);
        };
        const onError = (err: unknown) => {
          cleanup();
          try {
            socket.close();
          } catch {
            // ignore
          }
          reject(err);
        };
        socket.once("open", onOpen);
        socket.once("error", onError);
      });
      return ws;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to connect WAHA websocket on candidate URLs.`);
}
