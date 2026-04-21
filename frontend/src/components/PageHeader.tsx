import { MobileNav } from "components/MobileNav";
import { NotificationBell } from "./NotificationBell";

interface Props {
  title: string;
  userRole?: "parent" | "child";
  isPreviewMode?: boolean;
  onPreviewClick?: () => void;
  onExitPreview?: () => void;
}

export function PageHeader({ 
  title, 
  userRole = "child", 
  isPreviewMode = false, 
  onPreviewClick, 
  onExitPreview 
}: Props) {
  return (
    <header className="flex items-center justify-between p-3 md:p-4 bg-background border-b">
      <h1 className="text-lg sm:text-2xl font-bold truncate max-w-[60vw]">{title}</h1>
      <div className="flex items-center gap-2">
        <NotificationBell show={userRole === "parent"} />
        <MobileNav 
          userRole={userRole}
          isPreviewMode={isPreviewMode}
          onPreviewClick={onPreviewClick}
          onExitPreview={onExitPreview}
        />
      </div>
    </header>
  );
}
