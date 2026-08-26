import axios from "axios"; // 라이엇 정적 데이터(Data Dragon)를 조회하기 위해 사용 — API 키 불필요
import { logger } from "../../lib/logger"; // 조회 실패를 조용히 무시하지 않고 남기기 위해 사용

// Match-V5 등 라이엇 API는 championId(숫자)만 주고 이름은 안 줘서, 화면에 "챔피언
// #266"처럼 뜨는 문제가 있었음. Data Dragon(정적 CDN, API 키 불필요)에서 챔피언
// 목록을 받아와 championId -> 한글 이름 매핑을 만들어 캐싱해둠.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let championNameById: Map<number, string> | null = null;
let cachedAt = 0;
let inFlight: Promise<Map<number, string>> | null = null;

async function fetchChampionNameMap(): Promise<Map<number, string>> {
  const { data: versions } = await axios.get<string[]>(
    "https://ddragon.leagueoflegends.com/api/versions.json",
  );
  const latestVersion = versions[0];

  const { data } = await axios.get<{ data: Record<string, { key: string; name: string }> }>(
    `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/ko_KR/champion.json`,
  );

  const map = new Map<number, string>();
  for (const champion of Object.values(data.data)) {
    map.set(Number(champion.key), champion.name);
  }
  return map;
}

async function ensureChampionNameMap(): Promise<Map<number, string>> {
  const isStale = Date.now() - cachedAt > CACHE_TTL_MS;
  if (championNameById && !isStale) {
    return championNameById;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = fetchChampionNameMap()
    .then((map) => {
      championNameById = map;
      cachedAt = Date.now();
      return map;
    })
    .catch((err) => {
      // Data Dragon이 잠깐 안 되더라도 화면이 깨지면 안 되니, 이전에 캐싱해둔
      // 값이 있으면 그거라도 계속 씀 — 없으면 빈 맵(= 전부 이름 미확인 처리).
      logger.error("Failed to fetch champion data from Data Dragon", {
        message: err instanceof Error ? err.message : String(err),
      });
      return championNameById ?? new Map<number, string>();
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function getChampionNameMap(): Promise<Map<number, string>> {
  return ensureChampionNameMap();
}

export async function getChampionName(championId: number): Promise<string | null> {
  const map = await ensureChampionNameMap();
  return map.get(championId) ?? null;
}
