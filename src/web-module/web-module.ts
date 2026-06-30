import { DataClient } from "@sdk";
import { Request, Response } from "express";
import { SubsonicConfigManager } from "../subsonic.config-manager.js";
import { DatabaseManager } from "../db/database-manager.js";

export type ParamFunction = <T extends boolean = false>(
	id: string,
	multiple?: T,
) => T extends true ? string[] : string | null;

export type CreateEndpointFunction = <
	U extends boolean = false,
	M extends boolean = false,
>(
	page: string,
	callback: (params: {
		request: Request;
		userId: U extends true ? null : string;
		queryParams: Record<string, string[] | undefined>;
		param: ParamFunction;
		response: Response;
		dataClient: DataClient;
		db: DatabaseManager;
		configManager: SubsonicConfigManager;
	}) => M extends true
		? void
		: Record<string, any> | Promise<Record<string, any>>,
	options?: {
		unauthenticated?: U;
		manualResponse?: M;
		noViewSuffix?: boolean;
	},
) => void;

export abstract class WebModule {
	abstract bind(endpoint: CreateEndpointFunction): void;
}
