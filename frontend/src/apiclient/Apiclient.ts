import {
  ApproveMemberRequest,
  CheckHealthData,
  ChildResponse,
  CreateInviteRequest,
  CreateProfileRequest,
  CreateTaskRequest,
  FamilyInviteResponse,
  LanguagePreferences,
  MarkReadRequest,
  NotificationResponse,
  ParentResponse,
  PendingMemberResponse,
  ProfileResponse,
  RecurringTaskProcessResult,
  TaskResponse,
  UpdateChildRequest,
  UpdateFamilyLanguageRequest,
  UpdateResponse,
  UpdateTaskRequest,
  UpdateUserLanguageRequest,
  UpdateWeeklySummarySettingsRequest,
  WeeklySummaryResult,
  WeeklySummarySettingsResponse,
} from "./data-contracts";
import { ContentType, HttpClient, RequestParams } from "./http-client";

export class Apiclient<SecurityDataType = unknown> extends HttpClient<SecurityDataType> {
  check_health = (params: RequestParams = {}) =>
    this.request<CheckHealthData, any>({
      path: `/_healthz`,
      method: "GET",
      ...params,
    });

  // --- Profile ---

  get_my_profile = (params: RequestParams = {}) =>
    this.request<ProfileResponse, any>({
      path: `/api/profile/me`,
      method: "GET",
      ...params,
    });

  setup_profile = (body: CreateProfileRequest, params: RequestParams = {}) =>
    this.request<ProfileResponse, any>({
      path: `/api/profile/setup`,
      method: "POST",
      body,
      type: ContentType.Json,
      ...params,
    });

  update_profile = (body: CreateProfileRequest, params: RequestParams = {}) =>
    this.request<ProfileResponse, any>({
      path: `/api/profile/update`,
      method: "PUT",
      body,
      type: ContentType.Json,
      ...params,
    });

  // --- Tasks ---

  list_tasks = (params: RequestParams = {}) =>
    this.request<TaskResponse[], any>({
      path: `/api/tasks`,
      method: "GET",
      ...params,
    });

  create_task = (body: CreateTaskRequest, params: RequestParams = {}) =>
    this.request<TaskResponse, any>({
      path: `/api/tasks`,
      method: "POST",
      body,
      type: ContentType.Json,
      ...params,
    });

  update_task = (taskId: string, body: UpdateTaskRequest, params: RequestParams = {}) =>
    this.request<TaskResponse, any>({
      path: `/api/tasks/${taskId}`,
      method: "PUT",
      body,
      type: ContentType.Json,
      ...params,
    });

  delete_task = (taskId: string, params: RequestParams = {}) =>
    this.request<Record<string, any>, any>({
      path: `/api/tasks/${taskId}`,
      method: "DELETE",
      ...params,
    });

  // --- Family ---

  list_children = (params: RequestParams = {}) =>
    this.request<ChildResponse[], any>({
      path: `/api/family/children`,
      method: "GET",
      ...params,
    });

  list_parents = (params: RequestParams = {}) =>
    this.request<ParentResponse[], any>({
      path: `/api/family/parents`,
      method: "GET",
      ...params,
    });

  list_invites = (params: RequestParams = {}) =>
    this.request<FamilyInviteResponse[], any>({
      path: `/api/family/invites`,
      method: "GET",
      ...params,
    });

  create_invite = (body: CreateInviteRequest, params: RequestParams = {}) =>
    this.request<FamilyInviteResponse, any>({
      path: `/api/family/invites`,
      method: "POST",
      body,
      type: ContentType.Json,
      ...params,
    });

  revoke_invite = (inviteId: string, params: RequestParams = {}) =>
    this.request<Record<string, any>, any>({
      path: `/api/family/invites/${inviteId}`,
      method: "DELETE",
      ...params,
    });

  list_pending_members = (params: RequestParams = {}) =>
    this.request<PendingMemberResponse[], any>({
      path: `/api/family/pending-members`,
      method: "GET",
      ...params,
    });

  approve_member = (body: ApproveMemberRequest, params: RequestParams = {}) =>
    this.request<Record<string, any>, any>({
      path: `/api/family/approve-member`,
      method: "POST",
      body,
      type: ContentType.Json,
      ...params,
    });

  reject_member = (userId: string, params: RequestParams = {}) =>
    this.request<Record<string, any>, any>({
      path: `/api/family/reject-member/${userId}`,
      method: "DELETE",
      ...params,
    });

  update_child_profile = (childUserId: string, body: UpdateChildRequest, params: RequestParams = {}) =>
    this.request<ChildResponse, any>({
      path: `/api/family/children/${childUserId}`,
      method: "PUT",
      body,
      type: ContentType.Json,
      ...params,
    });

  get_weekly_summary_settings = (params: RequestParams = {}) =>
    this.request<WeeklySummarySettingsResponse, any>({
      path: `/api/family/weekly-summary-settings`,
      method: "GET",
      ...params,
    });

  update_weekly_summary_settings = (body: UpdateWeeklySummarySettingsRequest, params: RequestParams = {}) =>
    this.request<WeeklySummarySettingsResponse, any>({
      path: `/api/family/weekly-summary-settings`,
      method: "PUT",
      body,
      type: ContentType.Json,
      ...params,
    });

  // --- Language ---

  get_language_preferences = (params: RequestParams = {}) =>
    this.request<LanguagePreferences, any>({
      path: `/api/language/preferences`,
      method: "GET",
      ...params,
    });

  update_user_language = (body: UpdateUserLanguageRequest, params: RequestParams = {}) =>
    this.request<UpdateResponse, any>({
      path: `/api/language/user`,
      method: "PUT",
      body,
      type: ContentType.Json,
      ...params,
    });

  update_family_language = (body: UpdateFamilyLanguageRequest, params: RequestParams = {}) =>
    this.request<UpdateResponse, any>({
      path: `/api/language/family`,
      method: "PUT",
      body,
      type: ContentType.Json,
      ...params,
    });

  // --- Notifications ---

  list_notifications = (unreadOnly: boolean = false, params: RequestParams = {}) =>
    this.request<NotificationResponse[], any>({
      path: `/api/`,
      method: "GET",
      query: { unread_only: unreadOnly },
      ...params,
    });

  get_unread_count = (params: RequestParams = {}) =>
    this.request<Record<string, any>, any>({
      path: `/api/unread-count`,
      method: "GET",
      ...params,
    });

  mark_notifications_read = (body: MarkReadRequest, params: RequestParams = {}) =>
    this.request<Record<string, any>, any>({
      path: `/api/mark-read`,
      method: "POST",
      body,
      type: ContentType.Json,
      ...params,
    });

  mark_all_read = (params: RequestParams = {}) =>
    this.request<Record<string, any>, any>({
      path: `/api/mark-all-read`,
      method: "POST",
      ...params,
    });

  // --- Automation ---

  process_recurring_tasks = (params: RequestParams = {}) =>
    this.request<RecurringTaskProcessResult, any>({
      path: `/api/automation/process-recurring-tasks`,
      method: "POST",
      ...params,
    });

  send_weekly_summary = (params: RequestParams = {}) =>
    this.request<WeeklySummaryResult, any>({
      path: `/api/weekly-summary`,
      method: "POST",
      ...params,
    });
}
