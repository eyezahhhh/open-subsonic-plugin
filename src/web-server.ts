import { DataClient, Logger } from "@sdk";
import express, { Request, Response } from "express";
import { Server } from "http";
import { SubsonicConfigManager } from "./subsonic.config-manager.js";
import path from "path";
import { ErrCode, SubsonicError } from "./subsonic.error.js";
import crypto from "crypto";
import { ArtistID3, IndexID3 } from "./types.js";
import Mime from "mime";
import { formatAlbum, formatArtist, formatTrack } from "./formatter.js";
import { SessionManager } from "./session-manager.js";
import { parseTrackId } from "./util.js";

export class WebServer {
	private server: Server | null = null;
	private port: number | null = null;

	constructor(
		private readonly logger: Logger,
		private readonly configManager: SubsonicConfigManager,
		private readonly client: DataClient,
		private readonly sessionManager: SessionManager,
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

		const endpoint = <U extends boolean = false, M extends boolean = false>(
			page: string,
			callback: (params: {
				request: Request;
				userId: U extends true ? null : string;
				queryParams: Record<string, string | undefined>;
				response: Response;
			}) => M extends true
				? void
				: Record<string, any> | Promise<Record<string, any>>,
			options: {
				unauthenticated?: U;
				manualResponse?: M;
				noViewSuffix?: boolean;
			} = {},
		) => {
			page = `/rest/${page}`;

			const endpoints = [page];
			if (!options.noViewSuffix) {
				endpoints.push(`${page}.view`);
			}

			app.get(endpoints, async (req, res) => {
				try {
					const {
						u: username,
						t: token,
						s: salt,
						p: password,
						...queryParams
					} = req.query;

					let userId: string | null = null;

					if (!options.unauthenticated) {
						if (!username || typeof username !== "string") {
							throw new SubsonicError(
								ErrCode.REQUIRED_PARAM_MISSING,
								"Required parameter is missing: u",
							);
						}

						const userInfo = this.configManager.getUserInfo(username);
						const actualPassword = userInfo?.password;
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

						userId = userInfo.uuid;
					}

					const response = await callback({
						request: req,
						userId: userId as any,
						queryParams: queryParams as Record<string, string | undefined>,
						response: res,
					});
					if (!options.manualResponse) {
						res.send(this.response(response as Record<string, any>));
					}
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
				openSubsonicExtensions: [],
			}),
			{
				unauthenticated: true,
			},
		);

		endpoint("getMusicFolders", () => {
			return {
				musicFolders: {
					musicFolder: [
						{
							id: 1,
							name: "Main Library",
						},
					],
				},
			};
		});

		endpoint("getArtists", async () => {
			const artistUuids: string[] = [];
			await this.client.forEachArtist((uuid) => {
				artistUuids.push(uuid);
			});
			const artistResponses = await Promise.allSettled(
				artistUuids.map((uuid) =>
					this.client.getArtist(uuid, {
						relations: {
							identities: true,
							attributes: true,
							albums: true,
						},
					}),
				),
			);

			const artistEntries: ArtistID3[] = [];

			for (const [index, id] of artistUuids.entries()) {
				const response = artistResponses[index];
				if (response?.status == "fulfilled") {
					if (response.value) {
						artistEntries.push(formatArtist(response.value));
						continue;
					}
				}

				artistEntries.push({
					id,
					name: "Unknown Artist",
					albumCount: 0,
					musicBrainzId: "",
					artistImageUrl: "",
					coverArt: "",
				});
			}

			const groups: Record<string, ArtistID3[]> = {};
			for (const entry of artistEntries) {
				let firstLetter = entry.name.charAt(0).toUpperCase();

				if (!firstLetter) {
					firstLetter = "#";
				}

				if (!/[A-Z]/.test(firstLetter)) {
					firstLetter = "#";
				}

				if (groups[firstLetter]) {
					groups[firstLetter]?.push(entry);
				} else {
					groups[firstLetter] = [entry];
				}
			}

			const index: IndexID3[] = [];

			for (const [key, group] of Object.entries(groups)) {
				group.sort((a, b) => a.name.localeCompare(b.name));

				index.push({
					name: key,
					artist: group,
				});
			}

			index.sort((a, b) => a.name.localeCompare(b.name));

			return {
				artists: {
					ignoredArticles: "",
					index,
				},
			};
		});

		endpoint("getArtist", async ({ queryParams }) => {
			const { id } = queryParams;
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Artist ID not specified");
			}

			const artist = await this.client.getArtist(id, {
				relations: {
					attributes: true,
					albums: {
						artists: {
							attributes: true,
						},
						attributes: true,
						tracks: {
							attributes: true,
						},
					},
				},
			});

			if (!artist) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Artist not found");
			}

			return {
				artist: formatArtist(artist),
			};
		});

