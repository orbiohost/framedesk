import { useEffect } from 'react';

// Closes a popover when the pointer goes down outside `ref` or Escape is pressed.
export function useDismiss(ref, isOpen, close) {
  useEffect(() => {
    if (!isOpen) return undefined;
    function onPointerDown(event) {
      if (!ref.current?.contains(event.target)) close();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, isOpen, close]);
}
