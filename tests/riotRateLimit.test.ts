import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"; // 테스트 러너 + 가짜 타이머
import { waitForRiotRateLimit } from "../src/modules/game-accounts/riot.client"; // 테스트 대상 공용 초당 제한

// 매치 상세를 동시에 받게 바꾸면서(2026-11-02) 초당 20건 한도를 이 공용 제한 하나가 지킴.
describe("waitForRiotRateLimit", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lets 18 requests through per second and holds the rest until the window frees up", async () => {
    let passed = 0;
    for (let i = 0; i < 20; i += 1) {
      void waitForRiotRateLimit().then(() => {
        passed += 1;
      });
    }

    await vi.advanceTimersByTimeAsync(0);
    expect(passed).toBe(18);

    await vi.advanceTimersByTimeAsync(999);
    expect(passed).toBe(18);

    await vi.advanceTimersByTimeAsync(1);
    expect(passed).toBe(20);
  });
});
