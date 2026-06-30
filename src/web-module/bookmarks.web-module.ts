import { CreateEndpointFunction, WebModule } from "./web-module.js";

export class BookmarksWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
		endpoint("getBookmarks", () => {
			return {
				bookmarks: {
					bookmark: [],
				},
			};
		});
	}
}
