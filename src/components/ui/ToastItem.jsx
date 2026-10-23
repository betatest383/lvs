import { useState, useEffect, useRef } from "react";
import { Toast, ToastClose, ToastDescription, ToastTitle } from "@/components/ui/toast";
import { CheckCircle2, Info, AlertTriangle, XCircle, ChevronRight, ChevronDown } from "lucide-react";
import { isDevMode } from "@/lib/notify";

const variantConfig = {
  success: { icon: CheckCircle2, iconClass: "text-green-500" },
  info: { icon: Info, iconClass: "text-blue-500" },
  warning: { icon: AlertTriangle, iconClass: "text-amber-500" },
  error: { icon: XCircle, iconClass: "text-red-500" },
  destructive: { icon: XCircle, iconClass: "text-red-300" },
  default: { icon: null, iconClass: "" },
};

function useAge(createdAt, active) {
  const [age, setAge] = useState(0);
  useEffect(() => {
    if (!active || !createdAt) return;
    setAge(Math.round((Date.now() - createdAt) / 1000));
    const interval = setInterval(() => {
      setAge(Math.round((Date.now() - createdAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [createdAt, active]);
  return age;
}

function DetailsContent({ details }) {
  if (typeof details === "string") {
    return <p className="text-xs opacity-75 mt-1">{details}</p>;
  }
  if (Array.isArray(details)) {
    return (
      <ul className="text-xs opacity-75 mt-1 space-y-0.5 list-disc list-inside">
        {details.map((d, i) => <li key={i}>{String(d)}</li>)}
      </ul>
    );
  }
  if (details && typeof details === "object") {
    return (
      <dl className="text-xs opacity-75 mt-1 space-y-0.5">
        {Object.entries(details).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="font-medium opacity-80">{k}:</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return null;
}

export default function ToastItem({
  id, title, description, variant, action, details,
  duration = 5000, open, dismiss,
  sourceModule, trigger, createdAt, dismissMethod,
  ...props
}) {
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const remainingRef = useRef(duration);
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const devMode = isDevMode();
  const age = useAge(createdAt, devMode && open);

  useEffect(() => {
    if (!open || !duration || duration <= 0) return;
    startTimeRef.current = Date.now();
    remainingRef.current = duration;
    timerRef.current = setTimeout(() => dismissRef.current(id, "auto"), duration);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, duration, id]);

  const handleMouseEnter = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startTimeRef.current));
    }
  };

  const handleMouseLeave = () => {
    if (remainingRef.current <= 0) {
      dismissRef.current(id, "auto");
      return;
    }
    if (!timerRef.current && open) {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => dismissRef.current(id, "auto"), remainingRef.current);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      dismissRef.current(id, "keyboard");
    }
  };

  const config = variantConfig[variant] || variantConfig.default;
  const Icon = config.icon;
  const hasDetails = !!details;

  return (
    <Toast
      variant={variant}
      open={open}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="alert"
      aria-live="assertive"
      {...props}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {Icon && <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${config.iconClass}`} />}
        <div className="grid gap-1 flex-1 min-w-0">
          {title && <ToastTitle>{title}</ToastTitle>}
          {description && <ToastDescription>{description}</ToastDescription>}
          {hasDetails && (
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs opacity-60 hover:opacity-100 flex items-center gap-1 transition-opacity"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Details
              </button>
              {expanded && <DetailsContent details={details} />}
            </div>
          )}
          {devMode && (
            <div className="text-[10px] opacity-60 mt-2 border-t border-current/10 pt-1.5 font-mono space-y-0.5">
              <div className="flex justify-between"><span className="opacity-70">ID:</span><span>{id}</span></div>
              {sourceModule && <div className="flex justify-between"><span className="opacity-70">Module:</span><span>{sourceModule}</span></div>}
              {trigger && <div className="flex justify-between"><span className="opacity-70">Trigger:</span><span>{trigger}</span></div>}
              {createdAt && <div className="flex justify-between"><span className="opacity-70">Time:</span><span>{new Date(createdAt).toLocaleTimeString()}</span></div>}
              <div className="flex justify-between"><span className="opacity-70">Dismiss:</span><span>{dismissMethod || "—"}</span></div>
              <div className="flex justify-between"><span className="opacity-70">Lifetime:</span><span>{age}s</span></div>
            </div>
          )}
        </div>
        {action}
      </div>
      <ToastClose onClick={() => dismissRef.current(id, "manual")} />
    </Toast>
  );
}