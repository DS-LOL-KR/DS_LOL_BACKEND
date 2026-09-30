import { describe, expect, it } from "vitest"; // 테스트 러너의 기본 함수들 (테스트 그룹/케이스/검증)
import {
  buildResultCardButtons,
  buildTeamCardButtons,
  parseMatchCustomId,
  parseRateCustomId,
} from "../src/modules/discord/discordMatch.service"; // 팀·결과 카드 버튼 + 매너 평가 custom_id

const ids = (rows: ReturnType<typeof buildTeamCardButtons>) =>
  rows.flatMap((row) => row.components.map((c) => c.custom_id));

describe("card buttons", () => {
  it("team card offers red win, blue win, reshuffle", () => {
    expect(ids(buildTeamCardButtons(9))).toEqual(["match:win_red:9", "match:win_blue:9", "match:reshuffle:9"]);
  });

  it("result card offers manner rating and rematch", () => {
    expect(ids(buildResultCardButtons(9))).toEqual(["match:rate:9", "match:rematch:9"]);
  });
});

describe("parseMatchCustomId", () => {
  it("reads every card action", () => {
    for (const action of ["win_red", "win_blue", "reshuffle", "rematch", "rate"]) {
      expect(parseMatchCustomId(`match:${action}:12`)).toEqual({ action, matchId: 12 });
    }
  });

  it("rejects unknown actions", () => {
    expect(parseMatchCustomId("match:delete:12")).toBeNull();
    expect(parseMatchCustomId("match:win_red:x")).toBeNull();
  });
});

describe("parseRateCustomId", () => {
  it("reads the picker and score buttons", () => {
    expect(parseRateCustomId("rate:pick:3")).toEqual({ kind: "pick", matchId: 3 });
    expect(parseRateCustomId("rate:score:3:77:5")).toEqual({ kind: "score", matchId: 3, targetId: 77, score: 5 });
  });

  it("rejects scores outside 1-5", () => {
    expect(parseRateCustomId("rate:score:3:77:6")).toBeNull();
    expect(parseRateCustomId("rate:score:3:77:0")).toBeNull();
  });
});
