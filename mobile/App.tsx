import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ShareMenu from 'react-native-share-menu';

type SharedItem = {
  mimeType: string;
  data: string;
  extraData?: unknown;
};

type Bookmark = {
  id: string;
  url: string;
  sharedText: string;
  source: string;
  savedAt: string;
};

const STORAGE_KEY = '@unimark/phase-2.1/bookmarks';

function findHttpUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"'`]+/i);
  return match?.[0]?.replace(/[),.;!?\]}]+$/, '') ?? null;
}

function sourceForUrl(value: string): string {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      return 'TikTok';
    }
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
      return 'Instagram';
    }
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
      return 'YouTube';
    }
    if (host === 'reddit.com' || host.endsWith('.reddit.com') || host === 'redd.it') {
      return 'Reddit';
    }
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
      return 'X';
    }
    return host;
  } catch {
    return 'Unknown source';
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function App() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [incoming, setIncoming] = useState<SharedItem | null>(null);
  const [notice, setNotice] = useState('Share a link from another app to see what UniMark receives.');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const incomingUrl = useMemo(
    () => (incoming ? findHttpUrl(incoming.data) : null),
    [incoming],
  );

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (active && value) {
          setBookmarks(JSON.parse(value) as Bookmark[]);
        }
      })
      .catch(() => {
        if (active) {
          setNotice('Could not read the local prototype library.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const receiveShare = useCallback((share: SharedItem | null) => {
    if (!share) {
      return;
    }
    setIncoming(share);
    setNotice(
      findHttpUrl(share.data)
        ? `Received ${share.mimeType} content. Review it below, then save the link.`
        : `Received ${share.mimeType} content, but no http/https URL was found.`,
    );
  }, []);

  useEffect(() => {
    ShareMenu.getInitialShare(receiveShare);
    const listener = ShareMenu.addNewShareListener(receiveShare);
    return () => listener.remove();
  }, [receiveShare]);

  const saveIncoming = useCallback(async () => {
    if (!incoming || !incomingUrl || saving) {
      return;
    }

    setSaving(true);
    const bookmark: Bookmark = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: incomingUrl,
      sharedText: incoming.data,
      source: sourceForUrl(incomingUrl),
      savedAt: new Date().toISOString(),
    };
    const updated = [bookmark, ...bookmarks];

    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setBookmarks(updated);
      setIncoming(null);
      setNotice('Saved on this device. This prototype does not sync to an account yet.');
    } catch {
      setNotice('The link reached UniMark, but could not be saved on this device.');
    } finally {
      setSaving(false);
    }
  }, [bookmarks, incoming, incomingUrl, saving]);

  const clearIncoming = useCallback(() => {
    setIncoming(null);
    setNotice('Share a link from another app to see what UniMark receives.');
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>PHASE 2.1 · SHARE PROTOTYPE</Text>
            <Text style={styles.title}>UniMark</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{bookmarks.length}</Text>
          </View>
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeLabel}>SHARE STATUS</Text>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>

        {incoming && (
          <View style={styles.incomingCard}>
            <View style={styles.cardTopline}>
              <Text style={styles.sectionLabel}>INCOMING CONTENT</Text>
              <Text style={styles.mimeBadge}>{incoming.mimeType || 'unknown type'}</Text>
            </View>
            <Text style={styles.sourceText}>
              {incomingUrl ? sourceForUrl(incomingUrl) : 'No supported link found'}
            </Text>
            <Text selectable style={styles.sharedText} numberOfLines={4}>
              {incoming.data}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={clearIncoming}
                style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={!incomingUrl || saving}
                onPress={saveIncoming}
                style={[styles.primaryButton, (!incomingUrl || saving) && styles.disabledButton]}>
                {saving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Save basic bookmark</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.libraryHeader}>
          <View>
            <Text style={styles.sectionLabel}>LOCAL LIBRARY</Text>
            <Text style={styles.libraryTitle}>Received links</Text>
          </View>
          <Text style={styles.localOnly}>DEVICE ONLY</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#4f46e5" />
          </View>
        ) : bookmarks.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>↗</Text>
            </View>
            <Text style={styles.emptyTitle}>Your first shared link goes here</Text>
            <Text style={styles.emptyBody}>
              Open TikTok, Instagram, YouTube, Reddit, or a website. Tap Share and choose UniMark.
            </Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={bookmarks}
            keyExtractor={item => item.id}
            renderItem={({item}) => (
              <View style={styles.bookmarkCard}>
                <View style={styles.bookmarkTopline}>
                  <Text style={styles.sourcePill}>{item.source}</Text>
                  <Text style={styles.dateText}>{formatDate(item.savedAt)}</Text>
                </View>
                <Text selectable style={styles.urlText} numberOfLines={2}>
                  {item.url}
                </Text>
                <Text selectable style={styles.originalShare} numberOfLines={2}>
                  Shared as: {item.sharedText}
                </Text>
              </View>
            )}
          />
        )}

        <Text style={styles.footer}>Prototype saves links locally. No sign-in, server, or metadata fetch.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#f7f8fc'},
  container: {flex: 1, paddingHorizontal: 22, paddingTop: 16},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22},
  eyebrow: {fontSize: 10, letterSpacing: 1.4, color: '#6b7280', fontWeight: '700'},
  title: {fontSize: 32, lineHeight: 39, color: '#171b36', fontWeight: '800', letterSpacing: -1.2},
  countBadge: {width: 42, height: 42, borderRadius: 21, backgroundColor: '#e8eaff', alignItems: 'center', justifyContent: 'center'},
  countText: {color: '#4f46e5', fontSize: 16, fontWeight: '800'},
  noticeCard: {backgroundColor: '#eef2ff', borderRadius: 16, padding: 15, marginBottom: 16, borderWidth: 1, borderColor: '#dfe4ff'},
  noticeLabel: {fontSize: 10, letterSpacing: 1.2, color: '#4f46e5', fontWeight: '800', marginBottom: 5},
  noticeText: {fontSize: 13, lineHeight: 19, color: '#343b63'},
  incomingCard: {backgroundColor: '#ffffff', borderRadius: 18, padding: 16, marginBottom: 22, borderWidth: 1, borderColor: '#e7e9f2', shadowColor: '#172554', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: {width: 0, height: 5}, elevation: 2},
  cardTopline: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  sectionLabel: {fontSize: 10, letterSpacing: 1.2, color: '#7b8196', fontWeight: '800'},
  mimeBadge: {fontSize: 10, color: '#555b73', backgroundColor: '#f0f1f6', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9},
  sourceText: {fontSize: 18, fontWeight: '700', color: '#171b36', marginBottom: 8},
  sharedText: {fontSize: 13, lineHeight: 19, color: '#5c6279', backgroundColor: '#f8f9fc', borderRadius: 10, padding: 11},
  actions: {flexDirection: 'row', gap: 9, marginTop: 14},
  secondaryButton: {paddingHorizontal: 14, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#f0f1f6'},
  secondaryButtonText: {fontSize: 13, color: '#454b64', fontWeight: '700'},
  primaryButton: {flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#5145e5'},
  primaryButtonText: {fontSize: 13, color: '#ffffff', fontWeight: '800'},
  disabledButton: {backgroundColor: '#aaaec4'},
  libraryHeader: {flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12},
  libraryTitle: {fontSize: 20, color: '#171b36', fontWeight: '700', marginTop: 4},
  localOnly: {fontSize: 9, color: '#8a8fa2', letterSpacing: 1, fontWeight: '800', marginBottom: 3},
  emptyState: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingBottom: 30},
  emptyIcon: {width: 56, height: 56, borderRadius: 18, backgroundColor: '#e8eaff', alignItems: 'center', justifyContent: 'center', marginBottom: 15},
  emptyIconText: {fontSize: 30, color: '#5145e5', fontWeight: '700'},
  emptyTitle: {textAlign: 'center', color: '#252a47', fontSize: 16, fontWeight: '700', marginBottom: 7},
  emptyBody: {textAlign: 'center', color: '#777d92', fontSize: 13, lineHeight: 19},
  listContent: {paddingBottom: 20, gap: 10},
  bookmarkCard: {backgroundColor: '#ffffff', borderRadius: 15, padding: 14, borderWidth: 1, borderColor: '#e8eaf1'},
  bookmarkTopline: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9},
  sourcePill: {fontSize: 11, fontWeight: '800', color: '#5145e5', backgroundColor: '#efefff', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9},
  dateText: {fontSize: 10, color: '#9599aa'},
  urlText: {fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#303550'},
  originalShare: {fontSize: 11, lineHeight: 16, color: '#858a9c', marginTop: 6},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center'},
  footer: {fontSize: 10, color: '#9297a8', textAlign: 'center', paddingTop: 10, paddingBottom: 12},
});
