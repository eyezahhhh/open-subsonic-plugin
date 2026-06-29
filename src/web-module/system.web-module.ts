import { CreateEndpointFunction, WebModule } from "./web-module.js";

export class SystemWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
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
	}
}
