"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { SEASONS, chooseSeason, type Season } from "@/lib/seasons";
import { SEASONS_EVENT, markSecret } from "@/lib/secrets";
import { store } from "@/lib/store";
import { onTyped } from "@/lib/typed";

const Weather = dynamic(() => import("@/components/Weather"), { ssr: false });
const SeasonPicker = dynamic(() => import("@/components/SeasonPicker"), { ssr: false });

const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
const MODIFIERS = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "AltGraph"];
/** typed anywhere on the site: opens the picker */
const PICKER_WORD = "season";

/**
 * The seasons, on every page. Typing `season` anywhere opens a picker of
 * the four; typing a season's name (`winter`, ...) switches its weather on
 * straight away. So does the Konami code, the shell, or five taps on the
 * footer's last line on a phone. Nothing is stored: a reload clears it.
 * Mounted in the root layout, so it stays across pages.
 */
export default function Seasons() {
  const [picking, setPicking] = useState(false);
  const [weather, setWeather] = useState<Season | null>(store.get().weather);
  // the layer stays once it has been on, so switching off can fade out
  const [ever, setEver] = useState(false);
  const close = useCallback(() => setPicking(false), []);

  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.weather === prev.weather) return;
        setWeather(s.weather);
        if (s.weather) setEver(true);
      }),
    [],
  );

  useEffect(() => {
    const open = () => setPicking(true);
    const offs = [onTyped(PICKER_WORD, open), ...SEASONS.map((s) => onTyped(s, () => chooseSeason(s)))];
    // the Konami code is keys, not letters, so it has its own listener. Shift
    // (for a capital B or A), the other modifiers and a held key's repeats
    // are not part of the code and must not break it
    let keys: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || MODIFIERS.includes(e.key)) return;
      keys = [...keys, e.key.toLowerCase()].slice(-KONAMI.length);
      if (keys.join() !== KONAMI.join()) return;
      keys = [];
      markSecret("konami");
      open();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(SEASONS_EVENT, open);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SEASONS_EVENT, open);
    };
  }, []);

  return (
    <>
      {ever && <Weather season={weather} />}
      {picking && <SeasonPicker current={weather} onClose={close} />}
    </>
  );
}
