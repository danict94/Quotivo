import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/components';
import { Icon } from '../ui/Icon';

export function isExpoGoRuntime(){ return Constants.executionEnvironment===ExecutionEnvironment.StoreClient; }
export function PdfPreview({uri,title,onClose}:{uri:string;title:string;onClose:()=>void}) {
  const insets=useSafeAreaInsets();
  useEffect(()=>{const listener=BackHandler.addEventListener('hardwareBackPress',()=>{onClose();return true;});return()=>listener.remove();},[onClose]);
  const header=<View style={styles.header}><Text numberOfLines={1} style={styles.headerTitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi anteprima" hitSlop={8} style={styles.closeAction} onPress={onClose}><Icon name="close" size={23} color="#26323A"/></Pressable></View>;
  if(isExpoGoRuntime()) return <View style={[styles.root,{paddingTop:insets.top}]}>{header}<View style={styles.notice}><Text style={styles.title}>Anteprima PDF non disponibile in Expo Go</Text><Text style={styles.body}>Il file PDF reale è stato generato. Per visualizzarlo qui con scorrimento e zoom serve la development build di Quotivo, che include il visualizzatore nativo.</Text><Button style={styles.button} onPress={onClose}>Chiudi anteprima</Button></View></View>;
  const Pdf=require('react-native-pdf').default as React.ComponentType<Record<string,unknown>>;
  return <View style={[styles.root,{paddingTop:insets.top}]}>{header}<Pdf source={{uri}} style={styles.pdf} trustAllCerts={false} enablePaging={false} horizontal={false} renderActivityIndicator={()=><ActivityIndicator/>}/></View>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#303438'},header:{height:58,paddingLeft:18,paddingRight:10,backgroundColor:'#fff',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},closeAction:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},headerTitle:{fontWeight:'800',color:'#26323A',flex:1},pdf:{flex:1,width:'100%'},notice:{flex:1,backgroundColor:'#F8F7F4',padding:28,justifyContent:'center'},title:{fontSize:22,fontWeight:'800',color:'#26323A'},body:{marginTop:12,fontSize:14,lineHeight:21,color:'#625E59'},button:{marginTop:22,backgroundColor:'#20384C',padding:15,borderRadius:12,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'800'}});
