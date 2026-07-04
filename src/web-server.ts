import { DataClient, Logger, PlaylistClient } from "@sdk";
import express from "express";
import { Server } from "http";
import { SubsonicConfigManager } from "./subsonic.config-manager.js";
import path from "path";
import { SessionManager } from "./session-manager.js";
import { WebModuleManager } from "./web-module-manager.js";
import { SystemWebModule } from "./web-module/system.web-module.js";
import { BrowsingWebModule } from "./web-module/browsing.web-module.js";
import { MediaRetrievalWebModule } from "./web-module/media-retrieval.web-module.js";
import { AlbumWebModule } from "./web-module/album.web-module.js";
import { UserWebModule } from "./web-module/user.web-module.js";
import { PlaylistsWebModule } from "./web-module/playlists.web-module.js";
import { DatabaseManager } from "./db/database-manager.js";
import { SearchingWebModule } from "./web-module/searching.web-module.js";
import { BookmarksWebModule } from "./web-module/bookmarks.web-module.js";
import { SubsonicUserConfigManager } from "./subsonic.user-config-manager.js";

export class WebServer {
	private server: Server | null = null;
	private port: number | null = null;
	private readonly moduleManager: WebModuleManager;

	constructor(
		private readonly logger: Logger,
		authConfigManager: SubsonicUserConfigManager,
		client: DataClient,
		sessionManager: SessionManager,
		playlistClient: PlaylistClient,
		databaseManager: DatabaseManager,
		pluginVersion: string,
	) {
		this.moduleManager = new WebModuleManager(
			authConfigManager,
			logger,
			client,
			databaseManager,
			pluginVersion,
		);

		this.moduleManager.addModules(
			new SystemWebModule(),
			new BrowsingWebModule(),
			new MediaRetrievalWebModule(sessionManager),
			new AlbumWebModule(),
			new UserWebModule(),
			new PlaylistsWebModule(playlistClient),
			new SearchingWebModule(),
			new BookmarksWebModule(),
		);
	}

	async close() {
		const server = this.server;
		if (!server) {
			return;
		}
		return new Promise<void>((resolve) => {
			server.addListener("close", () => {
				this.server = null;
				resolve();
			});
			server.close();
		});
	}

	async listen(port: number) {
		await this.close();

		this.port = port;

		const app = express();

		app.get("/", (_req, res) => {
			res.send("Pipe Bomb OpenSubsonic server");
		});

		const assetsDir = path.join(import.meta.dirname, "..", "assets");
		this.logger.debug(`Exposing ${assetsDir}`);
		// app.use("/assets", express.static(assetsDir));

		this.moduleManager.bind(app);

		app.use((req, res) => {
			this.logger.debug("Unhandled request:", req.url);
			// console.log(req.path);
			res.status(500).send();
		});

		this.server = app.listen(port, (error) => {
			if (error) {
				this.logger.error("Failed to start OpenSubsonic web server:", error);
			} else {
				this.logger.debug(`OpenSubsonic web server listening on *:${port}`);
			}
		});
	}

	getPort() {
		return this.port;
	}
}
