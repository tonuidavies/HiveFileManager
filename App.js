import React, { useState, useEffect } from 'react';
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Modal,
	Platform,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
	StorageAccessFramework,
	getFreeDiskStorageAsync,
	getTotalDiskCapacityAsync,
} from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import mobileAds, {
	BannerAd,
	BannerAdSize,
	InterstitialAd,
	TestIds,
} from 'react-native-google-mobile-ads';

// -------------------- Ad Configuration --------------------
const BANNER_AD_UNIT_ID = __DEV__
	? TestIds.BANNER
	: 'ca-app-pub-7561161015961675/1365959236';
const INTERSTITIAL_AD_UNIT_ID = __DEV__
	? TestIds.INTERSTITIAL
	: 'ca-app-pub-7561161015961675/4109981571';

const interstitial = InterstitialAd.createForAdRequest(
	INTERSTITIAL_AD_UNIT_ID,
	{
		requestNonPersonalizedAdsOnly: true,
	},
);

// -------------------- Constants --------------------
const ROOT_URI_KEY = '@hive_explorer/root_uri';

// -------------------- Helpers --------------------
const formatBytes = (bytes) => {
	if (!bytes || bytes <= 0) return '0 B';
	const k = 1024;
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(k)),
	);
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
};

const getExt = (name) => {
	const i = name.lastIndexOf('.');
	return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
};

const decodeSafName = (uri) => {
	try {
		const decoded = decodeURIComponent(uri);
		const seg = decoded.split('/').pop() || decoded;
		return seg.replace(/^primary:/, '');
	} catch {
		return uri;
	}
};

const iconForFile = (name) => {
	const ext = getExt(name);
	if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext))
		return 'image-outline';
	if (['mp3', 'wav', 'aac', 'flac', 'ogg'].includes(ext))
		return 'musical-notes-outline';
	if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return 'videocam-outline';
	if (['pdf', 'doc', 'docx', 'txt'].includes(ext))
		return 'document-text-outline';
	if (['zip', 'rar', 'tar', 'gz'].includes(ext)) return 'archive-outline';
	return 'document-outline';
};

const isLikelyDirectory = async (uri) => {
	try {
		await StorageAccessFramework.readDirectoryAsync(uri);
		return true;
	} catch {
		return false;
	}
};

