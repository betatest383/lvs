import { toast } from "@/components/ui/use-toast";

const defaultTitles = {
  success: "Success",
  info: "Information",
  warning: "Warning",
  error: "Error",
};

let devMode = false;
try {
  devMode = typeof localStorage !== "undefined" && localStorage.getItem("lvc_notify_dev_mode") === "true";
} catch (e) {}

export function isDevMode() {
  return devMode;
}

export function setDevMode(enabled) {
  devMode = !!enabled;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("lvc_notify_dev_mode", String(devMode));
    }
  } catch (e) {}
}

function create(variant) {
  return (message, options = {}) => {
    const opts = typeof message === "string"
      ? { description: message, ...options }
      : { ...message };
    return toast({
      variant,
      title: opts.title || defaultTitles[variant],
      ...opts,
    });
  };
}

export const notify = {
  success: create("success"),
  info: create("info"),
  warning: create("warning"),
  error: create("error"),
  show: (options = {}) => toast(options),
  dismissAll: () => toast.dismissAll(),
};

export default notify;