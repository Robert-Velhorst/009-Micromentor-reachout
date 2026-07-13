import { useRef } from "react";
import { usePersistFn } from "./usePersistFn";

export interface UseCompositionReturn<
  T extends HTMLInputElement | HTMLTextAreaElement,
> {
  onCompositionStart: React.CompositionEventHandler<T>;
  onCompositionEnd: React.CompositionEventHandler<T>;
  onKeyDown: React.KeyboardEventHandler<T>;
  isComposing: () => boolean;
}

export interface UseCompositionOptions<
  T extends HTMLInputElement | HTMLTextAreaElement,
> {
  onKeyDown?: React.KeyboardEventHandler<T>;
  onCompositionStart?: React.CompositionEventHandler<T>;
  onCompositionEnd?: React.CompositionEventHandler<T>;
}

type TimerResponse = ReturnType<typeof setTimeout>;

export function useComposition<
  T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement,
>(options: UseCompositionOptions<T> = {}): UseCompositionReturn<T> {
  const {
    onKeyDown: originalOnKeyDown,
    onCompositionStart: originalOnCompositionStart,
    onCompositionEnd: originalOnCompositionEnd,
  } = options;

  const composing = useRef(false);
  const endTimer = useRef<TimerResponse | null>(null);
  const releaseTimer = useRef<TimerResponse | null>(null);

  const onCompositionStart = usePersistFn((event: React.CompositionEvent<T>) => {
    if (endTimer.current) clearTimeout(endTimer.current);
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    endTimer.current = null;
    releaseTimer.current = null;
    composing.current = true;
    originalOnCompositionStart?.(event);
  });

  const onCompositionEnd = usePersistFn((event: React.CompositionEvent<T>) => {
    // Safari can fire compositionEnd before the confirming keydown event.
    endTimer.current = setTimeout(() => {
      releaseTimer.current = setTimeout(() => {
        composing.current = false;
      });
    });
    originalOnCompositionEnd?.(event);
  });

  const onKeyDown = usePersistFn((event: React.KeyboardEvent<T>) => {
    // Keep Enter and Escape from reaching business handlers during IME composition.
    if (
      composing.current &&
      (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey))
    ) {
      event.stopPropagation();
      return;
    }
    originalOnKeyDown?.(event);
  });

  return {
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    isComposing: usePersistFn(() => composing.current),
  };
}
