export const REPORT_REASONS = { spam: 'Спам', harassment: 'Преследование или угрозы', offensive: 'Оскорбления или неприемлемый контент', other: 'Другое' } as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export type ReportTarget =
  | { kind: 'profile'; userId: string }
  | { kind: 'project_message'; messageId: string }
  | { kind: 'project_room'; roomId: string }
  | { kind: 'project_member'; roomId: string; userId: string }
  | { kind: 'cafe_message'; messageId: string; sessionId: string }
  | { kind: 'cafe_player'; sessionId: string };
export type UserBlock = { blocked_id: string; label: string; created_at: string };
export type CafeSafetyState = { blocked: { sessionId: string; name: string; persistent: boolean }[] };
export type SafetyResult = { requestId: string; error?: string; notice?: string };
