import { Outlet, useNavigate, Link, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Bell, User, CheckCheck, LogOut, Settings } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  notificationsStore,
  type Notification,
  NOTIFICATION_ICONS,
  TONE_CLASSES,
} from "@/lib/notifications";
import { RoleSwitcher } from "./RoleSwitcher";
import { useRole } from "@/hooks/useRole";

const AppLayout = () => {
  const navigate = useNavigate();
  const role = useRole();
  const [items, setItems] = useState<Notification[]>([]);
  const [openBell, setOpenBell] = useState(false);

  useEffect(() => {
    const unsub = notificationsStore.subscribe(setItems);
    return () => { unsub(); };
  }, []);
  const unread = items.filter((n) => !n.read).length;

  // External specialists have no main-app access. They must use /external/* only.
  if (role.role === "external") return <Navigate to="/signin" replace />;


  const handleNotificationClick = (n: Notification) => {
    notificationsStore.markRead(n.id);
    setOpenBell(false);
    if (n.href) navigate(n.href);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <SidebarTrigger className="text-muted-foreground" />
            <div className="flex items-center gap-3">
              <RoleSwitcher />
              <Popover open={openBell} onOpenChange={setOpenBell}>
                <PopoverTrigger asChild>
                  <button
                    className="relative p-2 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                    aria-label="Notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {unread > 0 && (
                      <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                        {unread}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-96 p-0">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <p className="text-sm font-heading font-semibold">Notifications</p>
                    {unread > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => notificationsStore.markAllRead()}
                      >
                        <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
                      </Button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {items.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        You're all caught up.
                      </p>
                    )}
                    {items.map((n) => {
                      const Icon = NOTIFICATION_ICONS[n.kind];
                      const tone = TONE_CLASSES[n.tone];
                      return (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-secondary/50 transition-colors ${
                            !n.read ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full border ${tone.chip} shrink-0`}>
                              <Icon className={`h-3.5 w-3.5 ${tone.icon}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                {!n.read && (
                                  <span className={`mt-1.5 h-2 w-2 rounded-full ${tone.dot} shrink-0`} />
                                )}
                                <p className="text-sm font-medium text-foreground leading-snug flex-1">
                                  {n.title}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {n.createdAt}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/15 transition-colors"
                    aria-label="Account"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-60 p-0">
                  <div className="px-4 py-3 border-b">
                    <p className="text-sm font-heading font-semibold text-foreground">{role.displayName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{role.title}</p>
                  </div>
                  <div className="p-1">
                    <Link
                      to="/app/team"
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary transition-colors"
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Team & sites
                    </Link>
                    <Link
                      to="/signin"
                      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary transition-colors"
                    >
                      <LogOut className="h-4 w-4 text-muted-foreground" />
                      Sign out
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </header>
          {role.role !== "admin" && <GlobalRoleStrip role={role} />}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

function GlobalRoleStrip({ role }: { role: ReturnType<typeof useRole> }) {
  let label = "";
  if (role.role === "manager") {
    label = `Manager scope · ${role.scope.length === 1 ? role.scope[0] : role.scope.join(" + ")}`;
  } else if (role.role === "frontline") {
    label = `Frontline view · ${role.scope[0] || ""} — limited to your day-to-day actions`;
  } else if (role.role === "viewonly") {
    label = "View only — read-only across the prototype";
  }
  const tone =
    role.role === "manager" ? "bg-amber-50 text-amber-900 border-amber-200" :
    role.role === "frontline" ? "bg-emerald-50 text-emerald-900 border-emerald-200" :
    "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <div className={`border-b px-4 py-1.5 text-[11px] font-medium ${tone}`}>
      {label}
    </div>
  );
}

export default AppLayout;
