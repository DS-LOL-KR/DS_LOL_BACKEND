import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as matchesService from "./matches.service"; // 실제 내전 생성/팀 구성/평가/MMR 로직은 서비스 계층에 위임
import { AppError } from "../../lib/AppError"; // :id가 숫자가 아닐 때 400으로 명확하게 막기 위해 사용

function parseId(raw: string, next: NextFunction): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    next(new AppError(400, "Invalid id"));
    return null;
  }
  return id;
}

// POST /groups/:id/matches
export async function createMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const groupId = parseId(req.params.id, next);
    if (groupId === null) return;

    const match = await matchesService.createMatch(groupId, req.user!.id, req.body);
    res.status(201).json({ match });
  } catch (err) {
    next(err);
  }
}

// GET /groups/:id/matches
export async function listMatchesForGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const groupId = parseId(req.params.id, next);
    if (groupId === null) return;

    const matches = await matchesService.listMatchesForGroup(groupId);
    res.status(200).json({ matches });
  } catch (err) {
    next(err);
  }
}

// GET /matches/:id
export async function getMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const match = await matchesService.getMatchById(id);
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// POST /matches/:id/teams/generate
export async function generateTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const match = await matchesService.generateTeams(id, req.body);
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// PATCH /matches/:id/teams
export async function updateTeams(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const match = await matchesService.updateTeams(id, req.body);
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// POST /matches/:id/finish
export async function finishMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const match = await matchesService.finishMatch(id, req.body);
    res.status(200).json({ match });
  } catch (err) {
    next(err);
  }
}

// POST /matches/:id/evaluations
export async function createEvaluation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const evaluation = await matchesService.createEvaluation(id, req.user!.id, req.body);
    res.status(201).json({ evaluation });
  } catch (err) {
    next(err);
  }
}

// GET /matches/:id/mmr-changes
export async function getMmrChangesForMatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const changes = await matchesService.getMmrChangesForMatch(id);
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
