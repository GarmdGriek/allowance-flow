import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "app/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "app";
import { CURRENCIES } from "utils/currencies";
import { useTranslation } from "react-i18next";

type UserRole = "parent" | "child";

export default function SetupProfile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user ?? null;
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [role, setRole] = useState<UserRole | null>(null);
  const [familyId, setFamilyId] = useState("");
  const [currency, setCurrency] = useState("NOK");
  const [language, setLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isInvited, setIsInvited] = useState(false);

  // Check for invite code in URL
  useEffect(() => {
    const code = searchParams.get('invite');
    if (code) {
      setInviteCode(code);
      setIsInvited(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isInvited) {
      if (!role) {
        toast({
          title: t("setup.roleRequired"),
          description: t("setup.pleaseSelectRole"),
          variant: "destructive"
        });
        return;
      }

      if (!familyId.trim()) {
        toast({
          title: t("setup.familyIdRequired"),
          description: t("setup.pleaseEnterFamilyId"),
          variant: "destructive"
        });
        return;
      }
    }

    setIsLoading(true);

    try {
      const response = await apiClient.setup_profile({
        role: isInvited ? undefined : role,
        family_id: isInvited ? undefined : familyId.trim(),
        currency,
        invite_code: inviteCode || undefined
      });

      const data = await response.json();

      if (data.status === 'pending') {
        toast({
          title: t("setup.profileCreated"),
          description: t("setup.waitingForParentApproval")
        });
      } else {
        toast({
          title: t("setup.profileCreated"),
          description: t("setup.welcomeAsRole", { role: data.role })
        });
      }

      navigate("/");
    } catch (error: any) {
      console.error("Profile setup error:", error);
      toast({
        title: t("setup.setupFailed"),
        description: error.message || t("setup.setupFailedDescription"),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateFamilyId = () => {
    const randomId = `family_${Math.random().toString(36).substring(2, 10)}`;
    setFamilyId(randomId);
  };

  // Wait for session to load before deciding whether the user is signed in.
  // Without this guard, the first render sees user=null and immediately bounces
  // to /auth/sign-up even when the user just completed signup and is authenticated.
  if (isPending) return null;

  // If not signed in: show invite landing or redirect to sign-up
  if (!user) {
    const inviteParam = searchParams.get('invite');
    if (inviteParam) {
      const signInUrl = `/auth/sign-in?after=${encodeURIComponent(`/setup-profile?invite=${inviteParam}`)}`;
      const signUpUrl = `/auth/sign-up?after=${encodeURIComponent(`/setup-profile?invite=${inviteParam}`)}`;
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-4">
          <Card className="w-full max-w-md shadow-lg">
            <CardHeader className="space-y-2">
              <CardTitle className="text-2xl font-bold text-center">{t("setup.invitedTitle")}</CardTitle>
              <CardDescription className="text-center">
                {t("setup.invitedSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4 text-center">
                <p className="text-sm font-medium">{t("setup.inviteAutoSetup")}</p>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {t("setup.signInOrCreate")}
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
                  onClick={() => navigate(signInUrl)}
                >
                  {t("setup.signInToAccept")}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate(signUpUrl)}>
                  {t("setup.createAccount")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    navigate(`/auth/sign-up?after=/setup-profile`);
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold text-center">
            {isInvited ? t("setup.welcomeInvited") : t("setup.welcomeDefault")}
          </CardTitle>
          <CardDescription className="text-center">
            {isInvited ? t("setup.invitedToFamily") : t("setup.setupDescription")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {isInvited ? (
              <div className="rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
                <p className="text-sm text-center">{t("setup.joiningViaInvite")}</p>
              </div>
            ) : (
              <>
                {/* Role Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">{t("setup.iAmA")}</Label>
                  <RadioGroup value={role || ""} onValueChange={(value) => setRole(value as "parent" | "child")}>
                    <div className="flex items-center space-x-3 rounded-lg border-2 border-orange-200 dark:border-orange-800 p-4 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors">
                      <RadioGroupItem value="parent" id="parent" />
                      <Label htmlFor="parent" className="flex-1 cursor-pointer">
                        <div className="font-semibold">{t("roles.parent")}</div>
                        <div className="text-sm text-muted-foreground">{t("setup.parentDescription")}</div>
                      </Label>
                    </div>

                    <div className="flex items-center space-x-3 rounded-lg border-2 border-blue-200 dark:border-blue-800 p-4 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                      <RadioGroupItem value="child" id="child" />
                      <Label htmlFor="child" className="flex-1 cursor-pointer">
                        <div className="font-semibold">{t("roles.child")}</div>
                        <div className="text-sm text-muted-foreground">{t("setup.childDescription")}</div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Family ID Input */}
                <div className="space-y-3">
                  <Label htmlFor="familyId" className="text-base font-semibold">
                    {t("setup.familyIdLabel")}
                  </Label>

                  {role === "parent" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {t("setup.createFamilyIdDescription")}
                      </p>
                      <div className="flex gap-2">
                        <Input
                          id="familyId"
                          type="text"
                          placeholder={t("setup.familyIdPlaceholder")}
                          value={familyId}
                          onChange={(e) => setFamilyId(e.target.value)}
                          className="flex-1"
                          required
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={generateFamilyId}
                          className="whitespace-nowrap"
                        >
                          {t("setup.generateId")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {t("setup.joinFamilyDescription")}
                      </p>
                      <Input
                        id="familyId"
                        type="text"
                        placeholder={t("setup.familyIdInputPlaceholder")}
                        value={familyId}
                        onChange={(e) => setFamilyId(e.target.value)}
                        required
                      />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t("setup.approvalNote")}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Currency Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">{t("setup.currencyLabel")}</Label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border-2 border-orange-200 dark:border-orange-800 p-3 rounded-lg transition-colors"
              >
                {CURRENCIES.map((curr) => (
                  <option key={curr.code} value={curr.code}>
                    {curr.code} ({curr.symbol}) - {curr.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Language Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">{t("setup.languageLabel")}</Label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full border-2 border-orange-200 dark:border-orange-800 p-3 rounded-lg transition-colors"
              >
                <option value="en">{t("languages.en")}</option>
                <option value="nb">{t("languages.nb")}</option>
              </select>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? t("setup.settingUp") : t("setup.completeSetup")}
            </Button>
          </form>

          {/* User Info */}
          <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground flex items-center justify-center gap-3">
            <span>{t("setup.signedInAs", { name: user.name || user.email })}</span>
            <button
              type="button"
              onClick={() => authClient.signOut()}
              className="text-orange-500 hover:text-orange-700 underline"
            >
              {t("setup.signOut")}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
