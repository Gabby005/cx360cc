/**
 * Applies the saved dark/light preference before the page paints, so
 * there's no flash of the wrong theme. This has to be a raw inline
 * <script>, not a useEffect in a client component — an effect only runs
 * after React hydrates, which is exactly the flash this exists to avoid.
 */
export function ThemeInit() {
  const script = `
    try {
      const saved = localStorage.getItem('cx360-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved ? saved === 'dark' : prefersDark;
      if (isDark) document.documentElement.classList.add('dark');
    } catch (e) {}
  `;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
