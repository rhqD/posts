"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Volume2, VolumeX } from "lucide-react";

export default function BGMPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const audio = new Audio("/bgm.mp3");
    audio.loop = true;
    audio.volume = 0.25;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setPlaying(!playing);
  }, [playing]);

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg transition-all duration-300 hover:bg-black/5 dark:hover:bg-white/10 relative"
      title={playing ? "Pause BGM" : "Play BGM"}
    >
      {playing ? (
        <Volume2 size={16} className="text-emerald-400" />
      ) : (
        <VolumeX size={16} className="text-black/40 dark:text-white/40" />
      )}
    </button>
  );
}
