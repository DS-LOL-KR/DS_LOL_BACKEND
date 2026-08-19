import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as gameAccountsService from "./game-accounts.service"; // 실제 게임 계정/전적 로직은 서비스 계층에 위임
import { AppError } from "../../lib/AppError"; // :id가 숫자가 아닐 때 400으로 명확하게 막기 위해 사용
import {
  listChampionMasteriesQuerySchema,
  listMatchHistoryQuerySchema,
  syncMatchHistorySchema,
} from "./game-accounts.schema"; // 쿼리/바디는 validate() 미들웨어가 아니라 여기서 직접 검증(쿼리라 body 전용 미들웨어를 못 씀)

function parseId(raw: string, next: NextFunction): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    next(new AppError(400, "Invalid game account id"));
    return null;
  }
  return id;
}

// GET /games
export async function listGames(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const games = await gameAccountsService.listGames();
    res.status(200).json({ games });
  } catch (err) {
    next(err);
  }
}

// POST /users/me/game-accounts
export async function createGameAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const account = await gameAccountsService.createGameAccount(req.user!.id, req.body);
    res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
}

// GET /users/me/game-accounts
export async function listMyGameAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accounts = await gameAccountsService.listMyGameAccounts(req.user!.id);
    res.status(200).json({ accounts });
  } catch (err) {
    next(err);
  }
}

// DELETE /users/me/game-accounts/:id
export async function deleteGameAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    await gameAccountsService.deleteGameAccount(req.user!.id, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /game-accounts/:id/refresh
export async function refreshGameAccountStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const stats = await gameAccountsService.refreshGameAccountStats(req.user!.id, id);
    res.status(200).json({ stats });
  } catch (err) {
    next(err);
  }
}

// GET /game-accounts/:id/stats
export async function getGameAccountStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const stats = await gameAccountsService.getGameAccountStats(id);
    res.status(200).json({ stats });
  } catch (err) {
    next(err);
  }
}

// POST /game-accounts/:id/match-history/sync
export async function syncMatchHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const parsed = syncMatchHistorySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      next(new AppError(400, "Validation failed", parsed.error.flatten()));
      return;
    }

    const result = await gameAccountsService.syncMatchHistory(req.user!.id, id, parsed.data);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

// GET /game-accounts/:id/match-history
export async function listMatchHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const parsed = listMatchHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError(400, "Validation failed", parsed.error.flatten()));
      return;
    }

    const matches = await gameAccountsService.listMatchHistory(id, parsed.data);
    res.status(200).json({ matches });
  } catch (err) {
    next(err);
  }
}

// GET /game-accounts/:id/champion-masteries
export async function listChampionMasteries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const parsed = listChampionMasteriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError(400, "Validation failed", parsed.error.flatten()));
      return;
    }

    const masteries = await gameAccountsService.listChampionMasteries(id, parsed.data.limit);
    res.status(200).json({ masteries });
  } catch (err) {
    next(err);
  }
}

// GET /game-accounts/:id/champion-stats
export async function getChampionStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const championStats = await gameAccountsService.getChampionStats(id);
    res.status(200).json({ championStats });
  } catch (err) {
    next(err);
  }
}
