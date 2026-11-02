import { EMBED_COLOR } from "../../lib/discordEmbeds"; // 임베드와 같은 색 팔레트(티어표 = 금색)
import {
  DISCORD_COMPONENTS_V2_FLAG,
  type DiscordActionRow,
  type DiscordContainer,
  type DiscordMessageData,
  type DiscordSeparator,
  type DiscordTextDisplay,
} from "./discord.types";

// /티어표 카드(2026-10-11) — 임베드 필드 목록이라 밋밋하던 걸 Components V2 컨테이너로
// 바꿈. 티어마다 구분선, 명령어 쓴 사람 줄 강조, 직전 내전 MMR 변화, 최근 내전 승패를
// 보여주고 아래에 [내 순위] 버튼을 붙임. DB 조회는 discord.service.ts가 하고 여기선
// 그리기만 함(테스트하기 쉽게).

export type TierNumber = 1 | 2 | 3 | 4 | 5;

export const TIER_EMOJI: Record<TierNumber, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
  4: "4️⃣",
  5: "5️⃣",
};

export interface TierCardRow {
  userId: number;
  nickname: string;
  mmr: number;
  tier: TierNumber;
  // 이 그룹에서 가장 최근에 끝난 내전의 mmr_change. 내전 기록이 없으면 null.
  lastChange: number | null;
  // 최근 내전 승패, 최신순(true = 승)
  recent: boolean[];
}

export interface TierCardView {
  groupName: string;
  rows: TierCardRow[]; // 순위 순서
  viewerUserId: number | null;
  lastUpdatedAt: string | null;
}

export const TIER_ME_CUSTOM_ID = "tier:me";
const RECENT_FORM_COUNT = 5;
// 디스코드 제한: 한 메시지의 TextDisplay 글자 수 합계 4000자 — 헤더/푸터 몫을 빼고 남긴 예산
const TIER_SECTION_CHAR_BUDGET = 3500;

export function formatChange(change: number | null): string {
  if (!change) return "";
  return change > 0 ? `▲${change}` : `▼${-change}`;
}

// 왼쪽이 오래된 판, 오른쪽이 최신 판
export function formatRecentForm(recent: boolean[]): string {
  return recent
    .slice(0, RECENT_FORM_COUNT)
    .reverse()
    .map((win) => (win ? "🟢" : "🔴"))
    .join("");
}

function rowLine(row: TierCardRow, rank: number, isViewer: boolean): string {
  const change = formatChange(row.lastChange);
  const form = formatRecentForm(row.recent);
  const parts = [`\`${String(rank).padStart(2, " ")}\` **${row.nickname}** · \`${row.mmr}\``];
  if (change) parts.push(change);
  if (form) parts.push(form);
  const line = parts.join(" ");
  return isViewer ? `👉 ${line}` : line;
}

const text = (content: string): DiscordTextDisplay => ({ type: 10, content });
const divider = (spacing: 1 | 2 = 1): DiscordSeparator => ({ type: 14, divider: true, spacing });

function header(view: TierCardView, total: number): DiscordTextDisplay {
  const updated = view.lastUpdatedAt
    ? ` · 갱신 <t:${Math.floor(new Date(view.lastUpdatedAt).getTime() / 1000)}:R>`
    : "";
  return text(`## 📊 ${view.groupName} 티어표\n-# 그룹 내부 MMR 기준 · 총 ${total}명${updated}`);
}

export function buildTierCard(view: TierCardView): DiscordMessageData {
  if (view.rows.length === 0) {
    const container: DiscordContainer = {
      type: 17,
      accent_color: EMBED_COLOR.gray,
      components: [header(view, 0), divider(), text("아직 집계된 데이터가 없어요. 게임 계정을 연동하면 티어표에 올라가요.")],
    };
    return { components: [container], flags: DISCORD_COMPONENTS_V2_FLAG };
  }

  const components: DiscordContainer["components"] = [header(view, view.rows.length), divider(2)];

  let budget = TIER_SECTION_CHAR_BUDGET;
  let rank = 0;
  for (const tier of [1, 2, 3, 4, 5] as const) {
    const rowsInTier = view.rows.filter((r) => r.tier === tier);
    if (rowsInTier.length === 0) continue;

    const lines: string[] = [];
    let hidden = 0;
    for (const row of rowsInTier) {
      rank += 1;
      const line = rowLine(row, rank, row.userId === view.viewerUserId);
      if (budget - line.length - 1 < 0) {
        hidden += 1;
        continue;
      }
      budget -= line.length + 1;
      lines.push(line);
    }
    if (hidden > 0) lines.push(`-# …외 ${hidden}명`);

    components.push(text(`### ${TIER_EMOJI[tier]} ${tier}티어\n${lines.join("\n")}`));
    components.push(divider());
  }

  const viewerRank = view.rows.findIndex((r) => r.userId === view.viewerUserId);
  const footer =
    viewerRank >= 0
      ? `-# 👉 내 순위 ${viewerRank + 1}위 / ${view.rows.length}명 · ▲▼ 직전 내전 MMR 변화 · 🟢🔴 최근 내전`
      : "-# ▲▼ 직전 내전 MMR 변화 · 🟢🔴 최근 내전";
  components.push(text(footer));

  const buttons: DiscordActionRow = {
    type: 1,
    components: [{ type: 2, style: 2, label: "내 순위", emoji: { name: "📍" }, custom_id: TIER_ME_CUSTOM_ID }],
  };
  components.push(buttons);

  return {
    components: [{ type: 17, accent_color: EMBED_COLOR.gold, components }],
    flags: DISCORD_COMPONENTS_V2_FLAG,
  };
}

// [내 순위] — 누른 사람에게만 보이는 짧은 요약(V2 아님, 일반 content)
export function buildMyRankContent(view: TierCardView, userId: number): string | null {
  const index = view.rows.findIndex((r) => r.userId === userId);
  if (index < 0) return null;
  const row = view.rows[index];

  const change = formatChange(row.lastChange);
  const lines = [
    `### 📍 ${row.nickname}님은 ${index + 1}위 / ${view.rows.length}명`,
    `-# ${TIER_EMOJI[row.tier]} ${row.tier}티어 · MMR ${row.mmr}${change ? ` · 직전 내전 ${change}` : ""}`,
  ];
  if (row.recent.length > 0) {
    const shown = row.recent.slice(0, RECENT_FORM_COUNT);
    const wins = shown.filter(Boolean).length;
    lines.push(`최근 내전 ${formatRecentForm(shown)} (${wins}승 ${shown.length - wins}패)`);
  }
  return lines.join("\n");
}
