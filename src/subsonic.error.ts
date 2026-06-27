export enum ErrCode {
	GENERIC = 0,
	REQUIRED_PARAM_MISSING = 10,
	CLIENT_UPGRADE_REQUIRED = 20,
	SERVER_UPGRADE_REQUIRED = 30,
	WRONG_USERNAME_PASSWORD = 40,
	TOKEN_AUTH_UNSUPPORTED_LDAP = 41,
	AUTH_TYPE_UNSUPPORTED = 42,
	CONFLICTING_AUTH_TYPES = 43,
	INVALID_API_KEY = 44,
	UNAUTHORIZED_USER = 50,
	TRIAL_PERIOD_OVER = 60, // unused
	NOT_FOUND = 70,
}

export class SubsonicError extends Error {
	constructor(
		public readonly code: ErrCode,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}