export default function App() {
	const [currentUri, setCurrentUri] = useState(null);
	const [currentName, setCurrentName] = useState('');
	const [navStack, setNavStack] = useState([]);
	const [files, setFiles] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [showPicker, setShowPicker] = useState(true);
	const [selection, setSelection] = useState(new Set());
	const [clipboard, setClipboard] = useState(null);
	const [folderModal, setFolderModal] = useState(false);
	const [newFolderName, setNewFolderName] = useState('');
	const [renameModal, setRenameModal] = useState(null);
	const [renameValue, setRenameValue] = useState('');
	const [storage, setStorage] = useState({ free: 0, total: 0, used: 0 });
	const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

	const inSelectMode = selection.size > 0;

	// Attempt to auto-load saved root folder on startup
	useEffect(() => {
		const initApp = async () => {
			const savedUri = await loadSavedRootUri();
			if (savedUri) {
				setIsLoading(true);
				try {
					// Verify we still have access to the folder
					await StorageAccessFramework.readDirectoryAsync(savedUri);
					await loadStorageInfo();
					await listDirectory(savedUri, 'Internal Storage');
					setShowPicker(false);
				} catch (e) {
					// Permission lost or folder deleted, clear it and show picker
					await clearSavedRootUri();
					setShowPicker(true);
				} finally {
					setIsLoading(false);
				}
			}
		};
		initApp();
	}, []);

	const loadStorageInfo = async () => {
		try {
			const total = await getTotalDiskCapacityAsync();
			const free = await getFreeDiskStorageAsync();
			const used = total > 0 ? ((total - free) / total) * 100 : 0;
			setStorage({ free, total, used });
		} catch (e) {}
	};

	const requestRootFolderAccess = async () => {
		setIsLoading(true);
		try {
			Alert.alert(
				'Select Root Folder',
				'Please select your main "Internal Storage" folder. This gives the app access to manage your files.',
				[
					{
						text: 'OK',
						onPress: async () => {
							const result =
								await StorageAccessFramework.requestDirectoryPermissionsAsync();
							if (result.granted) {
								const children =
									await StorageAccessFramework.readDirectoryAsync(
										result.directoryUri,
									);
								const hasRootIndicators = [
									'Android',
									'DCIM',
									'Download',
									'Music',
									'Pictures',
								].some((folder) =>
									children.some((c) => decodeSafName(c) === folder),
								);

								if (!hasRootIndicators) {
									Alert.alert(
										'Not the Root Folder',
										'You selected a subfolder. Please go back and select the main "Internal Storage" folder.',
									);
									setShowPicker(true);
									setIsLoading(false);
									return;
								}
								await saveRootUri(result.directoryUri);
								await loadStorageInfo();
								await listDirectory(result.directoryUri, 'Internal Storage');
								setShowPicker(false);
							} else {
								Alert.alert(
									'Access Denied',
									'Permission is required to use the file manager.',
								);
							}
						},
					},
				],
			);
		} catch (e) {
			Alert.alert('Error', 'Could not open folder picker');
		} finally {
			setIsLoading(false);
		}
	};

	const saveRootUri = async (uri) => {
		await AsyncStorage.setItem(ROOT_URI_KEY, uri);
	};
	const loadSavedRootUri = async () => {
		return await AsyncStorage.getItem(ROOT_URI_KEY);
	};
	const clearSavedRootUri = async () => {
		await AsyncStorage.removeItem(ROOT_URI_KEY);
	};

	const listDirectory = async (uri, name, pushToStack = false) => {
		setIsLoading(true);
		setSelection(new Set());
		try {
			const children = await StorageAccessFramework.readDirectoryAsync(uri);
			const items = await Promise.all(
				children.map(async (childUri) => {
					try {
						const directory = await isLikelyDirectory(childUri);
						return {
							uri: childUri,
							name: decodeSafName(childUri),
							isDirectory: directory,
						};
					} catch {
						return null;
					}
				}),
			);
			const filtered = items
				.filter((i) => i !== null)
				.sort((a, b) => {
					if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
					return a.name.localeCompare(b.name);
				});
			if (pushToStack && currentUri) {
				setNavStack((s) => [...s, { uri: currentUri, name: currentName }]);
			}
			setCurrentUri(uri);
			setCurrentName(name);
			setFiles(filtered);
		} catch (e) {
			Alert.alert('Error', 'Cannot read folder');
			goBackToPicker();
		} finally {
			setIsLoading(false);
		}
	};

	const goBackToPicker = () => {
		setCurrentUri(null);
		setFiles([]);
		setNavStack([]);
		setShowPicker(true);
	};

	const goBack = () => {
		if (inSelectMode) {
			setSelection(new Set());
			return;
		}
		if (navStack.length === 0) {
			goBackToPicker();
			return;
		}
		const prev = navStack[navStack.length - 1];
		setNavStack((s) => s.slice(0, -1));
		listDirectory(prev.uri, prev.name);
	};

	const toggleSelect = (uri) => {
		setSelection((prev) => {
			const next = new Set(prev);
			if (next.has(uri)) next.delete(uri);
			else next.add(uri);
			return next;
		});
	};
	const selectAll = () => setSelection(new Set(files.map((f) => f.uri)));
	const selectedItems = files.filter((f) => selection.has(f.uri));

	const onItemPress = (item) => {
		if (inSelectMode) {
			toggleSelect(item.uri);
			return;
		}
		if (item.isDirectory) {
			listDirectory(item.uri, item.name, true);
		} else {
			Alert.alert(item.name, `Action`, [
				{ text: 'Rename', onPress: () => openRename(item) },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: () => deleteItems([item]),
				},
				{ text: 'Close', style: 'cancel' },
			]);
		}
	};

	// Long press initiates selection mode
	const onItemLongPress = (item) => {
		if (!inSelectMode) toggleSelect(item.uri);
	};

	const deleteItems = (items) => {
		Alert.alert(
			'Delete',
			items.length === 1
				? `Delete "${items[0].name}"?`
				: `Delete ${items.length} items?`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						setIsLoading(true);
						for (const it of items) {
							try {
								await StorageAccessFramework.deleteAsync(it.uri);
							} catch (e) {}
						}
						setSelection(new Set());
						await listDirectory(currentUri, currentName);
						setIsLoading(false);
					},
				},
			],
		);
	};

	const openRename = (item) => {
		setRenameValue(item.name);
		setRenameModal({ item });
	};

	const copySingle = async (item, destDirUri, overrideName) => {
		const targetName = overrideName ?? item.name;
		if (!item.isDirectory) {
			const newUri = await StorageAccessFramework.createFileAsync(
				destDirUri,
				targetName,
				'application/octet-stream',
			);
			const data = await StorageAccessFramework.readAsStringAsync(item.uri, {
				encoding: 'base64',
			});
			await StorageAccessFramework.writeAsStringAsync(newUri, data, {
				encoding: 'base64',
			});
			return;
		}
		const newDirUri = await StorageAccessFramework.makeDirectoryAsync(
			destDirUri,
			targetName,
		);
		const children = await StorageAccessFramework.readDirectoryAsync(item.uri);
		for (const childUri of children) {
			const isDir = await isLikelyDirectory(childUri);
			await copySingle(
				{ uri: childUri, name: decodeSafName(childUri), isDirectory: isDir },
				newDirUri,
			);
		}
	};

	const performRename = async () => {
		const target = renameModal?.item;
		const newName = renameValue.trim();
		setRenameModal(null);
		if (!target || !newName || newName === target.name || !currentUri) return;
		setIsLoading(true);
		try {
			await copySingle(target, currentUri, newName);
			await StorageAccessFramework.deleteAsync(target.uri);
			await listDirectory(currentUri, currentName);
		} catch (e) {
			Alert.alert('Error', 'Rename failed');
		}
		setIsLoading(false);
	};

	const startCopy = () => {
		setClipboard({
			op: 'copy',
			items: selectedItems,
			sourceDirUri: currentUri,
		});
		setSelection(new Set());
	};

	const startMove = () => {
		setClipboard({
			op: 'move',
			items: selectedItems,
			sourceDirUri: currentUri,
		});
		setSelection(new Set());
	};

	const pasteHere = async () => {
		if (!clipboard || !currentUri) return;
		if (clipboard.sourceDirUri === currentUri && clipboard.op === 'move') {
			Alert.alert(
				'Same location',
				'Pick a different folder to move these items.',
			);
			return;
		}
		setIsLoading(true);
		for (const item of clipboard.items) {
			try {
				await copySingle(item, currentUri);
				if (clipboard.op === 'move') {
					await StorageAccessFramework.deleteAsync(item.uri);
				}
			} catch (e) {}
		}
		setClipboard(null);
		await listDirectory(currentUri, currentName);
		setIsLoading(false);
	};

	const createFolder = async () => {
		const name = newFolderName.trim();
		if (!name || !currentUri) return;
		setFolderModal(false);
		try {
			await StorageAccessFramework.makeDirectoryAsync(currentUri, name);
			setNewFolderName('');
			await listDirectory(currentUri, currentName);
		} catch {
			Alert.alert('Error', 'Could not create folder');
		}
	};

	const Banner = () => (
		<View style={styles.bannerContainer}>
			<BannerAd
				unitId={BANNER_AD_UNIT_ID}
				size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
				requestOptions={{ requestNonPersonalizedAdsOnly: true }}
				onAdFailedToLoad={(err) => console.warn(err)}
			/>
		</View>
	);

	const renderFileItem = ({ item }) => {
		const selected = selection.has(item.uri);
		return (
			<TouchableOpacity
				style={[styles.row, selected && styles.rowSelected]}
				onPress={() => onItemPress(item)}
				onLongPress={() => onItemLongPress(item)}
				delayLongPress={300}>
				<Ionicons
					name={item.isDirectory ? 'folder' : iconForFile(item.name)}
					size={32}
					color={item.isDirectory ? '#FFCA28' : '#78909C'}
					style={styles.rowIcon}
				/>
				<View style={styles.rowText}>
					<Text
						style={styles.rowTitle}
						numberOfLines={1}>
						{item.name}
					</Text>
					{!item.isDirectory && (
						<Text style={styles.rowSub}>{formatBytes(item.size || 0)}</Text>
					)}
				</View>
				{inSelectMode && (
					<Ionicons
						name={selected ? 'checkmark-circle' : 'ellipse-outline'}
						size={24}
						color={selected ? '#2196F3' : '#B0BEC5'}
					/>
				)}
			</TouchableOpacity>
		);
	};

	if (Platform.OS !== 'android') {
		return (
			<SafeAreaView style={styles.screen}>
				<Text style={{ textAlign: 'center', marginTop: 50 }}>Android only</Text>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.screen}>
			<StatusBar
				barStyle='dark-content'
				backgroundColor='#FFFFFF'
			/>

			{/* Main Content Area */}
			<View style={{ flex: 1 }}>
				{showPicker ? (
					<ScrollView contentContainerStyle={styles.pickerContainer}>
						<Ionicons
							name='folder-open-outline'
							size={80}
							color='#2196F3'
						/>
						<Text style={styles.pickerTitle}>Access Internal Storage</Text>
						<Text style={styles.pickerSubtitle}>
							To manage files, copy, move, and delete, please select your
							device's root internal storage directory.
						</Text>
						<View style={styles.disclaimerBox}>
							<TouchableOpacity
								style={styles.checkbox}
								onPress={() => setDisclaimerAccepted(!disclaimerAccepted)}>
								<Ionicons
									name={disclaimerAccepted ? 'checkbox' : 'square-outline'}
									size={24}
									color='#2196F3'
								/>
							</TouchableOpacity>
							<Text style={styles.disclaimerText}>
								I grant the app access to manage folders and files. I can revoke
								permission anytime in system settings.
							</Text>
						</View>
						<TouchableOpacity
							style={[
								styles.pickerButton,
								!disclaimerAccepted && styles.pickerButtonDisabled,
							]}
							onPress={disclaimerAccepted ? requestRootFolderAccess : null}
							disabled={!disclaimerAccepted}>
							<Text style={styles.pickerButtonText}>Select Root Folder</Text>
						</TouchableOpacity>
					</ScrollView>
				) : (
					<View style={{ flex: 1 }}>
						{/* Top Toolbar */}
						<View style={styles.topBar}>
							<View style={styles.topBarLeft}>
								{(navStack.length > 0 || inSelectMode) && (
									<TouchableOpacity
										onPress={goBack}
										style={styles.iconButton}>
										<Ionicons
											name={inSelectMode ? 'close' : 'arrow-back'}
											size={24}
											color='#000'
										/>
									</TouchableOpacity>
								)}
								<Text
									style={styles.title}
									numberOfLines={1}>
									{inSelectMode
										? `${selection.size} selected`
										: currentName || 'Internal Storage'}
								</Text>
							</View>

							{inSelectMode ? (
								<View style={styles.topBarRight}>
									<TouchableOpacity
										onPress={selectAll}
										style={styles.iconButton}>
										<Ionicons
											name='checkbox-outline'
											size={24}
											color='#000'
										/>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={startCopy}
										style={styles.iconButton}
										disabled={selection.size === 0}>
										<Ionicons
											name='copy-outline'
											size={24}
											color={selection.size === 0 ? '#CCC' : '#000'}
										/>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={startMove}
										style={styles.iconButton}
										disabled={selection.size === 0}>
										<Ionicons
											name='cut-outline'
											size={24}
											color={selection.size === 0 ? '#CCC' : '#000'}
										/>
									</TouchableOpacity>
									{selection.size === 1 && (
										<TouchableOpacity
											onPress={() => openRename(selectedItems[0])}
											style={styles.iconButton}>
											<Ionicons
												name='create-outline'
												size={24}
												color='#000'
											/>
										</TouchableOpacity>
									)}
									<TouchableOpacity
										onPress={() => deleteItems(selectedItems)}
										style={styles.iconButton}
										disabled={selection.size === 0}>
										<Ionicons
											name='trash-outline'
											size={24}
											color={selection.size === 0 ? '#CCC' : '#F44336'}
										/>
									</TouchableOpacity>
								</View>
							) : (
								<View style={styles.topBarRight}>
									<TouchableOpacity
										onPress={() => setFolderModal(true)}
										style={styles.iconButton}>
										<Ionicons
											name='add-circle-outline'
											size={26}
											color='#2196F3'
										/>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={() => {
											clearSavedRootUri();
											setShowPicker(true);
										}}
										style={styles.iconButton}>
										<Ionicons
											name='settings-outline'
											size={24}
											color='#000'
										/>
									</TouchableOpacity>
								</View>
							)}
						</View>

						{/* Clipboard Bar (Paste functionality) */}
						{clipboard && !inSelectMode && (
							<View style={styles.clipboardBar}>
								<Text style={styles.clipboardText}>
									{clipboard.items.length} item(s) to {clipboard.op}
								</Text>
								<View style={{ flexDirection: 'row' }}>
									<TouchableOpacity
										onPress={pasteHere}
										style={styles.clipboardButton}>
										<Text style={styles.clipboardButtonText}>Paste Here</Text>
									</TouchableOpacity>
									<TouchableOpacity
										onPress={() => setClipboard(null)}
										style={styles.clipboardCancel}>
										<Ionicons
											name='close-circle'
											size={24}
											color='#757575'
										/>
									</TouchableOpacity>
								</View>
							</View>
						)}

						{/* Loading Indicator or File List */}
						{isLoading ? (
							<View style={styles.loadingContainer}>
								<ActivityIndicator
									size='large'
									color='#2196F3'
								/>
								<Text style={{ marginTop: 10, color: '#666' }}>
									Processing...
								</Text>
							</View>
						) : (
							<FlatList
								data={files}
								keyExtractor={(i) => i.uri}
								renderItem={renderFileItem}
								ItemSeparatorComponent={() => <View style={styles.separator} />}
								ListEmptyComponent={
									<Text style={styles.emptyText}>This folder is empty</Text>
								}
								contentContainerStyle={{ paddingBottom: 20 }}
							/>
						)}
					</View>
				)}
			</View>

			{/* Permanently pinned Ad Banner at the bottom */}
			<Banner />

			{/* Modals */}
			<Modal
				visible={folderModal}
				transparent
				animationType='fade'>
				<TouchableOpacity
					style={styles.modalOverlay}
					activeOpacity={1}
					onPress={() => setFolderModal(false)}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>New folder</Text>
						<TextInput
							autoFocus
							value={newFolderName}
							onChangeText={setNewFolderName}
							placeholder='Folder Name'
							style={styles.input}
						/>
						<View style={styles.modalButtons}>
							<TouchableOpacity
								onPress={() => setFolderModal(false)}
								style={{ padding: 10 }}>
								<Text style={{ color: '#666' }}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={createFolder}
								style={styles.modalButtonPrimary}>
								<Text style={{ color: '#FFF', fontWeight: '600' }}>Create</Text>
							</TouchableOpacity>
						</View>
					</View>
				</TouchableOpacity>
			</Modal>

			<Modal
				visible={!!renameModal}
				transparent
				animationType='fade'>
				<TouchableOpacity
					style={styles.modalOverlay}
					activeOpacity={1}
					onPress={() => setRenameModal(null)}>
					<View style={styles.modalContent}>
						<Text style={styles.modalTitle}>Rename</Text>
						<TextInput
							autoFocus
							value={renameValue}
							onChangeText={setRenameValue}
							placeholder='New name'
							style={styles.input}
						/>
						<View style={styles.modalButtons}>
							<TouchableOpacity
								onPress={() => setRenameModal(null)}
								style={{ padding: 10 }}>
								<Text style={{ color: '#666' }}>Cancel</Text>
							</TouchableOpacity>
							<TouchableOpacity
								onPress={performRename}
								style={styles.modalButtonPrimary}>
								<Text style={{ color: '#FFF', fontWeight: '600' }}>Rename</Text>
							</TouchableOpacity>
						</View>
					</View>
				</TouchableOpacity>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: '#FFFFFF' },
	pickerContainer: {
		flexGrow: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	pickerTitle: {
		fontSize: 24,
		fontWeight: '700',
		marginTop: 20,
		color: '#333',
		textAlign: 'center',
	},
	pickerSubtitle: {
		fontSize: 15,
		color: '#666',
		textAlign: 'center',
		marginTop: 12,
		marginBottom: 30,
		lineHeight: 22,
	},
	disclaimerBox: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		backgroundColor: '#F0F4F8',
		padding: 16,
		borderRadius: 12,
		marginBottom: 24,
	},
	checkbox: { marginRight: 12 },
	disclaimerText: { flex: 1, fontSize: 14, color: '#444', lineHeight: 20 },
	pickerButton: {
		backgroundColor: '#2196F3',
		paddingHorizontal: 32,
		paddingVertical: 14,
		borderRadius: 30,
		elevation: 2,
	},
	pickerButtonDisabled: { backgroundColor: '#B0BEC5', elevation: 0 },
	pickerButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
	topBar: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 8,
		paddingVertical: 12,
		backgroundColor: '#FFF',
		elevation: 3,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		zIndex: 10,
	},
	topBarLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
	topBarRight: { flexDirection: 'row', alignItems: 'center' },
	title: {
		fontSize: 18,
		fontWeight: '600',
		marginLeft: 8,
		color: '#333',
		flexShrink: 1,
	},
	iconButton: { padding: 8, marginLeft: 2 },
	clipboardBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingVertical: 12,
		backgroundColor: '#E3F2FD',
		borderBottomWidth: 1,
		borderBottomColor: '#BBDEFB',
	},
	clipboardText: { fontSize: 14, fontWeight: '500', color: '#1565C0', flex: 1 },
	clipboardButton: {
		backgroundColor: '#2196F3',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
		marginRight: 10,
	},
	clipboardButtonText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
	clipboardCancel: { padding: 4 },
	loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	rowSelected: { backgroundColor: '#E1F5FE' },
	rowIcon: { marginRight: 16 },
	rowText: { flex: 1, justifyContent: 'center' },
	rowTitle: { fontSize: 16, color: '#212121', marginBottom: 4 },
	rowSub: { fontSize: 13, color: '#757575' },
	separator: { height: 1, backgroundColor: '#EEEEEE', marginLeft: 64 },
	emptyText: {
		textAlign: 'center',
		marginTop: 50,
		color: '#9E9E9E',
		fontSize: 16,
	},
	bannerContainer: {
		width: '100%',
		alignItems: 'center',
		backgroundColor: '#FFFFFF',
		borderTopWidth: 1,
		borderTopColor: '#EEEEEE',
		paddingTop: 4,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalContent: {
		width: '85%',
		backgroundColor: '#FFF',
		borderRadius: 12,
		padding: 24,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: '700',
		marginBottom: 16,
		color: '#333',
	},
	input: {
		borderWidth: 1,
		borderColor: '#E0E0E0',
		borderRadius: 8,
		padding: 12,
		marginBottom: 20,
		fontSize: 16,
		backgroundColor: '#FAFAFA',
	},
	modalButtons: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
		alignItems: 'center',
	},
	modalButtonPrimary: {
		backgroundColor: '#2196F3',
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 6,
		marginLeft: 16,
	},
});
