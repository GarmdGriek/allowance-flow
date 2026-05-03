import react from "@vitejs/plugin-react";
import "dotenv/config";
import path from "node:path";
import { defineConfig } from "vite";
import injectHTML from "vite-plugin-html-inject";
import tsConfigPaths from "vite-tsconfig-paths";

const buildVariables = () => {
	const appId = process.env.DATABUTTON_PROJECT_ID;

	const defines: Record<string, string> = {
		__APP_ID__: JSON.stringify(appId),
		__API_PATH__: JSON.stringify(process.env.API_PATH),
		__API_HOST__: JSON.stringify(""),
		__API_PREFIX_PATH__: JSON.stringify(""),
		__API_URL__: JSON.stringify(process.env.API_URL || "http://localhost:8000"),
		__WS_API_URL__: JSON.stringify(process.env.WS_API_URL || "ws://localhost:8000"),
		__APP_BASE_PATH__: JSON.stringify("/"),
		__APP_TITLE__: JSON.stringify("Allowance App"),
		__APP_FAVICON_LIGHT__: JSON.stringify("/favicon-light.svg"),
		__APP_FAVICON_DARK__: JSON.stringify("/favicon-dark.svg"),
		__APP_DEPLOY_USERNAME__: JSON.stringify(""),
		__APP_DEPLOY_APPNAME__: JSON.stringify(""),
		__APP_DEPLOY_CUSTOM_DOMAIN__: JSON.stringify(""),
		__NEON_AUTH_URL__: JSON.stringify(process.env.NEON_AUTH_URL || ""),
	};

	return defines;
};

// https://vite.dev/config/
export default defineConfig({
	define: buildVariables(),
	plugins: [react(), tsConfigPaths(), injectHTML()],
	build: {
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					if (!id.includes("node_modules")) return;
					if (id.includes("@radix-ui")) return "radix";
					// Note: do NOT split react/react-dom into their own chunk — this caused
					// a PureComponent-undefined load-order crash (see commit 7b92482).
					if (id.includes("react-router") || id.includes("@remix-run/router") || id.includes("/history/")) return "router";
					if (id.includes("i18next") || id.includes("react-i18next")) return "i18n";
					if (id.includes("better-auth")) return "auth";
					if (id.includes("lucide-react")) return "icons";
					return "vendor";
				},
			},
		},
	},
	server: {
		proxy: {
			"/api": {
				target: "http://127.0.0.1:8000",
				changeOrigin: true,
			},
		},
	},
	resolve: {
		alias: {
			resolve: {
				alias: {
					"@": path.resolve(__dirname, "./src"),
				},
			},
		},
	},
});
