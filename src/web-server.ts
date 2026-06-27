import { AuthClient, Logger } from "@sdk";
import express, { Request } from "express";
import { Server } from "http";
import { SubsonicConfigManager } from "./subsonic.config-manager.js";
import path from "path";
import { ErrCode, SubsonicError } from "./subsonic.error.js";
import crypto from "crypto";

export class WebServer {
	private server: Server | null = null;
	private port: number | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly configManager: SubsonicConfigManager,
		private readonly pluginVersion: string,
	) {}

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
		app.use("/assets", express.static(assetsDir));

		const endpoint = (
			page: string,
			callback: (
				request: Request,
			) => Record<string, any> | Promise<Record<string, any>>,
			options: {
				allowUnauthenticated?: boolean;
			} = {},
		) => {
			page = `/rest/${page}`;
			app.get([page, `${page}.view`], async (req, res) => {
				try {
					const { u: username, t: token, s: salt, p: password } = req.query;

					if (!options.allowUnauthenticated) {
						if (!username || typeof username !== "string") {
							throw new SubsonicError(
								ErrCode.REQUIRED_PARAM_MISSING,
								"Required parameter is missing: u",
							);
						}

						const actualPassword = this.configManager.getPassword(username);
						if (!actualPassword) {
							throw new SubsonicError(
								ErrCode.WRONG_USERNAME_PASSWORD,
								"Wrong username or password",
							);
						}

						let isAuthenticated = false;

						if (
							token &&
							salt &&
							typeof token === "string" &&
							typeof salt === "string"
						) {
							const expectedToken = crypto
								.createHash("md5")
								.update(actualPassword + salt)
								.digest("hex");
							isAuthenticated = token === expectedToken;
						} else if (password && typeof password === "string") {
							let cleanPassword = password;

							if (password.startsWith("enc:")) {
								cleanPassword = Buffer.from(
									password.replace("enc:", ""),
									"hex",
								).toString("utf8");
							}

							isAuthenticated = cleanPassword === actualPassword;
						}

						if (!isAuthenticated) {
							throw new SubsonicError(
								ErrCode.WRONG_USERNAME_PASSWORD,
								"Wrong username or password",
							);
						}
					}

					const response = await callback(req);
					res.send(this.response(response));
				} catch (e) {
					if (e instanceof SubsonicError) {
						res.send(this.response(e));
						return;
					}
					this.logger.error(`Error occured on endpoint ${page}:`, e);
					res.status(500).send(
						this.response({
							error: "Internal server error",
						}),
					);
				}
			});
		};

		endpoint("ping", () => ({}));

		endpoint("getLicense", () => ({
			license: {
				valid: true,
			},
		}));

		endpoint(
			"getOpenSubsonicExtensions",
			() => ({
				openSubsonicExtensions: [
					{
						name: "apiKeyAuthentication",
						version: 1,
					},
				],
			}),
			{
				allowUnauthenticated: true,
			},
		);

		// app.get(`/stream/:pluginId/:libraryId/:trackId`, async (req, res) => {
		// 	const clientId = req.ip || req.socket.remoteAddress;
		// 	if (!clientId) {
		// 		res.status(400).send("Unknown remote address or client IP");
		// 		return;
		// 	}

		// 	const session = await this.sessionManager.getOrCreateSession(
		// 		clientId,
		// 		req.params.pluginId,
		// 		req.params.libraryId,
		// 		req.params.trackId,
		// 	);

		// 	const producer = session.getAudioProducer();
		// 	if (producer.type != "stream") {
		// 		res.status(503).send("Unsupported audio producer");
		// 		return;
		// 	}

		// 	const metadata = await producer.getMetadata();
		// 	const range = req.headers.range;

		// 	if (!range) {
		// 		const stream = await producer.getStream();
		// 		res.set({
		// 			"Content-Type": metadata.mimeType,
		// 			"Content-Length": metadata.size,
		// 			"Accept-Ranges": "bytes",
		// 		});
		// 		stream.pipe(res);
		// 		return;
		// 	}

		// 	const parts = range.replace(/bytes=/, "").split("-");
		// 	const start = parseInt(parts[0]!, 10);
		// 	const end = parts[1] ? parseInt(parts[1], 10) : metadata.size - 1;

		// 	if (start >= metadata.size || end >= metadata.size) {
		// 		res.status(416);
		// 		res.set("Content-Range", `bytes */${metadata.size}`);
		// 		res.send();
		// 		return;
		// 	}

		// 	const stream = await producer.getPart(start, end);
		// 	const chunkSize = end - start + 1;

		// 	res.status(206);
		// 	res.set({
		// 		"Content-Range": `bytes ${start}-${end}/${metadata.size}`,
		// 		"Accept-Ranges": "bytes",
		// 		"Content-Length": chunkSize,
		// 		"Content-Type": metadata.mimeType,
		// 	});

		// 	if (Buffer.isBuffer(stream)) {
		// 		res.send(stream);
		// 	} else {
		// 		stream.pipe(res);
		// 	}
		// });

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

	private response(options: Record<string, any> | SubsonicError) {
		const shared = {
			version: "1.16.1",
			type: "PipeBomb",
			serverVersion: this.pluginVersion,
			openSubsonic: true,
		};

		if (options instanceof SubsonicError) {
			return {
				"subsonic-response": {
					status: "failed",
					...shared,
					error: {
						code: options.code,
						message: options.message,
					},
				},
			};
		}

		return {
			"subsonic-response": {
				status: "ok",
				...shared,
				...options,
			},
		};
	}
}
