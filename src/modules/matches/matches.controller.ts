import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as matchesService from "./matches.service"; // 실제 내전 생성/팀 구성/평가/MMR 로직은 서비스 계층에 위임

// POST /groups/:id/matches
export async function createMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const match = await matchesService.createMatch(Number(req.params.id), req.body);
    res.status(201).json({ match });
  } catch (err) {
    next(err);
  }
}

// GET /groups/:id/matches
export async function listMatchesForGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const matches = await matchesService.listMatchesForGroup(Number(req.params.id));
    res.status(200).json({ matches });
  } catch (err) {
    next(err);
  }
}

// GET /matches/:id
export async function getMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const match = await matchesService.getMatchById(Number(req.params.id));
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// POST /matches/:id/teams/generate
export async function generateTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const match = await matchesService.generateTeams(Number(req.params.id), req.body);
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// PATCH /matches/:id/teams
export async function updateTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const match = await matchesService.updateTeams(Number(req.params.id), req.body);
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// POST /matches/:id/finish
export async function finishMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const match = await matchesService.finishMatch(Number(req.params.id), req.body);
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// POST /matches/:id/evaluations
export async function createEvaluation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const evaluation = await matchesService.createEvaluation(
      Number(req.params.id),
      req.user!.id,
      req.body,
    );
    res.status(201).json({ evaluation });
  } catch (err) {
    next(err);
  }
}

// GET /matches/:id/mmr-changes
export async function getMmrChangesForMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const changes = await matchesService.getMmrChangesForMatch(Number(req.params.id));
    res.status(200).json({ changes });
  } catch (err) {
    next(err);
  }
}

// GET /users/me/mmr-history
export async function getMyMmrHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const history = await matchesService.getMyMmrHistory(req.user!.id);
    res.status(200).json({ history });
  } catch (err) {
    next(err);
  }
}
