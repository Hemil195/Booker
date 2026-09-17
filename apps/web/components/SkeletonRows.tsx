// components/SkeletonRows.tsx
// Shimmer skeleton rows displayed while bookmark list is loading.
// Matches the shape of real BookmarkRow to prevent layout shift.

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1 px-1">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 px-4 py-3 rounded-[10px]"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {/* Checkbox placeholder */}
          <div className="skeleton w-4 h-4 mt-0.5 flex-shrink-0" />

          {/* Favicon placeholder */}
          <div className="skeleton w-9 h-9 rounded-[8px] flex-shrink-0" />

          {/* Content */}
          <div className="flex-1 space-y-1.5">
            {/* Title */}
            <div className="skeleton h-4 rounded" style={{ width: `${60 + (i % 3) * 12}%` }} />
            {/* Description */}
            <div className="skeleton h-3 rounded" style={{ width: `${45 + (i % 4) * 8}%` }} />
            {/* Metadata */}
            <div className="flex gap-2">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton h-3 w-12 rounded" />
              <div className="skeleton h-3 w-16 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
