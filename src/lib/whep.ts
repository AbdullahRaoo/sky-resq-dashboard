/**
 * Minimal WHEP (WebRTC-HTTP Egress Protocol) client for the Pi's mediamtx
 * stream. Following draft-ietf-wish-whep:
 *   1. POST our SDP offer to the WHEP endpoint with Content-Type: application/sdp
 *   2. Server responds 201 Created with body = SDP answer and Location header
 *      pointing at the session resource (used for DELETE on teardown).
 *
 * Returns the active RTCPeerConnection so the caller can stop / cleanup.
 */

export interface WhepSession {
    pc: RTCPeerConnection;
    location: string | null;
    stop: () => Promise<void>;
}

export async function connectWhep(
    endpoint: string,
    videoEl: HTMLVideoElement,
    opts: { signal?: AbortSignal } = {},
): Promise<WhepSession> {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // We only want to receive media.
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    pc.ontrack = (ev) => {
        // First track wins — attach its stream to the video element.
        if (videoEl.srcObject !== ev.streams[0]) {
            videoEl.srcObject = ev.streams[0];
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to finish (or 2s timeout).
    await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const timeout = setTimeout(resolve, 2000);
        const onState = () => {
            if (pc.iceGatheringState === "complete") {
                clearTimeout(timeout);
                pc.removeEventListener("icegatheringstatechange", onState);
                resolve();
            }
        };
        pc.addEventListener("icegatheringstatechange", onState);
    });

    const localOffer = pc.localDescription?.sdp;
    if (!localOffer) {
        pc.close();
        throw new Error("Failed to create SDP offer");
    }

    let response: Response;
    try {
        response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/sdp" },
            body: localOffer,
            signal: opts.signal,
        });
    } catch (err) {
        pc.close();
        throw err;
    }

    if (!response.ok) {
        pc.close();
        throw new Error(`WHEP POST failed: HTTP ${response.status}`);
    }

    const answer = await response.text();
    const location = response.headers.get("Location");

    try {
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (err) {
        pc.close();
        throw err;
    }

    const stop = async () => {
        try { pc.getSenders().forEach((s) => s.track?.stop()); } catch { /* ignore */ }
        try { pc.close(); } catch { /* ignore */ }
        if (location) {
            // Best-effort session teardown. Errors are fine.
            try {
                await fetch(location.startsWith("http") ? location : new URL(location, endpoint).toString(), {
                    method: "DELETE",
                });
            } catch { /* ignore */ }
        }
    };

    return { pc, location, stop };
}
