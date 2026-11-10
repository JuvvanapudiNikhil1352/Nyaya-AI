import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

/** Shows who is logged in and a sign-out button. Reads the session, so render inside <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  const fullName =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="min-w-0 px-2">
        {fullName && <p className="truncate text-sm font-medium">{fullName}</p>}
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <form action={logout}>
        <Button type="submit" variant="ghost" className="w-full justify-start text-muted-foreground">
          <LogOut aria-hidden /> {t.nav.signOut}
        </Button>
      </form>
    </div>
  );
}
