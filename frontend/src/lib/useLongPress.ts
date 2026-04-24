import { useCallback, useEffect, useRef, useState } from "react";

type Position = { x: number; y: number };

type LongPressHandlers = {
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isPressed: boolean;
};

type UseLongPressOptions = {
  threshold?: number;
  rightClick?: boolean;
};

const MOVE_THRESHOLD = 10;

function posFromElement(el: HTMLElement): Position {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.bottom };
}

export function useLongPress(
  onLongPress: (pos: Position) => void,
  options: UseLongPressOptions = {},
): LongPressHandlers {
  const { threshold = 500, rightClick = false } = options;

  const [isPressed, setIsPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);
  const isTouchRef = useRef(false);
  const startPosRef = useRef<Position>({ x: 0, y: 0 });
  const onLongPressRef = useRef(onLongPress);

  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsPressed(false);
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(
    (pos: Position) => {
      startPosRef.current = pos;
      didLongPressRef.current = false;
      setIsPressed(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        didLongPressRef.current = true;
        setIsPressed(false);
        onLongPressRef.current(pos);
      }, threshold);
    },
    [threshold],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isTouchRef.current) {
        isTouchRef.current = false;
        return;
      }
      if (e.button !== 0) return;
      start({ x: e.clientX, y: e.clientY });
    },
    [start],
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isTouchRef.current = true;
      const touch = e.touches[0];
      start({ x: touch.clientX, y: touch.clientY });
    },
    [start],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (timerRef.current === null) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startPosRef.current.x;
      const dy = touch.clientY - startPosRef.current.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
        clear();
      }
    },
    [clear],
  );

  const onClick = useCallback((e: React.MouseEvent) => {
    if (didLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      didLongPressRef.current = false;
    }
  }, []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (rightClick) {
        e.preventDefault();
        if (isPressed || didLongPressRef.current) {
          return;
        }
        const pos =
          e.clientX === 0 && e.clientY === 0
            ? posFromElement(e.currentTarget as HTMLElement)
            : { x: e.clientX, y: e.clientY };
        onLongPressRef.current(pos);
      } else if (isPressed || didLongPressRef.current) {
        e.preventDefault();
      }
    },
    [isPressed, rightClick],
  );

  return {
    onMouseDown,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart,
    onTouchEnd: clear,
    onTouchMove,
    onClick,
    onContextMenu,
    isPressed,
  };
}
