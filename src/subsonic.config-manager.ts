import {
	AuthClient,
	ConfigManager,
	ConfigManagerApiContext,
	ConfigNode,
	HeadingConfigNode,
} from "@sdk";

export interface UserInfo {
	uuid: string;
	username: string;
	password: string;
}

export class SubsonicConfigManager implements ConfigManager {
	private api!: ConfigManagerApiContext;

	private port: number | null = null;
	private name: string | null = null;
	private logins: Record<string, UserInfo> = {};

	private readonly updateListeners = new Set<() => void>();

	constructor(private readonly authClient: AuthClient) {}

	async enable(configManagerApiContext: ConfigManagerApiContext) {
		this.api = configManagerApiContext;

		this.port = await this.api.getValue("port", "integer");
		this.name = await this.api.getValue("name", "string");
		await this.getAllLogins();
	}

	private emit() {
		for (const listener of this.updateListeners) {
			listener();
		}
	}

	private async getAllLogins() {
		const loginStrings = await this.api.getValue("login", "string", true);
		if (!loginStrings) {
			this.logins = {};
			return this.emit();
		}
		const logins: Record<string, UserInfo> = {};
		for (const loginString of loginStrings) {
			const [uuid, username, password] = loginString.split(":", 3);
			if (uuid && username && password) {
				logins[username] = {
					uuid,
					username,
					password: Buffer.from(password, "hex").toString("utf-8"),
				};
			}
		}

		this.logins = logins;
		this.emit();
	}

	getUserInfo(username: string) {
		return this.logins[username] ?? null;
	}

	addListener(listener: () => void) {
		this.updateListeners.add(listener);
	}

	removeListener(listener: () => void) {
		this.updateListeners.delete(listener);
	}

	getPort() {
		return this.port;
	}

	getName() {
		return this.name;
	}

	async getConfigOptions(): Promise<ConfigNode> {
		return {
			type: "section",
			children: [
				{
					type: "section",
					children: [
						{
							type: "heading",
							content: "Server",
							size: "md",
						},
						{
							type: "text",
							id: "port",
							name: "OpenSubsonic server port",
							value: this.port?.toString() ?? "",
							placeholder: "4040",
						},
						{
							type: "text",
							id: "name",
							name: "OpenSubsonic server name",
							value: this.name ?? "",
							placeholder: "Pipe Bomb",
						},
					],
				},
				{
					type: "section",
					children: [
						{
							type: "heading",
							content: "Logins",
							size: "md",
						},
						...Object.values(this.logins).map(
							({ username, password }) =>
								({
									type: "heading",
									content: `[${username}]: "${password}"`,
									size: "sm",
								}) as HeadingConfigNode,
						),
					],
				},
				{
					type: "section",
					children: [
						{
							type: "heading",
							content: "New Login",
							size: "md",
						},
						{
							type: "text",
							id: "username",
							name: "Username",
							placeholder: "eyezah",
							value: "",
						},
						{
							type: "text",
							id: "password",
							name: "OpenSubsonic Password",
							placeholder: "12345678",
							value: "",
						},
					],
				},
			],
		};
	}

	async update(values: Record<string, any>): Promise<ConfigNode> {
		const portString = values.port;
		if (typeof portString == "string") {
			if (portString.trim()) {
				const port = Number(portString);
				if (Number.isInteger(port) && port > 0) {
					await this.api.setValue("port", "integer", port);
					this.port = port;
				}
			} else {
				await this.api.delete("port");
				this.port = null;
			}
		}

		const name = values.name;
		if (typeof name == "string") {
			if (name.trim()) {
				await this.api.setValue("name", "string", name.trim());
				this.name = name.trim();
			} else {
				await this.api.delete("name");
				this.name = null;
			}
		}

		let { username, password } = values;
		if (
			username &&
			password &&
			typeof username == "string" &&
			typeof password == "string" &&
			username.trim()
		) {
			const uuid = await this.authClient.getUuid(username.trim());
			if (uuid) {
				username = username.trim();
				password = password.trim();
				const newLogins = Object.values(this.logins).filter(
					(entry) => entry.username != username,
				);

				if (password) {
					newLogins.push({
						uuid,
						username,
						password,
					});
				}

				const newLoginStrings = newLogins.map(
					({ uuid, username, password }) =>
						`${uuid}:${username}:${Buffer.from(password, "utf-8").toString("hex")}`,
				);

				await this.api.setValue("login", "string", newLoginStrings);
				if (password.trim()) {
					this.logins[username] = { uuid, username, password };
				} else {
					delete this.logins[username];
				}

				console.log(newLoginStrings);
			}
		}

		this.emit();
		return this.getConfigOptions();
	}
}
