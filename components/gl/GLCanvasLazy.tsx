"use client";

import dynamic from "next/dynamic";

/* GLCanvas pulls in Three.js + React Three Fiber — the single
   largest JS chunk this site ships. It's WebGL-only and already has its
   own reduced-motion/support gating, so there's nothing for it to render
   on the server anyway; ssr:false keeps that whole chunk out of the
   initial bundle instead of parsing and evaluating it before the page can
   even paint its text. next/dynamic needs a client boundary to do that,
   which is the only reason this file exists instead of importing
   GLCanvas straight from page.tsx. */
const GLCanvas = dynamic(() => import("./GLCanvas"), { ssr: false });

export default GLCanvas;
