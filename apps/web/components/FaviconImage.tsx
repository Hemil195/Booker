// apps/web/components/FaviconImage.tsx
// Resilient favicon component with 5-provider fallback cascade, smart 16px placeholder detection, and letter avatar fallback.

"use client";

import { useState, useEffect, useMemo } from "react";
import { getFaviconFallbackChain, getDomainInitials, getDomainColor } from "@/lib/favicon";

interface FaviconImageProps {
  url: string;
  title?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  rounded?: string;
  imgSize?: number;
}

export function FaviconImage({
  url,
  title,
  size = 32,
  className = "",
  style,
  rounded = "6px",
  imgSize,
}: FaviconImageProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  const fallbackChain = useMemo(() => {
    return getFaviconFallbackChain(url, size);
  }, [url, size]);

  // Reset error & sourceIndex state if URL changes
  useEffect(() => {
    const resetFallback = () => {
      setSourceIndex(0);
      setHasError(false);
    };
    resetFallback();
  }, [url]);

  const currentSrc = fallbackChain[sourceIndex];
  const dimension = imgSize || Math.round(size * 0.55);

  // If no sources or all sources failed, render styled letter avatar
  if (!url || hasError || !currentSrc || sourceIndex >= fallbackChain.length) {
    const initials = getDomainInitials(url || title || "");
    const bgGradient = getDomainColor(url || title || "");

    return (
      <div
        className={`flex items-center justify-center font-bold select-none overflow-hidden ${className}`}
        style={{
          width: `${imgSize || size / 2}px`,
          height: `${imgSize || size / 2}px`,
          borderRadius: rounded,
          background: bgGradient,
          color: "#FFFFFF",
          fontSize: `${Math.max(10, Math.floor((imgSize || size / 2) * 0.5))}px`,
          boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          flexShrink: 0,
          ...style,
        }}
        title={title || url}
      >
        {initials}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={title || ""}
      width={dimension}
      height={dimension}
      className={`object-contain transition-opacity duration-150 ${className}`}
      style={{
        width: `${dimension}px`,
        height: `${dimension}px`,
        borderRadius: rounded,
        flexShrink: 0,
        ...style,
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        // Detect Google S2 default 16x16 fallback image when requested size > 16
        if (currentSrc.includes("google.com/s2/favicons") && img.naturalWidth <= 16 && size > 16) {
          if (sourceIndex + 1 < fallbackChain.length) {
            setSourceIndex((prev) => prev + 1);
          } else {
            setHasError(true);
          }
        }
      }}
      onError={() => {
        if (sourceIndex + 1 < fallbackChain.length) {
          setSourceIndex((prev) => prev + 1);
        } else {
          setHasError(true);
        }
      }}
    />
  );
}
