import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import { Toaster, toast } from "sonner";
import {
  Box,
  LayoutDashboard,
  Folder,
  Layers,
  Settings,
  Search,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronRight,
  Home,
  RefreshCw,
  Download,
  MoreHorizontal,
  File,
  FolderOpen,
  Sun,
  Moon,
  LogOut,
  PanelLeft,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
  Eye,
  LoaderCircle,
  Play,
  Square,
  RotateCw,
  Terminal,
  Clock,
  Check,
  Copy,
  X,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Brand } from "@/components/brand";
import { AppDescription } from "@/components/app-description";
import { Login } from "@/pages/login";
import { api } from "@/lib/api";
import { size, uptime } from "@/lib/format";
import type { Session, Entry, Package, Overview, Operation } from "@/lib/types";
import "./index.css";

type Page = "overview" | "files" | "services" | "settings" | "terminal";
const icons = {
  overview: LayoutDashboard,
  files: Folder,
  services: Layers,
  settings: Settings,
  terminal: Terminal,
};
const pages: { id: Page; label: string; href: string }[] = [
  { id: "overview", label: "总览", href: "/" },
  { id: "files", label: "文件", href: "/files" },
  { id: "services", label: "应用与服务", href: "/services" },
  { id: "terminal", label: "Web 终端", href: "/terminal" },
  { id: "settings", label: "设置", href: "/settings" },
];
function currentPage(): Page {
  const p = location.pathname;
  if (p === "/terminal") return "terminal";
  return p === "/services"
    ? "services"
    : p === "/settings"
      ? "settings"
      : p === "/files" || p.includes(".downloads")
        ? "files"
        : "overview";
}
function downloadPath(user: string) {
  const alias = location.pathname.match(
    /^\/([A-Za-z0-9_-]+)\.(qbittorrent|deluge|transmission|rtorrent)\.downloads(?:\/(.*))?$/,
  );
  if (alias && alias[1] === user) {
    try {
      return `/home/${user}/torrents/${alias[2]}/${decodeURIComponent(alias[3] ?? "")}`;
    } catch {
      return "/";
    }
  }
  return new URLSearchParams(location.search).get("path") ?? "/";
}
function saved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage can be disabled by the browser. */
  }
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  percent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Cpu;
  percent?: number;
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="metric-value text-3xl font-semibold">{value}</p>
      {percent !== undefined && (
        <Progress
          value={Math.min(Math.max(percent, 0), 100)}
          className="mt-4 h-1.5"
        />
      )}
      <p className="mt-3 truncate text-xs text-muted-foreground" title={detail}>
        {detail}
      </p>
    </div>
  );
}
function PanelHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {detail && (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      {action}
    </div>
  );
}
function Traffic({ samples }: { samples: { rx: number; tx: number }[] }) {
  const max = Math.max(...samples.flatMap((s) => [s.rx, s.tx]), 1024),
    w = 720,
    h = 130;
  const line = (key: "rx" | "tx") =>
    samples
      .map(
        (s, i) =>
          `${(i / Math.max(samples.length - 1, 1)) * w},${h - (Math.max(0, s[key]) / max) * (h - 20)}`,
      )
      .join(" ");
  return (
    <div className="px-5 py-5">
      <div className="mb-6 flex flex-wrap items-center gap-8">
        <div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDown className="size-3.5 text-primary" />
            接收
          </span>
          <p className="mt-1 text-xl font-semibold">
            {size(samples.at(-1)?.rx ?? 0)}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              /s
            </span>
          </p>
        </div>
        <div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUp className="size-3.5 text-teal-600" />
            发送
          </span>
          <p className="mt-1 text-xl font-semibold">
            {size(samples.at(-1)?.tx ?? 0)}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              /s
            </span>
          </p>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          最近 {samples.length} 次采样
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h + 12}`}
        className="h-36 w-full"
        role="img"
        aria-label="网络接收与发送速率图"
      >
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="0"
            x2={w}
            y1={(i * h) / 3}
            y2={(i * h) / 3}
            stroke="var(--border)"
            strokeDasharray="4 6"
          />
        ))}
        <polyline
          points={line("rx")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
        />
        <polyline
          points={line("tx")}
          fill="none"
          stroke="#29988d"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [initialError, setInitialError] = useState("");
  const [terminalVersion, setTerminalVersion] = useState(0);
  const [page, setPage] = useState<Page>(currentPage),
    [overview, setOverview] = useState<Overview | null>(null),
    [packages, setPackages] = useState<Package[]>([]),
    [samples, setSamples] = useState<{ rx: number; tx: number }[]>([]);
  const [dark, setDark] = useState(() => saved("quickbox.dark", false)),
    [sidebar, setSidebar] = useState(false),
    [search, setSearch] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null),
    [busy, setBusy] = useState(false),
    [output, setOutput] = useState(""),
    [logOpen, setLogOpen] = useState(false);
  const [filePath, setFilePath] = useState("/"),
    [entries, setEntries] = useState<Entry[]>([]),
    [fileBusy, setFileBusy] = useState(false),
    [fileError, setFileError] = useState(""),
    [hidden, setHidden] = useState(() => saved("quickbox.hidden", false)),
    [sort, setSort] = useState<"name" | "size" | "date">("name"),
    [descending, setDescending] = useState(false);
  const [pathInput, setPathInput] = useState("/");
  const [deleteEntry, setDeleteEntry] = useState<Entry | null>(null),
    [deleting, setDeleting] = useState(false);
  const socketRef = useRef<Socket | null>(null),
    fileRequest = useRef(0),
    userRef = useRef(session?.user);
  userRef.current = session?.user;
  const loadServices = useCallback(async () => {
    const data = await api<{ packages: Package[] }>("/services");
    setPackages(data.packages);
  }, []);
  const loadOverview = useCallback(async () => {
    const data = await api<Overview>("/overview");
    setOverview(data);
    setSamples((value) =>
      [
        ...value,
        {
          rx: data.network.reduce((s, n) => s + Math.max(0, n.rx), 0),
          tx: data.network.reduce((s, n) => s + Math.max(0, n.tx), 0),
        },
      ].slice(-30),
    );
  }, []);
  const loadFiles = useCallback(async (path: string) => {
    const request = ++fileRequest.current;
    setFileBusy(true);
    setFileError("");
    setPathInput(path);
    try {
      const data = await api<{ path: string; entries: Entry[] }>(
        `/files?path=${encodeURIComponent(path)}`,
      );
      if (request !== fileRequest.current) return;
      setEntries(data.entries);
      setFilePath(data.path);
      setPathInput((value) => value === path ? data.path : value);
    } catch (error) {
      if (request === fileRequest.current) {
        setEntries([]);
        setFileError((error as Error).message);
      }
    } finally {
      if (request === fileRequest.current) setFileBusy(false);
    }
  }, []);
  useEffect(() => {
    void api<Session>("/auth/session")
      .then(setSession)
      .catch((e) => setInitialError((e as Error).message));
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    persist("quickbox.dark", dark);
  }, [dark]);
  useEffect(() => {
    persist("quickbox.hidden", hidden);
  }, [hidden]);
  useEffect(() => {
    const expired = () => {
      setSession((old) => (old ? { ...old, user: null } : old));
      socketRef.current?.disconnect();
      toast.error("登录已过期，请重新登录。");
    };
    window.addEventListener("quickbox:expired", expired);
    return () => window.removeEventListener("quickbox:expired", expired);
  }, []);
  useEffect(() => {
    const pop = () => {
      setPage(currentPage());
      if (userRef.current) void loadFiles(downloadPath(userRef.current));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [loadFiles]);
  useEffect(() => {
    if (!session?.user) return;
    const refresh = () => {
      void loadOverview().catch((e) => toast.error(e.message));
      void loadServices().catch((e) => toast.error(e.message));
    };
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10000);
    const socket = io({
      path: "/ws/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.on(
      "exec",
      (result: {
        success: boolean;
        stdout: string;
        stderr: string;
        message: string;
      }) => {
        setBusy(false);
        setOutput(
          [result.stdout, result.stderr, result.message]
            .filter(Boolean)
            .join("\n"),
        );
        setLogOpen(true);
        result.success
          ? toast.success("操作已完成")
          : toast.error("操作失败，请查看输出日志");
        refresh();
      },
    );
    socket.on("connect_error", () => {
      setBusy(false);
    });
    socket.on("disconnect", () => {
      setBusy(false);
    });
    return () => {
      clearInterval(interval);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.user, loadOverview, loadServices]);
  useEffect(() => {
    if (page === "files" && session?.user)
      void loadFiles(downloadPath(session.user));
  }, [page, session?.user, loadFiles]);
  function navigate(id: Page, path?: string) {
    history.pushState(
      {},
      "",
      pages.find((p) => p.id === id)?.href +
        (path ? `?path=${encodeURIComponent(path)}` : ""),
    );
    setPage(id);
    setSearch("");
    setSidebar(false);
    if (id === "files") void loadFiles(path ?? "/");
  }
  function openFolder(path: string) {
    history.pushState({}, "", `/files?path=${encodeURIComponent(path)}`);
    void loadFiles(path);
  }
  async function removeEntry() {
    if (!deleteEntry || deleting) return;
    setDeleting(true);
    try {
      await api<{ ok: boolean }>("/files", {
        method: "DELETE",
        body: JSON.stringify({ path: deleteEntry.path }),
      });
      setDeleteEntry(null);
      toast.success("已删除");
      await loadFiles(filePath);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  async function logout() {
    try {
      const result = await api<{ redirect: string }>("/auth/logout", {
        method: "POST",
        body: "{}",
      });
      socketRef.current?.disconnect();
      setSession((old) => (old ? { ...old, user: null } : old));
      setOverview(null);
      setEntries([]);
      history.replaceState({}, "", "/login");
      if (result.redirect !== "/login") location.href = result.redirect;
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  function run() {
    if (!operation || busy) return;
    if (!socketRef.current?.connected) {
      toast.error("服务连接已断开，请刷新后重试。");
      return;
    }
    setBusy(true);
    setOutput(`正在执行：${operation.title}\n`);
    socketRef.current.emit("exec", operation.command);
    setOperation(null);
    setLogOpen(true);
  }
  async function readLog() {
    try {
      const result = await api<{ content: string }>("/log");
      setOutput(result.content || "暂无日志。");
      setLogOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  if (!session)
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-center">
          <Brand />
          {initialError ? (
            <>
              <p role="alert" className="my-5 text-sm text-destructive">
                {initialError}
              </p>
              <Button onClick={() => location.reload()}>重试</Button>
            </>
          ) : (
            <LoaderCircle className="mx-auto mt-6 size-5 animate-spin text-primary" />
          )}
        </div>
      </div>
    );
  if (!session.user)
    return (
      <Login
        onLogin={(value) => {
          setSession(value);
          setPage("overview");
        }}
      />
    );
  const title = pages.find((p) => p.id === page)?.label ?? "总览";
  const installed = packages.filter((p) => p.installed),
    active = installed
      .flatMap((p) => p.services)
      .filter((s) => s.running).length;
  const filteredPackages = packages.filter((p) =>
    `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  const shownEntries = entries
    .filter(
      (e) =>
        (hidden || !e.name.startsWith(".")) &&
        e.name.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      if (a.directory !== b.directory)
        return Number(b.directory) - Number(a.directory);
      const order =
        sort === "size"
          ? a.size - b.size
          : sort === "date"
            ? new Date(a.modified).getTime() - new Date(b.modified).getTime()
            : a.name.localeCompare(b.name, "zh-CN", { numeric: true });
      return descending ? -order : order;
    });
  const crumbs = filePath.split("/").filter(Boolean);
  const sortBy = (value: "name" | "size" | "date") => {
    setDescending(sort === value ? !descending : false);
    setSort(value);
  };
  return (
    <div className="min-h-svh lg:pl-[236px]">
      {sidebar && (
        <button
          aria-label="关闭导航"
          className="fixed inset-y-0 right-0 left-[236px] z-30 bg-black/25 lg:hidden"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r bg-card p-5 transition-transform lg:translate-x-0 ${sidebar ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="收起导航"
          className="absolute top-5 right-2 lg:hidden"
          onClick={() => setSidebar(false)}
        >
          <X />
        </Button>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          className="mb-10 mt-1"
        >
          <Brand />
        </a>
        <p className="mb-3 px-3 text-xs text-muted-foreground">工作空间</p>
        <nav className="space-y-1">
          {pages.map((p) => {
            const Icon = icons[p.id];
            return (
              <a
                key={p.id}
                href={p.href}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(p.id);
                }}
                aria-current={page === p.id ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${page === p.id ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                <Icon className="size-[18px]" />
                {p.label}
                {p.id === "services" && (
                  <span className="ml-auto rounded bg-background px-1.5 text-xs">
                    {installed.length}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="mt-8 px-3">
          <p className="mb-4 text-xs text-muted-foreground">快捷访问</p>
          {["qbittorrent", "deluge", "transmission", "rtorrent"]
            .filter((client) => installed.some((p) => p.package === client))
            .map((client) => (
              <button
                key={client}
                className="mb-3 flex w-full items-center gap-2.5 text-left text-xs text-muted-foreground hover:text-primary"
                onClick={() =>
                  navigate("files", `/home/${session.user}/torrents/${client}`)
                }
              >
                <Folder className="size-3.5" />
                {client} 下载
              </button>
            ))}
        </div>
        <div className="mt-auto">
          <div className="mb-4 rounded-lg border bg-background p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <Server className="size-3.5 text-primary" />
              <span className="truncate">
                {overview?.hostname ?? "正在连接服务器…"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                className={`size-1.5 rounded-full ${overview ? "bg-teal-500" : "bg-gray-400"}`}
              />
              {overview ? "连接正常" : "等待数据"}
              <span className="ml-auto">{overview?.arch}</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">
              {overview?.config.version ?? "QuickBox Lite"}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="切换明暗主题"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex h-[72px] w-full min-w-0 items-center justify-between gap-4 border-b bg-card/95 px-5 backdrop-blur-sm lg:px-8">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="打开导航"
            onClick={() => setSidebar(true)}
          >
            <PanelLeft />
          </Button>
          <span className="hidden text-sm text-muted-foreground sm:block">
            工作空间
          </span>
          <ChevronRight className="hidden size-3.5 text-muted-foreground sm:block" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="搜索当前页面"
              placeholder={page === "files" ? "搜索文件…" : "搜索应用…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-48 border-none bg-background pl-9 lg:w-60"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-1">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {session.user.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden text-sm md:block">{session.user}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("settings")}>
                <Settings />
                设置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDark(!dark)}>
                {dark ? <Sun /> : <Moon />}切换明暗主题
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="w-full min-w-0 p-5 lg:p-8">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {page === "overview"
                ? "服务器总览"
                : page === "files"
                  ? "文件空间"
                  : title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {page === "overview"
                ? "系统、下载与服务的实时状态。"
                : page === "files"
                  ? "浏览服务器目录，查找和下载你的文件。"
                  : page === "services"
                    ? "管理已安装应用和后台服务。"
                    : "让工作空间适合你的使用习惯。"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {page !== "settings" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (page === "files") void loadFiles(filePath);
                  else {
                    void loadOverview().catch((e) => toast.error(e.message));
                    void loadServices().catch((e) => toast.error(e.message));
                  }
                }}
              >
                <RefreshCw className={fileBusy ? "animate-spin" : ""} />
                刷新
              </Button>
            )}
            {page === "overview" && (
              <Button size="sm" onClick={() => navigate("files")}>
                <FolderOpen />
                浏览文件
              </Button>
            )}
          </div>
        </div>
        {page === "overview" && (
          <>
            {!overview ? (
              <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                正在读取服务器状态…
              </div>
            ) : (
              <>
                <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric
                    label="CPU 使用率"
                    value={`${overview.cpu.percent.toFixed(1)}%`}
                    detail={`${overview.cpu.cores} 核 · ${overview.cpu.model}`}
                    icon={Cpu}
                    percent={overview.cpu.percent}
                  />
                  <Metric
                    label="内存"
                    value={size(overview.memory.used)}
                    detail={`共 ${size(overview.memory.total)} · ${Math.round((overview.memory.used / overview.memory.total) * 100)}% 已使用`}
                    icon={MemoryStick}
                    percent={
                      (overview.memory.used / overview.memory.total) * 100
                    }
                  />
                  <Metric
                    label="根目录磁盘"
                    value={
                      overview.disk
                        ? `${overview.disk.percent.toFixed(1)}%`
                        : "暂无数据"
                    }
                    detail={
                      overview.disk
                        ? `${size(overview.disk.used)} / ${size(overview.disk.total)}`
                        : "检查磁盘挂载状态"
                    }
                    icon={HardDrive}
                    percent={overview.disk?.percent}
                  />
                  <Metric
                    label="运行时间"
                    value={uptime(overview.uptime)}
                    detail={`${active} 个服务正在运行`}
                    icon={Clock}
                  />
                </div>
                <div className="mb-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
                  <section className="overflow-hidden rounded-xl border bg-card">
                    <PanelHeading
                      title="网络流量"
                      detail={
                        overview.network.map((n) => n.iface).join("、") ||
                        "暂无网卡数据"
                      }
                      action={
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="size-1.5 rounded-full bg-teal-500" />
                          每 10 秒更新
                        </span>
                      }
                    />
                    <Traffic samples={samples} />
                  </section>
                  <section className="rounded-xl border bg-card">
                    <PanelHeading title="服务器信息" />
                    <dl className="space-y-5 p-5 text-sm">
                      {[
                        ["主机名", overview.hostname],
                        ["操作系统", overview.system],
                        ["架构", overview.arch],
                        ["面板版本", overview.config.version],
                        ["当前用户", session.user],
                      ].map(([k, v]) => (
                        <div className="flex justify-between gap-4" key={k}>
                          <dt className="shrink-0 text-muted-foreground">
                            {k}
                          </dt>
                          <dd className="text-right">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>
                <section className="mb-6 rounded-xl border bg-card">
                  <PanelHeading
                    title="应用入口"
                    detail="打开应用，继续你的工作。"
                    action={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("services")}
                      >
                        管理应用
                        <ChevronRight />
                      </Button>
                    }
                  />
                  <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {overview.menu.installedMenuEntries
                      .filter((app) =>
                        app.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((app) => (
                        <a
                          href={app.url.replaceAll(
                            "$username$",
                            session.user ?? "",
                          )}
                          key={app.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg border px-4 py-4 hover:border-primary/40 hover:bg-accent/40"
                        >
                          <div className="flex size-10 items-center justify-center rounded-lg bg-background">
                            {app.logo ? (
                              <img src={app.logo} className="size-6 object-contain" alt="" />
                            ) : (
                              <Box className="size-5 text-primary" />
                            )}
                          </div>
                          <div>
                            <span className="text-sm font-medium">
                              {app.name}
                            </span>
                            <p className="mt-1 text-xs text-muted-foreground">
                              打开应用
                            </p>
                          </div>
                          <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                        </a>
                      ))}
                    {!overview.menu.installedMenuEntries.length && (
                      <div className="p-4 text-sm text-muted-foreground">
                        尚未安装应用。前往“应用与服务”添加。
                      </div>
                    )}
                  </div>
                </section>
                <section className="rounded-xl border bg-card">
                  <PanelHeading
                    title="常用目录"
                    action={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("files")}
                      >
                        整机文件
                        <ChevronRight />
                      </Button>
                    }
                  />
                  <div className="grid gap-4 p-5 md:grid-cols-3">
                    {[
                      ["服务器根目录", "/"],
                      ["用户下载目录", `/home/${session.user}/torrents`],
                      ["服务目录", "/srv"],
                    ].map(([name, path]) => (
                      <button
                        key={path}
                        className="flex items-center gap-3 rounded-lg bg-background p-4 text-left hover:bg-accent"
                        onClick={() => navigate("files", path)}
                      >
                        <Folder className="size-6 text-primary" />
                        <div>
                          <p className="text-sm font-medium">{name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {path}
                          </p>
                        </div>
                        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </section>
              </>
            )}
          </>
        )}
        {page === "files" && (
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <nav
                aria-label="文件路径"
                className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="根目录"
                  onClick={() => openFolder("/")}
                >
                  <Home />
                </Button>
                {crumbs.map((crumb, i) => (
                  <React.Fragment key={i}>
                    <ChevronRight className="size-3 text-muted-foreground" />
                    <button
                      className="max-w-44 truncate rounded px-1.5 py-1 hover:bg-muted"
                      onClick={() =>
                        openFolder("/" + crumbs.slice(0, i + 1).join("/"))
                      }
                    >
                      {crumb}
                    </button>
                  </React.Fragment>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {shownEntries.length} 项
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings />
                      显示选项
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setHidden(!hidden)}>
                      {hidden ? <Check /> : <Eye />}显示隐藏文件
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => sortBy("name")}>
                      按名称排序
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => sortBy("size")}>
                      按大小排序
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => sortBy("date")}>
                      按时间排序
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <form
              className="flex gap-2 border-b bg-background/50 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                openFolder(pathInput);
              }}
            >
              <Input
                aria-label="目录路径"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                className="h-9 bg-card"
              />
              <Button variant="outline" size="sm" type="submit">
                前往
              </Button>
            </form>
            <div className="border-b px-4 py-3 sm:hidden">
              <Input
                aria-label="搜索文件"
                placeholder="搜索文件…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="relative">
              <Table>
                <TableHeader>
                  <TableRow className="bg-background/60 hover:bg-background/60">
                    <TableHead className="w-[50%] pl-5">
                      <button
                        className="flex items-center gap-1"
                        onClick={() => sortBy("name")}
                      >
                        名称
                        {sort === "name" &&
                          (descending ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUp className="size-3" />
                          ))}
                      </button>
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      <button onClick={() => sortBy("size")}>大小</button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      <button onClick={() => sortBy("date")}>修改时间</button>
                    </TableHead>
                    <TableHead className="w-20 text-right pr-5">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filePath !== "/" && (
                    <TableRow>
                      <TableCell colSpan={4} className="pl-5">
                        <button
                          className="flex items-center gap-3 py-1 text-sm text-muted-foreground"
                          onClick={() =>
                            openFolder("/" + crumbs.slice(0, -1).join("/"))
                          }
                        >
                          <FolderOpen className="size-5 text-primary" />
                          返回上级目录
                        </button>
                      </TableCell>
                    </TableRow>
                  )}
                  {shownEntries.map((entry) => (
                    <TableRow key={entry.path}>
                      <TableCell className="max-w-0 pl-5">
                        <button
                          className="flex w-full min-w-0 items-center gap-3 py-1.5 text-left"
                          onClick={() =>
                            entry.directory
                              ? openFolder(entry.path)
                              : window.open(
                                  `/console/api/files/download?path=${encodeURIComponent(entry.path)}`,
                                  "_blank",
                                  "noopener",
                                )
                          }
                        >
                          {entry.directory ? (
                            <Folder className="size-5 shrink-0 fill-primary/10 text-primary" />
                          ) : (
                            <File className="size-5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="truncate text-sm" title={entry.name}>
                            {entry.name}
                          </span>
                          {entry.symlink && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px]"
                            >
                              链接
                            </Badge>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {entry.directory ? "—" : size(entry.size)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {new Date(entry.modified).toLocaleString("zh-CN", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${entry.name} 的操作`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {entry.directory ? (
                              <DropdownMenuItem
                                onClick={() => openFolder(entry.path)}
                              >
                                <FolderOpen />
                                打开目录
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem asChild>
                                <a
                                  href={`/console/api/files/download?path=${encodeURIComponent(entry.path)}`}
                                >
                                  <Download />
                                  下载文件
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(entry.path)
                                  .then(() => toast.success("路径已复制"))
                                  .catch(() =>
                                    toast.error(
                                      "无法复制，请从地址栏复制路径。",
                                    ),
                                  );
                              }}
                            >
                              <Copy />
                              复制路径
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={!entry.deletable || deleting}
                              onClick={() => setDeleteEntry(entry)}
                            >
                              <Trash2 />
                              删除{entry.directory ? "空目录" : "文件"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!fileBusy && !shownEntries.length && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                          <FolderOpen className="size-10" />
                          <p
                            role={fileError ? "alert" : undefined}
                            className="text-sm"
                          >
                            {fileError ||
                              (search
                                ? "没有匹配的文件，试试其他关键词。"
                                : "这个目录还没有文件。")}
                          </p>
                          {fileError && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void loadFiles(filePath)}
                            >
                              重试
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {fileBusy && (
                <div className="absolute inset-0 flex min-h-40 items-center justify-center bg-card/80">
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                  <span className="ml-2 text-sm">正在读取目录…</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
              <span>
                {shownEntries.filter((e) => e.directory).length} 个目录，
                {shownEntries.filter((e) => !e.directory).length} 个文件
              </span>
              <span>
                {size(
                  shownEntries
                    .filter((e) => !e.directory)
                    .reduce((sum, e) => sum + e.size, 0),
                )}
              </span>
            </div>
          </section>
        )}
        {page === "services" && (
          <Tabs defaultValue="installed">
            <TabsList className="mb-5">
              <TabsTrigger value="installed">
                已安装 {installed.length}
              </TabsTrigger>
              <TabsTrigger value="available">可安装应用</TabsTrigger>
            </TabsList>
            <TabsContent value="installed">
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filteredPackages
                  .filter((p) => p.installed)
                  .map((pkg) => (
                    <section
                      key={pkg.package}
                      className="rounded-xl border bg-card p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                            <Layers className="size-5 text-primary" />
                          </div>
                          <h3 className="text-sm font-semibold">{pkg.name}</h3>
                        </div>
                        <Badge variant="secondary">已安装</Badge>
                      </div>
                      <p className="mt-4 mb-5 text-xs leading-5 text-muted-foreground">
                        <AppDescription description={pkg.description} />
                      </p>
                      {pkg.services.map((service) => (
                        <div
                          key={service.key}
                          className="flex flex-wrap items-center justify-between gap-3 border-t py-3"
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <span
                              className={`size-1.5 rounded-full ${service.running ? "bg-teal-500" : "bg-gray-400"}`}
                            />
                            {service.name}
                            <span className="text-xs text-muted-foreground">
                              {service.running ? "运行中" : "已停止"}
                            </span>
                          </span>
                          <div className="flex gap-1">
                            {service.running ? (
                              <>
                                <Button
                                  disabled={busy}
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`重启 ${service.name}`}
                                  onClick={() =>
                                    setOperation({
                                      title: `重启 ${service.name}`,
                                      detail: "服务会短暂中断，随后重新启动。",
                                      command: `systemctl:restart:${service.key}`,
                                    })
                                  }
                                >
                                  <RotateCw />
                                </Button>
                                <Button
                                  disabled={busy}
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`停止 ${service.name}`}
                                  onClick={() =>
                                    setOperation({
                                      title: `停止 ${service.name}`,
                                      detail:
                                        "该服务将停止运行，相关应用可能暂时不可用。",
                                      command: `systemctl:stop:${service.key}`,
                                    })
                                  }
                                >
                                  <Square />
                                </Button>
                              </>
                            ) : (
                              <Button
                                disabled={busy}
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setOperation({
                                    title: `启动 ${service.name}`,
                                    detail: "启动此后台服务。",
                                    command: `systemctl:start:${service.key}`,
                                  })
                                }
                              >
                                <Play />
                                启动
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      {!pkg.services.length && (
                        <span className="text-xs text-muted-foreground">
                          此应用没有独立的后台服务。
                        </span>
                      )}
                    </section>
                  ))}
              </div>
              {!installed.length && (
                <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
                  尚未安装应用，切换到“可安装应用”开始。
                </div>
              )}
            </TabsContent>
            <TabsContent value="available">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredPackages
                  .filter((p) => !p.installed && p.installable)
                  .map((pkg) => (
                    <section
                      key={pkg.package}
                      className="flex flex-col rounded-xl border bg-card p-5"
                    >
                      <h3 className="text-sm font-semibold">{pkg.name}</h3>
                      <p className="mt-3 mb-5 flex-1 text-xs leading-5 text-muted-foreground">
                        <AppDescription description={pkg.description} />
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          setOperation({
                            title: `安装 ${pkg.name}`,
                            detail:
                              "会下载并安装此应用。安装过程可能需要几分钟，可在输出日志中查看进度。",
                            command: `installpackage::${pkg.package}`,
                          })
                        }
                      >
                        安装应用
                      </Button>
                    </section>
                  ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
        {page === "terminal" && (
          <section className="overflow-hidden rounded-xl border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">Web 终端</h2>
                <p className="mt-1 text-xs text-muted-foreground">当前账号：{session.user}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTerminalVersion(v => v + 1)}>
                <RefreshCw /> 重新连接
              </Button>
            </div>
            {overview?.menu.showWebConsole ? (
              <iframe key={terminalVersion} title="Web 终端" src="/terminal/session/"
                className="block h-[calc(100dvh-17rem)] min-h-80 w-full border-0 bg-black" />
            ) : (
              <div className="p-12 text-center text-sm text-muted-foreground">
                {overview ? "Web 终端服务未运行，请在应用与服务中检查 ttyd。" : "正在连接…"}
              </div>
            )}
          </section>
        )}
        {page === "settings" && (
          <div className="max-w-3xl space-y-5">
            <section className="rounded-xl border bg-card">
              <PanelHeading title="外观与文件" />
              <div className="divide-y px-5">
                <div className="flex items-center justify-between gap-4 py-5">
                  <div>
                    <p className="text-sm font-medium">深色模式</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      面板、文件页和登录页使用同一主题。
                    </p>
                  </div>
                  <Switch
                    aria-label="深色模式"
                    checked={dark}
                    onCheckedChange={setDark}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 py-5">
                  <div>
                    <p className="text-sm font-medium">显示隐藏文件</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      显示名称以点开头的文件和目录。
                    </p>
                  </div>
                  <Switch
                    aria-label="显示隐藏文件"
                    checked={hidden}
                    onCheckedChange={setHidden}
                  />
                </div>
              </div>
            </section>
            <section className="rounded-xl border bg-card">
              <PanelHeading title="账号与登录" />
              <div className="space-y-5 p-5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">当前账号</span>
                  <span>{session.user}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">认证方式</span>
                  <span>密码与浏览器会话</span>
                </div>
                <p className="text-xs leading-6 text-muted-foreground">
                  勾选“记住密码”后，下次打开浏览器会保持登录。
                  退出登录会立即撤销当前浏览器的会话。
                </p>
                <Button variant="outline" size="sm" onClick={logout}>
                  <LogOut />
                  退出当前账号
                </Button>
              </div>
            </section>
            <section className="rounded-xl border bg-card">
              <PanelHeading title="维护与日志" />
              <div className="flex flex-wrap gap-3 p-5">
                <Button variant="outline" size="sm" onClick={readLog}>
                  <Terminal />
                  查看输出日志
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    setOperation({
                      title: "修复软件包",
                      detail: "检查并修复系统软件包安装状态。",
                      command: "box:fix:dpkg",
                    })
                  }
                >
                  修复软件包
                </Button>
              </div>
            </section>
          </div>
        )}
        <footer className="mt-8 flex justify-between gap-3 text-[11px] text-muted-foreground">
          <span>QuickBox Lite</span>
          <span>
            {overview
              ? `${overview.hostname} · ${overview.config.version}`
              : "正在连接"}
          </span>
        </footer>
      </main>
      <Dialog
        open={!!operation}
        onOpenChange={(open) => {
          if (!open) setOperation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{operation?.title}</DialogTitle>
            <DialogDescription>{operation?.detail}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOperation(null)}>
              取消
            </Button>
            <Button disabled={busy} onClick={run}>
              确认操作
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteEntry}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteEntry(null); }}
      >
        <DialogContent showCloseButton={!deleting} onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("cancel-file-delete")?.focus();
        }}>
          <DialogHeader>
            <DialogTitle>删除{deleteEntry?.directory ? "空目录" : "文件"}？</DialogTitle>
            <DialogDescription>
              此操作无法撤销。{deleteEntry?.directory ? "只能删除空目录。" : "正在做种或下载的文件被删除后，相关任务可能受影响。"}
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-lg bg-muted p-3 text-sm">{deleteEntry?.path}</p>
          <DialogFooter>
            <Button id="cancel-file-delete" variant="outline" disabled={deleting} onClick={() => setDeleteEntry(null)}>取消</Button>
            <Button variant="destructive" disabled={deleting} onClick={removeEntry}>
              {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {deleting ? "正在删除…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>输出日志</DialogTitle>
            <DialogDescription>
              {busy ? "操作正在执行，请等待结果。" : "查看最近操作的执行结果。"}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] min-h-40 overflow-auto rounded-lg bg-[#182236] p-5 font-mono text-xs leading-6 whitespace-pre-wrap text-slate-200">
            {output}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={readLog}>
              <RefreshCw />
              刷新日志
            </Button>
            <Button onClick={() => setLogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
      <Toaster position="bottom-right" richColors />
    </TooltipProvider>
  </React.StrictMode>,
);
