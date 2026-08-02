import React, { useState, useEffect } from 'react';
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	FlatList,
	Modal,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
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
	AdEventType,
	TestIds,
} from 'react-native-google-mobile-ads';

const PURPLE = '#A435F0';
const ROOT_URI_KEY = '@hive_root_v4';
const PWD_KEY = '@hive_pwd';
const LOCK_ENABLED_KEY = '@hive_lock_enabled';

const BANNER_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-7561161015961675/1365959236';
const INTERSTITIAL_ID = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-7561161015961675/4109981571';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
	requestNonPersonalizedAdsOnly: true,
});

const decodeName = (uri) => {
	try { return decodeURIComponent(uri).split('/').pop().replace(/^primary:/, ''); } catch { return uri; }
};
const isDir = async (uri) => {
	try { await StorageAccessFramework.readDirectoryAsync(uri); return true; } catch { return false; }
};

export default function App() {
	const [currentUri, setCurrentUri] = useState(null);
	const [rootUri, setRootUri] = useState(null);
	const [navStack, setNavStack] = useState([]);
	const [files, setFiles] = useState([]);
	const [isLoading, setIsLoading] = useState(false);
	const [showPicker, setShowPicker] = useState(true);
	const [disclaimer, setDisclaimer] = useState(false);
	const [fabOpen, setFabOpen] = useState(false);
	const [folderModal, setFolderModal] = useState(false);
	const [fileModal, setFileModal] = useState(false);
	const [newName, setNewName] = useState('');
	const [freePct, setFreePct] = useState(24);
	const [navCount, setNavCount] = useState(0);
	const [interLoaded, setInterLoaded] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	// LOCK
	const [isLocked, setIsLocked] = useState(false);
	const [lockEnabled, setLockEnabled] = useState(false);
	const [pwdInput, setPwdInput] = useState('');
	const [storedPwd, setStoredPwd] = useState(null);
	const [settingPwd, setSettingPwd] = useState(false);

	useEffect(() => {
		mobileAds().initialize().then(()=> interstitial.load());
		const l1 = interstitial.addAdEventListener(AdEventType.LOADED, ()=> setInterLoaded(true));
		const l2 = interstitial.addAdEventListener(AdEventType.CLOSED, ()=> { setInterLoaded(false); interstitial.load(); });
		const l3 = interstitial.addAdEventListener(AdEventType.ERROR, ()=> setTimeout(()=> interstitial.load(), 3000));
		init();
		return ()=> { l1(); l2(); l3(); };
	}, []);

	useEffect(() => {
		const h = BackHandler.addEventListener('hardwareBackPress', () => {
			if (isLocked) return true;
			if (menuOpen) { setMenuOpen(false); return true; }
			if (folderModal||fileModal) { setFolderModal(false); setFileModal(false); return true; }
			if (fabOpen) { setFabOpen(false); return true; }
			if (navStack.length>0) {
				const prev = navStack[navStack.length-1];
				setNavStack(s=>s.slice(0,-1));
				loadDir(prev.uri, false, false);
				return true;
			}
			return false;
		});
		return ()=> h.remove();
	}, [navStack, fabOpen, folderModal, fileModal, menuOpen, isLocked]);

	const init = async () => {
		const uri = await AsyncStorage.getItem(ROOT_URI_KEY);
		const pwd = await AsyncStorage.getItem(PWD_KEY);
		const lockOn = await AsyncStorage.getItem(LOCK_ENABLED_KEY);
		if (pwd) setStoredPwd(pwd);
		if (lockOn==='true' && pwd) { setLockEnabled(true); setIsLocked(true); }
		if (uri) {
			try {
				await StorageAccessFramework.readDirectoryAsync(uri);
				setRootUri(uri);
				await refreshStorage();
				await loadDir(uri, false, false);
				setShowPicker(false);
			} catch { await AsyncStorage.removeItem(ROOT_URI_KEY); }
		}
	};

	const refreshStorage = async () => {
		try {
			const total = await getTotalDiskCapacityAsync();
			const free = await getFreeDiskStorageAsync();
			setFreePct(total ? Math.round((free/total)*100) : 24);
		} catch {}
	};

	const showInter = async () => {
		if (interLoaded) { try { await interstitial.show(); } catch {} } else { interstitial.load(); }
	};

	const loadDir = async (uri, push=true, count=true) => {
		if (push && currentUri) setNavStack(s=>[...s, {uri: currentUri}]);
		setIsLoading(true);
		try {
			const children = await StorageAccessFramework.readDirectoryAsync(uri);
			const items = (await Promise.all(children.map(async u=>({uri:u, name:decodeName(u), isDirectory: await isDir(u)})))).sort((a,b)=> a.isDirectory===b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1);
			setCurrentUri(uri); setFiles(items);
			if (count) {
				const n = navCount+1;
				setNavCount(n);
				if (n % 2 === 0) showInter(); // Interstitial every 2 folder opens
			}
		} catch {}
		setIsLoading(false);
	};

	const goHome = () => {
		if (rootUri) { setNavStack([]); loadDir(rootUri, false, false); }
		setMenuOpen(false);
	};

	// PASSWORD HANDLER
	const onPwdPress = async (val) => {
		if (val==='del') { setPwdInput(p=>p.slice(0,-1)); return; }
		if (val==='cancel') { setPwdInput(''); if(!settingPwd) setIsLocked(false); else { setSettingPwd(false); setPwdInput(''); } return; }
		const next = (pwdInput + val).slice(0,4);
		setPwdInput(next);
		if (next.length===4) {
			if (settingPwd) {
				await AsyncStorage.setItem(PWD_KEY, next);
				await AsyncStorage.setItem(LOCK_ENABLED_KEY, 'true');
				setStoredPwd(next); setLockEnabled(true); setSettingPwd(false); setIsLocked(false); setPwdInput('');
				Alert.alert('Lock enabled');
			} else {
				if (next===storedPwd) { setIsLocked(false); setPwdInput(''); }
				else { Alert.alert('Wrong password'); setPwdInput(''); }
			}
		}
	};

	const Banner = () => (
		<View style={styles.banner}><BannerAd unitId={BANNER_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{requestNonPersonalizedAdsOnly:true}} /></View>
	);

	// LOCK SCREEN - Exactly like your screenshot
	if (isLocked) {
		return (
			<View style={styles.lockBg}>
				<StatusBar backgroundColor={PURPLE} barStyle="light-content" />
				<Text style={styles.lockTitle}>{settingPwd ? 'Set your password' : 'Please enter your password'}</Text>
				<Text style={styles.lockDots}>{'• '.repeat(pwdInput.length)}</Text>
				<View style={styles.lockLine} />
				<View style={styles.numPad}>
					{[1,2,3,4,5,6,7,8,9].map(n=>(
						<TouchableOpacity key={n} style={styles.numBtn} onPress={()=> onPwdPress(String(n))}><Text style={styles.numTxt}>{n}</Text></TouchableOpacity>
					))}
					<TouchableOpacity style={styles.numBtn} onPress={()=> onPwdPress('cancel')}><Text style={{color:'#fff', fontSize:16}}>Cancel</Text></TouchableOpacity>
					<TouchableOpacity style={styles.numBtn} onPress={()=> onPwdPress('0')}><Text style={styles.numTxt}>0</Text></TouchableOpacity>
					<TouchableOpacity style={styles.numBtn} onPress={()=> onPwdPress('del')}><Ionicons name="backspace-outline" size={28} color="#fff"/></TouchableOpacity>
				</View>
				<View style={{position:'absolute', bottom:0, width:'100%'}}><Banner /></View>
			</View>
		);
	}

	return (
		<SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
			<StatusBar backgroundColor={PURPLE} barStyle="light-content" />
			<View style={styles.header}>
				{navStack.length>0 ? (
					<TouchableOpacity onPress={()=> { const prev=navStack[navStack.length-1]; setNavStack(s=>s.slice(0,-1)); loadDir(prev.uri,false,false); }} style={{padding:10}}><Ionicons name="arrow-back" size={24} color="#fff"/></TouchableOpacity>
				) : (
					<TouchableOpacity onPress={()=> setMenuOpen(true)} style={{padding:10}}><Ionicons name="menu" size={26} color="#fff"/></TouchableOpacity>
				)}
				<Text style={styles.headerTitle} numberOfLines={1}>{navStack.length>0 ? decodeName(currentUri) : 'Internal Storage'}</Text>
				<View style={styles.freeBox}><Text style={styles.freePct}>{freePct}%</Text><Text style={styles.freeLabel}>STORAGE{'\n'}Free space</Text></View>
			</View>

			<View style={{flex:1}}>
				{showPicker ? (
					<View style={{flex:1, justifyContent:'center', alignItems:'center', padding:24}}>
						<Ionicons name="folder-open" size={70} color={PURPLE}/>
						<Text style={{fontWeight:'700', marginTop:15}}>One-time permission</Text>
						<TouchableOpacity onPress={()=> setDisclaimer(!disclaimer)} style={{flexDirection:'row', marginTop:20, alignItems:'center'}}><Ionicons name={disclaimer?'checkbox':'square-outline'} size={22} color={PURPLE}/><Text style={{marginLeft:6}}>Allow file management</Text></TouchableOpacity>
						<TouchableOpacity disabled={!disclaimer} onPress={async()=>{ const r=await StorageAccessFramework.requestDirectoryPermissionsAsync(); if(r.granted){ await AsyncStorage.setItem(ROOT_URI_KEY, r.directoryUri); setRootUri(r.directoryUri); await refreshStorage(); await loadDir(r.directoryUri,false,false); setShowPicker(false);} }} style={[styles.btn, {backgroundColor: disclaimer?PURPLE:'#ccc'}]}><Text style={{color:'#fff', fontWeight:'700'}}>Select Root Folder</Text></TouchableOpacity>
					</View>
				) : (
					<>
						<Text style={styles.path}>/storage/emulated/0{navStack.length?`/${decodeName(currentUri)}`:''}</Text>
						{isLoading ? <ActivityIndicator color={PURPLE} style={{marginTop:30}}/> :
						<FlatList data={files} keyExtractor={i=>i.uri} renderItem={({item})=>(
							<TouchableOpacity style={styles.row} onPress={()=>{
								if(item.isDirectory) loadDir(item.uri, true, true);
								else Alert.alert(item.name,'',[{text:'Delete', style:'destructive', onPress: async()=>{ await showInter(); try{ await StorageAccessFramework.deleteAsync(item.uri); loadDir(currentUri,false,false);}catch{} }},{text:'Close'}]);
							}}>
								<View style={styles.icon}><Ionicons name={item.isDirectory?'folder':'document-outline'} size={18} color="#fff"/></View>
								<Text style={styles.name} numberOfLines={1}>{item.name}</Text>
							</TouchableOpacity>
						)} contentContainerStyle={{paddingBottom:90}}/>}
						{fabOpen && <View style={styles.fabMenu}>
							<View style={styles.fabItem}><Text style={styles.fabLabel}>New Folder</Text><TouchableOpacity style={styles.fabSmall} onPress={()=>{setFabOpen(false); setFolderModal(true);}}><Ionicons name="folder" size={18} color="#fff"/></TouchableOpacity></View>
							<View style={styles.fabItem}><Text style={styles.fabLabel}>New File</Text><TouchableOpacity style={styles.fabSmall} onPress={()=>{setFabOpen(false); setFileModal(true);}}><Ionicons name="document" size={18} color="#fff"/></TouchableOpacity></View>
						</View>}
						<TouchableOpacity style={styles.fab} onPress={()=> setFabOpen(!fabOpen)}><Ionicons name={fabOpen?'close':'add'} size={28} color="#fff"/></TouchableOpacity>
					</>
				)}
			</View>

			<Banner />

			{/* SIDE MENU WITH HOME */}
			<Modal visible={menuOpen} transparent animationType="slide">
				<View style={{flex:1, flexDirection:'row'}}>
					<View style={styles.drawer}>
						<View style={styles.drawerHead}><Ionicons name="folder-open" size={40} color="#fff"/><Text style={{color:'#fff', fontWeight:'700', marginTop:10}}>Hive File Manager</Text><Text style={{color:'#fff', fontSize:11, opacity:0.8}}>{freePct}% Free</Text></View>
						
						<TouchableOpacity style={styles.drawerItem} onPress={goHome}><Ionicons name="home" size={20} color={PURPLE}/><Text style={styles.drawerText}>Home / Main Menu</Text></TouchableOpacity>
						<TouchableOpacity style={styles.drawerItem} onPress={()=>{ goHome(); }}><Ionicons name="phone-portrait" size={20} color={PURPLE}/><Text style={styles.drawerText}>Internal Storage</Text></TouchableOpacity>
						
						<View style={{height:1, backgroundColor:'#eee', marginVertical:8}}/>

						<TouchableOpacity style={styles.drawerItem} onPress={()=>{ setMenuOpen(false); if(!storedPwd){ setSettingPwd(true); setIsLocked(true);} else { setSettingPwd(true); setIsLocked(true);} }}><Ionicons name="lock-closed" size={20} color={PURPLE}/><Text style={styles.drawerText}>{lockEnabled ? 'Change Password' : 'Enable App Lock'}</Text></TouchableOpacity>
						
						{lockEnabled && <TouchableOpacity style={styles.drawerItem} onPress={async()=>{ await AsyncStorage.removeItem(PWD_KEY); await AsyncStorage.removeItem(LOCK_ENABLED_KEY); setStoredPwd(null); setLockEnabled(false); Alert.alert('Lock disabled'); }}><Ionicons name="lock-open" size={20} color="red"/><Text style={[styles.drawerText,{color:'red'}]}>Disable Lock</Text></TouchableOpacity>}

						<TouchableOpacity style={styles.drawerItem} onPress={()=>{ setMenuOpen(false); Alert.alert('Reset Permission','',[{text:'Cancel'},{text:'Reset', onPress: async()=>{ await AsyncStorage.removeItem(ROOT_URI_KEY); setShowPicker(true); setFiles([]); }}]) }}><Ionicons name="settings" size={20} color={PURPLE}/><Text style={styles.drawerText}>Reset Permission</Text></TouchableOpacity>

						<View style={{flex:1}}/>
					</View>
					<TouchableOpacity style={{flex:1, backgroundColor:'rgba(0,0,0,0.4)'}} onPress={()=> setMenuOpen(false)} />
				</View>
			</Modal>

			<Modal visible={folderModal||fileModal} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalBox}>
				<TextInput value={newName} onChangeText={setNewName} placeholder={folderModal?'Folder name':'file.txt'} style={styles.input} autoFocus/>
				<View style={{flexDirection:'row', justifyContent:'flex-end', marginTop:12}}>
					<TouchableOpacity onPress={()=>{setFolderModal(false); setFileModal(false);}} style={{padding:10}}><Text>Cancel</Text></TouchableOpacity>
					<TouchableOpacity onPress={async()=>{ try{ if(folderModal) await StorageAccessFramework.makeDirectoryAsync(currentUri, newName.trim()); else await StorageAccessFramework.createFileAsync(currentUri, newName.trim(), 'text/plain'); setFolderModal(false); setFileModal(false); setNewName(''); loadDir(currentUri,false,false);}catch{Alert.alert('Failed');} }} style={{backgroundColor:PURPLE, paddingHorizontal:16, paddingVertical:8, borderRadius:16, marginLeft:8}}><Text style={{color:'#fff'}}>Create</Text></TouchableOpacity>
				</View>
			</View></View></Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	header:{backgroundColor:PURPLE, flexDirection:'row', alignItems:'center', paddingBottom:12},
	headerTitle:{color:'#fff', fontSize:18, flex:1, marginLeft:4},
	freeBox:{alignItems:'center', marginRight:14}, freePct:{color:'#fff', fontSize:32}, freeLabel:{color:'#fff', fontSize:8, textAlign:'center', lineHeight:10},
	path:{color:'#888', fontSize:12, padding:10},
	row:{flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:0.5, borderColor:'#eee'},
	icon:{width:34, height:34, borderRadius:8, backgroundColor:PURPLE, justifyContent:'center', alignItems:'center', marginRight:10},
	name:{fontSize:14, flex:1},
	fab:{position:'absolute', right:16, bottom:16, width:54, height:54, borderRadius:27, backgroundColor:PURPLE, justifyContent:'center', alignItems:'center', elevation:5},
	fabMenu:{position:'absolute', right:16, bottom:80, alignItems:'flex-end'},
	fabItem:{flexDirection:'row', alignItems:'center', marginBottom:10},
	fabLabel:{backgroundColor:'#222', color:'#fff', paddingHorizontal:8, paddingVertical:4, borderRadius:4, marginRight:8, fontSize:12},
	fabSmall:{width:40, height:40, borderRadius:20, backgroundColor:PURPLE, justifyContent:'center', alignItems:'center'},
	banner:{width:'100%', alignItems:'center', backgroundColor:'#fff', borderTopWidth:1, borderColor:'#eee', height:52, justifyContent:'center'},
	modalOverlay:{flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center'},
	modalBox:{width:'80%', backgroundColor:'#fff', borderRadius:10, padding:16},
	input:{borderBottomWidth:1, borderColor:PURPLE, padding:8, marginTop:8},
	btn:{paddingHorizontal:26, paddingVertical:12, borderRadius:22, marginTop:20},
	drawer:{width:270, backgroundColor:'#fff', flex:1},
	drawerHead:{backgroundColor:PURPLE, padding:20, paddingTop:50},
	drawerItem:{flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:0.5, borderColor:'#f0f0f0'},
	drawerText:{marginLeft:12, color:'#333'},
	lockBg:{flex:1, backgroundColor:PURPLE, alignItems:'center', paddingTop:100},
	lockTitle:{color:'#fff', fontSize:18, textAlign:'center'},
	lockDots:{color:'#fff', fontSize:22, marginTop:30, letterSpacing:6},
	lockLine:{width:'70%', height:1, backgroundColor:'#fff', marginTop:15},
	numPad:{width:'80%', flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', marginTop:40},
	numBtn:{width:'30%', aspectRatio:1, justifyContent:'center', alignItems:'center'},
	numTxt:{color:'#fff', fontSize:28}
});