import React, { useEffect, useState, useRef } from "react";
import { HYDRATE_EVENT } from "@/lib/scroll-to-anchor";

export default function LazySection({ children, height = 300, fallback, className = "" }) {
  const [isIntersected, setIsIntersected] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    
    if (typeof window !== "undefined" && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsIntersected(true);
            observer.disconnect();
          }
        },
        { rootMargin: "250px 0px" } // Load section 250px before it scrolls into view
      );
      observer.observe(ref.current);
      return () => observer.disconnect();
    } else {
      setIsIntersected(true);
    }
  }, []);

  // An in-page anchor jump (scrollToAnchor) hydrates every section up front so
  // the page above its target stops changing height before it settles.
  useEffect(() => {
    if (isIntersected || typeof window === "undefined") return;
    const hydrate = () => setIsIntersected(true);
    window.addEventListener(HYDRATE_EVENT, hydrate);
    return () => window.removeEventListener(HYDRATE_EVENT, hydrate);
  }, [isIntersected]);

  return (
    <div
      ref={ref}
      className={className}
      data-section-loading={isIntersected ? undefined : ""}
      style={{
        minHeight: isIntersected ? "auto" : height,
        contentVisibility: "auto",
        // `auto` keeps a section's real height once it has rendered, so off-screen
        // sections don't collapse back to the placeholder size and shift anchors.
        containIntrinsicSize: `auto ${height}px`,
      }}
    >
      {isIntersected ? (
        children
      ) : (
        fallback || (
          <div 
            className="w-full bg-neutral-900/10 animate-pulse border border-border/10 flex items-center justify-center text-[10px] font-mono text-muted-foreground/30 uppercase tracking-widest" 
            style={{ height }}
          >
            Loading Section...
          </div>
        )
      )}
    </div>
  );
}
