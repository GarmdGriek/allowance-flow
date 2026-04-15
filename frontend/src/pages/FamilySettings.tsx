import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { User } from "lucide-react";
import { useUserGuardContext } from "app/auth";
import { apiClient } from "app";
import FamilyManagement from "components/FamilyManagement";
import type { ProfileResponse } from "types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import i18n from "utils/i18n";
import { PageHeader } from "components/PageHeader";
import { Switch } from "@/components/ui/switch";

export default function FamilySettings() {
  const navigate = useNavigate();
  const { user } = useUserGuardContext();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [familyLanguage, setFamilyLanguage] = useState("en");
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({ enabled: false, day: 0, hour: 0 });
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await apiClient.get_my_profile();
        const data = await response.json();
        setProfile(data);
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Load family language
  useEffect(() => {
    const loadFamilyLanguage = async () => {
      try {
        const response = await apiClient.get_language_preferences();
        if (response.ok) {
          const data = await response.json();
          setFamilyLanguage(data.family_language);
        }
      } catch (error) {
        console.error("Error loading family language:", error);
      }
    };

    loadFamilyLanguage();
  }, []);

  const handleSaveFamilyLanguage = async () => {
    setIsSavingLanguage(true);
    try {
      const response = await apiClient.update_family_language({ language: familyLanguage });

      if (response.ok) {
        toast.success(t("family.languageUpdated"));
        // Update i18n if user doesn't have a personal preference
        i18n.changeLanguage(familyLanguage);
      } else {
        const data = await response.json();
        toast.error(data.message || t("family.failedToUpdateFamilyLanguage"));
      }
    } catch (error) {
      console.error("Error updating family language:", error);
      toast.error(t("family.failedToUpdateFamilyLanguage"));
    } finally {
      setIsSavingLanguage(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    setIsSavingNotifications(true);
    try {
      const response = await apiClient.update_notification_settings(notificationSettings);

      if (response.ok) {
        toast.success(t("family.notificationsUpdated"));
      } else {
        const data = await response.json();
        toast.error(data.message || t("family.failedToUpdateNotifications"));
      }
    } catch (error) {
      console.error("Error updating notification settings:", error);
      toast.error(t("family.failedToUpdateNotifications"));
    } finally {
      setIsSavingNotifications(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite] text-primary" />
          <p className="mt-4 text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (profile?.role !== "parent") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("family.accessDenied")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {t("family.onlyParentsAccess")}
            </p>
            <Button onClick={() => window.location.href = "/"} variant="outline">
              {t("common.goBack")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800">
      <PageHeader title={t("family.familySettings") || "Family Settings"} userRole="parent" />
      
      <div className="max-w-4xl mx-auto p-6">
        <div className="space-y-6">
          {/* Weekly Notification Settings */}
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>{t("family.weeklyNotifications")}</CardTitle>
                <CardDescription>
                  {t("family.weeklyNotificationsDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="notifications-enabled">
                      {t("family.enableWeeklySummary")}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t("family.sendWeeklySummaryDescription")}
                    </p>
                  </div>
                  <Switch
                    id="notifications-enabled"
                    checked={notificationSettings.enabled}
                    onCheckedChange={(checked) => 
                      setNotificationSettings(prev => ({ ...prev, enabled: checked }))
                    }
                  />
                </div>
                
                {notificationSettings.enabled && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="notification-day">
                        {t("family.sendOn")}
                      </Label>
                      <select
                        id="notification-day"
                        value={notificationSettings.day}
                        onChange={(e) => setNotificationSettings(prev => ({ ...prev, day: parseInt(e.target.value) }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="0">{t("days.sunday")}</option>
                        <option value="1">{t("days.monday")}</option>
                        <option value="2">{t("days.tuesday")}</option>
                        <option value="3">{t("days.wednesday")}</option>
                        <option value="4">{t("days.thursday")}</option>
                        <option value="5">{t("days.friday")}</option>
                        <option value="6">{t("days.saturday")}</option>
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="notification-hour">
                        {t("family.sendAt")}
                      </Label>
                      <select
                        id="notification-hour"
                        value={notificationSettings.hour}
                        onChange={(e) => setNotificationSettings(prev => ({ ...prev, hour: parseInt(e.target.value) }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {i.toString().padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <Button
                  onClick={handleSaveNotificationSettings}
                  disabled={isSavingNotifications}
                  className="w-full"
                >
                  {isSavingNotifications ? t("common.saving") : t("common.saveChanges")}
                </Button>
              </CardContent>
            </Card>
          </div>
          
          {/* Family Language Settings */}
          <div className="max-w-2xl mx-auto mb-8">
            <Card>
              <CardHeader>
                <CardTitle>{t("family.defaultLanguage")}</CardTitle>
                <CardDescription>
                  {t("family.languageSettingsDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="familyLanguage">{t("family.defaultLanguage")}</Label>
                  <select
                    id="familyLanguage"
                    value={familyLanguage}
                    onChange={(e) => setFamilyLanguage(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="en">{t("languages.en")}</option>
                    <option value="nb">{t("languages.nb")}</option>
                  </select>
                </div>

                <Button
                  onClick={handleSaveFamilyLanguage}
                  disabled={isSavingLanguage}
                  className="w-full"
                >
                  {isSavingLanguage ? t("common.saving") : t("common.saveChanges")}
                </Button>
              </CardContent>
            </Card>
          </div>

          {profile && <FamilyManagement familyId={profile.family_id} />}
        </div>
      </div>
    </div>
  );
}
