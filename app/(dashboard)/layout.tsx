import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RealtimeMemberSync } from "@/components/layout/realtime-member-sync";
import { getCurrentMember } from "@/features/auth/current-member";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const member = await getCurrentMember();

  return (
    <div className="app-shell">
      {member && (
        <RealtimeMemberSync
          organizationId={member.organizationId}
          organizationUpdatedAt={member.organizationUpdatedAt}
        />
      )}
      <Sidebar isOwner={member?.role === "owner"} />
      <div className="app-main">
        <Topbar fullName={member?.fullName} role={member?.role} />
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
