import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Copy, Check, Trash2, UserCheck, UserX, Edit2, User, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { apiClient, APP_BASE_PATH } from "app";
import { toast } from "sonner";
import type { FamilyInviteResponse, PendingMemberResponse, ChildResponse } from "types";
import { useTranslation } from "react-i18next";

interface Props {
  familyId: string;
}

export default function FamilyManagement({ familyId }: Props) {
  const { t } = useTranslation();
  const [invites, setInvites] = useState<FamilyInviteResponse[]>([]);
  const [pendingMembers, setPendingMembers] = useState<PendingMemberResponse[]>([]);
  const [children, setChildren] = useState<ChildResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState<"parent" | "child">("child");
  const [invitedName, setInvitedName] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newInviteRole, setNewInviteRole] = useState<'parent' | 'child'>('child');
  const [newInviteName, setNewInviteName] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editingChildName, setEditingChildName] = useState("");
  const [editingChildPhone, setEditingChildPhone] = useState("");

  // Create child account (no email needed)
  const [showCreateChild, setShowCreateChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const [newChildPin, setNewChildPin] = useState("");
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [createdChild, setCreatedChild] = useState<{ username: string; display_name: string } | null>(null);

  // PIN change
  const [changingPinForId, setChangingPinForId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");

  // Vipps QR dialog
  const [qrChild, setQrChild] = useState<{ name: string; phone: string } | null>(null);
  const [copiedQrPhone, setCopiedQrPhone] = useState(false);

  const handleCopyQrPhone = (phone: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      setCopiedQrPhone(true);
      setTimeout(() => setCopiedQrPhone(false), 2000);
    });
  };

  // Load invites and pending members
  const loadData = async () => {
    try {
      const [invitesRes, pendingRes, childrenRes] = await Promise.all([
        apiClient.list_invites(),
        apiClient.list_pending_members(),
        apiClient.list_children()
      ]);
      const [invitesData, pendingData, childrenData] = await Promise.all([
        invitesRes.json(),
        pendingRes.json(),
        childrenRes.json()
      ]);
      setInvites(invitesData);
      setPendingMembers(pendingData);
      setChildren(childrenData);
    } catch (error) {
      console.error("Error loading family data:", error);
      toast.error(t("family.failedToLoadFamilyData"));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateChildAccount = async () => {
    if (!newChildName.trim()) { toast.error(t("family.childNameRequired")); return; }
    if (!/^\d{4,8}$/.test(newChildPin)) { toast.error(t("family.pinInvalid")); return; }
    setIsCreatingChild(true);
    try {
      const res = await apiClient.create_child_account({ display_name: newChildName.trim(), pin: newChildPin });
      const data = await res.json();
      setCreatedChild({ username: data.username, display_name: data.display_name });
      setNewChildName("");
      setNewChildPin("");
      await loadData();
      toast.success(t("family.childAccountCreatedFor", { name: data.display_name }));
    } catch (err) {
      console.error(err);
      toast.error(t("family.failedToCreateChildAccount"));
    } finally {
      setIsCreatingChild(false);
    }
  };

  const handleUpdatePin = async (childUserId: string) => {
    if (!/^\d{4,8}$/.test(newPin)) { toast.error(t("family.pinInvalid")); return; }
    try {
      await apiClient.update_child_pin(childUserId, newPin);
      setChangingPinForId(null);
      setNewPin("");
      toast.success(t("family.pinUpdated"));
    } catch (err) {
      console.error(err);
      toast.error(t("family.failedToUpdatePin"));
    }
  };

  const handleCreateInvite = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.create_invite({
        role: inviteRole,
        invited_name: invitedName || undefined
      });
      const newInvite = await response.json();
      setInvites([newInvite, ...invites]);
      setShowCreateInvite(false);
      setInvitedName("");
      toast.success(`${t("family.inviteCreatedFor")} ${inviteRole}`);
    } catch (error) {
      console.error("Error creating invite:", error);
      toast.error(t("family.failedToCreateInvite"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyInviteLink = (inviteCode: string) => {
    // Construct the full URL with the app's base path
    const base = APP_BASE_PATH.endsWith("/") ? APP_BASE_PATH.slice(0, -1) : APP_BASE_PATH;
    const inviteUrl = `${window.location.origin}${base}/setup-profile?invite=${inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(inviteCode);
    toast.success(t("family.inviteLinkCopied"));
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await apiClient.revoke_invite(inviteId);
      setInvites(invites.filter(i => i.id !== inviteId));
      toast.success(t("family.inviteRevoked"));
    } catch (error) {
      console.error("Error revoking invite:", error);
      toast.error(t("family.failedToRevokeInvite"));
    }
  };

  const handleApproveMember = async (userId: string, role: "parent" | "child") => {
    try {
      await apiClient.approve_member({
        user_id: userId,
        role
      });
      setPendingMembers(pendingMembers.filter(m => m.user_id !== userId));
      toast.success(t("family.memberApproved"));
    } catch (error) {
      console.error("Error approving member:", error);
      toast.error(t("family.failedToApproveMember"));
    }
  };

  const handleRejectMember = async (userId: string) => {
    try {
      await apiClient.reject_member({ userId });
      setPendingMembers(pendingMembers.filter(m => m.user_id !== userId));
      toast.success(t("family.memberRejected"));
    } catch (error) {
      console.error("Error rejecting member:", error);
      toast.error(t("family.failedToRejectMember"));
    }
  };

  const handleStartEditChild = (child: ChildResponse) => {
    setEditingChildId(child.user_id);
    setEditingChildName(child.name);
    setEditingChildPhone(child.phone_number || "");
  };

  const handleSaveChildProfile = async () => {
    if (!editingChildId) return;

    if (!editingChildName.trim()) {
      toast.error(t("toasts.nameCannotBeEmpty"));
      return;
    }

    if (editingChildPhone && editingChildPhone.replace(/\s/g, '').length !== 8) {
      toast.error(t("toasts.phoneNumberMustBe8Digits"));
      return;
    }

    try {
      const response = await apiClient.update_child_profile(
        { childUserId: editingChildId },
        {
          name: editingChildName,
          phone_number: editingChildPhone ? editingChildPhone.replace(/\s/g, '') : null
        }
      );

      if (response.ok) {
        const updatedChild = await response.json();
        setChildren(children.map(c => 
          c.user_id === editingChildId ? updatedChild : c
        ));
        setEditingChildId(null);
        toast.success(t("toasts.nameUpdated"));
      } else {
        toast.error(t("toasts.failedToUpdateName"));
      }
    } catch (error) {
      console.error("Error updating child profile:", error);
      toast.error(t("toasts.failedToUpdateName"));
    }
  };

  const handleCancelEditChild = () => {
    setEditingChildId(null);
    setEditingChildName("");
    setEditingChildPhone("");
  };

  // Filter active (unused, not revoked) invites
  const activeInvites = invites.filter(i => !i.revoked && !i.used_by);

  return (
    <div className="space-y-6">
      {/* Create Child Account */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("family.addChildTitle")}</CardTitle>
              <CardDescription>{t("family.addChildDescription")}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setShowCreateChild(!showCreateChild); setCreatedChild(null); }}>
              {showCreateChild ? t("family.cancelButton") : t("family.addChildButton")}
            </Button>
          </div>
        </CardHeader>
        {showCreateChild && (
          <CardContent className="space-y-3">
            {createdChild ? (
              <div className="rounded-lg border-2 border-green-200 bg-green-50 dark:bg-green-950 p-4 space-y-2">
                <p className="font-semibold text-green-800 dark:text-green-200">
                  {t("family.childAccountCreatedFor", { name: createdChild.display_name })}
                </p>
                <p className="text-sm text-muted-foreground">{t("family.childSignInInstructions")}</p>
                <div className="font-mono text-sm bg-white dark:bg-gray-900 rounded p-2">
                  <p><span className="text-muted-foreground">{t("family.childUsernameLabel")}</span> <strong>{createdChild.username}</strong></p>
                  <p><span className="text-muted-foreground">{t("family.childPinLabel")}</span> <strong>{t("family.childPinSet")}</strong></p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setCreatedChild(null); setShowCreateChild(false); }}>
                  {t("family.done")}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>{t("family.childNameLabel")}</Label>
                  <Input placeholder={t("family.namePlaceholder")} value={newChildName} onChange={(e) => setNewChildName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t("family.pinLabel")}</Label>
                  <Input type="password" inputMode="numeric" placeholder="••••" maxLength={8} value={newChildPin} onChange={(e) => setNewChildPin(e.target.value.replace(/\D/g, ""))} />
                </div>
                <Button onClick={handleCreateChildAccount} disabled={isCreatingChild} className="w-full">
                  {isCreatingChild ? t("family.creatingAccount") : t("family.createAccount")}
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Children Management Section */}
      {children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("family.children")}</CardTitle>
            <CardDescription>
              {t("family.manageChildrenProfiles")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {children.map((child) => (
              <div
                key={child.user_id}
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-950 rounded-lg border group"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  {editingChildId === child.user_id ? (
                    <div className="flex-1 space-y-2">
                      <Input
                        value={editingChildName}
                        onChange={(e) => setEditingChildName(e.target.value)}
                        placeholder={t("family.childNamePlaceholder")}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveChildProfile();
                          } else if (e.key === 'Escape') {
                            handleCancelEditChild();
                          }
                        }}
                        autoFocus
                      />
                      <div>
                        <Input
                          value={editingChildPhone}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^0-9\s]/g, '').slice(0, 11);
                            setEditingChildPhone(value);
                          }}
                          placeholder={t("family.phonePlaceholder")}
                          maxLength={11}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveChildProfile();
                            } else if (e.key === 'Escape') {
                              handleCancelEditChild();
                            }
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("family.phoneHelper")}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1">
                      <p className="font-semibold">{child.name}</p>
                      {child.phone_number && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            {child.phone_number.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')}
                          </p>
                          <button
                            onClick={() => setQrChild({ name: child.name, phone: child.phone_number!.replace(/\s/g, '') })}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title={t("toasts.showVippsQr")}
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {t("balance.earned")}: {child.total_earned}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {t("balance.pending")}: {child.pending_amount}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {editingChildId === child.user_id ? (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSaveChildProfile}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        {t("common.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEditChild}
                      >
                        {t("common.cancel")}
                      </Button>
                    </>
                  ) : (
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" onClick={() => handleStartEditChild(child)}>
                        <Edit2 className="w-4 h-4 mr-1" />
                        {t("common.edit")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setChangingPinForId(child.user_id); setNewPin(""); }}>
                        {t("family.changePin")}
                      </Button>
                    </div>
                  )}
                </div>
                {/* Inline PIN change form */}
                {changingPinForId === child.user_id && (
                  <div className="mt-2 pt-2 border-t flex gap-2 items-center">
                    <Input
                      type="password"
                      inputMode="numeric"
                      placeholder={t("family.newPinPlaceholder")}
                      maxLength={8}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                      className="max-w-[160px]"
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleUpdatePin(child.user_id)}>{t("common.save")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setChangingPinForId(null); setNewPin(""); }}>{t("common.cancel")}</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Pending Members Section */}
      {pendingMembers.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400">⚠️</span>
              {t("family.pendingApprovals")} ({pendingMembers.length})
            </CardTitle>
            <CardDescription>
              {t("family.newMembersWaiting")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingMembers.map((member) => (
              <div
                key={member.user_id}
                className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800"
              >
                <div>
                  <p className="font-semibold">
                    {member.name || member.email || t("family.unknownUser")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("family.requestedAs")} {t(`roles.${member.role}`)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => handleApproveMember(member.user_id, "child")}
                  >
                    <UserCheck className="w-4 h-4 mr-1" />
                    {t("family.approveAsChild")}
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => handleApproveMember(member.user_id, "parent")}
                  >
                    <UserCheck className="w-4 h-4 mr-1" />
                    {t("family.approveAsParent")}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRejectMember(member.user_id)}
                  >
                    <UserX className="w-4 h-4 mr-1" />
                    {t("family.reject")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Invite Management */}
      <Card>
        <CardHeader>
          <CardTitle>{t("family.familyInvites")}</CardTitle>
          <CardDescription>
            {t("family.createInviteLinks")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create Invite Form */}
          {showCreateInvite && (
            <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border space-y-4">
              <div className="space-y-2">
                <Label>{t("family.roleLabel")}</Label>
                <RadioGroup value={inviteRole} onValueChange={(v) => setInviteRole(v as "parent" | "child")}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="child" id="invite-child" />
                    <Label htmlFor="invite-child">{t("roles.child")}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="parent" id="invite-parent" />
                    <Label htmlFor="invite-parent">{t("roles.parent")}</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>{t("family.nameOptional")}</Label>
                <Input
                  placeholder={t("family.namePlaceholder")}
                  value={invitedName}
                  onChange={(e) => setInvitedName(e.target.value)}
                />
              </div>
              <Button onClick={handleCreateInvite} disabled={isLoading} className="w-full">
                {isLoading ? t("family.creating") : t("family.createInviteLink")}
              </Button>
            </div>
          )}

          {/* Active Invites List */}
          {activeInvites.length > 0 ? (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground">{t("family.activeInvites")}</h3>
              {activeInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 bg-white dark:bg-gray-950 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={invite.role === "parent" ? "default" : "secondary"}>
                        {t(`roles.${invite.role}`)}
                      </Badge>
                      {invite.invited_name && (
                        <span className="text-sm font-medium">{invite.invited_name}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      {invite.invite_code}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyInviteLink(invite.invite_code)}
                    >
                      {copiedCode === invite.invite_code ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRevokeInvite(invite.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !showCreateInvite && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("family.noActiveInvites")}
              </p>
            )
          )}
          
          {/* Create Invite Button at Bottom */}
          <div className="flex justify-center pt-2">
            <Button onClick={() => setShowCreateInvite(!showCreateInvite)} variant={showCreateInvite ? "outline" : "default"}>
              {showCreateInvite ? t("family.cancelButton") : t("family.createInviteButton")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Vipps QR Dialog */}
      <Dialog open={qrChild !== null} onOpenChange={() => setQrChild(null)}>
        <DialogContent className="max-w-xs w-full mx-auto">
          <DialogHeader>
            <DialogTitle>{qrChild?.name} – Vipps</DialogTitle>
          </DialogHeader>
          {qrChild && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="p-4 bg-white rounded-xl border">
                <QRCodeSVG
                  value={`https://qr.vipps.no/28/2/01/031/47${qrChild.phone}`}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#ff5b24"
                  level="M"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">{t("toasts.vippsQrHint")}</p>
              <p className="text-2xl font-mono tracking-widest">
                {qrChild.phone.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')}
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleCopyQrPhone(qrChild.phone)}
              >
                {copiedQrPhone ? (
                  <><Check className="w-4 h-4 mr-2 text-green-600" />{t("toasts.phoneNumberCopied")}</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" />{t("toasts.copyVippsNumber")}</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
