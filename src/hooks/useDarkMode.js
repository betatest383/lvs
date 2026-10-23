import { useEffect } from 'react';

export default function useDarkMode() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = (e) => {
      document.documentElement.classList.toggle('dark', e.matches);
    };

    apply(mq);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}