export interface IndexID3 {
	name: string;
	artist: ArtistID3[];
}

export interface ArtistID3 {
	id: string;
	name: string;
	coverArt?: string;
	artistImageUrl?: string;
	albumCount?: number;
	starred?: string;
	musicBrainzId?: string;
	sortName?: string;
	roles?: string[];
}

export interface Artist extends ArtistID3 {
	album?: AlbumID3[];
}

export interface RecordLabel {
	name: string;
}

export interface ItemGenre {
	name: string;
}

export interface ItemDate {
	year: number;
	month: number;
	day: number;
}

export interface DiscTitle {
	disc: number;
	title: string;
	coverArt?: string;
}

export interface AlbumID3 {
	id: string;
	name: string;
	version?: string;
	artist?: string;
	artistId?: string;
	coverArt?: string;
	songCount: number;
	duration: number;
	playCount?: number;
	created: string;
	starred?: string;
	year?: number;
	genre?: string;
	played?: string;
	userRating?: number;
	recordLabels?: RecordLabel[];
	musicBrainzId?: string;
	genres?: ItemGenre[];
	artists?: ArtistID3[];
	displayArtist?: string;
	releaseTypes?: string[];
	moods?: string[];
	sortName?: string;
	originalReleaseDate?: ItemDate;
	releaseDate?: ItemDate;
	isCompilation?: boolean;
	explicitStatus?: "explicit" | "clean" | "";
	discTitles?: DiscTitle[];
}

export interface AlbumID3WithSongs extends AlbumID3 {
	song?: Child[];
}

export interface Contributor {
	role: string;
	subRole?: string;
	artist: ArtistID3;
}

export interface ReplayGain {
	trackGain?: number;
	albumGain?: number;
	trackPeak?: number;
	albumPeak?: number;
	baseGain?: number;
	fallbackGain?: number;
}

export interface Work {
	name: string;
	musicBrainzId?: string;
}

export interface Movement {
	name: string;
	number?: number;
	count?: number;
}

export interface Child {
	id: string;
	parent?: string;
	isDir: boolean;
	title: string;
	album?: string;
	artist?: string;
	track?: number;
	year?: number;
	genre?: string;
	coverArt?: string;
	size?: number;
	contentType?: string;
	suffix?: string;
	transcodedContentType?: string;
	duration?: number;
	bitRate?: number;
	bitDepth?: number;
	samplingRate?: number;
	channelCount?: number;
	path?: string;
	isVideo?: boolean;
	userRating?: number;
	averageRating?: number;
	playCount?: number;
	discNumber?: number;
	created?: string;
	starred?: string;
	albumId?: string;
	artistId?: string;
	type?: "music" | "podcast" | "audiobook" | "video";
	mediaType?: "song" | "album" | "artist";
	bookmarkPosition?: number;
	originalWidth?: number;
	originalHeight?: number;
	played?: string;
	bpm?: number;
	comment?: string;
	sortname?: string;
	musicBrainzId?: string;
	isrc?: string[];
	genres?: ItemGenre[];
	artists?: ArtistID3[];
	displayArtist?: string;
	albumArtists?: ArtistID3[];
	displayAlbumArtist?: string;
	contributors?: Contributor[];
	displayComposer?: string;
	moods?: string[];
	replayGain?: ReplayGain;
	explicitStatus?: "explicit" | "clean" | "";
	works?: Work[];
	movements?: Movement[];
	groupings?: string[];
}
