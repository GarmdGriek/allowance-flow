import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CheckCircle, Clock, DollarSign } from "lucide-react";
import { apiClient } from "app";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

interface Props {
  userId: string;
  currencySymbol: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  value: number;
  status: string;
  completed_at?: string;
  auto_recreate?: boolean;
}

interface Parent {
  user_id: string;
  name: string;
}

interface ChildData {
  total_earned: number;
  total_paid: number;
  pending_amount: number;
}

export function ChildDashboard({ userId, currencySymbol }: Props) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [childData, setChildData] = useState<ChildData>({ total_earned: 0, total_paid: 0, pending_amount: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("available");

  useEffect(() => {
    fetchChildData();
  }, [userId]);

  const fetchChildData = async () => {
    setIsLoading(true);
    try {
      // Fetch tasks
      const tasksResponse = await apiClient.list_tasks();
      const allTasks = await tasksResponse.json();
      
      // Filter tasks assigned to this child
      const myTasks = allTasks
        .filter((t: any) => t.assigned_to_user_id === userId)
        .map((t: any) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          value: parseFloat(t.value),
          status: t.status,
          completed_at: t.completed_at
        }));
      
      setTasks(myTasks);

      // Calculate totals
      const earned = myTasks
        .filter((t: Task) => ['completed', 'paid', 'archived'].includes(t.status))
        .reduce((sum: number, t: Task) => sum + t.value, 0);
      
      const paid = myTasks
        .filter((t: Task) => t.status === 'paid')
        .reduce((sum: number, t: Task) => sum + t.value, 0);
      
      const pending = myTasks
        .filter((t: Task) => t.status === 'completed')
        .reduce((sum: number, t: Task) => sum + t.value, 0);

      setChildData({
        total_earned: earned,
        total_paid: paid,
        pending_amount: pending
      });
    } catch (error) {
      console.error("Error fetching child data:", error);
      toast.error(t("child.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteTask = async (task: Task) => {
    try {
      await apiClient.update_task(task.id, {
        status: 'completed'
      });
      
      toast.success(t("child.taskCompletedWaiting"));
      fetchChildData();
    } catch (error) {
      console.error("Error completing task:", error);
      toast.error(t("toasts.taskCompleteFailed"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-primary" />
      </div>
    );
  }

  const availableTasks = tasks.filter(t => t.status === 'available');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const paidTasks = tasks.filter(t => t.status === 'paid');

  return (
    <div className="space-y-6">
      {/* Child's Allowance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{t("app.myAllowance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">{t("app.totalEarned")}</p>
              <p className="text-3xl font-bold text-orange-600 dark:text-orange-500">
                {currencySymbol}{childData.total_earned.toFixed(2)}
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">{t("balance.paid")}</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-500">
                {currencySymbol}{childData.total_paid.toFixed(2)}
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">{t("balance.pending")}</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-500">
                {currencySymbol}{childData.pending_amount.toFixed(2)}
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
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">
                  {t("app.available")} ({availableTasks.length})
                </SelectItem>
                <SelectItem value="completed">
                  {t("taskStatus.completed")} ({completedTasks.length})
                </SelectItem>
                <SelectItem value="paid">
                  {t("taskStatus.paid")} ({paidTasks.length})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full hidden md:block">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="available">
                {t("app.available")} ({availableTasks.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                {t("taskStatus.completed")} ({completedTasks.length})
              </TabsTrigger>
              <TabsTrigger value="paid">
                {t("taskStatus.paid")} ({paidTasks.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Task Lists */}
          <div className="mt-4">
            {activeTab === "available" && (
              <div className="space-y-3">
                {availableTasks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("child.noAvailableTasks")}</p>
                ) : (
                  availableTasks.map((task) => (
                    <div key={task.id} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex justify-between items-center">
                      <div>
                        <h4 className="font-semibold text-foreground">{task.title}</h4>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                        <p className="text-sm text-orange-600 dark:text-orange-500 font-medium mt-1">
                          {currencySymbol}{task.value.toFixed(2)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleCompleteTask(task)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {t("child.markComplete")}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "completed" && (
              <div className="space-y-3">
                {completedTasks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("child.noCompletedTasks")}</p>
                ) : (
                  completedTasks.map((task) => (
                    <div key={task.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-foreground">{task.title}</h4>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                          )}
                          <p className="text-sm text-orange-600 dark:text-orange-500 font-medium mt-1">
                            {currencySymbol}{task.value.toFixed(2)}
                          </p>
                        </div>
                        <Clock className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t("child.waitingForApproval")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "paid" && (
              <div className="space-y-3">
                {paidTasks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">{t("child.noPaidTasks")}</p>
                ) : (
                  paidTasks.map((task) => (
                    <div key={task.id} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-foreground">{task.title}</h4>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                          )}
                          <p className="text-sm text-green-600 dark:text-green-500 font-medium mt-1">
                            {currencySymbol}{task.value.toFixed(2)}
                          </p>
                        </div>
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-500" />
                      </div>
                      {task.completed_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {t("child.completedOn")} {new Date(task.completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
