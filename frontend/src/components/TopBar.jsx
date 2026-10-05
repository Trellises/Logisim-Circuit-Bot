export default function TopBar({ theme, onToggleTheme }) {
    return (
        <header className="topbar">
            <div className="brand">● Logisim Circuit Bot</div>
            <div className="subtitle">CSCI-335 · build, simulate and export Logisim circuits</div>
            <button className="ghost-btn" type="button" onClick={onToggleTheme}>
                {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
            </button>
        </header>
    );
}