		endpoint("getAlbum", async ({ queryParams }) => {
			const { id } = queryParams;
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Album ID not specified");
			}

			const album = await this.client.getAlbum(id, {
				relations: {
					attributes: true,
					artists: {
						attributes: true,
						identities: true,
					},
					tracks: {
						artists: {
							attributes: true,
							identities: true,
						},
						attributes: true,
					},
				},
			});

			if (!album) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Album not found");
			}

			return {
				album: formatAlbum(album),
			};
		});

		endpoint("getSong", async ({ queryParams }) => {
			const { id } = queryParams;
			if (!id) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Track ID not specified");
			}

			const fullId = parseTrackId(id);
			if (!fullId) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Invalid track ID");
			}
			const { pluginId, libraryId, trackId } = fullId;

			const track = await this.client.getTrack(pluginId, libraryId, trackId, {
				relations: {
					identities: true,
					attributes: true,
					artists: {
						attributes: true,
						identities: true,
					},
				},
			});

			if (!track) {
				throw new SubsonicError(ErrCode.NOT_FOUND, "Track not found");
			}

			return {
				song: formatTrack(track),
			};
		});

		endpoint(
			"getCoverArt",
			async ({ queryParams, response }) => {
				const { id } = queryParams;

				if (!id) {
					response.status(400).send("Missing cover art ID");
					return;
				}

				const [uuid, extension] = id.split(".", 2);
				if (!uuid || !extension || uuid.length != 36) {
					response.status(400).send("Invalid cover art ID");
					return;
				}

				const type = Mime.getType(`${uuid}.${extension}`);

				if (!type) {
					response.status(400).send("Unknown mime type");
					return;
				}

				const buffer = await this.client.getResource(uuid, extension);
				if (!buffer) {
					response.status(404).send("Resource not found");
					return;
				}
				response.set({
					"Content-Type": type,
				});
				response.send(buffer);
			},
			{
				unauthenticated: true,
				manualResponse: true,
				noViewSuffix: true,
			},
		);

		endpoint(
			"stream",
			async ({ queryParams, request, response, userId }) => {
				const { id } = queryParams;

				if (!id) {
					response.status(400).send("No stream ID provided");
					return;
				}

				const fullId = parseTrackId(id);

				if (!fullId) {
					response.status(400).send("Invalid track ID");
					return;
				}

				const { pluginId, libraryId, trackId } = fullId;

				const session = await this.sessionManager.getOrCreateSession(
					userId,
					pluginId,
					libraryId,
					trackId,
				);

				const producer = session.getAudioProducer();
				if (producer.type != "stream") {
					response.status(503).send("Unsupported audio producer");
					return;
				}

				const metadata = await producer.getMetadata();
				const range = request.headers.range;

				if (!range) {
					const stream = await producer.getStream();
					response.set({
						"Content-Type": metadata.mimeType,
						"Content-Length": metadata.size,
						"Accept-Ranges": "bytes",
					});
					stream.pipe(response);
					return;
				}

				const parts = range.replace(/bytes=/, "").split("-");
				const start = parseInt(parts[0]!, 10);
				const end = parts[1] ? parseInt(parts[1], 10) : metadata.size - 1;

				if (start >= metadata.size || end >= metadata.size) {
					response.status(416);
					response.set("Content-Range", `bytes */${metadata.size}`);
					response.send();
					return;
				}

				const stream = await producer.getPart(start, end);
				const chunkSize = end - start + 1;

				response.status(206);
				response.set({
					"Content-Range": `bytes ${start}-${end}/${metadata.size}`,
					"Accept-Ranges": "bytes",
					"Content-Length": chunkSize,
					"Content-Type": metadata.mimeType,
				});

				if (Buffer.isBuffer(stream)) {
					response.send(stream);
				} else {
					stream.pipe(response);
				}
			},
			{
				manualResponse: true,
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
