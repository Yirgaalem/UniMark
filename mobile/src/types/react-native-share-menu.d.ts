declare module 'react-native-share-menu' {
  export type ShareData = {
    mimeType: string;
    data: string;
    extraData?: unknown;
  };

  export type ShareListener = {
    remove(): void;
  };

  const ShareMenu: {
    getInitialShare(callback: (share: ShareData | null) => void): void;
    addNewShareListener(callback: (share: ShareData | null) => void): ShareListener;
  };

  export default ShareMenu;
}
