import { SessionManager } from "../session-manager.js";
import { parseTrackId } from "../util.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";
import Mime from "mime";

export class MediaRetrievalWebModule extends WebModule {
	constructor(private readonly sessionManager: SessionManager) {
		super();
	}

	bind(endpoint: CreateEndpointFunction): void {
		endpoint(
			"getCoverArt",
			async ({ param, response, dataClient }) => {
				const id = param("id");
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
				const buffer = await dataClient.getResource(uuid, extension);
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
			},
		);
		endpoint(
			"stream",
			async ({ param, request, response, userId }) => {
				const id = param("id");
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
	}
}
