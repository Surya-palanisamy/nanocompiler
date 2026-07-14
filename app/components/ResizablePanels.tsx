import React, { useState, useEffect, useRef } from "react";
import { useWindowSize } from "../hooks/useWindowSize";

interface ResizablePanelsProps {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey?: string;
  minPercent?: number;
  maxPercent?: number;
}

export function ResizablePanels({
  left,
  right,
  storageKey = "resizable-panels-split-v2",
  minPercent = 45,
  maxPercent = 75,
}: ResizablePanelsProps) {
  const { width } = useWindowSize();
  const isMobile = width < 768; // md breakpoint

  const [splitRatio, setSplitRatio] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load split percentage from localStorage
  useEffect(() => {
    const key = `${storageKey}-${isMobile ? "mobile" : "desktop"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= minPercent && parsed <= maxPercent) {
        setSplitRatio(parsed);
      }
    } else {
      setSplitRatio(isMobile ? 60 : 50);
    }
  }, [storageKey, minPercent, maxPercent, isMobile]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (clientX: number, clientY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRatio = 50;

      if (isMobile) {
        const relativeY = clientY - rect.top;
        newRatio = (relativeY / rect.height) * 100;
      } else {
        const relativeX = clientX - rect.left;
        newRatio = (relativeX / rect.width) * 100;
      }

      const clamped = Math.max(minPercent, Math.min(maxPercent, newRatio));
      setSplitRatio(clamped);
      const key = `${storageKey}-${isMobile ? "mobile" : "desktop"}`;
      localStorage.setItem(key, clamped.toString());
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, minPercent, maxPercent, storageKey, isMobile]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 w-full h-full relative overflow-hidden select-none ${
        isMobile ? "flex-col" : "flex-row"
      }`}
      style={{ cursor: isDragging ? (isMobile ? "row-resize" : "col-resize") : "default" }}
    >
      {/* Left/Top Panel */}
      <div
        className="relative overflow-hidden"
        style={{
          width: isMobile ? "100%" : `${splitRatio}%`,
          height: isMobile ? `${splitRatio}%` : "100%",
          pointerEvents: isDragging ? "none" : "auto",
        }}
      >
        {left}
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        className={`z-20 group relative transition-colors duration-150 flex items-center justify-center ${
          isMobile
            ? "w-full h-2.5 cursor-row-resize flex-row"
            : "h-full w-2.5 cursor-col-resize flex-col"
        } ${isDragging ? "bg-zinc-800 dark:bg-zinc-900" : "bg-transparent hover:bg-zinc-800/30 dark:hover:bg-zinc-700/30"}`}
      >
        {/* Visual Divider Line */}
        <div
          className={`absolute pointer-events-none bg-zinc-300 dark:bg-zinc-800 group-hover:bg-zinc-400 dark:group-hover:bg-zinc-700 ${
            isMobile
              ? "inset-x-0 top-[4px] bottom-[4px] h-[2px]"
              : "inset-y-0 left-[4px] right-[4px] w-[2px]"
          }`}
        />

        {/* Grip Indicator */}
        <div
          className={`rounded-full bg-zinc-400 dark:bg-zinc-700 group-hover:bg-zinc-300 dark:group-hover:bg-zinc-500 z-30 transition-colors pointer-events-none ${
            isMobile ? "w-8 h-1" : "w-1 h-8"
          }`}
        />
      </div>

      {/* Right/Bottom Panel */}
      <div
        className="relative overflow-hidden"
        style={{
          width: isMobile ? "100%" : `${100 - splitRatio}%`,
          height: isMobile ? `${100 - splitRatio}%` : "100%",
          pointerEvents: isDragging ? "none" : "auto",
        }}
      >
        {right}
      </div>
    </div>
  );
}
