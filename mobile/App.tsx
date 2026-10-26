import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ShareMenu from 'react-native-share-menu';
import {BlurView} from '@react-native-community/blur';
import {GoogleSignin, GoogleSigninButton} from '@react-native-google-signin/google-signin';
import {apiRequest, loadSession, login, loginWithGoogle, logout, register, resendEmailCode, verifyEmailCode} from './src/api/client';
import {GOOGLE_WEB_CLIENT_ID} from './src/api/googleConfig';
import {bookmarkSourceLabel, formatVideoDuration, isArticleBookmark, isLongVideoBookmark, isShortVideoBookmark, sourceLabel} from './src/bookmarkPresentation';
import type {Account, Bookmark, BookmarkPage, EmailCodeChallenge, Folder, LegacyBookmark, LoginResult} from './src/api/types';

type IncomingShare = {mimeType: string; data: string; extraData?: unknown};
type MainTab = 'library' | 'folders' | 'settings';
type PrimaryTab = 'library' | 'folders';
type BookmarkTypeFilter = 'all' | 'short-video' | 'long-video' | 'article' | 'image';
const LEGACY_STORAGE_KEY = '@unimark/phase-2.1/bookmarks';
const DARK_MODE_STORAGE_KEY = '@unimark/dark-mode';

GoogleSignin.configure({webClientId: GOOGLE_WEB_CLIENT_ID || undefined});

