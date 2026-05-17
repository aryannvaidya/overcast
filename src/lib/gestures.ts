
export function initGestures() {
  if (typeof window === 'undefined') return;

  // ── CONFIG ──────────────────────────────────────
  const SWIPE_THRESHOLD  = 40;  // min px horizontal
  const SWIPE_MAX_VERT   = 80;  // max px vertical drift
  const SWIPE_MAX_TIME   = 500; // max ms for swipe
  const EDGE_IGNORE      = 30;  // ignore edge px (browser back zone)
  const PULL_THRESHOLD    = 75;

  // ── STATE ───────────────────────────────────────
  let startX    = 0;
  let startY    = 0;
  let startTime = 0;
  let tracking  = false;
  let rafId: number | null = null;

  // ── HELPERS ─────────────────────────────────────
  const isInteractive = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === "input"  ||
      tag === "button" ||
      tag === "select" ||
      tag === "textarea" ||
      !!el.closest("[data-no-swipe]") ||
      !!el.closest(".settings-panel") ||
      !!el.closest(".about-page") ||
      !!el.closest(".hourly-forecast")
    );
  };

  const target = document.getElementById("swipe-layer") || document.body;
  if (!target) return () => {};

  // ── PULL INDICATOR ──────────────────────────────
  let indicator = document.getElementById("gesture-pull-indicator");
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "gesture-pull-indicator";
    indicator.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0;
      height: 65px; overflow: hidden;
      display: flex; align-items: center; 
      justify-content: center;
      color: #ffffff80; font-size: 13px;
      background: #ffffff08;
      transform: translateY(-100%);
      will-change: transform;
      transition: transform 0.15s cubic-bezier(0.22, 1, 0.36, 1);
      z-index: 9999; pointer-events: none;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.prepend(indicator);
  }

  // Define listeners
  const onTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX < EDGE_IGNORE || 
        touch.clientX > window.innerWidth - EDGE_IGNORE) {
      tracking = false;
      return;
    }
    if (isInteractive(e.target as HTMLElement)) {
      tracking = false;
      return;
    }
    startX    = touch.clientX;
    startY    = touch.clientY;
    startTime = Date.now();
    tracking  = true;
    window.dispatchEvent(new CustomEvent("swipe-start"));
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking) return;
    const touch = e.touches[0];
    const dy = touch.clientY - startY;
    const dx = touch.clientX - startX;
    if (Math.abs(dy) > Math.abs(dx) && dy > 0 && window.scrollY === 0) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const pull = Math.min(dy, 130);
        const translatePercent = Math.max(-100, -100 + (pull / 130) * 100);
        if (indicator) {
          indicator.style.transform = `translateY(${translatePercent}%)`;
          indicator.textContent = pull >= PULL_THRESHOLD ? "↓ Release to refresh" : "↓ Pull to refresh";
        }
        rafId = null;
      });
    } else {
      if (indicator && indicator.style.transform !== "translateY(-100%)") {
        indicator.style.transform = "translateY(-100%)";
      }
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!tracking) return;
    tracking = false;
    const touch = e.changedTouches[0];
    const dx    = touch.clientX - startX;
    const dy    = touch.clientY - startY;
    const dt    = Date.now() - startTime;

    if (rafId) cancelAnimationFrame(rafId);
    if (indicator) {
      indicator.style.transform = "translateY(-100%)";
      indicator.textContent  = "";
    }

    if (Math.abs(dy) > Math.abs(dx) && dy >= PULL_THRESHOLD && window.scrollY === 0) {
      window.dispatchEvent(new CustomEvent("pull-refresh"));
      return;
    }

    if (dt > SWIPE_MAX_TIME || Math.abs(dy) > SWIPE_MAX_VERT || Math.abs(dx) < SWIPE_THRESHOLD) {
      window.dispatchEvent(new CustomEvent("swipe-cancel"));
      return;
    }

    if (dx < 0) {
      window.dispatchEvent(new CustomEvent("swipe-left"));
    } else {
      window.dispatchEvent(new CustomEvent("swipe-right"));
    }
  };

  const onTouchCancel = () => {
    tracking = false;
    if (indicator) indicator.style.transform = "translateY(-100%)";
    window.dispatchEvent(new CustomEvent("swipe-cancel"));
  };

  target.addEventListener("touchstart", onTouchStart, { passive: true });
  target.addEventListener("touchmove", onTouchMove, { passive: true });
  target.addEventListener("touchend", onTouchEnd, { passive: true });
  target.addEventListener("touchcancel", onTouchCancel, { passive: true });

  return () => {
    target.removeEventListener("touchstart", onTouchStart);
    target.removeEventListener("touchmove", onTouchMove);
    target.removeEventListener("touchend", onTouchEnd);
    target.removeEventListener("touchcancel", onTouchCancel);
  };

}
