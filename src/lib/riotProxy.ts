import type { AxiosInstance } from "axios"; // 요청 인터셉터를 붙일 axios 인스턴스 타입
import { env } from "../config/env"; // RIOT_PROXY_URL, RIOT_PROXY_SECRET

// RIOT_PROXY_URL/RIOT_PROXY_SECRET이 설정돼 있으면 이 인스턴스의 모든 요청을
// https://<host>/<path> → <RIOT_PROXY_URL>/<host>/<path> 로 바꿔서 프록시로 보냄.
// 프록시(~/riot-proxy/src/index.js)가 경로 첫 칸의 host로 다시 요청해줌.
// 호출하는 쪽 URL 코드는 그대로 두려고 인터셉터로 처리함.
export function useRiotProxy(http: AxiosInstance): void {
  const proxyUrl = env.RIOT_PROXY_URL?.replace(/\/+$/, "");
  const proxySecret = env.RIOT_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) return;

  http.interceptors.request.use((config) => {
    if (config.url?.startsWith("https://")) {
      config.url = `${proxyUrl}/${config.url.slice("https://".length)}`;
      config.headers.set("X-Proxy-Secret", proxySecret);
    }
    return config;
  });
}
