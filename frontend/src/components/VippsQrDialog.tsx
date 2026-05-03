import { QRCodeSVG } from "qrcode.react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface QrChild {
  name: string;
  phone_number?: string | null;
}

interface Props {
  child: QrChild | null;
  copied: boolean;
  onCopiedChange: (copied: boolean) => void;
  onClose: () => void;
}

export default function VippsQrDialog({ child, copied, onCopiedChange, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={child !== null} onOpenChange={onClose}>
      <DialogContent className="max-w-xs w-full mx-auto">
        <DialogHeader>
          <DialogTitle>{child?.name} – Vipps</DialogTitle>
        </DialogHeader>
        {child?.phone_number && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="p-4 bg-white rounded-xl border">
              <QRCodeSVG
                value={`https://qr.vipps.no/28/2/01/031/47${child.phone_number.replace(/\s/g, '')}`}
                size={200}
                bgColor="#ffffff"
                fgColor="#ff5b24"
                level="M"
              />
            </div>
            <p className="text-sm text-muted-foreground text-center">{t("toasts.vippsQrHint")}</p>
            <p className="text-2xl font-mono tracking-widest">
              {child.phone_number.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')}
            </p>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(child.phone_number!.replace(/\s/g, '')).then(() => {
                  onCopiedChange(true);
                  setTimeout(() => onCopiedChange(false), 2000);
                });
              }}
            >
              {copied ? (
                <><Check className="w-4 h-4 mr-2 text-green-600" />{t("toasts.phoneNumberCopied")}</>
              ) : (
                <><Copy className="w-4 h-4 mr-2" />{t("toasts.copyVippsNumber")}</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
