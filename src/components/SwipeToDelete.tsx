'use client';

import { useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
  onDelete: () => void;
}

export default function SwipeToDelete({ children, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontal = useRef<boolean | null>(null);

  const DELETE_THRESHOLD = -80;

  function handleTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontal.current = null;
    setSwiping(true);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!swiping) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // Decide direction on first significant move
    if (isHorizontal.current === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }

    if (!isHorizontal.current) return;

    // Only allow left swipe
    const x = Math.min(0, dx);
    setOffsetX(x);
  }

  function handleTouchEnd() {
    setSwiping(false);
    if (offsetX < DELETE_THRESHOLD) {
      // Show delete button by snapping to -80
      setOffsetX(-80);
    } else {
      setOffsetX(0);
    }
    isHorizontal.current = null;
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)' }}>
      {/* Delete background */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: 'var(--color-danger)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 700,
          fontSize: 14,
          cursor: 'pointer',
          borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        }}
        onClick={() => {
          if (confirm('確定刪除？（會自動退款）')) {
            onDelete();
          } else {
            setOffsetX(0);
          }
        }}
      >
        刪除
      </div>

      {/* Content */}
      <div
        ref={ref}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.25s ease',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
