import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import request from "supertest"; // 실제 서버를 띄우지 않고 express 앱에 HTTP 요청을 보내기 위해 사용
import jwt from "jsonwebtoken"; // 다른 용도의 토큰을 직접 만들어 쿠키에 넣어보기 위해 사용
import { app } from "../src/app"; // 테스트 대상이 되는 Express 앱 인스턴스
import { env } from "../src/config/env"; // JWT_SECRET
import { verifyDiscordOAuthState } from "../src/modules/discord/discord.service"; // OAuth state 검증

// 같은 비밀키로 서명된 다른 용도의 토큰을 로그인 쿠키에 넣으면 req.user.id가 undefined인
// 채로 통과해서 GET /groups가 전체 그룹을 반환하던 구멍(2026-10-27) 회귀 방지.
describe("auth token confusion", () => {
  it("rejects a signed token that is not a login token", async () => {
    const stateLike = jwt.sign({ groupId: 1 }, env.JWT_SECRET, { expiresIn: "10m" });
    const res = await request(app).get("/api/groups").set("Cookie", `token=${stateLike}`);
    expect(res.status).toBe(401);
  });

  it("does not accept a login-secret token as a discord OAuth state", () => {
    const loginToken = jwt.sign({ id: 1, email: "a@b.c" }, env.JWT_SECRET, { expiresIn: "10m" });
    expect(() => verifyDiscordOAuthState(loginToken)).toThrow();
  });
});
