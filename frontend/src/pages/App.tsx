





import React, { lazy, Suspense } from "react";
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUserGuardContext } from "app/auth";
import { DollarSign, CheckCircle, Clock, XCircle, Plus, User, Settings, Repeat, Eye, Edit2, Check, X, Copy, QrCode } from "lucide-react";
import { apiClient } from "app";

const VippsQrDialog = lazy(() => import("components/VippsQrDialog"));
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrencySymbol } from "utils/currencies";
import type { ProfileResponse } from "types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePreviewStore } from "utils/previewStore";
import { ChildDashboard } from "components/ChildDashboard";
import { PageHeader } from "components/PageHeader";
import { useTranslation } from "react-i18next";

type UserRole = "parent" | "child";

interface Task {
  id: string;
  title: string;
  description?: string | null;
  value: number;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  status: "available" | "completed" | "paid";
  completedDate?: string;
  is_recurring: boolean;
  parent_task_id: string | null;
  auto_recreate?: boolean;
}

interface Child {
  id: string;
  name: string;
  earned: number;
  paid: number;
  pending: number;
  phone_number?: string | null;  // For Vipps payment
}

export default function App() {
  const navigate = useNavigate();
  const { user } = useUserGuardContext();
  const { t } = useTranslation();
  const [cachedFamily] = useState(() => {
    try {
      const raw = localStorage.getItem(`allowance-flow:family:${user.id}`);
      return raw
        ? (JSON.parse(raw) as {
            children: Child[];
            tasks: Task[];
            currency?: string;
            role?: UserRole;
          })
        : null;
    } catch {
      return null;
    }
  });
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>(cachedFamily?.role ?? "parent");
  const [selectedChild, setSelectedChild] = useState<string>("child1");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [activeTab, setActiveTab] = useState("available");
  const [children, setChildren] = useState<Child[]>(cachedFamily?.children ?? []);
  const [tasks, setTasks] = useState<Task[]>(cachedFamily?.tasks ?? []);
  const [currencySymbol, setCurrencySymbol] = useState(
    cachedFamily?.currency ? getCurrencySymbol(cachedFamily.currency) : "$",
  );
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [taskViewTab, setTaskViewTab] = useState<"all" | "recurring">("all"); // New state for tab selection
  const [previewActiveTab, setPreviewActiveTab] = useState<string>("available");
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", value: "", assignedTo: "" });

  // Helper function to filter tasks based on view tab
  const getFilteredTasks = (status: "available" | "completed" | "paid") => {
    const statusFiltered = tasks.filter(t => t.status === status);
    
    if (taskViewTab === "recurring") {
      // Show only recurring templates (is_recurring && !parent_task_id)
      return statusFiltered.filter(t => t.is_recurring && !t.parent_task_id);
    }
    
    // Show all tasks except recurring templates
    return statusFiltered.filter(t => !(t.is_recurring && !t.parent_task_id));
  };

  // Task creation states
  const [taskTitle, setTaskTitle] = useState("");
  const [taskValue, setTaskValue] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [autoRecreate, setAutoRecreate] = useState(false);
  
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const { isPreviewMode, previewChildId, previewChildName, enterPreviewMode, exitPreviewMode } = usePreviewStore();

  const toggleDescription = (taskId: string) => {
    setExpandedDescriptions(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  const [searchParams, setSearchParams] = useSearchParams();

  // When navigating here from another page via "Forhåndsvisning" menu item,
  // auto-open the preview dialog and clear the param from the URL.
  useEffect(() => {
    if (searchParams.get("openPreview") === "1") {
      setShowPreviewDialog(true);
      setSearchParams(prev => { prev.delete("openPreview"); return prev; }, { replace: true });
    }
  }, []);

  // Track copied state for copy buttons
  const [copiedAmount, setCopiedAmount] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [qrChild, setQrChild] = useState<Child | null>(null);
  const [copiedQrPhone, setCopiedQrPhone] = useState(false);

  const WEEKDAYS = [
    { value: 0, label: t("weekdays.sun") },
    { value: 1, label: t("weekdays.mon") },
    { value: 2, label: t("weekdays.tue") },
    { value: 3, label: t("weekdays.wed") },
    { value: 4, label: t("weekdays.thu") },
    { value: 5, label: t("weekdays.fri") },
    { value: 6, label: t("weekdays.sat") },
  ];

  // Fetch children and tasks for parent
  const fetchFamilyData = async () => {
    setIsLoadingData(true);
    try {
      const [childrenResponse, tasksResponse] = await Promise.all([
        apiClient.list_children(),
        apiClient.list_tasks()
      ]);

      // Transform children data
      const childrenData = await childrenResponse.json();
      const transformedChildren = childrenData.map((child: any) => ({
        id: child.user_id,
        name: child.name,
        earned: parseFloat(child.total_earned || 0),
        paid: parseFloat(child.total_paid || 0),
        pending: parseFloat(child.pending_amount || 0),
        phone_number: child.phone_number
      }));
      setChildren(transformedChildren);

      // Transform tasks data
      const tasksData = await tasksResponse.json();
      const transformedTasks = tasksData.map((task: any) => {
        const transformed = {
          id: task.id,
          title: task.title,
          description: task.description ?? null,
          value: parseFloat(task.value),
          status: task.status,
          assigned_to_user_id: task.assigned_to_user_id,
          assigned_to_name: task.assigned_to_name,
          completedDate: task.completed_at ? new Date(task.completed_at).toLocaleDateString() : undefined,
          is_recurring: task.is_recurring,
          parent_task_id: task.parent_task_id
        };
        
        return transformed;
      });
      
      setTasks(transformedTasks);

      try {
        // Persist the currency/role alongside the family data so the next
        // first paint matches reality — otherwise amounts flash $ before the
        // profile fetch resolves and we re-render with the right symbol.
        const existing = (() => {
          try {
            const raw = localStorage.getItem(`allowance-flow:family:${user.id}`);
            return raw ? JSON.parse(raw) : {};
          } catch {
            return {};
          }
        })();
        localStorage.setItem(
          `allowance-flow:family:${user.id}`,
          JSON.stringify({
            ...existing,
            children: transformedChildren,
            tasks: transformedTasks,
          })
        );
      } catch {}

      // Set first child as selected if available
      if (transformedChildren.length > 0) {
        setSelectedChild(transformedChildren[0].id);
        // Update newTask assignedTo with first child's ID
        setNewTask(prev => ({ ...prev, assignedTo: transformedChildren[0].id }));
      }
    } catch (error) {
      console.error("Error fetching family data:", error);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Fetch children from API
  const fetchChildren = async () => {
    try {
      const response = await apiClient.list_children();
      const data = await response.json();
      const childrenData = data.map((child: any) => ({
        id: child.user_id,
        name: child.name || "Unnamed Child",  // Fallback for null/empty names
        earned: parseFloat(child.total_earned || "0"),
        paid: parseFloat(child.total_paid || "0"),
        pending: parseFloat(child.pending_amount || "0"),
        phone_number: child.phone_number || null
      }));
      setChildren(childrenData);
    } catch (error) {
      console.error("Error fetching children:", error);
      toast.error(t("toasts.failedToLoadChildren"));
    }
  };

  // Check if user has completed profile setup
  useEffect(() => {
    const checkProfile = async () => {
      if (!user) {
        // User is not logged in, redirect to sign-in
        navigate("/auth/sign-in");
        return;
      }

      try {
        const response = await apiClient.get_my_profile();

        if (response.status === 404) {
          // Genuinely no profile — send to setup
          navigate("/setup-profile");
          return;
        }

        if (!response.ok) {
          // Backend error or network issue — don't redirect, just stop the spinner
          console.error("Error checking profile:", response.status);
          setIsCheckingProfile(false);
          return;
        }

        const profileData = await response.json();

        if (!profileData) {
          // Empty body — treat same as 404
          navigate("/setup-profile");
        } else {
          // Profile exists — cached family data is hydrated synchronously in useState
          // (above), so the LCP element can paint before this fetch resolves.
          if (profileData.role === "parent") {
            fetchFamilyData();
            // Defer recurring-task automation past LCP — it competes for the
            // same connection pool as the family-data fetch above.
            const idle = (window as any).requestIdleCallback
              ?? ((cb: () => void) => setTimeout(cb, 2000));
            idle(() => {
              apiClient.process_recurring_tasks().catch((err) =>
                console.warn("Recurring task automation skipped:", err)
              );
            });
          }
          setProfile(profileData);
          setUserRole(profileData.role);
          setCurrencySymbol(getCurrencySymbol(profileData.currency));
          // Persist currency/role into the family cache so the next page load
          // hydrates the correct symbol on first paint.
          try {
            const raw = localStorage.getItem(`allowance-flow:family:${user.id}`);
            const existing = raw ? JSON.parse(raw) : {};
            localStorage.setItem(
              `allowance-flow:family:${user.id}`,
              JSON.stringify({
                ...existing,
                currency: profileData.currency,
                role: profileData.role,
              }),
            );
          } catch {}
          setIsCheckingProfile(false);
        }
      } catch (error) {
        // Network/fetch error — do NOT redirect to setup, just stop the spinner
        console.error("Error checking profile:", error);
        setIsCheckingProfile(false);
      }
    };

    if (isCheckingProfile) {
      checkProfile();
    }
  }, [user, navigate, isCheckingProfile]);

  // Recovery banner: real-email user stuck with child role
  // Virtual child emails end in .local — if it's a normal email the account
  // was probably a parent whose role got corrupted during a backend outage.
  // Only show recovery banner if we have a real (non-child) email address.
  // Child accounts use .local or the legacy @allowanceflow.app domain.
  const isChildEmail = (email: string) => email.endsWith(".local") || email.endsWith("@allowanceflow.app");
  const showParentRecovery = profile?.role === "child" && !!profile?.email && !isChildEmail(profile.email);

  const handleReclaimParent = async () => {
    try {
      const response = await apiClient.reclaim_parent();
      if (response.ok) {
        const updated = await response.json();
        setProfile(updated);
        setUserRole(updated.role);
        toast.success("Parent access restored — reloading your dashboard.");
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.detail || "Could not restore parent access.");
      }
    } catch (e) {
      toast.error("Request failed — please try again.");
    }
  };

  // Show pending approval message
  if (profile && profile.status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              ⏳ {t("app.waitingForApproval")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              {t("setup.pendingApprovalMessage")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("setup.askParentToApprove")}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                // Sign out and go back to sign-in
                navigate("/auth/sign-out");
              }}
              className="mt-4"
            >
              {t("nav.signOut")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleAddTask = async () => {
    if (newTask.title && newTask.value) {
      if (isRecurring && recurrenceDays.length === 0) {
        toast.error(t("form.selectDayError"));
        return;
      }

      try {
        await apiClient.create_task({
          title: newTask.title,
          description: "",
          value: parseFloat(newTask.value),
          assigned_to_user_id: newTask.assignedTo || null,
          is_recurring: isRecurring,
          recurrence_days: isRecurring ? recurrenceDays : null,
          auto_recreate: autoRecreate,
        });
        
        // Refresh family data to show new task
        await fetchFamilyData();
        
        setNewTask({ title: "", value: "", assignedTo: children[0]?.id || "" });
        setIsRecurring(false);
        setRecurrenceDays([]);
        setAutoRecreate(false);
        setShowAddTask(false);
        toast.success(t("toasts.taskCreated"));
      } catch (error) {
        console.error("Error creating task:", error);
        toast.error(t("toasts.taskCreateFailed"));
      }
    }
  };

  const toggleRecurrenceDay = (day: number) => {
    setRecurrenceDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      // Find the task to get its details before updating
      const taskToComplete = tasks.find(t => t.id === taskId);
      const isAutoRecreate = taskToComplete?.auto_recreate || false;
      
      const response = await apiClient.update_task(taskId, {
        status: 'completed'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        toast.error(errorData.detail || t("toasts.taskCompleteFailed"));
        return;
      }
      
      // Refresh data to show updated totals
      await fetchFamilyData();
      
      // Show appropriate message based on task type
      if (isAutoRecreate) {
        toast.success(t("toasts.autoRecreateTaskCompleted"));
      } else {
        toast.success(t("toasts.taskMarkedComplete"));
      }
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error(t("toasts.taskCompleteFailed"));
    }
  };

  const handleMarkPaid = async (taskId: string) => {
    try {
      await apiClient.update_task(taskId, {
        status: 'paid'
      });
      
      // Refresh data to show updated totals
      await fetchFamilyData();
      toast.success(t("toasts.taskMarkedPaid"));
    } catch (error) {
      console.error("Error marking task as paid:", error);
      toast.error(t("toasts.taskPaidFailed"));
    }
  };

  const handlePreview = (childId: string, childName: string) => {
    enterPreviewMode(childId, childName);
    setShowPreviewDialog(false);
  };

  const handleExitPreview = () => {
    exitPreviewMode();
  };

  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           window.innerWidth < 768;
  };

  const handleCopyAmount = (child: Child) => {
    if (child.pending <= 0) {
      return;
    }

    navigator.clipboard.writeText(child.pending.toString()).then(() => {
      setCopiedAmount(child.id);
      setTimeout(() => setCopiedAmount(null), 2000);
    }).catch((err) => {
      console.error('Copy failed:', err);
      toast.error(t("toasts.failedToCopyAmount"));
    });
  };

  const handleCopyPhone = (child: Child) => {
    if (!child.phone_number) {
      return;
    }

    const phoneNumber = child.phone_number.replace(/\s+/g, '').replace(/\D/g, '');
    navigator.clipboard.writeText(phoneNumber).then(() => {
      setCopiedPhone(child.id);
      setTimeout(() => setCopiedPhone(null), 2000);
    }).catch((err) => {
      console.error('Copy failed:', err);
      toast.error(t("toasts.failedToCopyPhone"));
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300";
      case "completed":
        return "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300";
      case "paid":
        return "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";
      default:
        return "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "available":
        return <Clock className="w-4 h-4" />;
      case "completed":
        return <CheckCircle className="w-4 h-4" />;
      case "paid":
        return <DollarSign className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const currentChild = children.find(c => c.id === selectedChild);
  const childTasks = tasks.filter(t => t.assigned_to_user_id === selectedChild);

  // Pre-compute filtered task lists once — avoids re-filtering on every JSX expression
  const filteredAvailableTasks = getFilteredTasks('available');
  const filteredCompletedTasks = getFilteredTasks('completed');
  const filteredPaidTasks = getFilteredTasks('paid');

  // If in preview mode, get the child being previewed
  const previewChild = isPreviewMode ? children.find(c => c.id === previewChildId) : null;
  const previewTasks = isPreviewMode ? tasks.filter(t =>
    t.assigned_to_user_id === previewChildId &&
    !(t.is_recurring && !t.parent_task_id)
  ) : [];
  const previewAvailableTasks = previewTasks.filter(t => t.status === 'available');
  const previewCompletedTasks = previewTasks.filter(t => t.status === 'completed');
  const previewPaidTasks = previewTasks.filter(t => t.status === 'paid');

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800">
      <PageHeader 
        title={isPreviewMode ? `${t("app.viewingAs")} ${previewChildName}` : (userRole === "child" ? t("app.childTitle") : t("app.title"))}
        userRole={userRole}
        isPreviewMode={isPreviewMode}
        onPreviewClick={() => setShowPreviewDialog(true)}
        onExitPreview={handleExitPreview}
      />
      
      <div className="max-w-7xl mx-auto p-3 md:p-6">
        <main className="w-full py-4 md:py-8">
          {isPreviewMode && previewChild ? (
            // Child Dashboard View (Preview Mode)
            <div className="space-y-6">
              {/* Child's Allowance Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl">{previewChildName}'s {t("app.myAllowance")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">{t("app.totalEarned")}</p>
                      <p className="text-3xl font-bold text-orange-600 dark:text-orange-500">
                        {currencySymbol}{previewChild.earned.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">{t("balance.paid")}</p>
                      <p className="text-3xl font-bold text-green-600 dark:text-green-500">
                        {currencySymbol}{previewChild.paid.toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-2">{t("balance.pending")}</p>
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">
                        {currencySymbol}{previewChild.pending.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Child's Tasks */}
              <Card>
                <CardHeader>
                  <CardTitle>{t("app.myTasks")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Mobile: Dropdown */}
                  <div className="md:hidden mb-4">
                    <Select value={previewActiveTab} onValueChange={setPreviewActiveTab}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">
                          {t("app.available")} ({previewAvailableTasks.length})
                        </SelectItem>
                        <SelectItem value="completed">
                          {t("taskStatus.completed")} ({previewCompletedTasks.length})
                        </SelectItem>
                        <SelectItem value="paid">
                          {t("taskStatus.paid")} ({previewPaidTasks.length})
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Desktop: Tabs */}
                  <Tabs value={previewActiveTab} onValueChange={setPreviewActiveTab} className="w-full hidden md:block">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="available">{t("app.available")} ({previewAvailableTasks.length})</TabsTrigger>
                      <TabsTrigger value="completed">{t("taskStatus.completed")} ({previewCompletedTasks.length})</TabsTrigger>
                      <TabsTrigger value="paid">{t("taskStatus.paid")} ({previewPaidTasks.length})</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* Task Lists */}
                  <div className="mt-4">
                    {previewActiveTab === "available" && (
                      <div className="space-y-3">
                        {previewAvailableTasks.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">{t("app.noAvailableTasks")}</p>
                        ) : (
                          previewAvailableTasks.map((task) => (
                            <Card key={task.id} className="border-l-4 border-l-blue-400">
                              <CardContent className="p-4">
                                {/* Task Title */}
                                <div className="flex items-center gap-2 mb-1">
                                  {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                                  <h3 className="font-semibold text-base flex-1">{task.title}</h3>
                                </div>
                                {task.description && (
                                  <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                )}

                                {/* Value and Assignment */}
                                <div className="flex items-center justify-between mb-3">
                                  <span className="font-bold text-xl text-orange-600">
                                    {currencySymbol}{task.value}
                                  </span>
                                  {taskViewTab === "all" && task.assigned_to_name && (
                                    <p className="text-sm text-muted-foreground">
                                      {task.assigned_to_name}
                                    </p>
                                  )}
                                </div>
                                
                                {/* Mark Complete Button - only for non-template tasks */}
                                {!(task.is_recurring && !task.parent_task_id) && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleCompleteTask(task.id)}
                                    className="bg-green-600 hover:bg-green-700 w-full"
                                  >
                                    {t("app.markComplete")}
                                  </Button>
                                )}
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    )}

                    {previewActiveTab === "completed" && (
                      <div className="space-y-3">
                        {previewCompletedTasks.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">{t("app.noCompletedTasks")}</p>
                        ) : (
                          previewCompletedTasks.map((task) => (
                            <Card key={task.id} className="border-l-4 border-l-green-400">
                              <CardContent className="p-4">
                                {/* Task Title */}
                                <div className="flex items-center gap-2 mb-1">
                                  {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                                  <h3 className="font-semibold text-base flex-1">{task.title}</h3>
                                </div>
                                {task.description && (
                                  <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                )}

                                {/* Value and Assignment */}
                                <div className="flex items-center justify-between mb-3">
                                  <span className="font-bold text-xl text-orange-600">
                                    {currencySymbol}{task.value}
                                  </span>
                                  {task.assigned_to_name && (
                                    <p className="text-sm text-muted-foreground">
                                      {task.assigned_to_name}
                                    </p>
                                  )}
                                </div>
                                
                                {/* Completed Date */}
                                {task.completedDate && (
                                  <p className="text-xs text-muted-foreground mb-3">
                                    {t("app.completedOn")} {task.completedDate}
                                  </p>
                                )}
                                
                                {/* Action Button */}
                                <Button
                                  onClick={() => handleMarkPaid(task.id)}
                                  className="w-full bg-green-600 hover:bg-green-700"
                                >
                                  {t("app.markPaid")}
                                </Button>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    )}

                    {previewActiveTab === "paid" && (
                      <div className="space-y-3">
                        {previewPaidTasks.length === 0 ? (
                          <p className="text-muted-foreground text-center py-8">{t("app.noPaidTasks")}</p>
                        ) : (
                          previewPaidTasks.map((task) => (
                            <Card key={task.id} className="border-l-4 border-l-gray-400">
                              <CardContent className="p-4">
                                {/* Task Title */}
                                <div className="flex items-center gap-2 mb-1">
                                  {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                                  <h3 className="font-semibold text-base flex-1">{task.title}</h3>
                                </div>
                                {task.description && (
                                  <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                                )}

                                {/* Value and Assignment */}
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-bold text-xl text-orange-600">
                                    {currencySymbol}{task.value}
                                  </span>
                                  {task.assigned_to_name && (
                                    <p className="text-sm text-muted-foreground">
                                      {task.assigned_to_name}
                                    </p>
                                  )}
                                </div>
                                
                                {/* Completed Date */}
                                {task.completedDate && (
                                  <p className="text-xs text-muted-foreground">
                                    {t("app.completedOn")} {task.completedDate}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : userRole === "parent" ? (
            <div className="space-y-6">
              {/* Children Balance Cards */}
              <div>
                <h2 className="text-2xl font-semibold text-foreground mb-4">{t("app.childrenAllowances")}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {((isCheckingProfile || isLoadingData) && children.length === 0) ? (
                    [0, 1].map(i => (
                      <div key={i} className="bg-card border border-border rounded-xl p-6 animate-pulse">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-muted rounded-full" />
                          <div className="h-5 bg-muted rounded w-28" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[0, 1, 2].map(j => (
                            <div key={j} className="space-y-1">
                              <div className="h-3 bg-muted rounded w-14" />
                              <div className="h-7 bg-muted rounded w-16" />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : children.map(child => (
                    <div key={child.id} className="bg-card border border-border rounded-xl p-6 group">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-foreground">{child.name}</h3>
                          {child.phone_number && (
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-muted-foreground">
                                {child.phone_number.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')}
                              </p>
                              <button
                                onClick={() => setQrChild(child)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={t("toasts.showVippsQr")}
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCopyPhone(child)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={t("toasts.copyVippsNumber")}
                              >
                                {copiedPhone === child.id ? (
                                  <Check className="w-3 h-3 text-green-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("app.totalEarned")}</p>
                          <p className="text-lg md:text-2xl font-bold text-foreground">{currencySymbol}{child.earned}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("balance.paid")}</p>
                          <p className="text-lg md:text-2xl font-bold text-green-600 dark:text-green-500">{currencySymbol}{child.paid}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("balance.pending")}</p>
                          <div className="flex items-center gap-1">
                            <p className="text-lg md:text-2xl font-bold text-orange-600 dark:text-orange-500">{currencySymbol}{child.pending}</p>
                            {child.pending > 0 && (
                              <button
                                onClick={() => handleCopyAmount(child)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={t("toasts.amountCopied")}
                              >
                                {copiedAmount === child.id ? (
                                  <Check className="w-4 h-4 text-green-600" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Task Management */}
              <div>
                {/* Tab selector for All Tasks vs Recurring Templates */}
                <Tabs value={taskViewTab} onValueChange={(value) => setTaskViewTab(value as "all" | "recurring")} className="mb-4">
                  <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="all">{t("app.allTasksTab")}</TabsTrigger>
                    <TabsTrigger value="recurring">{t("app.recurringTemplatesTab")}</TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {taskViewTab === "all" ? t("app.allTasks") : t("app.recurringTemplatesTab")}
                  </h2>
                  <button
                    onClick={() => setShowAddTask(!showAddTask)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t("app.addTask")}
                  </button>
                </div>

                {showAddTask && (
                  <div className="bg-card border border-border rounded-xl p-6 mb-4">
                    <h3 className="text-lg font-semibold text-foreground mb-4">{t("app.createNewTask")}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <input
                        type="text"
                        placeholder={t("form.taskNamePlaceholder")}
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        className="px-4 py-2 bg-background border border-input rounded-lg text-foreground"
                      />
                      <input
                        type="number"
                        placeholder={`${t("form.valuePlaceholder")} (${currencySymbol})`}
                        value={newTask.value}
                        onChange={(e) => setNewTask({ ...newTask, value: e.target.value })}
                        className="px-4 py-2 bg-background border border-input rounded-lg text-foreground"
                      />
                      <select
                        value={newTask.assignedTo}
                        onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
                        className="px-4 py-2 bg-background border border-input rounded-lg text-foreground"
                      >
                        <option value="">{t("form.unassigned")}</option>
                        {children.map(child => (
                          <option key={child.id} value={child.id}>{child.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="mb-4 space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="is-recurring"
                          checked={isRecurring}
                          onCheckedChange={(checked) => setIsRecurring(checked as boolean)}
                        />
                        <Label htmlFor="is-recurring" className="cursor-pointer flex items-center gap-2 text-foreground">
                          <Repeat className="h-4 w-4" />
                          {t("form.recurringTask")}
                        </Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="auto-recreate"
                          checked={autoRecreate}
                          onCheckedChange={(checked) => setAutoRecreate(checked as boolean)}
                        />
                        <Label htmlFor="auto-recreate" className="cursor-pointer flex items-center gap-2 text-foreground">
                          {t("form.autoRecreate")}
                        </Label>
                      </div>

                      {isRecurring && (
                        <div className="ml-6 space-y-2">
                          <Label className="text-sm text-muted-foreground">{t("form.repeatOn")}</Label>
                          <div className="grid grid-cols-7 gap-1">
                            {WEEKDAYS.map((day) => (
                              <Button
                                key={day.value}
                                type="button"
                                variant={recurrenceDays.includes(day.value) ? "default" : "outline"}
                                size="sm"
                                onClick={() => toggleRecurrenceDay(day.value)}
                                className="px-0 text-xs"
                              >
                                {day.label}
                              </Button>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("form.taskAvailableOnDays")}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={handleAddTask}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                      >
                        {t("form.createTask")}
                      </button>
                      <button
                        onClick={() => {
                          setShowAddTask(false);
                          setIsRecurring(false);
                          setRecurrenceDays([]);
                        }}
                        className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  {/* Mobile: Dropdown */}
                  <div className="md:hidden mb-4">
                    <Select value={activeTab} onValueChange={setActiveTab}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">
                          {t("app.available")} ({filteredAvailableTasks.length})
                        </SelectItem>
                        <SelectItem value="completed">
                          {t("taskStatus.completed")} ({filteredCompletedTasks.length})
                        </SelectItem>
                        <SelectItem value="paid">
                          {t("taskStatus.paid")} ({filteredPaidTasks.length})
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Desktop: Tabs */}
                  <TabsList className="hidden md:grid w-full grid-cols-3">
                    <TabsTrigger value="available">{t("app.available")} ({filteredAvailableTasks.length})</TabsTrigger>
                    <TabsTrigger value="completed">{t("taskStatus.completed")} ({filteredCompletedTasks.length})</TabsTrigger>
                    <TabsTrigger value="paid">{t("taskStatus.paid")} ({filteredPaidTasks.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="available" className="mt-4">
                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.task")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.assignedTo")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.value")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.action")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredAvailableTasks.map(task => (
                            <tr key={task.id} className="hover:bg-muted/30">
                              <td className="px-6 py-4">
                                <div className="flex items-start gap-2">
                                  {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />}
                                  <div>
                                    <span className="text-foreground">{task.title}</span>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-foreground">
                                {task.assigned_to_name || t("form.unassigned")}
                              </td>
                              <td className="px-6 py-4 text-foreground font-semibold">{currencySymbol}{task.value}</td>
                              <td className="px-6 py-4">
                                {/* Only show button for non-template tasks */}
                                {!(task.is_recurring && !task.parent_task_id) && (
                                  <button
                                    onClick={() => handleCompleteTask(task.id)}
                                    className="px-3 py-1 bg-green-600 dark:bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-700 dark:hover:bg-green-800 transition-colors"
                                  >
                                    {t("app.markComplete")}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                      {getFilteredTasks('available').map((task) => (
                        <Card key={task.id} className="border-l-4 border-l-blue-400">
                          <CardContent className="p-4">
                            {/* Task Title */}
                            <div className="flex items-center gap-2 mb-1">
                              {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                              <h3 className="font-semibold text-base flex-1">{task.title}</h3>
                            </div>

                            {/* Description toggle */}
                            {task.description && (
                              <div className="mb-2">
                                <button
                                  className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2"
                                  onClick={() => toggleDescription(task.id)}
                                >
                                  {expandedDescriptions.has(task.id) ? t("tasks.hideDescription") : t("tasks.showDescription")}
                                </button>
                                {expandedDescriptions.has(task.id) && (
                                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                                )}
                              </div>
                            )}

                            {/* Value and Assignment */}
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-bold text-xl text-orange-600">
                                {currencySymbol}{task.value}
                              </span>
                              {taskViewTab === "all" && task.assigned_to_name && (
                                <p className="text-sm text-muted-foreground">
                                  {task.assigned_to_name}
                                </p>
                              )}
                            </div>

                            {/* Mark Complete Button - only for non-template tasks */}
                            {!(task.is_recurring && !task.parent_task_id) && (
                              <Button
                                size="sm"
                                onClick={() => handleCompleteTask(task.id)}
                                className="bg-green-600 hover:bg-green-700 w-full"
                              >
                                {t("app.markComplete")}
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="completed" className="mt-4">
                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.task")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.assignedTo")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.value")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.completed")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.action")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredCompletedTasks.map(task => (
                            <tr key={task.id} className="hover:bg-muted/30">
                              <td className="px-6 py-4">
                                <div className="flex items-start gap-2">
                                  {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />}
                                  <div>
                                    <span className="text-foreground">{task.title}</span>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-foreground">
                                {task.assigned_to_name || t("form.unassigned")}
                              </td>
                              <td className="px-6 py-4 text-foreground font-semibold">{currencySymbol}{task.value}</td>
                              <td className="px-6 py-4 text-foreground text-sm">{task.completedDate}</td>
                              <td className="px-6 py-4">
                                <button
                                  onClick={() => handleMarkPaid(task.id)}
                                  className="px-3 py-1 bg-green-600 dark:bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-700 dark:hover:bg-green-800 transition-colors"
                                >
                                  {t("app.markPaid")}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                      {getFilteredTasks('completed').map((task) => (
                        <Card key={task.id} className="border-l-4 border-l-green-400">
                          <CardContent className="p-4">
                            {/* Task Title */}
                            <div className="flex items-center gap-2 mb-1">
                              {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                              <h3 className="font-semibold text-base flex-1">{task.title}</h3>
                            </div>

                            {/* Description toggle */}
                            {task.description && (
                              <div className="mb-2">
                                <button
                                  className="text-xs text-green-600 dark:text-green-400 underline underline-offset-2"
                                  onClick={() => toggleDescription(task.id)}
                                >
                                  {expandedDescriptions.has(task.id) ? t("tasks.hideDescription") : t("tasks.showDescription")}
                                </button>
                                {expandedDescriptions.has(task.id) && (
                                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                                )}
                              </div>
                            )}

                            {/* Value and Assignment */}
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-bold text-xl text-orange-600">
                                {currencySymbol}{task.value}
                              </span>
                              {task.assigned_to_name && (
                                <p className="text-sm text-muted-foreground">
                                  {task.assigned_to_name}
                                </p>
                              )}
                            </div>

                            {/* Completed Date */}
                            {task.completedDate && (
                              <p className="text-xs text-muted-foreground mb-3">
                                {t("app.completedOn")} {task.completedDate}
                              </p>
                            )}

                            {/* Action Button */}
                            <Button
                              onClick={() => handleMarkPaid(task.id)}
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              {t("app.markPaid")}
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="paid" className="mt-4">
                    {/* Desktop Table View */}
                    <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.task")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.assignedTo")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.value")}</th>
                            <th className="px-6 py-3 text-left text-sm font-semibold text-foreground">{t("table.completed")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {filteredPaidTasks.map(task => (
                            <tr key={task.id} className="hover:bg-muted/30">
                              <td className="px-6 py-4">
                                <div className="flex items-start gap-2">
                                  {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />}
                                  <div>
                                    <span className="text-foreground">{task.title}</span>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-foreground">
                                {task.assigned_to_name || t("form.unassigned")}
                              </td>
                              <td className="px-6 py-4 text-foreground font-semibold">{currencySymbol}{task.value}</td>
                              <td className="px-6 py-4 text-foreground text-sm">{task.completedDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
                      {getFilteredTasks('paid').map((task) => (
                        <Card key={task.id} className="border-l-4 border-l-gray-400">
                          <CardContent className="p-4">
                            {/* Task Title */}
                            <div className="flex items-center gap-2 mb-1">
                              {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                              <h3 className="font-semibold text-base flex-1">{task.title}</h3>
                            </div>

                            {/* Description toggle */}
                            {task.description && (
                              <div className="mb-2">
                                <button
                                  className="text-xs text-gray-500 dark:text-gray-400 underline underline-offset-2"
                                  onClick={() => toggleDescription(task.id)}
                                >
                                  {expandedDescriptions.has(task.id) ? t("tasks.hideDescription") : t("tasks.showDescription")}
                                </button>
                                {expandedDescriptions.has(task.id) && (
                                  <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                                )}
                              </div>
                            )}

                            {/* Value and Assignment */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-xl text-orange-600">
                                {currencySymbol}{task.value}
                              </span>
                              {task.assigned_to_name && (
                                <p className="text-sm text-muted-foreground">
                                  {task.assigned_to_name}
                                </p>
                              )}
                            </div>

                            {/* Completed Date */}
                            {task.completedDate && (
                              <p className="text-xs text-muted-foreground">
                                {t("app.completedOn")} {task.completedDate}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          ) : userRole === "child" ? (
            // Child Dashboard View (Real Child Login)
            <div className="space-y-4">
              {showParentRecovery && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">⚠️ {t("recovery.wrongRoleTitle") || "Account role looks wrong"}</p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      {t("recovery.wrongRoleDescription") || "Your account has a real email address but is marked as a child. If you are the parent, tap the button to restore your access."}
                    </p>
                  </div>
                  <Button
                    onClick={handleReclaimParent}
                    className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  >
                    {t("recovery.restoreParentAccess") || "Restore parent access"}
                  </Button>
                </div>
              )}
              <ChildDashboard
                userId={user?.id || ''}
                currencySymbol={currencySymbol}
              />
            </div>
          ) : (
            <p>Loading...</p>
          )}
        </main>
      </div>

      {/* Preview Mode Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("app.previewAsChild")}</DialogTitle>
            <DialogDescription>
              {t("app.selectChildToPreview")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {children.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                {t("app.noChildrenYet")}
              </p>
            ) : (
              children.map((child) => (
                <Button
                  key={child.id}
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={() => handlePreview(child.id, child.name)}
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold">{child.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("app.pendingText")} {currencySymbol}{child.pending.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </Button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {qrChild && (
        <Suspense fallback={null}>
          <VippsQrDialog
            child={qrChild}
            copied={copiedQrPhone}
            onCopiedChange={setCopiedQrPhone}
            onClose={() => { setQrChild(null); setCopiedQrPhone(false); }}
          />
        </Suspense>
      )}
    </div>
  );
}
