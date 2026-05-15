/**
 * SystemWarningBanner — top-of-app banner stack for non-fatal startup
 * problems (e.g. UDP port already in use). Dismissible per-message.
 */

"use client";

import { useSystemWarningsStore } from "@/store/systemWarningsStore";

export default function SystemWarningBanner() {
    const warnings = useSystemWarningsStore((s) => s.warnings);
    const dismiss = useSystemWarningsStore((s) => s.dismiss);

    if (warnings.length === 0) return null;

    return (
        <div className="system-warnings">
            {warnings.map((w) => (
                <div
                    key={w.id}
                    className={`system-warning system-warning--${w.severity}`}
                    role="alert"
                >
                    <div className="system-warning__icon">
                        {w.severity === "error" ? "⛔" : "⚠️"}
                    </div>
                    <div className="system-warning__body">
                        <div className="system-warning__title">{w.title}</div>
                        <div className="system-warning__message">{w.message}</div>
                        {w.hint && (
                            <div className="system-warning__hint"><code>{w.hint}</code></div>
                        )}
                    </div>
                    <button
                        className="system-warning__close"
                        onClick={() => dismiss(w.id)}
                        aria-label="Dismiss"
                    >✕</button>
                </div>
            ))}
        </div>
    );
}
