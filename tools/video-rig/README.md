# Feature-video rig (2026-07-31)

Captures the dist headless and renders the feature video. See HANDOVER.md
change log 2026-07-31 and the video-capture-rig memory note for the ideas:
the synthetic rAF clock (one deterministic sim step per captured frame),
one Playwright instance at a time, and Remotion pointed at Playwright's
chromium_headless_shell. Copy R2D2-Simulator.html next to the cap scripts,
npm i playwright, run cap_*.js in order, gen_assets.js, then in remotion/:
npm i && npx remotion render src/index.jsx Main out/r2d2-sim-features.mp4
  --browser-executable=<headless_shell> --concurrency=2
