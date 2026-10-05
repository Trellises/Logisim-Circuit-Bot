import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'logisim-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readSavedTheme() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === 'dark' || saved === 'light' ? saved : null;
    } catch {
        return null;
    }
}

function systemTheme() {
    return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

// Theme order of precedence: the user's saved toggle choice, then a theme the
// host page already set on <html>, then the OS light/dark setting.
export function useTheme() {
    const [chosen, setChosen] = useState(() => (
        readSavedTheme() ?? document.documentElement.getAttribute('data-theme')
    ));
    const [system, setSystem] = useState(systemTheme);

    useEffect(() => {
        const mq = window.matchMedia?.(DARK_QUERY);
        if (!mq) return undefined;
        const onChange = () => setSystem(systemTheme());
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
    }, []);

    useEffect(() => {
        if (chosen) document.documentElement.setAttribute('data-theme', chosen);
    }, [chosen]);

    const theme = chosen ?? system;

    const toggleTheme = useCallback(() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setChosen(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked */ }
    }, [theme]);

    return { theme, toggleTheme };
}
