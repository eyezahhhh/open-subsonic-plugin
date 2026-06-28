import { AttributeType, SavedAttribute, SavedAttributeValues } from "@sdk";
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

export function createAttributeRecord(attributes: SavedAttribute[]) {
	const dictionary: Record<string, SavedAttribute[]> = {};

	for (const attribute of attributes) {
		if (attribute.key in dictionary) {
			dictionary[attribute.key]!.push(attribute);
		} else {
			dictionary[attribute.key] = [attribute];
		}
	}

	const output: Record<string, SavedAttribute> = {};
	for (const [key, list] of Object.entries(dictionary)) {
		const first = list.shift()!;
		const type = first.type;
		if (list.some((attribute) => attribute.type != type)) {
			throw new Error(
				`Attribute list contains multiple values of key "${key}" with different types`,
			);
		}

		for (const entry of list) {
			(first.values as any[]).push(...entry.values);
		}
		output[key] = first;
	}

	return output;
}

export function getAttributeValue<T extends AttributeType>(
	attributes:
		| Record<string, SavedAttribute>
		| SavedAttribute[]
		| null
		| undefined,
	key: string,
	type: T,
): SavedAttributeValues[T] | null {
	if (attributes && Array.isArray(attributes)) {
		attributes = createAttributeRecord(attributes);
	}

	const attribute = attributes?.[key];
	if (attribute?.type == type && attribute.values.length) {
		return attribute.values[0]! as SavedAttributeValues[T];
	}

	return null;
}

export function parseTrackId(id: string | undefined) {
	if (id) {
		const [pluginId, libraryId, trackId] = id.split("~");
		if (pluginId && libraryId && trackId) {
			return { pluginId, libraryId, trackId };
		}
	}
	return null;
}
