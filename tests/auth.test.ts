import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import request from "supertest"; // 실제 서버를 띄우지 않고 express 앱에 HTTP 요청을 보내기 위해 사용
import { app } from "../src/app"; // 테스트 대상이 되는 Express 앱 인스턴스
import { env } from "../src/config/env"; // 로그인 실패 시 돌려보낼 프론트 주소
import { TimeoutError, withTimeout } from "../src/lib/withTimeout"; // 테스트 대상 시간 제한 헬퍼

describe("withTimeout", () => {
  it("returns the result when it finishes in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "fast")).resolves.toBe("ok");
  });

  it("fails with the step name when it hangs", async () => {
    const hanging = new Promise<never>(() => {});
    await expect(withTimeout(hanging, 20, "google id_token verification")).rejects.toMatchObject({
      name: "TimeoutError",
      step: "google id_token verification",
    });
  });

  it("passes through the original error", async () => {
    const err = await withTimeout(Promise.reject(new Error("boom")), 50, "x").catch((e) => e);
    expect(err).not.toBeInstanceOf(TimeoutError);
    expect(err.message).toBe("boom");
  });
});

describe("GET /api/auth/google/callback", () => {
  it("sends the browser back to the login page instead of showing JSON when it fails", async () => {
    // 사용자가 구글 화면에서 취소하면 code 없이 ?error=access_denied로 돌아옴
    const res = await request(app).get("/api/auth/google/callback?error=access_denied");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.CORS_ORIGIN}/login?loginError=1`);
  });
});
