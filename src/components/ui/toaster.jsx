import { useToast } from "@/components/ui/use-toast";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import ToastItem from "@/components/ui/ToastItem";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} dismiss={dismiss} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}