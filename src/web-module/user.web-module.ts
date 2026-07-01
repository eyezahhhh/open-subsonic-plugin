import { ErrCode, SubsonicError } from "../subsonic.error.js";
import { User } from "../types.js";
import { CreateEndpointFunction, WebModule } from "./web-module.js";

export class UserWebModule extends WebModule {
	bind(endpoint: CreateEndpointFunction): void {
		endpoint("getUser", async ({ param, userId, userInfo }) => {
			const username = param("username");
			if (!username) {
				throw new SubsonicError(
					ErrCode.REQUIRED_PARAM_MISSING,
					"Username not specified",
				);
			}

			if (userId != userInfo?.uuid) {
				throw new SubsonicError(
					ErrCode.UNAUTHORIZED_USER,
					"Unauthorized to get user",
				);
			}

			const user: User = {
				username: userInfo.username,
				scrobblingEnabled: true,
				adminRole: false,
				settingsRole: false,
				downloadRole: true,
				uploadRole: false,
				playlistRole: true,
				coverArtRole: true,
				commentRole: false,
				podcastRole: false,
				streamRole: true,
				jukeboxRole: false,
				shareRole: false,
				videoConversionRole: false,
			};
			return { user };
		});
	}
}
