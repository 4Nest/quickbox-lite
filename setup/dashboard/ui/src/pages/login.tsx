import React, { useState } from "react";
import {
  Server,
  ShieldCheck,
  FolderOpen,
  Folder,
  Layers,
  Network,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Brand } from "@/components/brand";
import { api } from "@/lib/api";
import type { Session } from "@/lib/types";
export function Login({
  onLogin,
}: {
  onLogin: (session: Session) => void;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(true),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const value = await api<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, remember }),
      });
      setPassword("");
      const next = new URLSearchParams(location.search).get("next");
      if (next && /^\/[A-Za-z0-9_-]+\.(qbittorrent|deluge|transmission|rtorrent)\.downloads(?:\/|$)/.test(next)) {
        location.assign(next);
        return;
      }
      onLogin(value);
      history.replaceState({}, "", "/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="login-grid relative hidden flex-col justify-between overflow-hidden bg-[#233c66] p-12 text-white lg:flex">
        <Brand light />
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-8 flex items-center gap-2 text-sm text-blue-200">
            <Server className="size-4" />
            你的服务器工作空间
          </div>
          <h1 className="text-5xl leading-[1.2] font-medium tracking-tight">
            运行状态。
            <br />
            每一份文件。
            <br />
            尽在掌握。
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-white/65">
            从下载目录到系统服务，一个控制台让日常管理更清晰。
          </p>
          <div className="mt-12 rounded-xl border border-white/15 bg-white/5 p-5">
            <div className="mb-5 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <FolderOpen className="size-4" />
                服务器文件
              </span>
              <span className="text-white/40">/home</span>
            </div>
            {["下载与媒体", "应用与服务", "磁盘与网络"].map((text, i) => (
              <div
                key={text}
                className="flex items-center justify-between border-t border-white/10 py-3 text-sm"
              >
                <span className="flex items-center gap-3">
                  <span className="h-6 w-px bg-white/20" />
                  <span className="text-white/70">{text}</span>
                </span>
                {i === 0 ? (
                  <Folder className="size-4 text-blue-200" />
                ) : i === 1 ? (
                  <Layers className="size-4 text-blue-200" />
                ) : (
                  <Network className="size-4 text-blue-200" />
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-white/40">QuickBox Lite · 服务器管理</p>
      </aside>
      <main className="flex flex-col justify-between bg-card p-6 sm:p-10">
        <div className="lg:invisible">
          <Brand />
        </div>
        <div className="mx-auto w-full max-w-[360px] py-12">
          <div className="mb-7 flex size-11 items-center justify-center rounded-xl border bg-background">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">欢迎回来</h2>
          <p className="mt-2 mb-8 text-sm text-muted-foreground">
            登录以管理你的服务器和文件。
          </p>
          
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username">用户名</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="QuickBox 管理员账号"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
                    className="h-11 pr-11"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1"
                    aria-label={visible ? "隐藏密码" : "显示密码"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={remember}
                  onCheckedChange={(value) => setRemember(value === true)}
                />
                <Label htmlFor="remember" className="font-normal">
                  记住我，保持登录 30 天
                </Label>
              </div>
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <Button
                disabled={busy}
                className="mt-2 h-11 w-full"
                type="submit"
              >
                {busy && <LoaderCircle className="animate-spin" />}
                {busy ? "正在登录…" : "登录控制台"}
              </Button>
            </form>

          <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            使用服务器管理员账号。登录状态保存在此浏览器，可随时退出。
          </p>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          QuickBox Lite
        </p>
      </main>
    </div>
  );
}
