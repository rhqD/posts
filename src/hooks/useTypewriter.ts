"use client";

import { useState, useEffect, useCallback } from "react";

export function useTypewriter(strings: string[], typingSpeed = 60, deletingSpeed = 30, pauseDuration = 2000) {
  const [text, setText] = useState("");
  const [stringIndex, setStringIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const tick = useCallback(() => {
    const currentString = strings[stringIndex];

    if (!isDeleting) {
      setText(currentString.substring(0, text.length + 1));
      if (text.length + 1 === currentString.length) {
        setTimeout(() => setIsDeleting(true), pauseDuration);
        return;
      }
    } else {
      setText(currentString.substring(0, text.length - 1));
      if (text.length - 1 === 0) {
        setIsDeleting(false);
        setStringIndex((prev) => (prev + 1) % strings.length);
        return;
      }
    }
  }, [text, stringIndex, isDeleting, strings, pauseDuration]);

  useEffect(() => {
    const speed = isDeleting ? deletingSpeed : typingSpeed;
    const timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [tick, isDeleting, typingSpeed, deletingSpeed]);

  return text;
}
