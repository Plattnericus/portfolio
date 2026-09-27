"use client";

import { useSyncExternalStore } from "react";

/* South Tyrol keeps Italian time */
const format = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

const subscribe = (tick: () => void) => {
  const id = window.setInterval(tick, 5000);
  return () => window.clearInterval(id);
};
/* a string, so an unchanged minute compares equal and nothing re-renders */
const now = () => format.format(Date.now());
/* the server can't know when the page will be read — it renders a
   placeholder of the same width and the browser fills in the real time */
const onServer = () => "--:-- ---";

/** The current time in South Tyrol, e.g. "22:14 CEST", with a blinking colon. */
export default function LocalTime() {
  const value = useSyncExternalStore(subscribe, now, onServer);
  const [clock, zone] = value.split(" ");
  const [hours, minutes] = clock.split(":");
  return (
    <time className="local-time">
      {hours}
      <span className="local-time-colon">:</span>
      {minutes} {zone}
    </time>
  );
}
