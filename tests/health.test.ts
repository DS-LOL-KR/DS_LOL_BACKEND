import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import request from "supertest"; // 실제 서버를 띄우지 않고 express 앱에 HTTP 요청을 보내기 위해 사용
import { app } from "../src/app"; // 테스트 대상이 되는 Express 앱 인스턴스

describe("GET /health", () => {
  it("returns status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
