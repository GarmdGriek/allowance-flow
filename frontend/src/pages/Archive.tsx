import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiClient } from "app";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Calendar, CheckCircle, DollarSign } from "lucide-react";
import { startOfWeek, endOfWeek, format, getWeek, getYear, parseISO, isAfter, subDays } from "date-fns";
import { nb, enUS } from "date-fns/locale";
import { toast } from "sonner";
import { getCurrencySymbol } from "utils/currencies";
import { PageHeader } from "components/PageHeader";

interface Task {
  id: string;
  title: string;
  description?: string;
  value: number;
  status: string;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  completed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

interface Child {
  user_id: string;
  name: string;
}

interface WeekData {
  weekNumber: number;
  year: number;
  weekStart: Date;
  weekEnd: Date;
  tasks: Task[];
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  tasksCompleted: number;
}

export default function Archive() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [currency, setCurrency] = useState("kr");
  const [userRole, setUserRole] = useState<"parent" | "child">("parent");

  const dateLocale = i18n.language === "nb" ? nb : enUS;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch profile first so userRole is set before any other call can throw
      const profileResponse = await apiClient.get_my_profile();
      const profile = await profileResponse.json();
      setCurrency(profile.currency || "kr");
      setUserRole(profile.role || "parent");

      // Fetch all tasks
      const tasksResponse = await apiClient.list_tasks();
      const allTasks: Task[] = await tasksResponse.json();

      // Filter tasks older than 7 days
      const sevenDaysAgo = subDays(new Date(), 7);
      const archivedTasks = allTasks.filter(task => {
        // Check if task has been completed or paid more than 7 days ago
        const completedDate = task.completed_at ? parseISO(task.completed_at) : null;
        const paidDate = task.paid_at ? parseISO(task.paid_at) : null;

        const relevantDate = paidDate || completedDate;
        return relevantDate && !isAfter(relevantDate, sevenDaysAgo);
      });

      setTasks(archivedTasks);

