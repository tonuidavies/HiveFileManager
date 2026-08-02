import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Modal, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StorageAccessFramework, getFreeDiskStorageAsync, getTotalDiskCapacityAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import mobileAds, { BannerAd, BannerAdSize, InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const PURPLE = '#A435F0';
const ROOT_KEY = '@hive_root_final';
const PWD_KEY = '@hive_pwd_final';
const LOCK_KEY = '@hive_lock_final';

const BANNER_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-7561161015961675/1365959236';
const INTER_ID = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-7561161015961675/4109981571';
const interstitial = InterstitialAd.createForAdRequest(INTER_ID, { requestNonPersonalizedAdsOnly: true });

const decodeName = (uri) => { try { return decodeURIComponent(uri).split('/').pop().replace(/^primary:/,''); } catch { return uri; } };
const isDir = async (uri) => { try { await StorageAccessFramework.readDirectoryAsync(uri); return true; } catch { return false; } };

export default function App() {
  const [currentUri, setCurrentUri] = useState(null);
  const [rootUri, setRootUri] = useState(null);
  const [stack, setStack] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(true);
  const [agree, setAgree] = useState(false);
  const [fab, setFab] = useState(false);
  const [folderM, setFolderM] = useState(false);
  const [fileM, setFileM] = useState(false);
  const [newName, setNewName] = useState('');
  const [freePct, setFreePct] = useState(24);
  const [navCount, setNavCount] = useState(0);
  const [interLoaded, setInterLoaded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [pwdInput, setPwdInput] = useState('');
  const [storedPwd, setStoredPwd] = useState(null);
  const [settingPwd, setSettingPwd] = useState(false);

  useEffect(() => {
    mobileAds().initialize().then(()=> interstitial.load());
    const a = interstitial.addAdEventListener(AdEventType.LOADED, ()=> setInterLoaded(true));
    const b = interstitial.addAdEventListener(AdEventType.CLOSED, ()=> { setInterLoaded(false); interstitial.load(); });
    init();
    return ()=> { a(); b(); };
  }, []);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return true;
      if (menu) { setMenu(false); return true; }
      if (folderM||fileM) { setFolderM(false); setFileM(false); return true; }
      if (fab) { setFab(false); return true; }
      if (stack.length>0) { const p=stack[stack.length-1]; setStack(s=>s.slice(0,-1)); load(p.uri,false,false); return true; }
      return false;
    });
    return ()=> h.remove();
  }, [stack, fab, folderM, fileM, menu, locked]);

  const init = async () => {
    const uri = await AsyncStorage.getItem(ROOT_KEY);
    const pwd = await AsyncStorage.getItem(PWD_KEY);
    const lk = await AsyncStorage.getItem(LOCK_KEY);
    if (pwd) setStoredPwd(pwd);
    if (lk==='true' && pwd) { setLockOn(true); setLocked(true); }
    await checkPerm();
  };

  const checkPerm = async () => {
    const uri = await AsyncStorage.getItem(ROOT_KEY);
    if (!uri) {
      setShowPicker(true);
      return;
    }
    try {
      await StorageAccessFramework.readDirectoryAsync(uri);
      setRootUri(uri);
      const t = await getTotalDiskCapacityAsync();
      const f = await getFreeDiskStorageAsync();
      setFreePct(t ? Math.round(f / t * 100) : 24);
      await load(uri, false, false);
      setShowPicker(false);
    } catch {
      await AsyncStorage.removeItem(ROOT_KEY);
      setShowPicker(true);
    }
  };

  const requestPerm = async () => {
    try {
      const res = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (res.granted) {
        await AsyncStorage.setItem(ROOT_KEY, res.directoryUri);
        setRootUri(res.directoryUri);
        const t = await getTotalDiskCapacityAsync();
        const f = await getFreeDiskStorageAsync();
        setFreePct(t ? Math.round(f / t * 100) : 24);
        await load(res.directoryUri, false, false);
        setShowPicker(false);
      }
    } catch {}
  };

  const showInter = async () => { if (interLoaded) { try { await interstitial.show(); } catch {} } else { interstitial.load(); } };

  const load = async (uri, push=true, count=true) => {
    if (push && currentUri) setStack(s=>[...s, {uri: currentUri}]);
    setLoading(true);
    try {
      const children = await StorageAccessFramework.readDirectoryAsync(uri);
      const items = (await Promise.all(children.map(async u=>({uri:u, name:decodeName(u), isDirectory: await isDir(u)})))).sort((a,b)=> a.isDirectory===b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1);
      setCurrentUri(uri); setFiles(items);
      if (count) { const n=navCount+1; setNavCount(n); if (n%2===0) showInter(); }
    } catch {}
    setLoading(false);
  };

  const Banner = () => <View style={styles.banner}><BannerAd unitId={BANNER_ID} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{requestNonPersonalizedAdsOnly:true}} /></View>;

  const handlePwd = async (v) => {
    if (v==='del') { setPwdInput(p=>p.slice(0,-1)); return; }
    if (v==='cancel') { setPwdInput(''); setSettingPwd(false); if(!settingPwd) setLocked(false); return; }
    const next=(pwdInput+v).slice(0,4); setPwdInput(next);
    if (next.length===4) {
      if (settingPwd) { await AsyncStorage.setItem(PWD_KEY,next); await AsyncStorage.setItem(LOCK_KEY,'true'); setStoredPwd(next); setLockOn(true); setSettingPwd(false); setLocked(false); setPwdInput(''); Alert.alert('Lock enabled'); }
      else { if (next===storedPwd) { setLocked(false); setPwdInput(''); } else { setPwdInput(''); Alert.alert('Wrong password'); } }
    }
  };

  if (locked) {
    return <View style={styles.lockBg}><Text style={styles.lockTitle}>{settingPwd?'Set your password':'Please enter your password'}</Text><Text style={styles.lockDots}>{'� '.repeat(pwdInput.length)}</Text><View style={styles.lockLine}/><View style={styles.numPad}>{[1,2,3,4,5,6,7,8,9].map(n=><TouchableOpacity key={n} style={styles.numBtn} onPress={()=>handlePwd(String(n))}><Text style={styles.numTxt}>{n}</Text></TouchableOpacity>)}<TouchableOpacity style={styles.numBtn} onPress={()=>handlePwd('cancel')}><Text style={{color:'#fff'}}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.numBtn} onPress={()=>handlePwd('0')}><Text style={styles.numTxt}>0</Text></TouchableOpacity><TouchableOpacity style={styles.numBtn} onPress={()=>handlePwd('del')}><Ionicons name="backspace-outline" size={28} color="#fff"/></TouchableOpacity></View><View style={{position:'absolute', bottom:0, width:'100%'}}><Banner/></View></View>;
  }

  return (
    <SafeAreaView style={{flex:1, backgroundColor:'#fff'}}>
      <StatusBar backgroundColor={PURPLE} barStyle="light-content"/>
      <View style={styles.header}>
        {stack.length>0 ? <TouchableOpacity onPress={()=>{ const p=stack[stack.length-1]; setStack(s=>s.slice(0,-1)); load(p.uri,false,false); }} style={{padding:10}}><Ionicons name="arrow-back" size={24} color="#fff"/></TouchableOpacity> : <TouchableOpacity onPress={()=> setMenu(true)} style={{padding:10}}><Ionicons name="menu" size={26} color="#fff"/></TouchableOpacity>}
        <Text style={styles.headerTitle} numberOfLines={1}>{stack.length>0?decodeName(currentUri):'Internal Storage'}</Text>
        <View style={styles.freeBox}><Text style={styles.freePct}>{freePct}%</Text><Text style={styles.freeLabel}>STORAGE{'\n'}Free space</Text></View>
      </View>
      <View style={{flex:1}}>
        {showPicker ? <View style={{flex:1, justifyContent:'center', alignItems:'center', padding:24}}><Ionicons name="folder-open" size={70} color={PURPLE}/><Text style={{fontWeight:'700', marginTop:15}}>One-time permission</Text><TouchableOpacity onPress={()=> setAgree(!agree)} style={{flexDirection:'row', marginTop:20, alignItems:'center'}}><Ionicons name={agree?'checkbox':'square-outline'} size={22} color={PURPLE}/><Text style={{marginLeft:6}}>Allow file management</Text></TouchableOpacity><TouchableOpacity disabled={!agree} onPress={requestPerm} style={[styles.btn, {backgroundColor: agree?PURPLE:'#ccc'}]}><Text style={{color:'#fff', fontWeight:'700'}}>Select Root Folder</Text></TouchableOpacity></View> :
          <><Text style={styles.path}>/storage/emulated/0{stack.length?`/${decodeName(currentUri)}`:''}</Text>{loading ? <ActivityIndicator color={PURPLE} style={{marginTop:30}}/> : <FlatList data={files} keyExtractor={i=>i.uri} renderItem={({item})=><TouchableOpacity style={styles.row} onPress={()=>{ if(item.isDirectory) load(item.uri,true,true); else Alert.alert(item.name,'',[{text:'Delete', style:'destructive', onPress: async()=>{ await showInter(); try{ await StorageAccessFramework.deleteAsync(item.uri); load(currentUri,false,false);}catch{} }},{text:'Close'}]); }}><View style={styles.icon}><Ionicons name={item.isDirectory?'folder':'document-outline'} size={18} color="#fff"/></View><Text style={styles.name} numberOfLines={1}>{item.name}</Text></TouchableOpacity>} contentContainerStyle={{paddingBottom:90}}/>}{fab && <View style={styles.fabMenu}><View style={styles.fabItem}><Text style={styles.fabLabel}>New Folder</Text><TouchableOpacity style={styles.fabSmall} onPress={()=>{setFab(false); setFolderM(true);}}><Ionicons name="folder" size={18} color="#fff"/></TouchableOpacity></View><View style={styles.fabItem}><Text style={styles.fabLabel}>New File</Text><TouchableOpacity style={styles.fabSmall} onPress={()=>{setFab(false); setFileM(true);}}><Ionicons name="document" size={18} color="#fff"/></TouchableOpacity></View></View>}<TouchableOpacity style={styles.fab} onPress={()=> setFab(!fab)}><Ionicons name={fab?'close':'add'} size={28} color="#fff"/></TouchableOpacity></>}
      </View>
      <Banner/>
      <Modal visible={menu} transparent animationType="slide"><View style={{flex:1, flexDirection:'row'}}><View style={styles.drawer}><View style={styles.drawerHead}><Ionicons name="folder-open" size={40} color="#fff"/><Text style={{color:'#fff', fontWeight:'700', marginTop:10}}>Hive File Manager</Text><Text style={{color:'#fff', fontSize:11, opacity:0.8}}>{freePct}% Free</Text></View><TouchableOpacity style={styles.drawerItem} onPress={()=>{ setMenu(false); setStack([]); if(rootUri) load(rootUri,false,false); }}><Ionicons name="home" size={20} color={PURPLE}/><Text style={styles.drawerText}>Home / Main Menu</Text></TouchableOpacity><TouchableOpacity style={styles.drawerItem} onPress={()=>{ setMenu(false); setStack([]); if(rootUri) load(rootUri,false,false); }}><Ionicons name="phone-portrait" size={20} color={PURPLE}/><Text style={styles.drawerText}>Internal Storage</Text></TouchableOpacity><View style={{height:1, backgroundColor:'#eee', marginVertical:8}}/><TouchableOpacity style={styles.drawerItem} onPress={()=>{ setMenu(false); setSettingPwd(true); setLocked(true); }}><Ionicons name="lock-closed" size={20} color={PURPLE}/><Text style={styles.drawerText}>{lockOn?'Change Password':'Enable App Lock'}</Text></TouchableOpacity>{lockOn && <TouchableOpacity style={styles.drawerItem} onPress={async()=>{ await AsyncStorage.removeItem(PWD_KEY); await AsyncStorage.removeItem(LOCK_KEY); setStoredPwd(null); setLockOn(false); Alert.alert('Lock disabled'); }}><Ionicons name="lock-open" size={20} color="red"/><Text style={[styles.drawerText,{color:'red'}]}>Disable Lock</Text></TouchableOpacity>}<TouchableOpacity style={styles.drawerItem} onPress={()=>{ setMenu(false); Alert.alert('Reset Permission','',[{text:'Cancel'},{text:'Reset', onPress: async()=>{ await AsyncStorage.removeItem(ROOT_KEY); setShowPicker(true); setFiles([]); }}]) }}><Ionicons name="settings" size={20} color={PURPLE}/><Text style={styles.drawerText}>Reset Permission</Text></TouchableOpacity><View style={{flex:1}}/></View><TouchableOpacity style={{flex:1, backgroundColor:'rgba(0,0,0,0.4)'}} onPress={()=> setMenu(false)}/></View></Modal>
      <Modal visible={folderM||fileM} transparent animationType="fade"><View style={styles.modalOverlay}><View style={styles.modalBox}><TextInput value={newName} onChangeText={setNewName} placeholder={folderM?'Folder name':'file.txt'} style={styles.input} autoFocus/><View style={{flexDirection:'row', justifyContent:'flex-end', marginTop:12}}><TouchableOpacity onPress={()=>{setFolderM(false); setFileM(false);}} style={{padding:10}}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={async()=>{ try{ if(folderM) await StorageAccessFramework.makeDirectoryAsync(currentUri,newName.trim()); else await StorageAccessFramework.createFileAsync(currentUri,newName.trim(),'text/plain'); setFolderM(false); setFileM(false); setNewName(''); load(currentUri,false,false);}catch{Alert.alert('Failed');} }} style={{backgroundColor:PURPLE, paddingHorizontal:16, paddingVertical:8, borderRadius:16, marginLeft:8}}><Text style={{color:'#fff'}}>Create</Text></TouchableOpacity></View></View></View></Modal>
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
