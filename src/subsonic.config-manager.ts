import { ConfigManager, ConfigManagerApiContext, ConfigNode } from "@sdk";
import { isValidUrl } from "./util.js";

export class SubsonicConfigManager implements ConfigManager {
	private api!: ConfigManagerApiContext;

	private port: number | null = null;
	private name: string | null = null;
	private prefix: string | null = null;
	private publicUrl: string | null = null;

	private readonly updateListeners = new Set<() => void>();

	async enable(configManagerApiContext: ConfigManagerApiContext) {
		this.api = configManagerApiContext;

		this.port = await this.api.getValue("port", "integer");
		this.name = await this.api.getValue("name", "string");
	}

	private emit() {
		for (const listener of this.updateListeners) {
			listener();
		}
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

	getPrefix() {
		return `/${this.prefix ?? ""}`;
	}

	getPublicUrl() {
		return this.publicUrl;
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
							id: "prefix",
							name: "OpenSubsonic server URL prefix",
							value: this.getPrefix(),
							placeholder: "/subsonic",
						},
						{
							type: "text",
							id: "public_url",
							name: "OpenSubsonic server public URL",
							value: this.publicUrl ?? "",
							placeholder: "https://subsonic.pipebomb.net",
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

		let prefix: string = values.prefix;
		if (typeof prefix == "string") {
			prefix = prefix.trim();
			if (prefix.startsWith("/")) {
				prefix = prefix.substring(1);
			}
			if (prefix) {
				await this.api.setValue("prefix", "string", prefix);
				this.prefix = prefix;
			} else {
				await this.api.delete("prefix");
				this.prefix = null;
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

		let publicUrl: string = values.public_url;
		if (typeof publicUrl == "string") {
			publicUrl = publicUrl.trim();
			if (publicUrl) {
				if (isValidUrl(publicUrl)) {
					await this.api.setValue("public_url", "string", publicUrl.trim());
					this.publicUrl = publicUrl;
				}
			} else {
				await this.api.delete("public_url");
				this.publicUrl = null;
			}
		}

		this.emit();
		return this.getConfigOptions();
	}
}
