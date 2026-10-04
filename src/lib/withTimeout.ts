// 외부 호출(구글 OAuth 등)이 응답 없이 영원히 매달리지 않게 시간 제한을 거는 헬퍼.
// 2026-10-04 배포 서버에서 Docker 네트워크 MTU(1500)가 VM 네트워크(1442)보다 커서 구글의
// 큰 응답 패킷이 버려졌고, 타임아웃이 없는 google-auth-library 호출이 그대로 멈춰 로그인
// 화면이 무한 로딩됐음. 원인이 무엇이든 정해진 시간 안에 실패로 끝나게 하고, 어느 단계에서
// 멈췄는지(step)를 에러에 남김.
export class TimeoutError extends Error {
  constructor(public readonly step: string, public readonly ms: number) {
    super(`${step} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(step, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
