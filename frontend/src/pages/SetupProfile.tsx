import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUser } from "@stackframe/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "app";
import { CURRENCIES } from "utils/currencies";

type UserRole = "parent" | "child";

export default function SetupProfile() {
  const navigate = useNavigate();
  const user = useUser();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [role, setRole] = useState<UserRole | null>(null);
  const [familyId, setFamilyId] = useState("");
  const [currency, setCurrency] = useState("NOK");
  const [language, setLanguage] = useState("en");
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isInvited, setIsInvited] = useState(false);
  const [invitedName, setInvitedName] = useState<string | null>(null);

  // Check for invite code in URL
  useEffect(() => {
    const code = searchParams.get('invite');
    if (code) {
      setInviteCode(code);
      setIsInvited(true);
      // Note: We don't validate the invite here, the backend will do it on setup
      // The role will be determined by the invite
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If not using invite code, require role and familyId
    if (!isInvited) {
      if (!role) {
        toast({
          title: "Role required",
          description: "Please select your role",
          variant: "destructive"
        });
        return;
      }
      
      if (!familyId.trim()) {
        toast({
          title: "Family ID required",
          description: "Please enter a family ID",
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
          title: "Profile created!",
          description: "Waiting for parent approval to access the app"
        });
      } else {
        toast({
          title: "Profile created!",
          description: `Welcome to Allowance Flow as a ${data.role}`
        });
      }
      
      // Redirect to home page
      navigate("/");
    } catch (error: any) {
      console.error("Profile setup error:", error);
      
      toast({
        title: "Setup failed",
        description: error.message || "Failed to create profile. Please try again.",
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

  // Redirect to sign-up if not authenticated, preserve invite code
  if (!user) {
    const inviteParam = searchParams.get('invite');
    const signUpUrl = inviteParam 
      ? `/auth/sign-up?after=${encodeURIComponent(`/setup-profile?invite=${inviteParam}`)}`
      : '/auth/sign-up?after=/setup-profile';
    navigate(signUpUrl);
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold text-center">
            {isInvited ? `Welcome! 🎉` : `Welcome to Allowance Flow! 🎉`}
          </CardTitle>
          <CardDescription className="text-center">
            {isInvited 
              ? "You've been invited to join a family"
              : "Let's set up your profile to get started"
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Show different UI based on invite status */}
            {isInvited ? (
              <div className="rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4">
                <p className="text-sm text-center">
                  ✨ You're joining via an invite link! Your role will be assigned automatically.
                </p>
              </div>
            ) : (
              <>
                {/* Role Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">I am a...</Label>
                  <RadioGroup value={role || ""} onValueChange={(value) => setRole(value as "parent" | "child")}>
                    <div className="flex items-center space-x-3 rounded-lg border-2 border-orange-200 dark:border-orange-800 p-4 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors">
                      <RadioGroupItem value="parent" id="parent" />
                      <Label htmlFor="parent" className="flex-1 cursor-pointer">
                        <div className="font-semibold">Parent</div>
                        <div className="text-sm text-muted-foreground">Create tasks and manage allowances</div>
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-3 rounded-lg border-2 border-blue-200 dark:border-blue-800 p-4 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors">
                      <RadioGroupItem value="child" id="child" />
                      <Label htmlFor="child" className="flex-1 cursor-pointer">
                        <div className="font-semibold">Child</div>
                        <div className="text-sm text-muted-foreground">Complete tasks and earn allowance</div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Family ID Input */}
                <div className="space-y-3">
                  <Label htmlFor="familyId" className="text-base font-semibold">
                    Family ID
                  </Label>
                  
                  {role === "parent" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Create a unique family ID that your children can use to join
                      </p>
                      <div className="flex gap-2">
                        <Input
                          id="familyId"
                          type="text"
                          placeholder="e.g., family_smith2024"
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
                          Generate ID
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Enter the family ID provided by your parent
                      </p>
                      <Input
                        id="familyId"
                        type="text"
                        placeholder="Enter family ID"
                        value={familyId}
                        onChange={(e) => setFamilyId(e.target.value)}
                        required
                      />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        ⚠️ Note: Your parent will need to approve your request
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Currency Selection */}
            <div className="space-y-3">
              <Label className="text-base font-semibold">Currency</Label>
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
              <Label className="text-base font-semibold">Language</Label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full border-2 border-orange-200 dark:border-orange-800 p-3 rounded-lg transition-colors"
              >
                <option value="en">English</option>
                <option value="nb">Norsk (Bokmål)</option>
              </select>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold"
              disabled={isLoading}
            >
              {isLoading ? "Setting up..." : "Complete Setup"}
            </Button>
          </form>
          
          {/* User Info */}
          <div className="mt-6 pt-4 border-t text-center text-sm text-muted-foreground">
            Signed in as {user.displayName || user.primaryEmail}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
