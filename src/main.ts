import type PipeBomb from "@sdk";
import { WebServer } from "./web-server.js";
import { SubsonicConfigManager } from "./subsonic.config-manager.js";
import { getPluginVersion } from "./util.js";

export default class Plugin implements PipeBomb.Plugin {
	private api!: PipeBomb.PluginApiContext;
	private logger!: PipeBomb.Logger;

	enable(apiContext: PipeBomb.PluginApiContext) {
		this.api = apiContext;
		this.logger = apiContext.getLogger();

		this.api.registerLanguageDirectory("language");

		const configManager = new SubsonicConfigManager();
		this.api.registerConfigManager(configManager);

		getPluginVersion().then((pluginVersion) => {
			const webServer = new WebServer(
				this.logger,
				configManager,
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
