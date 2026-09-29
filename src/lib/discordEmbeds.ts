// 디스코드로 보내는 메시지(슬래시 명령어 답장, /내전모집, 웹후크 알림)를 전부 임베드
// (카드 형태)로 통일하기 위한 공용 빌더(2026-09-29). 예전엔 평범한 텍스트 + 코드 블록이라
// 채팅에서 눈에 잘 안 띄었음. 웹후크(matches.service.ts)와 봇 답장(discord 모듈)이 같은
// 디자인을 쓰도록 lib에 둠.
//
// 글자 크기는 디스코드 마크다운으로 조절함 — description/field value 안에서
// "### " = 큰 제목 글씨, "-# " = 작은 회색 글씨. 제목(title)과 필드 이름은 원래 굵게 나옴.

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

// 임베드 왼쪽 색 띠 — 디스코드 기본 팔레트
export const EMBED_COLOR = {
  blurple: 0x5865f2, // 모집 중, 개인 전적
  green: 0x57f287, // 인원 마감, 팀 구성 완료
  gold: 0xfee75c, // 티어표
  red: 0xed4245, // 레드팀 승리
  blue: 0x3498db, // 블루팀 승리
  gray: 0x4f545c, // 취소, 빈 상태
} as const;

// 필드 값은 디스코드 제한이 1024자 — 넘으면 메시지 전체가 거절되므로 잘라서 보냄
const FIELD_VALUE_LIMIT = 1024;

export function fieldValue(lines: string[], empty = "-"): string {
  const joined = lines.join("\n") || empty;
  return joined.length <= FIELD_VALUE_LIMIT ? joined : joined.slice(0, FIELD_VALUE_LIMIT - 1) + "…";
}

// `MID` 처럼 고정폭 라인 표시(없으면 `-  `)
function positionTag(position: string | null): string {
  return `\`${(position ?? "-").padEnd(3, " ")}\``;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export interface TeamPlayer {
  nickname: string;
  assignedTeam: "TEAM_A" | "TEAM_B" | null;
  assignedPosition: string | null;
  mmr: number;
}

export interface TeamSummaryView {
  teamA: { averageMmr: number; expectedWinRate: number };
  teamB: { averageMmr: number; expectedWinRate: number };
  balancePercent: number;
}

// 팀 구성 완료 — 웹 팀 구성 웹후크 알림과 디스코드 /내전모집 [확정] 결과가 같이 씀
export function buildTeamsEmbed(
  matchId: number,
  players: TeamPlayer[],
  analysis: TeamSummaryView | null,
): DiscordEmbed {
  const red = players.filter((p) => p.assignedTeam === "TEAM_A");
  const blue = players.filter((p) => p.assignedTeam === "TEAM_B");
  const line = (p: TeamPlayer) => `${positionTag(p.assignedPosition)} **${p.nickname}** · ${p.mmr}`;
  const avg = (value: number | undefined) => (value !== undefined ? ` · 평균 ${Math.round(value)}` : "");

  return {
    title: `⚔️ 팀 구성 완료 (${red.length} vs ${blue.length})`,
    description: analysis
      ? `### ⚖️ 밸런스 ${analysis.balancePercent}%\n` +
        `-# 예상 승률  🔴 ${percent(analysis.teamA.expectedWinRate)} : ${percent(analysis.teamB.expectedWinRate)} 🔵`
      : undefined,
    color: EMBED_COLOR.green,
    fields: [
      { name: `🔴 레드팀${avg(analysis?.teamA.averageMmr)}`, value: fieldValue(red.map(line)), inline: true },
      { name: `🔵 블루팀${avg(analysis?.teamB.averageMmr)}`, value: fieldValue(blue.map(line)), inline: true },
    ],
    footer: { text: `내전 #${matchId} · 경기가 끝나면 웹에서 승리팀을 선택해 주세요` },
    timestamp: new Date().toISOString(),
  };
}

export interface ResultPlayer {
  nickname: string;
  assignedTeam: "TEAM_A" | "TEAM_B" | null;
  mmrChange: number;
}

// 내전 결과 — 웹 내전 종료 웹후크 알림과 /내전결과가 같이 씀
export function buildMatchResultEmbed(
  matchId: number,
  winningTeam: "TEAM_A" | "TEAM_B",
  players: ResultPlayer[],
  playedAt: Date,
): DiscordEmbed {
  const redWon = winningTeam === "TEAM_A";
  const winners = players.filter((p) => p.assignedTeam === winningTeam);
  const losers = players.filter((p) => p.assignedTeam && p.assignedTeam !== winningTeam);
  const line = (p: ResultPlayer) => `**${p.nickname}** \`${signed(p.mmrChange)}\``;

  return {
    title: `🏆 ${redWon ? "🔴 레드팀" : "🔵 블루팀"} 승리!`,
    description: `-# 내전 #${matchId}`,
    color: redWon ? EMBED_COLOR.red : EMBED_COLOR.blue,
    fields: [
      { name: `✅ 승리 · ${redWon ? "레드팀" : "블루팀"}`, value: fieldValue(winners.map(line)), inline: true },
      { name: `❌ 패배 · ${redWon ? "블루팀" : "레드팀"}`, value: fieldValue(losers.map(line)), inline: true },
    ],
    footer: { text: "MMR 변동은 내전 결과 기준이에요" },
    timestamp: playedAt.toISOString(),
  };
}
