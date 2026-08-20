import type { Request, Response, NextFunction } from "express"; // Express 컨트롤러 함수 시그니처에 필요한 타입
import * as groupsService from "./groups.service"; // 실제 그룹 생성/조회/삭제 등 로직은 서비스 계층에 위임
import { AppError } from "../../lib/AppError"; // :id/:userId가 숫자가 아닐 때 400으로 명확하게 막기 위해 사용

function parseId(raw: string, next: NextFunction): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    next(new AppError(400, "Invalid id"));
    return null;
  }
  return id;
}

// POST /groups
export async function createGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const group = await groupsService.createGroup(req.user!.id, req.body);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
}

// GET /groups
export async function listGroups(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const groups = await groupsService.listGroups(req.user!.id);
    res.status(200).json({ groups });
  } catch (err) {
    next(err);
  }
}

// GET /groups/:id
export async function getGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const group = await groupsService.getGroupById(id);
    res.status(200).json({ group });
  } catch (err) {
    next(err);
  }
}

// DELETE /groups/:id
export async function deleteGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    await groupsService.deleteGroup(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// PATCH /groups/:id/owner
export async function transferOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const group = await groupsService.transferOwner(id, req.body);
    res.status(200).json({ group });
  } catch (err) {
    next(err);
  }
}

// POST /groups/join
export async function joinGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const membership = await groupsService.joinGroup(req.user!.id, req.body);
    res.status(201).json({ membership });
  } catch (err) {
    next(err);
  }
}

// POST /groups/:id/invite-code/refresh
export async function refreshInviteCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    const group = await groupsService.refreshInviteCode(id);
    res.status(200).json({ group });
  } catch (err) {
    next(err);
  }
}

// DELETE /groups/:id/members/me
export async function leaveGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;

    await groupsService.leaveGroup(id, req.user!.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// DELETE /groups/:id/members/:userId
export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseId(req.params.id, next);
    if (id === null) return;
    const userId = parseId(req.params.userId, next);
    if (userId === null) return;

    await groupsService.removeMember(id, userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
