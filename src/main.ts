import type PipeBomb from "@sdk";
import { WebServer } from "./web-server.js";
import { SubsonicConfigManager } from "./subsonic.config-manager.js";
import { getPluginVersion } from "./util.js";
import { SessionManager } from "./session-manager.js";

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

		const configManager = new SubsonicConfigManager(authClient);
		this.api.registerConfigManager(configManager);

		getPluginVersion().then((pluginVersion) => {
			const sessionManager = new SessionManager(this.api.getDataClient());

			const webServer = new WebServer(
				this.logger,
				configManager,
				this.api.getDataClient(),
				sessionManager,
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
		});
	}

	disable() {}

	public getLogger() {
		return this.logger;
	}

	public getApi() {
		return this.api;
	}
}
