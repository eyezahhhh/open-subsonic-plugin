import {
	AuthClient,
	ConfigNode,
	UserConfigManager,
	UserConfigManagerApiContext,
} from "@sdk";

export interface UserInfo {
	uuid: string;
	username: string;
	password: string;
}

export class SubsonicUserConfigManager implements UserConfigManager {
	private api!: UserConfigManagerApiContext;
	private logins: Record<string, UserInfo> = {};

	constructor(private readonly authClient: AuthClient) {}

	async enable(userConfigManagerApiContext: UserConfigManagerApiContext) {
		this.api = userConfigManagerApiContext;
		await this.getAllLogins();
	}

	private async getAllLogins() {
		const entries = await this.api.getAllValues("password", "string");
		const logins: Record<string, UserInfo> = {};
		for (const entry of entries) {
			if (entry.value.length) {
				const username = await this.authClient.getUsername(entry.userUuid);
				if (username) {
					logins[username] = {
						username,
						uuid: entry.userUuid,
						password: entry.value[0]!,
					};
				}
			}
		}

		this.logins = logins;
	}

	getUserInfo(username: string) {
		return this.logins[username] ?? null;
	}

	canUserAccess(_userUuid: string): boolean {
		return true;
	}

	async getConfigOptions(userUuid: string): Promise<ConfigNode | null> {
		const username = await this.authClient.getUsername(userUuid);
		if (!username) {
			return null;
		}
		const userInfo = this.getUserInfo(username);

		return {
			type: "section",
			children: [
				{
					type: "text",
					value: userInfo?.password ?? "",
					id: "password",
					placeholder: "super secret password",
					name: "Subsonic password",
				},
			],
		};
	}

	async update(
		userUuid: string,
		values: Record<string, any>,
	): Promise<ConfigNode | null> {
		let { password } = values;

		if (password && typeof password == "string") {
			password = password.trim();
			const username = await this.authClient.getUsername(userUuid);
			if (username) {
				if (password) {
					await this.api.setValue(userUuid, "password", "string", password);
					this.logins[username] = {
						username,
						uuid: userUuid,
						password,
					};
				} else {
					await this.api.delete(userUuid, "password");
					delete this.logins[username];
				}
			}
		}

		return this.getConfigOptions(userUuid);
	}
}
