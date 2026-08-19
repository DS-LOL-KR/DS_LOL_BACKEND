import axios from "axios"; // 라이엇 API에 HTTP 요청을 보내기 위해 사용
import { env } from "../../config/env"; // RIOT_API_KEY, RIOT_REGION

// League-V4/Summoner-V4 등은 "플랫폼 라우팅"(kr, na1, euw1...)을 쓰고,
// Account-V1(라이엇ID 조회)은 더 넓은 "지역 라우팅"(asia, americas, europe)을 씀.
// .env엔 RIOT_REGION(플랫폼 라우팅) 하나만 있으므로 여기서 지역 라우팅으로 변환.
const PLATFORM_TO_REGIONAL: Record<string, "asia" | "americas" | "europe"> = {
  kr: "asia",
  jp1: "asia",
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  oc1: "americas",
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
};

const platformRouting = env.RIOT_REGION;
const regionalRouting = PLATFORM_TO_REGIONAL[env.RIOT_REGION] ?? "asia";

// 모든 라이엇 API 호출에 공통으로 필요한 API 키 헤더를 미리 박아둔 axios 인스턴스
const riotHttp = axios.create({
  headers: { "X-Riot-Token": env.RIOT_API_KEY },
});

export interface RiotAccount {
  puuid: string;
  gameName: string;
  tagLine: string;
}

// Account-V1: 라이엇ID(닉네임#태그)로 전역 고유 식별자인 puuid를 조회
export async function fetchRiotAccountByRiotId(gameName: string, tagLine: string): Promise<RiotAccount> {
  const url = `https://${regionalRouting}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  const { data } = await riotHttp.get<RiotAccount>(url);
  return data;
}

export interface RiotLeagueEntry {
  queueType: string; // 예: "RANKED_SOLO_5x5", "RANKED_FLEX_SR"
  tier: string; // 예: "GOLD"
  rank: string; // 예: "II"
  leaguePoints: number;
  wins: number;
  losses: number;
}

// League-V4: puuid로 솔로랭크 등 큐별 티어 정보를 조회
export async function fetchLeagueEntriesByPuuid(puuid: string): Promise<RiotLeagueEntry[]> {
  const url = `https://${platformRouting}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
  const { data } = await riotHttp.get<RiotLeagueEntry[]>(url);
  return data;
}

export interface RiotSummoner {
  profileIconId: number;
  summonerLevel: number;
}

// Summoner-V4: puuid로 소환사 레벨/프로필 아이콘 조회 (플랫폼 라우팅)
export async function fetchSummonerByPuuid(puuid: string): Promise<RiotSummoner> {
  const url = `https://${platformRouting}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  const { data } = await riotHttp.get<RiotSummoner>(url);
  return data;
}

export interface RiotChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number; // epoch millis
}

// Champion-Mastery-V4: puuid로 보유한 모든 챔피언의 숙련도를 조회 (플랫폼 라우팅)
export async function fetchChampionMasteriesByPuuid(puuid: string): Promise<RiotChampionMastery[]> {
  const url = `https://${platformRouting}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`;
  const { data } = await riotHttp.get<RiotChampionMastery[]>(url);
  return data;
}

// Match-V5: puuid로 최근 매치 ID 목록을 조회 (Account-V1과 같은 지역 라우팅 사용 — 플랫폼 라우팅 아님)
export async function fetchMatchIdsByPuuid(puuid: string, count: number): Promise<string[]> {
  const url = `https://${regionalRouting}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  const { data } = await riotHttp.get<string[]>(url);
  return data;
}

export interface RiotMatchParticipant {
  puuid: string;
  championId: number;
  teamPosition: string; // TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY, 일부 모드는 빈 문자열
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  win: boolean;
}

export interface RiotMatch {
  metadata: { matchId: string };
  info: {
    gameDuration: number;
    gameStartTimestamp: number;
    queueId: number;
    participants: RiotMatchParticipant[];
  };
}

// Match-V5: 매치 ID로 그 매치의 전체 상세(10명 전원)를 조회 (지역 라우팅)
export async function fetchMatchById(matchId: string): Promise<RiotMatch> {
  const url = `https://${regionalRouting}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
  const { data } = await riotHttp.get<RiotMatch>(url);
  return data;
}

// Match-V5는 queueType 문자열이 아니라 queueId(숫자)만 줌 — 사람이 읽을 이름은
// 라이엇의 정적 데이터(Data Dragon queues.json)로 관리해야 하는데, 아직 그 연동
// 전이라 자주 쓰이는 큐만 우선 매핑하고 나머지는 숫자 그대로 문자열화해서 저장.
const QUEUE_ID_TO_TYPE: Record<number, string> = {
  400: "NORMAL_DRAFT",
  420: "RANKED_SOLO_5x5",
  430: "NORMAL_BLIND",
  440: "RANKED_FLEX_SR",
  450: "ARAM",
};

export function resolveQueueType(queueId: number): string {
  return QUEUE_ID_TO_TYPE[queueId] ?? `QUEUE_${queueId}`;
}
