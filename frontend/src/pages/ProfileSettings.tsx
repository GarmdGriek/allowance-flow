import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "app";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useUser } from "@stackframe/react";
import { CURRENCIES } from "utils/currencies";
import type { ProfileResponse } from "types";
import { useTranslation } from "react-i18next";
import i18n from "utils/i18n";
import { Users, ArrowLeft } from "lucide-react";
import { PageHeader } from "components/PageHeader";

export default function ProfileSettings() {
  const navigate = useNavigate();
  const user = useUser();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [currency, setCurrency] = useState("NOK");
  const [language, setLanguage] = useState<string | null>(null);
  const [effectiveLanguage, setEffectiveLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  // Redirect if not logged in
  useEffect(() => {
    if (!user) {
      navigate("/auth/sign-in");
    }
  }, [user, navigate]);

  // Load profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const response = await apiClient.get_my_profile();
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
          setCurrency(data.currency || "NOK");
        }
      } catch (error) {
        console.error("Error loading profile:", error);
        toast.error("Failed to load profile");
      } finally {
        setIsFetching(false);
      }
    };

    loadProfile();
  }, []);

  // Load language preferences
  useEffect(() => {
    const loadLanguagePreferences = async () => {
      try {
        const response = await apiClient.get_language_preferences();
        if (response.ok) {
          const data = await response.json();
          setLanguage(data.user_language);
          setEffectiveLanguage(data.effective_language);
          // Update i18n to use the effective language
          i18n.changeLanguage(data.effective_language);
        }
      } catch (error) {
        console.error("Error loading language preferences:", error);
      }
    };

    loadLanguagePreferences();
  }, []);

  const handleSave = async () => {
    if (!profile) return;

    setIsLoading(true);
    try {
      const response = await apiClient.update_profile({
        role: profile.role,
        family_id: profile.family_id,
        currency
      });

      if (response.ok) {
        const updated = await response.json();
        setProfile(updated);
        toast.success("Profile updated successfully!");
      } else {
        toast.error("Failed to update profile");
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("An error occurred while updating your profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveLanguage = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.update_user_language({ language });

      if (response.ok) {
        toast.success(t("profile.profileUpdated"));
        // Update effective language
        const newEffective = language || effectiveLanguage;
        setEffectiveLanguage(newEffective);
        i18n.changeLanguage(newEffective);
      } else {
        toast.error("Failed to update language preference");
      }
    } catch (error) {
      console.error("Error updating language:", error);
      toast.error("An error occurred while updating your language preference");
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-center text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
        <div className="max-w-2xl mx-auto">
          <p className="text-center text-red-600">{t("profile.profileNotFound")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800">
      <PageHeader 
        title={t("profile.profileSettings") || "Profile Settings"} 
        userRole={profile.role}
      />
      
      <div className="max-w-2xl mx-auto p-6">
        <div className="space-y-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t("profile.accountInformation")}</CardTitle>
              <CardDescription>{t("profile.basicDetails")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">{t("profile.email")}</Label>
                <p className="text-base">{user.primaryEmail || t("common.notSet")}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">{t("profile.name")}</Label>
                <p className="text-base">{user.displayName || t("common.notSet")}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">{t("profile.role")}</Label>
                <p className="text-base capitalize">{t(`roles.${profile.role}`)}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">{t("profile.familyId")}</Label>
                <p className="text-base">{profile.family_id}</p>
              </div>
            </CardContent>
          </Card>

          {/* Currency Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle>{t("profile.currencySettings")}</CardTitle>
              <CardDescription>{t("profile.currencyDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currency">{t("profile.preferredCurrency")}</Label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {CURRENCIES.map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.symbol} - {curr.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                onClick={handleSave}
                disabled={isLoading || currency === profile.currency}
                className="w-full"
              >
                {isLoading ? t("common.saving") : t("common.saveChanges")}
              </Button>
            </CardContent>
          </Card>

          {/* Language Settings Card */}
          {profile.role === "parent" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("profile.language")}</CardTitle>
                <CardDescription>
                  {t("profile.languageDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">{t("profile.language")}</Label>
                  <select
                    id="language"
                    value={language || ""}
                    onChange={(e) => setLanguage(e.target.value || null)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">{t("profile.useFamilyDefault")}</option>
                    <option value="en">{t("languages.en")}</option>
                    <option value="nb">{t("languages.nb")}</option>
                  </select>
                </div>

                <Button
                  onClick={handleSaveLanguage}
                  disabled={isLoading}
                  className="w-full"
                >
                  {isLoading ? t("common.saving") : t("common.saveChanges")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
