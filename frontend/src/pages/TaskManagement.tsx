import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Edit, Repeat, Archive } from "lucide-react";
import { toast } from "sonner";
import { getCurrencySymbol } from "utils/currencies";
import { useTranslation } from "react-i18next";
import { PageHeader } from "components/PageHeader";

interface Task {
  id: string;
  title: string;
  description: string | null;
  value: string;
  status: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  is_recurring: boolean;
  recurrence_days: number[] | null;
  auto_recreate: boolean;
  parent_task_id: string | null;
}

interface Child {
  user_id: string;
  name: string;
}

export default function TaskManagement() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [taskViewTab, setTaskViewTab] = useState<"all" | "recurring">("all");
  
  // Edit dialog state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({ 
    title: "", 
    value: "", 
    assigned_to_user_id: "",
    is_recurring: false,
    recurrence_days: [] as number[]
  });
  
  // Delete dialog state
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);

  const WEEKDAYS = [
    { value: 0, label: t("weekdays.sun") },
    { value: 1, label: t("weekdays.mon") },
    { value: 2, label: t("weekdays.tue") },
    { value: 3, label: t("weekdays.wed") },
    { value: 4, label: t("weekdays.thu") },
    { value: 5, label: t("weekdays.fri") },
    { value: 6, label: t("weekdays.sat") },
  ];

  // Helper function to filter tasks based on view tab
  const getFilteredTasks = () => {
    if (taskViewTab === "recurring") {
      // Show only recurring templates (is_recurring && !parent_task_id)
      return tasks.filter(t => t.is_recurring && !t.parent_task_id);
    }
    
    // Show all tasks except recurring templates
    return tasks.filter(t => !(t.is_recurring && !t.parent_task_id));
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [tasksResponse, childrenResponse, profileResponse] = await Promise.all([
        apiClient.list_tasks(),
        apiClient.list_children(),
        apiClient.get_my_profile(),
      ]);

      const tasksData = await tasksResponse.json();
      setTasks(tasksData);

      const childrenData = await childrenResponse.json();
      setChildren(childrenData);
      
      const profileData = await profileResponse.json();
      setCurrencySymbol(getCurrencySymbol(profileData.currency));
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(t("taskManagement.failedToLoadTasks"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleEditClick = (task: Task) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      value: task.value,
      assigned_to_user_id: task.assigned_to_user_id || "",
      is_recurring: task.is_recurring,
      recurrence_days: task.recurrence_days || []
    });
  };

  const handleEditSave = async () => {
    if (!editingTask) return;

    try {
      await apiClient.update_task(
        { taskId: editingTask.id },
        {
          description: editForm.description,
          value: parseFloat(editForm.value),
          assigned_to_user_id: editForm.assigned_to_user_id || null,
          is_recurring: editForm.is_recurring,
          recurrence_days: editForm.is_recurring ? editForm.recurrence_days : null,
        }
      );

      toast.success(t("taskManagement.taskUpdatedSuccess"));
      setEditingTask(null);
      fetchData();
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error(t("taskManagement.taskUpdateFailed"));
    }
  };

  const handleDeleteClick = (task: Task) => {
    setDeletingTask(task);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTask) return;

    try {
      await apiClient.delete_task(deletingTask.id);
      toast.success(t("taskManagement.taskDeletedSuccess"));
      setDeletingTask(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error(t("taskManagement.taskDeleteFailed"));
    }
  };

  const toggleRecurrenceDay = (day: number) => {
    setEditForm(prev => ({
      ...prev,
      recurrence_days: prev.recurrence_days.includes(day)
        ? prev.recurrence_days.filter(d => d !== day)
        : [...prev.recurrence_days, day].sort()
    }));
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      available: "outline",
      pending_approval: "secondary",
      completed: "default",
      paid: "default",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const formatRecurrenceDays = (days: number[] | null) => {
    if (!days || days.length === 0) return "-";
    return days.map(d => WEEKDAYS.find(w => w.value === d)?.label).join(", ");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50 p-6">
        <div className="max-w-6xl mx-auto">
          <p>{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800">
      <PageHeader title={t("app.taskManagement") || "Task Management"} userRole="parent" />
      
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Tasks Table */}
        <Card>
          <CardHeader className="space-y-4">
            {/* Tab selector for All Tasks vs Recurring Templates */}
            <Tabs value={taskViewTab} onValueChange={(value) => setTaskViewTab(value as "all" | "recurring")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="all" className="text-xs md:text-sm">
                  {t("taskManagement.allTasksTab")} ({getFilteredTasks().length})
                </TabsTrigger>
                <TabsTrigger value="recurring" className="text-xs md:text-sm">
                  {t("taskManagement.recurringTemplatesTab")} ({tasks.filter(t => t.is_recurring && !t.parent_task_id).length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <CardTitle className="text-lg md:text-xl">
              {taskViewTab === "all" ? t("taskManagement.allTasks") : t("taskManagement.recurringTemplatesTab")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getFilteredTasks().length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t("taskManagement.noTasksFound")}</p>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("taskManagement.taskColumn")}</TableHead>
                        <TableHead>{t("taskManagement.valueColumn")}</TableHead>
                        <TableHead>{t("taskManagement.assignedToColumn")}</TableHead>
                        <TableHead>{t("taskManagement.statusColumn")}</TableHead>
                        <TableHead>{t("taskManagement.recurringColumn")}</TableHead>
                        <TableHead className="text-right">{t("taskManagement.actionsColumn")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredTasks().map((task) => (
                        <TableRow key={task.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600" />}
                              {task.title}
                            </div>
                          </TableCell>
                          <TableCell>{currencySymbol}{task.value}</TableCell>
                          <TableCell>{task.assigned_to_name || t("taskManagement.unassigned")}</TableCell>
                          <TableCell>{getStatusBadge(task.status)}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {task.is_recurring ? formatRecurrenceDays(task.recurrence_days) : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditClick(task)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteClick(task)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {getFilteredTasks().map((task) => (
                    <Card key={task.id} className="border-l-4 border-l-orange-400">
                      <CardContent className="p-4">
                        {/* Task Title */}
                        <div className="flex items-center gap-2 mb-2">
                          {task.is_recurring && <Repeat className="h-4 w-4 text-purple-600 flex-shrink-0" />}
                          <h3 className="font-semibold text-base flex-1">{task.title}</h3>
                          {taskViewTab === "all" && getStatusBadge(task.status)}
                        </div>
                        
                        {/* Recurrence Days */}
                        {task.is_recurring && (
                          <div className="mb-3 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-md">
                            <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                              {t("taskManagement.repeats")}: {task.recurrence_days && task.recurrence_days.length > 0 ? formatRecurrenceDays(task.recurrence_days) : "-"}
                            </p>
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
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(task)}
                            className="flex-1"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteClick(task)}
                            className="text-red-600 hover:text-red-700 flex-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("taskManagement.editTask")}</DialogTitle>
              <DialogDescription>
                {t("taskManagement.editTaskDescription")}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title">{t("taskManagement.taskNameCannotChange")}</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  disabled
                  className="bg-gray-100 cursor-not-allowed"
                />
              </div>
              
              <div>
                <Label htmlFor="edit-description">{t("taskManagement.description")}</Label>
                <Textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder={t("taskManagement.descriptionPlaceholder")}
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="edit-value">{t("taskManagement.value")} ({currencySymbol})</Label>
                <Input
                  id="edit-value"
                  type="number"
                  step="0.01"
                  value={editForm.value}
                  onChange={(e) => setEditForm({ ...editForm, value: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="edit-assigned">{t("taskManagement.assignTo")}</Label>
                <Select
                  value={editForm.assigned_to_user_id}
                  onValueChange={(value) => setEditForm({ ...editForm, assigned_to_user_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("taskManagement.selectChild")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t("taskManagement.unassigned")}</SelectItem>
                    {children.map((child) => (
                      <SelectItem key={child.user_id} value={child.user_id}>
                        {child.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-recurring"
                    checked={editForm.is_recurring}
                    onCheckedChange={(checked) => 
                      setEditForm({ ...editForm, is_recurring: checked as boolean })
                    }
                  />
                  <Label htmlFor="edit-recurring" className="cursor-pointer">
                    {t("taskManagement.recurringTask")}
                  </Label>
                </div>

                {editForm.is_recurring && (
                  <div>
                    <Label className="text-sm text-gray-600 mb-2 block">{t("taskManagement.repeatOn")}</Label>
                    <div className="flex gap-2 flex-wrap">
                      {WEEKDAYS.map((day) => (
                        <Button
                          key={day.value}
                          type="button"
                          variant={editForm.recurrence_days.includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleRecurrenceDay(day.value)}
                          className="w-12"
                        >
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingTask(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleEditSave}>{t("taskManagement.saveChanges")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletingTask} onOpenChange={(open) => !open && setDeletingTask(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("taskManagement.deleteTask")}</DialogTitle>
              <DialogDescription>
                {t("taskManagement.deleteTaskConfirmation", { title: deletingTask?.title })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeletingTask(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                {t("common.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
