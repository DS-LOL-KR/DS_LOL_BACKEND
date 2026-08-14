import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as gameAccountsService from "./game-accounts.service"; // 실제 게임 계정/전적 로직은 서비스 계층에 위임

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
    await gameAccountsService.deleteGameAccount(req.user!.id, Number(req.params.id));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /game-accounts/:id/refresh
export async function refreshGameAccountStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await gameAccountsService.refreshGameAccountStats(Number(req.params.id));
    res.status(200).json({ stats });
  } catch (err) {
    next(err);
  }
}

// GET /game-accounts/:id/stats
export async function getGameAccountStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await gameAccountsService.getGameAccountStats(Number(req.params.id));
    res.status(200).json({ stats });
  } catch (err) {
    next(err);
  }
}