      // Fetch children (parents only — silently ignore failures for child accounts)
      if (profile.role === "parent") {
        try {
          const childrenResponse = await apiClient.list_children();
          const childrenData: Child[] = await childrenResponse.json();
          setChildren(childrenData);
        } catch {
          // not critical
        }
      }
    } catch (error) {
      console.error("Error fetching archive data:", error);
      toast.error(t("errors.generic"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPaid = async (taskId: string) => {
    try {
      await apiClient.update_task(taskId, { status: 'paid' });
      
      toast.success(t("toasts.taskMarkedPaid"));
      // Refresh data to show updated task
      await fetchData();
    } catch (error) {
      console.error("Error marking task as paid:", error);
      toast.error(t("toasts.taskPaidFailed"));
    }
  };

  // Group tasks by week
  const groupTasksByWeek = (): WeekData[] => {
    const filteredTasks = selectedChild === "all" 
      ? tasks 
      : tasks.filter(t => t.assigned_to_user_id === selectedChild);

    // Group by week
    const weekMap = new Map<string, Task[]>();
    
    filteredTasks.forEach(task => {
      const taskDate = task.paid_at ? parseISO(task.paid_at) : task.completed_at ? parseISO(task.completed_at) : parseISO(task.created_at);
      const weekStart = startOfWeek(taskDate, { weekStartsOn: 1 }); // Monday
      const weekKey = `${getYear(taskDate)}-W${getWeek(taskDate, { weekStartsOn: 1 })}`;
      
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, []);
      }
      weekMap.get(weekKey)!.push(task);
    });

    // Convert to array and calculate totals
    const weeks: WeekData[] = Array.from(weekMap.entries()).map(([weekKey, weekTasks]) => {
      const firstTask = weekTasks[0];
      const taskDate = firstTask.paid_at ? parseISO(firstTask.paid_at) : firstTask.completed_at ? parseISO(firstTask.completed_at) : parseISO(firstTask.created_at);
      const weekStart = startOfWeek(taskDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(taskDate, { weekStartsOn: 1 });
      
      const totalEarned = weekTasks
        .filter(t => ['completed', 'paid', 'archived'].includes(t.status))
        .reduce((sum, t) => sum + parseFloat(String(t.value)), 0);
      
      const totalPaid = weekTasks
        .filter(t => t.status === 'paid')
        .reduce((sum, t) => sum + parseFloat(String(t.value)), 0);
      
      const totalPending = weekTasks
        .filter(t => t.status === 'completed')
        .reduce((sum, t) => sum + parseFloat(String(t.value)), 0);

      const tasksCompleted = weekTasks.filter(t => ['completed', 'paid'].includes(t.status)).length;

      return {
        weekNumber: getWeek(taskDate, { weekStartsOn: 1 }),
        year: getYear(taskDate),
        weekStart,
        weekEnd,
        tasks: weekTasks,
        totalEarned,
        totalPaid,
        totalPending,
        tasksCompleted
      };
    });

    // Sort by date descending (newest first)
    return weeks.sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
  };

  const weekData = groupTasksByWeek();

  const currencySymbol = getCurrencySymbol(currency);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-primary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800">
      <PageHeader title={t("app.archive") || "Archive"} userRole={userRole} />
      
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">{t("app.weeklyHistory")}</p>
          {userRole === "parent" && (
            <div className="w-64">
              <Select value={selectedChild} onValueChange={setSelectedChild}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("app.allChildren")}</SelectItem>
                  {children.map(child => (
                    <SelectItem key={child.user_id} value={child.user_id}>
                      {child.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {weekData.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg text-muted-foreground">{t("app.noArchivedTasks")}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="single" collapsible className="space-y-4">
            {weekData.map((week, index) => {
              const weekLabel = `${t("app.week")} ${week.weekNumber}, ${week.year}`;
              const dateRange = `${format(week.weekStart, "d. MMM", { locale: dateLocale })} - ${format(week.weekEnd, "d. MMM yyyy", { locale: dateLocale })}`;
              
              return (
                <AccordionItem key={`${week.year}-${week.weekNumber}`} value={`week-${index}`} className="border-none">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                      <div className="flex items-center justify-between w-full pr-4">
                        <div className="text-left">
                          <h3 className="text-lg md:text-xl font-semibold text-foreground">{weekLabel}</h3>
                          <p className="text-xs md:text-sm text-muted-foreground mt-1">{dateRange}</p>
                          <p className="text-base md:text-lg font-bold text-orange-600 dark:text-orange-500 mt-2">
                            {t("app.totalEarned")}: {currencySymbol}{week.totalEarned.toFixed(2)}
                          </p>
                        </div>
                        {/* Hide detailed stats on mobile, show on md and up */}
                        <div className="hidden md:flex gap-6 text-sm">
                          <div className="text-center">
                            <p className="text-muted-foreground">{t("app.tasksCompleted")}</p>
                            <p className="font-semibold text-foreground">{week.tasksCompleted}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground">{t("balance.paid")}</p>
                            <p className="font-semibold text-green-600 dark:text-green-500">
                              {currencySymbol}{week.totalPaid.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground">{t("balance.pending")}</p>
                            <p className="font-semibold text-blue-600 dark:text-blue-500">
                              {currencySymbol}{week.totalPending.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="px-6 pb-4 space-y-3">
                        {week.tasks.map(task => {
                          const isPaid = task.status === 'paid';
                          const isCompleted = task.status === 'completed';
                          
                          return (
                            <div
                              key={task.id}
                              className={`p-4 rounded-lg border ${
                                isPaid
                                  ? "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                                  : isCompleted
                                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                                  : "bg-card border-border"
                              }`}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-foreground">{task.title}</h4>
                                  {task.description && (
                                    <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                                  )}
                                  <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                                    {task.assigned_to_name && (
                                      <span>{task.assigned_to_name}</span>
                                    )}
                                    {task.completed_at && (
                                      <span>
                                        {t("app.completedOn")} {format(parseISO(task.completed_at), "d. MMM yyyy", { locale: dateLocale })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-sm text-muted-foreground">{t("tasks.value")}</p>
                                    <p className="text-lg font-bold text-orange-600 dark:text-orange-500">
                                      {currencySymbol}{parseFloat(String(task.value)).toFixed(2)}
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {isPaid && (
                                      <div className="flex items-center gap-1 text-green-600 dark:text-green-500">
                                        <CheckCircle className="w-4 h-4" />
                                        <span className="text-sm font-medium">{t("app.paid")}</span>
                                      </div>
                                    )}
                                    {isCompleted && (
                                      <>
                                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-500">
                                          <CheckCircle className="w-4 h-4" />
                                          <span className="text-sm font-medium">{t("app.awaitingPayment")}</span>
                                        </div>
                                        <Button
                                          size="sm"
                                          onClick={() => handleMarkPaid(task.id)}
                                          className="bg-green-600 hover:bg-green-700"
                                        >
                                          {t("app.markPaid")}
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </div>
  );
}
