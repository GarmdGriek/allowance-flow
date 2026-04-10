/** HealthResponse */
export interface HealthResponse {
  /** Status */
  status: string;
}

export type CheckHealthData = HealthResponse;

export interface ApproveMemberRequest {
  user_id: string;
  role: "parent" | "child";
}

export interface ChildResponse {
  user_id: string;
  name?: string | null;
  email?: string | null;
  total_earned: string;
  total_paid: string;
  pending_amount: string;
  phone_number?: string | null;
}

export interface CreateInviteRequest {
  role: "parent" | "child";
  invited_name?: string | null;
}

export interface CreateProfileRequest {
  role?: "parent" | "child" | null;
  family_id?: string | null;
  currency?: string;
  invite_code?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  value: number | string;
  assigned_to_user_id?: string | null;
  is_recurring?: boolean;
  recurrence_days?: number[] | null;
  auto_recreate?: boolean;
}

export interface FamilyInviteResponse {
  id: string;
  family_id: string;
  role: "parent" | "child";
  invite_code: string;
  invited_name?: string | null;
  created_by: string;
  created_at: string;
  used_by?: string | null;
  used_at?: string | null;
  revoked: boolean;
  revoked_at?: string | null;
}

export interface LanguagePreferences {
  user_language: string | null;
  family_language: string;
  effective_language: string;
}

export interface MarkReadRequest {
  notification_ids: string[];
}

export interface NotificationResponse {
  id: string;
  user_id: string;
  family_id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
  metadata: Record<string, any> | null;
}

export interface ParentResponse {
  user_id: string;
  name: string;
}

export interface PendingMemberResponse {
  user_id: string;
  role: "parent" | "child";
  name?: string | null;
  email?: string | null;
  created_at: string;
}

export interface ProfileResponse {
  user_id: string;
  role: "parent" | "child";
  family_id: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  name?: string | null;
  email?: string | null;
}

export interface RecurringTaskProcessResult {
  tasks_created: number;
  tasks_processed: number;
  details: string[];
}

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  value: string;
  status: "available" | "pending_approval" | "completed" | "paid";
  created_by: string;
  completed_by: string | null;
  assigned_to_user_id: string | null;
  family_id: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  is_recurring?: boolean;
  recurrence_days?: number[] | null;
  parent_task_id?: string | null;
  auto_recreate?: boolean;
  created_by_name?: string | null;
  completed_by_name?: string | null;
  assigned_to_name?: string | null;
}

export interface UpdateChildRequest {
  name?: string | null;
  email?: string | null;
  password?: string | null;
  phone_number?: string | null;
}

export interface UpdateFamilyLanguageRequest {
  language: string;
}

export interface UpdateResponse {
  success: boolean;
  message: string;
}

export interface UpdateTaskRequest {
  title?: string | null;
  description?: string | null;
  value?: number | string | null;
  status?: "available" | "pending_approval" | "completed" | "paid" | null;
  assigned_to_user_id?: string | null;
  is_recurring?: boolean | null;
  recurrence_days?: number[] | null;
  auto_recreate?: boolean | null;
}

export interface UpdateUserLanguageRequest {
  language: string | null;
}

export interface UpdateWeeklySummarySettingsRequest {
  enabled?: boolean | null;
  day?: number | null;
  hour?: number | null;
}

export interface WeeklySummaryResult {
  notifications_sent: number;
  families_processed: number;
  children_summarized: number;
  details: string[];
}

export interface WeeklySummarySettingsResponse {
  enabled: boolean;
  day: number;
  hour: number;
}
