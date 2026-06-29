import { Express, Request, Response } from "express";
import { ErrCode, SubsonicError } from "./subsonic.error.js";
import { SubsonicConfigManager } from "./subsonic.config-manager.js";
import * as crypto from "crypto";
import { DataClient, Logger } from "@sdk";
import { CreateEndpointFunction, WebModule } from "./web-module/web-module.js";

export class WebModuleManager {
	private readonly modules = new Set<WebModule>();

	constructor(
		private readonly configManager: SubsonicConfigManager,
		private readonly logger: Logger,
		private readonly dataClient: DataClient,
		private readonly pluginVersion: string,
	) {}

	public addModules(...modules: WebModule[]) {
		for (const module of modules) {
			this.modules.add(module);
		}
	}

	public bind(app: Express) {
		const createEndpoint: CreateEndpointFunction = (
			page,
			callback,
			options = {},
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
						dataClient: this.dataClient,
						configManager: this.configManager,
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

		for (const module of this.modules) {
			module.bind(createEndpoint);
		}
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
