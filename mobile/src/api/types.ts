export type Account = {
  id: string;
  email: string;
  username: string | null;
  createdAt: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  account: Account;
};

export type EmailCodeChallenge = {
  challengeToken: string;
  email: string;
};

export type LoginResult = {
  emailCode: EmailCodeChallenge | null;
  tokens: AuthTokens | null;
};

export type Bookmark = {
  id: string;
  originalUrl: string;
  sourcePlatform: string;
  originalTitle: string | null;
  customTitle: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  videoDurationSeconds: number | null;
  contentType: string;
  userNotes: string | null;
  savedAt: string;
  folderIds: string[];
};

export type BookmarkPage = {
  items: Bookmark[];
  nextCursor: string | null;
};

export type Folder = {
  id: string;
  name: string;
  bookmarkCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LegacyBookmark = {
  id: string;
  url: string;
  sharedText: string;
  source: string;
  savedAt: string;
};
