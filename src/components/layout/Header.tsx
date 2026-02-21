/**
 * Header — top bar with title and status chips.
 */

"use client";

import ConnectionStatus from "@/components/status/ConnectionStatus";

export default function Header() {
    return (
        <header className="header">
            <div className="header-left">
                <div>
                    <div className="header-title">Sky ResQ</div>
                    <div className="header-subtitle">Ground Control Station</div>
                </div>
            </div>

            <div className="header-right">
                <ConnectionStatus />
            </div>
        </header>
    );
}
