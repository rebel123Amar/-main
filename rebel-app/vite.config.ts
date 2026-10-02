import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://vitejs.dev/config/build-options.html#build-assetsdir
const isStorybook = process.argv[1]?.includes("storybook");

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    hmr: { protocol: "ws" },
    fs: { allow: ["app", "node_modules", "public"] },
    allowedHosts: true,
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
}) satisfies UserConfig;