function findHttpUrl(value: string): string | null {
  return value.match(/https?:\/\/[^\s<>"'`]+/i)?.[0]?.replace(/[),.;!?\]}]+$/, '') ?? null;
}

function BookmarkCardSurface({children, darkMode}: React.PropsWithChildren<{darkMode: boolean}>) {
  const scale = useRef(new Animated.Value(1)).current;
  const [emphasized, setEmphasized] = useState(false);
  const animateScale = (toValue: number) => Animated.spring(scale, {
    toValue,
    speed: 28,
    bounciness: 0,
    useNativeDriver: true,
  }).start();
  const setCardEmphasis = (active: boolean) => {
    setEmphasized(active);
    animateScale(active ? 1.018 : 1);
  };

  return (
    <Animated.View
      onPointerEnter={() => setCardEmphasis(true)}
      onPointerLeave={() => setCardEmphasis(false)}
      onTouchStart={() => setCardEmphasis(true)}
      onTouchEnd={() => setCardEmphasis(false)}
      onTouchCancel={() => setCardEmphasis(false)}
      style={[styles.bookmarkCard, darkMode && styles.darkSurface, emphasized && styles.bookmarkCardEmphasized, {transform: [{scale}]}]}>
      {children}
    </Animated.View>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [incoming, setIncoming] = useState<IncomingShare | null>(null);
  const [incomingTitle, setIncomingTitle] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('library');
  const [settingsReturnTab, setSettingsReturnTab] = useState<PrimaryTab>('library');
  const [darkMode, setDarkMode] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [bookmarkTypeFilter, setBookmarkTypeFilter] = useState<BookmarkTypeFilter>('all');
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingIncoming, setSavingIncoming] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailCodeChallenge, setEmailCodeChallenge] = useState<EmailCodeChallenge | null>(null);
  const [emailCode, setEmailCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailCodeNotice, setEmailCodeNotice] = useState('');
  const [manageFoldersVisible, setManageFoldersVisible] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderBookmark, setFolderBookmark] = useState<Bookmark | null>(null);
  const [membershipDraft, setMembershipDraft] = useState<string[]>([]);
  const [legacyBookmarks, setLegacyBookmarks] = useState<LegacyBookmark[]>([]);
  const [legacyDismissed, setLegacyDismissed] = useState(false);
  const [importingLegacy, setImportingLegacy] = useState(false);
  const previewRefreshAttempted = useRef(new Set<string>());

  const incomingUrl = useMemo(() => incoming ? findHttpUrl(incoming.data) : null, [incoming]);
  const visibleBookmarks = useMemo(() => {
    const query = bookmarkSearch.trim().toLowerCase();
    return bookmarks.filter(bookmark => {
      const matchesType = bookmarkTypeFilter === 'all'
        || (bookmarkTypeFilter === 'short-video' && isShortVideoBookmark(bookmark))
        || (bookmarkTypeFilter === 'long-video' && isLongVideoBookmark(bookmark))
        || (bookmarkTypeFilter === 'article' && isArticleBookmark(bookmark))
        || (bookmarkTypeFilter === 'image' && bookmark.contentType === 'image');
      const matchesSearch = !query || [
        bookmark.customTitle,
        bookmark.originalTitle,
        bookmark.originalUrl,
        bookmark.sourcePlatform,
      ].some(value => value?.toLowerCase().includes(query));
      return matchesType && matchesSearch;
    });
  }, [bookmarkSearch, bookmarkTypeFilter, bookmarks]);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadSession(), AsyncStorage.getItem(DARK_MODE_STORAGE_KEY)]).then(async ([session, theme]) => {
      if (mounted) setDarkMode(theme === 'dark');
      if (mounted && session) {
        try {
          const profile = await apiRequest<Account>('/me');
          if (profile.username) {
            if (mounted) setAccount(profile);
          } else {
            await logout().catch(() => undefined);
            if (mounted) setNotice('Please sign in to continue account setup.');
          }
        } catch {
          if (session.account.username) {
            if (mounted) setAccount(session.account);
          } else {
            await logout().catch(() => undefined);
            if (mounted) setNotice('Please sign in to continue account setup.');
          }
        }
      }
    }).catch(() => {
      if (mounted) setNotice('Could not read the saved sign-in session. Please sign in again.');
    }).finally(() => {
      if (mounted) setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (account?.username == null) setUsernameDraft('');
    setUsernameError('');
  }, [account?.id, account?.username]);

  useEffect(() => {
    if (!emailCodeChallenge || resendCooldown === 0) return;
    const timeout = setTimeout(() => setResendCooldown(seconds => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timeout);
  }, [emailCodeChallenge, resendCooldown]);

  const changeDarkMode = async (enabled: boolean) => {
    setDarkMode(enabled);
    try {
      await AsyncStorage.setItem(DARK_MODE_STORAGE_KEY, enabled ? 'dark' : 'light');
    } catch {
      setNotice('Could not save the appearance preference on this device.');
    }
  };

  const saveUsername = async () => {
    const username = usernameDraft.trim();
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
      setUsernameError('Use 3–24 letters, numbers, or underscores.');
      return;
    }
    setUsernameSaving(true);
    setUsernameError('');
    try {
      const updated = await apiRequest<Account>('/me', {method: 'PATCH', body: JSON.stringify({username})});
      setAccount(updated);
      setUsernameDraft(updated.username ?? username);
      setNotice('Username saved.');
    } catch (error) {
      setUsernameError(errorMessage(error));
    } finally {
      setUsernameSaving(false);
    }
  };

  const receiveShare = useCallback((share: IncomingShare | null) => {
    if (!share) return;
    setActiveTab('library');
    setIncoming(share);
    setIncomingTitle('');
    setNotice(findHttpUrl(share.data)
      ? `Received ${share.mimeType || 'shared'} content. Review it and save it to your account.`
      : 'The shared content did not contain a supported http or https link.');
  }, []);

  useEffect(() => {
    ShareMenu.getInitialShare(receiveShare);
    const listener = ShareMenu.addNewShareListener(receiveShare);
    return () => listener.remove();
  }, [receiveShare]);

  const refreshData = useCallback(async (folderId: string | null = selectedFolderId) => {
    if (!account) return;
    setLoading(true);
    try {
      const [nextFolders, firstPage] = await Promise.all([
        apiRequest<Folder[]>('/folders'),
        apiRequest<BookmarkPage>(`/bookmarks?limit=100${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''}`),
      ]);
      let allItems = [...firstPage.items];
      let cursor = firstPage.nextCursor;
      while (cursor) {
        const nextPage = await apiRequest<BookmarkPage>(`/bookmarks?limit=100&cursor=${encodeURIComponent(cursor)}${folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''}`);
        allItems = allItems.concat(nextPage.items);
        cursor = nextPage.nextCursor;
      }
      setFolders(nextFolders);
      setBookmarks(allItems);
      setTitleDrafts(previous => ({...previous, ...Object.fromEntries(allItems.map(item => [item.id, item.customTitle ?? '']))}));
      setNotice('');

      // Fill missing metadata for existing bookmarks in the background. The backend
      // throttles retries, while this set prevents duplicate requests during this app session.
      const needsPreview = allItems.filter(item =>
        (!item.thumbnailUrl || !item.originalTitle) && !previewRefreshAttempted.current.has(item.id));
      needsPreview.forEach(item => previewRefreshAttempted.current.add(item.id));
      void (async () => {
        for (let index = 0; index < needsPreview.length; index += 3) {
          const batch = needsPreview.slice(index, index + 3);
          await Promise.allSettled(batch.map(async item => {
            const refreshed = await apiRequest<Bookmark>(`/bookmarks/${encodeURIComponent(item.id)}/preview/refresh`, {method: 'POST'});
            setBookmarks(current => current.map(bookmark => bookmark.id === refreshed.id ? refreshed : bookmark));
          }));
        }
      })();
    } catch (error) {
      setNotice(`Could not load your account data: ${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, [account, selectedFolderId]);

  useEffect(() => {
    if (!account) return;
    refreshData(selectedFolderId);
    AsyncStorage.getItem(LEGACY_STORAGE_KEY).then(value => {
      if (!value) return;
      try {
        setLegacyBookmarks(JSON.parse(value) as LegacyBookmark[]);
      } catch {
        setNotice('Found unreadable device-only links from the earlier prototype. Your account data is unaffected.');
      }
    });
  }, [account, refreshData, selectedFolderId]);

  const acceptAuthFlow = (result: LoginResult) => {
    if (result.emailCode) {
      setEmailCodeChallenge(result.emailCode);
      setEmailCode('');
      setEmailCodeNotice('');
      setResendCooldown(60);
    } else if (result.tokens) {
      setAccount(result.tokens.account);
    }
  };

  const handleAuth = async () => {
    setAuthError('');
    setLoading(true);
    try {
      if (authMode === 'register') {
        setEmailCodeChallenge(await register(email.trim(), password));
        setEmailCode('');
        setEmailCodeNotice('');
        setResendCooldown(60);
      } else {
        acceptAuthFlow(await login(email.trim(), password));
      }
      setPassword('');
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const submitEmailCode = async () => {
    const code = emailCode.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      setAuthError('Enter the 6-digit code from your email.');
      return;
    }
    setAuthError('');
    setLoading(true);
    try {
      if (!emailCodeChallenge) throw new Error('This email code has expired. Please sign in again.');
      const tokens = await verifyEmailCode(emailCodeChallenge.challengeToken, code);
      setEmailCodeChallenge(null);
      setEmailCode('');
      setAccount(tokens.account);
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!emailCodeChallenge || resendCooldown > 0) return;
    setLoading(true);
    setAuthError('');
    try {
      setEmailCodeChallenge(await resendEmailCode(emailCodeChallenge.challengeToken));
      setEmailCode('');
      setEmailCodeNotice('A new code has been sent. Use the latest email.');
      setResendCooldown(60);
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const cancelEmailCode = () => {
    setEmailCodeChallenge(null);
    setEmailCode('');
    setEmailCodeNotice('');
    setAuthError('');
  };

  const changeAuthMode = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setEmail('');
    setPassword('');
    setAuthError('');
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    if (!GOOGLE_WEB_CLIENT_ID) {
      setAuthError('Google sign-in needs OAuth setup. Add the Web client ID in mobile/src/api/googleConfig.ts and the project root .env, then rebuild.');
      return;
    }
    setLoading(true);
    try {
      // Clear the previously selected Google account so users can choose a different one.
      await GoogleSignin.signOut().catch(() => undefined);
      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});
      const response = await GoogleSignin.signIn();
      if (response.type !== 'success') return;
      const idToken = response.data.idToken;
      if (!idToken) throw new Error('Google did not return an ID token. Check the Web OAuth client ID configuration.');
      const result = await loginWithGoogle(idToken);
      acceptAuthFlow(result);
      setEmail('');
      setPassword('');
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await logout();
    await GoogleSignin.signOut().catch(() => undefined);
    setAccount(null);
    setBookmarks([]);
    setFolders([]);
    setNotice('You are signed out. Your account data remains on the server.');
  };

  const saveIncoming = async () => {
    if (!incomingUrl || !account || savingIncoming) return;
    setSavingIncoming(true);
    try {
      await apiRequest<Bookmark>('/bookmarks', {
        method: 'POST',
        body: JSON.stringify({
          originalUrl: incomingUrl,
          customTitle: incomingTitle.trim() || null,
          folderIds: selectedFolderId ? [selectedFolderId] : [],
        }),
      });
      setIncoming(null);
      setIncomingTitle('');
      setNotice('Saved to your account.');
      await refreshData(selectedFolderId);
    } catch (error) {
      setNotice(`Could not save the link: ${errorMessage(error)}`);
    } finally {
      setSavingIncoming(false);
    }
  };

  const saveTitle = async (bookmark: Bookmark) => {
    try {
      const updated = await apiRequest<Bookmark>(`/bookmarks/${bookmark.id}`, {
        method: 'PATCH', body: JSON.stringify({customTitle: titleDrafts[bookmark.id] ?? ''}),
      });
      setBookmarks(items => items.map(item => item.id === updated.id ? updated : item));
      setEditingTitleId(null);
      setNotice('Bookmark title updated.');
    } catch (error) {
      setNotice(`Could not update the title: ${errorMessage(error)}`);
    }
  };

  const confirmDeleteBookmark = (bookmark: Bookmark) => Alert.alert(
    'Delete bookmark?', 'This removes it from your account library.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiRequest<void>(`/bookmarks/${bookmark.id}`, {method: 'DELETE'});
          setBookmarks(items => items.filter(item => item.id !== bookmark.id));
          setNotice('Bookmark deleted.');
          await refreshData(selectedFolderId);
        } catch (error) { setNotice(`Could not delete bookmark: ${errorMessage(error)}`); }
      }},
    ],
  );

  const saveFolder = async () => {
    try {
      if (editingFolderId) {
        await apiRequest<Folder>(`/folders/${editingFolderId}`, {method: 'PATCH', body: JSON.stringify({name: folderName})});
        setNotice('Folder renamed.');
      } else {
        await apiRequest<Folder>('/folders', {method: 'POST', body: JSON.stringify({name: folderName})});
        setNotice('Folder created.');
      }
      setFolderName('');
      setEditingFolderId(null);
      await refreshData(selectedFolderId);
    } catch (error) { setNotice(`Could not save folder: ${errorMessage(error)}`); }
  };

  const deleteFolder = (folder: Folder) => Alert.alert(
    'Delete folder?', 'Bookmarks will remain in your library, but will be removed from this folder.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiRequest<void>(`/folders/${folder.id}`, {method: 'DELETE'});
          if (selectedFolderId === folder.id) setSelectedFolderId(null);
          setNotice('Folder deleted. Its bookmarks remain in your library.');
          await refreshData(selectedFolderId === folder.id ? null : selectedFolderId);
        } catch (error) { setNotice(`Could not delete folder: ${errorMessage(error)}`); }
      }},
    ],
  );

  const saveMembership = async () => {
    if (!folderBookmark) return;
    try {
      const updated = await apiRequest<Bookmark>(`/bookmarks/${folderBookmark.id}/folders`, {
        method: 'PUT', body: JSON.stringify({folderIds: membershipDraft}),
      });
      setFolderBookmark(null);
      setBookmarks(items => items.map(item => item.id === updated.id ? updated : item));
      await refreshData(selectedFolderId);
      setNotice('Bookmark folders updated.');
    } catch (error) { setNotice(`Could not update folders: ${errorMessage(error)}`); }
  };

  const importLegacy = async () => {
    setImportingLegacy(true);
    try {
      const originalCount = legacyBookmarks.length;
      const remaining = [...legacyBookmarks];
      for (const item of legacyBookmarks) {
        await apiRequest<Bookmark>('/bookmarks', {
          method: 'POST', body: JSON.stringify({originalUrl: item.url, folderIds: []}),
        });
        remaining.shift();
        setLegacyBookmarks([...remaining]);
        if (remaining.length) await AsyncStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(remaining));
      }
      await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
      setLegacyBookmarks([]);
      setLegacyDismissed(false);
      setNotice(`Imported ${originalCount} device-only bookmark${originalCount === 1 ? '' : 's'} to your account.`);
      await refreshData(selectedFolderId);
    } catch (error) {
      setNotice(`Import stopped: ${errorMessage(error)}. The original device copy is still kept.`);
    } finally { setImportingLegacy(false); }
  };

  const renderFolderTile = (folder: Folder | null) => {
    const folderId = folder?.id ?? null;
    const contents = bookmarks.filter(item => folderId === null || item.folderIds.includes(folderId));
    const previews = contents.filter(item => item.thumbnailUrl).slice(0, 3);
    const name = folder?.name ?? 'All saved links';
    return (
      <TouchableOpacity
        key={folderId ?? 'all-links'}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${contents.length} ${contents.length === 1 ? 'link' : 'links'}`}
        accessibilityState={{selected: selectedFolderId === folderId}}
        style={[styles.folderTile, darkMode && styles.darkSurface, selectedFolderId === folderId && styles.folderTileSelected, darkMode && selectedFolderId === folderId && styles.darkFolderTileSelected]}
        onPress={() => {setSelectedFolderId(folderId); setActiveTab('library');}}>
        <View style={styles.folderIllustration}>
          <View style={styles.folderTab} />
          <View style={styles.folderShape}>
            {previews.length === 0 ? (
              <View style={styles.folderNoPreviews}><Text style={styles.folderNoPreviewsText}>No image previews</Text></View>
            ) : (
              <View style={styles.folderPreviewCollage}>
                <Image source={{uri: previews[0].thumbnailUrl!}} style={[styles.folderThumbnail, previews.length === 1 ? styles.folderThumbnailSolo : styles.folderThumbnailLead]} resizeMode="cover" />
                {previews.length > 1 && <View style={styles.folderThumbnailStack}>
                  {previews.slice(1).map(item => <Image key={item.id} source={{uri: item.thumbnailUrl!}} style={styles.folderThumbnail} resizeMode="cover" />)}
                </View>}
              </View>
            )}
          </View>
        </View>
        <View style={styles.folderTileInfo}>
          <View style={styles.folderTileText}>
              <Text style={[styles.folderTileName, darkMode && styles.darkText]} numberOfLines={1}>{name}</Text>
              <Text style={[styles.folderTileCount, darkMode && styles.darkMutedText]}>{contents.length} {contents.length === 1 ? 'link' : 'links'}</Text>
          </View>
          <Text style={styles.folderTileChevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (!ready) {
    return <SafeAreaView style={styles.safeArea}><StatusBar barStyle="dark-content" /><View style={styles.centered}><ActivityIndicator size="large" color="#b94f36" /></View></SafeAreaView>;
  }

  if (!account && emailCodeChallenge) {
    return (
      <SafeAreaView style={[styles.safeArea, darkMode && styles.darkSafeArea]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={[styles.authScreen, darkMode && styles.darkAuthScreen]} keyboardShouldPersistTaps="handled">
          <View style={[styles.authPanel, darkMode && styles.darkSurface]}>
            <Text style={[styles.title, darkMode && styles.darkText]}>Check your email</Text>
            <Text style={[styles.bodyText, darkMode && styles.darkMutedText]}>We sent a 6-digit code to {emailCodeChallenge.email}. It expires in 10 minutes.</Text>
            <Text style={[styles.fieldLabel, darkMode && styles.darkMutedText]}>Email code</Text>
            <TextInput
              accessibilityLabel="Email verification code"
              autoFocus
              autoCapitalize="none"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              placeholderTextColor={darkMode ? '#929b94' : '#9a9183'}
              value={emailCode}
              onChangeText={value => {setEmailCode(value.replace(/\D/g, '').slice(0, 6)); setAuthError('');}}
              style={[styles.input, darkMode && styles.darkInput]}
            />
            {!!authError && <Text style={styles.errorText}>{authError}</Text>}
            {!!emailCodeNotice && <Text style={[styles.helperText, darkMode && styles.darkMutedText]}>{emailCodeNotice}</Text>}
            <TouchableOpacity accessibilityRole="button" disabled={loading} style={[styles.primaryButton, loading && styles.disabledButton]} onPress={submitEmailCode}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify and continue</Text>}
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={loading || resendCooldown > 0} style={styles.textAction} onPress={resendCode}>
              <Text style={styles.linkButton}>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={cancelEmailCode}>
              <Text style={styles.linkButton}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!account) {
    return (
      <SafeAreaView style={[styles.safeArea, darkMode && styles.darkSafeArea]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <ScrollView contentContainerStyle={[styles.authScreen, darkMode && styles.darkAuthScreen]} keyboardShouldPersistTaps="handled">
          <View style={styles.authMasthead}>
            <Text style={styles.brandMark}>UniMrk</Text>
          </View>
          <View style={[styles.authPanel, darkMode && styles.darkSurface]}>
          <View style={styles.authTabs}>
            <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected: authMode === 'login'}} style={[styles.authTab, authMode === 'login' && styles.authTabSelected]} onPress={() => changeAuthMode('login')}>
              <Text style={[styles.authTabText, authMode === 'login' && styles.authTabTextSelected]}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected: authMode === 'register'}} style={[styles.authTab, authMode === 'register' && styles.authTabSelected]} onPress={() => changeAuthMode('register')}>
              <Text style={[styles.authTabText, authMode === 'register' && styles.authTabTextSelected]}>Create account</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.fieldLabel, darkMode && styles.darkMutedText]}>{authMode === 'login' ? 'Email or username' : 'Email'}</Text>
          <TextInput autoCapitalize="none" autoCorrect={false} autoComplete={authMode === 'login' ? 'username' : 'email'} keyboardType={authMode === 'login' ? 'default' : 'email-address'} placeholder={authMode === 'login' ? 'Email address or username' : 'you@example.com'} placeholderTextColor={darkMode ? '#929b94' : '#9a9183'} value={email} onChangeText={setEmail} style={[styles.input, darkMode && styles.darkInput]} />
          <Text style={[styles.fieldLabel, darkMode && styles.darkMutedText]}>Password</Text>
          <TextInput secureTextEntry autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} placeholder="10–72 characters" placeholderTextColor={darkMode ? '#929b94' : '#9a9183'} value={password} onChangeText={setPassword} style={[styles.input, darkMode && styles.darkInput]} />
          {!!authError && <Text style={styles.errorText}>{authError}</Text>}
          <TouchableOpacity disabled={loading} style={[styles.primaryButton, loading && styles.disabledButton]} onPress={handleAuth}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{authMode === 'login' ? 'Sign in' : 'Create account'}</Text>}
          </TouchableOpacity>
          <View style={styles.authDivider}><View style={styles.authRule} /><Text style={styles.authDividerText}>OR</Text><View style={styles.authRule} /></View>
          <GoogleSigninButton
            size={GoogleSigninButton.Size.Wide}
            color={GoogleSigninButton.Color.Light}
            disabled={loading}
            onPress={handleGoogleAuth}
            style={styles.googleButton}
          />
          {incoming && <Text style={styles.noticeText}>Your shared link is waiting here. Sign in to save it to your account.</Text>}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!account.username) {
    return (
      <SafeAreaView style={[styles.safeArea, darkMode && styles.darkSafeArea]}>
        <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
        <View style={[styles.container, styles.accountSetupPage, darkMode && styles.darkContainer]}>
          <Text style={[styles.title, darkMode && styles.darkText]}>Choose your username</Text>
          <Text style={[styles.bodyText, darkMode && styles.darkMutedText]}>This name identifies you in UniMark. You can change it later in Settings.</Text>
          <Text style={[styles.fieldLabel, darkMode && styles.darkMutedText]}>Username</Text>
          <TextInput
            accessibilityLabel="Choose a username"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            placeholder="e.g. booklover42"
            placeholderTextColor={darkMode ? '#929b94' : '#9a9183'}
            value={usernameDraft}
            onChangeText={value => {setUsernameDraft(value); setUsernameError('');}}
            style={[styles.input, darkMode && styles.darkInput]}
          />
          <Text style={[styles.helperText, darkMode && styles.darkMutedText]}>3–24 characters: letters, numbers, and underscores.</Text>
          {!!usernameError && <Text style={styles.errorText}>{usernameError}</Text>}
          <TouchableOpacity accessibilityRole="button" disabled={usernameSaving} style={[styles.primaryButton, usernameSaving && styles.disabledButton]} onPress={saveUsername}>
            {usernameSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Continue</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, darkMode && styles.darkSafeArea]}>
      <StatusBar barStyle={darkMode ? 'light-content' : 'dark-content'} />
      <View style={[styles.container, darkMode && styles.darkContainer]}>
        <View style={[styles.header, darkMode && styles.darkHeader]}>
          <View>
            <Text style={[styles.title, darkMode && styles.darkText]}><Text style={styles.brandUni}>Uni</Text>/Mark</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open menu" style={styles.menuButton} onPress={() => setMenuVisible(true)}>
            <View style={styles.menuLine} /><View style={styles.menuLine} /><View style={styles.menuLine} />
          </TouchableOpacity>
        </View>

        {activeTab === 'settings' ? <ScrollView style={styles.settingsPage} contentContainerStyle={styles.settingsContent}>
          <View style={styles.settingsHeader}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" style={styles.folderBackButton} onPress={() => setActiveTab(settingsReturnTab)}>
              <Text style={styles.folderBackArrow}>‹</Text><Text style={styles.folderBackText}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.libraryTitle, darkMode && styles.darkText]}>Settings</Text>
          </View>
          <View style={[styles.settingsCard, darkMode && styles.darkSurface]}>
            <Text style={[styles.settingsTitle, darkMode && styles.darkText]}>Username</Text>
            <Text style={[styles.bodyText, darkMode && styles.darkMutedText]}>Your username must be unique across UniMark.</Text>
            <TextInput
              accessibilityLabel="Change username"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              placeholder="Your username"
              placeholderTextColor={darkMode ? '#929b94' : '#9a9183'}
              value={usernameDraft}
              onChangeText={value => {setUsernameDraft(value); setUsernameError('');}}
              style={[styles.input, darkMode && styles.darkInput]}
            />
            {!!usernameError && <Text style={styles.errorText}>{usernameError}</Text>}
            <TouchableOpacity accessibilityRole="button" disabled={usernameSaving || usernameDraft.trim() === account.username} style={[styles.primaryButton, (usernameSaving || usernameDraft.trim() === account.username) && styles.disabledButton]} onPress={saveUsername}>
              {usernameSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save username</Text>}
            </TouchableOpacity>
          </View>
          <View style={[styles.settingsCard, darkMode && styles.darkSurface]}>
            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={[styles.settingsTitle, darkMode && styles.darkText]}>Dark mode</Text>
                <Text style={[styles.bodyText, darkMode && styles.darkMutedText]}>Use a darker appearance on this device.</Text>
              </View>
              <Switch accessibilityLabel="Dark mode" value={darkMode} onValueChange={changeDarkMode} trackColor={{false: '#c8d1ca', true: '#78916d'}} thumbColor={darkMode ? '#dce8d5' : '#f7f8f6'} />
            </View>
          </View>
        </ScrollView> : activeTab === 'library' ? searchOpen ? <View style={styles.searchPage}>
          <View style={styles.searchPageHeader}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to library" style={styles.folderBackButton} onPress={() => {setSearchOpen(false); setBookmarkSearch(''); setBookmarkTypeFilter('all');}}>
              <Text style={styles.folderBackArrow}>‹</Text><Text style={styles.folderBackText}>Back</Text>
            </TouchableOpacity>
            <Text style={[styles.searchPageTitle, darkMode && styles.darkText]}>Search</Text>
            <View style={styles.searchHeaderSpacer} />
          </View>
          <View style={[styles.searchBox, styles.searchPageInput, darkMode && styles.darkSearchBox]}>
            <TextInput
              accessibilityLabel="Search saved links by title, URL, or source"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onChangeText={setBookmarkSearch}
              placeholder="Search your saved links"
              placeholderTextColor={darkMode ? '#929b94' : '#858a9c'}
              returnKeyType="search"
              style={[styles.searchInput, darkMode && styles.darkSearchInput]}
              value={bookmarkSearch}
            />
            {!!bookmarkSearch && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setBookmarkSearch('')} style={styles.clearSearchButton}><Text style={styles.clearSearchText}>Clear</Text></TouchableOpacity>}
          </View>
          {visibleBookmarks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, darkMode && styles.darkText]}>{bookmarks.length === 0 ? 'No saved links yet' : 'No matching links'}</Text>
              <Text style={[styles.emptyBody, darkMode && styles.darkMutedText]}>{bookmarks.length === 0 ? 'Links you save will appear here.' : 'Try another search or content filter.'}</Text>
            </View>
          ) : (
            <FlatList
              style={styles.searchResultsList}
              data={visibleBookmarks}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.searchResultsContent}
              renderItem={({item}) => (
                <TouchableOpacity accessibilityRole="link" accessibilityLabel={`Open ${item.customTitle || item.originalTitle || item.originalUrl}`} style={[styles.searchResultCard, darkMode && styles.darkSurface]} onPress={() => Linking.openURL(item.originalUrl).catch(() => setNotice('Could not open this link.'))}>
                  {item.thumbnailUrl ? <Image source={{uri: item.thumbnailUrl}} style={styles.searchResultThumbnail} resizeMode="cover" /> : <View style={styles.searchResultThumbnailFallback}><Text style={styles.searchResultFallbackText}>{bookmarkSourceLabel(item.sourcePlatform, item.originalUrl)}</Text></View>}
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.searchResultSource}>{bookmarkSourceLabel(item.sourcePlatform, item.originalUrl)}</Text>
                    <Text style={[styles.searchResultTitle, darkMode && styles.darkText]} numberOfLines={2}>{item.customTitle || item.originalTitle || item.originalUrl}</Text>
                    <Text style={[styles.searchResultUrl, darkMode && styles.darkMutedText]} numberOfLines={1}>{item.originalUrl}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
          <View style={[styles.searchFilters, darkMode && styles.darkSearchFilters]}>
            <Text style={[styles.searchFilterLabel, darkMode && styles.darkMutedText]}>Filter by</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.searchFilterScroll} contentContainerStyle={styles.searchFilterRow}>
              {([
                ['all', 'All'],
                ['short-video', 'Short videos (<2m)'],
                ['long-video', 'Long videos (2m+)'],
                ['article', 'Articles'],
                ['image', 'Images'],
              ] as const).map(([filter, label]) => (
                <TouchableOpacity key={filter} accessibilityRole="button" accessibilityState={{selected: bookmarkTypeFilter === filter}} style={[styles.chip, darkMode && bookmarkTypeFilter !== filter && styles.darkChip, bookmarkTypeFilter === filter && styles.selectedChip]} onPress={() => setBookmarkTypeFilter(filter)}>
                  <Text style={[styles.chipText, darkMode && bookmarkTypeFilter !== filter && styles.darkChipText, bookmarkTypeFilter === filter && styles.selectedChipText]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View> : <>
        {!!notice && <View style={[styles.noticeCard, darkMode && styles.darkNoticeCard]}>
          <Text style={[styles.noticeText, darkMode && styles.darkMutedText]}>{notice}</Text>
        </View>}

        {incoming && (
          <View style={[styles.incomingCard, darkMode && styles.darkSurface]}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>INCOMING LINK · {incoming.mimeType || 'shared content'}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss incoming link" style={styles.textAction} onPress={() => setIncoming(null)}><Text style={styles.linkButton}>Dismiss</Text></TouchableOpacity>
            </View>
            <Text style={[styles.sourceText, darkMode && styles.darkText]}>{incomingUrl ? sourceLabel(incomingUrl) : 'No supported URL found'}</Text>
            <Text selectable style={[styles.sharedText, darkMode && styles.darkSharedText]}>{incoming.data}</Text>
            <TextInput placeholder="Custom title (optional)" placeholderTextColor={darkMode ? '#929b94' : '#9a9183'} value={incomingTitle} onChangeText={setIncomingTitle} style={[styles.input, darkMode && styles.darkInput]} />
            <TouchableOpacity disabled={!incomingUrl || savingIncoming} style={[styles.primaryButton, !incomingUrl && styles.disabledButton]} onPress={saveIncoming}>
              {savingIncoming ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save to account</Text>}
            </TouchableOpacity>
          </View>
        )}

        {legacyBookmarks.length > 0 && !legacyDismissed && (
          <View style={styles.legacyCard}>
            <Text style={styles.legacyTitle}>{legacyBookmarks.length} device-only link{legacyBookmarks.length === 1 ? '' : 's'} from the prototype</Text>
            <Text style={styles.noticeText}>Import them into this account? The local copy is kept unless the entire import succeeds.</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setLegacyDismissed(true)}><Text style={styles.secondaryButtonText}>Not now</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} disabled={importingLegacy} onPress={importLegacy}>
                {importingLegacy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Import links</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.libraryHeader}>
          {selectedFolderId ? (
            <View style={styles.folderLibraryHeading}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to folders" style={styles.folderBackButton} onPress={() => {setSelectedFolderId(null); setActiveTab('folders');}}>
                <Text style={styles.folderBackArrow}>‹</Text><Text style={styles.folderBackText}>Folders</Text>
              </TouchableOpacity>
              <Text style={[styles.libraryTitle, darkMode && styles.darkText]} numberOfLines={1}>{folders.find(f => f.id === selectedFolderId)?.name ?? 'Folder'}</Text>
            </View>
          ) : <Text style={styles.libraryTitle}>Saved links</Text>}
          <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => refreshData(selectedFolderId)}><Text style={styles.linkButton}>Refresh</Text></TouchableOpacity>
        </View>

        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open search" style={[styles.searchBox, darkMode && styles.darkSearchBox]} onPress={() => {setBookmarkSearch(''); setBookmarkTypeFilter('all'); setSearchOpen(true);}}>
          <View style={styles.searchIcon}><View style={styles.searchIconHandle} /></View>
          <Text style={[styles.searchPlaceholder, darkMode && styles.darkMutedText]}>Search titles, URLs, or sources</Text>
        </TouchableOpacity>

        {loading ? <View style={styles.centered}><ActivityIndicator color="#5145e5" /></View> : visibleBookmarks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, darkMode && styles.darkText]}>{bookmarks.length === 0 ? (selectedFolderId ? 'No bookmarks in this folder yet' : 'No bookmarks saved yet') : 'No matching bookmarks'}</Text>
            <Text style={[styles.emptyBody, darkMode && styles.darkMutedText]}>{bookmarks.length === 0 ? 'Share a link from another app to save it to your account.' : 'Try another title, URL, or source, or clear your search.'}</Text>
            {bookmarks.length > 0 && <TouchableOpacity accessibilityRole="button" onPress={() => setBookmarkSearch('')} style={styles.emptyClearButton}><Text style={styles.linkButton}>Clear search</Text></TouchableOpacity>}
          </View>
        ) : (
          <FlatList
            data={visibleBookmarks}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({item}) => (
              <BookmarkCardSurface darkMode={darkMode}>
                <View style={styles.rowBetween}>
                  <View style={styles.previewMetaLeft}>
                    <Text style={styles.sourcePill}>{bookmarkSourceLabel(item.sourcePlatform, item.originalUrl)}</Text>
                    {item.videoDurationSeconds != null && <Text style={styles.durationText}>{formatVideoDuration(item.videoDurationSeconds)}</Text>}
                  </View>
                  <Text style={styles.dateText}>{new Date(item.savedAt).toLocaleDateString()}</Text>
                </View>
                {item.thumbnailUrl ? (
                  <TouchableOpacity
                    accessibilityRole="link"
                    accessibilityLabel={`Open ${item.customTitle || item.originalTitle || bookmarkSourceLabel(item.sourcePlatform)}`}
                    activeOpacity={0.9}
                    onPress={() => Linking.openURL(item.originalUrl).catch(() => setNotice('Could not open this link.'))}
                    style={styles.previewImageFrame}>
                    <Image source={{uri: item.thumbnailUrl}} style={styles.previewImage} resizeMode="cover" />
                  </TouchableOpacity>
                ) : null}
                <View style={styles.titleRow}>
                  {editingTitleId === item.id ? (
                    <TextInput autoFocus value={titleDrafts[item.id] ?? ''} onChangeText={value => setTitleDrafts(previous => ({...previous, [item.id]: value}))} style={[styles.input, styles.titleInput]} />
                  ) : (
                    <TouchableOpacity style={styles.bookmarkTitleButton} onPress={() => Linking.openURL(item.originalUrl).catch(() => setNotice('Could not open this link.'))}>
                      <Text style={[styles.clippingTitle, darkMode && styles.darkText]} numberOfLines={2}>{item.customTitle || item.originalTitle || item.originalUrl}</Text>
                    </TouchableOpacity>
                  )}
                  {editingTitleId === item.id ? (
                    <TouchableOpacity hitSlop={{top: 4, bottom: 4, left: 4, right: 4}} style={styles.compactAction} onPress={() => saveTitle(item)}><Text style={styles.secondaryButtonText}>Save</Text></TouchableOpacity>
                  ) : (
                    <TouchableOpacity hitSlop={{top: 5, bottom: 5, left: 5, right: 5}} accessibilityRole="button" accessibilityLabel={`Edit title for ${item.customTitle || item.originalTitle || item.originalUrl}`} style={styles.editButton} onPress={() => setEditingTitleId(item.id)}>
                      <View style={styles.editFrame}><View style={styles.editPencil} /><View style={styles.editPencilTip} /></View>
                    </TouchableOpacity>
                  )}
                </View>
                {!!item.description && <Text style={[styles.previewDescription, darkMode && styles.darkMutedText]} numberOfLines={2}>{item.description}</Text>}
                {editingTitleId === item.id && <TouchableOpacity accessibilityRole="button" style={styles.cancelEditButton} onPress={() => {setEditingTitleId(null); setTitleDrafts(previous => ({...previous, [item.id]: item.customTitle ?? ''}));}}><Text style={styles.cancelEditText}>Cancel</Text></TouchableOpacity>}
                <View style={styles.actions}>
                  <TouchableOpacity hitSlop={{top: 7, bottom: 7, left: 4, right: 4}} style={styles.compactAction} onPress={() => {setFolderBookmark(item); setMembershipDraft(item.folderIds);}}><Text style={styles.compactButtonText}>Folders ({item.folderIds.length})</Text></TouchableOpacity>
                  <TouchableOpacity hitSlop={{top: 7, bottom: 7, left: 4, right: 4}} style={styles.compactAction} onPress={() => confirmDeleteBookmark(item)}><Text style={styles.compactDeleteText}>Delete</Text></TouchableOpacity>
                </View>
              </BookmarkCardSurface>
            )}
          />
        )}
        </> : <ScrollView style={styles.folderScreen} contentContainerStyle={styles.folderScreenContent}>
          <View style={[styles.folderScreenHeader, darkMode && styles.darkHeader]}>
            <Text style={[styles.libraryTitle, darkMode && styles.darkText]}>Your folders</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => setManageFoldersVisible(true)}><Text style={styles.linkButton}>Manage</Text></TouchableOpacity>
          </View>
          <View style={styles.folderGrid}>
            {renderFolderTile(null)}
            {folders.map(folder => renderFolderTile(folder))}
          </View>
          {folders.length === 0 && <View style={styles.folderEmptyState}>
            <Text style={styles.emptyBody}>Create folders to group related links.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setManageFoldersVisible(true)}><Text style={styles.primaryButtonText}>Create a folder</Text></TouchableOpacity>
          </View>}
        </ScrollView>}

        {!searchOpen && activeTab !== 'settings' && <View style={styles.bottomTabs}>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected: activeTab === 'library' && selectedFolderId === null}} style={[styles.bottomTab, activeTab === 'library' && selectedFolderId === null && styles.bottomTabSelected]} onPress={() => {setSelectedFolderId(null); setActiveTab('library');}}>
            <Text style={[styles.bottomTabText, activeTab === 'library' && selectedFolderId === null && styles.bottomTabTextSelected]}>Library</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{selected: activeTab === 'folders' || selectedFolderId !== null}} style={[styles.bottomTab, (activeTab === 'folders' || selectedFolderId !== null) && styles.bottomTabSelected]} onPress={() => {setSelectedFolderId(null); setActiveTab('folders');}}>
            <Text style={[styles.bottomTabText, (activeTab === 'folders' || selectedFolderId !== null) && styles.bottomTabTextSelected]}>Folders</Text>
          </TouchableOpacity>
        </View>}
      </View>

      {menuVisible && <BlurView pointerEvents="none" style={styles.menuBlur} blurType={darkMode ? 'dark' : 'light'} blurAmount={18} reducedTransparencyFallbackColor={darkMode ? '#171b18' : '#f7f8f6'} />}
      {menuVisible && <View style={styles.menuOverlay}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close menu" style={styles.menuDismissArea} onPress={() => setMenuVisible(false)} />
        <View style={styles.menuActions}>
          <TouchableOpacity accessibilityRole="button" style={[styles.floatingMenuButton, darkMode && styles.darkFloatingMenuButton]} onPress={() => {
            setMenuVisible(false);
            setSettingsReturnTab(activeTab === 'folders' ? 'folders' : 'library');
            setUsernameDraft(account.username ?? '');
            setUsernameError('');
            setSearchOpen(false);
            setActiveTab('settings');
          }}>
            <Text style={[styles.secondaryButtonText, darkMode && styles.darkText]}>Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={[styles.floatingMenuButton, darkMode && styles.darkFloatingMenuButton]} onPress={() => {setMenuVisible(false); signOut();}}>
            <Text style={styles.deleteText}>Sign out</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={[styles.floatingMenuButton, darkMode && styles.darkFloatingMenuButton]} onPress={() => setMenuVisible(false)}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>}

      <Modal visible={manageFoldersVisible} transparent animationType="slide" onRequestClose={() => setManageFoldersVisible(false)}>
        <View style={styles.modalBackdrop}><View style={[styles.modalCard, darkMode && styles.darkSurface]}>
          <View style={styles.rowBetween}><Text style={[styles.modalTitle, darkMode && styles.darkText]}>Manage folders</Text><TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => {setManageFoldersVisible(false); setEditingFolderId(null); setFolderName('');}}><Text style={styles.linkButton}>Done</Text></TouchableOpacity></View>
          <TextInput placeholder="Folder name" placeholderTextColor={darkMode ? '#929b94' : '#9a9183'} value={folderName} onChangeText={setFolderName} style={[styles.input, darkMode && styles.darkInput]} />
          <TouchableOpacity style={styles.primaryButton} onPress={saveFolder}><Text style={styles.primaryButtonText}>{editingFolderId ? 'Save folder name' : 'Create folder'}</Text></TouchableOpacity>
          <ScrollView style={styles.modalList}>
            {folders.map(folder => (
              <View key={folder.id} style={styles.folderRow}>
                <Text style={[styles.folderName, darkMode && styles.darkText]}>{folder.name} ({folder.bookmarkCount})</Text>
                <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => {setEditingFolderId(folder.id); setFolderName(folder.name);}}><Text style={styles.linkButton}>Rename</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => deleteFolder(folder)}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View></View>
      </Modal>

      <Modal visible={!!folderBookmark} transparent animationType="slide" onRequestClose={() => setFolderBookmark(null)}>
        <View style={styles.modalBackdrop}><View style={[styles.modalCard, darkMode && styles.darkSurface]}>
          <View style={styles.rowBetween}><Text style={[styles.modalTitle, darkMode && styles.darkText]}>Choose folders</Text><TouchableOpacity accessibilityRole="button" style={styles.textAction} onPress={() => setFolderBookmark(null)}><Text style={styles.linkButton}>Cancel</Text></TouchableOpacity></View>
          <Text style={[styles.noticeText, darkMode && styles.darkMutedText]}>A bookmark can belong to more than one folder.</Text>
          <ScrollView style={styles.modalList}>
            {folders.map(folder => {
              const checked = membershipDraft.includes(folder.id);
              return <TouchableOpacity key={folder.id} style={styles.checkRow} onPress={() => setMembershipDraft(current => checked ? current.filter(id => id !== folder.id) : [...current, folder.id])}>
                <Text style={styles.checkMark}>{checked ? '☑' : '□'}</Text><Text style={[styles.folderName, darkMode && styles.darkText]}>{folder.name}</Text>
              </TouchableOpacity>;
            })}
            {folders.length === 0 && <Text style={styles.emptyBody}>Create a folder first using Manage.</Text>}
          </ScrollView>
          <TouchableOpacity style={styles.primaryButton} onPress={saveMembership}><Text style={styles.primaryButtonText}>Save folders</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#f7f8f6'},
  darkSafeArea: {backgroundColor: '#171b18'},
  container: {flex: 1, paddingHorizontal: 20, paddingTop: 0, paddingBottom: 14},
  darkContainer: {backgroundColor: '#171b18'},
  authScreen: {flexGrow: 1, justifyContent: 'center', padding: 22, gap: 14},
  darkAuthScreen: {backgroundColor: '#171b18'},
  accountSetupPage: {justifyContent: 'center', gap: 12},
  darkText: {color: '#eef2ed'},
  darkMutedText: {color: '#aab5ac'},
  darkSurface: {backgroundColor: '#222923', borderColor: '#39443b'},
  darkInput: {backgroundColor: '#1b211c', borderColor: '#465449', color: '#eef2ed'},
  darkNoticeCard: {backgroundColor: '#263229'},
  darkSharedText: {backgroundColor: '#1b211c', color: '#aab5ac'},
  darkSearchBox: {backgroundColor: '#222923', borderColor: '#465449'},
  darkSearchInput: {color: '#eef2ed'},
  darkSearchFilters: {backgroundColor: '#171b18', borderTopColor: '#39443b'},
  darkFolderTileSelected: {backgroundColor: '#263229', borderColor: '#78916d'},
  darkChip: {backgroundColor: '#2b332d'},
  darkChipText: {color: '#c2ccc3'},
  helperText: {fontSize: 12, color: '#68736c', lineHeight: 18},
  settingsPage: {flex: 1},
  settingsContent: {paddingBottom: 16, gap: 12},
  darkHeader: {borderBottomColor: '#39443b'},
  settingsHeader: {minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#e2e7e2', marginBottom: 2},
  settingsCard: {backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e7e2', borderRadius: 12, padding: 15, gap: 10},
  settingsTitle: {fontSize: 15, color: '#202622', fontWeight: '600'},
  settingRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  settingCopy: {flex: 1, gap: 4},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  authMasthead: {gap: 8, paddingBottom: 2},
  brandMark: {fontSize: 22, lineHeight: 28, color: '#355930', fontWeight: '700'},
  authPanel: {backgroundColor: '#ffffff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e7e2', gap: 10},
  header: {height: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e4e8e4'},
  menuButton: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center', gap: 4},
  menuLine: {width: 20, height: 2, borderRadius: 1, backgroundColor: '#34453c'},
  eyebrow: {fontSize: 11, color: '#68736c', fontWeight: '600'},
  title: {fontSize: 24, lineHeight: 30, color: '#202622', fontWeight: '600'},
  brandUni: {color: '#355930'},
  accountText: {color: '#68736c', fontSize: 12, marginTop: 3, maxWidth: 240},
  bodyText: {color: '#59645d', lineHeight: 21, fontSize: 14},
  noticeCard: {backgroundColor: '#edf1ee', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 10},
  noticeText: {fontSize: 12, lineHeight: 18, color: '#46534b'},
  incomingCard: {backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e7e2'},
  sourceText: {fontSize: 15, fontWeight: '600', color: '#202622', marginTop: 8},
  sharedText: {fontSize: 12, lineHeight: 18, color: '#59645d', backgroundColor: '#f7f8f6', borderRadius: 8, padding: 10, marginTop: 6},
  sectionLabel: {fontSize: 10, color: '#68736c', fontWeight: '600'},
  primaryButton: {minHeight: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#315d4e'},
  primaryButtonText: {fontSize: 14, color: '#ffffff', fontWeight: '600'},
  secondaryButton: {minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#edf1ee'},
  secondaryButtonText: {fontSize: 13, color: '#34453c', fontWeight: '600'},
  disabledButton: {backgroundColor: '#aab7b0'},
  linkButton: {color: '#315d4e', fontSize: 13, fontWeight: '600'},
  deleteText: {color: '#a13f3a', fontSize: 13, fontWeight: '600'},
  textAction: {minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center'},
  input: {minHeight: 48, borderWidth: 1, borderColor: '#d9e0da', borderRadius: 8, backgroundColor: '#ffffff', paddingHorizontal: 12, paddingVertical: 10, color: '#202622'},
  fieldLabel: {fontSize: 11, color: '#59645d', fontWeight: '600', marginTop: 2},
  errorText: {color: '#a13f3a', fontSize: 13},
  authTabs: {flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e7e2', marginBottom: 5},
  authTab: {flex: 1, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent'},
  authTabSelected: {borderBottomColor: '#315d4e'},
  authTabText: {fontSize: 13, color: '#59645d', fontWeight: '500'},
  authTabTextSelected: {color: '#315d4e', fontWeight: '600'},
  authDivider: {flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 2},
  authRule: {height: 1, flex: 1, backgroundColor: '#e2e7e2'},
  authDividerText: {fontSize: 11, color: '#68736c', fontWeight: '500'},
  googleButton: {alignSelf: 'center', width: '100%', height: 48},
  chip: {minHeight: 38, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#edf1ee'},
  selectedChip: {backgroundColor: '#315d4e'},
  chipText: {fontSize: 12, color: '#46534b', fontWeight: '500'},
  selectedChipText: {color: '#ffffff', fontWeight: '600'},
  folderHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2},
  folderScreen: {flex: 1, paddingTop: 2},
  folderScreenContent: {paddingBottom: 12},
  folderScreenHeader: {minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e2e7e2'},
  folderGrid: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12},
  folderTile: {width: '48%', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e7e2', backgroundColor: '#ffffff'},
  folderTileSelected: {borderColor: '#78916d', backgroundColor: '#fbfcfa'},
  folderIllustration: {height: 106, position: 'relative'},
  folderTab: {position: 'absolute', top: 0, left: 9, width: 54, height: 17, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: '#b9c99f'},
  folderShape: {position: 'absolute', top: 8, left: 0, right: 0, bottom: 0, borderRadius: 8, backgroundColor: '#dce5d0', overflow: 'hidden'},
  folderPreviewCollage: {position: 'absolute', top: 22, left: 8, right: 8, bottom: 8, flexDirection: 'row', gap: 4},
  folderThumbnail: {flex: 1, width: 0, height: '100%', borderWidth: 2, borderColor: '#ffffff', borderRadius: 5, backgroundColor: '#edf1e8'},
  folderThumbnailSolo: {width: '100%'},
  folderThumbnailLead: {flex: 1.35},
  folderThumbnailStack: {flex: 1, gap: 4},
  folderNoPreviews: {position: 'absolute', top: 28, left: 8, right: 8, bottom: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#e9eee3'},
  folderNoPreviewsText: {fontSize: 10, color: '#68736c'},
  folderTileInfo: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 9},
  folderTileText: {flex: 1, gap: 3},
  folderTileName: {fontSize: 13, fontWeight: '600', color: '#202622'},
  folderTileCount: {fontSize: 11, color: '#68736c'},
  folderTileChevron: {fontSize: 22, lineHeight: 24, color: '#68736c'},
  folderListRow: {minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#e2e7e2'},
  folderListRowSelected: {backgroundColor: '#edf1ee'},
  folderRowText: {flex: 1, gap: 3},
  folderListTitle: {fontSize: 15, color: '#202622', fontWeight: '600'},
  folderListCount: {fontSize: 12, color: '#68736c'},
  folderChevron: {fontSize: 25, color: '#68736c', paddingLeft: 12},
  folderEmptyState: {alignItems: 'flex-start', gap: 12, paddingVertical: 24},
  folderHeading: {fontSize: 16, color: '#202622', fontWeight: '600'},
  libraryHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8},
  folderLibraryHeading: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 8},
  folderBackButton: {minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 4},
  folderBackArrow: {fontSize: 27, lineHeight: 30, color: '#355930'},
  folderBackText: {fontSize: 13, fontWeight: '600', color: '#355930'},
  libraryTitle: {flex: 1, fontSize: 18, color: '#202622', fontWeight: '600'},
  searchBox: {minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d9e0da', borderRadius: 8, backgroundColor: '#ffffff', paddingLeft: 12, paddingRight: 8, marginBottom: 10},
  searchIcon: {width: 16, height: 16, borderWidth: 1.5, borderColor: '#68736c', borderRadius: 8, marginRight: 10},
  searchIconHandle: {position: 'absolute', width: 6, height: 1.5, right: -5, bottom: -2, backgroundColor: '#68736c', transform: [{rotate: '45deg'}]},
  searchPlaceholder: {flex: 1, color: '#858a9c', fontSize: 14},
  searchPage: {flex: 1},
  searchPageHeader: {minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8},
  searchPageTitle: {flex: 1, fontSize: 18, color: '#202622', fontWeight: '600', textAlign: 'center'},
  searchHeaderSpacer: {width: 52},
  searchPageInput: {marginBottom: 10},
  searchResultsList: {flex: 1},
  searchResultsContent: {gap: 8, paddingBottom: 10},
  searchResultCard: {minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 1, borderColor: '#e2e7e2', borderRadius: 10, backgroundColor: '#ffffff'},
  searchResultThumbnail: {width: 72, height: 68, borderRadius: 6, backgroundColor: '#edf1ee'},
  searchResultThumbnailFallback: {width: 72, height: 68, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 6, backgroundColor: '#edf1ee'},
  searchResultFallbackText: {fontSize: 10, fontWeight: '600', color: '#355930', textAlign: 'center'},
  searchResultInfo: {flex: 1, gap: 3},
  searchResultSource: {fontSize: 10, color: '#68736c', fontWeight: '600'},
  searchResultTitle: {fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#202622'},
  searchResultUrl: {fontSize: 10, color: '#68736c'},
  searchFilters: {paddingTop: 10, paddingBottom: 2, borderTopWidth: 1, borderTopColor: '#e2e7e2', backgroundColor: '#f7f8f6'},
  searchFilterLabel: {fontSize: 12, fontWeight: '600', color: '#46534b', marginBottom: 4},
  searchFilterScroll: {flexGrow: 0},
  searchFilterRow: {flexDirection: 'row', gap: 8, paddingRight: 10},
  searchInput: {flex: 1, minHeight: 46, paddingVertical: 8, color: '#202622', fontSize: 14},
  clearSearchButton: {minHeight: 40, justifyContent: 'center', paddingHorizontal: 8},
  clearSearchText: {color: '#315d4e', fontSize: 12, fontWeight: '600'},
  emptyClearButton: {paddingVertical: 12, paddingHorizontal: 16},
  listContent: {paddingBottom: 24, gap: 10},
  bookmarkCard: {backgroundColor: '#ffffff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e7e2', gap: 9, shadowColor: '#14251f', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: {width: 0, height: 2}, elevation: 1},
  bookmarkCardEmphasized: {shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: {width: 0, height: 4}, elevation: 3},
  previewImageFrame: {width: '100%', height: 184, overflow: 'hidden', borderRadius: 8, backgroundColor: '#edf1ee'},
  previewImage: {width: '100%', height: '100%'},
  previewDescription: {fontSize: 13, lineHeight: 18, color: '#59645d'},
  rowBetween: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  previewMetaLeft: {flexDirection: 'row', alignItems: 'center', gap: 8},
  sourcePill: {fontSize: 13, fontWeight: '600', color: '#ffffff', backgroundColor: '#355930', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6},
  durationText: {fontSize: 12, color: '#59645d', fontWeight: '600'},
  dateText: {fontSize: 11, color: '#778179'},
  clippingTitle: {fontSize: 15, lineHeight: 21, fontWeight: '600', color: '#202622'},
  urlText: {fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#202622'},
  originalUrlText: {fontSize: 11, color: '#68736c', marginTop: 4},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  bookmarkTitleButton: {flex: 1, justifyContent: 'center', minHeight: 40},
  editButton: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: '#d4ded9', backgroundColor: '#ffffff'},
  editFrame: {width: 25, height: 25, borderWidth: 1.5, borderColor: '#355930', borderRadius: 7, alignItems: 'center', justifyContent: 'center'},
  editPencil: {position: 'absolute', width: 4, height: 15, borderWidth: 1.3, borderColor: '#355930', borderRadius: 1, backgroundColor: '#ffffff', transform: [{rotate: '45deg'}]},
  editPencilTip: {position: 'absolute', width: 0, height: 0, borderLeftWidth: 2.5, borderRightWidth: 2.5, borderBottomWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#355930', transform: [{rotate: '45deg'}], top: 4, right: 4},
  titleInput: {flex: 1, minHeight: 44},
  cancelEditButton: {alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center', paddingHorizontal: 8},
  cancelEditText: {fontSize: 12, color: '#68736c'},
  compactAction: {minHeight: 30, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: '#edf1ee'},
  compactButtonText: {fontSize: 11, color: '#34453c', fontWeight: '600'},
  compactDeleteText: {fontSize: 11, color: '#a13f3a', fontWeight: '600'},
  bottomTabs: {flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 2},
  bottomTab: {flex: 1, minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 8, backgroundColor: '#d4ded9'},
  bottomTabSelected: {backgroundColor: '#355930'},
  bottomTabText: {fontSize: 13, color: '#34453c', fontWeight: '500'},
  bottomTabTextSelected: {color: '#ffffff', fontWeight: '600'},
  actions: {flexDirection: 'row', gap: 8, marginTop: 4},
  emptyState: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24},
  emptyTitle: {textAlign: 'center', color: '#202622', fontSize: 16, fontWeight: '600', marginBottom: 7},
  emptyBody: {textAlign: 'center', color: '#68736c', fontSize: 13, lineHeight: 19},
  smallButton: {minHeight: 44, paddingHorizontal: 12, paddingVertical: 9, justifyContent: 'center', borderRadius: 8, backgroundColor: '#edf1ee'},
  smallButtonText: {color: '#34453c', fontWeight: '600', fontSize: 12},
  legacyCard: {backgroundColor: '#f1f4ef', borderColor: '#dfe6df', borderWidth: 1, padding: 13, borderRadius: 10, marginBottom: 12},
  legacyTitle: {fontSize: 14, fontWeight: '600', color: '#34453c', marginBottom: 4},
  modalBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,30,24,0.42)'},
  menuBlur: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, elevation: 10},
  menuOverlay: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 11, elevation: 11},
  menuDismissArea: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  menuActions: {position: 'absolute', top: 48, right: 18, alignItems: 'flex-end', gap: 8},
  floatingMenuButton: {minHeight: 44, paddingHorizontal: 12, justifyContent: 'center'},
  darkFloatingMenuButton: {backgroundColor: '#222923', borderRadius: 8},
  modalCard: {maxHeight: '82%', backgroundColor: '#f7f8f6', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 12},
  modalTitle: {fontSize: 20, fontWeight: '600', color: '#202622'},
  modalList: {marginTop: 4},
  folderRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e7e2'},
  folderName: {flex: 1, fontSize: 14, color: '#344039', fontWeight: '500'},
  checkRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e7e2'},
  checkMark: {fontSize: 21, color: '#315d4e', width: 28},
  footer: {fontSize: 11, color: '#68736c', lineHeight: 17, marginTop: 2, textAlign: 'center'},
});
