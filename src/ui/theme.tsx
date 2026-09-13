import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, Theme, ThemeMode, ThemePreference } from './tokens';
const storageKey='quotivo.theme-preference.v1';
type ThemeContextValue={theme:Theme; preference:ThemePreference|null; ready:boolean; setPreference:(next:ThemePreference)=>Promise<void>};
const ThemeContext=createContext<ThemeContextValue|null>(null);
export function ThemeProvider({children}:{children:ReactNode}) { const system=useColorScheme(); const [preference,setStoredPreference]=useState<ThemePreference|null>(null); const [ready,setReady]=useState(false); useEffect(()=>{AsyncStorage.getItem(storageKey).then((value)=>setStoredPreference(value==='light'||value==='dark'||value==='system'?value:null)).catch(()=>setStoredPreference(null)).finally(()=>setReady(true));},[]); const mode:ThemeMode=preference==='system'?(system==='dark'?'dark':'light'):(preference??'light'); const value=useMemo<ThemeContextValue>(()=>({theme:mode==='dark'?darkTheme:lightTheme,preference,ready,setPreference:async(next)=>{await AsyncStorage.setItem(storageKey,next);setStoredPreference(next);}}),[mode,preference,ready]); return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>; }
export function useTheme(){const value=useContext(ThemeContext);if(!value)throw new Error('ThemeProvider mancante.');return value;}
