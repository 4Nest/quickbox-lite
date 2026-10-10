import { Box } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`flex size-9 items-center justify-center rounded-lg ${light ? "bg-white/15 text-white" : "bg-primary text-white"}`}
      >
        <Box className="size-5" strokeWidth={1.7} />
      </div>
      <span className="text-lg font-semibold tracking-tight">
        QuickBox
        <span
          className={`ml-1 text-xs font-normal ${light ? "text-white/55" : "text-muted-foreground"}`}
        >
          lite
        </span>
      </span>
    </div>
  );
}
