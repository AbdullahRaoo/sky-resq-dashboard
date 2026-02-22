/**
 * TitleBar — custom window controls for the frameless Electron window.
 * Draggable title area + minimize/maximize/close buttons.
 */

"use client";

export default function TitleBar() {
    const handleMinimize = () => window.electron?.minimize();
    const handleMaximize = () => window.electron?.maximize();
    const handleClose = () => window.electron?.close();

    return (
        <div className="title-bar">
            <div className="title-bar__drag">
                <svg className="title-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                </svg>
                <span className="title-bar__text">Sky ResQ — Ground Control Station</span>
            </div>

            <div className="title-bar__controls">
                <button
                    className="title-bar__btn"
                    onClick={handleMinimize}
                    aria-label="Minimize"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect y="5" width="12" height="1.5" fill="currentColor" rx="0.5" />
                    </svg>
                </button>
                <button
                    className="title-bar__btn"
                    onClick={handleMaximize}
                    aria-label="Maximize"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <rect x="1" y="1" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" rx="1" />
                    </svg>
                </button>
                <button
                    className="title-bar__btn title-bar__btn--close"
                    onClick={handleClose}
                    aria-label="Close"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12">
                        <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
