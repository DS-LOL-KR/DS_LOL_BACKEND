import type { CreateGroupInput, JoinGroupInput, TransferOwnerInput } from "./groups.schema"; // 각 요청 바디의 형태를 명시하기 위해 사용

// 기능명세서: "그룹생성"
// API 명세서: POST /groups
// TODO: invite_code(고유값) 생성 + groups 행 생성 + 생성자를 group_members에
// role="OWNER"로 추가하는 것을 하나의 트랜잭션으로 처리.
export async function createGroup(ownerId: number, input: CreateGroupInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// API 명세서: GET /groups
// TODO: "내가 속한 그룹만" vs "전체 그룹" 중 어느 쪽인지 명세서에 상세가 없어
// 확인 필요. group_members 기준으로 내가 속한 그룹만 보여주는 쪽이 자연스러움.
export async function listGroups(userId: number): Promise<unknown[]> {
  throw new Error("Not implemented");
}

// 기능명세서: "그룹원 목록 보기"
// API 명세서: GET /groups/:id
export async function getGroupById(groupId: number): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "그룹 삭제"
// API 명세서: DELETE /groups/:id
// TODO: 그룹 삭제 시 group_members, custom_matches 등 연관 데이터 처리 정책 필요
// (cascade delete? 아카이브?). requireGroupOwner 미들웨어로 권한 체크 후 호출됨.
export async function deleteGroup(groupId: number): Promise<void> {
  throw new Error("Not implemented");
}

// 기능명세서: "그룹장 위임" — "그룹을 만든사람은 이미 그룹장인데 넘겨주기 가능"
// API 명세서: PATCH /groups/:id/owner
export async function transferOwner(groupId: number, input: TransferOwnerInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "그룹 키" — 초대 코드로 그룹 참가
// API 명세서: POST /groups/join
export async function joinGroup(userId: number, input: JoinGroupInput): Promise<unknown> {
  throw new Error("Not implemented");
}

// 기능명세서: "초대 링크/코드 재발급" — "모르는 사람에게 알려졌을 때 변경할 수 있게"
// API 명세서: POST /groups/:id/invite-code/refresh
export async function refreshInviteCode(groupId: number): Promise<unknown> {
  throw new Error("Not implemented");
}

// API 명세서: DELETE /groups/:id/members/me — 그룹 탈퇴
// TODO: 본인이 OWNER인 경우 탈퇴를 막을지, 자동으로 위임할지 정책 필요.
export async function leaveGroup(groupId: number, userId: number): Promise<void> {
  throw new Error("Not implemented");
}

// 기능명세서: "그룹 추방" — "그룹 안에 있는 팀원을 추방할 수 있음"
// API 명세서: DELETE /groups/:id/members/:userId
export async function removeMember(groupId: number, targetUserId: number): Promise<void> {
  throw new Error("Not implemented");
}
