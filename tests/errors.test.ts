import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import request from "supertest"; // 실제 서버를 띄우지 않고 express 앱에 HTTP 요청을 보내기 위해 사용
import { AxiosError, AxiosHeaders } from "axios"; // 라이엇 API 에러 응답을 흉내 내기 위해 사용
import { app } from "../src/app"; // 테스트 대상이 되는 Express 앱 인스턴스
import { AppError } from "../src/lib/AppError"; // 변환 결과가 의도된 에러인지 확인하기 위해 사용
import { toRiotAppError } from "../src/modules/game-accounts/riot.client"; // 테스트 대상 라이엇 에러 변환

function riotError(status: number | null, url: string, headers: Record<string, string> = {}): AxiosError {
  const config = { url, headers: new AxiosHeaders() };
  const response =
    status === null
      ? undefined
      : { status, statusText: "", headers, config, data: {} };
  return new AxiosError("riot error", undefined, config, undefined, response);
}

describe("unknown routes", () => {
  it("return the JSON error format instead of Express's HTML 404", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain("GET /api/does-not-exist");
  });
});

describe("toRiotAppError", () => {
  it("tells the user to check the Riot ID when the account lookup 404s", () => {
    const err = toRiotAppError(riotError(404, "https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/a/b"));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(404);
    expect((err as AppError).message).toContain("닉네임#태그");
  });

  it("maps rate limiting to 429 with Retry-After", () => {
    const err = toRiotAppError(riotError(429, "https://kr.api.riotgames.com/lol/league", { "retry-after": "12" }));
    expect((err as AppError).statusCode).toBe(429);
    expect((err as AppError).details).toEqual({ retryAfterSeconds: 12 });
  });

  it("maps a rejected API key to 503", () => {
    expect((toRiotAppError(riotError(403, "https://kr.api.riotgames.com/lol/league")) as AppError).statusCode).toBe(503);
  });

  it("maps Riot outages and timeouts to 502", () => {
    expect((toRiotAppError(riotError(500, "https://kr.api.riotgames.com/lol/league")) as AppError).statusCode).toBe(502);
    expect((toRiotAppError(riotError(null, "https://kr.api.riotgames.com/lol/league")) as AppError).statusCode).toBe(502);
  });

  it("leaves non-Riot errors untouched", () => {
    const original = new Error("db down");
    expect(toRiotAppError(original)).toBe(original);
  });
});
