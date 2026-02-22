import WebSocket from "ws";
export declare function buildWahaWsCandidates(baseUrl: string): URL[];
export declare function connectWahaWebSocket(candidates: URL[], opts: {
    headers?: Record<string, string>;
    queryParams?: Array<[string, string]>;
}): Promise<WebSocket>;
