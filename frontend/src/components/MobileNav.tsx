import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X, Home, ListTodo, Archive, Settings, Eye, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";
import { authClient } from "app/auth";

interface Props {
  userRole: "parent" | "child";
  isPreviewMode?: boolean;
  onPreviewClick?: () => void;
  onExitPreview?: () => void;
}

export function MobileNav({ userRole, isPreviewMode, onPreviewClick, onExitPreview }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    setOpen(false);
    await authClient.signOut();
  };

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handlePreview = () => {
    setOpen(false);
    onPreviewClick?.();
  };

  const handleExitPreview = () => {
    setOpen(false);
    onExitPreview?.();
  };

  // In preview mode, show only an X button to exit
  if (isPreviewMode) {
    return (
      <Button 
        variant="outline" 
        size="icon"
        onClick={handleExitPreview}
        className="bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
      >
        <X className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[300px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>{t("nav.menu") || "Menu"}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 mt-6">
            {/* Home / Dashboard */}
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => handleNavigate("/")}
            >
              <Home className="mr-2 h-4 w-4" />
              {t("nav.home")}
            </Button>

            {/* Archive - visible to all users */}
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => handleNavigate("/archive")}
            >
              <Archive className="mr-2 h-4 w-4" />
              {t("nav.archive")}
            </Button>

            {/* Parent-specific navigation */}
            {userRole === "parent" && !isPreviewMode && (
              <>
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={onPreviewClick ? handlePreview : () => handleNavigate("/?openPreview=1")}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  {t("app.preview")}
                </Button>

                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => handleNavigate("/task-management")}
                >
                  <ListTodo className="mr-2 h-4 w-4" />
                  {t("app.taskManagement")}
                </Button>
              </>
            )}

            {/* Exit preview mode */}
            {isPreviewMode && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={handleExitPreview}
              >
                <X className="mr-2 h-4 w-4" />
                {t("app.exitPreview")}
              </Button>
            )}

            <Separator />

            {/* Settings */}
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => handleNavigate("/profile-settings")}
            >
              <Settings className="mr-2 h-4 w-4" />
              {t("nav.settings")}
            </Button>

            {/* Family Settings - only for parents */}
            {userRole === "parent" && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => handleNavigate("/family-settings")}
              >
                <Users className="mr-2 h-4 w-4" />
                {t("nav.family")}
              </Button>
            )}

            {/* Sign Out */}
            <Button
              variant="ghost"
              className="justify-start text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("nav.signOut")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
