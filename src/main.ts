import type PipeBomb from "@sdk";
import { WebServer } from "./web-server.js";
import { SubsonicConfigManager } from "./subsonic.config-manager.js";
import { getPluginVersion } from "./util.js";
import { SessionManager } from "./session-manager.js";
import path from "path";
import { createDatabaseClient } from "./db/client.js";
import { DatabaseManager } from "./db/database-manager.js";
import { SubsonicUserConfigManager } from "./subsonic.user-config-manager.js";

export default class Plugin implements PipeBomb.Plugin {
	private api!: PipeBomb.PluginApiContext;
	private logger!: PipeBomb.Logger;

	enable(apiContext: PipeBomb.PluginApiContext) {
		this.api = apiContext;
		this.logger = apiContext.getLogger();

		this.api.registerLanguageDirectory("language");

		const authClient = this.api.requestAuthClient();
		if (!authClient) {
			this.logger.error("********************");
			this.logger.error(
				"Failed to create auth client. OpenSubsonic integration is disabled",
			);
			this.logger.error("********************");
			return;
		}

		const configManager = new SubsonicConfigManager();
		this.api.registerConfigManager(configManager);
		const userConfigManager = new SubsonicUserConfigManager(authClient);
		this.api.registerUserConfigManager("auth", userConfigManager);

		const playlistClient = this.api.getPlaylistClient();

		this.api.requestCacheDirectory().then((cacheDir) =>
			getPluginVersion().then((pluginVersion) => {
				const dbFile = path.join(cacheDir, "database.sqlite");
				const dbClient = createDatabaseClient(dbFile);

				const database = new DatabaseManager(
					dbClient,
					this.api.getDataClient(),
					this.logger,
				);

				this.api.registerTask({
					id: "sync",
					resumable: false,
					run: async (ctx) => {
						await database.sync(ctx.update);
					},
				});

				const sessionManager = new SessionManager(this.api.getDataClient());

				const webServer = new WebServer(
					this.logger,
					userConfigManager,
					this.api.getDataClient(),
					sessionManager,
					playlistClient,
					database,
					pluginVersion,
				);

				const startServer = () => {
					const port = configManager.getPort();
					const currentPort = webServer.getPort();

					if (currentPort && currentPort == port) {
						return;
					}

					if (port) {
						webServer.listen(port);
					} else {
						webServer.close();
					}
				};

				configManager.addListener(startServer);
				startServer();
			}),
		);
	}

	disable() {}

	public getLogger() {
		return this.logger;
	}

	public getApi() {
		return this.api;
	}
}
