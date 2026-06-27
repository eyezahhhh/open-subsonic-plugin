import { readFile } from "fs/promises";
import path from "path";

let pluginVersion: string | null = null;
export async function getPluginVersion() {
	if (pluginVersion) {
		return pluginVersion;
	}
	const response = await readFile(
		path.join(import.meta.dirname, "..", "package.json"),
		"utf-8",
	);

	const version: string = JSON.parse(response).version;
	pluginVersion = version;
	return version;
}
